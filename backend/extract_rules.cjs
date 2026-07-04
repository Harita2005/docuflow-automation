const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');
const routes = [
  "/api/admin/routing-rules"
];
let output = '';
for (const route of routes) {
  let index = code.indexOf(`app.get("${route}"`);
  if (index !== -1) {
    let nextRouteIndex = code.slice(index + 10).search(/app\.(post|get|put|delete|patch)/);
    let endIndex = nextRouteIndex !== -1 ? index + 10 + nextRouteIndex : code.length;
    output += `\n--- GET ${route} ---\n` + code.slice(index, endIndex);
  }
  
  index = code.indexOf(`app.post("${route}"`);
  if (index !== -1) {
    let nextRouteIndex = code.slice(index + 10).search(/app\.(post|get|put|delete|patch)/);
    let endIndex = nextRouteIndex !== -1 ? index + 10 + nextRouteIndex : code.length;
    output += `\n--- POST ${route} ---\n` + code.slice(index, endIndex);
  }
}
fs.writeFileSync('extracted_rules.txt', output);
