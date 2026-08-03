-- Alap seed adatok.
-- Nem tartalmaz demonstrációs bérlői adatokat.

insert into public.app_settings (id, company_name, currency, due_day, contact_email, contact_phone, payment_note)
OVERRIDING SYSTEM VALUE
values (
  1,
  'Albérletkezelő',
  'HUF',
  10,
  null,
  null,
  'Az aktuális havi elszámolás a hónap első napján készül.'
)
on conflict (id) do update
set company_name = excluded.company_name,
    currency = excluded.currency,
    due_day = excluded.due_day,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    payment_note = excluded.payment_note;
