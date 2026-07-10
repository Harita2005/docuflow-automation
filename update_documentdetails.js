const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/DocumentDetails.tsx', 'utf8');

// 1. Remove the old Workflow Tracking Segment
const oldTrackingSegment = `{/* Workflow Tracking Segment */}
                {activeApprovalLog && (
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <div className="mb-2">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                        Live Approval Chain ({activeApprovalLog.workflow_profile})
                      </span>
                    </div>
                    {workflowStepDefinitions.length === 0 ? (
                      <div className="text-[10px] text-slate-500 font-bold p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-slate-400" />
                        <span>No approval stages are configured for this routing profile.</span>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        {workflowStepDefinitions.map((step, idx) => {
                          const isPast = step.stage_number < activeApprovalLog.current_stage_number || activeApprovalLog.status === "Approved";
                          const isCurrent = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Pending";
                          const isRejected = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Rejected";

                          let iconBg = "bg-slate-200";
                          let ringColor = "ring-slate-50";
                          let badgeColor = "bg-slate-100 text-slate-500 border border-slate-200";
                          let statusText = "Waiting";

                          if (isPast) {
                            iconBg = "bg-emerald-500";
                            ringColor = "ring-emerald-50";
                            badgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-200";
                            statusText = "Approved";
                          } else if (isCurrent) {
                            iconBg = "bg-blue-500";
                            ringColor = "ring-blue-50";
                            badgeColor = "bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-100 shadow-sm";
                            statusText = "Pending";
                          } else if (isRejected) {
                            iconBg = "bg-red-500";
                            ringColor = "ring-red-50";
                            badgeColor = "bg-red-50 text-red-700 border border-red-200";
                            statusText = "Rejected";
                          }

                          return (
                            <div key={idx} className="flex relative">
                              {idx !== workflowStepDefinitions.length - 1 && (
                                <div className="absolute top-6 left-[7px] w-0.5 h-full bg-slate-200 -z-0" />
                              )}
                              
                              <div className="relative z-10 pt-2 shrink-0">
                                <div className={\`h-4 w-4 rounded-full flex items-center justify-center ring-4 \${ringColor} \${iconBg}\`}>
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
                              
                              <div className="ml-4 flex-1 bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm flex items-center justify-between hover:border-slate-300 hover:shadow transition-all relative z-10">
                                <div>
                                  <div className="font-bold text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">Stage {step.stage_number}</div>
                                  <div className="text-[10px] font-bold text-slate-700">{step.approver_target}</div>
                                </div>
                                <div className={\`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md \${badgeColor}\`}>
                                  {statusText}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}`;

// Handle windows newlines just in case
const normalizeStr = str => str.replace(/\\r\\n/g, '\\n').replace(/\\s+/g, ' ').trim();
const normalizedContent = normalizeStr(content);
const normalizedOld = normalizeStr(oldTrackingSegment);

if (!normalizedContent.includes(normalizedOld)) {
   console.log("Could not find the exact old block, falling back to substring replacement.");
   // Fallback: finding start and end indexes
   const startIdx = content.indexOf("{/* Workflow Tracking Segment */}");
   const endIdxStr = "                )}";
   const endIdx = content.indexOf(endIdxStr, content.indexOf("Live Approval Chain", startIdx)) + endIdxStr.length;
   
   if(startIdx > -1 && endIdx > startIdx) {
       content = content.substring(0, startIdx) + content.substring(endIdx);
   } else {
       console.error("Critical failure finding block bounds");
   }
} else {
   // Precise whitespace-agnostic replace is hard, so we use start/end finding anyway
   const startIdx = content.indexOf("{/* Workflow Tracking Segment */}");
   let endIdxStr = "                )}";
   let endIdx = content.indexOf(endIdxStr, content.indexOf("Live Approval Chain", startIdx));
   if(endIdx > -1) {
       content = content.substring(0, startIdx) + content.substring(endIdx + endIdxStr.length);
   }
}

// 2. Insert the NEW Horizontal Tracking Segment at the top
const newHorizontalTrackingSegment = `
      {/* Workflow Tracking Segment (Horizontal) */}
      {activeApprovalLog && (
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-4">
          <div className="mb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-bold block">
              Live Approval Chain <span className="text-blue-600">({activeApprovalLog.workflow_profile})</span>
            </span>
          </div>
          {workflowStepDefinitions.length === 0 ? (
            <div className="text-xs text-slate-500 font-bold p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-slate-400" />
              <span>No approval stages are configured for this routing profile.</span>
            </div>
          ) : (
            <div className="flex flex-row items-start overflow-x-auto pb-2 w-full pt-1">
              {workflowStepDefinitions.map((step, idx) => {
                const isPast = step.stage_number < activeApprovalLog.current_stage_number || activeApprovalLog.status === "Approved";
                const isCurrent = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Pending";
                const isRejected = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Rejected";

                let iconBg = "bg-slate-200";
                let ringColor = "ring-slate-50";
                let badgeColor = "bg-slate-100 text-slate-500 border border-slate-200";
                let statusText = "Waiting";

                if (isPast) {
                  iconBg = "bg-emerald-500";
                  ringColor = "ring-emerald-50";
                  badgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-200";
                  statusText = "Approved";
                } else if (isCurrent) {
                  iconBg = "bg-blue-500";
                  ringColor = "ring-blue-50";
                  badgeColor = "bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-100 shadow-sm";
                  statusText = "Pending";
                } else if (isRejected) {
                  iconBg = "bg-red-500";
                  ringColor = "ring-red-50";
                  badgeColor = "bg-red-50 text-red-700 border border-red-200";
                  statusText = "Rejected";
                }

                return (
                  <div key={idx} className={\`flex flex-col relative shrink-0 \${idx !== workflowStepDefinitions.length - 1 ? 'flex-1 min-w-[160px]' : 'min-w-[140px]'}\`}>
                    <div className="flex items-center w-full">
                      {/* The Dot */}
                      <div className={\`relative z-10 shrink-0 h-6 w-6 rounded-full flex items-center justify-center ring-4 \${ringColor} \${iconBg}\`}>
                        {isPast ? (
                          <Check className="h-3.5 w-3.5 text-white" />
                        ) : isRejected ? (
                          <X className="h-3.5 w-3.5 text-white" />
                        ) : isCurrent ? (
                          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-slate-400" />
                        )}
                      </div>
                      {/* The Line */}
                      {idx !== workflowStepDefinitions.length - 1 && (
                        <div className={\`flex-1 h-1 mx-2 rounded-full \${isPast ? 'bg-emerald-500' : 'bg-slate-200'}\`} />
                      )}
                    </div>
                    
                    {/* The Label */}
                    <div className="mt-3 bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm flex flex-col w-[140px] hover:border-slate-300 hover:shadow transition-all">
                      <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Stage {step.stage_number}</div>
                      <div className="text-xs font-bold text-slate-700 truncate" title={step.approver_target}>{step.approver_target}</div>
                      <div className={\`mt-2 text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded text-center \${badgeColor}\`}>
                        {statusText}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
`;

content = content.replace("{/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}", newHorizontalTrackingSegment + "\\n      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}");

fs.writeFileSync('frontend/src/components/DocumentDetails.tsx', content);
console.log("Updated DocumentDetails.tsx");
