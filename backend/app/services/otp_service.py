import datetime
import bcrypt
import secrets
from typing import Optional
from sqlalchemy.orm import Session
from app.database.models import OTPVerification

MAX_OTP_ATTEMPTS = 5
OTP_EXPIRY_MINUTES = 5


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""
    if length < 4:
        raise ValueError("OTP length must be at least 4")
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(otp: str) -> str:
    """Hash an OTP using bcrypt (same as password hashing)."""
    return bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_hashed_otp(plain_otp: str, hashed: str) -> bool:
    """Verify a plain OTP against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_otp.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def invalidate_previous_otps(db: Session, user_id: int) -> None:
    """Invalidate all previously issued, active OTPs for the user."""
    now = datetime.datetime.utcnow()
    db.query(OTPVerification).filter(
        OTPVerification.user_id == user_id,
        OTPVerification.is_used == False,
    ).update(
        {
            OTPVerification.is_used: True,
            OTPVerification.used_at: now,
        },
        synchronize_session=False,
    )
    db.commit()


def store_otp(
    db: Session,
    user_id: int,
    otp_hash: str,
    expires_at: Optional[datetime.datetime] = None,
) -> OTPVerification:
    """Create and persist an OTPVerification record, invalidating prior active codes."""
    invalidate_previous_otps(db, user_id)
    if expires_at is None:
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=OTP_EXPIRY_MINUTES)
    otp_entry = OTPVerification(
        user_id=user_id,
        otp_hash=otp_hash,
        expires_at=expires_at,
        created_at=datetime.datetime.utcnow(),
        attempts=0,
        is_used=False,
    )
    db.add(otp_entry)
    db.commit()
    db.refresh(otp_entry)
    return otp_entry


def get_valid_otp(db: Session, user_id: int) -> OTPVerification | None:
    """Retrieve a non-used, non-expired OTP for a user with fewer than MAX attempts."""
    now = datetime.datetime.utcnow()
    return (
        db.query(OTPVerification)
        .filter(
            OTPVerification.user_id == user_id,
            OTPVerification.is_used == False,
            OTPVerification.expires_at > now,
            OTPVerification.attempts < MAX_OTP_ATTEMPTS,
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )


def mark_otp_used(db: Session, otp_entry: OTPVerification) -> None:
    """Mark an OTP as used and set timestamps."""
    otp_entry.is_used = True
    otp_entry.used_at = datetime.datetime.utcnow()
    db.add(otp_entry)
    db.commit()


def increment_otp_attempts(db: Session, otp_entry: OTPVerification) -> int:
    """Increment verification attempt counter and lock out if max attempts reached."""
    otp_entry.attempts += 1
    if otp_entry.attempts >= MAX_OTP_ATTEMPTS:
        otp_entry.is_used = True
        otp_entry.used_at = datetime.datetime.utcnow()
    db.add(otp_entry)
    db.commit()
    db.refresh(otp_entry)
    return otp_entry.attempts

