const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/ConditionBuilder.jsx', 'utf8');

// 1. Convert Category Cards to Buttons
content = content.replace(
  /<div key=\{type\} onClick=\{\(\) => setSelectedDocType\(type\)\} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group">/g,
  '<button key={type} onClick={() => setSelectedDocType(type)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">'
);
content = content.replace(
  /<ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" \/>\n\s*<\/div>/g, 
  '<ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />\n                </button>'
);

// 2. Add Doc Type Button
content = content.replace(
  /<button \n\s*onClick=\{handleAddDocType\}\n\s*className="flex items-center gap-1\.5 px-3 py-1\.5 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-\[10px\] uppercase tracking-wider rounded transition-colors"\n\s*>/g,
  '<button onClick={handleAddDocType} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">'
);

// 3. Create Condition Button
content = content.replace(
  /<button \n\s*onClick=\{\(\) => openEditor\(null, selectedDocType\)\} \n\s*className="flex items-center gap-1\.5 px-3 py-1\.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-\[10px\] uppercase tracking-wider rounded transition-colors shadow-sm"\n\s*>/g,
  '<button onClick={() => openEditor(null, selectedDocType)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">'
);

// 4. Aria labels
content = content.replace(/<button onClick=\{\(\) => setShowAddModal\(false\)\}/g, '<button aria-label="Close" onClick={() => setShowAddModal(false)}');
content = content.replace(/<button onClick=\{\(\) => setSelectedDocType\(null\)\}/g, '<button aria-label="Back to Doc Types" onClick={() => setSelectedDocType(null)}');
content = content.replace(/<button type="button" onClick=\{\(\) => openEditor\(r\)\}/g, '<button type="button" aria-label="Edit Condition" onClick={() => openEditor(r)}');
content = content.replace(/<button type="button" onClick=\{\(\) => handleDelete\(r\.id\)\}/g, '<button type="button" aria-label="Delete Condition" onClick={() => handleDelete(r.id)}');

// 5. Add focus rings to some buttons in condition rows
content = content.replace(
  /<button type="button" onClick=\{\(\) => openEditor\(r\)\} className="p-1\.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">/g,
  '<button type="button" aria-label="Edit Condition" onClick={() => openEditor(r)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">'
);
content = content.replace(
  /<button type="button" onClick=\{\(\) => handleDelete\(r\.id\)\} className="p-1\.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">/g,
  '<button type="button" aria-label="Delete Condition" onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">'
);

// Form explicit link id and htmlFor (Condition Details)
content = content.replace(
  /<label className="block text-\[10px\] font-bold text-slate-600 uppercase tracking-wider mb-2">Document Type Name<\/label>\n\s*<input \n\s*type="text"\n\s*value=\{newTypeName\}/g,
  '<label htmlFor="docTypeName" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Document Type Name</label>\n                  <input \n                    id="docTypeName"\n                    type="text"\n                    value={newTypeName}'
);

content = content.replace(
  /<label className="block text-\[10px\] font-bold text-slate-600 uppercase tracking-wider mb-1\.5">Condition Name <span className="text-rose-500">\*<\/span><\/label>\n\s*<input/g,
  '<label htmlFor="condName" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Condition Name <span className="text-rose-500">*</span></label>\n                <input id="condName"'
);

content = content.replace(
  /<label className="block text-\[10px\] font-bold text-slate-600 uppercase tracking-wider mb-1\.5">Description<\/label>\n\s*<textarea/g,
  '<label htmlFor="condDesc" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Description</label>\n                <textarea id="condDesc"'
);

content = content.replace(
  /<label className="block text-\[10px\] font-bold text-slate-600 uppercase tracking-wider mb-1\.5">Evaluate On <span className="text-rose-500">\*<\/span><\/label>\n\s*<select/g,
  '<label htmlFor="evalOn" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Evaluate On <span className="text-rose-500">*</span></label>\n                <select id="evalOn"'
);

// 6. Text sizes and contrast
content = content.replace(/text-\[11px\]/g, 'text-sm');
content = content.replace(/text-\[10px\]/g, 'text-sm');
content = content.replace(/text-\[9px\]/g, 'text-xs');
content = content.replace(/text-\[8px\]/g, 'text-xs');

// Targeted color changes
content = content.replace(/text-slate-400 mt-1/g, 'text-slate-500 mt-1');
content = content.replace(/text-slate-400 mt-0\.5/g, 'text-slate-500 mt-0.5');
content = content.replace(/text-slate-400 uppercase tracking-widest/g, 'text-slate-500 uppercase tracking-wider');
content = content.replace(/text-slate-500 flex items-center/g, 'text-slate-600 flex items-center');

// Focus outlines on standard elements
content = content.replace(/focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none/g, 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none');

fs.writeFileSync('frontend/src/components/ConditionBuilder.jsx', content);
console.log("Updated ConditionBuilder.jsx");
