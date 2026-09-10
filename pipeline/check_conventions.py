"""Enforce the mechanical subset of ``.conventions.yaml``.

A convention nobody checks is a convention that drifts. This follows the
precedent ``clb_lwi_webmap`` set with its own ``check_conventions.py``, and the
spirit of ras-commander's ``.auditor.yaml``: the rules and their reasoning live
in a readable artifact, and the ones a script *can* verify are verified.

It reads ``.conventions.yaml`` only to report which rules are covered, so a rule
added there without a check here shows up as a gap rather than as silence. The
checks themselves are written out below, because a rule expressive enough to be
data is rarely a rule worth having.

No dependencies. YAML is parsed only well enough to list rule ids and their
``enforced`` flags -- pulling in PyYAML for that would make this the one tool in
the repository that needs a package installed to run.

Usage::

    python -m pipeline.check_conventions
    python -m pipeline.check_conventions --report findings.json
"""

from __future__ import annotations

import argparse
import ast
import json
import re
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


class Findings:
    def __init__(self) -> None:
        self.failures: list[tuple[str, str]] = []
        self.checked: set[str] = set()
        self.count = 0

    def check(self, rule: str, ok: bool, message: str) -> bool:
        self.checked.add(rule)
        self.count += 1
        if not ok:
            self.failures.append((rule, message))
        return ok


# ---------------------------------------------------------------------------
# Reading .conventions.yaml, shallowly and on purpose
# ---------------------------------------------------------------------------

def declared_rules(path: Path) -> dict[str, bool]:
    """Map rule id -> whether it claims to be enforced.

    A deliberately naive scan. The file is ours, its shape is stable, and the
    alternative is making the conventions checker the only tool here that needs
    a third-party package.
    """
    rules: dict[str, bool] = {}
    current: str | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("- id:"):
            current = stripped.split(":", 1)[1].strip()
            rules[current] = False
        elif current and stripped.startswith("enforced:"):
            rules[current] = stripped.split(":", 1)[1].strip().lower() == "true"
    return rules


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------

def check_structure(root: Path, findings: Findings) -> None:
    pipeline = root / "pipeline"
    allowed = {"fim1d", "fim2d", "common"}
    packages = {p.name for p in pipeline.iterdir()
                if p.is_dir() and (p / "__init__.py").is_file() and not p.name.startswith("_")}
    findings.check(
        "product-split",
        packages <= allowed,
        f"unexpected pipeline package(s): {sorted(packages - allowed)}. Every module "
        f"belongs to fim1d, fim2d or common.",
    )

    # fim1d must not import fim2d, and vice versa.
    for package, forbidden in (("fim1d", "fim2d"), ("fim2d", "fim1d")):
        offenders = []
        for module in (pipeline / package).glob("*.py"):
            text = module.read_text(encoding="utf-8")
            if re.search(rf"\bfrom\s+\.\.{forbidden}\b|\bimport\s+.*\b{forbidden}\.", text):
                offenders.append(module.name)
        findings.check(
            "no-cross-product-imports",
            not offenders,
            f"pipeline/{package} imports {forbidden}: {offenders}. Shared code belongs "
            f"in pipeline/common.",
        )


