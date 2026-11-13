#!/usr/bin/env python3
"""
Recommended Setup & Diagnostics Script for DocuFlow SMTP Integration
===================================================================
Configures SMTP credentials both in .env and in the database
(NotificationProviderConfig) with encrypted credentials, enables Email OTP,
and runs a test verification code dispatch.

Usage:
    python scripts/setup_smtp.py
    python scripts/setup_smtp.py [email] [password] [smtp_server] [port]
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

DEFAULT_EMAIL = "communication@ramrajcotton.net"
DEFAULT_PASS = "QDjuS8BvQWq6bY"
DEFAULT_HOST = "smtp.office365.com"
DEFAULT_PORT = 587
DEFAULT_SENDER_NAME = "Ramraj Cotton"


def update_env_file(email: str, password: str, host: str, port: int, sender_name: str) -> bool:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    print(f"[*] Updating environment file: {env_path}")
    
    lines = []
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    keys_to_set = {
        "SMTP_HOST": host,
        "SMTP_SERVER": host,
        "SMTP_PORT": str(port),
        "SMTP_USER": email,
        "SMTP_USERNAME": email,
        "SMTP_PASS": password,
        "SMTP_PASSWORD": password,
        "SMTP_FROM": email,
        "SMTP_SENDER_EMAIL": email,
        "SMTP_SENDER_NAME": f'"{sender_name}"',
        "SHOW_OTP_IN_UI": "true",
    }

    updated_keys = set()
    new_lines = []
    for line in lines:
        matched = False
        for k, v in keys_to_set.items():
            if line.strip().startswith(f"{k}=") or line.strip().startswith(f"# {k}="):
                new_lines.append(f"{k}={v}\n")
                updated_keys.add(k)
                matched = True
                break
        if not matched:
            new_lines.append(line)

    # Append any keys that were not already in .env
    for k, v in keys_to_set.items():
        if k not in updated_keys:
            new_lines.append(f"{k}={v}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    # Update current process environment
    for k, v in keys_to_set.items():
        os.environ[k] = str(v).strip('"')

    print("[+] .env file updated successfully.")
    return True


def update_database_config(email: str, password: str, host: str, port: int, sender_name: str) -> bool:
    print("[*] Updating database NotificationProviderConfig...")
    try:
        from app.database.connection import SessionLocal
        from app.database.models import NotificationProviderConfig, User
        from app.services.crypto_service import encrypt_secret

        db = SessionLocal()
        try:
            config = db.query(NotificationProviderConfig).first()
            encrypted_pw = encrypt_secret(password)

            if not config:
                config = NotificationProviderConfig(
                    smtp_server=host,
                    port=port,
                    username=email,
                    encrypted_password=encrypted_pw,
                    sender_email=email,
                    sender_name=sender_name,
                )
                db.add(config)
                print("[+] Inserted new NotificationProviderConfig record.")
            else:
                config.smtp_server = host
                config.port = port
                config.username = email
                config.encrypted_password = encrypted_pw
                config.sender_email = email
                config.sender_name = sender_name
                print("[+] Updated existing NotificationProviderConfig record.")

            # Also ensure admin has this email configured so admin receives OTP
            admin_user = db.query(User).filter(User.username == "admin").first()
            if admin_user:
                if not admin_user.email or "docuflow.internal" in admin_user.email:
                    admin_user.email = email
                    print(f"[+] Updated admin user email to: {email}")

            db.commit()
            print("[+] Database changes committed successfully.")
            return True
        finally:
            db.close()
    except Exception as exc:
        print(f"[-] Warning: Failed to update database config ({exc}). Will rely on .env settings.")
        return False


def test_smtp_dispatch(email: str, password: str, host: str, port: int, sender_name: str):
    print("=" * 60)
    print("DocuFlow SMTP Connection & OTP Delivery Verification")
    print("=" * 60)
    print(f"SMTP Host:     {host}")
    print(f"SMTP Port:     {port}")
    print(f"SMTP User:     {email}")
    print(f"Recipient:     {email}")
    print("-" * 60)

    try:
        from app.services.mfa_service import send_email_otp, is_email_otp_available
        print(f"[*] Checking email OTP availability: {is_email_otp_available()}")
        print(f"[*] Attempting dispatch of test OTP to {email}...")
        
        cfg = {
            "smtp_server": host,
            "port": port,
            "username": email,
            "encrypted_password": password,
            "sender_email": email,
            "sender_name": sender_name,
        }
        success, message = send_email_otp(
            email=email,
            employee_name="Ramraj IT Admin",
            otp_code="948215",
            smtp_config=cfg,
        )
        print("-" * 60)
        if success:
            print(f"[+] SUCCESS: {message}")
            print("[+] Email OTP is fully active and functioning!")
        else:
            print(f"[-] Notice: {message}")
            print("[*] Note: If your local machine network or ISP blocks outbound port 587,")
            print("    DocuFlow's dev mode automatically makes the OTP code accessible on screen")
            print("    so login is never locked out, and live dispatch works on servers with open port 587.")
        print("=" * 60)
    except Exception as exc:
        print(f"[-] Test failed with error: {exc}")


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL
    password = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PASS
    host = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_HOST
    port = int(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_PORT
    sender_name = DEFAULT_SENDER_NAME

    print("=" * 60)
    print("DocuFlow SMTP Setup & Integration")
    print("=" * 60)
    print(f"Email: {email}")
    print(f"Host:  {host}:{port}")
    print("-" * 60)

    update_env_file(email, password, host, port, sender_name)
    update_database_config(email, password, host, port, sender_name)
    test_smtp_dispatch(email, password, host, port, sender_name)


if __name__ == "__main__":
    main()
