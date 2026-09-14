-- Business Assistant — core schema (MVP)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  company TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Operations Lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- new | processing | fulfilled | overdue
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | pending | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | approval | scheduled | done
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON support_tickets(created_at);