def _module_level_imports(path: Path) -> set[str]:
    """Top-level import names only. Imports inside a function are deliberate."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.add(node.module.split(".")[0])
    return names


def check_environments(root: Path, findings: Findings) -> None:
    """The GDAL-free half must stay GDAL-free."""
    gdal_free = [
        *sorted((root / "pipeline" / "fim2d").glob("*.py")),
        *sorted((root / "pipeline" / "common").glob("*.py")),
        *[p for p in sorted((root / "serve").glob("*.py"))],
        root / "pipeline" / "fim1d" / "validate.py",
    ]
    for path in gdal_free:
        if not path.is_file():
            continue
        imports = _module_level_imports(path)
        findings.check(
            "environment-split",
            "osgeo" not in imports,
            f"{path.relative_to(root).as_posix()} imports osgeo at module scope. "
            f"This half of the pipeline must run without the GDAL bindings; import "
            f"it inside the function that needs it.",
        )


# ---------------------------------------------------------------------------
# CLI surface
# ---------------------------------------------------------------------------

#: Modules that expose a command line, and the positional name each may use.
CLI_MODULES = {
    "pipeline/fim1d/source.py": {"unit"},
    "pipeline/fim1d/cogs.py": {"unit"},
    "pipeline/fim1d/pmtiles.py": {"unit"},
    "pipeline/fim1d/manifest.py": {"unit"},
    "pipeline/fim1d/depth_pmtiles.py": {"source"},
    "pipeline/fim1d/site.py": {"source"},
    "pipeline/fim1d/validate.py": {"source"},
    "pipeline/fim2d/manifest.py": {"source"},
    "pipeline/fim2d/site.py": {"source"},
    "pipeline/fim2d/validate.py": {"source"},
}

#: Flags that were renamed away and must not come back.
RETIRED_FLAGS = ("--frontend", "--site", "--json")


def check_cli(root: Path, findings: Findings) -> None:
    for relative, allowed_names in CLI_MODULES.items():
        path = root / relative
        if not path.is_file():
            findings.check("input-positional", False, f"{relative} is missing")
            continue
        text = path.read_text(encoding="utf-8")

        positionals = set(re.findall(r"""add_argument\(\s*["']([a-z_]+)["']""", text))
        findings.check(
            "input-positional",
            bool(positionals & allowed_names),
            f"{relative}: expected a positional named one of {sorted(allowed_names)}, "
            f"found {sorted(positionals) or 'none'}",
        )

        for flag in RETIRED_FLAGS:
            findings.check(
                "input-positional",
                f'"{flag}"' not in text and f"'{flag}'" not in text,
                f"{relative} still defines the retired flag {flag}",
            )

        if "--out" in text or "--report" in text:
            findings.check(
                "output-flag",
                "--outdir" not in text and "--output" not in text,
                f"{relative}: output should be spelled --out",
            )


def check_reports(root: Path, findings: Findings) -> None:
    """Anything worth scripting writes JSON where it is told to."""
    for relative in CLI_MODULES:
        path = root / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        findings.check(
            "machine-readable-report",
            "--report" in text,
            f"{relative} has no --report; a caller cannot read its result without "
            f"parsing human output",
        )


# ---------------------------------------------------------------------------
# Release contracts
# ---------------------------------------------------------------------------

SCRIPT_REFERENCE = re.compile(
    r"""(?:new\s+Worker\(\s*|importScripts\(\s*|(?:src|href)\s*=\s*)["']([^"']+)["']""")


def _referenced_assets(viewer: Path) -> set[str]:
    found: set[str] = set()
    for path in sorted(viewer.glob("*")):
        if path.suffix not in (".js", ".html"):
            continue
        for match in SCRIPT_REFERENCE.finditer(path.read_text(encoding="utf-8")):
            reference = match.group(1)
            if not reference.startswith(("http://", "https://", "//", "data:", "#")):
                found.add(reference.lstrip("./"))
    return found


def module_constants(path: Path, names: tuple[str, ...]) -> dict[str, tuple]:
    """Read module-level tuple constants without importing the module.

    Importing pipeline.fim2d.site pulls in netCDF4, which made this checker
    depend on a package it claims not to need -- and it claims not to need one
    so it can run in CI before any wheel is built. ast.literal_eval reads the
    assignment directly and cannot execute anything.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: dict[str, tuple] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in names:
                try:
                    found[target.id] = tuple(ast.literal_eval(node.value))
                except (ValueError, TypeError):
                    pass
    return found


def check_viewer_files(root: Path, findings: Findings) -> None:
    builders = (
        ("viewer-1d", root / "pipeline" / "fim1d" / "site.py"),
        ("viewer-2d", root / "pipeline" / "fim2d" / "site.py"),
    )
    for viewer_name, builder in builders:
        viewer = root / "src" / viewer_name
        if not viewer.is_dir() or not builder.is_file():
            continue
        constants = module_constants(builder, ("VIEWER_FILES", "VENDOR_FILES", "GENERATED_FILES"))
        viewer_files = constants.get("VIEWER_FILES", ())
        if not findings.check(
            "viewer-files-complete",
            bool(viewer_files),
            f"{builder.relative_to(root).as_posix()}: VIEWER_FILES could not be read; "
            f"this check would pass vacuously",
        ):
            continue

        published = (set(viewer_files)
                     | set(constants.get("GENERATED_FILES", ()))
                     | {f"vendor/{n}" for n in constants.get("VENDOR_FILES", ())})
        references = _referenced_assets(viewer)
        findings.check(
            "viewer-files-complete",
            len(references) >= 3,
            f"{viewer_name}: the reference scan found only {len(references)} assets; "
            f"the pattern has probably drifted and this check is passing vacuously",
        )
        for reference in sorted(references):
            findings.check(
                "viewer-files-complete",
                reference in published,
                f"{viewer_name}: {reference} is loaded by the page but is in neither "
                f"VIEWER_FILES nor VENDOR_FILES; the built site would 404 it",
            )
        for name in viewer_files:
            findings.check(
                "viewer-files-complete",
                (viewer / name).is_file(),
                f"{viewer_name}: {name} is listed but absent",
            )


def check_safety_guards(root: Path, findings: Findings) -> None:
    for relative in ("pipeline/fim1d/site.py", "pipeline/fim2d/site.py"):
        text = (root / relative).read_text(encoding="utf-8")
        findings.check(
            "no-output-input-overlap",
            "_assert_safe_layout" in text,
            f"{relative} has no _assert_safe_layout; --out is deleted and rebuilt",
        )


def check_one_ramp(root: Path, findings: Findings) -> None:
    """No module may carry its own copy of the depth ramp."""
    canonical = root / "pipeline" / "common" / "ramp.py"
    findings.check("one-ramp", canonical.is_file(), "pipeline/common/ramp.py is missing")
    for path in [*sorted((root / "pipeline").rglob("*.py")), *sorted((root / "serve").glob("*.py"))]:
        if path == canonical or "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        findings.check(
            "one-ramp",
            "COLORMAPS" not in text or "from ..common.ramp" in text or "from pipeline.common.ramp" in text,
            f"{path.relative_to(root).as_posix()} defines its own COLORMAPS; import "
            f"pipeline.common.ramp instead",
        )


def check_gitignore(root: Path, findings: Findings) -> None:
    text = (root / ".gitignore").read_text(encoding="utf-8")
    for required in ("src/viewer-1d/cogs/", "src/viewer-1d/pmtiles/",
                     "src/viewer-2d/data/", "src/viewer-2d/vendor/", "deploy.json"):
        findings.check(
            "no-generated-artifacts-in-git",
            required in text,
            f".gitignore does not cover {required}",
        )


def strip_js_comments(text: str) -> str:
    """Remove // and /* */ comments.

    Without this the worker-yield check fired on the comment that explains why
    setTimeout is not used -- a checker that flags its own documentation is
    worse than no checker, because the first thing anyone does is disable it.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # The lookbehind keeps "https://" and an escaped "\//" from being eaten.
    return re.sub(r"(?<![:\\])//[^\n]*", "", text)


def check_worker_yield(root: Path, findings: Findings) -> None:
    worker = root / "src" / "viewer-2d" / "netcdf-worker.js"
    if not worker.is_file():
        return
    text = strip_js_comments(worker.read_text(encoding="utf-8"))
    findings.check(
        "no-task-yield-via-settimeout",
        not re.search(r"setTimeout\(\s*\w+\s*,\s*0\s*\)", text),
        "netcdf-worker.js yields with setTimeout(fn, 0), which is clamped to about a "
        "second in a background tab. Use the MessageChannel yield.",
    )


def check_reader_is_dom_free(root: Path, findings: Findings) -> None:
    reader = root / "src" / "viewer-2d" / "netcdf.js"
    if not reader.is_file():
        return
    text = strip_js_comments(reader.read_text(encoding="utf-8"))
    for forbidden in ("document.", "window.", "maplibregl"):
        findings.check(
            "reader-is-dom-free",
            forbidden not in text,
            f"netcdf.js references {forbidden}; it must stay loadable in a worker "
            f"and in Node, which is what makes the paint oracle cheap to run",
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", nargs="?", default=None,
                        help="repository root (default: the one this module lives in)")
    parser.add_argument("--report", help="write the findings to this JSON path")
    args = parser.parse_args(argv)

    root = Path(args.source).resolve() if args.source else repo_root()
    conventions = root / ".conventions.yaml"
    if not conventions.is_file():
        print(f"FAIL  no .conventions.yaml at {root}")
        return 2

    findings = Findings()
    check_structure(root, findings)
    check_environments(root, findings)
    check_cli(root, findings)
    check_reports(root, findings)
    check_viewer_files(root, findings)
    check_safety_guards(root, findings)
    check_one_ramp(root, findings)
    check_gitignore(root, findings)
    check_worker_yield(root, findings)
    check_reader_is_dom_free(root, findings)

    declared = declared_rules(conventions)
    enforced = {rule for rule, is_enforced in declared.items() if is_enforced}
    unchecked = sorted(enforced - findings.checked)
    unknown = sorted(findings.checked - set(declared))

    for rule, message in findings.failures:
        print(f"FAIL  [{rule}] {message}")
    for rule in unchecked:
        print(f"WARN  [{rule}] declared enforced in .conventions.yaml but nothing checks it")
    for rule in unknown:
        print(f"WARN  [{rule}] checked here but not declared in .conventions.yaml")

    verdict = "PASS" if not findings.failures else "FAIL"
    print(f"\n{verdict}  {findings.count} checks over {len(findings.checked)} rule(s), "
          f"{len(findings.failures)} failures, "
          f"{len(unchecked) + len(unknown)} warnings")
    print(f"      {len(declared)} rules declared, {len(enforced)} claim to be enforced")

    if args.report:
        Path(args.report).write_text(json.dumps({
            "checks": findings.count,
            "failures": [{"rule": r, "message": m} for r, m in findings.failures],
            "rules_declared": len(declared),
            "rules_enforced": sorted(enforced),
            "rules_unchecked": unchecked,
        }, indent=2), encoding="utf-8")
        print(f"      report: {args.report}")

    return 0 if not findings.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
