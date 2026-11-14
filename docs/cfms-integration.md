# Customer Feedback (CFMS) integration — DocuFlow side

Implements the DocuFlow part of the *CFMS ↔ DocuFlow Integration Specification v2* (section 8). Branch `cfms`.

```
Browser ──(JWT)──> DocuFlow backend /api/admin/cfms/*  ──(HTTPS + HMAC)──> CFMS /internal/v1/* (port 8444)
```
The browser never calls CFMS and never receives `CFMS_API_SECRET`, Salesforce or SMTP passwords.
The existing DocuFlow sync APIs (`/api/sync/record`, `/api/sync/record/{id}/image/{slot}`) are unchanged.

## Files
| Part | File |
|---|---|
| Router `/api/admin/cfms/*` | `backend/app/routers/cfms_admin.py` (registered in `backend/app/main.py`) |
| Signed CFMS client | `backend/app/services/cfms_client.py` |
| Permissions catalogue | `backend/scripts/seed_rbac_catalogue.py` (`cfms:view`, `cfms:sync`, `cfms:settings`, `cfms:admin`) |
| Settings > Customer Feedback tab | `frontend/src/pages/Admin.jsx`, `frontend/src/components/cfms/CustomerFeedbackSettings.jsx` |
| Compose override | `docker-compose.cfms.yml` |
| Tests | `backend/tests/test_cfms_admin.py`, `frontend/src/components/cfms/CustomerFeedbackSettings.test.jsx` |

## Permissions
| Code | Grants | Who |
|---|---|---|
| `cfms:view` | Tab, calendar, jobs, schedule (read), audit | Administrator roles (RBAC check) |
| `cfms:sync` | Schedule / Sync Now / cancel | Administrator roles |
| `cfms:settings` | E-mail sender and recipients | Administrator roles |
| `cfms:admin` | Salesforce password, login test, saving the schedule | **Only roles explicitly granted `cfms:admin`** |

DocuFlow's `check_permission` treats any role whose name contains "admin" as having every permission. For
`cfms:admin` that shortcut is deliberately **not** used: the code must be granted to the role in
Settings > Role Matrix. The seed script never assigns `cfms:admin` automatically. (DocuFlow has no
"Super Admin" flag in its user model, so a Super Admin = a role that holds `cfms:admin`.)
`GET /api/admin/cfms/permissions` returns the caller's effective `cfms:*` codes so the UI can hide controls; the
backend enforces them on every call (403 `{error:{code:"FORBIDDEN"}}`).

## API (DocuFlow path = CFMS path under `/internal/v1`)
`GET /settings`, `POST /sync/now`*, `POST /sync/schedule`*, `POST /sync/{jobId}/cancel`, `GET /jobs/{jobId}`,
`GET /jobs?limit=20`, `GET /calendar?month=YYYY-MM`, `GET|PUT /schedule`, `PUT /salesforce/password`*,
`POST /salesforce/login-test`*, `PUT /email/sender`, `PUT|POST /email/recipients`,
`DELETE /email/recipients/{email}`, `GET /audit`. (* = `Idempotency-Key` UUIDv4 header required; 400 if missing.)

DocuFlow validates before forwarding (422): report date `YYYY-MM-DD`, not after today (IST); start time
`HH:MM`, attempts 1–6, interval 15–240; valid e-mails, at most 500 recipients; passwords equal, 8–256 characters.
Rate limits per worker: password 5/15 min/user, login test 1/3 min, Sync Now 1/min/user (a retry with the same
Idempotency-Key is not counted). CFMS enforces its own persistent limits too. Request bodies are never logged.
CFMS status codes and `{error:{code,message}}` bodies are passed through; connection failure → 502
`CFMS_UNAVAILABLE`; missing configuration → 503 `CFMS_NOT_CONFIGURED`.

Signature (identical to CFMS `src/internal-api/signing.js`; shared test vectors in both test suites):
`hex(HMAC_SHA256(secret, keyId\nts\nrequestId\nMETHOD\npathWithQuery\nsha256_hex(rawBody)\nactor\npermissions\nidempotencyKey))`.
One network retry uses a NEW `X-CFMS-Request-Id` and the SAME `Idempotency-Key`. TLS is verified with
`CFMS_API_CA_FILE`; timeout 30 s.

## Deployment (Ubuntu, root) — after CFMS is deployed (CFMS `docs/internal-api.md`)
1. Secret file (same value as the CFMS key), never committed:
   ```
   sudo install -d -m 700 /etc/docuflow/secrets
   sudo sh -c 'umask 077; cat > /etc/docuflow/secrets/cfms_api_secret'   # paste the secret, Enter, Ctrl+D
   ```
2. CA certificate from CFMS: `/etc/cfms/tls/cfms-ca.crt` (public certificate only; mounted read-only).
3. Key id: put `CFMS_API_KEY_ID=docuflow-1` in `/opt/DAAS/.env` (compose variable file, not committed).
4. Seed the permissions, then grant `cfms:admin` to the Super Admin role in Settings > Role Matrix:
   `docker compose exec backend python scripts/seed_rbac_catalogue.py`
5. Rebuild and start with the override:
   `docker compose -f docker-compose.yml -f docker-compose.cfms.yml up -d --build backend frontend`
6. Verify read-only first: open Settings > Customer Feedback (calendar, schedule, audit). Then, with the
   owner's approval, one Sync Now for a date that is already synchronized (must create no new records).

Without the override file the backend starts normally and `/api/admin/cfms/*` answers 503 `CFMS_NOT_CONFIGURED`.

## Tests
```
cd backend && python -m pytest --noconftest -q tests/test_cfms_admin.py     # 40 tests, CFMS mocked
cd frontend && npx vitest run src/components/cfms                           # component tests
```
