import os
import io
import fitz  # PyMuPDF
from PIL import Image
from pathlib import Path
from typing import Tuple

def compress_pdf(
    file_path: Path,
    target_max_bytes: int = 3 * 1024 * 1024,  # 3 MB threshold
    jpeg_quality: int = 70
) -> Tuple[bool, int, int]:
    """
    Automated High-Performance PDF Compressor Service.
    Compresses PDF streams and embedded scanned images using PyMuPDF and Pillow.
    
    Returns:
        (was_compressed: bool, original_size_bytes: int, compressed_size_bytes: int)
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return False, 0, 0

    original_size = file_path.stat().st_size
    
    # If already smaller than target_max_bytes, attempt lossless deflate pass
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        print(f"[PDF Compressor Warning] Cannot open PDF '{file_path.name}': {e}")
        return False, original_size, original_size

    temp_compressed_path = file_path.with_suffix(".tmp.pdf")

    try:
        # Step 1: Attempt fast stream & font compression (Lossless)
        doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
        deflated_size = temp_compressed_path.stat().st_size

        doc.close()
        if deflated_size < original_size * 0.95:
            temp_compressed_path.replace(file_path)
            new_size = file_path.stat().st_size
            print(f"[PDF Compressor] Lossless Compress: {file_path.name} ({original_size/1024:.1f}KB ➔ {new_size/1024:.1f}KB)")
            return True, original_size, new_size

        # Step 2: If still large, perform Image Stream Resampling & Re-compression (Lossy Scan Optimization)
        print(f"[PDF Compressor] Resampling scanned images for '{file_path.name}' ({original_size/1024/1024:.2f}MB)...")
        doc = fitz.open(file_path)
        
        for page_index in range(len(doc)):
            page = doc[page_index]
            image_list = page.get_images(full=True)

            for img_info in image_list:
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]

                    # Convert to PIL Image for compression
                    pil_img = Image.open(io.BytesIO(image_bytes))

                    # Resize if extremely large (> 2000px width/height)
                    max_dim = 2000
                    if pil_img.width > max_dim or pil_img.height > max_dim:
                        pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                    if pil_img.mode in ("RGBA", "P"):
                        pil_img = pil_img.convert("RGB")

                    output_buffer = io.BytesIO()
                    pil_img.save(output_buffer, format="JPEG", quality=jpeg_quality, optimize=True)
                    compressed_img_bytes = output_buffer.getvalue()

                    # Only replace if compressed version is smaller
                    if len(compressed_img_bytes) < len(image_bytes):
                        doc.update_stream(xref, compressed_img_bytes)
                except Exception as img_err:
                    continue

        doc.save(str(temp_compressed_path), garbage=4, deflate=True, clean=True)
        doc.close()

        resampled_size = temp_compressed_path.stat().st_size
        if resampled_size < original_size:
            temp_compressed_path.replace(file_path)
            new_size = file_path.stat().st_size
            print(f"[PDF Compressor SUCCESS] {file_path.name}: {original_size/1024/1024:.2f}MB ➔ {new_size/1024/1024:.2f}MB")
            return True, original_size, new_size
        else:
            if temp_compressed_path.exists():
                temp_compressed_path.unlink()
            return False, original_size, original_size

    except Exception as err:
        print(f"[PDF Compressor Error] Compression failed for {file_path.name}: {err}")
        if temp_compressed_path.exists():
            temp_compressed_path.unlink()
        return False, original_size, original_size
