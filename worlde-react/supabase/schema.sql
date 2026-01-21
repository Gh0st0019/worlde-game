-- Player profiles table
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level integer not null default 1,
  coins integer not null default 0,
  google_bonus_granted boolean not null default false,
  max_attempts integer not null default 10,
  recent_words text[] not null default '{}',
  theme text not null default 'Generale',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_player_profiles_updated_at on public.player_profiles;
create trigger set_player_profiles_updated_at
before update on public.player_profiles
for each row
execute function public.set_updated_at();

alter table public.player_profiles
  add column if not exists google_bonus_granted boolean not null default false;

alter table public.player_profiles
  alter column theme set default 'Generale';

-- Row Level Security
alter table public.player_profiles enable row level security;

drop policy if exists "Players can view own profile" on public.player_profiles;
create policy "Players can view own profile"
on public.player_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Players can insert own profile" on public.player_profiles;
create policy "Players can insert own profile"
on public.player_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Players can update own profile" on public.player_profiles;
create policy "Players can update own profile"
on public.player_profiles
for update
using (auth.uid() = user_id);

-- Cleanup anonymous users after 30 days of inactivity
create extension if not exists pg_cron;

create or replace function public.cleanup_anonymous_profiles()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.player_profiles p
  using auth.users u
  where p.user_id = u.id
    and u.is_anonymous is true
    and p.last_active_at < now() - interval '30 days';

  delete from auth.users u
  where u.is_anonymous is true
    and u.id not in (select user_id from public.player_profiles)
    and u.created_at < now() - interval '30 days';
end;
$$;

select cron.schedule(
  'cleanup-anon-profiles',
  '0 3 * * *',
  $$select public.cleanup_anonymous_profiles();$$
);
