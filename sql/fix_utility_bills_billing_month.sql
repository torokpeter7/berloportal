-- Meglévő adatbázis javítása: a közüzemi számlák elszámolási hónapja
-- kötelező mező. A korábbi rekordoknál az elszámolási időszak kezdete
-- alapján töltjük ki.

begin;

alter table public.utility_bills
  add column if not exists billing_month date;

update public.utility_bills
set billing_month = date_trunc('month', coalesce(period_start, current_date))::date
where billing_month is null;

alter table public.utility_bills
  alter column billing_month set not null;

create index if not exists utility_bills_billing_month_idx
  on public.utility_bills (billing_month);

commit;
