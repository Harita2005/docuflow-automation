import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  Search,
  GripVertical,
  Check,
  RotateCcw,
  Sliders,
  Database,
  FileText,
  Calculator,
  ArrowUp,
  ArrowDown,
  Layers,
  Save,
  ShieldCheck,
} from "lucide-react";

export interface ConfigFieldItem {
  field_key: string;
  label: string;
  category?: string;
  source?: string; // 'ERP' | 'Document' | 'Calculated'
  display_order?: number;
  is_visible?: boolean;
  sample_value?: string | number | null;
}

// Canonical set of field keys that are permanently displayed in the top summary row.
// These MUST be excluded from the configurable More Info section.
export const FIXED_SUMMARY_FIELD_KEYS = new Set([
  "vendor_name",
  "party_name",
  "supplier_name",
  "vendor",
  "supplier",
  "invoice_number",
  "invoice_date",
  "bill_number",
  "bill_no",
  "bill_date",
  "invoice_num",
  "invoice_num_date",
  "doc_number",
  "document_number",
  "po_number",
  "po_reference",
  "purchase_order_number",
  "po_no",
  "amount",
  "total_amount",
  "total_gross",
  "doc_total",
  "gross_amount",
  "invoice_total",
]);

export const isFixedSummaryField = (key?: string | null): boolean => {
  if (!key) return false;
  return FIXED_SUMMARY_FIELD_KEYS.has(key.toLowerCase().trim());
};

interface MoreInfoConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: string;
  availableFields: ConfigFieldItem[];
  selectedFields: ConfigFieldItem[];
  scope: "USER" | "GLOBAL";
  hasUserOverride: boolean;
  canManageDefault: boolean;
  onSave: (fields: ConfigFieldItem[], saveAsDefault: boolean) => Promise<void>;
  onResetToDefault?: () => Promise<void>;
}

