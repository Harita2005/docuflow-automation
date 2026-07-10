const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// The current code has:
// className={`flex flex-col relative shrink-0 ${idx !== workflowStepDefinitions.length - 1 ? 'flex-1 min-w-[120px]' : 'min-w-[100px]'}`}
// We want to replace it with:
// className={`flex flex-col relative shrink-0 ${idx !== workflowStepDefinitions.length - 1 ? 'w-[180px]' : 'w-[100px]'}`}

const targetStr = "${idx !== workflowStepDefinitions.length - 1 ? 'flex-1 min-w-[120px]' : 'min-w-[100px]'}";
const replacementStr = "${idx !== workflowStepDefinitions.length - 1 ? 'w-[180px]' : 'w-[100px]'}";

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully fixed massive gap in stepper layout.");
} else {
  console.error("Could not find the target string.");
}
