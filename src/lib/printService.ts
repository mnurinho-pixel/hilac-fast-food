export interface PaymentDetails {
  hormuud?: string;
  wallet?: string;
  edahab?: string;
}

export type ReceiptType = 'customer' | 'kitchen';
export type PaperWidth = '58mm' | '80mm';

export interface PrintData {
  type?: ReceiptType;
  paperWidth?: PaperWidth;
  restaurantName?: string;
  tableNumber: string | number;
  orderNumber?: string | number;
  waiterName: string;
  items: { name: string; quantity: number; price?: number; notes?: string }[];
  subtotal?: number;
  tax?: number;
  total?: number;
  paymentDetails?: PaymentDetails;
  orderDate: string;
}

/**
 * Dynamically injects or updates the @page CSS size rule for the browser print driver.
 * Thermal rolls require exact width definition to avoid clipping or excessive paper feed.
 */
export const applyPrintPageSize = (width: PaperWidth = '58mm') => {
  if (typeof document === 'undefined') return;

  let styleEl = document.getElementById('thermal-print-page-style') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'thermal-print-page-style';
    document.head.appendChild(styleEl);
  }

  const is80 = width === '80mm';
  const sizeVal = is80 ? '80mm auto' : '58mm auto';
  const maxWidthVal = is80 ? '78mm' : '54mm';
  const fontSize = is80 ? '12px' : '11px';

  styleEl.textContent = `
    @page {
      size: ${sizeVal} !important;
      margin: 0mm !important;
    }
    @media print {
      /* Completely hide the React app root so it cannot push content or create blank pages */
      #root {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
      /* Hide all direct body children other than our printable receipt */
      body > *:not(#printable-receipt) {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
      html, body {
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      #printable-receipt {
        display: block !important;
        visibility: visible !important;
        position: static !important;
        width: 100% !important;
        max-width: ${maxWidthVal} !important;
        font-size: ${fontSize} !important;
        padding: 2mm 1.5mm !important;
        margin: 0 auto !important;
        background: #ffffff !important;
        color: #000000 !important;
        box-sizing: border-box !important;
      }
      #printable-receipt * {
        color: #000000 !important;
        box-shadow: none !important;
        text-shadow: none !important;
        visibility: visible !important;
      }
    }
  `;
};

/**
 * Builds standalone, pristine thermal receipt HTML for 58mm or 80mm paper rolls.
 * Includes interactive on-screen toolbar and thermal paper card so the popup window
 * NEVER opens to a blank/white void.
 */
