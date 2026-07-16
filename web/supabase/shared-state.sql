create extension if not exists pgcrypto with schema extensions;

create table if not exists public.shared_asset_state (
  id text primary key check (id = 'current'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_asset_state enable row level security;

drop policy if exists "任何访问者可读取最新账本" on public.shared_asset_state;
create policy "任何访问者可读取最新账本"
  on public.shared_asset_state for select to anon, authenticated using (true);

create or replace function public.replace_shared_asset_state(p_payload jsonb, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(digest(p_password, 'sha256'), 'hex') <> '1f192c0285f1192b4ee647eb1cbbff3321a0b5768bafdde153e64d3c2694a6f3' then
    raise exception '同步密码不正确';
  end if;

  insert into public.shared_asset_state (id, payload, updated_at)
  values ('current', p_payload, now())
  on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.replace_shared_asset_state(jsonb, text) from public;
grant execute on function public.replace_shared_asset_state(jsonb, text) to anon, authenticated;
