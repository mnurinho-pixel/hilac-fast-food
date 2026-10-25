import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, getCleanOrderNumber } from '../lib/utils';
import {
  printReceipt,
  openPrintPopup,
  printViaIframe,
  applyPrintPageSize,
  type ReceiptType,
  type PaperWidth,
  type PaymentDetails,
  type PrintData
} from '../lib/printService';
import {
  Printer,
  X,
  ChefHat,
  Receipt,
  Layers,
  Check,
  ExternalLink,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface PosReceiptItem {
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
}

export interface PosReceiptOrder {
  id?: string;
  table_number: number | string;
  waiter_name?: string;
  created_at?: string;
  items: PosReceiptItem[];
  subtotal?: number;
  vat_amount?: number;
  total_amount?: number;
  status?: string;
  isUpdate?: boolean;
}

interface PosReceiptModalProps {
  order: PosReceiptOrder;
  initialType?: ReceiptType;
  initialWidth?: PaperWidth;
  onClose: () => void;
  onPaymentSuccess?: () => void;
}

const DEFAULT_PAYMENT_DETAILS: PaymentDetails = {
  hormuud: "623008",
  wallet: "571204",
  edahab: "147636"
};

export function PosReceiptModal({
  order,
  initialType = 'customer',
  initialWidth = '58mm',
  onClose
}: PosReceiptModalProps) {
  const [activeType, setActiveType] = useState<ReceiptType>(initialType);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(initialWidth);
  const [fontSize, setFontSize] = useState<'standard' | 'large'>('large');
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrinted, setLastPrinted] = useState<string | null>(null);
  const [showFallbackDialog, setShowFallbackDialog] = useState(false);

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

  const orderTimeOnly = order.created_at
    ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const totalItemsCount = order.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const cleanReceiptNumber = getCleanOrderNumber(order.id);

  const getPrintPayload = (overrideType?: ReceiptType, overrideWidth?: PaperWidth): PrintData => ({
    type: overrideType || activeType,
    paperWidth: overrideWidth || paperWidth,
    restaurantName: 'Hilac Fast Food',
    tableNumber: order.table_number,
    orderNumber: cleanReceiptNumber,
    waiterName: order.waiter_name || 'Staff',
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price ?? 0,
      notes: item.notes
    })),
    subtotal: order.subtotal ?? 0,
    tax: order.vat_amount ?? 0,
    total: order.total_amount ?? 0,
    paymentDetails: DEFAULT_PAYMENT_DETAILS,
    orderDate: formattedDate
  });

  /**
   * Main print trigger with chosen width (58mm or 80mm)
   */
  const handlePrint = async (
    typeToPrint: ReceiptType = activeType,
    targetWidth: PaperWidth = paperWidth
  ) => {
    setIsPrinting(true);
    setActiveType(typeToPrint);
    setPaperWidth(targetWidth);
    applyPrintPageSize(targetWidth);

    try {
      const payload = getPrintPayload(typeToPrint, targetWidth);
      const isSunmi = await printReceipt(payload);

      if (!isSunmi) {
        // Standard window.print() triggered via print media CSS
        setTimeout(() => {
          try {
            window.print();
          } catch (e) {
            console.warn('Standard window.print failed, opening popup fallback:', e);
            openPrintPopup(payload, targetWidth);
          }
        }, 150);
      }

      setLastPrinted(
        `${typeToPrint === 'kitchen' ? 'Kitchen Slip' : 'Customer Bill'} (${targetWidth})`
      );
    } catch (err) {
      console.error('Print execution failed:', err);
      // Auto open fallback dialog on unexpected error
      setShowFallbackDialog(true);
    } finally {
      setTimeout(() => setIsPrinting(false), 900);
    }
  };

  /**
   * Dedicated popup window print trigger (if browser automatic print doesn't exit)
   */
  const handlePopupPrint = (targetWidth: PaperWidth = paperWidth) => {
    setIsPrinting(true);
    setPaperWidth(targetWidth);
    applyPrintPageSize(targetWidth);
    const payload = getPrintPayload(activeType, targetWidth);
    const popup = openPrintPopup(payload, targetWidth);
    setLastPrinted(`Popup Window (${targetWidth})`);
    setTimeout(() => setIsPrinting(false), 800);
    if (!popup) {
      // If popup was blocked, fallback dialog stays visible
      setShowFallbackDialog(true);
    }
  };

  const handleIframePrint = async (targetWidth: PaperWidth = paperWidth) => {
    setIsPrinting(true);
    setPaperWidth(targetWidth);
    applyPrintPageSize(targetWidth);
    const payload = getPrintPayload(activeType, targetWidth);
    await printViaIframe(payload, targetWidth);
    setLastPrinted(`Direct Iframe (${targetWidth})`);
    setTimeout(() => setIsPrinting(false), 800);
  };

  const handlePrintBoth = async (targetWidth: PaperWidth = paperWidth) => {
    await handlePrint('kitchen', targetWidth);
    setTimeout(async () => {
      await handlePrint('customer', targetWidth);
      setLastPrinted(`Both Tickets (${targetWidth})`);
    }, 1200);
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden">
        {/* Screen Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[94vh] print:hidden relative"
      >
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Printer size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-sm sm:text-base">POS Receipt & Kitchen Slip</h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/30">
                  {paperWidth}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Table <strong className="text-white">#{order.table_number}</strong> • Receipt <strong className="text-amber-400 font-mono">#{cleanReceiptNumber}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowFallbackDialog(true)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-1.5 text-xs font-bold transition-all border border-slate-700/60"
              title="Manual Print Dialog & Popup if automatic print doesn't exit"
            >
              <ExternalLink size={13} className="text-amber-400" />
              <span className="hidden sm:inline">Print Popup</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Format & Width Controls Header */}
        <div className="p-3 bg-slate-950/70 border-b border-slate-800/80 space-y-2.5">
          {/* Main Format Tabs: Customer Receipt vs Kitchen Slip */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveType('customer')}
              className={`py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${
                activeType === 'customer'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt size={15} />
              <span>Customer Receipt</span>
            </button>
            <button
              onClick={() => setActiveType('kitchen')}
              className={`py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${
                activeType === 'kitchen'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ChefHat size={15} />
              <span>Kitchen Ticket (KOT)</span>
            </button>
          </div>

          {/* Dedicated 58mm vs 80mm Roll Width Selectors & Options */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="text-[11px] font-bold text-slate-400">Roll Width:</span>
              <div className="inline-flex bg-slate-900 rounded-xl p-1 border border-slate-800 shadow-inner">
                <button
                  onClick={() => {
                    setPaperWidth('58mm');
                    applyPrintPageSize('58mm');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    paperWidth === '58mm'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>58mm Roll</span>
                  <span className="text-[9px] opacity-80">(Sunmi/Small)</span>
                </button>
                <button
                  onClick={() => {
                    setPaperWidth('80mm');
                    applyPrintPageSize('80mm');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    paperWidth === '80mm'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>80mm Roll</span>
                  <span className="text-[9px] opacity-80">(Standard POS)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize(prev => (prev === 'large' ? 'standard' : 'large'))}
                className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white transition-colors"
              >
                {fontSize === 'large' ? '★ Large Font' : 'Standard Font'}
              </button>
            </div>
          </div>
        </div>

        {/* Paper Receipt Preview Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 flex justify-center items-start">
          <div
            className={`w-full transition-all duration-200 ${
              paperWidth === '58mm' ? 'max-w-[340px]' : 'max-w-[440px]'
            }`}
          >
            {/* Visual Receipt Paper Card */}
            <div className="bg-[#ffffff] text-slate-950 rounded-2xl shadow-2xl p-5 sm:p-6 border border-slate-200 font-mono relative overflow-hidden select-text">
              {/* Paper Roll Indicator Watermark */}
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                {paperWidth} thermal
              </div>

              {/* Status Ribbon (Update indicator) */}
              {order.isUpdate && (
                <div className="mb-3 -mt-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest py-1 text-center rounded-lg">
                  Order Updated
                </div>
              )}

              {/* TICKET CONTENT SWITCHER */}
              {activeType === 'kitchen' ? (
                /* ================= KITCHEN ORDER TICKET (KOT) ================= */
                <div className="space-y-4">
                  {/* Kitchen Ticket Header */}
                  <div className="text-center border-b-2 border-black pb-3">
                    <div className="inline-block bg-black text-white text-[11px] font-black tracking-widest px-3 py-0.5 uppercase rounded-sm mb-1.5">
                      *** KITCHEN ORDER TICKET ***
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-wider text-black">
                      HILAC FAST FOOD
                    </h2>
                    <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                      KITCHEN SLIP / FOOD PREPARATION
                    </p>
                  </div>

                  {/* Giant Table Badge - Instant Read For Chef */}
                  <div className="bg-slate-100 border-2 border-black rounded-xl p-3 text-center my-2">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-600">
                      DESTINATION TABLE
                    </div>
                    <div className="text-4xl font-black text-black tracking-tight leading-none my-1">
                      TABLE {order.table_number}
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-slate-300 mt-1 text-slate-700">
                      <span>Server: {order.waiter_name || 'Staff'}</span>
                      <span>Time: {orderTimeOnly}</span>
                    </div>
                  </div>

                  <div className="text-center font-bold text-xs text-slate-700 border-b border-dashed border-black pb-1">
                    TICKET #{cleanReceiptNumber} • {order.items.length} ITEMS ({totalItemsCount} PORTIONS)
                  </div>

                  {/* Kitchen Items Checklist - Big, Bold, Clean */}
                  <div className="space-y-2.5 pt-1">
                    {order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2.5"
                      >
                        <div className="w-5 h-5 rounded border-2 border-black bg-white flex items-center justify-center shrink-0 mt-0.5 text-slate-300">
                          {/* Checkbox for chef */}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-black text-black bg-amber-200 px-1.5 py-0.2 rounded border border-black/20 shrink-0">
                              {item.quantity}x
                            </span>
                            <span className="text-base font-black text-black uppercase leading-tight">
                              {item.name}
                            </span>
                          </div>
                          {item.notes && (
                            <div className="mt-1 text-xs font-bold text-red-600 bg-red-50 p-1 rounded border border-red-200">
                              ⚡ Note: {item.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Kitchen Footer Note */}
                  <div className="border-t-2 border-black pt-3 text-center space-y-1">
                    <p className="text-xs font-black tracking-wider text-black uppercase">
                      *** EXPEDITE ORDER TO KITCHEN ***
                    </p>
                    <p className="text-[11px] font-bold text-slate-600">
                      Printed: {formattedDate}
                    </p>
                  </div>
                </div>
              ) : (
                /* ================= CUSTOMER RECEIPT ================= */
                <div className="space-y-3.5">
                  {/* Customer Header */}
                  <div className="text-center border-b border-dashed border-black pb-3">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-black">
                      Hilac Fast Food
                    </h2>
                    <p className="text-xs font-bold text-slate-600 tracking-wide mt-0.5">
                      Fresh & Tasty Fast Food Restaurant
                    </p>
                    <div className="mt-2 text-xs font-bold space-y-0.5 text-slate-800">
                      <div className="flex justify-between px-1">
                        <span>
                          Receipt: <strong className="text-black font-mono">#{cleanReceiptNumber}</strong>
                        </span>
                        <span>
                          Table: <strong className="text-black">#{order.table_number}</strong>
                        </span>
                      </div>
                      <div className="flex justify-between px-1">
                        <span>Waiter: {order.waiter_name || 'Staff'}</span>
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Customer Items Table Header */}
                  <div className="border-b border-black pb-1 flex justify-between text-xs font-black uppercase text-black">
                    <span className="w-10">Qty</span>
                    <span className="flex-1 text-left">Item</span>
                    <span className="text-right">Total</span>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 py-1">
                    {order.items.map((item, idx) => {
                      const itemPrice = item.price ?? 0;
                      const lineTotal = itemPrice * item.quantity;
                      return (
                        <div key={idx} className="flex items-start justify-between text-xs sm:text-sm">
                          <span className="w-10 font-black text-black">{item.quantity}x</span>
                          <span className="flex-1 text-left font-bold text-slate-900 pr-2">
                            {item.name}
                            {item.quantity > 1 && (
                              <span className="block text-[11px] font-normal text-slate-600">
                                @ {formatCurrency(itemPrice)} each
                              </span>
                            )}
                          </span>
                          <span className="text-right font-black text-black">
                            {formatCurrency(lineTotal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals Section */}
                  <div className="border-t border-dashed border-black pt-2 space-y-1 text-xs sm:text-sm font-bold text-slate-800">
                    <div className="flex justify-between">
                      <span>SUBTOTAL</span>
                      <span className="font-black text-black">
                        {formatCurrency(order.subtotal ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>TAX / VAT (5%)</span>
                      <span className="font-bold text-black">
                        {formatCurrency(order.vat_amount ?? 0)}
                      </span>
                    </div>
                    <div className="border-t-2 border-black pt-1.5 flex justify-between items-center text-base sm:text-lg font-black text-black mt-1">
                      <span>GRAND TOTAL</span>
                      <span className="text-xl font-black">
                        {formatCurrency(order.total_amount ?? 0)}
                      </span>
                    </div>
                  </div>

                  {/* Merchant Payment Numbers - Prominent & Clear */}
                  <div className="border-t border-dashed border-black pt-2.5 my-2">
                    <div className="text-center mb-1.5">
                      <span className="text-[11px] font-black uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                        Payment Accounts
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5 text-xs font-bold text-slate-800">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-600">Hormuud:</span>
                        <span className="font-mono font-black text-sm text-black">623008</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-600">Wallet:</span>
                        <span className="font-mono font-black text-sm text-black">571204</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-600">E-Dahab:</span>
                        <span className="font-mono font-black text-sm text-black">147636</span>
                      </div>
                    </div>
                  </div>

                  {/* Barcode Mock Visual & Thank You */}
                  <div className="pt-2 text-center border-t border-dashed border-black space-y-1">
                    <div className="inline-block py-1 px-3">
                      {/* CSS Barcode effect */}
                      <div className="h-7 w-48 mx-auto flex items-stretch justify-center gap-[2px] opacity-80">
                        {Array.from({ length: 32 }).map((_, i) => (
                          <div
                            key={i}
                            className={`bg-black ${
                              i % 3 === 0 ? 'w-[3px]' : i % 2 === 0 ? 'w-[1.5px]' : 'w-[1px]'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="text-[10px] tracking-widest text-slate-600 font-mono mt-0.5">
                        *{cleanReceiptNumber}*
                      </div>
                    </div>
                    <p className="text-xs font-black text-black uppercase tracking-wide">
                      Mahadsanid / Thank you!
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Please visit Hilac Fast Food again
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fallback & Automatic Print Help Strip */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">
              {lastPrinted ? `Last: ${lastPrinted}` : 'Select roll size & print immediately'}
            </span>
          </div>
          <button
            onClick={() => setShowFallbackDialog(true)}
            className="text-amber-400 hover:text-amber-300 font-bold underline shrink-0 ml-2"
          >
            Automatic print didn't exit?
          </button>
        </div>

        {/* Primary Action Buttons (Prominent 58mm & 80mm Print buttons) */}
        <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-2.5">
          {/* Top row: 58mm and 80mm dedicated direct print buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handlePrint(activeType, '58mm')}
              disabled={isPrinting}
              className={`h-12 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                paperWidth === '58mm'
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20 ring-2 ring-amber-400/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Printer size={16} />
              <span>Print 58mm Roll</span>
            </button>

            <button
              onClick={() => handlePrint(activeType, '80mm')}
              disabled={isPrinting}
              className={`h-12 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
                paperWidth === '80mm'
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20 ring-2 ring-amber-400/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Printer size={16} />
              <span>Print 80mm Roll</span>
            </button>
          </div>

          {/* Secondary row: Quick role-based actions + Fallback Popup */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
              <button
                onClick={() => handlePrint('kitchen', paperWidth)}
                disabled={isPrinting}
                className="flex-1 px-3 py-2.5 rounded-xl bg-orange-600/90 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <ChefHat size={14} />
                <span>Kitchen Slip</span>
              </button>

              <button
                onClick={() => handlePrint('customer', paperWidth)}
                disabled={isPrinting}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Receipt size={14} />
                <span>Customer Bill</span>
              </button>

              <button
                onClick={() => handlePrintBoth(paperWidth)}
                disabled={isPrinting}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1 transition-all active:scale-95"
                title="Print both tickets sequentially"
              >
                <Layers size={14} />
                <span className="hidden sm:inline">Both</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePopupPrint(paperWidth)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center gap-1.5 transition-all"
                title="Open Standalone Popup Window"
              >
                <ExternalLink size={14} />
                <span>Popup</span>
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* FALLBACK PRINT DIALOG & POPUP MODAL (When auto doesn't exit) */}
        {/* ============================================================== */}
        <AnimatePresence>
          {showFallbackDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-50 p-6 flex flex-col justify-center items-center text-center"
            >
              <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto">
                  <Printer size={24} />
                </div>

                <div>
                  <h4 className="text-lg font-black text-white">Manual Print Dialog & Popup</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    If your browser or device did not exit or open the automatic print prompt,
                    choose one of the manual thermal roll print options below:
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      handlePrint(activeType, '58mm');
                      setShowFallbackDialog(false);
                    }}
                    className="p-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <span className="text-sm">🖨️ Print 58mm</span>
                    <span className="text-[10px] opacity-80">Direct Thermal Print</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePrint(activeType, '80mm');
                      setShowFallbackDialog(false);
                    }}
                    className="p-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <span className="text-sm">🖨️ Print 80mm</span>
                    <span className="text-[10px] opacity-80">Direct Thermal Print</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePopupPrint('58mm');
                      setShowFallbackDialog(false);
                    }}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700"
                  >
                    <span className="text-sm">🌐 58mm Popup</span>
                    <span className="text-[10px] text-slate-400">Open in Clean Window</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePopupPrint('80mm');
                      setShowFallbackDialog(false);
                    }}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all border border-slate-700"
                  >
                    <span className="text-sm">🌐 80mm Popup</span>
                    <span className="text-[10px] text-slate-400">Open in Clean Window</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    handleIframePrint(paperWidth);
                    setShowFallbackDialog(false);
                  }}
                  className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-700/60"
                >
                  <span>⚡ Silent Print (Direct Iframe)</span>
                </button>

                <div className="pt-2">
                  <button
                    onClick={() => setShowFallbackDialog(false)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs transition-colors"
                  >
                    Return to Receipt Preview
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>

    {/* ============================================================== */}
    {/* HARDWARE / BROWSER PRINT TEMPLATE (Activated via window.print) */}
    {/* Portal directly to document.body so #root is completely hidden */}
    {/* and print preview never shows blank/white screen!               */}
    {/* ============================================================== */}
    {typeof document !== 'undefined' &&
      createPortal(
        <div
          id="printable-receipt"
          className={`font-mono text-black ${
            paperWidth === '80mm' ? 'paper-80mm' : 'paper-58mm'
          }`}
        >
          {activeType === 'kitchen' ? (
            /* Printable Kitchen Slip */
            <div className="receipt-section space-y-2 text-black leading-tight">
              <div className="receipt-header text-center border-b-2 border-black pb-1.5">
                <p className="text-xs font-black uppercase">*** KITCHEN ORDER ***</p>
                <p className="text-sm font-black uppercase">HILAC FAST FOOD</p>
              </div>

              <div className="border-2 border-black p-1 text-center my-1">
                <p className="text-[10px] font-black uppercase">TABLE</p>
                <p className="text-3xl font-black text-black leading-none">
                  {order.table_number}
                </p>
              </div>

              <div className="text-xs font-bold border-b border-black pb-1">
                <div className="flex justify-between">
                  <span>Server: {order.waiter_name || 'Staff'}</span>
                  <span>Time: {orderTimeOnly}</span>
                </div>
                <div className="font-black text-sm">Ticket: #{cleanReceiptNumber}</div>
              </div>

              <div className="py-1 space-y-1.5 border-b-2 border-black">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs font-black">
                    <span className="text-sm font-black">[ ] {item.quantity}x</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-black uppercase break-words">{item.name}</span>
                      {item.notes && (
                        <p className="text-[10.5px] font-bold text-black">* Note: {item.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="receipt-footer text-center pt-1 space-y-0.5">
                <p className="text-xs font-black uppercase">Total Items: {totalItemsCount}</p>
                <p className="text-[10px] font-bold">*** EXPEDITE TO KITCHEN ***</p>
                <p className="text-[9px]">{formattedDate}</p>
              </div>

              {/* Thermal paper cutter feed buffer */}
              <div style={{ height: '18mm', minHeight: '18mm', width: '100%', display: 'block' }} />
            </div>
          ) : (
            /* Printable Customer Receipt (Full data, zero cutoff, normal POS size) */
            <div className="receipt-section space-y-1.5 text-black leading-tight">
              {/* Header */}
              <div className="receipt-header text-center border-b border-dashed border-black pb-1.5">
                <h2 className="text-base font-black uppercase tracking-tight text-black">
                  Hilac Fast Food
                </h2>
                <p className="text-[10px] font-bold text-black">Fresh & Tasty Fast Food</p>
                <div className="mt-1 text-[10px] font-bold text-black space-y-0.5">
                  <div className="flex justify-between">
                    <span>Receipt: #{cleanReceiptNumber}</span>
                    <span>Table: #{order.table_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Waiter: {order.waiter_name || 'Staff'}</span>
                    <span>{formattedDate}</span>
                  </div>
                </div>
              </div>

              {/* Items Table with fixed column widths and clean word wrap (No truncate) */}
              <table className="receipt-items w-full border-collapse table-fixed text-black">
                <thead>
                  <tr className="border-b border-black text-[10px] font-black uppercase">
                    <th className="w-7 text-left pb-1">Qty</th>
                    <th className="text-left pb-1 px-1">Item</th>
                    <th className="w-12 text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, idx) => {
                    const itemPrice = item.price ?? 0;
                    const lineTotal = itemPrice * item.quantity;
                    return (
                      <tr key={idx} className="text-xs font-bold leading-tight">
                        <td className="w-7 align-top py-0.5 font-black">{item.quantity}x</td>
                        <td className="align-top py-0.5 px-1 break-words">
                          <div>{item.name}</div>
                          {item.quantity > 1 && (
                            <div className="text-[9.5px] font-normal text-slate-700">
                              @{formatCurrency(itemPrice)}
                            </div>
                          )}
                        </td>
                        <td className="w-12 align-top py-0.5 text-right font-black whitespace-nowrap">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Financial Totals */}
              <div className="receipt-totals border-t border-dashed border-black pt-1 space-y-0.5 text-xs font-bold text-black">
                <div className="flex justify-between text-[11px]">
                  <span>SUBTOTAL:</span>
                  <span>{formatCurrency(order.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between text-[10.5px]">
                  <span>TAX / VAT (5%):</span>
                  <span>{formatCurrency(order.vat_amount ?? 0)}</span>
                </div>
                <div className="border-t border-black pt-1 flex justify-between text-sm font-black text-black">
                  <span>GRAND TOTAL:</span>
                  <span className="text-base font-black">{formatCurrency(order.total_amount ?? 0)}</span>
                </div>
              </div>

              {/* Merchant Payment Details (Full & Protected) */}
              <div className="receipt-payment border-t border-dashed border-black pt-1.5 my-1 text-center">
                <div className="border border-black p-1.5 rounded-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-black mb-1">
                    Payment Accounts
                  </p>
                  <div className="text-xs font-bold text-black space-y-0.5">
                    <div className="flex justify-between">
                      <span>Hormuud:</span>
                      <span className="font-mono font-black">623008</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wallet:</span>
                      <span className="font-mono font-black">571204</span>
                    </div>
                    <div className="flex justify-between">
                      <span>E-Dahab:</span>
                      <span className="font-mono font-black">147636</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="receipt-footer border-t border-dashed border-black pt-1 text-center text-[10px] font-bold text-black space-y-0.5">
                <p className="font-black uppercase text-[11px]">Mahadsanid / Thank you!</p>
                <p>Please visit Hilac Fast Food again</p>
                <p className="font-mono tracking-widest pt-0.5">*{cleanReceiptNumber}*</p>
              </div>

              {/* Thermal paper cutter feed buffer: 18mm margin ensures physical tear bar / knife never slices payment or footer */}
              <div style={{ height: '18mm', minHeight: '18mm', width: '100%', display: 'block' }} />
            </div>
          )}
        </div>,
        document.body
      )}
  </>
  );
}
