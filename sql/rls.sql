-- Row Level Security szabályok
-- Futtasd a database.sql után.

alter table public.app_settings enable row level security;
alter table public.apartments enable row level security;
alter table public.profiles enable row level security;
alter table public.leases enable row level security;
alter table public.monthly_statements enable row level security;
alter table public.utility_bills enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

create or replace function public.is_tenant(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'tenant'
      and p.is_active = true
  );
$$;

create policy app_settings_select_admin on public.app_settings for select using (public.is_admin(auth.uid()));
create policy app_settings_manage_admin on public.app_settings for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy apartments_select_authenticated on public.apartments for select using (auth.role() = 'authenticated');
create policy apartments_manage_admin on public.apartments for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy profiles_select_self_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin(auth.uid()));
create policy profiles_insert_self on public.profiles for insert with check (auth.uid() = id or public.is_admin(auth.uid()));
create policy profiles_update_self_or_admin on public.profiles for update using (auth.uid() = id or public.is_admin(auth.uid())) with check (auth.uid() = id or public.is_admin(auth.uid()));
create policy profiles_delete_admin on public.profiles for delete using (public.is_admin(auth.uid()));

create policy leases_select_self_or_admin on public.leases for select using (
  public.is_admin(auth.uid())
  or tenant_id = auth.uid()
  or apartment_id in (
    select apartment_id from public.profiles where id = auth.uid()
  )
);
create policy leases_manage_admin on public.leases for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy statements_select_self_or_admin on public.monthly_statements for select using (
  public.is_admin(auth.uid())
  or tenant_id = auth.uid()
);
create policy statements_manage_admin on public.monthly_statements for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy utility_bills_select_self_or_admin on public.utility_bills for select using (
  public.is_admin(auth.uid())
  or tenant_id = auth.uid()
);
create policy utility_bills_manage_admin on public.utility_bills for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy documents_select_self_or_admin on public.documents for select using (
  public.is_admin(auth.uid())
  or tenant_id = auth.uid()
);
create policy documents_manage_admin on public.documents for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy notifications_select_self_or_admin on public.notifications for select using (
  public.is_admin(auth.uid())
  or recipient_id = auth.uid()
  or sender_id = auth.uid()
);
create policy notifications_insert_admin on public.notifications for insert with check (public.is_admin(auth.uid()));
create policy notifications_update_self_or_admin on public.notifications for update using (
  public.is_admin(auth.uid()) or recipient_id = auth.uid()
) with check (
  public.is_admin(auth.uid()) or recipient_id = auth.uid()
);
create policy notifications_delete_admin on public.notifications for delete using (public.is_admin(auth.uid()));

-- Storage bucket és policy-k a PDF dokumentumokhoz
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists storage_read_documents on storage.objects;
create policy storage_read_documents on storage.objects for select using (
  bucket_id = 'documents'
  and (
    public.is_admin(auth.uid())
    or owner = auth.uid()
    or (split_part(name, '/', 1)) = auth.uid()::text
  )
);

drop policy if exists storage_insert_documents on storage.objects;
create policy storage_insert_documents on storage.objects for insert with check (
  bucket_id = 'documents'
  and public.is_admin(auth.uid())
);

drop policy if exists storage_delete_documents on storage.objects;
create policy storage_delete_documents on storage.objects for delete using (
  bucket_id = 'documents'
  and public.is_admin(auth.uid())
);
