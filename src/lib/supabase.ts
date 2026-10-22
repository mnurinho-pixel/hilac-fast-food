import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ibsiospalpuknlqloxwn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlic2lvc3BhbHB1a25scWxveHduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjM0NTMsImV4cCI6MjA5MDY5OTQ1M30.jaYTuiXy8KXQwp9EBprcBKcKXFhTL8Yq-Of0qB-BaFk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'admin' | 'cashier' | 'waiter';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  pin: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  price: number;
}

export interface Table {
  id: number;
  number: number;
  is_occupied: boolean;
}

export interface Order {
  id: string;
  table_number: number;
  waiter_id: string;
  status: 'pending' | 'paid' | 'cancelled';
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}
