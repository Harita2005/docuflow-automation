import sys
import os
import fitz  # PyMuPDF
import json

def compress_pdf(input_path, output_path):
    try:
        # Open the PDF
        doc = fitz.open(input_path)
        
        # Save it to a new file using maximum garbage collection and deflation.
        # garbage=4: removes unused objects, duplicate objects, and compacts xrefs.
        # deflate=True: compresses uncompressed streams.
        # clean=True: sanitizes content streams.
        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        
        # Verify success
        if os.path.exists(output_path):
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            print(json.dumps({
                "status": "success", 
                "original_size": original_size, 
                "new_size": new_size,
                "output_path": output_path
            }))
        else:
            print(json.dumps({"error": "Compression completed but output file not found."}))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python compress_pdf.py <input_path> <output_path>"}))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(input_path):
        print(json.dumps({"error": f"Input file does not exist at {input_path}"}))
        sys.exit(1)
        
    compress_pdf(input_path, output_path)
