create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists public.normalized_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand text not null,
  packaging_type text not null check (packaging_type in ('lata', 'garrafa', 'long_neck', 'barril', 'outro')),
  volume_ml integer,
  returnable boolean not null default false,
  canonical_name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, canonical_name)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  source_file_name text,
  storage_path text,
  quote_date date,
  status text not null default 'imported',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  normalized_product_id uuid references public.normalized_products(id) on delete set null,
  row_number integer,
  raw_product_name text not null,
  brand text,
  packaging_type text,
  volume_ml integer,
  returnable boolean not null default false,
  units_per_pack integer not null default 1,
  quantity_units numeric not null,
  gross_price numeric(14, 2) not null,
  unit_price_input numeric(14, 4),
  discount_amount numeric(14, 2) not null default 0,
  freight_amount numeric(14, 2) not null default 0,
  taxes_amount numeric(14, 2) not null default 0,
  returnable_deposit_amount numeric(14, 2) not null default 0,
  payment_term_days integer not null default 0,
  lead_time_days integer,
  moq integer,
  available boolean not null default true,
  observations text,
  computed_cost_unit numeric(14, 4) not null,
  computed_cost_liter numeric(14, 4),
  validation_issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  parameters jsonb not null default '{}'::jsonb,
  total_potential_savings numeric(14, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_item_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  canonical_name text not null,
  demand_units numeric not null,
  best_supplier text,
  best_cost_unit numeric(14, 4),
  average_cost_unit numeric(14, 4),
  potential_savings_vs_average numeric(14, 2) not null default 0,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  scenario_type text not null check (scenario_type in ('multi', 'mono', 'restricted')),
  name text not null,
  total_cost numeric(14, 2) not null default 0,
  supplier_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists suppliers_org_idx on public.suppliers(org_id);
create index if not exists products_org_idx on public.normalized_products(org_id);
create index if not exists quotes_org_supplier_idx on public.quotes(org_id, supplier_id);
create index if not exists quote_items_quote_idx on public.quote_items(quote_id);
create index if not exists analysis_runs_org_idx on public.analysis_runs(org_id);
create index if not exists scenarios_run_idx on public.scenarios(analysis_run_id);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.normalized_products enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.analysis_item_results enable row level security;
alter table public.scenarios enable row level security;

create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.row_belongs_to_user_org(row_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_org_id = public.current_user_org_id()
$$;

create policy "organizations_select_own" on public.organizations
  for select using (id = public.current_user_org_id());

create policy "profiles_select_own_org" on public.profiles
  for select using (org_id = public.current_user_org_id());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and org_id = public.current_user_org_id());

create policy "suppliers_select_own_org" on public.suppliers
  for select using (public.row_belongs_to_user_org(org_id));
create policy "suppliers_insert_own_org" on public.suppliers
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "suppliers_update_own_org" on public.suppliers
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "suppliers_delete_own_org" on public.suppliers
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "products_select_own_org" on public.normalized_products
  for select using (public.row_belongs_to_user_org(org_id));
create policy "products_insert_own_org" on public.normalized_products
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "products_update_own_org" on public.normalized_products
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "products_delete_own_org" on public.normalized_products
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "quotes_select_own_org" on public.quotes
  for select using (public.row_belongs_to_user_org(org_id));
create policy "quotes_insert_own_org" on public.quotes
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "quotes_update_own_org" on public.quotes
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "quotes_delete_own_org" on public.quotes
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "quote_items_select_own_org" on public.quote_items
  for select using (public.row_belongs_to_user_org(org_id));
create policy "quote_items_insert_own_org" on public.quote_items
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "quote_items_update_own_org" on public.quote_items
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "quote_items_delete_own_org" on public.quote_items
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "analysis_runs_select_own_org" on public.analysis_runs
  for select using (public.row_belongs_to_user_org(org_id));
create policy "analysis_runs_insert_own_org" on public.analysis_runs
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "analysis_runs_update_own_org" on public.analysis_runs
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "analysis_runs_delete_own_org" on public.analysis_runs
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "analysis_item_results_select_own_org" on public.analysis_item_results
  for select using (public.row_belongs_to_user_org(org_id));
create policy "analysis_item_results_insert_own_org" on public.analysis_item_results
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "analysis_item_results_update_own_org" on public.analysis_item_results
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "analysis_item_results_delete_own_org" on public.analysis_item_results
  for delete using (public.row_belongs_to_user_org(org_id));

create policy "scenarios_select_own_org" on public.scenarios
  for select using (public.row_belongs_to_user_org(org_id));
create policy "scenarios_insert_own_org" on public.scenarios
  for insert with check (public.row_belongs_to_user_org(org_id));
create policy "scenarios_update_own_org" on public.scenarios
  for update using (public.row_belongs_to_user_org(org_id)) with check (public.row_belongs_to_user_org(org_id));
create policy "scenarios_delete_own_org" on public.scenarios
  for delete using (public.row_belongs_to_user_org(org_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  created_org_id uuid;
begin
  insert into public.organizations(name)
  values (coalesce(new.raw_user_meta_data->>'organization_name', split_part(new.email, '@', 2), 'DiskCerveja'))
  returning id into created_org_id;

  insert into public.profiles(id, org_id, full_name)
  values (new.id, created_org_id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false), ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "storage_uploads_select_own_org" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('uploads', 'exports')
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

create policy "storage_uploads_insert_own_org" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('uploads', 'exports')
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

create policy "storage_uploads_update_own_org" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('uploads', 'exports')
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  )
  with check (
    bucket_id in ('uploads', 'exports')
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

create policy "storage_uploads_delete_own_org" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('uploads', 'exports')
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );
