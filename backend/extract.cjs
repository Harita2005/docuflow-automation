const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');
const routes = [
  "/api/documents/upload",
  "/api/invoices/:id/apply-workflow",
  "/api/invoices/:id/step-action",
  "/api/workflows/approve",
  "/api/workflows/reject",
  "/api/workflows/send-back",
  "/api/workflows/request clarification"
];
let output = '';
for (const route of routes) {
  const index = code.indexOf(`app.post("${route}"`);
  if (index !== -1) {
    const nextRouteIndex = code.slice(index + 10).search(/app\.(post|get|put|delete|patch)/);
    const endIndex = nextRouteIndex !== -1 ? index + 10 + nextRouteIndex : code.length;
    output += `\n--- ROUTE: ${route} ---\n`;
    output += code.slice(index, endIndex);
  }
}
fs.writeFileSync('extracted_routes.txt', output);
