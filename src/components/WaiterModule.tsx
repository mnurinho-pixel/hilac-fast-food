import React, { useState, useEffect } from 'react';
import { supabase, type Product, type Category, type Table, type Profile } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { PosReceiptModal, type PosReceiptOrder } from './PosReceiptModal';
import { ShoppingCart, Trash2, Send, ChevronRight, Grid, User, Lock, Printer } from 'lucide-react';
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
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
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
        setSubmittedOrderId(editingOrderId);
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
        setSubmittedOrderId(order.id);
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
    setSubmittedOrderId(null);
    setStep('table');
    setShowReceipt(false);
  };

  if (showReceipt) {
    return (
      <PosReceiptModal 
        order={{ 
          id: submittedOrderId || editingOrderId || undefined,
          table_number: selectedTable || 1, 
          waiter_name: user.full_name,
          created_at: new Date().toISOString(),
          items: cart.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price
          })),
          subtotal, 
          vat_amount: vatAmount, 
          total_amount: total,
          isUpdate: !!editingOrderId
        }}
        initialType="kitchen"
        onClose={closeReceipt}
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

// Utility for Tailwind classes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
