const fs = require('fs');
let content = fs.readFileSync('prisma/schema.prisma', 'utf8');
content = content.replace(/provider\s*=\s*"sqlserver"/g, 'provider = "sqlite"');
content = content.replace(/@db\.Text/g, '');
content = content.replace(/@db\.VarChar\([0-9]+\)/g, '');
fs.writeFileSync('prisma/schema.prisma', content);
console.log("Schema updated!");
