"""Check the real scheduler guards and profile rollback without touching Xcode."""
import datetime
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('refresh-orion-tv.sh')
SOURCE = SCRIPT.read_text()
STORAGE_STUB = r'''diskutil() {
  print '<?xml version="1.0"?><plist version="1.0"><dict><key>VolumeUUID</key><string>580CADCD-33F5-4D78-9530-2287615873CA</string></dict></plist>'
}
''' 


class RefreshTests(unittest.TestCase):
    def run_script(self, state, **env):
        return subprocess.run(['/bin/zsh', '-c', STORAGE_STUB + 'source "$1"', 'test', str(SCRIPT)], env={**os.environ,
            'ORIONTV_STATE_DIR': str(state), **env}, capture_output=True, text=True)

    def test_daily_success_skips_even_with_forced_renewal(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            (state / 'last-success-date').write_text(datetime.date.today().isoformat())
            result = self.run_script(state, ORIONTV_SCHEDULED='1', ORIONTV_FORCE_PROFILE_REFRESH='1')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('already succeeded', (state / 'logs/refresh-orion-tv.log').read_text())
            self.assertFalse((state / 'refresh.lock').exists())
            self.assertFalse((state / 'logs/last-run.plist').exists())

    def test_active_or_incomplete_lock_prevents_second_run(self):
        for pid in ('', str(os.getpid())):
            with self.subTest(pid=pid), tempfile.TemporaryDirectory() as temp:
                state = Path(temp)
                lock = state / 'refresh.lock'
                lock.mkdir()
                if pid:
                    (lock / 'pid').write_text(pid)
                result = self.run_script(state, ORIONTV_SCHEDULED='0')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(lock.exists())
                self.assertIn('lock is held', (state / 'logs/refresh-orion-tv.log').read_text())

    def test_next_day_entry_resolves_checkout_and_records_failed_runs(self):
        # Exercise the actual entry point from an unrelated working directory.
        # Only signing tools and git are stubbed; no Apple account is contacted.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / 'checkout'
            scripts = project / 'scripts'
            scripts.mkdir(parents=True)
            runner = scripts / SCRIPT.name
            runner.write_text(SOURCE)
            state = root / 'state'
            state.mkdir()
            yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
            (state / 'last-success-date').write_text(yesterday)
            code = STORAGE_STUB + r'''date() {
  if [[ "$1" == '+%H%M' ]]; then print 1200; else command date "$@"; fi
}
xcodebuild() { return 0; }
codesign() { return 0; }
git() {
  if [[ "$PWD" != "$EXPECTED_PROJECT" ]]; then
    print -u2 "Wrong checkout: $PWD"; return 128
  fi
  case "$1" in
    branch) print master ;;
    remote) print https://github.com/kuscholar/OrionTV.git ;;
    status) print ' M synthetic-local-edit' ;;
    *) return 99 ;;
  esac
}
source "$1"
'''
            result = subprocess.run(['/bin/zsh', '-c', code, 'test', str(runner)],
                cwd=root, capture_output=True, text=True,
                env={**os.environ, 'EXPECTED_PROJECT': str(project),
                     'ORIONTV_STATE_DIR': str(state), 'ORIONTV_SCHEDULED': '1'})
            log = (state / 'logs/refresh-orion-tv.log').read_text()
            self.assertNotIn('Wrong checkout', log)
            self.assertEqual(result.returncode, 1, result.stderr + log)
            status = plistlib.loads((state / 'logs/last-run.plist').read_bytes())
            self.assertEqual(status['result'], 'failed')
            self.assertEqual(status['exitCode'], 1)
            self.assertEqual(status['phase'], 'update-source')
            self.assertIn('Tracked files have local edits', status['reason'])
            self.assertFalse((state / 'refresh.lock').exists())
            self.assertEqual((state / 'last-success-date').read_text(), yesterday)

    def test_profile_requires_today_and_at_least_six_days(self):
        function = SOURCE.split('profile_is_fresh() {', 1)[1].split('\nfresh_profile_available()', 1)[0]
        now = int(datetime.datetime.now().timestamp())
        for created, remaining, expected in ((now, 6*86400, 0), (now, 6*86400-1, 1), (now-86400, 7*86400, 1)):
            with self.subTest(created=created, remaining=remaining):
                result = subprocess.run(['/bin/zsh', '-c',
                    'MIN_PROFILE_VALIDITY_SECONDS=$((6*86400)); profile_is_fresh() {' + function +
                    f'\nprofile_is_fresh {now+remaining} {created} {now}'])
                self.assertEqual(result.returncode, expected)

    def test_failed_build_restores_profile_and_records_failure(self):
        functions = SOURCE.split('write_status() {', 1)[1].split('\ntrap cleanup EXIT', 1)[0]
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            backup = state / 'backup'
            backup.mkdir()
            (backup / 'original.mobileprovision').write_text('retained original')
            code = '''set -euo pipefail
STATE_DIR="$1"; STATUS_FILE="$1/last-run.plist"; LOG_FILE="$1/log"
LOCK_DIR="$1/lock"; mkdir "$LOCK_DIR"
profile_backup_dir="$1/backup"; profiles_dir="$1/profiles"
profile_refresh_pending=1; build_succeeded=0; build_pid=""; watchdog_pid=""
phase="build"; failure_reason="test failure"; profile_expiration=""; profile_creation=""
ACTIVE_SIGNING_KEYCHAIN=""; source_revision="test-revision"
timestamp() { date; }
write_status() {''' + functions + '\ntrap cleanup EXIT\nexit 7\n'
            result = subprocess.run(['/bin/zsh', '-c', code, 'test', str(state)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 7, result.stderr)
            self.assertEqual((state / 'profiles/original.mobileprovision').read_text(), 'retained original')
            status = plistlib.loads((state / 'last-run.plist').read_bytes())
            self.assertEqual((status['result'], status['exitCode'], status['phase']), ('failed', 7, 'build'))
            self.assertFalse((state / 'lock').exists())
            self.assertFalse((state / 'last-success-date').exists())

    def test_missing_external_volume_stops_before_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / 'absent'
            result = subprocess.run(['/bin/zsh', '-c',
                'diskutil() { return 1; }; source "$1"', 'test', str(SCRIPT)],
                capture_output=True, text=True,
                env={**os.environ, 'ORIONTV_STATE_DIR': str(state)})
            self.assertEqual(result.returncode, 78)
            self.assertFalse(state.exists())

    def test_profile_renewal_retries_and_waits_for_fresh_profile(self):
        function = SOURCE.split('renew_profile() {', 1)[1].split('\nif (( matching_profile_found', 1)[0]
        # Open is stubbed in this isolated extracted function only.
        function = function.replace('/usr/bin/open', 'open')
        for success, expected, opens in ((True, 0, 2), (False, 1, 3)):
            with self.subTest(success=success):
                code = """PROJECT_DIR=/fixture; checks=0; opens=0
timestamp() { print test; }
open() { (( ++opens )); }
sleep() { :; }
fresh_profile_available() { (( ++checks )); """ + ('(( checks == 13 ))' if success else 'return 1') + """; }
renew_profile() {""" + function + """
renew_profile
result=$?
print "RESULT=$result OPENS=$opens"
exit "$result"
"""
                result = subprocess.run(['/bin/zsh', '-c', code], capture_output=True, text=True)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertIn(f'OPENS={opens}', result.stdout)

    def test_schedule_forces_renewal_and_retries(self):
        agent = plistlib.loads(SCRIPT.with_name('com.kusch.refresh-orion-tv.plist').read_bytes())
        self.assertEqual(agent['StartCalendarInterval'], [{'Hour':h,'Minute':30} for h in (10,14,18)])
        self.assertEqual(agent['EnvironmentVariables']['ORIONTV_FORCE_PROFILE_REFRESH'], '1')
        self.assertEqual(agent['EnvironmentVariables']['ORIONTV_SCHEDULED'], '1')
        self.assertTrue(agent['RunAtLoad'])
        self.assertEqual(agent['StartInterval'], 3600)


if __name__ == '__main__':
    unittest.main()
