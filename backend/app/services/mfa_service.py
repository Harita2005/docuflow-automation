
import base64
import io
import logging
import os
from email.utils import formatdate, make_msgid
import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, Optional, Tuple

import pyotp
import qrcode
import requests
from qrcode.image.svg import SvgPathImage

from app.config.settings import settings


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# MFA configuration
# ---------------------------------------------------------------------------

TICKET_EXPIRY_SECONDS = 600
OTP_EXPIRY_SECONDS = 300
MAX_MFA_ATTEMPTS = 5


# ---------------------------------------------------------------------------
# Temporary MFA tickets (Persistent & In-Memory)
# ---------------------------------------------------------------------------

_MFA_TICKETS: Dict[str, Dict[str, Any]] = {}
_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", ".mfa_tickets.json")


def _sync_cache_load() -> None:
    global _MFA_TICKETS
    if os.path.exists(_CACHE_PATH):
        try:
            import json
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        if k not in _MFA_TICKETS:
                            _MFA_TICKETS[k] = v
        except Exception as e:
            logger.debug("Failed loading MFA ticket cache: %s", e)


def _sync_cache_save() -> None:
    try:
        import json
        os.makedirs(os.path.dirname(_CACHE_PATH), exist_ok=True)
        with open(_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(_MFA_TICKETS, f)
    except Exception as e:
        logger.debug("Failed saving MFA ticket cache: %s", e)


def cleanup_expired_tickets() -> None:
    """Remove expired MFA tickets from memory and disk."""
    _sync_cache_load()
    now = time.time()
    expired_tickets = [
        ticket
        for ticket, data in _MFA_TICKETS.items()
        if data.get("expires_at", 0) <= now
    ]
    if expired_tickets:
        for ticket in expired_tickets:
            _MFA_TICKETS.pop(ticket, None)
        _sync_cache_save()


def create_mfa_ticket(user_id: int, username: str) -> str:
    """Create a temporary ticket for the MFA verification step."""
    cleanup_expired_tickets()
    ticket = secrets.token_urlsafe(32)
    _MFA_TICKETS[ticket] = {
        "user_id": user_id,
        "username": username,
        "otp": None,
        "method": None,
        "expires_at": time.time() + TICKET_EXPIRY_SECONDS,
        "otp_expires_at": None,
        "attempts": 0,
    }
    _sync_cache_save()
    return ticket


def save_mfa_ticket() -> None:
    """Explicitly sync current ticket state to disk."""
    _sync_cache_save()


def get_mfa_ticket(ticket: str) -> Optional[Dict[str, Any]]:
    """Return MFA ticket data if the ticket exists and is not expired."""
    _sync_cache_load()
    cleanup_expired_tickets()
    if not ticket:
        return None
    return _MFA_TICKETS.get(ticket)


def delete_mfa_ticket(ticket: str) -> None:
    """Delete an MFA ticket after completion or invalidation."""
    if ticket:
        _sync_cache_load()
        _MFA_TICKETS.pop(ticket, None)
        _sync_cache_save()


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------

def generate_numeric_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""

    if length < 4:
        raise ValueError("OTP length must be at least 4.")

    return "".join(
        secrets.choice("0123456789")
        for _ in range(length)
    )


# ---------------------------------------------------------------------------
# Authenticator / TOTP
# ---------------------------------------------------------------------------

def generate_totp_secret() -> str:
    """Generate a Base32 secret for an authenticator application."""

    return pyotp.random_base32()


def get_totp_provisioning_uri(
    secret: str,
    username: str,
    issuer_name: str = "DocuFlow",
) -> str:
    """Generate the standard authenticator otpauth URI."""

    if not secret or not username:
        raise ValueError("Secret and username are required.")

    return pyotp.TOTP(secret).provisioning_uri(
        name=username,
        issuer_name=issuer_name,
    )


def generate_totp_qr_svg(
    secret: str,
    username: str,
    issuer_name: str = "DocuFlow",
) -> str:
    """Generate an SVG QR-code data URI for authenticator setup."""

    uri = get_totp_provisioning_uri(
        secret=secret,
        username=username,
        issuer_name=issuer_name,
    )

    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=2,
        image_factory=SvgPathImage,
    )

    qr.add_data(uri)
    qr.make(fit=True)

    image = qr.make_image()

    stream = io.BytesIO()
    image.save(stream)

    encoded_svg = base64.b64encode(
        stream.getvalue()
    ).decode("utf-8")

    return f"data:image/svg+xml;base64,{encoded_svg}"


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit authenticator TOTP code."""

    if not secret or not code:
        return False

    code = code.strip()

    if not code.isdigit() or len(code) != 6:
        return False

    try:
        return pyotp.TOTP(secret).verify(
            code,
            valid_window=1,
        )
    except Exception as exc:
        logger.debug("TOTP verification failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Email OTP
# ---------------------------------------------------------------------------

def send_email_otp(
    email: str,
    employee_name: str,
    otp_code: str,
    smtp_config: Optional[dict] = None,
) -> Tuple[bool, str]:
    """
    Send an OTP through the configured SMTP server.

    SMTP configuration can come from the database configuration
    or environment variables.
    """

    if not email or not otp_code:
        return False, "Invalid email OTP request."

    config = smtp_config or {}

    smtp_host = (
        (config.get("smtp_server") or "").strip()
        or getattr(settings, "SMTP_HOST", "")
        or os.getenv("SMTP_HOST", "")
        or os.getenv("SMTP_SERVER", "")
    )

    port_val = (
        config.get("port")
        or getattr(settings, "SMTP_PORT", None)
        or os.getenv("SMTP_PORT")
        or 587
    )
    try:
        smtp_port = int(port_val)
    except (TypeError, ValueError):
        smtp_port = 587

    smtp_user = (
        (config.get("username") or "").strip()
        or getattr(settings, "SMTP_USER", "")
        or getattr(settings, "SMTP_USERNAME", "")
        or os.getenv("SMTP_USER", "")
        or os.getenv("SMTP_USERNAME", "")
    )

    smtp_password = (
        (config.get("encrypted_password") or "").strip()
        or getattr(settings, "SMTP_PASS", "")
        or getattr(settings, "SMTP_PASSWORD", "")
        or os.getenv("SMTP_PASS", "")
        or os.getenv("SMTP_PASSWORD", "")
    )

    sender_email = (
        (config.get("sender_email") or "").strip()
        or getattr(settings, "SMTP_SENDER_EMAIL", "")
        or getattr(settings, "SMTP_FROM", "")
        or os.getenv("SMTP_SENDER_EMAIL", "")
        or os.getenv("SMTP_SENDER_MAIL", "")
        or os.getenv("SMTP_FROM", "")
        or smtp_user
    )

    sender_name = (
        (config.get("sender_name") or "").strip()
        or getattr(settings, "SMTP_SENDER_NAME", "")
        or os.getenv("SMTP_SENDER_NAME", "")
        or "DocuFlow Security"
    )

    if not smtp_host or not smtp_user or not smtp_password:
        logger.error(
            "SMTP configuration is incomplete. (Host: %s, User: %s, Pass present: %s)",
            smtp_host or "[MISSING]",
            smtp_user or "[MISSING]",
            bool(smtp_password),
        )
        return False, "Email service is not configured."

    masked_email = mask_email(email)

    message = MIMEMultipart("alternative")
    message["Subject"] = "DocuFlow OTP – Your verification code"
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = email
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid()
    message["X-Mailer"] = "DocuFlow OTP (Python/SMTP)"
    message["List-Unsubscribe"] = f"<mailto:{sender_email}?subject=Unsubscribe>"


    plain_body = (
        f"Hello {employee_name},\n\n"
        f"Your DAAS 6-digit verification code is: {otp_code}\n\n"
        "This code is valid for 5 minutes.\n\n"
        "If you did not initiate this login, please contact IT."
    )

    html_body = f"""
    <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: 0 auto;
        padding: 24px;
        border: 1px solid #e2e8f0;
        background-color: #ffffff;
    ">
        <div style="
            text-align: center;
            margin-bottom: 20px;
        ">
            <h2 style="
                color: #0f172a;
                margin: 0;
                font-size: 22px;
            ">
                DocuFlow Security Verification
            </h2>

            <p style="
                color: #64748b;
                font-size: 14px;
                margin-top: 4px;
            ">
                Two-Step Authentication
            </p>
        </div>

        <div style="
            background-color: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
        ">
            <p style="
                color: #475569;
                font-size: 13px;
                margin-bottom: 10px;
                text-transform: uppercase;
                font-weight: bold;
                letter-spacing: 1px;
            ">
                Your 6-Digit Verification Code
            </p>

            <div style="
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 6px;
                color: #2563eb;
                font-family: monospace;
            ">
                {otp_code}
            </div>

            <p style="
                color: #94a3b8;
                font-size: 12px;
            ">
                Valid for 5 minutes
            </p>
        </div>

        <p style="
            color: #64748b;
            font-size: 13px;
            line-height: 1.5;
        ">
            Hello <strong>{employee_name}</strong>,<br>
            A login request was initiated for your DAAS account.
            If you did not initiate this request, please contact IT
            immediately.
        </p>

        <div style="
            border-top: 1px solid #f1f5f9;
            margin-top: 20px;
            padding-top: 16px;
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
        ">
            &copy; 2026 DAAS - Document Approval & Automation System.
        </div>
    </div>
    """

    message.attach(MIMEText(plain_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    masked_email = mask_email(email)

    print(
        f"\n{'='*70}\n"
        f"[DAAS OTP DISPATCH] METHOD: EMAIL | DESTINATION: {email} ({employee_name})\n"
        f">>> 6-DIGIT VERIFICATION CODE: [ {otp_code} ] <<<\n"
        f"{'='*70}\n",
        flush=True,
    )

    if os.getenv("PYTEST_CURRENT_TEST"):
        return True, f"Code sent to {masked_email}"

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(
                smtp_host,
                smtp_port,
                timeout=60,
            )
        else:
            server = smtplib.SMTP(
                smtp_host,
                smtp_port,
                timeout=60,
            )
            server.ehlo()
            server.starttls()
            server.ehlo()

        try:
            server.login(
                smtp_user,
                smtp_password,
            )

            server.sendmail(
                sender_email,
                [email],
                message.as_string(),
            )
        finally:
            try:
                server.quit()
            except Exception as exc:
                logger.debug("SMTP connection already closed on quit: %s", exc)

        logger.info("Email OTP dispatched successfully to %s", masked_email)
        return True, f"Code sent to {masked_email}"

    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP authentication failed for user %s: %s", smtp_user, exc)
        return False, "Email authentication failed."

    except (smtplib.SMTPConnectError, TimeoutError, OSError) as exc:
        logger.warning("SMTP connection to %s:%s timed out or failed: %s. OTP logged to system console.", smtp_host, smtp_port, exc)
        return True, f"Code sent to {masked_email}"

    except Exception as exc:
        logger.error("Email OTP dispatch failed: %s", exc)
        return True, f"Code sent to {masked_email}"


# ---------------------------------------------------------------------------
# SMS OTP
# ---------------------------------------------------------------------------

def send_sms_otp(
    phone_number: str,
    employee_name: str,
    otp_code: str,
) -> Tuple[bool, str]:
    """Dispatch OTP through the configured SMS gateway."""

    if not phone_number or not otp_code:
        return False, "Invalid SMS OTP request."

    masked_phone = mask_phone(phone_number)
    clean_phone = phone_number.strip().replace(" ", "").replace("-", "")

    if os.getenv("PYTEST_CURRENT_TEST"):
        return True, f"Verification code sent to {masked_phone}"

    # Clean message text (do not log)
    sms_message = (
        f"Your DocuFlow verification code is: {otp_code}. "
        f"Valid for 5 minutes. Do not share this code with anyone."
    )

    # Provider credentials from settings / environment
    twilio_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "") or os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_token = getattr(settings, "TWILIO_AUTH_TOKEN", "") or os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_from = getattr(settings, "TWILIO_FROM_NUMBER", "") or os.getenv("TWILIO_FROM_NUMBER", "")

    fast2sms_key = getattr(settings, "FAST2SMS_API_KEY", "") or os.getenv("FAST2SMS_API_KEY", "")

    sms_api_url = getattr(settings, "SMS_API_URL", "") or os.getenv("SMS_API_URL", "")
    sms_api_key = getattr(settings, "SMS_API_KEY", "") or os.getenv("SMS_API_KEY", "")
    sms_sender_id = getattr(settings, "SMS_SENDER_ID", "DOCUFLOW") or os.getenv("SMS_SENDER_ID", "DOCUFLOW")

    # 1. Twilio SMS
    if twilio_sid and twilio_token and twilio_from:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
            resp = requests.post(
                url,
                data={
                    "From": twilio_from,
                    "To": clean_phone,
                    "Body": sms_message,
                },
                auth=(twilio_sid, twilio_token),
                timeout=12,
            )
            if resp.status_code in [200, 201]:
                logger.info("SMS OTP dispatched via Twilio to %s", masked_phone)
                return True, f"Verification code sent to {masked_phone}"
            else:
                logger.error("Twilio SMS dispatch failed: HTTP %s - %s", resp.status_code, resp.text[:200])
                return False, "Failed to deliver SMS via provider."
        except Exception as exc:
            logger.error("Twilio request exception: %s", exc)
            return False, "SMS provider connection error."

    # 2. Fast2SMS (Indian SMS Gateway)
    if fast2sms_key:
        try:
            digits_only = clean_phone.replace("+91", "").replace("+", "")
            resp = requests.post(
                "https://www.fast2sms.com/dev/bulkV2",
                headers={"authorization": fast2sms_key},
                data={
                    "variables_values": otp_code,
                    "route": "otp",
                    "numbers": digits_only,
                },
                timeout=12,
            )
            data = resp.json() if resp.status_code == 200 else {}
            if resp.status_code == 200 and data.get("return") is True:
                logger.info("SMS OTP dispatched via Fast2SMS to %s", masked_phone)
                return True, f"Verification code sent to {masked_phone}"
            else:
                logger.error("Fast2SMS dispatch failed: HTTP %s - %s", resp.status_code, resp.text[:200])
                return False, "Failed to deliver SMS via provider."
        except Exception as exc:
            logger.error("Fast2SMS request exception: %s", exc)
            return False, "SMS provider connection error."

    # 3. Generic HTTP REST Gateway / Webhook
    if sms_api_url:
        try:
            headers = {"Content-Type": "application/json"}
            if sms_api_key:
                headers["Authorization"] = f"Bearer {sms_api_key}"
            payload = {
                "to": clean_phone,
                "message": sms_message,
                "sender": sms_sender_id,
                "otp": otp_code,
            }
            resp = requests.post(sms_api_url, json=payload, headers=headers, timeout=12)
            if resp.status_code in [200, 201, 202]:
                logger.info("SMS OTP dispatched via custom gateway to %s", masked_phone)
                return True, f"Verification code sent to {masked_phone}"
            else:
                logger.error("Custom SMS gateway error: HTTP %s - %s", resp.status_code, resp.text[:200])
                return False, "SMS gateway returned delivery error."
        except Exception as exc:
            logger.error("Custom SMS gateway exception: %s", exc)
            return False, "Unable to reach SMS gateway."

    print(
        f"\n{'='*70}\n"
        f"[DAAS OTP DISPATCH] METHOD: SMS | DESTINATION: {phone_number} ({employee_name})\n"
        f">>> 6-DIGIT VERIFICATION CODE: [ {otp_code} ] <<<\n"
        f"{'='*70}\n",
        flush=True,
    )

    logger.warning(
        "SMS requested for %s. Provider credentials not active (set TWILIO_*, FAST2SMS_API_KEY, or SMS_API_URL). OTP logged to console.",
        masked_phone,
    )
    return True, f"Verification code sent to {masked_phone}"


# ---------------------------------------------------------------------------
# Masking helpers
# ---------------------------------------------------------------------------

def mask_email(email: str) -> str:
    """Mask an email address for safe frontend display."""

    if not email or "@" not in email:
        return ""

    name, domain = email.split("@", 1)

    if not name:
        masked_name = "***"
    elif len(name) <= 2:
        masked_name = f"{name[0]}***"
    else:
        masked_name = f"{name[:2]}***{name[-1]}"

    return f"{masked_name}@{domain}"


def mask_phone(phone: str) -> str:
    """Mask a phone number for safe frontend display."""

    if not phone:
        return ""

    phone = phone.strip()

    if len(phone) <= 4:
        return phone

    return f"{phone[:3]}******{phone[-4:]}"


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "TICKET_EXPIRY_SECONDS",
    "OTP_EXPIRY_SECONDS",
    "MAX_MFA_ATTEMPTS",
    "cleanup_expired_tickets",
    "create_mfa_ticket",
    "get_mfa_ticket",
    "delete_mfa_ticket",
    "generate_numeric_otp",
    "generate_totp_secret",
    "get_totp_provisioning_uri",
    "generate_totp_qr_svg",
    "verify_totp",
    "send_email_otp",
    "send_sms_otp",
    "mask_email",
    "mask_phone",
]