export const generateThermalHtml = (data: PrintData, width: PaperWidth = '58mm'): string => {
  const isKitchen = data.type === 'kitchen';
  const is80 = width === '80mm';
  const containerWidth = is80 ? '76mm' : '54mm';
  const baseFontSize = is80 ? '13px' : '11.5px';
  const ordNumber = String(data.orderNumber || '').replace(/^#/, '');
  const restaurantName = data.restaurantName || 'HILAC FAST FOOD';

  const details = data.paymentDetails || {
    hormuud: '623008',
    wallet: '571204',
    edahab: '147636'
  };

  const totalItemsCount = data.items.reduce((s, i) => s + (i.quantity || 1), 0);

  // Pre-render Kitchen items
  const kitchenItemsHtml = data.items
    .map(
      item => `
      <div style="padding: 5px 0; border-bottom: 1px dashed #000; display: flex; align-items: flex-start; gap: 8px;">
        <div style="border: 2px solid #000; width: 16px; height: 16px; margin-top: 2px; flex-shrink: 0; background: #fff;"></div>
        <div style="flex: 1;">
          <div style="font-size: ${is80 ? '16px' : '14px'}; font-weight: 900; line-height: 1.2;">
            <span style="background: #000; color: #fff; padding: 1px 5px; margin-right: 5px; border-radius: 2px;">${item.quantity}x</span>
            ${item.name.toUpperCase()}
          </div>
          ${item.notes ? `<div style="font-size: 11px; font-weight: bold; margin-top: 3px; color: #b91c1c;">* Note: ${item.notes}</div>` : ''}
        </div>
      </div>
    `
    )
    .join('');

  // Pre-render Customer receipt items
  const customerItemsHtml = data.items
    .map(item => {
      const price = item.price ?? 0;
      const lineTotal = (price * item.quantity).toFixed(2);
      return `
      <tr style="font-size: ${is80 ? '12.5px' : '11.5px'};">
        <td style="font-weight: 900; vertical-align: top; width: 30px; padding: 3px 0;">${item.quantity}x</td>
        <td style="font-weight: 700; vertical-align: top; padding: 3px 4px;">
          ${item.name}
          ${item.quantity > 1 ? `<div style="font-size: 10px; font-weight: normal; color: #444;">@ $${price.toFixed(2)}</div>` : ''}
        </td>
        <td style="font-weight: 900; text-align: right; vertical-align: top; white-space: nowrap; padding: 3px 0;">$${lineTotal}</td>
      </tr>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isKitchen ? 'Kitchen Slip' : 'Customer Bill'} #${ordNumber} - ${restaurantName}</title>
  <style>
    @page {
      size: ${width} auto;
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: #0b0f19;
      color: #000000;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    /* Sticky Screen Toolbar */
    .thermal-toolbar {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      background: #111827;
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid #1f2937;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .toolbar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 800;
      color: #f3f4f6;
    }
    .badge {
      background: #f59e0b;
      color: #000;
      font-size: 10px;
      font-weight: 900;
      padding: 2px 7px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn {
      font-family: inherit;
      font-weight: 800;
      font-size: 12px;
      padding: 7px 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #f59e0b;
      color: #000;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
    }
    .btn-primary:hover {
      background: #fbbf24;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid #374151;
    }
    .btn-secondary:hover {
      background: #374151;
      color: #fff;
    }
    /* Thermal paper preview card */
    .receipt-container {
      padding: 16px 10px 40px;
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .receipt-card {
      background: #ffffff;
      color: #000000;
      width: ${containerWidth};
      max-width: 100%;
      padding: 4mm 3mm;
      box-shadow: 0 12px 30px rgba(0,0,0,0.45);
      border-radius: 8px;
      font-size: ${baseFontSize};
      line-height: 1.25;
      position: relative;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-double { border-top: 2px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }

    /* PRINT MEDIA RULES */
    @media print {
      .no-print, .thermal-toolbar {
        display: none !important;
      }
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: auto !important;
      }
      .receipt-container {
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
        width: 100% !important;
      }
      .receipt-card {
        box-shadow: none !important;
        border-radius: 0 !important;
        width: 100% !important;
        max-width: ${containerWidth} !important;
        margin: 0 auto !important;
        padding: 1.5mm 1mm !important;
      }
      .receipt-card * {
        color: #000000 !important;
      }
    }
  </style>
</head>
<body>
  <!-- Screen interactive toolbar -->
  <div class="thermal-toolbar no-print">
    <div class="toolbar-title">
      <span>${restaurantName}</span>
      <span class="badge" id="width-badge">${width}</span>
      <span style="font-size: 11px; color: #9ca3af;">Table #${data.tableNumber}</span>
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ Print Now
      </button>
      <button class="btn btn-secondary" onclick="toggleFormat()">
        🔄 <span id="format-toggle-label">${isKitchen ? 'View Bill' : 'View Kitchen'}</span>
      </button>
      <button class="btn btn-secondary" onclick="window.close()">
        ✕ Close
      </button>
    </div>
  </div>

  <div class="receipt-container">
    <div class="receipt-card" id="receipt-card">
      <!-- KITCHEN VIEW -->
      <div id="kitchen-view" style="display: ${isKitchen ? 'block' : 'none'};">
        <div class="center divider-double" style="padding-bottom: 4px;">
          <div style="background: #000; color: #fff; display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 900; letter-spacing: 1px;">
            *** KITCHEN ORDER TICKET ***
          </div>
          <div style="font-size: 19px; font-weight: 900; margin-top: 4px; text-transform: uppercase;">${restaurantName}</div>
          <div style="font-size: 10.5px; font-weight: bold; color: #333;">FOOD PREPARATION SLIP</div>
        </div>

        <div style="border: 2px solid #000; padding: 6px 4px; text-align: center; margin: 6px 0; background: #fafafa;">
          <div style="font-size: 9.5px; font-weight: 900; letter-spacing: 1px;">DESTINATION TABLE</div>
          <div style="font-size: 34px; font-weight: 900; line-height: 1; margin: 2px 0;">TABLE ${data.tableNumber}</div>
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 3px;">
            <span>Server: ${data.waiterName}</span>
            <span>Ticket: #${ordNumber}</span>
          </div>
        </div>

        <div style="font-size: 10.5px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Items: ${data.items.length} (${totalItemsCount} portions)</span>
          <span>${data.orderDate}</span>
        </div>

        <div class="divider-double"></div>

        <div style="margin: 6px 0;">
          ${kitchenItemsHtml}
        </div>

        <div class="divider-double"></div>
        <div class="center" style="font-size: 10.5px; font-weight: 900; margin-top: 6px;">
          *** EXPEDITE ORDER TO KITCHEN ***
          <div style="font-size: 9.5px; font-weight: normal; margin-top: 3px;">Printed: ${new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      <!-- CUSTOMER VIEW -->
      <div id="customer-view" style="display: ${isKitchen ? 'none' : 'block'};">
        <div class="center divider" style="padding-bottom: 4px;">
          <div style="font-size: 21px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px;">${restaurantName}</div>
          <div style="font-size: 10.5px; font-weight: bold; color: #333;">Fresh & Tasty Fast Food</div>
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; font-weight: bold;">
            <span>Receipt: #${ordNumber}</span>
            <span>Table: #${data.tableNumber}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px;">
            <span>Waiter: ${data.waiterName}</span>
            <span>${data.orderDate}</span>
          </div>
        </div>

        <div class="divider"></div>
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 10.5px; text-transform: uppercase;">
              <th style="text-align: left; width: 30px; padding-bottom: 2px;">Qty</th>
              <th style="text-align: left; padding: 0 4px 2px 4px;">Item</th>
              <th style="text-align: right; padding-bottom: 2px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${customerItemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div style="font-size: 11.5px; line-height: 1.35;">
          ${
            data.subtotal !== undefined
              ? `<div style="display: flex; justify-content: space-between;">
                  <span>SUBTOTAL:</span>
                  <span class="bold">$${data.subtotal.toFixed(2)}</span>
                </div>`
              : ''
          }
          ${
            data.tax !== undefined
              ? `<div style="display: flex; justify-content: space-between; font-size: 10.5px;">
                  <span>TAX / VAT (5%):</span>
                  <span>$${data.tax.toFixed(2)}</span>
                </div>`
              : ''
          }
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900;">
            <span>GRAND TOTAL:</span>
            <span>$${(data.total ?? 0).toFixed(2)}</span>
          </div>
        </div>

        <div class="divider"></div>
        <div style="background: #f8f8f8; border: 1px solid #ddd; padding: 5px 7px; border-radius: 4px; font-size: 10.5px; margin: 6px 0;">
          <div class="center bold" style="font-size: 9.5px; text-transform: uppercase; margin-bottom: 3px;">
            Payment Accounts
          </div>
          <div style="display: flex; justify-content: space-between;"><span>Hormuud:</span><span class="bold">${details.hormuud || '623008'}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Wallet:</span><span class="bold">${details.wallet || '571204'}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>E-Dahab:</span><span class="bold">${details.edahab || '147636'}</span></div>
        </div>

        <div class="divider"></div>
        <div class="center" style="font-size: 10px; margin-top: 6px;">
          <div class="bold" style="text-transform: uppercase; font-size: 11px;">Mahadsanid / Thank you!</div>
          <div style="font-size: 9.5px; color: #555; margin-top: 2px;">Please visit Hilac Fast Food again</div>
          <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 2px;">*${ordNumber}*</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    var currentIsKitchen = ${isKitchen};
    function toggleFormat() {
      currentIsKitchen = !currentIsKitchen;
      document.getElementById('kitchen-view').style.display = currentIsKitchen ? 'block' : 'none';
      document.getElementById('customer-view').style.display = currentIsKitchen ? 'none' : 'block';
      document.getElementById('format-toggle-label').textContent = currentIsKitchen ? 'View Bill' : 'View Kitchen';
      document.title = (currentIsKitchen ? 'Kitchen Slip' : 'Customer Bill') + ' #${ordNumber} - ${restaurantName}';
    }

    // Auto print trigger with safety timer
    function triggerPrint() {
      try {
        window.focus();
        window.print();
      } catch (err) {
        console.warn("Auto-print in popup caught:", err);
      }
    }

    if (document.readyState === 'complete') {
      setTimeout(triggerPrint, 250);
    } else {
      window.addEventListener('load', function() {
        setTimeout(triggerPrint, 250);
      });
    }
  </script>
</body>
</html>`;
};

/**
 * Opens a dedicated print popup window.
 * Uses a Blob URL for reliable HTML rendering across all modern browsers.
 * If automatic browser printing gets suppressed or doesn't exit, this popup window
 * shows all the order data clearly with manual print buttons.
 */
export const openPrintPopup = (data: PrintData, width: PaperWidth = '58mm'): Window | null => {
  const html = generateThermalHtml(data, width);
  const winWidth = width === '80mm' ? 480 : 420;
  const winHeight = 680;
  const left = Math.max(0, (window.screen.width - winWidth) / 2);
  const top = Math.max(0, (window.screen.height - winHeight) / 2);

  // 1. Attempt using a Blob URL (eliminates blank about:blank issues)
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const popup = window.open(
      blobUrl,
      '_blank',
      `width=${winWidth},height=${winHeight},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );

    if (popup) {
      // Clean up object URL after popup loads
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 5000);
      return popup;
    }
  } catch (err) {
    console.warn('Blob popup open failed, falling back to document.write:', err);
  }

  // 2. Fallback to document.write on about:blank if Blob URL was blocked
  try {
    const popup = window.open(
      '',
      '_blank',
      `width=${winWidth},height=${winHeight},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );

    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      return popup;
    }
  } catch (err) {
    console.warn('Document write fallback failed:', err);
  }

  // 3. Fallback to iframe printer
  printViaIframe(data, width);
  return null;
};

/**
 * Fallback hidden iframe printer for restrictive browser environments
 */
export const printViaIframe = (data: PrintData, width: PaperWidth = '58mm'): Promise<boolean> => {
  return new Promise(resolve => {
    try {
      const existingIframe = document.getElementById('thermal-print-iframe');
      if (existingIframe) existingIframe.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'thermal-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const html = generateThermalHtml(data, width);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        resolve(false);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (e) {
          console.error('Iframe print failed:', e);
          resolve(false);
        }
      }, 350);
    } catch (e) {
      console.error('Error creating print iframe:', e);
      resolve(false);
    }
  });
};

