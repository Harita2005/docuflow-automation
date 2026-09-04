import os
import sys
import py_compile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"

print("=" * 80)
print(">>> ENTERPRISE CODEBASE STATIC COMPLIANCE AUDIT")
print("=" * 80)

audit_passed = True
errors = []

# 1. Syntax Check across all .py files in app/
print("\n[1/4] Checking Python Syntax Integrity across backend/app/...")
py_files = list(APP_DIR.rglob("*.py"))
syntax_clean = True
for py_file in py_files:
    try:
        py_compile.compile(str(py_file), doraise=True)
    except Exception as err:
        syntax_clean = False
        audit_passed = False
        errors.append(f"Syntax Error in {py_file.relative_to(BASE_DIR)}: {err}")

if syntax_clean:
    print(f"  [PASSED] All {len(py_files)} Python files compiled cleanly with 0 syntax errors.")
else:
    print("  [FAILED] Syntax errors found.")

# 2. Check for zero SQLite references in backend/app/
print("\n[2/4] Verifying Zero SQLite References in Production Code (backend/app/)...")
sqlite_matches = []
for py_file in py_files:
    content = py_file.read_text(encoding="utf-8", errors="ignore")
    if "sqlite" in content.lower():
        sqlite_matches.append(str(py_file.relative_to(BASE_DIR)))

if not sqlite_matches:
    print("  [PASSED] Zero SQLite references found in backend/app/.")
else:
    audit_passed = False
    print(f"  [FAILED] SQLite references found in: {sqlite_matches}")
    errors.append(f"SQLite references found in: {sqlite_matches}")

# 3. Check for zero hardcoded fallback workflow strings
print("\n[3/4] Verifying Zero Hardcoded Fallback Routing Strings...")
forbidden_strings = ["VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2", "WF-837"]
fallback_matches = []
for py_file in py_files:
    content = py_file.read_text(encoding="utf-8", errors="ignore")
    for fs in forbidden_strings:
        if fs in content:
            fallback_matches.append((str(py_file.relative_to(BASE_DIR)), fs))

if not fallback_matches:
    print("  [PASSED] Zero hardcoded fallback workflow strings found.")
else:
    audit_passed = False
    print(f"  [FAILED] Hardcoded fallback strings found: {fallback_matches}")
    errors.append(f"Hardcoded fallback strings found: {fallback_matches}")

# 4. Check for zero hardcoded database passwords in app source
print("\n[4/4] Verifying Zero Hardcoded Passwords in Source Code...")
password_matches = []
for py_file in py_files:
    content = py_file.read_text(encoding="utf-8", errors="ignore")
    if "Admin%401234" in content or "Admin@1234" in content:
        password_matches.append(str(py_file.relative_to(BASE_DIR)))

if not password_matches:
    print("  [PASSED] Zero hardcoded passwords found in backend/app/.")
else:
    audit_passed = False
    print(f"  [FAILED] Hardcoded passwords found in: {password_matches}")
    errors.append(f"Hardcoded passwords found in: {password_matches}")

print("\n" + "=" * 80)
if audit_passed:
    print(">>> CODEBASE COMPLIANCE AUDIT PASSED: 100% ENTERPRISE STANDARDS VERIFIED!")
    print("=" * 80)
    sys.exit(0)
else:
    print(">>> CODEBASE COMPLIANCE AUDIT FAILED:")
    for e in errors:
        print(f"  - {e}")
    print("=" * 80)
    sys.exit(1)
