const fs = require('fs');

// 1. Update ConditionBuilder.jsx
let frontendPath = 'frontend/src/components/ConditionBuilder.jsx';
let frontendContent = fs.readFileSync(frontendPath, 'utf8');

const newDropdownOptions = `                        <option>Invoice Amount (Total)</option>
                        <option>Amount</option>
                        <option>Tax Amount</option>
                        <option>Vendor Type</option>
                        <option>Vendor Name</option>
                        <option>Category</option>
                        <option>Cost Center</option>
                        <option>Department</option>
                        <option>Division</option>
                        <option>Plant</option>
                        <option>Product Line Items</option>`;

frontendContent = frontendContent.replace(
  /<option>Invoice Amount \(Total\)<\/option>\s*<option>Amount<\/option>\s*<option>Tax Amount<\/option>\s*<option>Vendor Type<\/option>\s*<option>Vendor Name<\/option>/,
  newDropdownOptions
);

fs.writeFileSync(frontendPath, frontendContent);
console.log("Updated ConditionBuilder.jsx");

// 2. Update backend/server.ts
let backendPath = 'backend/server.ts';
let backendContent = fs.readFileSync(backendPath, 'utf8');

const newFieldMapping = `    const fieldMapping: Record<string, string> = {
      "Vendor Name": "vendor_name",
      "Supplier Name": "vendor_name",
      "Amount": "amount",
      "Invoice Amount (Total)": "amount",
      "PO Number": "po_number",
      "Invoice Number": "invoice_number",
      "Document Type": "document_type",
      "Category": "category",
      "Cost Center": "cost_center",
      "Department": "department",
      "Division": "division",
      "Plant": "plant",
      "Product Line Items": "items"
    };`;

backendContent = backendContent.replace(
  /const fieldMapping: Record<string, string> = \{\s*"Vendor Name": "vendor_name",\s*"Supplier Name": "vendor_name",\s*"Amount": "amount",\s*"Invoice Amount \(Total\)": "amount",\s*"PO Number": "po_number",\s*"Invoice Number": "invoice_number",\s*"Document Type": "document_type"\s*\};/,
  newFieldMapping
);

fs.writeFileSync(backendPath, backendContent);
console.log("Updated server.ts");

// 3. Update backend/test_rules.ts
let testRulesPath = 'backend/test_rules.ts';
if (fs.existsSync(testRulesPath)) {
  let testRulesContent = fs.readFileSync(testRulesPath, 'utf8');
  testRulesContent = testRulesContent.replace(
    /const fieldMapping: Record<string, string> = \{\s*"Vendor Name": "vendor_name",\s*"Supplier Name": "vendor_name",\s*"Amount": "amount",\s*"Invoice Amount \(Total\)": "amount",\s*"PO Number": "po_number",\s*"Invoice Number": "invoice_number",\s*"Document Type": "document_type"\s*\};/,
    newFieldMapping
  );
  fs.writeFileSync(testRulesPath, testRulesContent);
  console.log("Updated test_rules.ts");
}
