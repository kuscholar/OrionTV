#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${ORIONTV_STATE_DIR:-${HOME}/Library/Application Support/OrionTV/daily-build}"
DERIVED_DATA="${STATE_DIR}/derived-data"
LOG_DIR="${STATE_DIR}/logs"
LOG_FILE="${LOG_DIR}/refresh-orion-tv.log"
BUILD_LOG="${LOG_DIR}/last-build.log"
STATUS_FILE="${LOG_DIR}/last-run.plist"
LAST_SUCCESS_STATUS_FILE="${LOG_DIR}/last-success.plist"
LOCK_DIR="${STATE_DIR}/refresh.lock"
LAST_SUCCESS_FILE="${STATE_DIR}/last-success-date"
PROFILE_BACKUP_ROOT="${STATE_DIR}/profile-backups"
ACTIVE_SIGNING_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
SIGNING_IDENTITY="3535FA41A3F2179EDE09AB88C5F504FABCC199E0"

SCHEME="OrionTV"
CONFIGURATION="Release"
SIGNING_TEAM="D7KZKWD692"
BUNDLE_ID="com.kuschtv.OrionTV"
XCODE_DEVICE_ID="1a4784e2bf7f81760843a5f7a61b666ab21718f4"
COREDEVICE_ID="4694C2CD-21D4-5005-9DCA-D93D4BE3793F"
APP_PATH="${DERIVED_DATA}/Build/Products/Release-appletvos/OrionTV.app"
MIN_PROFILE_VALIDITY_SECONDS=$((6 * 24 * 60 * 60))
BUILD_TIMEOUT_SECONDS=$((20 * 60))
profiles_dir="/Users/kuschqin/Library/Developer/Xcode/UserData/Provisioning Profiles"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
export GIT_TERMINAL_PROMPT=0

mkdir -p "$LOG_DIR" "$(dirname "$DERIVED_DATA")"
exec >> "$LOG_FILE" 2>&1

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

echo "[$(timestamp)] Starting OrionTV refresh"

scheduled_refresh_succeeded_today() {
  [[ "${ORIONTV_SCHEDULED:-0}" == "1" && -r "$LAST_SUCCESS_FILE" ]] || return 1
  [[ "$(<"$LAST_SUCCESS_FILE")" == "$(date '+%Y-%m-%d')" ]]
}

# Force controls profile renewal, not whether a completed daily run is repeated.
if scheduled_refresh_succeeded_today; then
  echo "[$(timestamp)] Today's scheduled refresh already succeeded; exiting"
  exit 0
fi

if [[ "${ORIONTV_SCHEDULED:-0}" == "1" ]] && (( $(date "+%H%M") < 1030 )); then
  echo "[$(timestamp)] Waiting for the daily 10:30 refresh window"
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  existing_pid=""
  if [[ -f "${LOCK_DIR}/pid" ]]; then
    existing_pid="$(cat "${LOCK_DIR}/pid" 2>/dev/null || true)"
  fi

  if [[ -n "$existing_pid" && "$existing_pid" == <-> ]] && ! kill -0 "$existing_pid" 2>/dev/null; then
    echo "[$(timestamp)] Removing stale refresh lock"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    echo "[$(timestamp)] Refresh lock is held (PID ${existing_pid:-not yet recorded}); exiting"
    exit 0
  fi
fi
echo "$$" > "${LOCK_DIR}/pid"

profile_refresh_pending=0
build_succeeded=0
build_pid=""
watchdog_pid=""
phase="preflight"
failure_reason=""
profile_expiration=""
profile_creation=""
source_revision=""
profile_backup_dir="${PROFILE_BACKUP_ROOT}/$(date "+%Y%m%d-%H%M%S")-$$"

