const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/FlowBuilder.jsx', 'utf8');

// Imports
content = content.replace(
  /import \{ Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, ArrowUp, ArrowDown \} from 'lucide-react';/,
  "import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, ArrowUp, ArrowDown, Search, AlertTriangle } from 'lucide-react';"
);

// State hooks
content = content.replace(
  /const \[draggedStepIdx, setDraggedStepIdx\] = useState\(null\);/,
  "const [draggedStepIdx, setDraggedStepIdx] = useState(null);\n  const [searchQuery, setSearchQuery] = useState('');\n  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);"
);

// Handle delete
content = content.replace(
  /const handleDelete = async \(profile_name\) => \{\n\s*if \(!window\.confirm\(`Delete workflow \$\{profile_name\}\?`\)\) return;\n\s*try \{\n\s*const token = localStorage\.getItem\("authToken"\);\n\s*await fetch\(\/api\/admin\/workflows\/encodeURIComponent\(profile_name\)\`, \{\n\s*method: 'DELETE',\n\s*headers: token \? \{ "Authorization": `Bearer \$\{token\}` \} : \{\}\n\s*\}\);\n\s*fetchWorkflows\(\);\n\s*\} catch \(err\) \{\n\s*console\.error\(err\);\n\s*\}\n\s*\};/,
  `const handleDelete = (profile_name) => {
    setDeleteConfirmTarget(profile_name);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(\`/api/admin/workflows/\${encodeURIComponent(deleteConfirmTarget)}\`, {
        method: 'DELETE',
        headers: token ? { "Authorization": \`Bearer \${token}\` } : {}
      });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    }
    setDeleteConfirmTarget(null);
  };`
);
// Fallback if the regex fails due to exact spacing
if (content.includes("window.confirm(`Delete workflow ${profile_name}?`)")) {
    const startIdx = content.indexOf("const handleDelete = async (profile_name) => {");
    const endIdx = content.indexOf("};", startIdx) + 2;
    content = content.substring(0, startIdx) + `const handleDelete = (profile_name) => {
    setDeleteConfirmTarget(profile_name);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(\`/api/admin/workflows/\${encodeURIComponent(deleteConfirmTarget)}\`, {
        method: 'DELETE',
        headers: token ? { "Authorization": \`Bearer \${token}\` } : {}
      });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    }
    setDeleteConfirmTarget(null);
  };` + content.substring(endIdx);
}

// Search bar and header
content = content.replace(
  /<div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">\n\s*<div className="flex items-center gap-4">\n\s*<button aria-label="Back to Categories"/,
  `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button aria-label="Back to Categories"`
);
content = content.replace(
  /<button onClick=\{\(\) => openEditor\(null, selectedCategory\)\} className="flex items-center gap-1\.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">\n\s*<Plus className="h-4 w-4" \/> Create Workflow\n\s*<\/button>\n\s*<\/div>/,
  `<div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button onClick={() => openEditor(null, selectedCategory)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0">
              <Plus className="h-4 w-4" /> Create Workflow
            </button>
          </div>
        </div>`
);

// Filter map
content = content.replace(
  /\{\(groupedWorkflows\[selectedCategory\] \|\| \[\]\)\.map\(\(wf\) => \(/,
  `{(groupedWorkflows[selectedCategory] || [])
            .filter(wf => wf.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) || (wf.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
            .map((wf) => (`
);

// Empty state
content = content.replace(
  /\{\(groupedWorkflows\[selectedCategory\] \|\| \[\]\)\.length === 0 && \(\n\s*<div className="col-span-full p-8 text-center text-xs font-bold text-slate-400 italic bg-white rounded-xl border border-slate-200 border-dashed">\n\s*No workflows found in this category\.\n\s*<\/div>\n\s*\)\}/,
  `{((groupedWorkflows[selectedCategory] || []).filter(wf => wf.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) || (wf.description || '').toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
               <Network className="h-10 w-10 text-slate-300 mb-4" />
               <h3 className="text-sm font-bold text-slate-700">No workflows found</h3>
               <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new workflow for {selectedCategory} routing.</p>
               <button onClick={() => openEditor(null, selectedCategory)} className="mt-5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Create Workflow</button>
            </div>
          )}`
);

// Add Delete Modal at the end of the return (before the final closing div of the LIST VIEW)
// It's tricky to insert exactly before the final div of the main return block.
// Let's insert it right after the closing grid div.
content = content.replace(
  /<\/div>\n\s*<\/div>\n\s*\);\n\s*\}\n\n\s*\/\/ EDIT VIEW/,
  `</div>

        {deleteConfirmTarget && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden scale-in">
              <div className="p-6 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="font-black text-slate-900 text-lg mb-2">Delete Workflow</h3>
                <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete <strong className="text-slate-800">{deleteConfirmTarget}</strong>? This action cannot be undone.</p>
                <div className="flex w-full gap-3">
                  <button type="button" onClick={() => setDeleteConfirmTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                  <button type="button" onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // EDIT VIEW`
);

fs.writeFileSync('frontend/src/components/FlowBuilder.jsx', content);
console.log("Updated FlowBuilder.jsx");
