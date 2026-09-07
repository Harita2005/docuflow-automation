import io
import logging
import fitz
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)
try:
    from PIL import Image
    HAS_PIL = True
except ImportError as exc:
    logger.debug('Handled exception: %s', exc)

def compress_pdf(file_path: Path, target_max_bytes: int=3 * 1024 * 1024, jpeg_quality: int=70) -> Tuple[bool, int, int]:
    """
    Automated High-Performance PDF Compressor Service.
    Compresses PDF streams and embedded scanned images using PyMuPDF and Pillow.
    
    Returns:
        (was_compressed: bool, original_size_bytes: int, compressed_size_bytes: int)
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return (False, 0, 0)
    original_size = file_path.stat().st_size
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        logger.debug('Handled exception: %s', e)
        return (False, original_size, original_size)
    temp_compressed_path = file_path.with_suffix('.tmp.pdf')
    try:
        doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
        deflated_size = temp_compressed_path.stat().st_size
        doc.close()
        if deflated_size < original_size * 0.95:
            temp_compressed_path.replace(file_path)
            new_size = file_path.stat().st_size
            print(f'[PDF Compressor] Lossless Compress: {file_path.name} ({original_size / 1024:.1f}KB -> {new_size / 1024:.1f}KB)')
            return (True, original_size, new_size)
        if not HAS_PIL:
            return (True, original_size, deflated_size)
        print(f"[PDF Compressor] Resampling scanned images for '{file_path.name}' ({original_size / 1024 / 1024:.2f}MB)...")
        doc = fitz.open(file_path)
        for page_index in range(len(doc)):
            page = doc[page_index]
            image_list = page.get_images(full=True)
            for img_info in image_list:
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image['image']
                    base_image['ext']
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    max_dim = 2000
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
                    logger.debug('Handled exception: %s', exc)
                    continue
        doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
        doc.close()
        resampled_size = temp_compressed_path.stat().st_size
        if resampled_size < original_size:
            temp_compressed_path.replace(file_path)
            new_size = file_path.stat().st_size
            print(f'[PDF Compressor SUCCESS] {file_path.name}: {original_size / 1024 / 1024:.2f}MB -> {new_size / 1024 / 1024:.2f}MB')
            return (True, original_size, new_size)
        else:
            if temp_compressed_path.exists():
                temp_compressed_path.unlink()
            return (False, original_size, original_size)
    except Exception as err:
        logger.debug('Handled exception: %s', err)
        return (False, original_size, original_size)