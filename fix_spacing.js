const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// 1. Grid should be items-stretch instead of items-start
content = content.replace(
  'className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"',
  'className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"'
);

// 2. Panel B container should be flex col and full height
content = content.replace(
  '{/* PANEL B: METADATA & CUSTOM FIELDS (6 cols) */}\n        <div className="lg:col-span-6 space-y-2">',
  '{/* PANEL B: METADATA & CUSTOM FIELDS (6 cols) */}\n        <div className="lg:col-span-6 flex flex-col gap-4 h-full">' // Replaced space-y-2 with gap-4
);

// 3. The second block (BLOCK B2) should stretch (flex-1)
content = content.replace(
  '{/* BLOCK B2: ITEM LIST & LINE ITEMS */}\n              <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">',
  '{/* BLOCK B2: ITEM LIST & LINE ITEMS */}\n              <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm flex-1 flex flex-col">'
);
content = content.replace( // In case it already has flex flex-col but not flex-1 (it didn't seem to based on grep)
  '{/* BLOCK B2: ITEM LIST & LINE ITEMS */}\n              <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm flex flex-col">',
  '{/* BLOCK B2: ITEM LIST & LINE ITEMS */}\n              <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm flex-1 flex flex-col">'
);

// 4. The Comments Thread should also stretch and push down
content = content.replace(
  '{/* Comments Thread Segment */}\n                <div className="border-t border-slate-100 pt-3 mt-3">',
  '{/* Comments Thread Segment */}\n                <div className="border-t border-slate-100 pt-3 mt-auto flex flex-col flex-1">'
);

// 5. The Comments list inside it should stretch to push the input box to the bottom
content = content.replace(
  '<div className="space-y-3 mb-3 max-h-[300px] overflow-y-auto pr-2">',
  '<div className="space-y-3 mb-3 max-h-[300px] flex-1 overflow-y-auto pr-2">'
);

fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
console.log("Applied flex layout adjustments for professional UI spacing.");
