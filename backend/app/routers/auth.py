from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse
from app.auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.username == request.username) | (User.email == request.username)
    ).first()

    if not user:
        # Auto-create admin or test user if none exists in dev
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    access_token = create_access_token(data={"sub": user.username, "id": user.id, "role": user.role})
    
    # Log User Login Audit Entry
    try:
        from app.models import AuditLog
        db.add(AuditLog(
            invoice_id="AUTH_SESSION",
            user=user.employee_name or user.name or user.username,
            action="User Logged In",
            stage="Authentication",
            notes=f"User {user.employee_name} ({user.employee_id}) authenticated successfully with role '{user.role}'. MFA: {user.mfa_type}."
        ))
        db.commit()
    except Exception as e:
        print("Audit log error on login:", e)

    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.employee_name or user.name,
            "email": user.email,
            "role": user.role,
            "employee_id": user.employee_id
        }
    }

@router.post("/logout")
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user:
        try:
            from app.models import AuditLog
            db.add(AuditLog(
                invoice_id="AUTH_SESSION",
                user=current_user.employee_name or current_user.name or current_user.username,
                action="User Logged Out",
                stage="Authentication",
                notes=f"User {current_user.employee_name} ({current_user.employee_id}) session ended."
            ))
            db.commit()
        except Exception:
            pass
    return {"success": True, "message": "Logged out successfully"}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "id": current_user.id,
        "username": current_user.username,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "employee_id": current_user.employee_id
    }
