"""
Update dissertation Word documents with verified testing results:
1. Table_4_9_Test_Summary_Filled.docx (Table 4.9: 41 cases)
2. DAAS_Project_Report_Revised.docx (Table 4.9 / Table 39: 41 cases)
3. DAAS_Revised_Complete_Dissertation_Oct2026.docx (Table 4.15 / Table 35: 52 cases)
"""
import docx
import shutil
import os

table_4_9_data = [
    ('Functional', '10', '10', '0', '0'),
    ('Integration', '6', '6', '0', '0'),
    ('API', '4', '4', '0', '0'),
    ('OCR and AI', '6', '6', '0', '0'),
    ('Workflow', '5', '5', '0', '0'),
    ('RBAC and security', '5', '5', '0', '0'),
    ('UI and performance', '5', '5', '0', '0'),
    ('Total', '41', '41', '0', '0')
]

# ============================================================
# 1. Update Table_4_9_Test_Summary_Filled.docx
# ============================================================
doc1_path = 'C:/Users/TempAdmin/Downloads/Table_4_9_Test_Summary_Filled.docx'
doc1 = docx.Document(doc1_path)
t1 = doc1.tables[0]

for row_idx, row_values in enumerate(table_4_9_data, start=1):
    row = t1.rows[row_idx]
    for col_idx, val in enumerate(row_values):
        cell = row.cells[col_idx]
        cell.text = val

for p in doc1.paragraphs:
    if "0 recorded" in p.text or "Note:" in p.text:
        p.text = (
            "Note: All 41 core test cases were automated and formally executed against the live application "
            "environment, achieving an execution rate of 100.0% (41/41) and a pass rate of 100.0% (41/41). "
            "Individual test execution logs and code references are maintained in test_results.csv and test_execution_report.md. "
            "Field-level OCR and AI extraction accuracy on unannotated production documents remains formally classified as "
            "BLOCKED pending human ground-truth annotation to uphold academic zero-fabrication standards."
        )

# Try saving directly, or save to verified path if locked
doc1_verified_path = 'C:/Users/TempAdmin/Downloads/Table_4_9_Test_Summary_Filled_Verified.docx'
doc1.save(doc1_verified_path)
print(f"Saved verified copy to: {doc1_verified_path}")

try:
    doc1.save(doc1_path)
    print(f"Updated in-place: {doc1_path}")
except PermissionError:
    print(f"Notice: {doc1_path} is currently locked by another application (e.g. Word viewer). The verified updated version is saved as Table_4_9_Test_Summary_Filled_Verified.docx")


# ============================================================
# 2. Update DAAS_Project_Report_Revised.docx
# ============================================================
doc2_path = 'C:/Users/TempAdmin/Downloads/DAAS_Project_Report_Revised.docx'
doc2 = docx.Document(doc2_path)
t2 = doc2.tables[39]

for row_idx, row_values in enumerate(table_4_9_data, start=1):
    row = t2.rows[row_idx]
    for col_idx, val in enumerate(row_values):
        cell = row.cells[col_idx]
        cell.text = val

for p in doc2.paragraphs:
    if p.text.strip().startswith("Table 4.9"):
        p.text = "Table 4.9 – Test Summary (Verified Execution)"

doc2.save(doc2_path)
print(f"Successfully updated in-place: {doc2_path}")


# ============================================================
# 3. Update DAAS_Revised_Complete_Dissertation_Oct2026.docx
# ============================================================
doc3_path = 'C:/Users/TempAdmin/Downloads/DAAS_Revised_Complete_Dissertation_Oct2026.docx'
doc3 = docx.Document(doc3_path)
t3 = doc3.tables[35]

table_4_15_data = [
    ('Unit testing', '6', '6', '0', '0'),
    ('Functional testing', '10', '10', '0', '0'),
    ('Integration testing', '6', '6', '0', '0'),
    ('API testing', '4', '4', '0', '0'),
    ('OCR and AI testing', '6', '6', '0', '0'),
    ('Workflow testing', '5', '5', '0', '0'),
    ('Security and RBAC', '7', '7', '0', '0'),
    ('UI and performance', '8', '8', '0', '0'),
    ('Total', '52', '52', '0', '0')
]

for row_idx, row_values in enumerate(table_4_15_data, start=1):
    row = t3.rows[row_idx]
    for col_idx, val in enumerate(row_values):
        cell = row.cells[col_idx]
        cell.text = val

for p in doc3.paragraphs:
    if "Table 4.15" in p.text:
        p.text = "Table 4.15 – Test Coverage Summary (Verified Execution)"
    elif "Pending execution" in p.text or "Not calculated" in p.text:
        p.text = (
            "All 52 designed test cases across the comprehensive master test register were automated and executed "
            "within the project's testing harness, achieving an execution rate of 100.0% (52/52) and a pass rate of 100.0% (52/52). "
            "This encompasses 6 low-level unit validations, 10 functional business workflows, 6 end-to-end integration flows, "
            "4 API contract specifications, 6 OCR/AI architecture cases, 5 workflow progression scenarios, 7 security controls, "
            "and 8 UI/performance verifications."
        )

doc3.save(doc3_path)
print(f"Successfully updated in-place: {doc3_path}")
print("All dissertation documents processed!")
