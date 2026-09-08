import pytest
from fastapi import HTTPException, UploadFile
from io import BytesIO
from app.services.file_security import validate_uploaded_file, get_safe_file_path, MAX_FILE_SIZE_BYTES

def test_file_size_limit():
    # File larger than 25MB must be rejected with 413
    oversized_bytes = b'%PDF-' + b'0' * (MAX_FILE_SIZE_BYTES + 10)
    upload = UploadFile(filename='large.pdf', file=BytesIO(oversized_bytes))
    
    with pytest.raises(HTTPException) as exc:
        validate_uploaded_file(upload, oversized_bytes)
    assert exc.value.status_code == 413
    assert 'Payload Too Large' in exc.value.detail

def test_invalid_extension_rejected():
    content = b'%PDF-1.4 valid content'
    upload = UploadFile(filename='script.exe', file=BytesIO(content))
    with pytest.raises(HTTPException) as exc:
        validate_uploaded_file(upload, content)
    assert exc.value.status_code == 400
    assert 'Unsupported file extension' in exc.value.detail

def test_magic_bytes_validation():
    # File named .pdf but containing plain text or random binary headers
    content = b'This is NOT a pdf file header'
    upload = UploadFile(filename='invoice.pdf', file=BytesIO(content))
    with pytest.raises(HTTPException) as exc:
        validate_uploaded_file(upload, content)
    assert exc.value.status_code == 400
    assert 'Invalid file format' in exc.value.detail

def test_pdf_embedded_script_rejected():
    # PDF containing embedded /JavaScript or /Launch actions
    content = b'%PDF-1.4 /Type /Action /S /JavaScript /JS (app.alert(1));'
    upload = UploadFile(filename='malicious.pdf', file=BytesIO(content))
    with pytest.raises(HTTPException) as exc:
        validate_uploaded_file(upload, content)
    assert exc.value.status_code == 400
    assert 'prohibited active scripts' in exc.value.detail

def test_path_traversal_protection():
    # Attempting to access files outside upload/storage dir
    with pytest.raises(HTTPException) as exc1:
        get_safe_file_path('../../Windows/System32/cmd.exe')
    assert exc1.value.status_code in [400, 403]

    with pytest.raises(HTTPException) as exc2:
        get_safe_file_path('/etc/passwd')
    assert exc2.value.status_code in [400, 403]
