const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Admin.jsx', 'utf8');

// State hooks
content = content.replace(
  /const \[logSearchQuery, setLogSearchQuery\] = useState\(""\);/,
  "const [logSearchQuery, setLogSearchQuery] = useState(\"\");\n  const [templateSearchQuery, setTemplateSearchQuery] = useState(\"\");\n  const [templateDeleteConfirmTarget, setTemplateDeleteConfirmTarget] = useState(null);\n  const [publishConfirm, setPublishConfirm] = useState(false);"
);

// Publish Confirm
content = content.replace(
  /const publishChanges = async \(\) => \{\n\s*if \(!window\.confirm\("You are about to publish configuration changes to the live system\. Continue\?"\)\) return;\n\s*setPublishing\(true\);/,
  `const publishChanges = () => {
    setPublishConfirm(true);
  };

  const confirmPublish = async () => {
    setPublishConfirm(false);
    
    setPublishing(true);`
);

// Delete Confirm
content = content.replace(
  /const handleDeleteTemplateLocal = \(id\) => \{\n\s*if \(!id\.startsWith\('tmp-'\)\) setDeletedTemplateIds\(\[\.\.\.deletedTemplateIds, id\]\);\n\s*setTemplates\(templates\.filter\(t => t\.id !== id\)\);\n\s*setHasChanges\(true\);\n\s*\};/,
  `const handleDeleteTemplateLocal = (id) => {
    setTemplateDeleteConfirmTarget(id);
  };

  const confirmDeleteTemplate = () => {
    if (!templateDeleteConfirmTarget) return;
    const id = templateDeleteConfirmTarget;
    if (!id.startsWith('tmp-')) setDeletedTemplateIds([...deletedTemplateIds, id]);
    setTemplates(templates.filter(t => t.id !== id));
    setHasChanges(true);
    setTemplateDeleteConfirmTarget(null);
  };`
);

// Templates Header with Search Bar
content = content.replace(
  /<div className="border-b border-slate-100\/80 bg-slate-50\/50 p-2\.5 px-3 flex items-center justify-between">\n\s*<div>\n\s*<h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">\n\s*<Network className="h-4 w-4 text-purple-600" \/>\n\s*Dynamic Data Extraction Templates\n\s*<\/h2>\n\s*<\/div>\n\s*<button\n\s*onClick=\{\(\) => openEditTemplate\(null\)\}\n\s*className="flex items-center gap-1\.5 px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"\n\s*>\n\s*<Plus className="h-3\.5 w-3\.5" \/> New Template\n\s*<\/button>\n\s*<\/div>/,
  `<div className="border-b border-slate-100/80 bg-slate-50/50 p-2.5 px-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
              <Network className="h-4 w-4 text-purple-600" />
              Dynamic Data Extraction Templates
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search templates..."
                value={templateSearchQuery}
                onChange={e => setTemplateSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium"
              />
            </div>
            <button
              onClick={() => openEditTemplate(null)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 shrink-0"
            >
              <Plus className="h-4 w-4" /> New Template
            </button>
          </div>
        </div>`
);
// Fix the button that got replaced with purple-600 instead of purple-50
content = content.replace(
  /<button\n\s*onClick=\{\(\) => openEditTemplate\(null\)\}\n\s*className="flex items-center gap-1\.5 px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"\n\s*>\n\s*<Plus className="h-4 w-4" \/> New Template\n\s*<\/button>/,
  `          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search templates..."
                value={templateSearchQuery}
                onChange={e => setTemplateSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium shadow-sm"
              />
            </div>
            <button
              onClick={() => openEditTemplate(null)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 shrink-0"
            >
              <Plus className="h-4 w-4" /> New Template
            </button>
          </div>`
);


// Templates List - Empty State and Map
content = content.replace(
  /\{templates\.length === 0 \? \(\n\s*<div className="p-8 text-center text-slate-400 text-xs font-bold">No templates configured yet\.<\/div>\n\s*\) : \(\n\s*templates\.map\(t => \{/,
  `{templates.filter(t => t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) || (t.description||'').toLowerCase().includes(templateSearchQuery.toLowerCase())).length === 0 ? (
               <div className="py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed m-4">
                 <Network className="h-10 w-10 text-slate-300 mb-4" />
                 <h3 className="text-sm font-bold text-slate-700">No templates found</h3>
                 <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new AI Extraction Template.</p>
                 <button onClick={() => openEditTemplate(null)} className="mt-5 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">Create Template</button>
               </div>
            ) : (
               templates.filter(t => t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) || (t.description||'').toLowerCase().includes(templateSearchQuery.toLowerCase())).map(t => {`
);

// Add Modals to the end of the file, just before the final `</div>`
content = content.replace(
  /<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*\);\n\s*\}\n\nexport default Admin;/,
  `</div>
      </div>
      
      {/* Modals */}
      {templateDeleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden scale-in">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="font-black text-slate-900 text-lg mb-2">Delete Template</h3>
              <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete this template? This action cannot be undone.</p>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setTemplateDeleteConfirmTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                <button type="button" onClick={confirmDeleteTemplate} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {publishConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden scale-in">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
                <Send className="h-6 w-6" />
              </div>
              <h3 className="font-black text-slate-900 text-lg mb-2">Publish Configuration</h3>
              <p className="text-sm text-slate-500 mb-6">You are about to publish all configuration changes to the live system. This will affect all future transactions immediately. Continue?</p>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setPublishConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                <button type="button" onClick={confirmPublish} className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Publish</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Admin;`
);

fs.writeFileSync('frontend/src/pages/Admin.jsx', content);
console.log("Updated Admin.jsx");
