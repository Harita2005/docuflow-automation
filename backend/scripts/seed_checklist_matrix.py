import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import ChecklistRule

db = SessionLocal()

print("==========================================================")
print("  SEEDING RESHAPED CHECKLIST MATRIX RULES:")
print("==========================================================")

# Clear old checklist rules
try:
    num_deleted = db.query(ChecklistRule).delete()
    db.commit()
    print(f"[Cleanup] Purged {num_deleted} existing checklist rules.")
except Exception as e:
    db.rollback()
    print(f"[Cleanup Notice] {e}")

rules_to_create = []

# VCC Purchase Categories List
vcc_purchase_categories = [
    "Freight Charges",
    "Interstate GST12% Purchase",
    "Interstate GST12% Purchase Return",
    "Interstate GST18% Purchase",
    "Interstate GST18% Purchase Return",
    "Interstate GST28% Purchase",
    "Interstate GST5% Purchase",
    "Interstate GST5% Purchase Return",
    "Local GST Nontax Purchase",
    "Local GST12% Purchase",
    "Local GST12% Purchase Return",
    "Local GST18% Purchase",
    "Local GST18% Purchase Return",
    "Local GST28% Purchase",
    "Local GST5% Purchase",
    "Local GST5% Purchase Return"
]

vcc_attachment_items = [
    "Bill Amount Verified",
    "Bill No ,Date & Address Verified",
    "Documents Attached",
    "Debit/Credit Note Verified",
    "Gofrugal Entry with narration Verified",
    "PO Verified",
    "Showroom Inward details",
    "Tax portion verified (GST, TDS, etc..)",
    "Vendor GST no, Signaure Verified",
    "Vendor Name",
    "Showroom Name Verified"
]

vcc_first_approval_items = [
    "IA Final Audit & Sign-off",
    "Tax portion verified (GST, TDS)",
    "PO & Invoice Amounts Reconciled"
]

vcc_second_approval_items = [
    "Management Sign-off & Budget Review",
    "Payment Release Authorization"
]

vcc_third_approval_items = [
    "Final Disbursement Verification",
    "ERP Post Readiness & Financial Sign-off"
]

category_profiles = ["VCC_PURCHASE", "VCC_PURCHASE_SR1", "VCC_PURCHASE_SR4", "VCC_PURCHASE_SR5", "VCC_PURCHASE_SR7"]

# 1. Seed VCC Purchase Profiles (Grouped by Stage)
seq = 1
for prof in category_profiles:
    for cat in vcc_purchase_categories:
        # Stage: Attachment Status
        rules_to_create.append(ChecklistRule(
            rule_name=f"{prof} - Attachment Status - {cat}",
            division="VCC",
            category=cat,
            cost_center="ALL",
            branch="ALL",
            workflow_profile=prof,
            stage_name="Attachment Status",
            item_text=" || ".join(vcc_attachment_items),
            is_mandatory=True,
            is_active=True,
            sequence_order=seq
        ))
        seq += 1
        
        # Stage: IA Approval / First Approval
        for stage_alias in ["Attachment Status", "IA Approval", "First Approval"]:
            if stage_alias == "Attachment Status":
                continue
            rules_to_create.append(ChecklistRule(
                rule_name=f"{prof} - {stage_alias} - {cat}",
                division="VCC",
                category=cat,
                cost_center="ALL",
                branch="ALL",
                workflow_profile=prof,
                stage_name=stage_alias,
                item_text=" || ".join(vcc_first_approval_items),
                is_mandatory=True,
                is_active=True,
                sequence_order=seq
            ))
            seq += 1

        # Stage: Second Approval
        for stage_alias in ["Second Approval"]:
            rules_to_create.append(ChecklistRule(
                rule_name=f"{prof} - {stage_alias} - {cat}",
                division="VCC",
                category=cat,
                cost_center="ALL",
                branch="ALL",
                workflow_profile=prof,
                stage_name=stage_alias,
                item_text=" || ".join(vcc_second_approval_items),
                is_mandatory=True,
                is_active=True,
                sequence_order=seq
            ))
            seq += 1

        # Stage: Third Approval
        for stage_alias in ["Third Approval"]:
            rules_to_create.append(ChecklistRule(
                rule_name=f"{prof} - {stage_alias} - {cat}",
                division="VCC",
                category=cat,
                cost_center="ALL",
                branch="ALL",
                workflow_profile=prof,
                stage_name=stage_alias,
                item_text=" || ".join(vcc_third_approval_items),
                is_mandatory=True,
                is_active=True,
                sequence_order=seq
            ))
            seq += 1

