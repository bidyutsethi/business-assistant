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

-- Permissions: admin | member | viewer. (`role` above is only a job title.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'member';

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

CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_label TEXT NOT NULL,
  action_label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- communication | data | business | infrastructure
  connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON support_tickets(customer_id);

-- Workspaces: each company's private data. Every row in the tables above
-- belongs to exactly one workspace, and every query filters by it.
CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL, -- shared by an admin so teammates can join
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);

CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_workspace ON orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON support_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
