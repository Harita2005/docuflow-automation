const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// The block to extract starts at `{/* Workflow Tracking Segment (Horizontal) */}` 
// and ends right before `\\n      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}`

const startMarker = "{/* Workflow Tracking Segment (Horizontal) */}";
const endMarker = "\\n      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}";
let blockStart = content.indexOf(startMarker);
let blockEnd = content.indexOf(endMarker) + 2; // +2 to remove the literal "\n"

if (blockStart === -1 || blockEnd <= blockStart) {
  console.error("Could not find the block to extract.");
  process.exit(1);
}

// Extract and resize the block
let trackerBlock = content.substring(blockStart, blockEnd);

// Resize the tracker:
trackerBlock = trackerBlock.replace(/min-w-\[160px\]/g, 'min-w-[120px]');
trackerBlock = trackerBlock.replace(/min-w-\[140px\]/g, 'min-w-[100px]');
trackerBlock = trackerBlock.replace(/w-\[140px\]/g, 'w-[100px]');
trackerBlock = trackerBlock.replace(/h-6 w-6/g, 'h-4 w-4');
trackerBlock = trackerBlock.replace(/h-3\.5 w-3\.5/g, 'h-2.5 w-2.5');
trackerBlock = trackerBlock.replace(/h-2 w-2/g, 'h-1.5 w-1.5');
trackerBlock = trackerBlock.replace(/p-4/g, 'p-3');
trackerBlock = trackerBlock.replace(/p-2\.5/g, 'p-1.5');
trackerBlock = trackerBlock.replace(/mb-3/g, 'mb-2');
trackerBlock = trackerBlock.replace(/mt-3/g, 'mt-1.5');
trackerBlock = trackerBlock.replace(/text-xs/g, 'text-[10px]');
trackerBlock = trackerBlock.replace(/mt-2/g, 'mt-1');

// Remove it from its current position
content = content.substring(0, blockStart) + "      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}" + content.substring(blockEnd + endMarker.length - 2);

// Find where to put it at the bottom.
// We should put it after the two panel layout.
// Let's find the closing tag of `<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">`
// Wait, that grid contains panels A, B. It's safer to just put it right before the last closing `</div></div></div>` of the whole page.
// Let's look for:
//        </div>
//      </div>
//    </div>
//  );
//}
//export default DocumentDetails;

const finalReplace = `
        </div>
      </div>
      
      {/* Workflow Tracking Segment (Horizontal, Bottom) */}
      <div className="mt-4">
        ${trackerBlock}
      </div>

    </div>
  );
}`;

const finalTarget = `
        </div>
      </div>
    </div>
  );
}`;

if (content.includes(finalTarget)) {
  content = content.replace(finalTarget, finalReplace);
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully moved and resized horizontal tracker.");
} else {
  console.error("Could not find the end of the file to insert.");
}
