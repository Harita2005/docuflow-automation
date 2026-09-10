import datetime
import bcrypt
from sqlalchemy.orm import Session
from app.database.models import OTPVerification


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""
    import secrets
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


def store_otp(db: Session, user_id: int, otp_hash: str, expires_at: datetime.datetime) -> OTPVerification:
    """Create and persist an OTPVerification record."""
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
    """Retrieve a non‑used, non‑expired OTP for a user, if any."""
    now = datetime.datetime.utcnow()
    return (
        db.query(OTPVerification)
        .filter(
            OTPVerification.user_id == user_id,
            OTPVerification.is_used == False,
            OTPVerification.expires_at > now,
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

def increment_otp_attempts(db: Session, otp_entry: OTPVerification) -> None:
    """Increment verification attempt counter."""
    otp_entry.attempts += 1
    db.add(otp_entry)
    db.commit()
