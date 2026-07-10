const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// Restore w-full on the flex row container
content = content.replace(
  'className="flex flex-row items-start overflow-x-auto pb-2 w-fit max-w-full mx-auto pt-1"',
  'className="flex flex-row items-start justify-between overflow-x-auto pb-2 w-full pt-1"'
);

// Replace the stepper item rendering block
const oldBlockStart = `                  <div key={idx} className={\`flex flex-col relative shrink-0 \${idx !== workflowStepDefinitions.length - 1 ? 'w-[180px]' : 'w-[100px]'}\`}>`;
const oldBlockEnd = `                  </div>
                );
              })}
            </div>
          )}
      </div>
      </div>
    </div>
  );
}`;

// I'll just use indexOf to extract the block to replace, from oldBlockStart to `<div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Stage {step.stage_number}</div>` and replace it perfectly.

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

// Find the section to replace:
const regex = /<div key=\{idx\} className=\{`flex flex-col relative shrink-0[^>]+>\s*<div className="flex items-center w-full">[\s\S]*?{idx !== workflowStepDefinitions\.length - 1 && \(\s*<div className=\{`flex-1 h-1 mx-2 rounded-full[^>]+><\/div>\s*\)}\s*<\/div>\s*\{\/\* The Label \*\/\}\s*<div className="mt-1\.5 bg-white border border-slate-200 rounded-lg p-1\.5 shadow-sm flex flex-col w-\[100px\] hover:border-slate-300 hover:shadow transition-all">/;

if (regex.test(content)) {
  content = content.replace(regex, newStepperItem);
  fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
  console.log("Successfully converted stepper to a centered, stretchable layout.");
} else {
  console.error("Could not match the regex for the stepper block.");
}
