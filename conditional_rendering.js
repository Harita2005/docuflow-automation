const fs = require('fs');

let frontendPath = 'frontend/src/components/ConditionBuilder.jsx';
let frontendContent = fs.readFileSync(frontendPath, 'utf8');

// The block to replace for the operator dropdown:
const oldOperatorBlock = `                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator <span className="text-rose-500">*</span></label>
                      <select 
                        value={c.operator}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].operator = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium"
                      >
                        <option value="Greater Than">Greater Than</option>
                        <option value="Less Than">Less Than</option>
                        <option value="Equals">Equals</option>
                        <option value="Contains">Contains</option>
                      </select>
                    </div>`;

const newOperatorBlock = `                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator <span className="text-rose-500">*</span></label>
                      <select 
                        value={c.operator}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].operator = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium"
                      >
                        {c.field && c.field.includes('Amount') ? (
                          <>
                            <option value="Greater Than">Greater Than</option>
                            <option value="Less Than">Less Than</option>
                            <option value="Equals">Equals</option>
                          </>
                        ) : (
                          <>
                            <option value="Equals">Equals</option>
                            <option value="Contains">Contains</option>
                            <option value="Not Equals">Not Equals</option>
                          </>
                        )}
                      </select>
                    </div>`;

frontendContent = frontendContent.replace(oldOperatorBlock, newOperatorBlock);

// The block to replace for the currency dropdown:
const oldCurrencyBlock = `                    <div className="col-span-1 flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Currency</label>
                        <select className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium">
                          <option>INR - Indian Rupee</option>
                          <option>USD - US Dollar</option>
                        </select>
                      </div>`;

const newCurrencyBlock = `                    <div className="col-span-1 flex gap-2">
                      {c.field && c.field.includes('Amount') && (
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Currency</label>
                          <select className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium">
                            <option>INR - Indian Rupee</option>
                            <option>USD - US Dollar</option>
                          </select>
                        </div>
                      )}`;

frontendContent = frontendContent.replace(oldCurrencyBlock, newCurrencyBlock);

fs.writeFileSync(frontendPath, frontendContent);
console.log("Updated ConditionBuilder.jsx to render fields conditionally.");
