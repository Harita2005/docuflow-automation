#!/usr/bin/env python3
"""
Diagnostic utility to test SMTP connection and send a test OTP email.
Usage:
    python scripts/test_smtp_connection.py [recipient_email]
"""

import os
import sys
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from pathlib import Path

# Load .env file
env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k not in os.environ:
                    os.environ[k] = v

def test_smtp(recipient: str):
    smtp_host = os.getenv("SMTP_HOST") or os.getenv("SMTP_SERVER", "smtp.office365.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS", "")
    sender_email = os.getenv("SMTP_FROM") or os.getenv("SMTP_SENDER_EMAIL") or smtp_user
    sender_name = os.getenv("SMTP_SENDER_NAME", "DocuFlow Security")

    print("=" * 60)
    print("DocuFlow SMTP Connection & OTP Delivery Test")
    print("=" * 60)
    print(f"SMTP Host:     {smtp_host}")
    print(f"SMTP Port:     {smtp_port}")
    print(f"SMTP User:     {smtp_user}")
    print(f"Sender Email:  {sender_email}")
    print(f"Password Set:  {'YES' if smtp_pass else 'NO'}")
    print(f"Recipient:     {recipient}")
    print("-" * 60)

    if not smtp_user or not smtp_pass:
        print("[-] ERROR: SMTP_USER or SMTP_PASSWORD is not configured.")
        print("    Please set SMTP_USER and SMTP_PASS in the .env file.")
        return False

    # Create test message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "DocuFlow OTP – Test Verification Code"
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = recipient
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()

    test_code = "749201"
    plain = f"Your DocuFlow test OTP is: {test_code}\n\nIf you received this email, SMTP delivery is working properly!"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0;">DocuFlow Security Verification</h2>
        <p style="color: #475569; font-size: 14px;">Your test verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; background: #f8fafc; padding: 16px; text-align: center; border-radius: 6px; font-family: monospace;">
            {test_code}
        </div>
        <p style="color: #10b981; font-size: 13px; font-weight: bold; margin-top: 16px;">
            ✓ SMTP Connection & Delivery Test Succeeded!
        </p>
    </div>
    """
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        print("[*] Connecting to SMTP server...")
        ssl_ctx = ssl.create_default_context()
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, context=ssl_ctx, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.ehlo()
            print("[*] Initiating STARTTLS encryption...")
            server.starttls(context=ssl_ctx)
            server.ehlo()

        print("[*] Authenticating with SMTP credentials...")
        server.login(smtp_user, smtp_pass)
        print("[+] Authentication SUCCESSFUL!")

        print(f"[*] Dispatching test OTP to {recipient}...")
        server.sendmail(sender_email, [recipient], msg.as_string())
        server.quit()
        print("[+] SUCCESS: Test OTP email was accepted and sent by the server!")
        print("=" * 60)
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"[-] Authentication FAILED: {e}")
        print("    Tip: Check if the mailbox password is correct, or if an App Password is required.")
        print("    For Microsoft 365 / Exchange: Ensure 'Authenticated SMTP' is enabled on the mailbox.")
        return False
    except Exception as e:
        print(f"[-] Connection or delivery failed: {type(e).__name__}: {e}")
        return False

if __name__ == "__main__":
    to_email = sys.argv[1] if len(sys.argv) > 1 else os.getenv("SMTP_USER", "admin@ramrajcotton.net")
    test_smtp(to_email)
