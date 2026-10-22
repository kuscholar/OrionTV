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


class RefreshTests(unittest.TestCase):
    def run_script(self, state, **env):
        return subprocess.run(['/bin/zsh', str(SCRIPT)], env={**os.environ,
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

    def test_schedule_forces_renewal_and_retries(self):
        agent = plistlib.loads(SCRIPT.with_name('com.kusch.refresh-orion-tv.plist').read_bytes())
        self.assertEqual(agent['StartCalendarInterval'], [{'Hour':h,'Minute':30} for h in (10,14,18)])
        self.assertEqual(agent['EnvironmentVariables']['ORIONTV_FORCE_PROFILE_REFRESH'], '1')
        self.assertEqual(agent['EnvironmentVariables']['ORIONTV_SCHEDULED'], '1')
        self.assertTrue(agent['RunAtLoad'])


if __name__ == '__main__':
    unittest.main()
