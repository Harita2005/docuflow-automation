const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Admin.jsx', 'utf8');

// Replace the raw JSON display
const oldJsonDisplay = '<pre className="text-[9px] text-slate-600 bg-slate-50 border border-slate-100 p-2 rounded-lg font-mono overflow-auto max-h-32 max-w-2xl whitespace-pre-wrap">{t.fields_json}</pre>';

const newVisualDisplay = `<div className="flex flex-wrap gap-2 mt-3">
                         {(() => {
                           try {
                             const parsedFields = JSON.parse(t.fields_json || '[]');
                             if (!Array.isArray(parsedFields) || parsedFields.length === 0) {
                               return <span className="text-xs text-slate-400 italic">No fields defined</span>;
                             }
                             return parsedFields.map((f, i) => (
                               <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm">
                                 <span className="text-xs font-bold text-slate-700">{f.name}</span>
                                 <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded tracking-wider border border-purple-200">{f.type}</span>
                                 {f.required && <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded tracking-wider border border-rose-200">Required</span>}
                               </div>
                             ));
                           } catch(e) {
                             return <span className="text-xs text-rose-500 font-medium">Invalid Schema JSON</span>;
                           }
                         })()}
                       </div>`;

content = content.replace(oldJsonDisplay, newVisualDisplay);

// 2. Buttons - Add focus rings, ARIA labels, and increase text size
content = content.replace(
  /<button\n\s*onClick=\{\(\) => openEditTemplate\(null\)\}\n\s*className="flex items-center gap-1\.5 px-2\.5 py-1\.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-\[10px\] uppercase tracking-wider rounded transition-colors shadow-sm"\n\s*>/g,
  '<button onClick={() => openEditTemplate(null)} className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">'
);

content = content.replace(
  /<button type="button" onClick=\{\(\) => \{ setEditingTemplate\(null\); setTemplateFields\(\[\]\); \}\} className="absolute -top-1 -right-1 text-slate-400 hover:text-slate-600">/g,
  '<button type="button" aria-label="Close" onClick={() => { setEditingTemplate(null); setTemplateFields([]); }} className="absolute -top-1 -right-1 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded p-1">'
);

content = content.replace(
  /<button type="button" onClick=\{\(\) => setTemplateFields\(\[\.\.\.templateFields, \{ id: Date\.now\(\), name: '', type: 'string', description: '' \}\]\)\} className="flex items-center gap-1 text-\[9px\] font-bold text-purple-600 hover:text-purple-800 bg-purple-100\/50 hover:bg-purple-100 px-2 py-1 rounded">/g,
  '<button type="button" onClick={() => setTemplateFields([...templateFields, { id: Date.now(), name: \'\', type: \'string\', description: \'\' }])} className="flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-800 bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">'
);

content = content.replace(
  /<button type="submit" className="flex items-center gap-1\.5 px-3 py-1\.5 bg-purple-600 hover:bg-purple-700 text-white text-\[10px\] font-bold rounded shadow transition-colors uppercase tracking-wider">/g,
  '<button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">'
);

// Delete field button
content = content.replace(
  /<button type="button" onClick=\{\(\) => setTemplateFields\(templateFields\.filter\(\(\_, i\) => i !== idx\)\)\} className="p-1 text-slate-300 hover:text-rose-500 transition-colors">/g,
  '<button type="button" aria-label="Remove Field" onClick={() => setTemplateFields(templateFields.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">'
);

// Test sandbox button
content = content.replace(
  /className="px-2 py-1 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 text-\[9px\] font-bold rounded shadow-sm flex items-center gap-1">/g,
  'className="px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 text-xs font-bold rounded-md shadow-sm flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">'
);

// Template list action buttons
content = content.replace(
  /<button onClick=\{\(\) => openEditTemplate\(t\)\} className="p-1\.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded">/g,
  '<button aria-label="Edit Template" onClick={() => openEditTemplate(t)} className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">'
);

content = content.replace(
  /<button onClick=\{\(\) => handleDeleteTemplateLocal\(t\.id\)\} className="p-1\.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">/g,
  '<button aria-label="Delete Template" onClick={() => handleDeleteTemplateLocal(t.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">'
);

// 3. Typography Updates - specifically targeting elements within AI templates section
// Description in template view
content = content.replace(/<p className="text-\[10px\] text-slate-500 mb-2">\{t\.description\}<\/p>/g, '<p className="text-sm text-slate-600 mb-2">{t.description}</p>');

// Template name
content = content.replace(/<h3 className="font-bold text-slate-800 text-xs">\{t\.name\}<\/h3>/g, '<h3 className="font-bold text-slate-800 text-sm">{t.name}</h3>');

// Template edit form labels
content = content.replace(/text-\[9px\] font-bold text-slate-500 uppercase mb-1/g, 'text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5');
content = content.replace(/text-\[10px\] font-bold text-slate-600 uppercase/g, 'text-sm font-bold text-slate-700 uppercase tracking-wide');
content = content.replace(/text-\[10px\] font-bold text-slate-500 uppercase tracking-widest cursor-pointer/g, 'text-xs font-bold text-slate-600 uppercase tracking-wide cursor-pointer ml-1');

// Form input accessibility
content = content.replace(
  /<div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1\.5 rounded" title="Mark as Required Field">/g,
  '<label className="flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-1.5 rounded cursor-pointer transition-colors" title="Mark as Required Field">'
);
content = content.replace(
  /className="cursor-pointer"\n\s*\/>\n\s*<label className="text-xs font-bold text-slate-600 uppercase tracking-wide cursor-pointer ml-1">Req<\/label>\n\s*<\/div>/g,
  'className="cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500" />\n<span className="text-xs font-bold text-slate-600 uppercase tracking-wide ml-1">Req</span>\n</label>'
);

fs.writeFileSync('frontend/src/pages/Admin.jsx', content);
console.log("Updated Admin.jsx");
