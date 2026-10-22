export interface PaymentDetails {
  hormuud?: string;
  wallet?: string;
  edahab?: string;
}

export interface PrintData {
  restaurantName: string;
  tableNumber: string | number;
  waiterName: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentDetails?: PaymentDetails;
  orderDate: string;
}

export const printReceipt = async (data: PrintData) => {
  // Check for Sunmi Inner Printer (common on Sunmi V2 devices)
  const sunmi = (window as any).sunmiInnerPrinter;

  if (sunmi) {
    try {
      // Initialize printer
      sunmi.printerInit();
      
      // Header - Compact font & centered
      sunmi.setAlignment(1); // Center
      sunmi.printTextWithFont(`${data.restaurantName}\n`, "", 24);
      
      sunmi.setAlignment(0); // Left
      sunmi.printText(`Table: ${data.tableNumber} | Waiter: ${data.waiterName}\n`);
      sunmi.printText(`Date: ${data.orderDate}\n`);
      sunmi.printText("--------------------------------\n");
      
      // Items - 32 characters line width for 58mm roll
      data.items.forEach(item => {
        const line = `${item.quantity}x ${item.name}`;
        const price = (item.price * item.quantity).toFixed(2);
        const spaces = 32 - line.length - price.length;
        sunmi.printText(`${line}${" ".repeat(Math.max(1, spaces))}${price}\n`);
      });
      
      sunmi.printText("--------------------------------\n");
      
      // Totals
      const subtotalLabel = "SUBTOTAL:";
      const subtotalVal = data.subtotal.toFixed(2);
      sunmi.printText(`${subtotalLabel}${" ".repeat(Math.max(1, 32 - subtotalLabel.length - subtotalVal.length))}${subtotalVal}\n`);
      
      const taxLabel = "TAX (5%):";
      const taxVal = data.tax.toFixed(2);
      sunmi.printText(`${taxLabel}${" ".repeat(Math.max(1, 32 - taxLabel.length - taxVal.length))}${taxVal}\n`);
      
      sunmi.printTextWithFont(`TOTAL: $${data.total.toFixed(2)}\n`, "", 24);
      
      // Payment Details - Hormuud, Wallet, E-Dahab
      if (data.paymentDetails) {
        sunmi.printText("--------------------------------\n");
        sunmi.setAlignment(1);
        sunmi.printText("PAYMENT DETAILS\n");
        sunmi.setAlignment(0);
        if (data.paymentDetails.hormuud) {
          sunmi.printText(`Hormuud:  ${data.paymentDetails.hormuud}\n`);
        }
        if (data.paymentDetails.wallet) {
          sunmi.printText(`Wallet:   ${data.paymentDetails.wallet}\n`);
        }
        if (data.paymentDetails.edahab) {
          sunmi.printText(`E-Dahab:  ${data.paymentDetails.edahab}\n`);
        }
      }
      
      sunmi.setAlignment(1);
      sunmi.printText("--------------------------------\n");
      sunmi.printText("Mahadsanid / Thank you!\n");
      
      // Feed just 2 lines to reach tear-bar without wasting paper length
      sunmi.lineWrap(2);
      
      return true;
    } catch (error) {
      console.error("Sunmi direct print error:", error);
      // Fallback to window.print()
    }
  }

  // Fallback to standard browser print
  window.print();
  return false;
};
