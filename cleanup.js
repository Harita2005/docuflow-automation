const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

const lines = content.split('\n');
// We want to delete lines 823 to 854 (0-indexed 822 to 853) based on the previous view_file output.
// But to be safe, I will find the exact string that is breaking it.
// The broken section starts with `<div className="relative z-10 pt-2 shrink-0">` at the root of the JSX expression, which is invalid JSX because it has no enclosing tag or is in the middle of nowhere.
// Actually, it's just leftover from the previous replacement.
// Let's find: `            {/* Removed OCR and AI parsed badges here per user request */}`
// And `        {/* PANEL B: METADATA & CUSTOM FIELDS (6 cols) */}`
// And delete everything in between except the closing `</div>` for Panel A.

const startMarker = '{/* Removed OCR and AI parsed badges here per user request */}';
const endMarker = '{/* PANEL B: METADATA & CUSTOM FIELDS (6 cols) */}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex > -1 && endIndex > -1) {
  // We expect a structure like:
  //             {/* Removed OCR and AI parsed badges here per user request */}
  //           </div>
  //           <garbage>
  //         </div>
  //         {/* PANEL B...
  
  const before = content.substring(0, startIndex + startMarker.length);
  const after = content.substring(endIndex);
  
  // We just need to close the two divs that are open.
  // One for the `bg-white border p-3 min-h-[400px]`
  // And one for `lg:col-span-6 space-y-4` (Wait, lg:col-span-6 space-y-4 contains the min-h-400px div).
  // Actually, looking at the code:
  // 588:         <div className="lg:col-span-6 space-y-4">
  // 589:           <div className="bg-white border border-slate-200 p-3 rounded-xl flex flex-col min-h-[400px] shadow-sm overflow-hidden">
  // ...
  // 820:             {/* Removed OCR and AI parsed badges here per user request */}
  // 821:           </div>
  // ... GARBAGE ...
  // 855:         </div>
  
  const replacementStr = `
          </div>
        </div>
        `;
        
  content = before + replacementStr + after;
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully cleaned up orphaned JSX.");
} else {
  console.error("Could not find markers to clean up.");
}
