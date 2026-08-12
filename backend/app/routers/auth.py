from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse
from app.auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    ident = request.username or request.identifier or request.email
    if not ident:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username or employee ID required"
        )

    ident_str = ident.strip()
    user = db.query(User).filter(
        (User.username.ilike(ident_str)) | 
        (User.email.ilike(ident_str)) |
        (User.employee_id.ilike(ident_str)) |
        (User.user_uid.ilike(ident_str))
    ).first()

    # Smart fallback: if user typed just the number (e.g. 16220 or 8349) or name (e.g. Nathiya)
    if not user:
        user = db.query(User).filter(
            (User.employee_id.ilike(f"%_{ident_str}")) |
            (User.employee_id.ilike(f"%{ident_str}%")) |
            (User.username.ilike(f"%{ident_str}%")) |
            (User.name.ilike(f"%{ident_str}%"))
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User '{ident_str}' not found in system."
        )

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again."
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
