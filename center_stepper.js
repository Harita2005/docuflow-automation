const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

const targetStr = 'className="flex flex-row items-start overflow-x-auto pb-2 w-full pt-1"';
const replacementStr = 'className="flex flex-row items-start overflow-x-auto pb-2 w-fit max-w-full mx-auto pt-1"';

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully centered the stepper to eliminate lopsided empty space.");
} else {
  console.error("Could not find the target string.");
}
