-- A korábbi chat funkció adatbázis-objektumainak eltávolítása.
-- Futtasd a Supabase SQL Editorban a régi chat adatok törléséhez.

alter table if exists public.notifications
  drop column if exists chat_id;

drop table if exists public.web_error_chat_messages;
drop table if exists public.web_error_chats;
