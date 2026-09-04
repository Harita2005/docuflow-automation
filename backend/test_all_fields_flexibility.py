import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.rules_engine import match_field_value

print("==========================================================")
print("  TESTING ULTRA-FLEXIBLE MATCHING ACROSS ALL FIELDS:")
print("==========================================================")

field_tests = [
    ("Division", "VCC", "V-C-C", "equals", True),
    ("Category", "Freight Charges", "Freight-Charges", "equals", True),
    ("Branch", "TN-CBE-PROZONE-MALL", "TN CBE PROZONE MALL", "equals", True),
    ("Cost Center", "IT-HARDWARE", "IT HARDWARE", "equals", True),
    ("Vendor Name", "Siemens Ltd.", "SIEMENS LTD", "contains any of", True),
]

for field, rule_val, doc_val, op, expected in field_tests:
    res = match_field_value(rule_val, doc_val, op)
    status = "SUCCESS" if res == expected else "FAILED"
    print(f"  Field: {field:<12} | Rule: '{rule_val}' vs Doc: '{doc_val}' -> Result: {res} [{status}]")
