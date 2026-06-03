import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Printer, Phone, Send, Check, Download, Share2 } from 'lucide-react';

export default function InvoiceModal() {
  const { invoiceOrder, setInvoiceOrder, settings } = useApp();
  const [phone, setPhone] = useState(invoiceOrder?.customerPhone || '');
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState('whatsapp');

  if (!invoiceOrder) return null;
  const o = invoiceOrder;
  const s = settings;

const handlePrint = () => {
    const roundedGrandTotal = Math.round(o.grandTotal);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const pri = iframe.contentWindow;
    pri.document.open();
    pri.document.write(`
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              padding: 15px; 
              color: #000; 
              width: 270px; /* Standard 58mm/80mm thermal width */
              margin: auto; 
              line-height: 1.2;
              font-size: 12px;
            }
            .center { text-align: center; }
            .bold { font-weight: 900; }
            
            /* Header Styling */
            .brand { font-size: 22px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }
            .address { font-size: 10px; margin-bottom: 8px; line-height: 1.3; }
            
            /* Separators */
            .dash-line { border-top: 1px dashed #000; margin: 10px 0; }
            .thick-line { border-top: 2px solid #000; margin: 5px 0; }

            /* Table Grid */
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .item-header { font-size: 11px; font-weight: 900; display: flex; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 3px; }
            .item-row { display: flex; margin-bottom: 4px; align-items: flex-start; }
            
            /* Column Widths */
            .col-name { flex: 1; padding-right: 5px; text-transform: uppercase; }
            .col-qty { width: 35px; text-align: center; }
            .col-amt { width: 65px; text-align: right; font-weight: bold; }

            /* Final Amount Section */
            .total-container {
              text-align: center;
            }
            .total-label { font-size: 12px; font-weight: 600; letter-spacing: 1px; margin: 4px; }
            .total-amount { font-size: 10px; }
            
            .footer-msg { font-size: 10px; margin-top: 15px; font-weight: bold; font-style: italic; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="center">
            <div class="brand">${s.restaurantName}</div>
            <div class="address">${s.address}<br>GSTIN: ${s.gstin}</div>
          </div>

          <div class="dash-line"></div>

          <div class="row"><span>BILL: HTB-${(o.billNo || '').split('-').pop()}</span><span>TABLE: ${o.tableNo}</span></div>
          <div class="row" style="font-size: 10px;">DATE: ${new Date(o.date).toLocaleString('en-IN')}</div>

          <div class="dash-line"></div>

          <div class="item-header">
            <span class="col-name">ITEM DESCRIPTION</span>
            <span class="col-qty">QTY</span>
            <span class="col-amt">PRICE</span>
          </div>

          ${o.items.map(item => `
            <div class="item-row">
              <span class="col-name">${item.name}</span>
              <span class="col-qty">${item.quantity}</span>
              <span class="col-amt">${(item.price * item.quantity).toFixed(0)}</span>
            </div>
          `).join('')}

          <div class="dash-line"></div>

          <div class="row"><span>SUBTOTAL</span><span>${o.subtotal.toFixed(2)}</span></div>
          <div class="row"><span>SGST (2.5%)</span><span>${o.sgst.toFixed(2)}</span></div>
          <div class="row"><span>CGST (2.5%)</span><span>${o.cgst.toFixed(2)}</span></div>
          ${o.discount > 0 ? `<div class="row"><span>DISCOUNT</span><span>-${o.discount.toFixed(2)}</span></div>` : ''}
          ${(o.roundOff || 0) !== 0 ? `<div class="row"><span>ROUND OFF</span><span>${(o.roundOff > 0 ? '+' : '')}${o.roundOff.toFixed(2)}</span></div>` : ''}

          <div class="total-container">
            <div class="total-label">NET PAYABLE AMOUNT ${s.currency}${roundedGrandTotal}</div>
          </div>

          <div class="center" style="margin-top: 10px; font-size: 12px; font-weight: 900;">
            PAID VIA ${o.paymentMode?.toUpperCase()}
          </div>

          <div class="dash-line"></div>
          
          <div class="center footer-msg">
            *** ${s.thankYouMsg.toUpperCase()} ***
          </div>
        </body>
      </html>
    `);
    pri.document.close();
  };

const sendBill = () => {
  if (!phone || phone.length < 10) return;

  const itemsText = o.items
    .map(
      (item) =>
        `• ${item.name}  x${item.quantity}  = ${s.currency}${(
          item.price * item.quantity
        ).toFixed(0)}`
    )
    .join("\n");

  const message = `
*${s.restaurantName}*
${s.address}
GSTIN: ${s.gstin}

━━━━━━━━━━━━━━━━━━━━
*BILL: HTB-${(o.billNo || '').split('-').pop()}*
Table: ${o.tableNo}
${new Date(o.date).toLocaleString("en-IN")}
━━━━━━━━━━━━━━━━━━━━

${itemsText}

━━━━━━━━━━━━━━━━━━━━
Subtotal: ${s.currency}${o.subtotal.toFixed(2)}
SGST (2.5%): ${s.currency}${o.sgst.toFixed(2)}
CGST (2.5%): ${s.currency}${o.cgst.toFixed(2)}
${
  o.discount > 0
    ? `Discount: -${s.currency}${o.discount.toFixed(2)}\n`
    : ""
} ${(o.roundOff || 0) !== 0 ? `Round Off: ${(o.roundOff > 0 ? '+' : '')}${o.roundOff.toFixed(2)}\n` : ""}

*TOTAL: ${s.currency}${Math.round(o.grandTotal)}*
━━━━━━━━━━━━━━━━━━━━

Paid via: ${o.paymentMode?.toUpperCase()}
${s.thankYouMsg}
`;

  const encoded = encodeURIComponent(message);

  window.open(`https://wa.me/91${phone}?text=${encoded}`, "_blank");

  setSent(true);
  setTimeout(() => setSent(false), 1000);
};



  return (
    <div className="moverlay">
      <div className="mbox invoice-premium-modal">
        {/* TOP HEADER */}
        <div className="inv-m-header">
          <div className="header-left">
            <div className="live-dot"></div>
            <span className="header-status">ORDER HTB-${(o.billNo || '').split('-').pop()}</span>
          </div>
          <button className="close-btn-minimal" onClick={() => setInvoiceOrder(null)}><X size={20}/></button>
        </div>

        <div className="inv-m-body">
          {/* THE REALISTIC BILL CARD */}
          <div className="bill-paper-wrap" id="printable-bill-area">
            <div className="bill-inner">
              <div className="bill-top-center">
                <div className="bill-name-heavy">{s.restaurantName}</div>
                <div className="bill-sub-info">{s.address}</div>
                <div className="bill-sub-info">GSTIN: {s.gstin}</div>
              </div>

              <div className="bill-zig-zag-sep"></div>

              <div className="bill-meta-grid">
                <div className="meta-item"><span>BILL NO</span><strong>HTB-${(o.billNo || '').split('-').pop()}</strong></div>
                <div className="meta-item" style={{textAlign:'right'}}><span>TABLE</span><strong>{o.tableNo}</strong></div>
                <div className="meta-item full-row"><span>DATE</span><strong>{new Date(o.date).toLocaleString()}</strong></div>
              </div>

              <div className="bill-zig-zag-sep"></div>

              <table className="bill-items-table">
                <thead>
                  <tr>
                    <th align="left">ITEM</th>
                    <th align="center">QTY</th>
                    <th align="right">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((item, i) => (
                    <tr key={i}>
                      <td className="item-name-bold">{item.name}</td>
                      <td align="center">x{item.quantity}</td>
                      <td align="right">{s.currency}{(item.price * item.quantity).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bill-zig-zag-sep"></div>

              <div className="bill-summary-stack">
                <div className="sum-row"><span>Subtotal</span><span>{s.currency}{o.subtotal.toFixed(2)}</span></div>
                <div className="sum-row"><span>SGST (2.5%)</span><span>{s.currency}{o.sgst.toFixed(2)}</span></div>
                <div className="sum-row"><span>CGST (2.5%)</span><span>{s.currency}{o.cgst.toFixed(2)}</span></div>
                {o.discount > 0 && <div className="sum-row discount"><span>Discount</span><span>-{s.currency}{o.discount.toFixed(2)}</span></div>}
                {(o.roundOff || 0) !== 0 && <div className="sum-row"> <span>Round-Off</span><span>{o.roundOff > 0 ? '+' : ''}{o.roundOff.toFixed(2)}</span></div>}
                <div className="grand-total-box">
                  <div className="grand-label">AMOUNT PAYABLE</div>
                  <div className="grand-value">{s.currency}{o.grandTotal.toFixed(2)}</div>
                </div>

                <div className="sum-row paid-row"><span>Amount Paid</span><span>{s.currency}{(o.paidAmount || o.grandTotal).toFixed(2)}</span></div>
                {o.dueAmount > 0 && <div className="sum-row due-row"><span>DUE AMOUNT</span><span>{s.currency}{o.dueAmount.toFixed(2)}</span></div>}
              </div>

              <div className="bill-footer-note">
                {o.paymentMode?.toUpperCase()} · THANK YOU FOR VISITING!
              </div>
            </div>
          </div>

          {/* SEND SECTION */}
          <div className="share-section-card">
            <div className="share-header"><Share2 size={12}/> SHARE INVOICE</div>
            <div className="tab-segment-control">
              <button className={`segment ${tab === 'whatsapp' ? 'active' : ''}`} onClick={() => setTab('whatsapp')}>WhatsApp</button>
              <button className={`segment ${tab === 'sms' ? 'active' : ''}`} onClick={() => setTab('sms')}>SMS</button>
            </div>
            
            <div className="share-input-row">
       
            
                <input maxLength={10} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" />
              
              <button className="send-circle-btn" onClick={sendBill} disabled={!phone || phone.length < 10}>
                {sent ? <Check size={12} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR - NEXT LEVEL ALIGNMENT */}
        <div className="inv-m-actions">
          <button className="btn-pill btn-minimal" onClick={() => setInvoiceOrder(null)}>CLOSE</button>
          <button className="btn-pill btn-outline-luxury" onClick={handlePrint}><Download size={16}/> PDF</button>
          <button className="btn-pill btn-primary-luxury" onClick={handlePrint}>
            <Printer size={16}/> PRINT BILL
          </button>
        </div>
      </div>

      <style>{`
        .invoice-premium-modal {
          width: 95%; max-width: 350px; height: auto; max-height: 94vh; 
          display: flex; flex-direction: column; background: #08090a; 
          border: 1px solid #1c1e21; border-radius: 28px; padding: 0 !important; overflow: hidden;
        }

        .inv-m-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-bottom: 1px solid #1c1e21; }
        .header-left { display: flex; align-items: center; gap: 8px; }
        .live-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e; }
        .header-status { color: #888; font-size: 10px; font-weight: 800; letter-spacing: 1px; }
        .close-btn-minimal { background: none; border: none; color: #555; cursor: pointer; }

        .inv-m-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 20px; }

        /* Modern Receipt Look */
        .bill-paper-wrap { 
          background: #fff; border-radius: 12px; padding: 4px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .bill-inner { border: 1px solid #eee; border-radius: 8px; padding: 18px; color: #000; font-family: 'Courier New', Courier, monospace; }
        .bill-name-heavy { font-size: 26px; font-weight: 900; text-align: center; color: #000; }
        .bill-sub-info { font-size: 13px; text-align: center; color: #666; text-transform: uppercase; margin-bottom: 2px; }
        .bill-zig-zag-sep { border-top: 1px dashed #ddd; margin: 15px 0; }
        
        .bill-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; }
        .meta-item span { display: block; color: #999; font-size: 11px; font-weight: bold; margin-bottom: 2px; }
        .full-row { grid-column: span 2; }

        .bill-items-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 15px; }
        .bill-items-table th { border-bottom: 1px solid #000; padding-bottom: 5px; font-size: 13px; color: #888; }
        .item-name-bold { font-weight: bold; padding: 5px 0; }

        .bill-summary-stack { display: flex; flex-direction: column; gap: 4px; }
        .sum-row { display: flex; justify-content: space-between; font-size: 14px; color: #444; margin-bottom: 2px; }
        .discount { color: #d32f2f; font-weight: bold; }
        
        .grand-total-box { 
          margin: 10px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: center;
          border: 1px solid #eee;
        }
        .grand-label { font-size: 13px; font-weight: 800; color: #888; }
        .grand-value { font-size: 28px; font-weight: 900; color: #000; }
        
        .due-row { color: #d32f2f; font-weight: 900; font-size: 16px; margin-top: 4px; }
        .paid-row { border-top: 1px solid #eee; padding-top: 5px; margin-top: 5px; }
        .bill-footer-note { text-align: center; font-size: 12px; margin-top: 15px; color: #999; font-weight: bold; }

        /* Share Control Styling */
        .share-section-card { background: #12141a; border-radius: 20px; padding: 15px; border: 1px solid #1c1e21; }
        .share-header { font-size: 9px; font-weight: 900; color: #444; margin-bottom: 12px; letter-spacing: 1px; display: flex; align-items: center; gap: 6px; }
        
        .tab-segment-control { display: flex; background: #08090a; padding: 4px; border-radius: 12px; margin-bottom: 12px; }
        .segment { flex: 1; border: none; background: none; color: #555; padding: 8px; font-size: 11px; font-weight: 800; border-radius: 10px; cursor: pointer; }
        .segment.active { background: #f59e0b; color: #000; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2); }

        .share-input-row { display: flex; gap: 10px; }
        .phone-input-luxury { flex: 1; background: #08090a; border-radius: 14px; display: flex; align-items: center; padding: 0 14px; gap: 10px; border: 1px solid #1c1e21; }
        .phone-input-luxury input { background: none; border: none; color: #fff; font-size: 14px; outline: none; width: 100%; }
        .send-circle-btn { background: #22c55e; color: #000; width: 40px; height: 32px; border-radius: 22px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }

        /* BOTTOM FLOATING ACTION BAR */
        .inv-m-actions { 
          display: grid; grid-template-columns: 0.8fr 0.7fr 1.5fr; gap: 10px; 
          padding: 15px 15px 25px; background: #08090a; border-top: 1px solid #1c1e21;
        }
        .btn-pill { 
          height: 48px; border-radius: 16px; font-weight: 900; font-size: 11px; 
          display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; border: none;
        }
        .btn-minimal { background: #1c1e21; color: #fff; }
        .btn-outline-luxury { background: transparent; border: 1px solid #1c1e21; color: #fff; }
        .btn-primary-luxury { background: #f59e0b; color: #000; box-shadow: 0 8px 20px rgba(245, 158, 11, 0.2); }

        @media (max-width: 320px) {
          .btn-pill { font-size: 10px; padding: 0 5px; }
          .grand-value { font-size: 20px; }
        }
      `}</style>
    </div>
  );
}