import React, { useState, useEffect } from 'react';
import { supabase, type Profile, type UserRole, type Product, type Category } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, DollarSign, ShoppingBag, Plus, X, Edit2, Trash2, LayoutDashboard, Utensils, Tag, ChevronRight, UserCircle, ChefHat, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminModuleProps {
  user: Profile;
}

type AdminTab = 'dashboard' | 'users' | 'products' | 'categories';

export function AdminModule({ user }: AdminModuleProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState({
    totalSales: 0,
    paidCount: 0,
    cancelledCount: 0,
    topProducts: [] as any[],
    recentOrders: [] as any[]
  });
  
  const [dateRange, setDateRange] = useState<'today' | 'weekly' | 'monthly' | 'custom'>('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  
  const [users, setUsers] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [showModal, setShowModal] = useState<'user' | 'product' | 'category' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form states
  const [userForm, setUserForm] = useState({ full_name: '', pin: '', role: 'waiter' as UserRole });
  const [productForm, setProductForm] = useState({ name: '', price: '', category_id: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, any[]>>({});
  const [recentOrderSearch, setRecentOrderSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeTab, dateRange, customRange]);

  const fetchData = async () => {
    if (activeTab === 'dashboard') fetchStats();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'products') {
      fetchProducts();
      fetchCategories();
    }
    if (activeTab === 'categories') fetchCategories();
  };

  const fetchStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let query = supabase.from('orders').select('*, profiles(full_name)');
      let itemsQuery = supabase.from('order_items').select('product_id, quantity, products(name)');

      if (dateRange === 'today') {
        query = query.gte('created_at', today.toISOString());
        itemsQuery = itemsQuery.gte('created_at', today.toISOString());
      } else if (dateRange === 'weekly') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        query = query.gte('created_at', lastWeek.toISOString());
        itemsQuery = itemsQuery.gte('created_at', lastWeek.toISOString());
      } else if (dateRange === 'monthly') {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        query = query.gte('created_at', lastMonth.toISOString());
        itemsQuery = itemsQuery.gte('created_at', lastMonth.toISOString());
      } else if (dateRange === 'custom' && customRange.start && customRange.end) {
        query = query.gte('created_at', new Date(customRange.start).toISOString())
                     .lte('created_at', new Date(customRange.end).toISOString());
        itemsQuery = itemsQuery.gte('created_at', new Date(customRange.start).toISOString())
                               .lte('created_at', new Date(customRange.end).toISOString());
      }

      const { data: orders, error: ordersError } = await query.order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      if (orders) {
        const paid = orders.filter(o => o.status === 'paid');
        const cancelled = orders.filter(o => o.status === 'cancelled');
        const total = paid.reduce((sum, o) => sum + Number(o.total_amount), 0);

        const { data: items, error: itemsError } = await itemsQuery;
        
        if (itemsError) throw itemsError;
        
        const productMap: any = {};
        items?.forEach((item: any) => {
          const name = item.products?.name || 'Unknown';
          productMap[name] = (productMap[name] || 0) + item.quantity;
        });

        const topProducts = Object.entries(productMap)
          .map(([name, qty]) => ({ name, qty }))
          .sort((a: any, b: any) => b.qty - a.qty)
          .slice(0, 5);

        setStats({
          totalSales: total,
          paidCount: paid.length,
          cancelledCount: cancelled.length,
          topProducts,
          recentOrders: orders.slice(0, 20)
        });
      }
    } catch (error: any) {
      console.error("Fetch stats error:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      if (data) setUsers(data);
    } catch (error: any) {
      console.error("Fetch users error:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase.from('products').select('*, categories(name)').order('name');
      if (error) throw error;
      if (data) setProducts(data);
    } catch (error: any) {
      console.error("Fetch products error:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      if (data) setCategories(data);
    } catch (error: any) {
      console.error("Fetch categories error:", error);
    }
  };

  const toggleOrderExpansion = async (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
      if (!orderItemsMap[orderId]) {
        const { data } = await supabase
          .from('order_items')
          .select('*, products(name)')
          .eq('order_id', orderId);
        if (data) {
          setOrderItemsMap(prev => ({ ...prev, [orderId]: data }));
        }
      }
    }
    setExpandedOrders(newExpanded);
  };

  const openAddModal = (type: 'user' | 'product' | 'category') => {
    setEditingItem(null);
    if (type === 'user') setUserForm({ full_name: '', pin: '', role: 'waiter' });
    if (type === 'product') setProductForm({ name: '', price: '', category_id: '' });
    if (type === 'category') setCategoryForm({ name: '' });
    setShowModal(type);
  };

  const openEditModal = (type: 'user' | 'product' | 'category', item: any) => {
    setEditingItem(item);
    if (type === 'user') setUserForm({ full_name: item.full_name, pin: item.pin, role: item.role });
    if (type === 'product') setProductForm({ name: item.name, price: item.price.toString(), category_id: item.category_id });
    if (type === 'category') setCategoryForm({ name: item.name });
    setShowModal(type);
  };

  const handleSaveUser = async () => {
    if (!userForm.full_name || !userForm.pin) {
      alert("Please fill in Name and PIN");
      return;
    }
    
    const userData = {
      id: editingItem ? editingItem.id : crypto.randomUUID(),
      full_name: userForm.full_name,
      pin: userForm.pin,
      role: userForm.role
    };

    try {
      if (editingItem) {
        const { error } = await supabase.from('profiles').update({
          full_name: userData.full_name,
          pin: userData.pin,
          role: userData.role
        }).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('profiles').insert(userData);
        if (error) throw error;
      }
      setShowModal(null);
      setEditingItem(null);
      setUserForm({ full_name: '', pin: '', role: 'waiter' });
      fetchUsers();
    } catch (error: any) {
      console.error("User save error:", error);
      alert("Failed to save user: " + error.message);
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.price || !productForm.category_id) {
      alert("Please fill in all product fields");
      return;
    }
    
    const productData = {
      name: productForm.name,
      price: parseFloat(productForm.price as string),
      category_id: productForm.category_id
    };

    try {
      if (editingItem) {
        const { error } = await supabase.from('products').update(productData).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(productData);
        if (error) throw error;
      }
      setShowModal(null);
      setEditingItem(null);
      setProductForm({ name: '', price: '', category_id: '' });
      fetchProducts();
    } catch (error: any) {
      console.error("Product save error:", error);
      alert("Failed to save product: " + error.message);
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name) return;
    
    try {
      if (editingItem) {
        const { error } = await supabase.from('categories').update({ name: categoryForm.name }).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ name: categoryForm.name });
        if (error) throw error;
      }
      setShowModal(null);
      setEditingItem(null);
      setCategoryForm({ name: '' });
      fetchCategories();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDelete = async (table: string, id: string) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
      if (table === 'orders') {
        // Delete items first
        await supabase.from('order_items').delete().eq('order_id', id);
      }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert('Delete failed: ' + error.message);
    }
  };

  const handleClearAllOrders = async () => {
    if (!confirm('CRITICAL: This will delete ALL orders and order items from the system. Are you sure?')) return;
    try {
      // Delete all order items first
      const { error: itemsError } = await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (itemsError) throw itemsError;
      
      // Delete all orders
      const { error: ordersError } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (ordersError) throw ordersError;
      
      // Reset all tables to not occupied
      await supabase.from('tables').update({ is_occupied: false }).neq('id', 0);
      
      alert('All order data has been cleared.');
      fetchData();
    } catch (error: any) {
      alert('Clear data failed: ' + error.message);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Admin Navigation - Sticky and Scrollable */}
      <div className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-30 -mx-4 px-4 py-3 border-b border-gray-100 mb-2 print:hidden">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'users', label: 'Staff', icon: Users },
            { id: 'products', label: 'Products', icon: Utensils },
            { id: 'categories', label: 'Categories', icon: Tag },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl whitespace-nowrap font-bold text-sm transition-all",
                activeTab === tab.id 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                  : "bg-white text-gray-500 border border-gray-100"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Date Range Selector */}
          <div className="flex flex-col gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Performance Overview</h3>
              <button 
                onClick={handleClearAllOrders}
                className="text-[10px] uppercase font-black text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
              >
                Clear All Data
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {['today', 'weekly', 'monthly', 'custom'].map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range as any)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all",
                    dateRange === range 
                      ? "bg-slate-900 text-white" 
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
            
            {dateRange === 'custom' && (
              <div className="flex gap-2 items-center pt-2">
                <input 
                  type="date" 
                  className="flex-1 h-10 px-3 rounded-xl border border-gray-100 bg-gray-50 text-xs font-bold"
                  value={customRange.start}
                  onChange={e => setCustomRange({...customRange, start: e.target.value})}
                />
                <span className="text-gray-400 text-xs">to</span>
                <input 
                  type="date" 
                  className="flex-1 h-10 px-3 rounded-xl border border-gray-100 bg-gray-50 text-xs font-bold"
                  value={customRange.end}
                  onChange={e => setCustomRange({...customRange, end: e.target.value})}
                />
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-3">
                <DollarSign size={20} />
              </div>
              <p className="text-[10px] uppercase font-bold text-gray-400">Total Sales</p>
              <p className="text-xl font-black text-gray-900">{formatCurrency(stats.totalSales)}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-3">
                <ShoppingBag size={20} />
              </div>
              <p className="text-[10px] uppercase font-bold text-gray-400">Paid Orders</p>
              <p className="text-xl font-black text-gray-900">{stats.paidCount}</p>
            </div>
          </div>

          {/* Top Products Chart */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6">Top Performing Products</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="qty" radius={[0, 10, 10, 0]}>
                    {stats.topProducts.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Orders List */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="font-bold text-gray-900">Recent Orders ({dateRange})</h3>
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Filter table, waiter..."
                  value={recentOrderSearch}
                  onChange={(e) => setRecentOrderSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-gray-50 text-xs rounded-xl border border-gray-100 font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {recentOrderSearch && (
                  <button onClick={() => setRecentOrderSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {stats.recentOrders
                .filter(order => {
                  if (!recentOrderSearch.trim()) return true;
                  const q = recentOrderSearch.toLowerCase();
                  const table = `table ${order.table_number} ${order.table_number}`;
                  const waiter = (order.profiles?.full_name || '').toLowerCase();
                  const status = (order.status || '').toLowerCase();
                  const id = order.id.toLowerCase();
                  return table.includes(q) || waiter.includes(q) || status.includes(q) || id.includes(q);
                })
                .map(order => (
                <div key={order.id} className="border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between py-3">
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => toggleOrderExpansion(order.id)}
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        order.status === 'paid' ? "bg-green-500" : order.status === 'cancelled' ? "bg-red-500" : "bg-orange-500"
                      )} />
                      <div>
                        <p className="text-sm font-bold text-gray-900">Table {order.table_number}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">{order.profiles?.full_name || 'System'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{formatCurrency(order.total_amount)}</p>
                        <p className="text-[10px] text-gray-400">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleDelete('orders', order.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Order"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ChevronRight 
                          size={16} 
                          className={cn("text-gray-300 transition-transform cursor-pointer", expandedOrders.has(order.id) && "rotate-90")} 
                          onClick={() => toggleOrderExpansion(order.id)}
                        />
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedOrders.has(order.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-gray-50 rounded-2xl p-4 mt-2 space-y-2">
                          {orderItemsMap[order.id]?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-gray-600">{item.quantity}x {item.products?.name}</span>
                              <span className="font-bold text-gray-900">{formatCurrency(item.unit_price * item.quantity)}</span>
                            </div>
                          ))}
                          {!orderItemsMap[order.id] && <p className="text-[10px] text-gray-400 text-center py-2">Loading items...</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Staff Management</h3>
            <button onClick={() => openAddModal('user')} className="flex items-center gap-1 text-sm font-bold text-blue-600">
              <Plus size={16} /> Add Staff
            </button>
          </div>
          <div className="grid gap-3">
            {users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                    {u.role === 'waiter' ? <ChefHat size={24} /> : <UserCircle size={24} />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{u.full_name}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{u.role} • PIN: {u.pin}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditModal('user', u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('profiles', u.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Product Management</h3>
            <button onClick={() => openAddModal('product')} className="flex items-center gap-1 text-sm font-bold text-blue-600">
              <Plus size={16} /> Add Product
            </button>
          </div>
          <div className="grid gap-3">
            {products.map(p => (
              <div key={p.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-gray-900">{p.name}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{(p as any).categories?.name} • {formatCurrency(p.price)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditModal('product', p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('products', p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Category Management</h3>
            <button onClick={() => openAddModal('category')} className="flex items-center gap-1 text-sm font-bold text-blue-600">
              <Plus size={16} /> Add Category
            </button>
          </div>
          <div className="grid gap-3">
            {categories.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
                <p className="font-bold text-gray-900">{c.name}</p>
                <div className="flex gap-2">
                  <button onClick={() => openEditModal('category', c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('categories', c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-black text-xl text-slate-900">
                  {editingItem ? 'Edit' : 'Add'} {showModal.charAt(0).toUpperCase() + showModal.slice(1)}
                </h4>
                <button onClick={() => { setShowModal(null); setEditingItem(null); }} className="p-2 bg-gray-50 rounded-full"><X size={20} /></button>
              </div>

              {showModal === 'user' && (
                <div className="space-y-3">
                  <input type="text" placeholder="Full Name" className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={userForm.full_name} onChange={e => setUserForm({...userForm, full_name: e.target.value})} />
                  <input type="text" placeholder="PIN" className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={userForm.pin} onChange={e => setUserForm({...userForm, pin: e.target.value})} />
                  <select className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as UserRole})}>
                    <option value="waiter">Waiter</option>
                    <option value="cashier">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleSaveUser} className="w-full bg-slate-900 text-white h-14 rounded-2xl font-black shadow-lg shadow-slate-200">Save Staff</button>
                </div>
              )}

              {showModal === 'product' && (
                <div className="space-y-3">
                  <input type="text" placeholder="Product Name" className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} />
                  <input type="number" placeholder="Price" className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} />
                  <select className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={productForm.category_id} onChange={e => setProductForm({...productForm, category_id: e.target.value})}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={handleSaveProduct} className="w-full bg-slate-900 text-white h-14 rounded-2xl font-black shadow-lg shadow-slate-200">Save Product</button>
                </div>
              )}

              {showModal === 'category' && (
                <div className="space-y-3">
                  <input type="text" placeholder="Category Name" className="w-full h-14 px-5 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-slate-900 outline-none font-bold" value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} />
                  <button onClick={handleSaveCategory} className="w-full bg-slate-900 text-white h-14 rounded-2xl font-black shadow-lg shadow-slate-200">Save Category</button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
