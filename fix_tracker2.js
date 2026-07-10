const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// First, fix the literal `\n` that was injected at line 664.
content = content.replace(/\\n\s*\{\/\* TWO-PANEL TOP \+ FULL WIDTH BOTTOM LAYOUT \*\/\}/g, "      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}");

// Extract the tracking block (horizontal)
const startMarker = "{/* Workflow Tracking Segment (Horizontal) */}";
// Wait, the previous run didn't move it because it failed at the end, but it MIGHT have replaced the literal \n already? No, the previous script read the file, didn't find finalTarget, and didn't write.
// Let's check if the block is still there.
let blockStart = content.indexOf(startMarker);
let blockEnd = content.indexOf("{/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}"); // End of block

if (blockStart > -1 && blockEnd > blockStart) {
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
  trackerBlock = trackerBlock.replace(/text-xs/g, 'text-[9px]');
  trackerBlock = trackerBlock.replace(/mt-2/g, 'mt-1');

  // Remove the block from its current location
  content = content.substring(0, blockStart) + content.substring(blockEnd);

  // Insert it near the end of the file
  const finalTarget = `      </div>\n      </div>\n    </div>\n  );\n}`;
  const finalTargetAlt = `      </div>\n    </div>\n  );\n}`;
  
  const insertPayload = `
      {/* Workflow Tracking Segment (Horizontal, Bottom) */}
      <div className="mt-4 w-full">
        ${trackerBlock}
      </div>
      </div>
    </div>
  );
}`;

  if (content.includes("      </div>\n      </div>\n    </div>\n  );\n}")) {
      content = content.replace("      </div>\n      </div>\n    </div>\n  );\n}", insertPayload);
      console.log("Moved to bottom using first target.");
  } else if (content.includes("      </div>\n    </div>\n  );\n}")) {
      content = content.replace("      </div>\n    </div>\n  );\n}", insertPayload.replace("      </div>\n      </div>\n", "      </div>\n"));
      console.log("Moved to bottom using alt target.");
  } else {
      // Find the last `</div>` manually
      const lastDivIndex = content.lastIndexOf("</div>");
      const before = content.substring(0, lastDivIndex);
      const after = content.substring(lastDivIndex);
      content = before + `
      {/* Workflow Tracking Segment (Horizontal, Bottom) */}
      <div className="mt-4 w-full">
        ${trackerBlock}
      </div>\n` + after;
      console.log("Moved to bottom by finding last div.");
  }

  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
} else {
  console.log("Block not found.");
}
