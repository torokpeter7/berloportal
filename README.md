# Albérletkezelő

Egy teljesen statikus, Supabase-alapú webalkalmazás lakások bérleti díjának, rezsijének, dokumentumainak és értesítéseinek kezelésére.

## Technológia

- HTML5
- CSS3
- JavaScript ES6+
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage

## Projektstruktúra

- `css/` - közös és oldalspecifikus stílusok
- `components/` - újrahasznosítható HTML részek
- `config/` - Supabase kliens konfiguráció
- `js/` - alkalmazáslogika és oldalakkénti modulok
- `pages/` - önálló HTML oldalak
- `sql/` - adatbázis, RLS és seed fájlok

## Telepítés

1. Hozz létre egy Supabase projektet.
2. Futtasd a `sql/database.sql` fájlt a Supabase SQL Editorban.
3. Futtasd a `sql/rls.sql` fájlt.
4. Futtasd a `sql/seed.sql` fájlt.
5. A Supabase Storage-ban ellenőrizd, hogy a `documents` bucket létrejött.
6. Nyisd meg a `pages/login.html` oldalt egy statikus tárhelyről vagy helyi webszerverről.
7. Add meg a Supabase project URL-t és anon kulcsot a belépő oldalon.

### Meglévő adatbázis frissítése

Ha a hibaüzenet `billing_month_unique`, futtasd le egyszer a Supabase SQL Editorban a `sql/fix_statement_unique_constraint.sql` fájlt. Ezután ugyanarra a hónapra minden lakáshoz külön rögzíthető havi elszámolás.

## Fontos megjegyzések

- Az alkalmazás backend nélkül működik, a böngészőből közvetlenül a Supabase kliensen keresztül.
- Az admin és az albérlő jogosultságait RLS védi.
- A dokumentumok PDF-ként a Supabase Storage-ba kerülnek.
- A havi lakbér elszámolás külön maradt, a villany, víz és gáz számlák pedig külön rekordként kezelhetők.
- A közüzemi számlák mezői mentéskor automatikusan számolódnak.

## Fő oldalak

- `pages/login.html`
- `pages/dashboard.html`
- `pages/apartments.html`
- `pages/tenants.html`
- `pages/billing.html`
- `pages/documents.html`
- `pages/notifications.html`
- `pages/profile.html`
- `pages/settings.html`

## Statikus tárhely

A projekt bármely egyszerű webtárhelyre feltölthető, mert nem igényel Node.js backendet vagy build lépést.

## ZIP csomagolás

A teljes `alberlet` mappa közvetlenül ZIP-be csomagolható.
