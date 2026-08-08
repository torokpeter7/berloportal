-- Meglévő adatbázis bővítése: "Egyéb számlák" kategória (pl. MOHU szemétdíj,
-- közösköltség, stb.) az áram/víz/gáz mellé.
-- Futtasd le egyszer a Supabase SQL Editorban.

begin;

-- 1) Új 'label' mező: csak az 'other' típusnál használt, szabad szöveges
--    megnevezés. Áram/víz/gáznál üres marad ('' alapértelmezés), hogy a
--    korábbi egyediségi viselkedésük ne változzon.
alter table public.utility_bills
  add column if not exists label text not null default '';

-- 2) A típus check constraint bővítése 'other'-rel.
alter table public.utility_bills
  drop constraint if exists utility_bills_utility_type_check;

alter table public.utility_bills
  add constraint utility_bills_utility_type_check
  check (utility_type in ('electric', 'water', 'gas', 'other'));

-- 3) Az egyediségi megkötés bővítése a 'label'-lel, hogy az 'other'
--    típuson belül több különböző nevű tétel (MOHU, közösköltség, stb.)
--    is rögzíthető legyen ugyanarra az időszakra.
alter table public.utility_bills
  drop constraint if exists utility_bill_unique;

alter table public.utility_bills
  add constraint utility_bill_unique
  unique (tenant_id, utility_type, label, period_start, period_end);

commit;
