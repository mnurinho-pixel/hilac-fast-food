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
  const maxWidthVal = is80 ? '76mm' : '54mm';
  const fontSize = is80 ? '12px' : '11px';

  styleEl.textContent = `
    @page {
      size: ${sizeVal} !important;
      margin: 0mm !important;
    }
    @media print {
      html, body {
        width: ${maxWidthVal} !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      #printable-receipt {
        display: block !important;
        width: 100% !important;
        max-width: ${maxWidthVal} !important;
        font-size: ${fontSize} !important;
        padding: 2mm 1mm !important;
      }
    }
  `;
};

/**
 * Builds standalone, pristine thermal receipt HTML for 58mm or 80mm paper rolls.
 * Ready for standalone popup printing or iframe fallback.
 */
export const generateThermalHtml = (data: PrintData, width: PaperWidth = '58mm'): string => {
  const isKitchen = data.type === 'kitchen';
  const is80 = width === '80mm';
  const containerWidth = is80 ? '74mm' : '52mm';
  const baseFontSize = is80 ? '12px' : '11px';
  const ordNumber = String(data.orderNumber || '').replace(/^#/, '');
  const restaurantName = data.restaurantName || 'HILAC FAST FOOD';

  const details = data.paymentDetails || {
    hormuud: '623008',
    wallet: '571204',
    edahab: '147636'
  };

  const totalItemsCount = data.items.reduce((s, i) => s + (i.quantity || 1), 0);

  const itemsHtml = isKitchen
    ? data.items
        .map(
          item => `
          <div style="padding: 4px 0; border-bottom: 1px dashed #000; display: flex; align-items: flex-start; gap: 6px;">
            <div style="border: 2px solid #000; width: 14px; height: 14px; margin-top: 2px; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div style="font-size: ${is80 ? '15px' : '13px'}; font-weight: 900;">
                <span style="background: #000; color: #fff; padding: 0 4px; margin-right: 4px;">${item.quantity}x</span>
                ${item.name.toUpperCase()}
              </div>
              ${item.notes ? `<div style="font-size: 11px; font-weight: bold; margin-top: 2px;">* Note: ${item.notes}</div>` : ''}
            </div>
          </div>
        `
        )
        .join('')
    : data.items
        .map(item => {
          const price = item.price ?? 0;
          const lineTotal = (price * item.quantity).toFixed(2);
          return `
          <tr style="font-size: ${is80 ? '12px' : '11px'};">
            <td style="font-weight: 900; vertical-align: top; width: 28px;">${item.quantity}x</td>
            <td style="font-weight: 600; vertical-align: top; padding: 2px 4px;">
              ${item.name}
              ${item.quantity > 1 ? `<div style="font-size: 9px; color: #444;">@ $${price.toFixed(2)}</div>` : ''}
            </td>
            <td style="font-weight: 900; text-align: right; vertical-align: top; white-space: nowrap;">$${lineTotal}</td>
          </tr>
        `;
        })
        .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${isKitchen ? 'Kitchen Ticket' : 'Receipt'} #${ordNumber}</title>
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000000;
      background: #ffffff;
      padding: 4mm 2.5mm;
      width: ${containerWidth};
      margin: 0 auto;
      font-size: ${baseFontSize};
      line-height: 1.25;
    }
    .thermal-toolbar {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px;
      margin: -4mm -2.5mm 12px -2.5mm;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border-bottom: 2px solid #334155;
      font-family: system-ui, sans-serif;
    }
    .thermal-btn {
      background: #f59e0b;
      color: #000;
      font-weight: 800;
      font-size: 11px;
      padding: 6px 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .thermal-btn:hover {
      background: #d97706;
    }
    .thermal-btn-secondary {
      background: #334155;
      color: #fff;
    }
    .thermal-btn-secondary:hover {
      background: #475569;
    }
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-double { border-top: 2px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    @media print {
      .thermal-toolbar { display: none !important; }
      body { padding: 1mm 1mm; }
    }
  </style>
</head>
<body>
  <!-- Manual interactive toolbar inside popup in case browser print dialog didn't trigger automatically -->
  <div class="thermal-toolbar">
    <div style="font-size: 12px; font-weight: 700;">
      Hilac POS (${width})
    </div>
    <div style="display: flex; gap: 4px;">
      <button class="thermal-btn" onclick="window.print()">🖨️ Print Now</button>
      <button class="thermal-btn thermal-btn-secondary" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  ${
    isKitchen
      ? `
    <!-- KITCHEN ORDER TICKET (KOT) -->
    <div class="center divider-double" style="padding-bottom: 4px;">
      <div style="background: #000; color: #fff; display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: 900; letter-spacing: 1px;">
        *** KITCHEN ORDER TICKET ***
      </div>
      <div style="font-size: 18px; font-weight: 900; margin-top: 4px;">${restaurantName}</div>
      <div style="font-size: 10px; font-weight: bold;">FOOD PREPARATION SLIP</div>
    </div>

    <div style="border: 2px solid #000; padding: 6px 4px; text-align: center; margin: 6px 0;">
      <div style="font-size: 9px; font-weight: 900; letter-spacing: 1px;">TABLE NUMBER</div>
      <div style="font-size: 32px; font-weight: 900; line-height: 1;">${data.tableNumber}</div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 2px;">
        <span>Server: ${data.waiterName}</span>
        <span>Ticket: #${ordNumber}</span>
      </div>
    </div>

    <div style="font-size: 10px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span>Items: ${data.items.length} (${totalItemsCount} portions)</span>
      <span>${data.orderDate}</span>
    </div>

    <div class="divider-double"></div>

    <div style="margin: 6px 0;">
      ${itemsHtml}
    </div>

    <div class="divider-double"></div>
    <div class="center" style="font-size: 10px; font-weight: 900; margin-top: 6px;">
      *** EXPEDITE ORDER TO KITCHEN ***
      <div style="font-size: 9px; font-weight: normal; margin-top: 2px;">Printed: ${new Date().toLocaleTimeString()}</div>
    </div>
  `
      : `
    <!-- CUSTOMER RECEIPT -->
    <div class="center divider" style="padding-bottom: 4px;">
      <div style="font-size: 20px; font-weight: 900;">${restaurantName}</div>
      <div style="font-size: 10px; font-weight: bold;">Fresh & Tasty Fast Food</div>
      <div class="divider"></div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold;">
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
        <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
          <th style="text-align: left; width: 28px;">Qty</th>
          <th style="text-align: left; padding: 2px 4px;">Item</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="divider"></div>

    <div style="font-size: 11px;">
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
          ? `<div style="display: flex; justify-content: space-between; font-size: 10px;">
              <span>TAX / VAT (5%):</span>
              <span>$${data.tax.toFixed(2)}</span>
            </div>`
          : ''
      }
      <div class="divider"></div>
      <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 900;">
        <span>TOTAL:</span>
        <span>$${(data.total ?? 0).toFixed(2)}</span>
      </div>
    </div>

    <div class="divider"></div>
    <div style="background: #f5f5f5; border: 1px solid #ccc; padding: 4px 6px; border-radius: 4px; font-size: 10px; margin: 6px 0;">
      <div class="center bold" style="font-size: 9px; text-transform: uppercase; margin-bottom: 2px;">
        Payment Merchant Numbers
      </div>
      <div style="display: flex; justify-content: space-between;"><span>Hormuud:</span><span class="bold">${details.hormuud || '623008'}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>Wallet:</span><span class="bold">${details.wallet || '571204'}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>E-Dahab:</span><span class="bold">${details.edahab || '147636'}</span></div>
    </div>

    <div class="divider"></div>
    <div class="center" style="font-size: 10px; margin-top: 6px;">
      <div class="bold" style="text-transform: uppercase;">Mahadsanid / Thank you!</div>
      <div style="font-size: 9px; color: #555;">Please visit Hilac Fast Food again</div>
      <div style="font-family: monospace; font-size: 9px; margin-top: 4px;">*${ordNumber}*</div>
    </div>
  `
  }

  <script>
    // Automatic print attempt with smooth fallback
    window.onload = function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error("Auto print failed in popup:", e);
        }
      }, 250);
    };
  </script>
</body>
</html>`;
};

/**
 * Opens a dedicated print popup window.
 * If automatic browser printing gets suppressed or doesn't exit, this popup window
 * gives the user an independent screen with dedicated Print 58mm / 80mm buttons!
 */
export const openPrintPopup = (data: PrintData, width: PaperWidth = '58mm'): Window | null => {
  const html = generateThermalHtml(data, width);
  const winWidth = width === '80mm' ? 440 : 380;
  const winHeight = 620;
  const left = Math.max(0, (window.screen.width - winWidth) / 2);
  const top = Math.max(0, (window.screen.height - winHeight) / 2);

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
    console.warn('Popup window blocked or failed, falling back to iframe print:', err);
  }

  // Fallback if popup blocked by browser
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
