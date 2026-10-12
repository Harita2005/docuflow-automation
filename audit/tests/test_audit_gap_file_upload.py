import pytest
from fastapi import HTTPException
from app.services.file_security import (
    get_safe_file_path,
    detect_file_type_and_validate_magic,
    sanitize_filename,
)


def test_magic_bytes_detection_valid():
    """Verify correct validation for valid PDF, PNG, and JPEG magic bytes."""
    pdf_bytes = b"%PDF-1.4 test content"
    assert detect_file_type_and_validate_magic(pdf_bytes) == "pdf"

    png_bytes = b"\x89PNG\r\n\x1a\n test png"
    assert detect_file_type_and_validate_magic(png_bytes) == "png"

    jpeg_bytes = b"\xff\xd8\xff\xe0 test jpg"
    assert detect_file_type_and_validate_magic(jpeg_bytes) == "jpeg"


def test_magic_bytes_detection_invalid_rejects():
    """Verify corrupted or spoofed magic bytes are rejected with 400 Bad Request."""
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00 executable disguised as pdf"
    with pytest.raises(HTTPException) as exc:
        detect_file_type_and_validate_magic(fake_exe)
    assert exc.value.status_code == 400
    assert "Invalid file format" in exc.value.detail


def test_double_extension_and_null_byte_sanitization():
    """Verify double extensions and null bytes are sanitized."""
    cleaned = sanitize_filename("invoice.pdf.exe")
    assert not cleaned.endswith(".exe")

    cleaned_null = sanitize_filename("invoice.pdf\x00.exe")
    assert "\x00" not in cleaned_null


def test_path_traversal_detection_in_get_safe_file_path():
    """Verify directory traversal attempts are blocked with 403."""
    traversal_paths = [
        "../../etc/passwd",
        "..\\..\\windows\\system32\\cmd.exe",
        "uploads/../../secret.txt",
        ".env",
        ".hidden_file",
    ]
    for p in traversal_paths:
        with pytest.raises(HTTPException) as exc:
            get_safe_file_path(p)
        assert exc.value.status_code == 403
        assert "Access Denied" in exc.value.detail