# 2. Seed ATC_GRN_HEADER (Grouped by Stage)
atc_attachment_items = ["Signatures", "Total Value"]
atc_ia_items = [
    "PO Ref Number, Quantity",
    "Bill Number, Bill Date",
    "GRN Number, Quantity",
    "Bundle Quantity",
    "Invoice Quantity, DC Quantity",
    "Security Seal and Signature",
    "PSecurity Checking Slip",
    "Signatures",
    "Total Value"
]

rules_to_create.append(ChecklistRule(
    rule_name="ATC_GRN_HEADER - Attachment Status",
    division="ATC",
    category="GRN Header",
    cost_center="ALL",
    branch="ALL",
    workflow_profile="ATC_GRN_HEADER",
    stage_name="Attachment Status",
    item_text=" || ".join(atc_attachment_items),
    is_mandatory=True,
    is_active=True,
    sequence_order=seq
))
seq += 1

for stage_alias in ["IA Approval", "First Approval", "Second Approval"]:
    rules_to_create.append(ChecklistRule(
        rule_name=f"ATC_GRN_HEADER - {stage_alias}",
        division="ATC",
        category="GRN Header",
        cost_center="ALL",
        branch="ALL",
        workflow_profile="ATC_GRN_HEADER",
        stage_name=stage_alias,
        item_text=" || ".join(atc_ia_items),
        is_mandatory=True,
        is_active=True,
        sequence_order=seq
    ))
    seq += 1

# 3. Seed RRF_GRN_HEADER (Grouped by Stage)
rrf_attachment_items = [
    "PO Ref Number, Quantity",
    "Bill Number, Bill Date",
    "GRN Number, Quantity",
    "Bundle Quantity",
    "Invoice Quantity, DC Quantity",
    "Security Seal and Signature",
    "PSecurity Checking Slip",
    "Signatures",
    "Total Value"
]

rrf_ia_items = [
    "Bill Number, Bill Date",
    "GRN Number, Quantity",
    "Bundle Quantity",
    "Invoice Quantity, DC Quantity",
    "Security Seal and Signature",
    "PSecurity Checking Slip",
    "Signatures",
    "Total Value",
    "PO Ref Number, Quantity"
]

rules_to_create.append(ChecklistRule(
    rule_name="RRF_GRN_HEADER - Attachment Status",
    division="RRF",
    category="GRN Header",
    cost_center="ALL",
    branch="ALL",
    workflow_profile="RRF_GRN_HEADER",
    stage_name="Attachment Status",
    item_text=" || ".join(rrf_attachment_items),
    is_mandatory=True,
    is_active=True,
    sequence_order=seq
))
seq += 1

for stage_alias in ["IA Approval", "First Approval", "Second Approval"]:
    rules_to_create.append(ChecklistRule(
        rule_name=f"RRF_GRN_HEADER - {stage_alias}",
        division="RRF",
        category="GRN Header",
        cost_center="ALL",
        branch="ALL",
        workflow_profile="RRF_GRN_HEADER",
        stage_name=stage_alias,
        item_text=" || ".join(rrf_ia_items),
        is_mandatory=True,
        is_active=True,
        sequence_order=seq
    ))
    seq += 1

try:
    db.add_all(rules_to_create)
    db.commit()
    print(f"[Success] Successfully inserted {len(rules_to_create)} reshaped Checklist Matrix rules!")
except Exception as e:
    db.rollback()
    print(f"[Error] Failed to insert checklist rules: {e}")

db.close()
