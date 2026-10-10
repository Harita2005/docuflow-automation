"""
Migration Script: Encrypt secrets at rest using AES-256-GCM.
Reversible: provides both upgrade() and downgrade() functions.
Targets:
- users.mfa_secret
- notification_provider_configs.encrypted_password
- third_party_webhook_configs.auth_token & hmac_secret
- third_party_applications.auth_config_json
- callback_rules.auth_override_config_json
"""

import sys
import os
import logging

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database.connection import SessionLocal
from app.database.models import (
    User,
    NotificationProviderConfig,
    ThirdPartyWebhookConfig,
    ThirdPartyApplication,
    CallbackRule,
)
from app.services.crypto_service import encrypt_secret, decrypt_secret, PREFIX

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration.encrypt_secrets")

def upgrade():
    """Encrypts all plaintext secrets at rest."""
    db = SessionLocal()
    try:
        # 1. Users TOTP secrets
        users = db.query(User).filter(User.mfa_secret.isnot(None)).all()
        user_count = 0
        for u in users:
            if u.mfa_secret and not u.mfa_secret.startswith(PREFIX):
                u.mfa_secret = encrypt_secret(u.mfa_secret)
                user_count += 1
        logger.info("Encrypted %d user MFA secrets.", user_count)

        # 2. SMTP provider passwords
        configs = db.query(NotificationProviderConfig).all()
        smtp_count = 0
        for cfg in configs:
            if cfg.encrypted_password and not cfg.encrypted_password.startswith(PREFIX):
                cfg.encrypted_password = encrypt_secret(cfg.encrypted_password)
                smtp_count += 1
        logger.info("Encrypted %d SMTP passwords.", smtp_count)

        # 3. Webhook configs
        wh_configs = db.query(ThirdPartyWebhookConfig).all()
        wh_count = 0
        for wh in wh_configs:
            updated = False
            if wh.auth_token and not wh.auth_token.startswith(PREFIX):
                wh.auth_token = encrypt_secret(wh.auth_token)
                updated = True
            if wh.hmac_secret and not wh.hmac_secret.startswith(PREFIX):
                wh.hmac_secret = encrypt_secret(wh.hmac_secret)
                updated = True
            if updated:
                wh_count += 1
        logger.info("Encrypted %d webhook configs.", wh_count)

        # 4. Third-party applications auth_config_json
        apps = db.query(ThirdPartyApplication).all()
        app_count = 0
        for a in apps:
            if a.auth_config_json and not a.auth_config_json.startswith(PREFIX):
                a.auth_config_json = encrypt_secret(a.auth_config_json)
                app_count += 1
        logger.info("Encrypted %d third-party application auth configs.", app_count)

        # 5. Callback rules auth_override_config_json
        rules = db.query(CallbackRule).all()
        rule_count = 0
        for r in rules:
            if r.auth_override_config_json and not r.auth_override_config_json.startswith(PREFIX):
                r.auth_override_config_json = encrypt_secret(r.auth_override_config_json)
                rule_count += 1
        logger.info("Encrypted %d callback rule auth override configs.", rule_count)

        db.commit()
        logger.info("Migration completed successfully.")
    except Exception as exc:
        db.rollback()
        logger.error("Migration failed: %s", exc)
        raise
    finally:
        db.close()

def downgrade():
    """Reversibly decrypts encrypted secrets back to plaintext."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.mfa_secret.isnot(None)).all()
        for u in users:
            if u.mfa_secret and u.mfa_secret.startswith(PREFIX):
                u.mfa_secret = decrypt_secret(u.mfa_secret)

        configs = db.query(NotificationProviderConfig).all()
        for cfg in configs:
            if cfg.encrypted_password and cfg.encrypted_password.startswith(PREFIX):
                cfg.encrypted_password = decrypt_secret(cfg.encrypted_password)

        wh_configs = db.query(ThirdPartyWebhookConfig).all()
        for wh in wh_configs:
            if wh.auth_token and wh.auth_token.startswith(PREFIX):
                wh.auth_token = decrypt_secret(wh.auth_token)
            if wh.hmac_secret and wh.hmac_secret.startswith(PREFIX):
                wh.hmac_secret = decrypt_secret(wh.hmac_secret)

        apps = db.query(ThirdPartyApplication).all()
        for a in apps:
            if a.auth_config_json and a.auth_config_json.startswith(PREFIX):
                a.auth_config_json = decrypt_secret(a.auth_config_json)

        rules = db.query(CallbackRule).all()
        for r in rules:
            if r.auth_override_config_json and r.auth_override_config_json.startswith(PREFIX):
                r.auth_override_config_json = decrypt_secret(r.auth_override_config_json)

        db.commit()
        logger.info("Downgrade completed successfully.")
    except Exception as exc:
        db.rollback()
        logger.error("Downgrade failed: %s", exc)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "upgrade"
    if action == "downgrade":
        downgrade()
    else:
        upgrade()
