-- =====================================================================
--  Suivi Musculation : schéma Supabase (comptes + données privées)
--
--  À coller dans Supabase > SQL Editor > New query, puis "Run".
--  Le script peut être relancé sans risque (idempotent).
--
--  Sécurité :
--   - seuls les emails de la liste blanche peuvent créer un compte
--     (vérifié par la base elle-même, impossible à contourner depuis le site) ;
--   - chaque utilisateur ne peut lire et écrire QUE sa propre ligne (RLS) ;
--   - le rôle "anon" (visiteur non connecté) n'a accès à rien.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Liste blanche des emails autorisés à s'inscrire
-- ---------------------------------------------------------------------

create table if not exists public.allowed_emails (
  email     text primary key
            check (email = lower(btrim(email)) and position('@' in email) > 1),
  added_at  timestamptz not null default now()
);

-- RLS activé SANS aucune policy : la table est invisible depuis l'API,
-- pour les visiteurs comme pour les utilisateurs connectés.
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

-- >>> Remplace par les vrais emails (en minuscules) AU MOMENT de coller le
--     script dans Supabase, mais ne les commite pas : le dépôt est public. <<<
insert into public.allowed_emails (email) values
  ('email1@exemple.com'),
  ('email2@exemple.com'),
  ('email3@exemple.com'),
  ('email4@exemple.com'),
  ('email5@exemple.com')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 2. Refus de toute inscription hors liste blanche
-- ---------------------------------------------------------------------

create or replace function public.check_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails a
    where a.email = lower(btrim(new.email))
  ) then
    raise exception 'email_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.check_allowed_email() from public, anon, authenticated;

drop trigger if exists check_allowed_email on auth.users;
create trigger check_allowed_email
  before insert on auth.users
  for each row execute function public.check_allowed_email();


-- ---------------------------------------------------------------------
-- 3. Données de chaque utilisateur (une ligne par compte)
-- ---------------------------------------------------------------------

create table if not exists public.user_state (
  user_id     uuid primary key default auth.uid()
              references auth.users (id) on delete cascade,
  data        jsonb not null
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 2000000),
  updated_at  timestamptz not null default now()
);

alter table public.user_state enable row level security;
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

drop policy if exists "lire ses donnees"      on public.user_state;
drop policy if exists "creer ses donnees"     on public.user_state;
drop policy if exists "modifier ses donnees"  on public.user_state;
drop policy if exists "supprimer ses donnees" on public.user_state;

create policy "lire ses donnees" on public.user_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "creer ses donnees" on public.user_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "modifier ses donnees" on public.user_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "supprimer ses donnees" on public.user_state
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Horodatage fixé par le serveur (pas par le navigateur).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_updated_at on public.user_state;
create trigger touch_updated_at
  before insert or update on public.user_state
  for each row execute function public.touch_updated_at();