/**
 * Main print executor:
 * 1. Sunmi hardware check (built-in terminal printer)
 * 2. Applies dynamic CSS page size for 58mm or 80mm
 * 3. Triggers window.print()
 */
export const printReceipt = async (data: PrintData): Promise<boolean> => {
  const isKitchen = data.type === 'kitchen';
  const restaurantName = data.restaurantName || 'Hilac Fast Food';
  const selectedWidth: PaperWidth = data.paperWidth || '58mm';
  const lineWidth = selectedWidth === '80mm' ? 42 : 32;

  // Apply browser @page rule dynamically
  applyPrintPageSize(selectedWidth);

  // Check for Sunmi Inner Printer (common on Sunmi V2 POS devices)
  const sunmi = (window as any).sunmiInnerPrinter;

  if (sunmi) {
    try {
      sunmi.printerInit();

      if (isKitchen) {
        // --- KITCHEN ORDER TICKET (KOT) FORMAT ---
        sunmi.setAlignment(1); // Center
        sunmi.printTextWithFont('*** KITCHEN ORDER TICKET ***\n', '', 24);
        sunmi.printTextWithFont(`TABLE ${data.tableNumber}\n`, '', 38);

        sunmi.setAlignment(0); // Left
        sunmi.printText(`Server: ${data.waiterName}\n`);
        sunmi.printText(`Time:   ${data.orderDate}\n`);
        if (data.orderNumber) {
          const ord = String(data.orderNumber).replace(/^#/, '');
          sunmi.printText(`Order:  #${ord}\n`);
        }
        sunmi.printText('='.repeat(lineWidth) + '\n');

        // Kitchen items: large and prominent with checkboxes
        data.items.forEach(item => {
          sunmi.printTextWithFont(`[ ]  ${item.quantity}x  ${item.name.toUpperCase()}\n`, '', 26);
          if (item.notes) {
            sunmi.printText(`     * Note: ${item.notes}\n`);
          }
        });

        sunmi.printText('='.repeat(lineWidth) + '\n');
        sunmi.setAlignment(1);
        sunmi.printText(`Total Items: ${data.items.reduce((s, i) => s + i.quantity, 0)}\n`);
        sunmi.printText('*** EXPEDITE TO KITCHEN ***\n');
        sunmi.lineWrap(3);
        return true;
      }

      // --- CUSTOMER RECEIPT FORMAT ---
      sunmi.setAlignment(1); // Center
      sunmi.printTextWithFont(`${restaurantName}\n`, '', 28);
      sunmi.printText('Fresh & Tasty Fast Food\n');

      sunmi.setAlignment(0); // Left
      if (data.orderNumber) {
        const rcpt = String(data.orderNumber).replace(/^#/, '');
        sunmi.printText(`Receipt #: #${rcpt}\n`);
      }
      sunmi.printText(`Table: ${data.tableNumber} | Waiter: ${data.waiterName}\n`);
      sunmi.printText(`Date:  ${data.orderDate}\n`);
      sunmi.printText('-'.repeat(lineWidth) + '\n');

      // Items list with prices
      data.items.forEach(item => {
        const itemPrice = item.price ?? 0;
        const line = `${item.quantity}x ${item.name}`;
        const price = (itemPrice * item.quantity).toFixed(2);
        const spaces = Math.max(1, lineWidth - line.length - price.length);
        sunmi.printText(`${line}${' '.repeat(spaces)}${price}\n`);
      });

      sunmi.printText('-'.repeat(lineWidth) + '\n');

      // Financials
      if (data.subtotal !== undefined) {
        const subtotalLabel = 'SUBTOTAL:';
        const subtotalVal = `$${data.subtotal.toFixed(2)}`;
        const spaces = Math.max(1, lineWidth - subtotalLabel.length - subtotalVal.length);
        sunmi.printText(`${subtotalLabel}${' '.repeat(spaces)}${subtotalVal}\n`);
      }

      if (data.tax !== undefined) {
        const taxLabel = 'TAX (5%):';
        const taxVal = `$${data.tax.toFixed(2)}`;
        const spaces = Math.max(1, lineWidth - taxLabel.length - taxVal.length);
        sunmi.printText(`${taxLabel}${' '.repeat(spaces)}${taxVal}\n`);
      }

      if (data.total !== undefined) {
        sunmi.printText('-'.repeat(lineWidth) + '\n');
        sunmi.printTextWithFont(`TOTAL: $${data.total.toFixed(2)}\n`, '', 26);
      }

      // Payment Merchant Numbers
      const details = data.paymentDetails || {
        hormuud: '623008',
        wallet: '571204',
        edahab: '147636'
      };

      sunmi.printText('-'.repeat(lineWidth) + '\n');
      sunmi.setAlignment(1);
      sunmi.printText('PAYMENT MERCHANT NUMBERS\n');
      sunmi.setAlignment(0);
      if (details.hormuud) sunmi.printText(`Hormuud:  ${details.hormuud}\n`);
      if (details.wallet) sunmi.printText(`Wallet:   ${details.wallet}\n`);
      if (details.edahab) sunmi.printText(`E-Dahab:  ${details.edahab}\n`);

      sunmi.setAlignment(1);
      sunmi.printText('-'.repeat(lineWidth) + '\n');
      sunmi.printText('Mahadsanid / Thank you!\n');
      sunmi.printText('Please visit us again\n');

      sunmi.lineWrap(2);
      return true;
    } catch (error) {
      console.error('Sunmi direct print error:', error);
    }
  }

  // Fallback to standard browser print
  window.print();
  return false;
};
