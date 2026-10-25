import { SupabaseClient } from '@supabase/supabase-js';
import type { Order, Profile } from './supabase';
import { getCleanOrderNumber } from './utils';

export interface CachedOrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  quantity: number;
  unit_price: number;
  products?: {
    id?: string;
    name: string;
    price?: number;
  } | null;
}

export interface CachedOrder extends Order {
  items?: CachedOrderItem[];
  waiter?: Profile | null;
  profiles?: Profile | null;
  expanded?: boolean;
}

const CACHE_KEY = 'hilac_order_history_cache_v2';
const LAST_SYNC_KEY = 'hilac_order_history_last_sync_v2';
const MAX_CACHED_ORDERS = 500;

// In-memory cache fallback in case localStorage is disabled or corrupted
let memoryOrders: CachedOrder[] | null = null;
let memoryLastSync: string | null = null;

/**
 * Retrieve cached orders synchronously from local storage / memory.
 * This returns instantaneously with 0 network latency.
 */
export function getCachedOrders(): CachedOrder[] {
  if (memoryOrders && memoryOrders.length > 0) {
    return memoryOrders;
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed: CachedOrder[] = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Sort newest first
      parsed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      memoryOrders = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse cached order history:', err);
  }
  return [];
}

/**
 * Get the timestamp of the last successful synchronization.
 */
export function getLastSyncTime(): string | null {
  if (memoryLastSync) return memoryLastSync;
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

/**
 * Save orders to cache and memory.
 */
export function saveCachedOrders(orders: CachedOrder[], syncTime?: string): void {
  // Sort descending and cap size to avoid storage quota limits
  const sorted = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, MAX_CACHED_ORDERS);

  memoryOrders = sorted;
  const now = syncTime || new Date().toISOString();
  memoryLastSync = now;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(sorted));
    localStorage.setItem(LAST_SYNC_KEY, now);
  } catch (err) {
    console.warn('LocalStorage save failed (possible quota limit):', err);
    // If quota exceeded, try trimming half
    try {
      const trimmed = sorted.slice(0, 150);
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      // Keep in memory at least
    }
  }
}

/**
 * Immediately insert or update an order into the local cache.
 * Useful when cashier completes/cancels a bill so history updates immediately.
 */
export function addOrUpdateCachedOrder(order: CachedOrder): CachedOrder[] {
  const current = getCachedOrders();
  const existingIdx = current.findIndex(o => o.id === order.id);

  let updated: CachedOrder[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = {
      ...updated[existingIdx],
      ...order,
      waiter: order.waiter || order.profiles || updated[existingIdx].waiter,
      items: order.items || updated[existingIdx].items || []
    };
  } else {
    updated = [order, ...current];
  }

  saveCachedOrders(updated);
  return updated;
}

/**
 * Normalizes raw order response from Supabase into our clean CachedOrder format.
 */
function normalizeOrder(order: any): CachedOrder {
  return {
    ...order,
    waiter: order.profiles || order.waiter || null,
    items: Array.isArray(order.order_items)
      ? order.order_items
      : Array.isArray(order.items)
      ? order.items
      : [],
    expanded: false
  };
}

/**
 * Fetch items in batch for a list of order IDs if not joined automatically.
 */
async function fetchItemsForOrders(supabase: SupabaseClient, orderIds: string[]): Promise<Record<string, any[]>> {
  if (orderIds.length === 0) return {};
  try {
    const { data: items, error } = await supabase
      .from('order_items')
      .select('*, products(id, name, price)')
      .in('order_id', orderIds);

    if (error) throw error;

    const map: Record<string, any[]> = {};
    items?.forEach(item => {
      if (!map[item.order_id]) map[item.order_id] = [];
      map[item.order_id].push(item);
    });
    return map;
  } catch (err) {
    console.warn('Batch items fetch error:', err);
    return {};
  }
}

/**
 * Synchronize order history with delta loading:
 * - If cache is empty or forceFullRefresh = true: pulls past completed orders.
 * - If cache exists: queries ONLY new orders created since lastSyncTime,
 *   plus recent 24h updates (to catch status flips like pending -> paid/cancelled).
 * Merges incrementally into the local cache.
 */
