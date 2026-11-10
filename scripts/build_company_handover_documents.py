"""
Enterprise Document Generator for DocuFlow Automation (FlowApprove)
Compiles Markdown specifications into publication-grade Microsoft Word (.docx)
and native PDF (.pdf) documents for company handover.
"""
import os
import re
import sys
from pathlib import Path
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

# Palette definitions
COLOR_PRIMARY = RGBColor(10, 37, 64)       # Deep Navy #0A2540
COLOR_SECONDARY = RGBColor(37, 99, 235)    # Cobalt Blue #2563EB
COLOR_BODY = RGBColor(30, 41, 59)          # Charcoal #1E293B
COLOR_MUTED = RGBColor(100, 116, 139)      # Slate Gray #64748B
COLOR_BORDER = "CBD5E1"                    # Slate Light
COLOR_HEADER_BG = "0A2540"                 # Navy Table Header
COLOR_ZEBRA_BG = "F8FAFC"                  # Very Soft Slate
COLOR_NOTE_BG = "EFF6FF"                   # Light Blue Tint
COLOR_WARN_BG = "FEF3C7"                   # Light Amber Tint
COLOR_CODE_BG = "F1F5F9"                   # Light Gray Code

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    """Set inner cell padding in dxa (1 pt = 20 dxa)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_shading(cell, color_hex):
    """Set background color of a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    tcPr.append(shd)

def set_cell_borders(cell, top=COLOR_BORDER, bottom=COLOR_BORDER, left=None, right=None):
    """Set cell borders."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    
    borders = [('w:top', top), ('w:bottom', bottom)]
    if left:
        borders.append(('w:left', left))
    else:
        borders.append(('w:left', 'none'))
    if right:
        borders.append(('w:right', right))
    else:
        borders.append(('w:right', 'none'))
        
    for name, val in borders:
        if val == 'none':
            b = OxmlElement(name)
            b.set(qn('w:val'), 'none')
        else:
            b = OxmlElement(name)
            b.set(qn('w:val'), 'single')
            b.set(qn('w:sz'), '4')
            b.set(qn('w:space'), '0')
            b.set(qn('w:color'), val)
        tcBorders.append(b)
    tcPr.append(tcBorders)

def add_callout(doc, text, callout_type="NOTE"):
    """Adds a beautifully styled admonition callout box."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    
    if callout_type in ["WARNING", "CAUTION", "IMPORTANT"]:
        bg_color = COLOR_WARN_BG
        border_color = "F59E0B" # Amber
        title = "IMPORTANT / WARNING" if callout_type != "CAUTION" else "CAUTION"
    else:
        bg_color = COLOR_NOTE_BG
        border_color = "3B82F6" # Blue
        title = "NOTE / SYSTEM GUIDANCE"
        
    set_cell_shading(cell, bg_color)
    set_cell_margins(cell, top=140, bottom=140, left=180, right=140)
    
    # Left thick border, no top/bottom/right
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    left_b = OxmlElement('w:left')
    left_b.set(qn('w:val'), 'single')
    left_b.set(qn('w:sz'), '24') # thick border
    left_b.set(qn('w:space'), '0')
    left_b.set(qn('w:color'), border_color)
    tcBorders.append(left_b)
    
    for side in ['top', 'bottom', 'right']:
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'none')
        tcBorders.append(b)
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    
    run_title = p.add_run(f"[{title}] ")
    run_title.bold = True
    run_title.font.name = "Segoe UI"
    run_title.font.size = Pt(9.5)
    run_title.font.color.rgb = RGBColor(15, 23, 42)
    
    run_text = p.add_run(text)
    run_text.font.name = "Segoe UI"
    run_text.font.size = Pt(9.5)
    run_text.font.color.rgb = COLOR_BODY

