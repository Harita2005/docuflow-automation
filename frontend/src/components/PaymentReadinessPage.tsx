import { useState, useEffect } from "react";
import { DollarSign, ShieldAlert, CreditCard, Send, CheckCircle2, CloudLightning, Landmark, Calendar, RefreshCw, Send as SendIcon, CheckSquare } from "lucide-react";

interface PaymentReadinessPageProps {
  onRefreshStats: () => void;
}

export default function PaymentReadinessPage({ onRefreshStats }: PaymentReadinessPageProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [readyList, setReadyList] = useState<any[]>([]);
  const [paidList, setPaidList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Disbursement state
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Corporate Wire (FedNow)");
  const [disbursing, setDisbursing] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setInvoices(data);
        
        // Filter invoices in 'Ready for Payment' and 'Paid' states
        setReadyList(data.filter((i: any) => i.status === "Ready for Payment"));
        setPaidList(data.filter((i: any) => i.status === "Paid"));
      }
    } catch (e) {
      console.error("Failed to load payment queue stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDisbursePayout = async () => {
    if (!selectedInvoice) return;
    
    setDisbursing(true);
    const txnReference = "TXN-" + Math.floor(100000 + Math.random() * 900000);
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          transactionId: txnReference
        })
      });

      if (response.ok) {
        setPayoutSuccess(`PAYOUT ROUTED ON SECURE GATEWAY! REFERENCE: ${txnReference}`);
        setSelectedInvoice(null);
        fetchData();
        onRefreshStats(); 
        setTimeout(() => setPayoutSuccess(null), 5000);
      } else {
        const err = await response.json();
        alert(`Disbursement stalled: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDisbursing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn w-full">
      
      {/* Title blocks */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-800 tracking-tight">
            Treasury & Disbursement clearance
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Disburse funds and process physical bank wire transfers for vouchers cleared by internal corporate compliance.
          </p>
        </div>
        <div className="text-right text-xs bg-slate-100 border border-slate-200/60 px-3 py-1.5 rounded-lg text-slate-650 font-bold flex items-center gap-2">
          <Landmark className="h-4.5 w-4.5 text-blue-600" />
          <span>FEDWIRE SYSTEM STATUS: </span>
          <span className="text-green-600 font-extrabold uppercase animate-pulse">ONLINE</span>
        </div>
      </div>

      {payoutSuccess && (
        <div className="bg-emerald-600 text-white rounded-xl p-4 font-sans font-bold text-xs uppercase shadow-lg shadow-emerald-500/10 tracking-wider flex items-center justify-between animate-fadeIn">
          <span>★ {payoutSuccess}</span>
          <span className="text-[10px] bg-emerald-700 px-2.5 py-0.5 rounded-md">TRANSACTION SETTLED</span>
        </div>
      )}

      {/* Main layout splittings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Pending ready list */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <CheckSquare className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="font-bold text-xs uppercase text-slate-800 tracking-wide">
                Approved supplier vouchers ready for payment ({readyList.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">
                PULLING DISBURSEMENT GENERAL LEDGER...
              </div>
            ) : readyList.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl text-slate-450 text-xs leading-relaxed max-w-md mx-auto">
                No invoices are currently resting in the readiness bin. Fully sign off on pending workflows in the "Approval queue" tab to route them here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {readyList.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoice(inv)}
                    className={`py-4 px-3 rounded-xl hover:bg-slate-55/65 cursor-pointer transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      selectedInvoice?.id === inv.id ? "bg-emerald-50/45 border-l-4 border-emerald-500 shadow-inner" : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-slate-800 text-sm tracking-tight">{inv.vendor_name}</span>
                        <span className="font-mono text-[10.5px] bg-slate-100 border text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                          {inv.tracking_id ? `${inv.tracking_id} | Ref: ${inv.invoice_number}` : `Ref: ${inv.invoice_number}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-450 font-medium flex items-center gap-x-3 flex-wrap">
                        <span>PO Ref: <strong className="text-slate-600 font-mono">{inv.po_number || "DIRECT-AP"}</strong></span>
                        <span>•</span>
                        <span>Billing Date: {inv.invoice_date}</span>
                        <span>•</span>
                        <span>Tax Class: {inv.tax_details || "Exempt"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <strong className="text-slate-800 font-sans font-black text-sm">₹{inv.amount.toLocaleString()}</strong>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-250/60 font-sans font-bold uppercase tracking-wider text-[9.5px] px-2.5 py-0.5 rounded-md">
                        CLEARED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paid Archive */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <CheckCircle2 className="h-4.5 w-4.5 text-slate-450 animate-pulse" />
              <h3 className="font-bold text-xs uppercase text-slate-500 tracking-wide">
                Payment History ({paidList.length})
              </h3>
            </div>

            {paidList.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                No disbursed transactions registered in current system cycle.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                {paidList.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/20 px-1 rounded-xl transition">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-700">{inv.vendor_name}</span>
                      <span className="text-slate-450 font-mono text-[10.5px]">#{inv.invoice_number}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-705 font-bold">₹{inv.amount.toLocaleString()}</span>
                      <span className="bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold uppercase px-2.5 py-0.5 rounded-full">
                        SETTLED / PAID
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Interactive FedNow Disburser */}
        <div className="space-y-6 lg:col-span-1">
          {selectedInvoice ? (
            <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm animate-fadeIn">
              <div className="border-b border-slate-100 pb-2">
                <span className="text-xs text-blue-600 font-bold uppercase tracking-wider block">Authorized Payment Release</span>
                <h4 className="text-base font-display font-black text-slate-800 mt-1">Disburse to: {selectedInvoice.vendor_name}</h4>
              </div>

              <div className="space-y-3 font-sans text-xs text-slate-700">
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">SUPPLIER:</span>
                  <strong className="text-slate-800">{selectedInvoice.vendor_name}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">BILL REF:</span>
                  <strong className="text-slate-800 font-mono">{selectedInvoice.invoice_number}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">PO number match:</span>
                  <strong className="text-slate-800 font-mono">{selectedInvoice.po_number || "DIRECT-DEBIT"}</strong>
                </div>
                <div className="flex justify-between items-center py-2 bg-blue-50/50 px-3.5 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-blue-600 font-bold uppercase">disbursal sum:</span>
                  <strong className="text-blue-800 text-sm font-black">₹{selectedInvoice.amount.toLocaleString()} <span className="text-[10px] font-mono font-medium text-slate-450">INR</span></strong>
                </div>
              </div>

              {/* Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider">Disbursal Pipeline Option</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-105"
                >
                  <option value="Corporate Wire (FedNow)">FedNow Instant Settlement</option>
                  <option value="CHIPS clearing network">CHIPS Network Wire</option>
                  <option value="ACH Next-Day Treasury">Corporate ACH Transfer</option>
                  <option value="Swift Global Payment Platform">Swift Wire (International)</option>
                </select>
              </div>

              <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100/60 text-[10.5px] text-slate-500 leading-relaxed font-sans font-medium shadow-inner">
                ★ <strong>Audit certification:</strong> Executing wire payout pushes final status "Paid" into general accounts payable registers. Settlement notifications route instantly to supplier's registered accounts.
              </div>

              {/* Button */}
              <button
                type="button"
                disabled={disbursing}
                onClick={handleDisbursePayout}
                className="w-full py-3 bg-slate-900 border border-slate-850 hover:bg-slate-950 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg hover:translate-y-[-1px]"
              >
                <SendIcon className="h-4 w-4" />
                <span>{disbursing ? "ROUTING TRANSACTION..." : "RELEASE TELE-WIRE"}</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 text-slate-350 p-6 text-center rounded-2xl font-sans text-xs space-y-3 border border-slate-850 shadow-sm flex flex-col items-center justify-center">
              <Landmark className="h-8 w-8 text-blue-500 shrink-0" />
              <div className="max-w-xs space-y-1">
                <p className="font-bold text-white uppercase tracking-wider">Federal settlement portal</p>
                <p className="text-[11px] text-slate-450 leading-relaxed font-medium">
                  Select a cleared supplier invoice to load the FedNow realtime dispatch controls and approve wiring.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
