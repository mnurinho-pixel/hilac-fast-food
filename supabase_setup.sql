-- SQL Script for Supabase SQL Editor
-- This script is idempotent (can be run multiple times safely)

-- 1. Create Roles Enum (Safe creation)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'cashier', 'waiter');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'waiter',
  pin TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Remove the old foreign key constraint to auth.users if it exists (to support PIN-only login)
DO $$ BEGIN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 3. Create Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Tables Table
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  is_occupied BOOLEAN DEFAULT FALSE
);

-- 6. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_number INTEGER REFERENCES tables(number),
  waiter_id UUID REFERENCES profiles(id),
  status TEXT CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  subtotal DECIMAL(10,2) DEFAULT 0,
  vat_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist (if table was created previously without them)
DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN vat_amount DECIMAL(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 7. Create Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Insert Initial Categories (Safe insert)
INSERT INTO categories (name) VALUES 
('HOT DRINK'), 
('COL DRINK'), 
('FUIRTS'), 
('FOOD')
ON CONFLICT (name) DO NOTHING;

-- 9. Insert Products from PDF (Safe insert)
-- HOT DRINK
INSERT INTO products (category_id, name, price) 
SELECT id, 'SHAH CANO GEL', 1.5 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'SHAH CANO BORO', 1.5 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'DAWO TEA', 1.75 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'BLACK TEA', 1.1 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'QAXWO CADEYS', 1.5 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'QAXWO BLACK', 1.1 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'water 0.25ml', 0.25 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'water 0.5 ml', 0.4 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'water 1.5 ml', 0.6 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'COFFE', 1.75 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'ESPRESSO COFFE', 1.75 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'black coffe', 1.5 FROM categories WHERE name = 'HOT DRINK'
ON CONFLICT DO NOTHING;

-- COL DRINK
INSERT INTO products (category_id, name, price) 
SELECT id, 'MANGO', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'QARE', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'ISBARAMUUTO', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MANGO SHAK', 2.0 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANO LOWS', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'Papaya', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'LEMO DHANAN', 1.1 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'SAYTUUN', 1.25 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'ISBANDHAYS', 1.25 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CAANO MOS', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANO COSTO', 1.5 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'AFAKANO', 1.75 FROM categories WHERE name = 'COL DRINK'
ON CONFLICT DO NOTHING;

-- FUIRTS
INSERT INTO products (category_id, name, price) 
SELECT id, 'FEETO QARE', 1.75 FROM categories WHERE name = 'FUIRTS'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'FEETO BABAAY', 1.75 FROM categories WHERE name = 'FUIRTS'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MIXED FUIRT', 3.0 FROM categories WHERE name = 'FUIRTS'
ON CONFLICT DO NOTHING;

-- FOOD
INSERT INTO products (category_id, name, price) 
SELECT id, 'QAMARDI & SALBUKO', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'GELEY& DIGIR', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MALAWAX & DALAC BILASH', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MALAWAX & OODKAC', 3.0 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MALAWAX& CANO MACAN', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MALAWAX & SUQAR', 3.0 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'MALAWAX &BEER', 3.0 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANJELO&DALAC BILASH', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANJELO&SUQAR', 3.0 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANJELO&ODKAC', 3.0 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANJELO&BEER', 1.5 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;
INSERT INTO products (category_id, name, price) 
SELECT id, 'CANJELO&TIRIBO', 1.75 FROM categories WHERE name = 'FOOD'
ON CONFLICT DO NOTHING;

-- 10. Insert Initial Tables (Safe insert)
INSERT INTO tables (number) 
SELECT n FROM generate_series(1, 20) n
ON CONFLICT (number) DO NOTHING;

-- 11. Real-time setup (Safe setup)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tables') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tables;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'order_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    END IF;
END $$;

-- 12. Bootstrap Default Admin (PIN: 1234)
INSERT INTO profiles (id, full_name, role, pin) 
VALUES (gen_random_uuid(), 'System Admin', 'admin', '1234')
ON CONFLICT (pin) DO NOTHING;
