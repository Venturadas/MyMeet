-- Recurring company access is granted only by a trusted payment integration.
-- Existing companies and appointments are preserved; no paid access is seeded.
begin;

create table public.business_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_subscription_id text unique check (char_length(provider_subscription_id) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'cancelled', 'expired')),
  current_period_end timestamptz,
  provider_last_event_at timestamptz,
  last_payment_id text check (char_length(last_payment_id) between 1 and 100),
  last_payment_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or current_period_end is not null)
);
alter table public.business_subscriptions enable row level security;
create policy subscription_self_read on public.business_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create trigger subscriptions_touch before update on public.business_subscriptions
  for each row execute function public._touch_updated_at();

revoke all on public.business_subscriptions from public, anon, authenticated;
grant select (user_id, provider, status, current_period_end, created_at, updated_at)
  on public.business_subscriptions to authenticated;
grant select, insert, update, delete on public.business_subscriptions to service_role;

-- No user ID or payment state is accepted from a caller/browser.
create function public.has_active_business_subscription() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_subscriptions s
    where s.user_id = auth.uid() and s.status = 'active' and s.current_period_end > now()
  );
$$;
revoke all on function public.has_active_business_subscription() from public, anon, authenticated;
grant execute on function public.has_active_business_subscription() to authenticated;

-- Triggers also run inside SECURITY DEFINER RPCs. Inspect the session role,
-- never CURRENT_USER (which would be the definer and accidentally bypass checks).
create function public._require_paid_business_owner(p_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := current_setting('role', true);
  v_subscription public.business_subscriptions%rowtype;
begin
  if v_role = 'service_role' or (
    coalesce(v_role, 'none') = 'none' and exists (
      select 1 from pg_catalog.pg_roles r where r.rolname = session_user and (r.rolsuper or r.rolbypassrls)
    )
  ) then return; end if;
  if auth.uid() is null or auth.uid() is distinct from p_owner_id then
    raise exception 'Somente o proprietário pode gerenciar esta empresa.' using errcode = '42501';
  end if;
  -- A payment cancellation waits for any already-authorized configuration write.
  select * into v_subscription from public.business_subscriptions where user_id = p_owner_id for share;
  if not found or v_subscription.status <> 'active' or v_subscription.current_period_end <= now()
    or v_subscription.current_period_end is null then
    raise exception 'Assinatura ativa necessária. Acesse os planos do MyMeet.' using errcode = '42501';
  end if;
end;
$$;

create function public._enforce_business_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
begin
  if tg_table_name = 'businesses' then
    v_owner_id := new.owner_id;
  else
    select b.owner_id into v_owner_id from public.businesses b
      where b.id = case when tg_op = 'DELETE' then old.business_id else new.business_id end;
    if v_owner_id is null then
      raise exception 'Empresa indisponível.' using errcode = '42501';
    end if;
  end if;
  perform public._require_paid_business_owner(v_owner_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger businesses_subscription before insert or update on public.businesses
  for each row execute function public._enforce_business_subscription();
create trigger services_subscription before insert or update or delete on public.services
  for each row execute function public._enforce_business_subscription();
create trigger hours_subscription before insert or update or delete on public.business_hours
  for each row execute function public._enforce_business_subscription();
revoke all on function public._require_paid_business_owner(uuid), public._enforce_business_subscription()
  from public, anon, authenticated;

-- Public discovery exposes the same safe fields and only bookable companies.
create or replace view public.business_catalog with (security_barrier = true) as
  select b.id, b.slug, b.name, b.description, b.timezone, b.created_at from public.businesses b
  where exists (
    select 1 from public.business_subscriptions s
    where s.user_id = b.owner_id and s.status = 'active' and s.current_period_end > now()
  );

-- Private business reads and existing appointment actions remain available for
-- historical records, cancellations and completing already-promised services.
-- Creating/moving a booking is checked separately in the slot validator below.

-- Keep historical appointment authorization independent of the paid panel.
-- This schema is not exposed through the application's PostgREST API.
create schema mymeet_private;
revoke all on schema mymeet_private from public, anon, authenticated;
grant usage on schema mymeet_private to authenticated;
create function mymeet_private.owns_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()
  );
$$;
revoke all on function mymeet_private.owns_business(uuid) from public, anon, authenticated;
grant execute on function mymeet_private.owns_business(uuid) to authenticated;
alter policy business_owner_read on public.businesses
  using (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()));
alter policy appointments_participant_read on public.appointments using (
  customer_id = (select auth.uid()) or mymeet_private.owns_business(business_id)
);

