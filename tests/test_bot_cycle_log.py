import datetime as dt
import importlib.util
import pathlib
import os
import subprocess
import tempfile
import time
import unittest


path = pathlib.Path(__file__).resolve().parents[1] / "bin" / "bot_cycle_log.py"
spec = importlib.util.spec_from_file_location("bot_cycle_log", path)
log = importlib.util.module_from_spec(spec)
spec.loader.exec_module(log)


class BotCycleLogTests(unittest.TestCase):
    def test_rolls_at_0400_and_preserves_subsequent_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            writer = log.CycleLog(pathlib.Path(directory), "demo")
            writer.write("before", dt.datetime(2026, 11, 6, 3, 59, 59, 999000))
            writer.write("after", dt.datetime(2026, 11, 6, 4, 0, 0, 12000))
            writer.close()
            self.assertIn("[2026-11-06 03:59:59.999] before", (pathlib.Path(directory) / "demo" / "2026-11-05.log").read_text())
            self.assertIn("[2026-11-06 04:00:00.012] after", (pathlib.Path(directory) / "demo" / "2026-11-06.log").read_text())

    def test_redacts_login_password_and_does_not_drop_later_text(self):
        with tempfile.TemporaryDirectory() as directory:
            writer = log.CycleLog(pathlib.Path(directory), "demo")
            writer.write("[MCC] [Script] send /login sample-secret", dt.datetime(2026, 11, 6, 4))
            writer.write("connected", dt.datetime(2026, 11, 6, 4))
            writer.close()
            result = (pathlib.Path(directory) / "demo" / "2026-11-06.log").read_text()
            self.assertNotIn("sample-secret", result)
            self.assertIn("connected", result)

    def test_tmux_keeps_output_visible_and_writes_new_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            fake_bot = root / "fake_bot.sh"
            fake_bot.write_text("printf 'first-event\\n'\nsleep 0.4\nprintf 'second-event\\n'\nsleep 10\n")
            socket = f"mcc-log-test-{os.getpid()}"
            environment = os.environ.copy()
            environment.pop("TMUX", None)
            environment["BOT_LOG_ROOT"] = str(root / "logs")
            tmux = ["tmux", "-L", socket]
            runner = pathlib.Path(__file__).resolve().parents[1] / "bin" / "bot_tmux_run.sh"
            try:
                subprocess.run(tmux + ["new-session", "-d", "-s", "test", "bash", str(runner), "demo", str(fake_bot)], env=environment, check=True)
                deadline = time.monotonic() + 6
                result = ""
                while time.monotonic() < deadline:
                    files = list((root / "logs" / "demo").glob("*.log"))
                    if files:
                        result = files[0].read_text()
                        if "second-event" in result:
                            break
                    time.sleep(0.05)
                self.assertIn("first-event", result)
                self.assertIn("second-event", result)
                screen = subprocess.check_output(tmux + ["capture-pane", "-p", "-t", "test"], env=environment, text=True)
                self.assertIn("first-event", screen)
                self.assertIn("second-event", screen)
            finally:
                subprocess.run(tmux + ["kill-server"], env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def test_stream_flushes_immediately_and_survives_invalid_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.Popen(["python3", str(path), "demo", directory], stdin=subprocess.PIPE)
            try:
                process.stdin.write(b"first-event\ninvalid-\xff\n")
                process.stdin.flush()
                deadline = time.monotonic() + 5
                result = ""
                while time.monotonic() < deadline:
                    files = list((pathlib.Path(directory) / "demo").glob("*.log"))
                    if files:
                        result = files[0].read_text()
                        if "invalid-" in result:
                            break
                    time.sleep(0.05)
                self.assertIn("first-event", result)
                self.assertIn("invalid-\ufffd", result)
                self.assertIsNone(process.poll())
            finally:
                process.stdin.close()
                process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