export const MoreInfoConfigDrawer: React.FC<MoreInfoConfigDrawerProps> = ({
  isOpen,
  onClose,
  documentType,
  availableFields,
  selectedFields,
  hasUserOverride,
  canManageDefault,
  onSave,
  onResetToDefault,
}) => {
  const [activeTab, setActiveTab] = useState<"fields" | "order">("fields");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [orderedFieldKeys, setOrderedFieldKeys] = useState<string[]>([]);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Available fields strictly excluding fixed summary fields
  const selectableAvailableFields = useMemo(() => {
    return availableFields.filter((f) => !isFixedSummaryField(f.field_key));
  }, [availableFields]);

  // Track previous isOpen state to only initialize when drawer transitions to open
  const prevIsOpenRef = useRef(false);

  // Initialize or reset drawer state from props ONLY when drawer transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const validSelected = selectedFields.filter((f) => !isFixedSummaryField(f.field_key));
      const keys = new Set(validSelected.map((f) => f.field_key));
      setSelectedKeys(keys);
      setOrderedFieldKeys(validSelected.map((f) => f.field_key));
      setSaveAsDefault(false);
      setSearchQuery("");
      setActiveTab("fields");
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, selectedFields]);

  // Lookup map for fast field detail retrieval
  const fieldCatalogMap = useMemo(() => {
    const map = new Map<string, ConfigFieldItem>();
    selectableAvailableFields.forEach((f) => map.set(f.field_key, f));
    return map;
  }, [selectableAvailableFields]);

  // Filtered fields based on search query
  const filteredAvailableFields = useMemo(() => {
    if (!searchQuery.trim()) return selectableAvailableFields;
    const q = searchQuery.toLowerCase().trim();
    return selectableAvailableFields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.field_key.toLowerCase().includes(q) ||
        (f.category && f.category.toLowerCase().includes(q)) ||
        (f.source && f.source.toLowerCase().includes(q))
    );
  }, [selectableAvailableFields, searchQuery]);

  // Group filtered fields by category
  const categorizedFields = useMemo(() => {
    const groups: Record<string, ConfigFieldItem[]> = {};
    filteredAvailableFields.forEach((field) => {
      const cat = field.category || "ADDITIONAL METADATA";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(field);
    });
    return groups;
  }, [filteredAvailableFields]);

  // Handle single field toggle
  const handleToggleField = (key: string) => {
    setSelectedKeys((prevKeys) => {
      const nextSet = new Set(prevKeys);
      if (nextSet.has(key)) {
        nextSet.delete(key);
      } else {
        nextSet.add(key);
      }
      return nextSet;
    });

    setOrderedFieldKeys((prevOrder) => {
      if (prevOrder.includes(key)) {
        return prevOrder.filter((k) => k !== key);
      } else {
        return [...prevOrder, key];
      }
    });
  };

  // Handle Select All
  const handleSelectAll = () => {
    const allKeys = selectableAvailableFields.map((f) => f.field_key);
    setSelectedKeys(new Set(allKeys));
    setOrderedFieldKeys((prevOrder) => {
      const existingOrder = prevOrder.filter((k) => allKeys.includes(k));
      const newlyAdded = allKeys.filter((k) => !existingOrder.includes(k));
      return [...existingOrder, ...newlyAdded];
    });
  };

  // Handle Clear All
  const handleClearAll = () => {
    setSelectedKeys(new Set());
    setOrderedFieldKeys([]);
  };

  // Handle Move Up in order
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setOrderedFieldKeys((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Handle Move Down in order
  const handleMoveDown = (index: number) => {
    if (index >= orderedFieldKeys.length - 1) return;
    setOrderedFieldKeys((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Drag and drop reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setOrderedFieldKeys((prev) => {
      const copy = [...prev];
      const draggedItem = copy[draggedIndex];
      copy.splice(draggedIndex, 1);
      copy.splice(index, 0, draggedItem);
      return copy;
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Submit Save
  const handleSave = async () => {
    if (orderedFieldKeys.length === 0) {
      alert("Please select at least one field to display in More Info.");
      return;
    }
    setIsSaving(true);
    try {
      const finalItems: ConfigFieldItem[] = orderedFieldKeys
        .map((key, index) => {
          const item = fieldCatalogMap.get(key);
          if (!item) return null;
          return {
            ...item,
            display_order: index + 1,
            is_visible: true,
          };
        })
        .filter(Boolean) as ConfigFieldItem[];

      await onSave(finalItems, saveAsDefault);
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to save field configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Reset to Default
  const handleReset = async () => {
    if (!onResetToDefault) return;
    const confirm = window.confirm(
      `Are you sure you want to reset your personal view for "${documentType}" back to the organization default?`
    );
    if (!confirm) return;
    setIsResetting(true);
    try {
      await onResetToDefault();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to reset configuration.");
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex justify-end animate-in fade-in duration-200">
      {/* Semi-transparent backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Slide-in Drawer Container */}
      <div className="relative w-full max-w-[480px] sm:w-[480px] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 animate-in slide-in-from-right duration-250 select-none">
        
        {/* DRAWER HEADER */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center text-[#003F28] shrink-0">
                <Sliders className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-[14px] font-bold text-slate-900 tracking-tight font-display">
                Configure More Info
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
              Choose the information you want to display for this document.
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                {documentType || "AP INVOICE"}
              </span>
              <span
                className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded border ${
                  hasUserOverride
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {hasUserOverride ? "Personal View Active" : "Default View"}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            title="Close Drawer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* DRAWER TABS & COUNTER */}
        <div className="px-4 pt-2 pb-2 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[10.5px]">
            <button
              onClick={() => setActiveTab("fields")}
              className={`px-2.5 py-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === "fields"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Select Fields</span>
            </button>
            <button
              onClick={() => setActiveTab("order")}
              className={`px-2.5 py-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === "order"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <GripVertical className="h-3 w-3" />
              <span>Reorder ({selectedKeys.size})</span>
            </button>
          </div>

          <div className="text-[10.5px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            <span className="text-[#006747] font-extrabold">{selectedKeys.size}</span> of{" "}
            {selectableAvailableFields.length} selected
          </div>
        </div>

        {/* TAB 1: FIELD SELECTION (CATEGORIZED + SEARCH) */}
        {activeTab === "fields" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Search and Bulk Actions Toolbar */}
            <div className="p-2.5 border-b border-slate-200 bg-slate-50/50 space-y-1.5 shrink-0">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search available fields..."
                  className="w-full pl-8 pr-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-md outline-none focus:border-[#006747] focus:ring-1 focus:ring-[#006747] transition placeholder:text-slate-400 text-slate-800 font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer flex items-center justify-center"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer flex items-center justify-center"
                  >
                    Clear All
                  </button>
                </div>

                {hasUserOverride && onResetToDefault && (
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isResetting}
                    className="text-amber-700 hover:text-amber-800 font-bold flex items-center justify-center gap-1 cursor-pointer transition disabled:opacity-50"
                    title="Revert to organization default view"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset to Default</span>
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Categories & Checklists */}
            <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-2.5 custom-scrollbar">
              {Object.keys(categorizedFields).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-[11px]">
                  No matching fields found for "{searchQuery}".
                </div>
              ) : (
                Object.entries(categorizedFields).map(([categoryName, fields]) => (
                  <div
                    key={categoryName}
                    className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden"
                  >
                    <div className="bg-slate-50/90 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        {categoryName}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded flex items-center justify-center leading-none">
                        {fields.filter((f) => selectedKeys.has(f.field_key)).length} /{" "}
                        {fields.length}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {fields.map((field) => {
                        const isSelected = selectedKeys.has(field.field_key);
                        return (
                          <div
                            key={field.field_key}
                            onClick={() => handleToggleField(field.field_key)}
                            className={`px-3 py-1.5 flex items-center justify-between hover:bg-slate-50/80 cursor-pointer transition ${
                              isSelected ? "bg-emerald-50/30" : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div
                                className={`h-3.5 w-3.5 rounded border flex items-center justify-center transition shrink-0 ${
                                  isSelected
                                    ? "bg-[#006747] border-[#005333] text-white"
                                    : "bg-white border-slate-300"
                                }`}
                              >
                                {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </div>

                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-slate-800 truncate">
                                  {field.label}
                                </div>
                                {field.sample_value && (
                                  <div
                                    className="text-[10px] text-slate-500 truncate font-mono mt-0.5"
                                    title={String(field.sample_value)}
                                  >
                                    {String(field.sample_value)}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Source Badge (ERP / DOCUMENT / CALCULATED) */}
                            <div className="shrink-0 flex items-center pl-2">
                              <span
                                className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-tight uppercase border transition-colors ${
                                  field.source === "ERP"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : field.source === "Calculated"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {field.source === "ERP" ? (
                                  <Database className="h-2.5 w-2.5 text-blue-600 shrink-0" />
                                ) : field.source === "Calculated" ? (
                                  <Calculator className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <FileText className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                                )}
                                <span className="leading-none">{field.source || "ERP"}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FIELD REORDER (DRAG & DROP + UP/DOWN BUTTONS) */}
        {activeTab === "order" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="p-2.5 border-b border-slate-200 bg-slate-50/50 shrink-0">
              <p className="text-[10.5px] text-slate-600">
                Drag items or use the arrows to set the exact display order in More Info.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-1.5 custom-scrollbar">
              {orderedFieldKeys.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-[11px]">
                  No fields selected. Switch to "Select Fields" to choose fields first.
                </div>
              ) : (
                orderedFieldKeys.map((key, index) => {
                  const item = fieldCatalogMap.get(key);
                  if (!item) return null;
                  const isDragging = draggedIndex === index;

                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border bg-white shadow-2xs transition ${
                        isDragging
                          ? "border-[#006747] bg-emerald-50/40 opacity-50 scale-[0.98]"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div
                          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5 shrink-0"
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0 w-4">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 truncate">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {item.category || "Information"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Source Tag */}
                        <span
                          className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border mr-1 ${
                            item.source === "ERP"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : item.source === "Calculated"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {item.source === "ERP" ? (
                            <Database className="h-2.5 w-2.5 text-blue-600 shrink-0" />
                          ) : item.source === "Calculated" ? (
                            <Calculator className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                          ) : (
                            <FileText className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                          )}
                          <span className="leading-none">{item.source || "ERP"}</span>
                        </span>

                        {/* Order buttons */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-0.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer flex items-center justify-center transition"
                          title="Move up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === orderedFieldKeys.length - 1}
                          className="p-0.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer flex items-center justify-center transition"
                          title="Move down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* DRAWER FOOTER */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/80 shrink-0 space-y-2">
          {/* Admin Toggle to Save as Organization Default */}
          {canManageDefault && (
            <label className="flex items-center gap-2 cursor-pointer text-[10.5px] text-slate-700 font-bold p-1.5 rounded-md hover:bg-slate-100/80 border border-slate-200/80 bg-white">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded text-[#006747] focus:ring-[#006747] border-slate-300"
              />
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                <span>Save as organization default for all users</span>
              </div>
            </label>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold transition flex items-center justify-center cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || selectedKeys.size === 0}
              className="px-3.5 py-1 rounded-md bg-[#006747] hover:bg-[#005333] text-white text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
