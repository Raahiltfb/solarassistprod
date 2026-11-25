-- SolarAssist Migration 0020: Phase 9 Operational Infrastructure
-- Covers: Automated Onboarding, Spares/Inventory Tracking, Contracts, SLAs, and Billing Invoicing

-- 1. Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'inverter_spare',
  description text,
  unit_of_measure text NOT NULL DEFAULT 'pcs',
  unit_cost_inr numeric(12,2) NOT NULL DEFAULT 0.00,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  min_reorder_level integer NOT NULL DEFAULT 5,
  storage_location text NOT NULL DEFAULT 'Central Warehouse',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_sku_per_org UNIQUE(org_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_org ON public.inventory_items(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);

-- 2. Create inventory_transactions table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL, -- 'stock_in', 'consumed', 'transferred', 'returned', 'adjusted'
  quantity integer NOT NULL,
  unit_cost_inr numeric(12,2),
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_org ON public.inventory_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_site ON public.inventory_transactions(site_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ticket ON public.inventory_transactions(ticket_id);

-- 3. Create contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  client_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  contract_number text NOT NULL,
  contract_type text NOT NULL DEFAULT 'comprehensive_amc', -- 'comprehensive_amc', 'semi_comprehensive', 'preventive_cleaning', 'monitoring_only'
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active', -- 'active', 'pending_renewal', 'expired', 'terminated'
  billing_frequency text NOT NULL DEFAULT 'monthly', -- 'monthly', 'quarterly', 'annually'
  contract_value_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  billing_amount_per_cycle_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  sla_tier text NOT NULL DEFAULT 'standard', -- 'premium', 'standard', 'basic'
  payment_terms_days integer NOT NULL DEFAULT 30,
  auto_renew boolean NOT NULL DEFAULT false,
  terms_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_contract_number UNIQUE(org_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_contracts_site ON public.contracts(site_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

-- 4. Create sla_policies table
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  tier_name text NOT NULL, -- 'premium', 'standard', 'basic'
  p1_response_hours numeric(5,1) NOT NULL DEFAULT 4.0,
  p1_resolution_hours numeric(5,1) NOT NULL DEFAULT 12.0,
  p2_response_hours numeric(5,1) NOT NULL DEFAULT 12.0,
  p2_resolution_hours numeric(5,1) NOT NULL DEFAULT 24.0,
  p3_response_hours numeric(5,1) NOT NULL DEFAULT 24.0,
  p3_resolution_hours numeric(5,1) NOT NULL DEFAULT 48.0,
  uptime_guarantee_percent numeric(5,2) NOT NULL DEFAULT 98.00,
  penalty_per_hour_breach_inr numeric(10,2) NOT NULL DEFAULT 500.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_contract ON public.sla_policies(contract_id);

-- 5. Create billing_invoices table
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_amount_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  spares_amount_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  penalty_credit_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  tax_amount_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  total_amount_inr numeric(14,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'draft', -- 'draft', 'issued', 'paid', 'overdue', 'cancelled'
  payment_date timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_invoice_number UNIQUE(org_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON public.billing_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_contract ON public.billing_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

-- Inventory RLS
DROP POLICY IF EXISTS inv_items_all ON public.inventory_items;
CREATE POLICY inv_items_all ON public.inventory_items FOR ALL USING (
  public.is_super_admin() OR org_id = public.current_org()
);

DROP POLICY IF EXISTS inv_tx_all ON public.inventory_transactions;
CREATE POLICY inv_tx_all ON public.inventory_transactions FOR ALL USING (
  public.is_super_admin() OR org_id = public.current_org()
);

-- Contracts RLS
DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR client_org_id = public.current_org()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id AND (s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

DROP POLICY IF EXISTS contracts_manage ON public.contracts;
CREATE POLICY contracts_manage ON public.contracts FOR ALL USING (
  public.is_super_admin() OR org_id = public.current_org()
);

-- SLA Policies RLS
DROP POLICY IF EXISTS sla_policies_select ON public.sla_policies;
CREATE POLICY sla_policies_select ON public.sla_policies FOR SELECT USING (
  public.is_super_admin() OR org_id = public.current_org()
);

DROP POLICY IF EXISTS sla_policies_manage ON public.sla_policies;
CREATE POLICY sla_policies_manage ON public.sla_policies FOR ALL USING (
  public.is_super_admin() OR org_id = public.current_org()
);

-- Billing Invoices RLS
DROP POLICY IF EXISTS invoices_select ON public.billing_invoices;
CREATE POLICY invoices_select ON public.billing_invoices FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id AND (s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

DROP POLICY IF EXISTS invoices_manage ON public.billing_invoices;
CREATE POLICY invoices_manage ON public.billing_invoices FOR ALL USING (
  public.is_super_admin() OR org_id = public.current_org()
);

NOTIFY pgrst, 'reload schema';
