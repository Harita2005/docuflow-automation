# Internal Code Contribution & Development Standards

Welcome to the **Document Approval Automation System (DAAS)** internal repository. This document outlines coding standards, branching strategies, and Pull Request (PR) requirements for company developers.

---

## Branching Strategy

- **`main`**: Production-ready, stable codebase.
- **`staging`**: Pre-production testing environment.
- **`feature/<feature-name>`**: Individual feature developments.
- **`fix/<bug-name>`**: Bug fixes and hotfixes.

---

## Development Workflow

1. **Branch Creation**: Create a branch off `main` or `staging`:
   ```bash
   git checkout -b feature/po-reconciliation-upgrade
   ```
2. **Code Standards**:
   - **Frontend**: React 19 + TypeScript. Enforce strict typing without loose `any`.
   - **Backend**: Python 3.10+ FastAPI. Maintain type annotations on all API endpoints.
   - **No Hardcoded Credentials**: Never commit API keys, database passwords, or JWT secrets. Use `.env` variables.
3. **Pre-Commit Verification**:
   - Ensure linting passes: `npm run lint -w frontend`
   - Test API builds: `python backend/run.py`
4. **Pull Requests**:
   - All PRs require review from a Lead Systems Architect prior to merging into `main`.

---

## Code Quality Standards
* Preserve existing comments and docstrings.
* Use clear variable names and explicit function return types.
* Ensure unit and integration tests pass before submitting PRs.
