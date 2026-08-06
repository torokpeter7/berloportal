-- Futtasd le egyszer a Supabase SQL Editorban meglévő adatbázis esetén.
-- Egy lakásnak havonta egy elszámolása lehet, de ugyanarra a hónapra
-- több különböző lakás elszámolása is rögzíthető.
alter table public.monthly_statements
  drop constraint if exists billing_month_unique;

alter table public.monthly_statements
  add constraint billing_month_unique unique (apartment_id, billing_month);
