-- Futtasd le egyszer a Supabase SQL Editorban, ha a meglévő adatbázisban a
-- monthly_statements.billing_month korábban timestamp mezőként jött létre.
-- Az időbélyegek budapesti helyi dátuma megmarad, majd a mező date típusú lesz.
do $$
declare
  column_type text;
begin
  select data_type
    into column_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'monthly_statements'
    and column_name = 'billing_month';

  if column_type = 'timestamp with time zone' then
    alter table public.monthly_statements
      alter column billing_month type date
      using (billing_month at time zone 'Europe/Budapest')::date;
  elsif column_type = 'timestamp without time zone' then
    alter table public.monthly_statements
      alter column billing_month type date
      using billing_month::date;
  end if;
end;
$$;
