#!/usr/bin/env python3
"""Record a tmux pane without changing its display or interactive input."""

import argparse
import datetime as dt
import os
from pathlib import Path
import re
import sys

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)")
LOGIN = re.compile(r"(?i)(/(?:login|l|dn|register|reg|dk)\s+)\S+(?:\s+\S+)?")


class CycleLog:
    def __init__(self, root: Path, bot: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]+", bot):
            raise ValueError("invalid bot name")
        self.directory = root / bot
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.directory.chmod(0o700)
        self.day = None
        self.file = None

    def write(self, line: str, now: dt.datetime):
        day = (now - dt.timedelta(hours=4)).date()
        if day != self.day:
            self.close()
            path = self.directory / f"{day.isoformat()}.log"
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            os.fchmod(fd, 0o600)
            self.file = os.fdopen(fd, "a", encoding="utf-8", buffering=1)
            self.day = day
        text = LOGIN.sub(r"\1<redacted>", ANSI.sub("", line)).rstrip("\r\n")
        stamp = now.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        self.file.write(f"[{stamp}] {text}\n")
        self.file.flush()

    def close(self):
        if self.file is not None:
            self.file.close()
            self.file = None
        self.day = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("bot")
    parser.add_argument("log_root", type=Path)
    args = parser.parse_args()
    writer = CycleLog(args.log_root, args.bot)
    try:
        for line in sys.stdin.buffer:
            writer.write(line.decode("utf-8", "replace"), dt.datetime.now().astimezone())
    finally:
        writer.close()


if __name__ == "__main__":
    main()