create or replace function public.save_business_hours(p_hours jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user is null then
    raise exception 'Faça login para configurar o expediente.' using errcode = '42501';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'Informe uma lista de dias e horários.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_hours) > 7 then
    raise exception 'Informe no máximo um expediente por dia da semana.' using errcode = '22023';
  end if;
  select b.id into v_business_id from public.businesses b
    where b.owner_id = v_user for update;
  if not found then
    raise exception 'Cadastre sua empresa antes de configurar o expediente.' using errcode = '42501';
  end if;
  -- Explicit check also covers [] when there are no rows to trigger a check.
  perform public._require_paid_business_owner(v_user);
  if exists (
    select 1 from jsonb_array_elements(p_hours) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or jsonb_typeof(item.value -> 'weekday') is distinct from 'number'
      or jsonb_typeof(item.value -> 'start_time') is distinct from 'string'
      or jsonb_typeof(item.value -> 'end_time') is distinct from 'string'
      or item.value - 'weekday' - 'start_time' - 'end_time' <> '{}'::jsonb
  ) then
    raise exception 'Use somente dia da semana, início e fim do expediente.' using errcode = '22023';
  end if;
  delete from public.business_hours where business_id = v_business_id;
  insert into public.business_hours(business_id, weekday, start_time, end_time)
    select v_business_id, (item.value ->> 'weekday')::integer,
      (item.value ->> 'start_time')::time, (item.value ->> 'end_time')::time
    from jsonb_array_elements(p_hours) as item(value);
end;
$$;

create or replace function public._validated_end(p_business_id uuid, p_service_id uuid, p_starts_at timestamptz)
returns timestamptz language plpgsql set search_path = '' as $$
declare
  v_timezone text;
  v_duration integer;
  v_local timestamp;
  v_hours public.business_hours%rowtype;
  v_ends_at timestamptz;
  v_subscription public.business_subscriptions%rowtype;
begin
  -- Booking and rescheduling hold this lock until their transaction completes.
  select s.* into v_subscription from public.business_subscriptions s
    join public.businesses b on b.owner_id = s.user_id where b.id = p_business_id for share of s;
  if not found or v_subscription.status <> 'active' or v_subscription.current_period_end is null
    or v_subscription.current_period_end <= now() then
    raise exception 'Esta empresa não está recebendo novas reservas no momento.' using errcode = '42501';
  end if;
  select b.timezone, s.duration_minutes into v_timezone, v_duration
    from public.businesses b join public.services s on s.business_id = b.id
    where b.id = p_business_id and s.id = p_service_id and s.active;
  if not found then raise exception 'Serviço indisponível.' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at <= now() or p_starts_at > now() + interval '90 days' then
    raise exception 'Escolha um horário futuro nos próximos 90 dias.' using errcode = '22023';
  end if;
  v_local := p_starts_at at time zone v_timezone;
  if extract(second from v_local) <> 0 or extract(minute from v_local)::integer % 15 <> 0 then
    raise exception 'Horário deve respeitar intervalos de 15 minutos.' using errcode = '22023';
  end if;
  select * into v_hours from public.business_hours h
    where h.business_id = p_business_id and h.weekday = extract(dow from v_local)::integer;
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if not found or v_local::time < v_hours.start_time or
     (v_ends_at at time zone v_timezone)::date <> v_local::date or
     (v_ends_at at time zone v_timezone)::time > v_hours.end_time then
    raise exception 'Horário fora do expediente da empresa.' using errcode = '22023';
  end if;
  return v_ends_at;
end;
$$;

create or replace function public.available_slots(p_business_id uuid, p_service_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_timezone text;
  v_duration integer;
  v_hours public.business_hours%rowtype;
begin
  if not exists (
    select 1 from public.businesses b join public.business_subscriptions s on s.user_id = b.owner_id
    where b.id = p_business_id and s.status = 'active' and s.current_period_end > now()
  ) then return; end if;
  select b.timezone, s.duration_minutes into v_timezone, v_duration
    from public.businesses b join public.services s on s.business_id = b.id
    where b.id = p_business_id and s.id = p_service_id and s.active;
  if not found then raise exception 'Serviço indisponível.' using errcode = '22023'; end if;
  if p_date is null or p_date < (now() at time zone v_timezone)::date
     or p_date > (now() at time zone v_timezone)::date + 90 then return; end if;
  select * into v_hours from public.business_hours h
    where h.business_id = p_business_id and h.weekday = extract(dow from p_date)::integer;
  if not found then return; end if;
  return query
    select t.slot, t.slot + make_interval(mins => v_duration)
    from generate_series(
      (p_date + v_hours.start_time) at time zone v_timezone,
      ((p_date + v_hours.end_time) at time zone v_timezone) - make_interval(mins => v_duration),
      interval '15 minutes'
    ) as t(slot)
    where t.slot > now() and t.slot <= now() + interval '90 days'
      and (t.slot at time zone v_timezone)::date = p_date
      and (t.slot at time zone v_timezone)::time >= v_hours.start_time
      and ((t.slot + make_interval(mins => v_duration)) at time zone v_timezone)::date = p_date
      and ((t.slot + make_interval(mins => v_duration)) at time zone v_timezone)::time <= v_hours.end_time
      and not exists (
        select 1 from public.appointments a where a.business_id = p_business_id
        and a.status in ('pending', 'confirmed')
        and tstzrange(a.starts_at, a.ends_at, '[)') &&
          tstzrange(t.slot, t.slot + make_interval(mins => v_duration), '[)')
      ) order by t.slot;
end;
$$;

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Faça login para exportar seus dados.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = v_user),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from public.appointments a where a.customer_id = v_user), '[]'::jsonb),
    'privacy_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at) from public.privacy_requests r where r.user_id = v_user), '[]'::jsonb),
    'business_subscription', (select jsonb_build_object(
      'user_id', s.user_id, 'provider', s.provider, 'status', s.status,
      'current_period_end', s.current_period_end, 'created_at', s.created_at, 'updated_at', s.updated_at
    ) from public.business_subscriptions s where s.user_id = v_user)
  ) into v_result;
  return v_result;
end;
$$;

commit;