export async function syncHistoryOrders(
  supabase: SupabaseClient,
  options: { forceRefresh?: boolean } = {}
): Promise<{ orders: CachedOrder[]; newCount: number; fromCache: boolean }> {
  const cached = getCachedOrders();
  const lastSync = getLastSyncTime();
  const shouldDelta = !options.forceRefresh && cached.length > 0 && !!lastSync;

  try {
    let rawOrders: any[] = [];

    if (shouldDelta && lastSync) {
      // Delta mode: fetch only orders created after lastSync, or within the last 24h for status updates
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const deltaSince = new Date(lastSync).getTime() < new Date(twentyFourHoursAgo).getTime()
        ? lastSync
        : twentyFourHoursAgo;

      const { data, error } = await supabase
        .from('orders')
        .select('*, profiles(*), order_items(*, products(id, name, price))')
        .neq('status', 'pending')
        .gte('created_at', deltaSince)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback without deep nested relation
        const { data: flatData, error: flatError } = await supabase
          .from('orders')
          .select('*, profiles(*)')
          .neq('status', 'pending')
          .gte('created_at', deltaSince)
          .order('created_at', { ascending: false });

        if (flatError) throw flatError;

        if (flatData && flatData.length > 0) {
          const itemsMap = await fetchItemsForOrders(supabase, flatData.map(o => o.id));
          rawOrders = flatData.map(o => ({
            ...o,
            order_items: itemsMap[o.id] || []
          }));
        }
      } else {
        rawOrders = data || [];
      }

      // Merge delta into cached orders
      const normalizedNew = rawOrders.map(normalizeOrder);
      const existingMap = new Map<string, CachedOrder>();
      cached.forEach(o => existingMap.set(o.id, o));

      let newCount = 0;
      normalizedNew.forEach(newItem => {
        if (!existingMap.has(newItem.id)) {
          newCount++;
        }
        existingMap.set(newItem.id, newItem);
      });

      const merged = Array.from(existingMap.values());
      saveCachedOrders(merged);

      return { orders: merged, newCount, fromCache: false };
    } else {
      // Full/Initial sync: fetch up to 200 past completed orders
      const { data, error } = await supabase
        .from('orders')
        .select('*, profiles(*), order_items(*, products(id, name, price))')
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        // Fallback with 2-step batch fetch
        const { data: flatData, error: flatError } = await supabase
          .from('orders')
          .select('*, profiles(*)')
          .neq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(200);

        if (flatError) throw flatError;

        if (flatData && flatData.length > 0) {
          const itemsMap = await fetchItemsForOrders(supabase, flatData.map(o => o.id));
          rawOrders = flatData.map(o => ({
            ...o,
            order_items: itemsMap[o.id] || []
          }));
        }
      } else {
        rawOrders = data || [];
      }

      const normalized = rawOrders.map(normalizeOrder);
      saveCachedOrders(normalized);

      return { orders: normalized, newCount: normalized.length, fromCache: false };
    }
  } catch (err) {
    console.error('syncHistoryOrders error:', err);
    // On network failure, safely return existing cache
    return { orders: cached, newCount: 0, fromCache: true };
  }
}

/**
 * High-performance, multi-term local search across cached orders:
 * Searches table number, waiter name, product item names, order ID, amount, and date.
 */
export function searchCachedOrders(
  orders: CachedOrder[],
  query: string,
  options?: {
    status?: 'all' | 'paid' | 'cancelled';
    dateFilter?: 'all' | 'today' | 'yesterday' | 'week';
  }
): CachedOrder[] {
  let result = orders;

  // Filter by status if provided
  if (options?.status && options.status !== 'all') {
    result = result.filter(o => o.status === options.status);
  }

  // Filter by date if provided
  if (options?.dateFilter && options.dateFilter !== 'all') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    result = result.filter(o => {
      const orderTime = new Date(o.created_at).getTime();
      if (options.dateFilter === 'today') {
        return orderTime >= todayStart;
      }
      if (options.dateFilter === 'yesterday') {
        return orderTime >= yesterdayStart && orderTime < todayStart;
      }
      if (options.dateFilter === 'week') {
        return orderTime >= weekAgoStart;
      }
      return true;
    });
  }

  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return result;

  const terms = cleanQuery.split(/\s+/).filter(Boolean);

  return result.filter(order => {
    const cleanNum = getCleanOrderNumber(order.id);
    const tableStr = `table ${order.table_number} #${order.table_number} t${order.table_number} ${order.table_number}`;
    const waiterStr = (order.waiter?.full_name || order.profiles?.full_name || '').toLowerCase();
    const idStr = order.id.toLowerCase();
    const receiptStr = `receipt #${cleanNum} ${cleanNum} #${cleanNum} order #${cleanNum}`;
    const amountStr = `${order.total_amount} $${order.total_amount}`;
    const statusStr = (order.status || '').toLowerCase();
    const dateFormatted = new Date(order.created_at).toLocaleDateString().toLowerCase();
    const timeFormatted = new Date(order.created_at).toLocaleTimeString().toLowerCase();

    const itemsStr = (order.items || [])
      .map(i => `${i.products?.name || ''} ${i.quantity}x`)
      .join(' ')
      .toLowerCase();

    const haystack = `${tableStr} ${waiterStr} ${receiptStr} ${idStr} ${amountStr} ${statusStr} ${dateFormatted} ${timeFormatted} ${itemsStr}`;

    // Every search term must be matched
    return terms.every(term => haystack.includes(term));
  });
}

/**
 * Clear cache helper
 */
export function clearOrderCache(): void {
  memoryOrders = null;
  memoryLastSync = null;
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    // Ignore
  }
}
