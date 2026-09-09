import re
import uuid
import logging
from pathlib import Path
from typing import Tuple
from fastapi import HTTPException, UploadFile
from app.config.settings import settings

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB

ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg'}
MAGIC_BYTES = {
    'pdf': b'%PDF-',
    'png': b'\x89PNG\r\n\x1a\n',
    'jpeg': b'\xff\xd8\xff'
}

def sanitize_filename(filename: str) -> str:
    if not filename:
        return f'doc_{uuid.uuid4().hex[:8]}.pdf'
    raw = filename.replace('\x00', '').replace('/', '_').replace('\\', '_')
    no_path = re.sub(r'(\.\./|\.\.\\)', '', raw)
    clean = re.sub(r'[^a-zA-Z0-9_\.\-]', '_', no_path).lstrip('.')
    return clean or f'doc_{uuid.uuid4().hex[:8]}.pdf'

def detect_file_type_and_validate_magic(header: bytes) -> str:
    if header.startswith(MAGIC_BYTES['pdf']):
        return 'pdf'
    if header.startswith(MAGIC_BYTES['png']):
        return 'png'
    if header.startswith(MAGIC_BYTES['jpeg']):
        return 'jpeg'
    raise HTTPException(
        status_code=400,
        detail='Invalid file format: File header does not match accepted types (PDF, PNG, JPEG).'
    )

def check_pdf_safety(file_bytes: bytes):
    dangerous_patterns = [
        rb'/JavaScript\b',
        rb'/JS\b',
        rb'/Launch\b',
    ]
    for pattern in dangerous_patterns:
        if re.search(pattern, file_bytes, re.IGNORECASE):
            logger.warning(f'[Security] Rejected PDF with dangerous construct: {pattern}')
            raise HTTPException(
                status_code=400,
                detail='Security Violation: PDF contains prohibited active scripts or launch actions.'
            )

def validate_uploaded_file(file: UploadFile, content: bytes) -> Tuple[str, str]:
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f'Payload Too Large: Uploaded file size ({len(content) / (1024*1024):.1f}MB) exceeds the 25MB limit.'
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')

    orig_name = sanitize_filename(file.filename or '')
    ext = Path(orig_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f'Unsupported file extension \'{ext}\'. Allowed types: PDF, PNG, JPG, JPEG.'
        )

    detected_type = detect_file_type_and_validate_magic(content[:32])

    if detected_type == 'pdf':
        check_pdf_safety(content)

    safe_ext = '.pdf' if detected_type == 'pdf' else ('.png' if detected_type == 'png' else '.jpg')
    unique_filename = f'{uuid.uuid4().hex}_{orig_name}'
    if not unique_filename.endswith(safe_ext):
        unique_filename = f'{Path(unique_filename).stem}{safe_ext}'

    return unique_filename, detected_type

def get_safe_file_path(relative_or_abs_path: str) -> Path:
    raw_path_str = str(relative_or_abs_path).replace('\x00', '').strip()
    if not raw_path_str:
        raise HTTPException(status_code=400, detail='Invalid file path.')

    if '..' in raw_path_str:
        raise HTTPException(status_code=403, detail='Access Denied: Path traversal detected.')

    base_upload = settings.UPLOAD_DIR.resolve()
    base_pdf = settings.PDF_STORAGE_DIR.resolve()

    clean_path = raw_path_str
    if '/uploads/' in clean_path:
        clean_path = clean_path.split('/uploads/')[-1]
    elif '/stored_pdfs/' in clean_path:
        clean_path = clean_path.split('/stored_pdfs/')[-1]
    elif clean_path.startswith('/api/documents/') and clean_path.endswith('/file'):
        doc_id = clean_path.split('/api/documents/')[1].split('/file')[0]
        clean_path = f'{doc_id}.pdf'

    p = Path(clean_path)
    if p.is_absolute() or clean_path.startswith('/') or clean_path.startswith('\\') or p.drive:
        resolved_p = p.resolve()
        try:
            if resolved_p.is_relative_to(base_upload) or resolved_p.is_relative_to(base_pdf):
                return resolved_p
        except AttributeError:
            if str(resolved_p).startswith(str(base_upload)) or str(resolved_p).startswith(str(base_pdf)):
                return resolved_p
        raise HTTPException(status_code=403, detail='Access Denied: Path outside allowed directories.')

    clean_rel = clean_path.lstrip('/\\')
    target_path = (base_upload / clean_rel).resolve()
    target_pdf_path = (base_pdf / clean_rel).resolve()

    try:
        if target_path.is_relative_to(base_upload):
            if target_path.exists():
                return target_path
            if target_pdf_path.is_relative_to(base_pdf) and target_pdf_path.exists():
                return target_pdf_path
            return target_path
    except AttributeError:
        if str(target_path).startswith(str(base_upload)):
            return target_path

    raise HTTPException(status_code=403, detail='Access Denied: Path traversal detected or unauthorized file location.')
