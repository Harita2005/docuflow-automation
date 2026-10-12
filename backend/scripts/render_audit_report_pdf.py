import fitz  # PyMuPDF
from pathlib import Path
import re

def render_markdown_to_pdf(md_path: Path, output_pdf_path: Path):
    with open(md_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    doc = fitz.open()
    
    PAGE_WIDTH = 595.32   # A4 standard
    PAGE_HEIGHT = 841.92  # A4 standard
    MARGIN_LEFT = 40
    MARGIN_RIGHT = 40
    MARGIN_TOP = 45
    MARGIN_BOTTOM = 45

    current_page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
    current_y = MARGIN_TOP

    def new_page():
        nonlocal current_page, current_y
        current_page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        current_y = MARGIN_TOP

    for raw_line in lines:
        line = raw_line.rstrip()

        # Handle page budget
        if current_y > PAGE_HEIGHT - MARGIN_BOTTOM - 20:
            new_page()

        if not line:
            current_y += 6
            continue

        # Header 1
        if line.startswith("# "):
            text = line[2:].strip()
            if current_y > MARGIN_TOP:
                current_y += 10
            if current_y > PAGE_HEIGHT - MARGIN_BOTTOM - 30:
                new_page()
            current_page.draw_rect(
                fitz.Rect(MARGIN_LEFT, current_y, PAGE_WIDTH - MARGIN_RIGHT, current_y + 24),
                color=(0.1, 0.2, 0.45),
                fill=(0.93, 0.95, 0.98),
            )
            current_page.insert_text(
                fitz.Point(MARGIN_LEFT + 8, current_y + 17),
                text,
                fontsize=13,
                fontname="helv",
                color=(0.1, 0.2, 0.45),
            )
            current_y += 32
            continue

        # Header 2
        if line.startswith("## "):
            text = line[3:].strip()
            if current_y > MARGIN_TOP:
                current_y += 8
            if current_y > PAGE_HEIGHT - MARGIN_BOTTOM - 24:
                new_page()
            current_page.insert_text(
                fitz.Point(MARGIN_LEFT, current_y + 12),
                text,
                fontsize=11,
                fontname="helv",
                color=(0.12, 0.24, 0.5),
            )
            current_page.draw_line(
                fitz.Point(MARGIN_LEFT, current_y + 15),
                fitz.Point(PAGE_WIDTH - MARGIN_RIGHT, current_y + 15),
                color=(0.75, 0.8, 0.88),
                width=0.8,
            )
            current_y += 22
            continue

        # Header 3
        if line.startswith("### "):
            text = line[4:].strip()
            if current_y > PAGE_HEIGHT - MARGIN_BOTTOM - 18:
                new_page()
            current_page.insert_text(
                fitz.Point(MARGIN_LEFT, current_y + 10),
                text,
                fontsize=9.5,
                fontname="helv",
                color=(0.15, 0.3, 0.6),
            )
            current_y += 16
            continue

        # Divider
        if line.strip() in ("---", "***"):
            current_page.draw_line(
                fitz.Point(MARGIN_LEFT, current_y + 3),
                fitz.Point(PAGE_WIDTH - MARGIN_RIGHT, current_y + 3),
                color=(0.85, 0.85, 0.85),
                width=0.5,
            )
            current_y += 8
            continue

        # Code block marker
        if line.startswith("```"):
            current_y += 4
            continue

        # Table rows or standard text
        is_bullet = line.startswith("- ") or line.startswith("* ") or bool(re.match(r"^\d+\.\s", line))
        is_table = line.startswith("|")

        clean_text = line
        if is_bullet:
            clean_text = "  • " + re.sub(r"^(\s*[-*]|\s*\d+\.)\s*", "", line)
        
        # Clean markdown bold/italics markers for clean plain PDF text
        clean_text = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean_text)
        clean_text = re.sub(r"`([^`]+)`", r"\1", clean_text)

        font_size = 7.5 if is_table else (8.0 if is_bullet else 8.5)
        text_color = (0.2, 0.2, 0.25) if is_table else (0.1, 0.1, 0.1)

        # Truncate text if excessively long for single line width
        max_chars = 110 if is_table else 95
        if len(clean_text) > max_chars:
            chunks = [clean_text[i:i+max_chars] for i in range(0, len(clean_text), max_chars)]
            for chunk in chunks:
                if current_y > PAGE_HEIGHT - MARGIN_BOTTOM - 12:
                    new_page()
                current_page.insert_text(
                    fitz.Point(MARGIN_LEFT + (8 if is_bullet else 0), current_y + 8),
                    chunk,
                    fontsize=font_size,
                    fontname="helv",
                    color=text_color,
                )
                current_y += 11
        else:
            current_page.insert_text(
                fitz.Point(MARGIN_LEFT + (8 if is_bullet else 0), current_y + 8),
                clean_text,
                fontsize=font_size,
                fontname="helv",
                color=text_color,
            )
            current_y += 11.5

    # Footer on all pages
    total_pages = len(doc)
    for idx, page in enumerate(doc):
        footer_text = f"DocuFlow Security Audit Report — Page {idx + 1} of {total_pages} — Confidential & Proprietary"
        page.insert_text(
            fitz.Point(MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM + 20),
            footer_text,
            fontsize=7,
            fontname="helv",
            color=(0.5, 0.5, 0.5),
        )

    output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output_pdf_path))
    doc.close()
    print(f"Successfully generated PDF with {total_pages} pages: {output_pdf_path}")

if __name__ == "__main__":
    report_md = Path("audit/AUDIT_REPORT.md")
    report_pdf = Path("audit/AUDIT_REPORT.pdf")
    render_markdown_to_pdf(report_md, report_pdf)
