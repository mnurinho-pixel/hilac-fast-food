import React, { useState, useEffect } from 'react';
import { supabase, type Product, type Category, type Table, type Profile } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { printReceipt } from '../lib/printService';
import { ShoppingCart, Trash2, Send, ChevronRight, Grid, User, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WaiterModuleProps {
  user: Profile;
}

export function WaiterModule({ user }: WaiterModuleProps) {
  const [step, setStep] = useState<'table' | 'menu'>('table');
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Record<number, any>>({});
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();

    // Real-time table and order updates
    const channel = supabase
      .channel('waiter-updates')
      .on(
        'postgres_changes' as any,
        { event: '*', table: 'tables' },
        () => fetchInitialData()
      )
      .on(
        'postgres_changes' as any,
        { event: '*', table: 'orders' },
        () => fetchInitialData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchInitialData = async () => {
    const [catRes, tableRes, ordersRes] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('tables').select('*').order('number'),
      supabase.from('orders').select('*, order_items(*, products(*))').eq('status', 'pending')
    ]);

    if (catRes.data) {
      setCategories(catRes.data);
      setActiveCategory(catRes.data[0]?.id || null);
    }
    if (tableRes.data) setTables(tableRes.data);
    
    if (ordersRes.data) {
      const orderMap: Record<number, any> = {};
      ordersRes.data.forEach(order => {
        orderMap[order.table_number] = order;
      });
      setActiveOrders(orderMap);
    }
  };

  useEffect(() => {
    if (activeCategory) {
      supabase.from('products').select('*').eq('category_id', activeCategory)
        .then(({ data }) => data && setProducts(data));
    }
  }, [activeCategory]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const VAT_RATE = 0.05;
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const vatAmount = subtotal * VAT_RATE;
  const total = subtotal + vatAmount;

  const [showReceipt, setShowReceipt] = useState(false);

  const submitOrder = async () => {
    if (!selectedTable || cart.length === 0) return;
    setLoading(true);
    try {
      if (editingOrderId) {
        // Update existing order
        const { error: orderError } = await supabase
          .from('orders')
          .update({
            subtotal: subtotal,
            vat_amount: vatAmount,
            total_amount: total,
          })
          .eq('id', editingOrderId);

        if (orderError) throw orderError;

        // Delete old items and insert new ones
        await supabase.from('order_items').delete().eq('order_id', editingOrderId);
        
        const orderItems = cart.map(item => ({
          order_id: editingOrderId,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.price
        }));

        await supabase.from('order_items').insert(orderItems);
      } else {
        // Create new order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            table_number: selectedTable,
            waiter_id: user.id,
            subtotal: subtotal,
            vat_amount: vatAmount,
            total_amount: total,
            status: 'pending'
          })
          .select()
          .single();

        if (orderError) throw orderError;

        const orderItems = cart.map(item => ({
          order_id: order.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.price
        }));

        await supabase.from('order_items').insert(orderItems);
        await supabase.from('tables').update({ is_occupied: true }).eq('number', selectedTable);
      }

      setShowReceipt(true);
    } catch (err: any) {
      console.error('Order submission error:', err);
      alert('Failed to submit order: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const closeReceipt = () => {
    setCart([]);
    setSelectedTable(null);
    setEditingOrderId(null);
    setStep('table');
    setShowReceipt(false);
  };

  if (showReceipt) {
    return (
      <ReceiptPopup 
        order={{ 
          table_number: selectedTable, 
          subtotal, 
          vat_amount: vatAmount, 
          total_amount: total 
        }}
        items={cart}
        waiterName={user.full_name}
        onClose={closeReceipt}
        isUpdate={!!editingOrderId}
      />
    );
  }

  if (step === 'table') {
    return (
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Select Table</h2>
          <Grid className="text-gray-400" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {tables.map(table => {
            const activeOrder = activeOrders[table.number];
            const isMyTable = activeOrder && activeOrder.waiter_id === user.id;
            const isOtherTable = activeOrder && activeOrder.waiter_id !== user.id;

            return (
              <button
                key={table.id}
                onClick={() => {
                  if (isOtherTable) {
                    alert('This table is being served by another waiter.');
                    return;
                  }
                  
                  if (isMyTable) {
                    // Load existing order into cart
                    const existingItems = activeOrder.order_items.map((item: any) => ({
                      product: item.products,
                      quantity: item.quantity
                    }));
                    setCart(existingItems);
                    setEditingOrderId(activeOrder.id);
                  } else {
                    setCart([]);
                    setEditingOrderId(null);
                  }

                  setSelectedTable(table.number);
                  setStep('menu');
                }}
                className={cn(
                  "h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-lg transition-all active:scale-95 relative overflow-hidden",
                  isOtherTable 
                    ? "bg-red-50 text-red-400 border-2 border-red-100 opacity-60 cursor-not-allowed" 
                    : isMyTable
                      ? "bg-blue-50 text-blue-600 border-2 border-blue-200 shadow-sm"
                      : "bg-white text-gray-700 border-2 border-gray-100 shadow-sm"
                )}
              >
                {isMyTable && <User size={12} className="absolute top-2 right-2 opacity-40" />}
                {isOtherTable && <Lock size={12} className="absolute top-2 right-2 opacity-40" />}
                <span className="text-[10px] uppercase opacity-60">
                  {isMyTable ? 'My Table' : isOtherTable ? 'Occupied' : 'Table'}
                </span>
                {table.number}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] print:hidden">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => {
            setStep('table');
            setCart([]);
            setEditingOrderId(null);
          }}
          className="p-2 bg-white rounded-xl shadow-sm border border-gray-100"
        >
          <ChevronRight className="rotate-180" />
        </button>
        <h2 className="text-xl font-bold">Table {selectedTable}</h2>
      </div>

      {/* Categories */}
      <div className="sticky top-0 z-30 bg-[#f8f9fa] pt-2 pb-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-6 py-3 rounded-2xl whitespace-nowrap font-bold text-sm transition-all shadow-sm active:scale-95",
                activeCategory === cat.id 
                  ? "bg-slate-900 text-white shadow-slate-200" 
                  : "bg-white text-gray-600 border border-gray-100"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pb-64">
        {products.map(product => (
          <button
            key={product.id}
            onClick={() => addToCart(product)}
            className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-start text-left active:scale-95 transition-transform"
          >
            <span className="font-bold text-gray-900 mb-1">{product.name}</span>
            <span className="text-blue-600 font-bold">{formatCurrency(product.price)}</span>
          </button>
        ))}
      </div>

      {/* Cart Summary (Floating) */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-20 left-4 right-4 bg-white rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border border-gray-100 p-5 z-40"
          >
            <div className="space-y-2 mb-4 border-b border-gray-100 pb-4">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>VAT (5%)</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="text-slate-900" size={20} />
                  <span className="font-bold text-slate-900">{cart.length} Items</span>
                </div>
                <span className="text-2xl font-black text-slate-900">{formatCurrency(total)}</span>
              </div>
            </div>
            
            <div className="max-h-24 overflow-y-auto mb-4 space-y-2 no-scrollbar">
              {cart.map(item => (
                <div key={item.product.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 font-medium">{item.quantity}x {item.product.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{formatCurrency(item.product.price * item.quantity)}</span>
                    <button onClick={() => removeFromCart(item.product.id)}>
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={submitOrder}
              disabled={loading}
              className="w-full bg-slate-900 text-white h-14 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-slate-200 active:scale-95 transition-transform"
            >
              <Send size={20} />
              {loading ? 'Processing...' : editingOrderId ? 'Update Order' : 'Send to Cashier'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Receipt Component for Hilac Fast Food
function ReceiptPopup({ 
  order, 
  items, 
  waiterName, 
  onClose,
  isUpdate
}: { 
  order: any, 
  items: any[], 
  waiterName: string, 
  onClose: () => void,
  isUpdate?: boolean
}) {
  const handlePrint = () => {
    printReceipt({
      restaurantName: "Hilac Fast Food",
      tableNumber: order.table_number,
      waiterName: waiterName,
      items: items.map(i => ({
        name: i.product.name,
        quantity: i.quantity,
        price: i.product.price
      })),
      subtotal: order.subtotal,
      tax: order.vat_amount,
      total: order.total_amount,
      paymentDetails: { hormuud: "623008", wallet: "571204", edahab: "147636" },
      orderDate: new Date(order.created_at || Date.now()).toLocaleString()
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[100] backdrop-blur-md print:bg-white print:p-0 print:backdrop-blur-none">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        id="printable-receipt"
        className="bg-white w-full max-w-xs rounded-3xl p-5 shadow-2xl font-mono text-slate-800 relative overflow-hidden print:shadow-none print:rounded-none print:max-w-none print:p-1"
      >
        {isUpdate && (
          <div className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-[9px] font-black uppercase tracking-[0.2em] py-1 text-center no-print">
            Order Updated
          </div>
        )}
        {/* Decorative Circles - Hidden on print */}
        <div className="absolute -top-3 -left-3 w-8 h-8 bg-slate-50 rounded-full print:hidden" />
        <div className="absolute -top-3 -right-3 w-8 h-8 bg-slate-50 rounded-full print:hidden" />

        <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2 print:pb-1 print:mb-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 print:text-sm">Hilac Fast Food</h2>
          <div className="mt-1 space-y-0.5 text-[10px] uppercase font-bold text-gray-400 tracking-wider print:text-black print:text-[8px]">
            <p>Table {order.table_number} • Waiter: {waiterName}</p>
            <p>{new Date().toLocaleString()}</p>
          </div>
        </div>
        
        <div className="space-y-1 mb-3 print:mb-1.5 print:space-y-0.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-xs print:text-[8px]">
              <span className="flex-1 pr-2 truncate">{item.quantity}x {item.product.name}</span>
              <span className="font-bold">{formatCurrency(item.product.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-300 pt-2 print:pt-1 space-y-1 print:space-y-0.5">
          <div className="flex justify-between text-[11px] print:text-[7.5px] font-bold text-gray-400 print:text-black">
            <span>SUBTOTAL</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[11px] print:text-[7.5px] font-bold text-gray-400 print:text-black">
            <span>TAX (5%)</span>
            <span>{formatCurrency(order.vat_amount)}</span>
          </div>
          <div className="flex justify-between text-base font-black pt-1 text-slate-900 border-t border-gray-100 print:border-black mt-1 print:mt-0.5 print:text-[10px] print:text-black">
            <span>TOTAL</span>
            <span>{formatCurrency(order.total_amount)}</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 print:mt-1 print:pt-1 border-t border-dashed border-gray-300 text-center">
          <p className="text-[9px] print:text-[7.5px] font-black uppercase tracking-wider text-slate-400 print:text-black">Payment Details</p>
          <div className="mt-1 space-y-0.5 text-xs print:text-[8px] font-mono font-bold text-slate-800 print:text-black">
            <div className="flex justify-between"><span>Hormuud:</span><span className="font-black">623008</span></div>
            <div className="flex justify-between"><span>Wallet:</span><span className="font-black">571204</span></div>
            <div className="flex justify-between"><span>E-Dahab:</span><span className="font-black">147636</span></div>
          </div>
        </div>

        <div className="mt-2 text-center text-[10px] print:text-[7.5px] font-bold text-slate-400 print:text-black">
          <p>Thank you for visiting Hilac Fast Food!</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
          <button 
            onClick={handlePrint}
            className="bg-slate-900 text-white h-11 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-slate-200 active:scale-95 transition-transform"
          >
            Print Receipt
          </button>
          <button 
            onClick={onClose}
            className="bg-gray-100 text-slate-600 h-11 rounded-xl font-black text-xs active:scale-95 transition-transform"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Utility for Tailwind classes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