def add_code_block(doc, code_text):
    """Adds a formatted code block."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_shading(cell, COLOR_CODE_BG)
    set_cell_margins(cell, top=120, bottom=120, left=160, right=140)
    set_cell_borders(cell, top="E2E8F0", bottom="E2E8F0", left="94A3B8", right="E2E8F0")
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.05
    
    run = p.add_run(code_text)
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(15, 23, 42)

def add_custom_cover_page(doc, title, subtitle, doc_version, target_org, doc_class, author_team):
    """Builds an executive corporate cover page."""
    # Organization eyebrow
    p_org = doc.add_paragraph()
    p_org.paragraph_format.space_before = Pt(36)
    p_org.paragraph_format.space_after = Pt(12)
    run_org = p_org.add_run("STRIVH PROFESSIONAL ENTERPRISES  |  RAMRAJ COTTON")
    run_org.font.name = "Segoe UI"
    run_org.font.size = Pt(11)
    run_org.font.bold = True
    run_org.font.color.rgb = COLOR_SECONDARY
    
    # Main Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(12)
    p_title.paragraph_format.space_after = Pt(8)
    p_title.paragraph_format.line_spacing = 1.15
    run_title = p_title.add_run(title)
    run_title.font.name = "Segoe UI"
    run_title.font.size = Pt(26)
    run_title.font.bold = True
    run_title.font.color.rgb = COLOR_PRIMARY
    
    # Subtitle
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(4)
    p_sub.paragraph_format.space_after = Pt(36)
    run_sub = p_sub.add_run(subtitle)
    run_sub.font.name = "Segoe UI"
    run_sub.font.size = Pt(13)
    run_sub.font.italic = True
    run_sub.font.color.rgb = COLOR_MUTED
    
    # Accent Rule
    p_rule = doc.add_paragraph()
    p_rule.paragraph_format.space_before = Pt(0)
    p_rule.paragraph_format.space_after = Pt(36)
    run_rule = p_rule.add_run("━" * 55)
    run_rule.font.color.rgb = COLOR_SECONDARY
    
    # Document Metadata Card / Table
    meta_table = doc.add_table(rows=6, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False
    
    meta_data = [
        ("System Name & Release:", "DocuFlow Automation (FlowApprove DAAS)"),
        ("System Version:", doc_version),
        ("Target Enterprise:", target_org),
        ("Document Classification:", doc_class),
        ("Authoring Engineering Authority:", author_team),
        ("Release & Handover Date:", "November 2026")
    ]
    
    for row_idx, (k, v) in enumerate(meta_data):
        row = meta_table.rows[row_idx]
        cell_k, cell_v = row.cells[0], row.cells[1]
        cell_k.width = Inches(2.2)
        cell_v.width = Inches(4.3)
        
        set_cell_shading(cell_k, COLOR_ZEBRA_BG)
        set_cell_shading(cell_v, "FFFFFF")
        set_cell_margins(cell_k, top=80, bottom=80, left=100, right=100)
        set_cell_margins(cell_v, top=80, bottom=80, left=100, right=100)
        set_cell_borders(cell_k, top="E2E8F0", bottom="E2E8F0", left="E2E8F0", right="E2E8F0")
        set_cell_borders(cell_v, top="E2E8F0", bottom="E2E8F0", left="E2E8F0", right="E2E8F0")
        
        pk = cell_k.paragraphs[0]
        pk.paragraph_format.space_before = Pt(2)
        pk.paragraph_format.space_after = Pt(2)
        rk = pk.add_run(k)
        rk.font.name = "Segoe UI"
        rk.font.size = Pt(9.5)
        rk.font.bold = True
        rk.font.color.rgb = COLOR_PRIMARY
        
        pv = cell_v.paragraphs[0]
        pv.paragraph_format.space_before = Pt(2)
        pv.paragraph_format.space_after = Pt(2)
        rv = pv.add_run(v)
        rv.font.name = "Segoe UI"
        rv.font.size = Pt(9.5)
        rv.font.color.rgb = COLOR_BODY
        
    p_end = doc.add_paragraph()
    p_end.paragraph_format.space_before = Pt(48)
    r_conf = p_end.add_run("NOTICE: This document contains proprietary technical architecture and operating procedures intended solely for the authorized personnel of Strivh Professional Enterprises and Ramraj Cotton.")
    r_conf.font.name = "Segoe UI"
    r_conf.font.size = Pt(8.5)
    r_conf.font.italic = True
    r_conf.font.color.rgb = COLOR_MUTED
    
    doc.add_page_break()

def parse_markdown_to_docx(md_path, doc, images_dir):
    """Parses full markdown document into rich formatted docx elements."""
    with open(md_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    in_code_block = False
    code_lines = []
    in_table = False
    table_lines = []
    
    i = 0
    total = len(lines)
    
    while i < total:
        line = lines[i].rstrip('\r\n')
        
        # Check code block
        if line.strip().startswith('```'):
            if in_code_block:
                # End code block
                add_code_block(doc, '\n'.join(code_lines))
                code_lines = []
                in_code_block = False
            else:
                # Flush pending table if any
                if in_table:
                    render_markdown_table(doc, table_lines)
                    table_lines = []
                    in_table = False
                in_code_block = True
                code_lines = []
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue
            
        # Check table row
        if line.strip().startswith('|') and line.strip().endswith('|'):
            in_table = True
            table_lines.append(line)
            i += 1
            continue
        else:
            if in_table:
                render_markdown_table(doc, table_lines)
                table_lines = []
                in_table = False
                
        # Blank line
        if not line.strip():
            i += 1
            continue
            
        # Admonition callouts (> [!NOTE] or > [!IMPORTANT])
        if line.strip().startswith('> [!'):
            m = re.match(r'> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]', line.strip())
            callout_type = m.group(1) if m else "NOTE"
            callout_lines = []
            i += 1
            while i < total and lines[i].strip().startswith('>'):
                c_line = lines[i].strip().lstrip('>').strip()
                callout_lines.append(c_line)
                i += 1
            add_callout(doc, ' '.join(callout_lines), callout_type)
            continue
            
        # Standard blockquote (> text)
        if line.strip().startswith('>'):
            bq_lines = []
            while i < total and lines[i].strip().startswith('>'):
                bq_lines.append(lines[i].strip().lstrip('>').strip())
                i += 1
            add_callout(doc, ' '.join(bq_lines), "NOTE")
            continue
            
        # Headings
        if line.startswith('# '):
            h = doc.add_heading(level=1)
            h.paragraph_format.space_before = Pt(18)
            h.paragraph_format.space_after = Pt(6)
            h.paragraph_format.keep_with_next = True
            run = h.add_run(line[2:].strip())
            run.font.name = "Segoe UI"
            run.font.size = Pt(16)
            run.font.bold = True
            run.font.color.rgb = COLOR_PRIMARY
            i += 1
            continue
        elif line.startswith('## '):
            h = doc.add_heading(level=2)
            h.paragraph_format.space_before = Pt(14)
            h.paragraph_format.space_after = Pt(4)
            h.paragraph_format.keep_with_next = True
            run = h.add_run(line[3:].strip())
            run.font.name = "Segoe UI"
            run.font.size = Pt(13)
            run.font.bold = True
            run.font.color.rgb = COLOR_SECONDARY
            i += 1
            continue
        elif line.startswith('### '):
            h = doc.add_heading(level=3)
            h.paragraph_format.space_before = Pt(10)
            h.paragraph_format.space_after = Pt(3)
            h.paragraph_format.keep_with_next = True
            run = h.add_run(line[4:].strip())
            run.font.name = "Segoe UI"
            run.font.size = Pt(11)
            run.font.bold = True
            run.font.color.rgb = COLOR_BODY
            i += 1
            continue
        elif line.startswith('#### '):
            h = doc.add_heading(level=4)
            h.paragraph_format.space_before = Pt(8)
            h.paragraph_format.space_after = Pt(2)
            h.paragraph_format.keep_with_next = True
            run = h.add_run(line[5:].strip())
            run.font.name = "Segoe UI"
            run.font.size = Pt(10)
            run.font.bold = True
            run.font.color.rgb = COLOR_MUTED
            i += 1
            continue
            
        # Horizontal Rule (---)
        if re.match(r'^\s*[-*_]{3,}\s*$', line):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            run = p.add_run("—" * 60)
            run.font.color.rgb = RGBColor(226, 232, 240)
            i += 1
            continue
            
        # Images (![alt](path))
        img_match = re.match(r'!\[(.*?)\]\((.*?)\)', line.strip())
        if img_match:
            caption = img_match.group(1)
            img_rel = img_match.group(2)
            img_name = os.path.basename(img_rel)
            img_candidate = os.path.join(images_dir, img_name)
            
            if os.path.exists(img_candidate):
                try:
                    p_img = doc.add_paragraph()
                    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_img.paragraph_format.space_before = Pt(8)
                    p_img.paragraph_format.space_after = Pt(2)
                    doc.add_picture(img_candidate, width=Inches(5.8))
                    
                    if caption:
                        p_cap = doc.add_paragraph()
                        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        p_cap.paragraph_format.space_before = Pt(2)
                        p_cap.paragraph_format.space_after = Pt(8)
                        r_cap = p_cap.add_run(f"Figure: {caption}")
                        r_cap.font.name = "Segoe UI"
                        r_cap.font.size = Pt(8.5)
                        r_cap.font.italic = True
                        r_cap.font.color.rgb = COLOR_MUTED
                except Exception as e:
                    print(f"Warning: could not insert image {img_candidate}: {e}")
            i += 1
            continue
            
        # Bullet list item
        if line.strip().startswith(('* ', '- ', '• ')):
            bullet_text = re.sub(r'^[*\-•]\s+', '', line.strip())
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.15
            render_inline_formatting(p, bullet_text)
            i += 1
            continue
            
        # Numbered list item
        num_match = re.match(r'^(\d+)\.\s+(.*)$', line.strip())
        if num_match:
            num_idx = num_match.group(1)
            item_text = num_match.group(2)
            p = doc.add_paragraph(style='List Number')
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.15
            render_inline_formatting(p, item_text)
            i += 1
            continue
            
        # Regular paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        render_inline_formatting(p, line.strip())
        i += 1
        
    # Flush remaining table if file ends with table
    if in_table:
        render_markdown_table(doc, table_lines)

def render_inline_formatting(paragraph, text):
    """Parses bold, italic, and inline code formatting."""
    # Pattern to find **bold**, *italic*, and `code`
    tokens = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', text)
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**') and len(token) >= 4:
            run = paragraph.add_run(token[2:-2])
            run.font.name = "Segoe UI"
            run.font.size = Pt(10)
            run.font.bold = True
            run.font.color.rgb = COLOR_BODY
        elif token.startswith('*') and token.endswith('*') and len(token) >= 2:
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Segoe UI"
            run.font.size = Pt(10)
            run.font.italic = True
            run.font.color.rgb = COLOR_BODY
        elif token.startswith('`') and token.endswith('`') and len(token) >= 2:
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(180, 40, 40)
        else:
            run = paragraph.add_run(token)
            run.font.name = "Segoe UI"
            run.font.size = Pt(10)
            run.font.color.rgb = COLOR_BODY

def render_markdown_table(doc, table_lines):
    """Renders a parsed markdown table with zebra-striping and styled headers."""
    rows_data = []
    for line in table_lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        # Skip markdown separator row like |:---|:---|
        if re.match(r'^\|[\s\-:]+(\|[\s\-:]+)+\|$', line_clean):
            continue
        cells = [c.strip() for c in line_clean.split('|')[1:-1]]
        if cells:
            rows_data.append(cells)
            
    if not rows_data:
        return
        
    num_cols = max(len(r) for r in rows_data)
    table = doc.add_table(rows=len(rows_data), cols=num_cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    
    # Calculate column widths proportionally
    page_width = 6.5 # inches
    col_width = page_width / num_cols
    
    for row_idx, row_data in enumerate(rows_data):
        row = table.rows[row_idx]
        is_header = (row_idx == 0)
        
        # CantSplit so row doesn't break across pages
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        if is_header:
            trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
            
        for col_idx in range(num_cols):
            cell = row.cells[col_idx]
            cell.width = Inches(col_width)
            val = row_data[col_idx] if col_idx < len(row_data) else ""
            
            # Shading & borders
            if is_header:
                set_cell_shading(cell, COLOR_HEADER_BG)
                set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
                set_cell_borders(cell, top=COLOR_HEADER_BG, bottom=COLOR_HEADER_BG, left=COLOR_HEADER_BG, right=COLOR_HEADER_BG)
            else:
                bg = COLOR_ZEBRA_BG if (row_idx % 2 == 1) else "FFFFFF"
                set_cell_shading(cell, bg)
                set_cell_margins(cell, top=70, bottom=70, left=100, right=100)
                set_cell_borders(cell, top=COLOR_BORDER, bottom=COLOR_BORDER, left=COLOR_BORDER, right=COLOR_BORDER)
                
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.05
            
            if is_header:
                run = p.add_run(val)
                run.font.name = "Segoe UI"
                run.font.size = Pt(9)
                run.font.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
            else:
                render_inline_formatting(p, val)
                
    # Add small spacing after table
    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(2)
    p_spacer.paragraph_format.space_after = Pt(6)

def export_docx_to_pdf(docx_path, pdf_path):
    """Exports docx to pdf using Microsoft Word COM object."""
    try:
        import win32com.client
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False
        try:
            doc_com = word.Documents.Open(os.path.abspath(docx_path))
            doc_com.ExportAsFixedFormat(os.path.abspath(pdf_path), 17) # 17 = wdExportFormatPDF
            doc_com.Close(False)
            print(f"Exported PDF successfully: {pdf_path}")
            return True
        finally:
            word.Quit()
    except Exception as e:
        print(f"Error exporting {docx_path} to PDF via Word COM: {e}")
        return False

def build_technical_documentation():
    """Compiles the authoritative Technical Documentation."""
    print("=" * 60)
    print("Building DocuFlow Comprehensive Technical Documentation...")
    print("=" * 60)
    
    doc = Document()
    
    # Page setup
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Header & Footer
        header = section.header
        p_hdr = header.paragraphs[0]
        p_hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_hdr = p_hdr.add_run("DocuFlow Automation (FlowApprove DAAS)  |  Technical Architecture")
        r_hdr.font.name = "Segoe UI"
        r_hdr.font.size = Pt(8.5)
        r_hdr.font.color.rgb = COLOR_MUTED
        
        footer = section.footer
        p_ftr = footer.paragraphs[0]
        p_ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_ftr = p_ftr.add_run("Confidential  —  Strivh Professional Enterprises / Ramraj Cotton  |  Engineering Handover")
        r_ftr.font.name = "Segoe UI"
        r_ftr.font.size = Pt(8.5)
        r_ftr.font.color.rgb = COLOR_MUTED
        
    add_custom_cover_page(
        doc,
        title="DocuFlow Automation (FlowApprove)\nComprehensive Technical Documentation",
        subtitle="Document Approval & Automation System (DAAS) — Architecture, Database, APIs & Handover Runbook",
        doc_version="2.1.0 (Production Hardened)",
        target_org="Strivh Professional Enterprises / Ramraj Cotton",
        doc_class="Confidential — Enterprise Engineering & Handover Asset",
        author_team="Software Engineering Team & Core Architecture Group"
    )
    
    md_path = "docs/DocuFlow_Technical_Documentation.md"
    images_dir = "docs/images"
    parse_markdown_to_docx(md_path, doc, images_dir)
    
    out_docx_root = "DocuFlow_Technical_Documentation.docx"
    out_docx_docs = "docs/DocuFlow_Technical_Documentation.docx"
    out_pdf_root = "DocuFlow_Technical_Documentation.pdf"
    out_pdf_docs = "docs/DocuFlow_Technical_Documentation.pdf"
    
    doc.save(out_docx_root)
    doc.save(out_docx_docs)
    print(f"Saved DOCX: {out_docx_root} and {out_docx_docs}")
    
    export_docx_to_pdf(out_docx_root, out_pdf_root)
    if os.path.exists(out_pdf_root):
        import shutil
        shutil.copy2(out_pdf_root, out_pdf_docs)
        print(f"Copied PDF to {out_pdf_docs}")

def build_user_manual():
    """Compiles the authoritative Master User Manual."""
    print("=" * 60)
    print("Building FlowApprove Enterprise User Manual...")
    print("=" * 60)
    
    doc = Document()
    
    # Page setup
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Header & Footer
        header = section.header
        p_hdr = header.paragraphs[0]
        p_hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_hdr = p_hdr.add_run("FlowApprove / DocuFlow Automation  |  End-User Operational Manual")
        r_hdr.font.name = "Segoe UI"
        r_hdr.font.size = Pt(8.5)
        r_hdr.font.color.rgb = COLOR_MUTED
        
        footer = section.footer
        p_ftr = footer.paragraphs[0]
        p_ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_ftr = p_ftr.add_run("Confidential  —  Strivh Professional Enterprises / Ramraj Cotton  |  Operational Guide")
        r_ftr.font.name = "Segoe UI"
        r_ftr.font.size = Pt(8.5)
        r_ftr.font.color.rgb = COLOR_MUTED
        
    add_custom_cover_page(
        doc,
        title="FlowApprove (DocuFlow Automation)\nEnterprise User & Operations Manual",
        subtitle="Complete Visual Screen Reference, Button Catalogs, Approval Workflows & Admin Guide",
        doc_version="2.1.0 (Production Hardened)",
        target_org="Strivh Professional Enterprises / Ramraj Cotton",
        doc_class="Operational Manual — Accounts Payable, Reviewers, Approvers & System Admins",
        author_team="Senior Technical Writer & Quality Assurance Lead"
    )
    
    md_path = "FlowApprove_User_Manual.md"
    images_dir = "docs/images"
    parse_markdown_to_docx(md_path, doc, images_dir)
    
    out_docx_root = "FlowApprove_User_Manual.docx"
    out_docx_docs = "docs/FlowApprove_User_Manual.docx"
    out_pdf_root = "FlowApprove_User_Manual.pdf"
    out_pdf_docs = "docs/FlowApprove_User_Manual.pdf"
    
    doc.save(out_docx_root)
    doc.save(out_docx_docs)
    print(f"Saved DOCX: {out_docx_root} and {out_docx_docs}")
    
    export_docx_to_pdf(out_docx_root, out_pdf_root)
    if os.path.exists(out_pdf_root):
        import shutil
        shutil.copy2(out_pdf_root, out_pdf_docs)
        print(f"Copied PDF to {out_pdf_docs}")

if __name__ == "__main__":
    build_technical_documentation()
    build_user_manual()
    print("=" * 60)
    print("All enterprise handover deliverables built successfully!")
    print("=" * 60)
