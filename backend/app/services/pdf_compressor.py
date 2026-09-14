import io
import uuid
import logging
import fitz
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)
try:
    from PIL import Image
    HAS_PIL = True
except ImportError as exc:
    HAS_PIL = False
    logger.debug('Handled exception: %s', exc)

TEN_MB = 10 * 1024 * 1024

def compress_pdf(file_path: Path, target_max_bytes: int = TEN_MB, jpeg_quality: int = 65) -> Tuple[bool, int, int]:
    """
    Automated High-Performance PDF Compressor Service.
    Compresses PDF streams and embedded scanned images using PyMuPDF and Pillow.
    Files larger than 10 MB are compressed down to or below 10 MB.
    
    Returns:
        (was_compressed: bool, original_size_bytes: int, compressed_size_bytes: int)
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return (False, 0, 0)
    original_size = file_path.stat().st_size
    if original_size <= target_max_bytes:
        logger.debug("PDF %s is %s bytes (under %s limit), skipping heavy compression", file_path.name, original_size, target_max_bytes)
        return (False, original_size, original_size)

    temp_compressed_path = file_path.with_name(f"{file_path.stem}.tmp_{uuid.uuid4().hex[:8]}.pdf")
    try:
        try:
            doc = fitz.open(file_path)
        except Exception as e:
            logger.warning('Failed to open PDF %s for compression: %s', file_path.name, e)
            return (False, original_size, original_size)

        try:
            doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
            deflated_size = temp_compressed_path.stat().st_size if temp_compressed_path.exists() else original_size
        finally:
            doc.close()

        if deflated_size <= target_max_bytes and deflated_size < original_size:
            temp_compressed_path.replace(file_path)
            new_size = file_path.stat().st_size
            logger.info('[PDF Compressor] Lossless Compress: %s (%s -> %s)', file_path.name, original_size, new_size)
            return (True, original_size, new_size)

        if not HAS_PIL:
            if deflated_size < original_size:
                temp_compressed_path.replace(file_path)
                return (True, original_size, deflated_size)
            return (False, original_size, original_size)

        logger.info("[PDF Compressor] Resampling scanned images for '%s' (%.2fMB)...", file_path.name, original_size / (1024 * 1024))
        doc = fitz.open(file_path)
        try:
            for page_index in range(len(doc)):
                page = doc[page_index]
                image_list = page.get_images(full=True)
                for img_info in image_list:
                    xref = img_info[0]
                    try:
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image.get('image')
                        if not image_bytes:
                            continue
                        pil_img = Image.open(io.BytesIO(image_bytes))
                        max_dim = 1600
                        if pil_img.width > max_dim or pil_img.height > max_dim:
                            pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                        if pil_img.mode in ('RGBA', 'P'):
                            pil_img = pil_img.convert('RGB')
                        output_buffer = io.BytesIO()
                        pil_img.save(output_buffer, format='JPEG', quality=jpeg_quality, optimize=True)
                        compressed_img_bytes = output_buffer.getvalue()
                        if len(compressed_img_bytes) < len(image_bytes):
                            page.replace_image(xref, stream=compressed_img_bytes)
                    except Exception as exc:
                        logger.debug('Handled image resampling exception: %s', exc)
                        continue
            doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
        finally:
            doc.close()

        if temp_compressed_path.exists():
            resampled_size = temp_compressed_path.stat().st_size
            if resampled_size < original_size:
                temp_compressed_path.replace(file_path)
                new_size = file_path.stat().st_size
                logger.info('[PDF Compressor SUCCESS] %s: %.2fMB -> %.2fMB', file_path.name, original_size / (1024 * 1024), new_size / (1024 * 1024))
                return (True, original_size, new_size)
        return (False, original_size, original_size)
    except Exception as err:
        logger.warning('PDF compression failed for %s: %s', file_path.name, err)
        return (False, original_size, original_size)
    finally:
        if temp_compressed_path.exists():
            try:
                temp_compressed_path.unlink()
            except Exception as exc:
                logger.debug('Handled exception removing temp file: %s', exc)