-- Albérletkezelő adatbázis séma
-- Futtasd a Supabase SQL editorban.

create extension if not exists "pgcrypto";

create table if not exists public.app_settings (
  id bigint generated always as identity primary key,
  company_name text not null default 'Albérletkezelő',
  currency text not null default 'HUF',
  due_day integer not null default 10 check (due_day between 1 and 31),
  contact_email text,
  contact_phone text,
  payment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apartments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text unique,
  address text,
  monthly_rent numeric(12,2) not null default 0,
  area_sqm numeric(10,2),
  rooms integer,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  role text not null default 'tenant' check (role in ('admin', 'tenant')),
  apartment_id uuid references public.apartments(id) on delete set null,
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete restrict,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date,
  monthly_rent numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'ended', 'draft')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lease_period_check check (end_date is null or end_date >= start_date)
);

create unique index if not exists leases_one_active_per_tenant_idx on public.leases (tenant_id) where status = 'active';
create unique index if not exists leases_one_active_per_apartment_idx on public.leases (apartment_id) where status = 'active';
create index if not exists leases_tenant_idx on public.leases (tenant_id);
create index if not exists leases_apartment_idx on public.leases (apartment_id);
create index if not exists leases_status_idx on public.leases (status);

create table if not exists public.monthly_statements (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  billing_month date not null,
  rent_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  is_paid boolean not null default false,
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_month_unique unique (apartment_id, billing_month)
);

create index if not exists monthly_statements_tenant_idx on public.monthly_statements (tenant_id);
create index if not exists monthly_statements_apartment_idx on public.monthly_statements (apartment_id);
create index if not exists monthly_statements_lease_idx on public.monthly_statements (lease_id);
create index if not exists monthly_statements_billing_month_idx on public.monthly_statements (billing_month);
create index if not exists monthly_statements_paid_idx on public.monthly_statements (is_paid);

create table if not exists public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  billing_month date not null,
  utility_type text not null check (utility_type in ('electric', 'water', 'gas')),
  period_start date not null,
  period_end date not null,
  total_amount numeric(12,2) not null default 0,
  received_at date,
  due_date date,
  is_paid boolean not null default false,
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint utility_bill_unique unique (tenant_id, utility_type, period_start, period_end)
);

alter table public.utility_bills
  add column if not exists period_start date;

alter table public.utility_bills
  add column if not exists period_end date;

alter table public.utility_bills
  add column if not exists billing_month date;

alter table public.utility_bills
  add column if not exists total_amount numeric(12,2) not null default 0;

create index if not exists utility_bills_tenant_idx on public.utility_bills (tenant_id);
create index if not exists utility_bills_apartment_idx on public.utility_bills (apartment_id);
create index if not exists utility_bills_lease_idx on public.utility_bills (lease_id);
create index if not exists utility_bills_type_idx on public.utility_bills (utility_type);
create index if not exists utility_bills_billing_month_idx on public.utility_bills (billing_month);
create index if not exists utility_bills_period_start_idx on public.utility_bills (period_start);
create index if not exists utility_bills_period_end_idx on public.utility_bills (period_end);
create index if not exists utility_bills_paid_idx on public.utility_bills (is_paid);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete set null,
  lease_id uuid references public.leases(id) on delete set null,
  title text not null,
  file_name text not null,
  file_path text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_tenant_idx on public.documents (tenant_id);
create index if not exists documents_apartment_idx on public.documents (apartment_id);
create index if not exists documents_lease_idx on public.documents (lease_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id);
create index if not exists notifications_sender_idx on public.notifications (sender_id);
create index if not exists notifications_read_idx on public.notifications (read_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data->>'phone',
    'tenant',
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      phone = excluded.phone,
      role = excluded.role,
      updated_at = now();

  return new;
end;
$$;

create or replace function public.compute_monthly_statement_totals()
returns trigger
language plpgsql
as $$
begin
  new.total_amount = coalesce(new.rent_amount, 0);
  if new.is_paid and new.paid_at is null then
    new.paid_at = now();
  end if;
  if not new.is_paid then
    new.paid_at = null;
  end if;
  return new;
end;
$$;

create or replace function public.compute_utility_bill_totals()
returns trigger
language plpgsql
as $$
begin
  new.total_amount = greatest(0, coalesce(new.total_amount, 0));
  if new.is_paid and new.paid_at is null then
    new.paid_at = now();
  end if;
  if not new.is_paid then
    new.paid_at = null;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_single_active_lease()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' then
    update public.leases
    set status = 'ended', updated_at = now()
    where tenant_id = new.tenant_id
      and id <> coalesce(new.id, gen_random_uuid())
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_apartments_updated_at on public.apartments;
create trigger trg_apartments_updated_at
before update on public.apartments
for each row execute function public.set_updated_at();

drop trigger if exists trg_leases_updated_at on public.leases;
create trigger trg_leases_updated_at
before update on public.leases
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_statements_updated_at on public.monthly_statements;
create trigger trg_monthly_statements_updated_at
before update on public.monthly_statements
for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_new_user_profile on auth.users;
create trigger trg_new_user_profile
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists trg_statement_totals on public.monthly_statements;
create trigger trg_statement_totals
before insert or update on public.monthly_statements
for each row execute function public.compute_monthly_statement_totals();

drop trigger if exists trg_utility_bill_totals on public.utility_bills;
create trigger trg_utility_bill_totals
before insert or update on public.utility_bills
for each row execute function public.compute_utility_bill_totals();

drop trigger if exists trg_single_active_lease on public.leases;
create trigger trg_single_active_lease
before insert or update on public.leases
for each row execute function public.enforce_single_active_lease();
