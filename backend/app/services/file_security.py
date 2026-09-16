import re
import uuid
import logging
from pathlib import Path
from typing import Tuple
from fastapi import HTTPException, UploadFile
from app.config.settings import settings

logger = logging.getLogger(__name__)

RAW_UPLOAD_MAX_BYTES = 35 * 1024 * 1024  # 35MB buffer for compression attempt
FINAL_MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024  # 10MB maximum accepted final PDF size
MAX_FILE_SIZE_BYTES = RAW_UPLOAD_MAX_BYTES

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
    if len(content) > RAW_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f'Payload Too Large: Uploaded file size ({len(content) / (1024*1024):.1f}MB) exceeds maximum allowable size for upload and compression.'
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
    raw_path_str = str(relative_or_abs_path).replace('\x00', '').strip().split('?')[0]
    if not raw_path_str:
        raise HTTPException(status_code=400, detail='Invalid file path.')

    if '..' in raw_path_str:
        raise HTTPException(status_code=403, detail='Access Denied: Path traversal detected.')

    base_upload = settings.UPLOAD_DIR.resolve()
    base_pdf = settings.PDF_STORAGE_DIR.resolve()
    base_approved = settings.APPROVED_PDF_DIR.resolve()
    base_rejected = (base_pdf / 'rejected').resolve()
    allowed_roots = [base_upload, base_pdf, base_approved, base_rejected]

    def _is_safe(path: Path) -> bool:
        resolved = path.resolve()
        for root in allowed_roots:
            try:
                if resolved.is_relative_to(root):
                    return True
            except AttributeError:
                if str(resolved).startswith(str(root)):
                    return True
        return False

    # 1. Check if it's already an absolute file path that exists on disk
    p = Path(raw_path_str)
    if p.is_absolute():
        try:
            if p.is_file() and _is_safe(p):
                return p.resolve()
        except Exception as exc:
            logger.debug('Absolute path verification failed: %s', exc)

    # 2. Extract base filename and relative segments
    norm_path = raw_path_str.replace('\\', '/')
    clean_path = norm_path
    if '/uploads/' in clean_path:
        clean_path = clean_path.split('/uploads/')[-1]
    elif clean_path.startswith('uploads/'):
        clean_path = clean_path.split('uploads/')[-1]
    elif '/stored_pdfs/' in clean_path:
        clean_path = clean_path.split('/stored_pdfs/')[-1]
    elif clean_path.startswith('stored_pdfs/'):
        clean_path = clean_path.split('stored_pdfs/')[-1]
    elif clean_path.startswith('/api/documents/') and clean_path.endswith('/file'):
        doc_id = clean_path.split('/api/documents/')[1].split('/file')[0]
        clean_path = f'{doc_id}.pdf'
    elif clean_path.startswith('/api/records/') and clean_path.endswith('/file'):
        doc_id = clean_path.split('/api/records/')[1].split('/file')[0]
        clean_path = f'{doc_id}.pdf'

    clean_rel = clean_path.lstrip('/\\')
    base_file_name = Path(clean_rel).name

    # 3. Check candidate paths across all valid storage directories
    candidates = [
        (base_upload / clean_rel).resolve(),
        (base_upload / base_file_name).resolve(),
        (base_approved / clean_rel).resolve(),
        (base_approved / base_file_name).resolve(),
        (base_pdf / clean_rel).resolve(),
        (base_pdf / base_file_name).resolve(),
        (base_rejected / base_file_name).resolve(),
    ]

    for cand in candidates:
        try:
            if cand.is_file() and _is_safe(cand):
                return cand
        except Exception:
            continue

    # 4. Fallback safe path inside base_upload (exists() will be False if file is missing)
    safe_fallback = (base_upload / base_file_name).resolve()
    if _is_safe(safe_fallback):
        return safe_fallback

    raise HTTPException(status_code=403, detail='Access Denied: Path traversal detected or unauthorized file location.')