write_status() {
  local outcome="$1" run_exit_code="$2"
  local temporary_status="${STATUS_FILE}.$$"
  plutil -create xml1 "$temporary_status"
  plutil -insert result -string "$outcome" "$temporary_status"
  plutil -insert timestamp -string "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$temporary_status"
  plutil -insert phase -string "$phase" "$temporary_status"
  plutil -insert exitCode -integer "$run_exit_code" "$temporary_status"
  plutil -insert reason -string "$failure_reason" "$temporary_status"
  plutil -insert profileExpiresAt -string "$profile_expiration" "$temporary_status"
  plutil -insert profileCreatedAt -string "${profile_creation:-}" "$temporary_status"
  plutil -insert signingKeychain -string "${ACTIVE_SIGNING_KEYCHAIN:-}" "$temporary_status"
  plutil -insert forceProfileRefresh -integer "${ORIONTV_FORCE_PROFILE_REFRESH:-0}" "$temporary_status"
  plutil -insert sourceRevision -string "$source_revision" "$temporary_status"
  mv "$temporary_status" "$STATUS_FILE"
}

cleanup() {
  local run_exit_code=$?
  trap - EXIT
  set +e
  if [[ -n "$watchdog_pid" ]]; then
    kill "$watchdog_pid" 2>/dev/null
    wait "$watchdog_pid" 2>/dev/null
  fi
  if [[ -n "$build_pid" ]]; then
    kill -TERM "$build_pid" 2>/dev/null
    wait "$build_pid" 2>/dev/null
  fi
  if (( profile_refresh_pending == 1 && build_succeeded == 0 )) && [[ -d "$profile_backup_dir" ]]; then
    echo "[$(timestamp)] Restoring provisioning profiles after failed refresh"
    mkdir -p "$profiles_dir"
    find "$profile_backup_dir" -maxdepth 1 -type f -name "*.mobileprovision" | while IFS= read -r profile; do
      destination="${profiles_dir}/$(basename "$profile")"
      if [[ ! -e "$destination" ]]; then
        mv "$profile" "$destination" || echo "[$(timestamp)] Could not restore profile; backup retained at ${profile}"
      fi
    done
  fi
  rmdir "$profile_backup_dir" 2>/dev/null || true
  if (( run_exit_code != 0 )); then
    failure_reason="${failure_reason:-Failed during ${phase}; see ${LOG_FILE}}"
    echo "[$(timestamp)] Refresh failed: ${failure_reason}"
    write_status failed "$run_exit_code"
  fi
  rm -rf "$LOCK_DIR" 2>/dev/null || true
  exit "$run_exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! xcodebuild -checkFirstLaunchStatus; then
  failure_reason="Xcode requires first-launch components. Open Xcode and complete installation."
  exit 1
fi

phase="signing-keychain"
# Test the private key, not just the presence of its certificate. Never change
# keychain passwords, certificates, access controls or the user's search list.
cp /usr/bin/true "${LOCK_DIR}/signing-probe"
if ! codesign --dryrun --force --sign "$SIGNING_IDENTITY" \
  --keychain "$ACTIVE_SIGNING_KEYCHAIN" --timestamp=none "${LOCK_DIR}/signing-probe"; then
  failure_reason="The existing Apple Development private key is unavailable in the login keychain. Unlock the Mac and check Xcode signing; no credentials or certificates were changed."
  exit 1
fi

profile_is_fresh() {
  local expires_epoch="$1" created_epoch="$2" now_epoch="$3"
  (( expires_epoch - now_epoch >= MIN_PROFILE_VALIDITY_SECONDS )) || return 1
  [[ "$(date -r "$created_epoch" '+%Y-%m-%d')" == "$(date -r "$now_epoch" '+%Y-%m-%d')" ]]
}

fresh_profile_available() {
  local profile decoded identifier expires created expires_epoch created_epoch
  local now_epoch="$(date -u '+%s')"
  for profile in "$profiles_dir"/*.mobileprovision(N); do
    decoded="$(security cms -D -i "$profile" 2>/dev/null)" || continue
    identifier="$(printf '%s' "$decoded" | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null)" || continue
    [[ "$identifier" == "${SIGNING_TEAM}.${BUNDLE_ID}" ]] || continue
    expires="$(printf '%s' "$decoded" | plutil -extract ExpirationDate raw -o - -)" || continue
    created="$(printf '%s' "$decoded" | plutil -extract CreationDate raw -o - -)" || continue
    expires_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$expires" '+%s' 2>/dev/null)" || continue
    created_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$created" '+%s' 2>/dev/null)" || continue
    if profile_is_fresh "$expires_epoch" "$created_epoch" "$now_epoch"; then
      return 0
    fi
  done
  return 1
}

cd "$PROJECT_DIR"

phase="update-source"
if [[ "$(git branch --show-current)" != "master" || "$(git remote get-url origin)" != "https://github.com/kuscholar/OrionTV.git" ]]; then
  failure_reason="Expected the OrionTV fork on master; refusing to build a different checkout."
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  failure_reason="Tracked files have local edits; preserve them and retry after they are committed."
  exit 1
fi
echo "[$(timestamp)] Pulling latest fork master"
git pull --ff-only origin master
source_revision="$(git rev-parse HEAD)"
echo "[$(timestamp)] Source revision: ${source_revision}"

phase="dependencies"
# Refresh generated native code when the Expo configuration, plugins or locked
# dependencies change. Keep .env.local and the existing backend configuration.
input_digest="$( { shasum -a 256 package.json yarn.lock app.json; find plugins -type f -print0 | sort -z | xargs -0 shasum -a 256; } | shasum -a 256 | awk '{print $1}')"
previous_digest="$(cat "${STATE_DIR}/native-input-digest" 2>/dev/null || true)"
if [[ "$input_digest" != "$previous_digest" || ! -d node_modules || ! -d ios/OrionTV.xcworkspace ]]; then
  yarn install --frozen-lockfile --non-interactive
  CI=1 EXPO_TV=1 yarn expo prebuild --platform ios --no-install
  pod install --project-directory=ios
  printf '%s\n' "$input_digest" > "${STATE_DIR}/native-input-digest"
fi

echo "[$(timestamp)] Checking OrionTV provisioning profiles"
phase="provisioning"
# Recover profiles left outside Xcode's directory if a previous run was interrupted.
mkdir -p "$profiles_dir"
if [[ -d "$PROFILE_BACKUP_ROOT" ]]; then
  while IFS= read -r -d '' profile; do
    destination="${profiles_dir}/$(basename "$profile")"
    if [[ ! -e "$destination" ]]; then
      mv "$profile" "$destination"
      echo "[$(timestamp)] Recovered provisioning profile from interrupted refresh"
    fi
  done < <(find "$PROFILE_BACKUP_ROOT" -mindepth 2 -type f -name '*.mobileprovision' -print0)
fi
matching_profile_found=0
if [[ -d "$profiles_dir" ]]; then
  now_epoch="$(date -u "+%s")"
  find "$profiles_dir" -maxdepth 1 -type f -name "*.mobileprovision" | while IFS= read -r profile; do
    profile_text="$(security cms -D -i "$profile" 2>/dev/null || true)"
    if [[ -z "$profile_text" ]]; then
      profile_text="$(strings "$profile" || true)"
    fi

    application_identifier="$(printf "%s" "$profile_text" | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || true)"
    if [[ -z "$application_identifier" ]]; then
      application_identifier="$(printf "%s\n" "$profile_text" | awk 'index($0, "<key>application-identifier</key>") { getline; gsub("^[ \t]*<string>", ""); gsub("</string>[ \t]*$", ""); print; exit }')"
    fi
    if [[ "$application_identifier" != "${SIGNING_TEAM}.${BUNDLE_ID}" ]]; then
      continue
    fi
    matching_profile_found=1

    profile_name="$(printf "%s" "$profile_text" | plutil -extract Name raw -o - - 2>/dev/null || true)"
    expiration_date="$(printf "%s" "$profile_text" | plutil -extract ExpirationDate raw -o - - 2>/dev/null || true)"
    if [[ -z "$profile_name" ]]; then
      profile_name="$(printf "%s\n" "$profile_text" | awk 'index($0, "<key>Name</key>") { getline; gsub("^[ \t]*<string>", ""); gsub("</string>[ \t]*$", ""); print; exit }')"
    fi
    if [[ -z "$expiration_date" ]]; then
      expiration_date="$(printf "%s\n" "$profile_text" | awk 'index($0, "<key>ExpirationDate</key>") { getline; gsub("^[ \t]*<date>", ""); gsub("</date>[ \t]*$", ""); print; exit }')"
    fi
    if [[ -z "$expiration_date" ]]; then
      echo "[$(timestamp)] Keeping OrionTV provisioning profile with unreadable expiry: ${profile}"
      continue
    fi

    expiration_epoch="$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$expiration_date" "+%s" 2>/dev/null || true)"
    if [[ -z "$expiration_epoch" ]]; then
      echo "[$(timestamp)] Keeping OrionTV provisioning profile with unparsable expiry: ${profile}"
      continue
    fi

    creation_date="$(printf '%s' "$profile_text" | plutil -extract CreationDate raw -o - - 2>/dev/null || true)"
    creation_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$creation_date" '+%s' 2>/dev/null || true)"
    if [[ "${ORIONTV_FORCE_PROFILE_REFRESH:-0}" == "1" || -z "$creation_epoch" ]] || ! profile_is_fresh "$expiration_epoch" "$creation_epoch" "$now_epoch"; then
      echo "[$(timestamp)] Requesting daily renewal of OrionTV provisioning profile: ${profile_name:-$profile} (${expiration_date})"
      mkdir -p "$profile_backup_dir"
      profile_refresh_pending=1
      mv "$profile" "$profile_backup_dir/"
    else
      echo "[$(timestamp)] Keeping OrionTV provisioning profile: ${profile_name:-$profile} (${expiration_date})"
    fi
  done
fi

if (( matching_profile_found == 0 || profile_refresh_pending == 1 )); then
  echo "[$(timestamp)] Opening the OrionTV project to initialize Xcode provisioning services"
  /usr/bin/open -gj -a Xcode "${PROJECT_DIR}/ios/OrionTV.xcworkspace" >/dev/null 2>&1 || true
  # Xcode's signed-in GUI can provision even when xcodebuild reports No Accounts.
  for provisioning_attempt in {1..18}; do
    if fresh_profile_available; then
      echo "[$(timestamp)] Fresh OrionTV provisioning profile is available"
      break
    fi
    sleep 5
  done
fi

echo "[$(timestamp)] Connecting to Living Room tv"
xcrun devicectl --timeout 45 device info details --device "$COREDEVICE_ID" >/dev/null 2>&1 || true

echo "[$(timestamp)] Building ${SCHEME} for Apple TV destination ${XCODE_DEVICE_ID}"
phase="build"
# Clean re-signs profile-only changes; implicit modules avoid Xcode 27's stalled dependency planner.
EXPO_TV=1 NODE_ENV=production xcodebuild \
  -workspace "${PROJECT_DIR}/ios/OrionTV.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "id=${XCODE_DEVICE_ID}" \
  -destination-timeout 60 \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$SIGNING_TEAM" \
  CODE_SIGN_IDENTITY="Apple Development" \
  CODE_SIGN_STYLE=Automatic \
  TVOS_DEPLOYMENT_TARGET=15.0 \
  SWIFT_ENABLE_EXPLICIT_MODULES=NO \
  OTHER_CODE_SIGN_FLAGS="--keychain ${ACTIVE_SIGNING_KEYCHAIN}" \
  clean build > "$BUILD_LOG" 2>&1 &
build_pid=$!

(
  sleep "$BUILD_TIMEOUT_SECONDS" &
  timer_pid=$!
  trap 'kill "$timer_pid" 2>/dev/null || true; exit 0' TERM INT
  wait "$timer_pid"
  if kill -0 "$build_pid" 2>/dev/null; then
    echo "[$(timestamp)] Build exceeded ${BUILD_TIMEOUT_SECONDS} seconds; terminating PID ${build_pid}"
    kill -TERM "$build_pid" 2>/dev/null || true
    sleep 10
    kill -KILL "$build_pid" 2>/dev/null || true
  fi
) &
watchdog_pid=$!

set +e
wait "$build_pid"
build_status=$?
build_pid=""
set -e
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true
watchdog_pid=""
cat "$BUILD_LOG"

if (( build_status != 0 )); then
  echo "[$(timestamp)] Build failed with exit code ${build_status}"
  if grep -Eq 'No Accounts:|Unable to log in with account|Your session has expired|Invalid credential|Missing Xcode-Token' "$BUILD_LOG"; then
    failure_reason="Xcode command-line provisioning cannot access an Apple account. If Xcode already shows the account, check OrionTV Signing & Capabilities; do not sign out or delete certificates."
  fi
  exit "$build_status"
fi

phase="validate-signature"
if [[ ! -d "$APP_PATH" ]]; then
  echo "[$(timestamp)] Build succeeded but app bundle was not found at ${APP_PATH}"
  exit 1
fi

if ! codesign --verify --deep --strict --verbose=2 "$APP_PATH"; then
  failure_reason="The built app failed signature validation; refusing to install. See the modified-resource details in the log."
  exit 1
fi
profile_text="$(security cms -D -i "${APP_PATH}/embedded.mobileprovision")"
profile_expiration="$(printf '%s' "$profile_text" | plutil -extract ExpirationDate raw -o - -)"
profile_creation="$(printf '%s' "$profile_text" | plutil -extract CreationDate raw -o - -)"
profile_app_identifier="$(printf '%s' "$profile_text" | plutil -extract Entitlements.application-identifier raw -o - -)"
expiration_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$profile_expiration" '+%s')"
if [[ "$profile_app_identifier" != "${SIGNING_TEAM}.${BUNDLE_ID}" ]] || (( expiration_epoch <= $(date -u '+%s') )); then
  failure_reason="Built app has an expired or mismatched provisioning profile; refusing to install."
  exit 1
fi
creation_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$profile_creation" '+%s')"
if ! profile_is_fresh "$expiration_epoch" "$creation_epoch" "$(date -u '+%s')"; then
  failure_reason="Provisioning did not renew today or has less than six days remaining (created ${profile_creation}, expires ${profile_expiration}). This run is not counted as a successful daily refresh."
  exit 1
fi
echo "[$(timestamp)] Verified app signature; profile expires ${profile_expiration}"

built_bundle_id="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${APP_PATH}/Info.plist")"
built_team_id="$(codesign -dvvv "$APP_PATH" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
if [[ "$built_bundle_id" != "$BUNDLE_ID" || "$built_team_id" != "$SIGNING_TEAM" ]]; then
  echo "[$(timestamp)] Refusing to install unexpected signature: bundle=${built_bundle_id}, team=${built_team_id}"
  exit 1
fi

for framework_plist in "$APP_PATH"/Frameworks/*.framework/Info.plist(N); do
  framework_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$framework_plist")"
  if [[ "$framework_bundle_id" == "$built_bundle_id" ]]; then
    failure_reason="Embedded framework has the app's bundle identifier: ${framework_plist}"
    exit 1
  fi
done
build_succeeded=1
rm -rf "$profile_backup_dir" 2>/dev/null || true
profile_refresh_pending=0

phase="install"
install_succeeded=0
for attempt in 1 2 3; do
  echo "[$(timestamp)] Installing app on Living Room tv (attempt ${attempt}/3)"
  if xcrun devicectl --timeout 120 device install app --device "$COREDEVICE_ID" "$APP_PATH"; then
    install_succeeded=1
    break
  fi
  sleep 15
done

if (( install_succeeded == 0 )); then
  echo "[$(timestamp)] Installation failed after 3 attempts"
  exit 1
fi

phase="complete"
date "+%Y-%m-%d" > "${LAST_SUCCESS_FILE}.$$"
mv "${LAST_SUCCESS_FILE}.$$" "$LAST_SUCCESS_FILE"
write_status succeeded 0
cp "$STATUS_FILE" "${LAST_SUCCESS_STATUS_FILE}.$$"
mv "${LAST_SUCCESS_STATUS_FILE}.$$" "$LAST_SUCCESS_STATUS_FILE"
echo "[$(timestamp)] Refresh completed successfully"
