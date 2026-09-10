
import base64
import io
import logging
import os
from email.utils import formatdate, make_msgid
import secrets
import smtplib
import socket
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, Optional, Tuple

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# MFA configuration
# ---------------------------------------------------------------------------

TICKET_EXPIRY_SECONDS = 600
OTP_EXPIRY_SECONDS = 300
MAX_MFA_ATTEMPTS = 5


# ---------------------------------------------------------------------------
# Temporary MFA tickets
# ---------------------------------------------------------------------------

_MFA_TICKETS: Dict[str, Dict[str, Any]] = {}


def cleanup_expired_tickets() -> None:
    """Remove expired MFA tickets from memory."""

    now = time.time()

    expired_tickets = [
        ticket
        for ticket, data in _MFA_TICKETS.items()
        if data.get("expires_at", 0) <= now
    ]

    for ticket in expired_tickets:
        _MFA_TICKETS.pop(ticket, None)


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

    return ticket


def get_mfa_ticket(ticket: str) -> Optional[Dict[str, Any]]:
    """Return MFA ticket data if the ticket exists and is not expired."""

    cleanup_expired_tickets()

    if not ticket:
        return None

    return _MFA_TICKETS.get(ticket)


def delete_mfa_ticket(ticket: str) -> None:
    """Delete an MFA ticket after completion or invalidation."""

    if ticket:
        _MFA_TICKETS.pop(ticket, None)


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
        config.get("smtp_server")
        or os.getenv("SMTP_HOST")
    )

    smtp_port = int(
        config.get("port")
        or os.getenv("SMTP_PORT", "587")
    )

    smtp_user = (
        config.get("username")
        or os.getenv("SMTP_USER")
    )

    smtp_password = (
        config.get("encrypted_password")
        or os.getenv("SMTP_PASS")
    )

    sender_email = (
        config.get("sender_email")
        or os.getenv("SMTP_SENDER_EMAIL")
        or smtp_user
    )

    sender_name = (
        config.get("sender_name")
        or os.getenv("SMTP_SENDER_NAME")
        or "DocuFlow Security"
    )

    if not smtp_host or not smtp_user or not smtp_password:
        logger.error("SMTP configuration is incomplete.")
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

    try:
        try:
            smtp_host_resolved = socket.gethostbyname(smtp_host)
        except socket.gaierror:
            smtp_host_resolved = smtp_host

        if smtp_port == 465:
            server = smtplib.SMTP_SSL(
                smtp_host_resolved,
                smtp_port,
                timeout=10,
            )
        else:
            server = smtplib.SMTP(
                smtp_host_resolved,
                smtp_port,
                timeout=10,
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
            server.quit()

        logger.info("Email OTP sent to %s", masked_email)

        return True, f"Code sent to {masked_email}"

    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP authentication failed: %s", exc)
        return False, "Email authentication failed."

    except smtplib.SMTPConnectError as exc:
        logger.error("SMTP connection failed: %s", exc)
        return False, "Unable to connect to email service."

    except Exception as exc:
        logger.error("Email OTP dispatch failed: %s", exc)
        return False, "Unable to send email OTP."


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

    logger.info(
        "SMS OTP requested for %s",
        masked_phone,
    )

    # Connect the actual SMS provider here.
    # Do not report success until the provider confirms delivery.

    return False, "SMS service is not configured."


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
