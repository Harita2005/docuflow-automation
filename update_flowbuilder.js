const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/FlowBuilder.jsx', 'utf8');

// 1. Add ArrowUp, ArrowDown imports
content = content.replace('import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight }', 'import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, ArrowUp, ArrowDown }');

const moveFns = `
  const moveStepUp = (idx) => {
    if (idx === 0) return;
    const newSteps = [...editingWorkflow.steps];
    const temp = newSteps[idx - 1];
    newSteps[idx - 1] = newSteps[idx];
    newSteps[idx] = temp;
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };

  const moveStepDown = (idx) => {
    if (idx === editingWorkflow.steps.length - 1) return;
    const newSteps = [...editingWorkflow.steps];
    const temp = newSteps[idx + 1];
    newSteps[idx + 1] = newSteps[idx];
    newSteps[idx] = temp;
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };
`;
// 2. Add moveStep functions after deleteStep
content = content.replace('const deleteStep = (idx) => {\n    const newSteps = editingWorkflow.steps.filter((_, i) => i !== idx);\n    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });\n  };', 'const deleteStep = (idx) => {\n    const newSteps = editingWorkflow.steps.filter((_, i) => i !== idx);\n    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });\n  };\n' + moveFns);

// Category Cards to Buttons
content = content.replace(
  /<div key=\{cat\} onClick=\{\(\) => setSelectedCategory\(cat\)\} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group">/g,
  '<button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">'
);
content = content.replace(
  /<ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" \/>\n\s*<\/div>/g, 
  '<ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />\n              </button>'
);

// Add Category Button
content = content.replace(
  /<button \n\s*onClick=\{handleAddCategory\}\n\s*className="flex items-center gap-1\.5 px-3 py-1\.5 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-\[10px\] uppercase tracking-wider rounded transition-colors"\n\s*>/g,
  '<button onClick={handleAddCategory} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">'
);

// Create Workflow Button
content = content.replace(
  /<button \n\s*onClick=\{\(\) => openEditor\(null, selectedCategory\)\} \n\s*className="flex items-center gap-1\.5 px-3 py-1\.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-\[10px\] uppercase tracking-wider rounded transition-colors shadow-sm"\n\s*>/g,
  '<button onClick={() => openEditor(null, selectedCategory)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">'
);

// Aria labels
content = content.replace(/<button onClick=\{\(\) => setShowAddModal\(false\)\}/g, '<button aria-label="Close" onClick={() => setShowAddModal(false)}');
content = content.replace(/<button onClick=\{\(\) => setSelectedCategory\(null\)\}/g, '<button aria-label="Back to Categories" onClick={() => setSelectedCategory(null)}');
content = content.replace(/<button onClick=\{\(\) => openEditor\(wf\)\}/g, '<button aria-label="Edit Workflow" onClick={() => openEditor(wf)}');
content = content.replace(/<button onClick=\{\(\) => handleDelete\(wf\.profile_name\)\}/g, '<button aria-label="Delete Workflow" onClick={() => handleDelete(wf.profile_name)}');

// Form explicitly linking id and htmlFor
content = content.replace(
  /<label className="block text-\[10px\] font-bold text-slate-600 uppercase tracking-wider mb-2">Category Name<\/label>\n\s*<input \n\s*type="text"\n\s*value=\{newCategoryName\}/g,
  '<label htmlFor="categoryName" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Category Name</label>\n                  <input \n                    id="categoryName"\n                    type="text"\n                    value={newCategoryName}'
);

content = content.replace(
  /<label className="block text-\[10px\] font-bold uppercase tracking-wider text-slate-500 mb-1">Workflow Name <span className="text-rose-500">\*<\/span><\/label>\n\s*<input required value=\{editingWorkflow\.profile_name\}/g,
  '<label htmlFor="wfName" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Name <span className="text-rose-500">*</span></label>\n                <input id="wfName" required value={editingWorkflow.profile_name}'
);
content = content.replace(
  /<label className="block text-\[10px\] font-bold uppercase tracking-wider text-slate-500 mb-1">Workflow Code<\/label>\n\s*<input value=\{editingWorkflow\.workflow_code \|\| ''\}/g,
  '<label htmlFor="wfCode" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Code</label>\n                <input id="wfCode" value={editingWorkflow.workflow_code || \'\'}'
);
content = content.replace(
  /<label className="block text-\[10px\] font-bold uppercase tracking-wider text-slate-500 mb-1">Workflow Type<\/label>\n\s*<select value=\{editingWorkflow\.workflow_type \|\| ''\}/g,
  '<label htmlFor="wfType" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Type</label>\n                <select id="wfType" value={editingWorkflow.workflow_type || \'\'}'
);
content = content.replace(
  /<label className="block text-\[10px\] font-bold uppercase tracking-wider text-slate-500 mb-1">Description<\/label>\n\s*<input value=\{editingWorkflow\.description \|\| ''\}/g,
  '<label htmlFor="wfDesc" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Description</label>\n                <input id="wfDesc" value={editingWorkflow.description || \'\'}'
);

// Step reordering buttons
const actionButtons = `<div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => moveStepUp(idx)} disabled={idx === 0} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Move Step Up">
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => moveStepDown(idx)} disabled={idx === editingWorkflow.steps.length - 1} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Move Step Down">
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteStep(idx)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Remove Step">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>`;
content = content.replace(/<button type="button" onClick=\{\(\) => deleteStep\(idx\)\} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors" title="Remove Step">\s*<Trash2 className="h-4 w-4" \/>\s*<\/button>/g, actionButtons);

// General text size replacements (safe ones)
content = content.replace(/text-\[10px\]/g, 'text-sm');
content = content.replace(/text-\[9px\]/g, 'text-xs');
content = content.replace(/text-\[8px\]/g, 'text-xs');
content = content.replace(/text-\[11px\]/g, 'text-sm');

// Specific targeted colors
content = content.replace(/text-slate-400 mt-1/g, 'text-slate-500 mt-1');
content = content.replace(/text-slate-400 mt-0\.5/g, 'text-slate-500 mt-0.5');
content = content.replace(/text-slate-300 opacity-0 group-hover:opacity-100/g, 'text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100');
content = content.replace(/text-slate-400 uppercase tracking-widest/g, 'text-slate-500 uppercase tracking-wider');
content = content.replace(/text-slate-500 flex items-center/g, 'text-slate-600 flex items-center');

fs.writeFileSync('frontend/src/components/FlowBuilder.jsx', content);
console.log("Updated FlowBuilder.jsx");
