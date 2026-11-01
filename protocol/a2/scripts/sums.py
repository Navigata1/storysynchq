#!/usr/bin/env python3
"""Write and verify a SHA256SUMS file through one strict line parser.

A line is 64 lowercase hex digits, two spaces, a name and a newline. A name is a
relative POSIX path. It may hold spaces anywhere. It may not hold a newline, a
carriage return, a backslash or a NUL, start with '/', or have an empty, '.' or
'..' component. A name appears once.

`write` checks its own output with the parser `verify` uses before it writes, so
it cannot produce a file that `verify` refuses. It lists inputs before it creates
its output, and never lists its own output.

usage:
  sums.py write  [--root DIR] [--out FILE|-] [--exclude NAME]... [--no-default-excludes] PATH...
  sums.py verify [--root DIR] [--complete] [--exclude NAME]... [--no-default-excludes] FILE

PATH is relative to the root ('.' is the whole root); folders are walked. The
verify root defaults to the sums file's folder. Default excludes: .git,
__pycache__ and .DS_Store. --complete also names files under the root that the
sums file does not list.

exit: 0 all match; 1 a mismatch, a missing file or an unlisted file; 2 cannot
run (usage, a malformed sums file, an unsafe name, a symlink or special file).
"""
import argparse
import hashlib
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

LINE = re.compile(r"([0-9a-f]{64})  (.+)")
FORBIDDEN = ("\n", "\r", "\\", "\0")
DEFAULT_EXCLUDES = (".git", "__pycache__", ".DS_Store")


class SumsError(Exception):
    """A sums file, a name or a tree entry that cannot be handled safely (exit 2)."""


def check_name(name: str) -> str:
    for ch in FORBIDDEN:
        if ch in name:
            raise SumsError(f"name holds a forbidden character {ch!r}: {name!r}")
    if not name or name.startswith("/") or any(p in ("", ".", "..") for p in name.split("/")):
        raise SumsError(f"unsafe name: {name!r}")
    return name


def parse_line(line: str, lineno: int = 0):
    match = LINE.fullmatch(line)
    if not match:
        raise SumsError(f"line {lineno}: malformed: {line!r}")
    return match.group(1), check_name(match.group(2))


def parse_sums(text: str):
    if text == "":
        raise SumsError("the sums file is empty")
    if not text.endswith("\n"):
        raise SumsError("the sums file does not end with a newline")
    entries, seen = [], set()
    for lineno, line in enumerate(text[:-1].split("\n"), 1):
        digest, name = parse_line(line, lineno)
        if name in seen:
            raise SumsError(f"line {lineno}: duplicate name: {name!r}")
        seen.add(name)
        entries.append((digest, name))
    return entries


def format_line(digest: str, name: str) -> str:
    return f"{digest}  {check_name(name)}\n"


def file_digest(path: Path) -> str:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    h = hashlib.sha256()
    with os.fdopen(fd, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _walk(root: Path, rel: str, excludes, names: set, bad: list):
    path = root / rel if rel else root
    try:
        mode = os.lstat(path).st_mode
    except FileNotFoundError:
        raise SumsError(f"{rel or '.'}: no such file or folder under the root") from None
    if stat.S_ISLNK(mode):
        bad.append(f"{rel} (a symlink)")
    elif stat.S_ISREG(mode):
        try:
            names.add(check_name(rel))
        except SumsError as err:
            bad.append(str(err))
    elif stat.S_ISDIR(mode):
        for entry in sorted(os.listdir(path)):
            if entry not in excludes:
                _walk(root, f"{rel}/{entry}" if rel else entry, excludes, names, bad)
    else:
        bad.append(f"{rel} (not a regular file or folder)")


def list_inputs(root: Path, paths, excludes):
    """Every regular file under the given paths, refusing every link and special file."""
    names, bad = set(), []
    for given in paths:
        rel = "" if given == "." else given.rstrip("/")
        if rel and (rel.startswith("/") or any(p in ("", ".", "..") for p in rel.split("/"))):
            raise SumsError(f"{given!r}: give a relative path inside the root")
        _walk(root, rel, excludes, names, bad)
    if bad:
        raise SumsError("refused:\n  " + "\n  ".join(bad))
    return sorted(names)


def _inside(root: Path, path: Path):
    """The name of `path` under `root`, or None when it lies elsewhere."""
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def write(root: Path, paths, out: str, excludes) -> int:
    names = list_inputs(root, paths, excludes)
    target = None if out == "-" else Path(out)
    if target is not None:
        own = _inside(root, target)
        names = [n for n in names if n != own]
    if not names:
        raise SumsError("nothing to list: no regular file under the given paths")
    entries = [(file_digest(root / n), n) for n in names]
    text = "".join(format_line(d, n) for d, n in entries)
    if parse_sums(text) != entries:  # the verifier's parser must read back exactly this
        raise SumsError("internal: the written text does not parse back to its entries")
    if target is None:
        sys.stdout.write(text)
        return 0
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".sums-")
    with os.fdopen(fd, "wb") as handle:
        handle.write(text.encode("utf-8"))
    umask = os.umask(0)
    os.umask(umask)
    os.chmod(tmp, 0o666 & ~umask)
    os.replace(tmp, target)
    print(f"wrote {len(names)} entries to {target}")
    return 0


def _listed_file(root: Path, name: str):
    path = root
    mode = 0
    for part in name.split("/"):
        path = path / part
        try:
            mode = os.lstat(path).st_mode
        except (FileNotFoundError, NotADirectoryError):
            return None
        if stat.S_ISLNK(mode):
            raise SumsError(f"a symlink is on the path of {name!r}")
    if not stat.S_ISREG(mode):
        raise SumsError(f"{name!r} is not a regular file")
    return path


def verify(sums_file: Path, root: Path, complete: bool, excludes) -> int:
    try:
        text = sums_file.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise SumsError(f"{sums_file} is not UTF-8") from None
    entries = parse_sums(text)
    problems = []
    for digest, name in entries:
        path = _listed_file(root, name)
        if path is None:
            problems.append(f"MISSING {name}")
        elif file_digest(path) != digest:
            problems.append(f"MISMATCH {name}")
    if complete:
        on_disk = set(list_inputs(root, ["."], excludes))
        on_disk.discard(_inside(root, sums_file))
        listed = {name for _, name in entries}
        problems += [f"UNLISTED {name}" for name in sorted(on_disk - listed)]
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} problem(s) against {sums_file.name}")
        return 1
    print(f"verified {len(entries)} files against {sums_file.name}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    w = sub.add_parser("write")
    w.add_argument("--root", default=".")
    w.add_argument("--out")
    w.add_argument("paths", nargs="+")
    v = sub.add_parser("verify")
    v.add_argument("--root")
    v.add_argument("--complete", action="store_true")
    v.add_argument("file")
    for p in (w, v):
        p.add_argument("--exclude", action="append", default=[])
        p.add_argument("--no-default-excludes", action="store_true")
    args = ap.parse_args(argv)
    excludes = set(args.exclude) | (set() if args.no_default_excludes else set(DEFAULT_EXCLUDES))
    try:
        if args.command == "write":
            root = Path(args.root)
            return write(root, args.paths, args.out or str(root / "SHA256SUMS"), excludes)
        sums_file = Path(args.file)
        root = Path(args.root) if args.root else sums_file.parent
        return verify(sums_file, root, args.complete, excludes)
    except (SumsError, OSError) as err:
        print(f"sums.py: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
