const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/ConditionBuilder.jsx', 'utf8');

// Imports
content = content.replace(
  /import \{ Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, CornerDownRight \} from 'lucide-react';/,
  "import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, CornerDownRight, Search, AlertTriangle } from 'lucide-react';"
);

// State hooks
content = content.replace(
  /const \[newTypeName, setNewTypeName\] = useState\(""\);/,
  "const [newTypeName, setNewTypeName] = useState(\"\");\n  const [searchQuery, setSearchQuery] = useState('');\n  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);"
);

// Handle delete
content = content.replace(
  /const handleDelete = \(id\) => \{\n\s*if \(window\.confirm\("Are you sure you want to delete this condition\?"\)\) \{\n\s*if \(handleDeleteRuleLocal\) \{\n\s*handleDeleteRuleLocal\(id\);\n\s*\} else \{\n\s*setRules\(rules\.filter\(r => r\.id !== id\)\);\n\s*setHasChanges\(true\);\n\s*\}\n\s*\}\n\s*\};/,
  `const handleDelete = (id) => {
    setDeleteConfirmTarget(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmTarget) return;
    if (handleDeleteRuleLocal) {
      handleDeleteRuleLocal(deleteConfirmTarget);
    } else {
      setRules(rules.filter(r => r.id !== deleteConfirmTarget));
      setHasChanges(true);
    }
    setDeleteConfirmTarget(null);
  };`
);

// Search bar and header
content = content.replace(
  /<div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">\n\s*<div className="flex items-center gap-4">\n\s*<button aria-label="Back to Doc Types"/,
  `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button aria-label="Back to Doc Types"`
);
content = content.replace(
  /<button onClick=\{\(\) => openEditor\(null, selectedDocType\)\} className="flex items-center gap-1\.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">\n\s*<Plus className="h-4 w-4" \/> Create Condition\n\s*<\/button>\n\s*<\/div>/,
  `<div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search conditions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button onClick={() => openEditor(null, selectedDocType)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0">
              <Plus className="h-4 w-4" /> Create Condition
            </button>
          </div>
        </div>`
);

// Filter map
content = content.replace(
  /\{\(groupedRules\[selectedDocType\] \|\| \[\]\)\.sort\(\(a,b\)=>a\.priority-b\.priority\)\.map\(\(r\) => \{/,
  `{(groupedRules[selectedDocType] || [])
            .filter(r => (r.rule_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a,b)=>a.priority-b.priority).map((r) => {`
);

// Empty state
content = content.replace(
  /\{\(groupedRules\[selectedDocType\] \|\| \[\]\)\.length === 0 && \(\n\s*<div className="p-8 text-center text-xs font-bold text-slate-400 italic bg-white rounded-xl border border-slate-200 border-dashed">\n\s*No conditions defined for \{selectedDocType\}\.\n\s*<\/div>\n\s*\)\}/,
  `{((groupedRules[selectedDocType] || []).filter(r => (r.rule_name || '').toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
               <Settings2 className="h-10 w-10 text-slate-300 mb-4" />
               <h3 className="text-sm font-bold text-slate-700">No conditions found</h3>
               <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new routing condition for {selectedDocType}.</p>
               <button onClick={() => openEditor(null, selectedDocType)} className="mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Create Condition</button>
            </div>
          )}`
);

// Add Delete Modal
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
                <h3 className="font-black text-slate-900 text-lg mb-2">Delete Condition</h3>
                <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete this condition? This action cannot be undone.</p>
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

fs.writeFileSync('frontend/src/components/ConditionBuilder.jsx', content);
console.log("Updated ConditionBuilder.jsx");
