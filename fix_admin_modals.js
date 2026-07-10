const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Admin.jsx', 'utf8');

const modals = `
    {/* Publish Confirm Modal */}
    {publishConfirm && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Publish Configuration</h3>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to publish all draft modifications? This action will overwrite the live system configuration.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setPublishConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmPublish}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition"
            >
              Publish Now
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Template Delete Confirm Modal */}
    {templateDeleteConfirmTarget && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Template</h3>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete this AI extraction template? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setTemplateDeleteConfirmTarget(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteTemplate}
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
`;

const endTags = `  </div>
  </div>
</div>
);
}`;

content = content.replace(endTags, modals + '\n' + endTags);
fs.writeFileSync('frontend/src/pages/Admin.jsx', content);
console.log("Successfully added Publish and Template Delete modals.");
