const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// Restore w-full on the flex row container
content = content.replace(
  'className="flex flex-row items-start overflow-x-auto pb-2 w-fit max-w-full mx-auto pt-1"',
  'className="flex flex-row items-start overflow-x-auto pb-2 w-full pt-1"'
);

const newStepperItem = `                  <div key={idx} className="flex flex-col relative shrink-0 flex-1 min-w-[120px] items-center">
                    <div className="w-full relative flex items-center justify-center h-4">
                      {/* The Line */}
                      {idx !== workflowStepDefinitions.length - 1 && (
                        <div className={\`absolute left-1/2 w-full h-1 \${isPast ? 'bg-emerald-500' : 'bg-slate-200'}\`} />
                      )}
                      
                      {/* The Dot */}
                      <div className={\`relative z-10 shrink-0 h-4 w-4 rounded-full flex items-center justify-center ring-4 \${ringColor} \${iconBg}\`}>
                        {isPast ? (
                          <Check className="h-2.5 w-2.5 text-white" />
                        ) : isRejected ? (
                          <X className="h-2.5 w-2.5 text-white" />
                        ) : isCurrent ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        )}
                      </div>
                    </div>
                    
                    {/* The Label */}
                    <div className="mt-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm flex flex-col w-[110px] items-center text-center hover:border-slate-300 hover:shadow transition-all">`;

const startMarker = "return (\n                  <div key={idx} className=";
const endMarker = '<div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">';

let startIndex = content.indexOf(startMarker);
let endIndex = content.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + "return (\n" + newStepperItem + "\n                      " + content.substring(endIndex);
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully converted stepper to a centered, stretchable layout.");
} else {
  console.log("Markers not found");
}
