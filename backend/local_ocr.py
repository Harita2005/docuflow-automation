import sys
import json
import logging
from paddleocr import PaddleOCR

logging.disable(logging.DEBUG)
logging.disable(logging.WARNING)
def extract_text(image_path):
    try:
        # Initialize PaddleOCR (runs locally)
        ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)        
        # Run OCR
        result = ocr.ocr(image_path, cls=True)        
        lines = []
        layout = []        
        if result and len(result) > 0 and result[0]:
            # Each res is like: [ [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], ('text', conf) ]
            # Extract basic bounding box info
            items = []
            for res in result[0]:
                box = res[0]
                text = res[1][0]
                confidence = float(res[1][1]) * 100                
                # compute center Y to group by line
                y_center = sum(p[1] for p in box) / 4.0
                # compute min X to sort horizontally
                x_min = min(p[0] for p in box)                
                items.append({
                    "text": text,
                    "conf": confidence,
                    "y": y_center,
                    "x": x_min
                })            
            # Sort items by Y axis first
            items.sort(key=lambda item: item['y'])            
            # Group items into lines (tolerance of 15 pixels)
            current_line_y = None
            current_line_items = []
            grouped_lines = []            
            for item in items:
                if current_line_y is None:
                    current_line_y = item['y']
                    current_line_items.append(item)
                else:
                    if abs(item['y'] - current_line_y) < 15:
                        current_line_items.append(item)
                    else:
                        grouped_lines.append(current_line_items)
                        current_line_y = item['y']
                        current_line_items = [item]                        
            if current_line_items:
                grouped_lines.append(current_line_items)                
            # Sort each group by X axis, and construct a spatially-aware raw_text
            for group in grouped_lines:
                group.sort(key=lambda item: item['x'])                
                line_str = ""
                last_x = 0
                for item in group:
                    # Calculate how many spaces to insert based on X distance (approx 12 pixels per space)
                    spaces_needed = max(1, int((item['x'] - last_x) / 12)) if last_x > 0 else 0
                    if spaces_needed > 40: spaces_needed = 40 # Cap excessive spacing                    
                    line_str += (" " * spaces_needed) + item['text']                    
                    # Estimate the end x coordinate of this text block
                    last_x = item['x'] + (len(item['text']) * 10)                    
                line_conf = sum(item['conf'] for item in group) / len(group)                
                lines.append(line_str.strip())
                layout.append({
                    "lineText": line_str.strip(),
                    "confidence": line_conf
                })                
        raw_text = "\n".join(lines)        
        output = {
            "raw_text": raw_text,
            "layout": layout
        }        
        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)        
    extract_text(sys.argv[1])
