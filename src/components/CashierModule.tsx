import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { supabase, type Order, type Profile } from '../lib/supabase';
import { formatCurrency, getCleanOrderNumber, formatReceiptNumber } from '../lib/utils';
import { printReceipt } from '../lib/printService';
import { PosReceiptModal, type PosReceiptOrder } from './PosReceiptModal';
import {
  getCachedOrders,
  syncHistoryOrders,
  addOrUpdateCachedOrder,
  searchCachedOrders,
  getLastSyncTime,
  type CachedOrder
} from '../lib/orderCache';
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Printer,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  Filter,
  Calendar,
  X,
  ChefHat,
  Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CashierModuleProps {
  user: Profile;
}

export interface OrderWithItems extends Order {
  items?: any[];
  waiter?: Profile | null;
  profiles?: Profile | null;
  expanded?: boolean;
}

type CashierTab = 'pending' | 'history';
type StatusFilter = 'all' | 'paid' | 'cancelled';
type DateFilter = 'all' | 'today' | 'yesterday' | 'week';

export function CashierModule({ user }: CashierModuleProps) {
  const [activeTab, setActiveTab] = useState<CashierTab>('pending');
  const [pendingOrders, setPendingOrders] = useState<OrderWithItems[]>([]);
  const [historyOrders, setHistoryOrders] = useState<CachedOrder[]>(() => getCachedOrders());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncDisplay, setLastSyncDisplay] = useState<string>('');
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<PosReceiptOrder | null>(null);
  const [receiptModalType, setReceiptModalType] = useState<'customer' | 'kitchen'>('customer');
  const [receiptModalWidth, setReceiptModalWidth] = useState<'58mm' | '80mm'>('58mm');

  // Search & Filter state for History
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [, startTransition] = useTransition();

  // Load initial orders and subscribe to real-time changes
  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingOrders();
    } else {
      // In history tab, immediately set from cache, then do silent delta sync
      const cached = getCachedOrders();
      setHistoryOrders(cached);
      updateLastSyncLabel();
      runDeltaSync(false);
    }

    // Real-time subscription
    const channel = supabase
      .channel('cashier-orders')
      .on(
        'postgres_changes' as any,
        { event: '*', table: 'orders' },
        (payload: any) => {
          if (activeTab === 'pending') {
            fetchPendingOrders();
          } else {
            // New or updated order in history: run delta sync
            runDeltaSync(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  const updateLastSyncLabel = () => {
    const last = getLastSyncTime();
    if (!last) {
      setLastSyncDisplay('Not synced yet');
      return;
    }
    const diffMs = Date.now() - new Date(last).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      setLastSyncDisplay('Just now');
    } else if (diffSec < 3600) {
      setLastSyncDisplay(`${Math.floor(diffSec / 60)}m ago`);
    } else {
      setLastSyncDisplay(new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  };

  /**
   * Fetch pending orders efficiently using batch items loading instead of N+1 loop.
   */
  const fetchPendingOrders = async () => {
    setLoading(true);
    try {
      // Try fast relational query
      const { data, error } = await supabase
        .from('orders')
        .select('*, profiles(*), order_items(*, products(name))')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map((o: any) => ({
          ...o,
          waiter: o.profiles,
          items: o.order_items || [],
          expanded: false
        }));
        setPendingOrders(formatted);
      } else {
        // Fallback: 2-step batch query
        const { data: ordersData } = await supabase
          .from('orders')
          .select('*, profiles(*)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (ordersData && ordersData.length > 0) {
          const orderIds = ordersData.map(o => o.id);
          const { data: items } = await supabase
            .from('order_items')
            .select('*, products(name)')
            .in('order_id', orderIds);

          const itemsMap: Record<string, any[]> = {};
          items?.forEach(i => {
            if (!itemsMap[i.order_id]) itemsMap[i.order_id] = [];
            itemsMap[i.order_id].push(i);
          });

          const formatted = ordersData.map((order: any) => ({
            ...order,
            waiter: order.profiles,
            items: itemsMap[order.id] || [],
            expanded: false
          }));
          setPendingOrders(formatted);
        } else {
          setPendingOrders([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch pending orders:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delta sync history orders: queries only new/updated orders,
   * retaining previous local cache.
   */
  const runDeltaSync = async (forceRefresh = false) => {
    setSyncing(true);
    if (forceRefresh) setLoading(true);
    try {
      const { orders } = await syncHistoryOrders(supabase, { forceRefresh });
      startTransition(() => {
        setHistoryOrders(orders);
      });
      updateLastSyncLabel();
    } catch (err) {
      console.error('Delta sync error:', err);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  /**
   * Handle payment or cancellation:
   * 1. Updates database.
   * 2. Frees table.
   * 3. Immediately inserts the order into the local cache so history has it instantly!
   */
  const handlePayment = async (orderId: string, tableNumber: number, status: 'paid' | 'cancelled') => {
    try {
      // Find order to cache immediately
      const orderToUpdate = pendingOrders.find(o => o.id === orderId);

      await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      await supabase
        .from('tables')
        .update({ is_occupied: false })
        .eq('number', tableNumber);

      if (orderToUpdate) {
        addOrUpdateCachedOrder({
          ...orderToUpdate,
          status,
          updated_at: new Date().toISOString()
        } as CachedOrder);
      }

      // Update pending UI immediately
      setPendingOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err) {
      alert('Update failed');
    }
  };

  const toggleExpand = (orderId: string) => {
    if (activeTab === 'pending') {
      setPendingOrders(prev => prev.map(o => o.id === orderId ? { ...o, expanded: !o.expanded } : o));
    } else {
      setHistoryOrders(prev => prev.map(o => o.id === orderId ? { ...o, expanded: !o.expanded } : o));
    }
  };

  const openReceiptModal = (
    order: any,
    type: 'customer' | 'kitchen' = 'customer',
    width: '58mm' | '80mm' = '58mm'
  ) => {
    const formatted: PosReceiptOrder = {
      id: order.id,
      table_number: order.table_number,
      waiter_name: order.waiter?.full_name || order.profiles?.full_name || 'Staff',
      created_at: order.created_at,
      items: (order.items || []).map((i: any) => ({
        name: i.products?.name || i.product_name || i.name || 'Item',
        quantity: i.quantity || 1,
        price: i.unit_price ?? i.price ?? 0,
        notes: i.notes
      })),
      subtotal: Number(order.subtotal || 0),
      vat_amount: Number(order.vat_amount || 0),
      total_amount: Number(order.total_amount || 0),
      status: order.status
    };
    setSelectedReceiptOrder(formatted);
    setReceiptModalType(type);
    setReceiptModalWidth(width);
  };

  // Instant local filtering across cached orders
  const filteredHistoryOrders = useMemo(() => {
    return searchCachedOrders(historyOrders, searchQuery, {
      status: statusFilter,
      dateFilter
    });
  }, [historyOrders, searchQuery, statusFilter, dateFilter]);

  const displayedOrders = activeTab === 'pending' ? pendingOrders : filteredHistoryOrders;

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm print:hidden">
        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            "flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
            activeTab === 'pending' ? "bg-slate-900 text-white shadow-lg" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <span>Pending Bills</span>
          {pendingOrders.length > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-black",
              activeTab === 'pending' ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
            )}>
              {pendingOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
            activeTab === 'history' ? "bg-slate-900 text-white shadow-lg" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <span>Order History</span>
          {historyOrders.length > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-black flex items-center gap-1",
              activeTab === 'history' ? "bg-amber-400 text-slate-950" : "bg-gray-100 text-gray-700"
            )}>
              <Zap size={11} className="fill-current" />
              {historyOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* History Cache & Search Bar (Only shown on Order History tab) */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3 print:hidden">
          {/* Cache Status Header */}
          <div className="flex items-center justify-between text-xs pb-1 border-b border-gray-50">
            <div className="flex items-center gap-2 text-slate-700">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200/60">
                <Zap size={12} className="fill-amber-500 text-amber-600" />
                Local Cache Active ({historyOrders.length} orders)
              </span>
              <span className="text-gray-400 text-[11px] hidden sm:inline">
                Synced: {lastSyncDisplay}
              </span>
            </div>
            <button
              onClick={() => runDeltaSync(true)}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors disabled:opacity-50"
              title="Force full re-sync from server"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin text-blue-600' : ''} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Instant search: Table #, Waiter, Food item, Receipt ID, Amount..."
              className="w-full pl-10 pr-10 py-3 bg-gray-50 rounded-2xl text-sm font-medium border border-gray-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2 items-center text-xs">
            {/* Status Filters */}
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
              {(['all', 'paid', 'cancelled'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-3 py-1 rounded-lg font-bold capitalize transition-all",
                    statusFilter === status
                      ? status === 'paid'
                        ? "bg-green-600 text-white shadow-sm"
                        : status === 'cancelled'
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-slate-900 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Date Filters */}
            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
              {(['all', 'today', 'yesterday', 'week'] as DateFilter[]).map((df) => (
                <button
                  key={df}
                  onClick={() => setDateFilter(df)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-bold capitalize transition-all",
                    dateFilter === df
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  {df === 'week' ? 'Past 7 Days' : df}
                </button>
              ))}
            </div>

            {/* Result count */}
            <div className="ml-auto text-[11px] font-bold text-gray-400">
              Showing {filteredHistoryOrders.length} of {historyOrders.length}
            </div>
          </div>
        </div>
      )}

      {/* Title & Refresh for Pending tab */}
      {activeTab === 'pending' && (
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>Pending Bills</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
              Live Tables
            </span>
          </h2>
          <button
            onClick={fetchPendingOrders}
            className="p-2.5 bg-white border border-gray-100 rounded-2xl text-blue-600 shadow-sm active:scale-95 transition-transform"
            title="Refresh Pending Bills"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {displayedOrders.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 print:hidden bg-white rounded-3xl border border-gray-100">
          <Clock size={48} className="mb-4 opacity-20" />
          <p className="font-bold text-base text-gray-600">
            {activeTab === 'pending'
              ? 'No pending orders waiting for payment'
              : searchQuery
              ? `No cached orders found matching "${searchQuery}"`
              : 'No order history cached yet'}
          </p>
          {activeTab === 'history' && searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setDateFilter('all');
              }}
              className="mt-3 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Orders List */}
      <div className="grid gap-4 print:hidden">
        <AnimatePresence mode="popLayout">
          {displayedOrders.map(order => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Table</span>
                        <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-md border border-amber-200/60">
                          {formatReceiptNumber(order.id)}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black text-slate-900">{order.table_number}</h3>
                    </div>
                    <div className="h-10 w-px bg-gray-100" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Waiter</span>
                      <p className="text-sm font-bold text-gray-700">
                        {order.waiter?.full_name || order.profiles?.full_name || 'Unknown'}
                      </p>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      {order.status !== 'pending' && (
                        <span className={cn(
                          "text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider",
                          order.status === 'paid' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {order.status}
                        </span>
                      )}
                      <div className="text-[10px] text-gray-400">
                        Sub: {formatCurrency(order.subtotal)} | VAT: {formatCurrency(order.vat_amount)}
                      </div>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{formatCurrency(order.total_amount)}</p>
                  </div>
                </div>

                {/* Items collapse toggler */}
                <button
                  onClick={() => toggleExpand(order.id)}
                  className="w-full flex items-center justify-between py-2 text-xs font-bold text-gray-500 hover:text-gray-800 border-t border-gray-50 mt-2 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{order.items?.length || 0} ITEMS</span>
                    {order.items && order.items.length > 0 && !order.expanded && (
                      <span className="text-gray-400 font-normal truncate max-w-xs text-[11px]">
                        ({order.items.slice(0, 3).map(i => i.products?.name).filter(Boolean).join(', ')}{order.items.length > 3 ? '...' : ''})
                      </span>
                    )}
                  </span>
                  {order.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                <AnimatePresence>
                  {order.expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="py-3 space-y-2 bg-gray-50/70 px-4 rounded-2xl my-2 border border-gray-100/60">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-gray-700 font-medium">
                              <strong className="text-slate-900">{item.quantity}x</strong> {item.products?.name || 'Item'}
                            </span>
                            <span className="font-bold text-gray-900">
                              {formatCurrency(item.unit_price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button
                    onClick={() => openReceiptModal(order, 'customer', '58mm')}
                    className="p-2.5 sm:px-3 sm:py-2.5 bg-slate-100 text-slate-800 rounded-xl hover:bg-amber-100 hover:text-amber-900 active:scale-95 transition-all flex items-center gap-1.5 font-bold text-xs"
                    title="Open Customer Receipt (58mm / 80mm available)"
                  >
                    <Receipt size={15} className="text-amber-600" />
                    <span>Receipt</span>
                  </button>

                  <button
                    onClick={() => openReceiptModal(order, 'kitchen', '58mm')}
                    className="p-2.5 sm:px-3 sm:py-2.5 bg-slate-100 text-slate-800 rounded-xl hover:bg-orange-100 hover:text-orange-900 active:scale-95 transition-all flex items-center gap-1.5 font-bold text-xs"
                    title="Open Kitchen Order Ticket (KOT)"
                  >
                    <ChefHat size={15} className="text-orange-600" />
                    <span>Kitchen</span>
                  </button>

                  <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      onClick={() => openReceiptModal(order, 'customer', '58mm')}
                      className="px-2 py-1 text-[10px] font-black rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition-all"
                      title="Print in 58mm Thermal format"
                    >
                      58mm
                    </button>
                    <button
                      onClick={() => openReceiptModal(order, 'customer', '80mm')}
                      className="px-2 py-1 text-[10px] font-black rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition-all"
                      title="Print in 80mm Thermal format"
                    >
                      80mm
                    </button>
                  </div>

                  {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handlePayment(order.id, order.table_number, 'paid')}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white h-11 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm text-xs sm:text-sm"
                      >
                        <CheckCircle size={17} />
                        Mark Paid
                      </button>
                      <button
                        onClick={() => handlePayment(order.id, order.table_number, 'cancelled')}
                        className="px-3 bg-red-50 text-red-600 hover:bg-red-100 h-11 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs"
                      >
                        <XCircle size={17} />
                        Cancel
                      </button>
                    </>
                  )}
                  {order.status !== 'pending' && (
                    <div className="flex-1 flex items-center justify-end text-xs text-slate-500 font-bold font-mono">
                      Receipt: {formatReceiptNumber(order.id)}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modern POS Receipt & Kitchen Ticket Modal */}
      {selectedReceiptOrder && (
        <PosReceiptModal
          order={selectedReceiptOrder}
          initialType={receiptModalType}
          initialWidth={receiptModalWidth}
          onClose={() => setSelectedReceiptOrder(null)}
        />
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
