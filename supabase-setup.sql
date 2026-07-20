-- Run this once in your Supabase project's SQL Editor (Supabase dashboard > SQL Editor > New query)

create table if not exists app_data (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- Row Level Security: each signed-in user can only read/write their own rows.
-- This is enforced by the database itself, not just the app's code.
alter table app_data enable row level security;

create policy "users can read own data"
  on app_data for select
  using (auth.uid() = user_id);

create policy "users can insert own data"
  on app_data for insert
  with check (auth.uid() = user_id);

create policy "users can update own data"
  on app_data for update
  using (auth.uid() = user_id);
