-- NuvemMeet: paid company access is granted only after a verified Pix payment.
-- Existing companies and appointments are preserved; no paid access is seeded.
begin;

create schema nuvemmeet_private;
revoke all on schema nuvemmeet_private from public, anon, authenticated;
grant usage on schema nuvemmeet_private to anon, authenticated, service_role;

create table public.business_subscriptions (
  user_id uuid primary key references auth.users(id) on delete restrict,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled', 'expired')),
  current_period_end timestamptz,
  last_paid_at timestamptz,
  last_payment_id text check (last_payment_id ~ '^[0-9]{1,100}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or current_period_end is not null)
);
alter table public.business_subscriptions enable row level security;
create policy subscription_self_read on public.business_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create trigger subscriptions_touch before update on public.business_subscriptions
  for each row execute function public._touch_updated_at();
revoke all on public.business_subscriptions from public, anon, authenticated, service_role;
grant select on public.business_subscriptions to authenticated, service_role;

-- Private payment ledger. QR strings, payer data and credentials are not stored.
-- Financial references survive account/business removal until an explicit
-- administrative retention/anonymization procedure is completed.
create table nuvemmeet_private.billing_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  business_id uuid references public.businesses(id) on delete restrict,
  payment_id text unique check (payment_id ~ '^[0-9]{1,100}$'),
  merchant_id text check (merchant_id ~ '^[0-9]{1,100}$'),
  amount_cents integer not null default 1499 check (amount_cents = 1499),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled','refunded','charged_back')),
  paid_at timestamptz,
  coverage_start timestamptz,
  coverage_end timestamptz,
  event_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (payment_id is not null and paid_at is not null)),
  check ((coverage_start is null and coverage_end is null) or coverage_end > coverage_start)
);
create index billing_payment_user_idx on nuvemmeet_private.billing_payment_intents(user_id, created_at);
alter table nuvemmeet_private.billing_payment_intents enable row level security;
revoke all on nuvemmeet_private.billing_payment_intents from public, anon, authenticated, service_role;
create trigger billing_payment_touch before update on nuvemmeet_private.billing_payment_intents
  for each row execute function public._touch_updated_at();

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
    raise exception 'Assinatura ativa necessária. Acesse os planos do NuvemMeet.' using errcode = '42501';
  end if;
end;
$$;

create function public._enforce_business_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
begin
  if tg_table_name = 'businesses' then
    v_owner_id := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  else
    select b.owner_id into v_owner_id from public.businesses b
      where b.id = case when tg_op = 'DELETE' then old.business_id else new.business_id end;
    if v_owner_id is null and tg_op = 'DELETE' and pg_trigger_depth() > 1 then
      -- A company DELETE already passed its owner/subscription trigger. Its
      -- cascading child deletion must defer to restrictive history/ledger FKs.
      return old;
    end if;
    if v_owner_id is null then
      raise exception 'Empresa indisponível.' using errcode = '42501';
    end if;
  end if;
  perform public._require_paid_business_owner(v_owner_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger businesses_subscription before insert or update or delete on public.businesses
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

-- The paid company panel is suspended on expiry. Existing appointment history
-- and cancellation/fulfilment RPCs remain available to preserve promised services.
-- Creating/moving a booking is checked separately in the slot validator below.

-- Keep historical appointment authorization independent of the paid panel.
-- This schema is not exposed through the application's PostgREST API.
create function nuvemmeet_private.owns_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()
  );
$$;
revoke all on function nuvemmeet_private.owns_business(uuid) from public, anon, authenticated;
grant execute on function nuvemmeet_private.owns_business(uuid) to authenticated;
alter policy business_owner_read on public.businesses
  using (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()));
alter policy business_owner_insert on public.businesses
  with check (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()));
alter policy business_owner_update on public.businesses
  using (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()))
  with check (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()));
alter policy business_owner_delete on public.businesses
  using (owner_id = (select auth.uid()) and (select public.has_active_business_subscription()));
create function nuvemmeet_private.business_is_bookable(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b join public.business_subscriptions s on s.user_id = b.owner_id
    where b.id = p_business_id and s.status = 'active' and s.current_period_end > now()
  );
$$;
revoke all on function nuvemmeet_private.business_is_bookable(uuid) from public, anon, authenticated;
grant execute on function nuvemmeet_private.business_is_bookable(uuid) to anon, authenticated;
alter policy services_public_read on public.services
  using (active and nuvemmeet_private.business_is_bookable(business_id));
alter policy hours_public_read on public.business_hours
  using (nuvemmeet_private.business_is_bookable(business_id));
alter policy appointments_participant_read on public.appointments using (
  customer_id = (select auth.uid()) or nuvemmeet_private.owns_business(business_id)
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
    'payment_history', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'business_id', i.business_id, 'payment_id', i.payment_id,
      'amount_cents', i.amount_cents, 'currency', i.currency, 'status', i.status,
      'paid_at', i.paid_at, 'coverage_start', i.coverage_start, 'coverage_end', i.coverage_end,
      'created_at', i.created_at, 'updated_at', i.updated_at
    ) order by i.created_at) from nuvemmeet_private.billing_payment_intents i
      where i.user_id = v_user), '[]'::jsonb),
    'business_subscription', (select jsonb_build_object(
      'user_id', s.user_id, 'provider', s.provider, 'status', s.status,
      'current_period_end', s.current_period_end, 'last_paid_at', s.last_paid_at, 'last_payment_id', s.last_payment_id, 'created_at', s.created_at, 'updated_at', s.updated_at
    ) from public.business_subscriptions s where s.user_id = v_user)
  ) into v_result;
  return v_result;
end;
$$;

-- These RPCs are deliberately unavailable to customer JWTs. The server must
-- verify Mercado Pago's signature and fetch authoritative payment details first.
create function nuvemmeet_private.require_billing_role() returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text := current_setting('role', true);
begin
  if v_role = 'service_role' or (
    coalesce(v_role, 'none') = 'none' and exists (
      select 1 from pg_catalog.pg_roles r where r.rolname = session_user and (r.rolsuper or r.rolbypassrls)
    )
  ) then return; end if;
  raise exception 'Operação exclusiva da integração de pagamento.' using errcode = '42501';
end;
$$;
revoke all on function nuvemmeet_private.require_billing_role() from public, anon, authenticated, service_role;

create function nuvemmeet_private.checkout_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', i.id, 'checkout_id', i.id, 'user_id', i.user_id, 'business_id', i.business_id,
    'payment_id', i.payment_id, 'status', i.status, 'expires_at', i.expires_at,
    'merchant_id', i.merchant_id, 'event_at', i.event_at, 'paid_at', i.paid_at,
    'subscription_expires_at', s.current_period_end,
    'amount_cents', i.amount_cents, 'currency', i.currency
  ) from nuvemmeet_private.billing_payment_intents i
    join public.business_subscriptions s on s.user_id = i.user_id where i.id = p_id;
$$;
revoke all on function nuvemmeet_private.checkout_json(uuid) from public, anon, authenticated, service_role;

create function public.get_pix_checkout(p_checkout_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform nuvemmeet_private.require_billing_role();
  return nuvemmeet_private.checkout_json(p_checkout_id);
end;
$$;
create function public.get_latest_pix_checkout(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform nuvemmeet_private.require_billing_role();
  select id into v_id from nuvemmeet_private.billing_payment_intents
    where user_id = p_user_id order by created_at desc, id desc limit 1;
  return nuvemmeet_private.checkout_json(v_id);
end;
$$;

create function public.claim_pix_checkout(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_subscription public.business_subscriptions%rowtype;
  v_intent nuvemmeet_private.billing_payment_intents%rowtype;
begin
  perform nuvemmeet_private.require_billing_role();
  if p_user_id is null then raise exception 'Usuário necessário.' using errcode = '22023'; end if;
  -- All payment RPCs acquire the subscription lock before any ledger row. This
  -- also serializes two initial checkout requests and preserves one UUID for
  -- retrying an ambiguous Mercado Pago request with the same idempotency key.
  perform 1 from public.businesses where owner_id = p_user_id for key share;
  insert into public.business_subscriptions(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select * into v_subscription from public.business_subscriptions
    where user_id = p_user_id for update;
  if v_subscription.status = 'active' and v_subscription.current_period_end > now() then
    return jsonb_build_object('status','active','expires_at',v_subscription.current_period_end,
      'subscription_expires_at',v_subscription.current_period_end);
  end if;
  select * into v_intent from nuvemmeet_private.billing_payment_intents
    where user_id = p_user_id and status = 'pending'
      and (expires_at > now() or payment_id is null)
    order by created_at desc, id desc limit 1 for update;
  if not found then
    insert into nuvemmeet_private.billing_payment_intents(user_id,business_id)
      values (p_user_id,(select id from public.businesses where owner_id = p_user_id))
      returning * into v_intent;
  end if;
  return nuvemmeet_private.checkout_json(v_intent.id) || jsonb_build_object(
    'status',case when v_intent.payment_id is null then 'new' else 'pending' end
  );
end;
$$;

create function public.bind_pix_checkout(p_checkout_id uuid, p_payment_id text, p_status text,
  p_event_at timestamptz, p_expires_at timestamptz, p_merchant_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_intent nuvemmeet_private.billing_payment_intents%rowtype;
begin
  perform nuvemmeet_private.require_billing_role();
  if p_payment_id is null or p_payment_id !~ '^[0-9]{1,100}$'
    or p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,100}$'
    or p_status is null or p_status not in ('pending','approved','rejected','cancelled','refunded','charged_back')
    or p_event_at is null or p_event_at > now() + interval '5 minutes'
    or p_expires_at is null then
    raise exception 'Referência de pagamento inválida.' using errcode = '22023';
  end if;
  select user_id into v_user from nuvemmeet_private.billing_payment_intents where id = p_checkout_id;
  if v_user is null then raise exception 'Pagamento indisponível.' using errcode = '22023'; end if;
  -- Match booking/configuration lock order: business, then subscription, ledger.
  perform 1 from public.businesses where owner_id = v_user for key share;
  perform 1 from public.business_subscriptions where user_id = v_user for update;
  select * into v_intent from nuvemmeet_private.billing_payment_intents where id = p_checkout_id for update;
  if v_intent.payment_id is not null then
    if v_intent.payment_id <> p_payment_id or v_intent.merchant_id <> p_merchant_id then
      raise exception 'Referência de pagamento não corresponde.' using errcode = '22023';
    end if;
    return nuvemmeet_private.checkout_json(p_checkout_id);
  end if;
  -- Binding alone NEVER activates access, even when creation returns approved.
  -- An authoritative status then passes through apply_pix_payment atomically.
  update nuvemmeet_private.billing_payment_intents set payment_id = p_payment_id,
    merchant_id = p_merchant_id, expires_at = p_expires_at
    where id = p_checkout_id;
  return nuvemmeet_private.checkout_json(p_checkout_id);
end;
$$;

create function public.apply_pix_payment(p_checkout_id uuid, p_payment_id text, p_status text,
  p_paid_at timestamptz, p_event_at timestamptz, p_expires_at timestamptz,
  p_merchant_id text, p_amount_cents integer default 1499, p_currency text default 'BRL') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_intent nuvemmeet_private.billing_payment_intents%rowtype;
  v_payment record;
  v_end timestamptz;
  v_start timestamptz;
  v_last_paid_at timestamptz;
  v_last_payment_id text;
  v_has_revoked boolean;
begin
  perform nuvemmeet_private.require_billing_role();
  if p_payment_id is null or p_payment_id !~ '^[0-9]{1,100}$'
    or p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,100}$'
    or p_status is null or p_status not in ('pending','approved','rejected','cancelled','refunded','charged_back')
    or p_event_at is null or p_event_at > now() + interval '5 minutes'
    or p_expires_at is null or p_amount_cents is distinct from 1499 or p_currency is distinct from 'BRL' then
    raise exception 'Dados de pagamento inválidos.' using errcode = '22023';
  end if;
  select user_id into v_user from nuvemmeet_private.billing_payment_intents where id = p_checkout_id;
  if v_user is null then raise exception 'Pagamento indisponível.' using errcode = '22023'; end if;
  -- Match booking/configuration lock order: business, then subscription, ledger.
  perform 1 from public.businesses where owner_id = v_user for key share;
  perform 1 from public.business_subscriptions where user_id = v_user for update;
  select * into v_intent from nuvemmeet_private.billing_payment_intents where id = p_checkout_id for update;
  if v_intent.payment_id is not null and v_intent.payment_id <> p_payment_id
    or v_intent.merchant_id is not null and v_intent.merchant_id <> p_merchant_id then
    raise exception 'Referência de pagamento não corresponde.' using errcode = '22023';
  end if;
  if v_intent.event_at is not null and p_event_at < v_intent.event_at then
    return nuvemmeet_private.checkout_json(p_checkout_id);
  end if;
  -- Reversed payments never become paid again. Approval cannot be downgraded
  -- to pending/cancelled/rejected by a delayed or retried notification.
  if v_intent.status in ('refunded','charged_back') and p_status not in ('refunded','charged_back')
    or v_intent.status = 'charged_back' and p_status = 'refunded'
    or v_intent.status = 'approved' and p_status in ('pending','rejected','cancelled') then
    return nuvemmeet_private.checkout_json(p_checkout_id);
  end if;
  if p_status = 'approved' then
    if p_paid_at is null or p_paid_at > now() + interval '5 minutes'
      or p_paid_at < v_intent.created_at - interval '5 minutes'
      or v_intent.paid_at is not null and p_paid_at is distinct from v_intent.paid_at then
      raise exception 'Data de pagamento inválida.' using errcode = '22023';
    end if;
  end if;
  update nuvemmeet_private.billing_payment_intents set payment_id = p_payment_id,
    merchant_id = p_merchant_id, status = p_status, event_at = p_event_at,
    paid_at = case when p_status = 'approved' then p_paid_at else paid_at end,
    expires_at = p_expires_at,
    business_id = coalesce(business_id,(select id from public.businesses where owner_id = v_user)),
    coverage_start = null, coverage_end = null
    where id = p_checkout_id;
  -- Deterministic entitlement calculation from actual payments, never arrival
  -- order or webhook receipt time. Replaying an ID does not add 30 days. A
  -- refund removes only that payment's contribution while retaining others.
  for v_payment in
    select id,payment_id,paid_at from nuvemmeet_private.billing_payment_intents
      where user_id = v_user and status = 'approved' order by paid_at,payment_id
  loop
    v_start := greatest(v_payment.paid_at,v_end);
    v_end := v_start + interval '30 days';
    update nuvemmeet_private.billing_payment_intents set coverage_start = v_start, coverage_end = v_end
      where id = v_payment.id;
    v_last_paid_at := v_payment.paid_at;
    v_last_payment_id := v_payment.payment_id;
  end loop;
  select exists (select 1 from nuvemmeet_private.billing_payment_intents
    where user_id = v_user and status in ('refunded','charged_back')) into v_has_revoked;
  update public.business_subscriptions set
    status = case when v_end > now() then 'active' when v_end is not null then 'expired'
      when v_has_revoked then 'cancelled' else 'pending' end,
    current_period_end = v_end, last_paid_at = v_last_paid_at, last_payment_id = v_last_payment_id
    where user_id = v_user;
  return nuvemmeet_private.checkout_json(p_checkout_id);
end;
$$;

revoke all on function public.get_pix_checkout(uuid), public.get_latest_pix_checkout(uuid),
  public.claim_pix_checkout(uuid), public.bind_pix_checkout(uuid,text,text,timestamptz,timestamptz,text),
  public.apply_pix_payment(uuid,text,text,timestamptz,timestamptz,timestamptz,text,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_pix_checkout(uuid), public.get_latest_pix_checkout(uuid),
  public.claim_pix_checkout(uuid), public.bind_pix_checkout(uuid,text,text,timestamptz,timestamptz,text),
  public.apply_pix_payment(uuid,text,text,timestamptz,timestamptz,timestamptz,text,integer,text)
  to service_role;

-- Payments may precede company creation. Link only the immutable owner derived
-- from the inserted company row; no customer-supplied billing user is accepted.
create function nuvemmeet_private.link_company_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update nuvemmeet_private.billing_payment_intents set business_id = new.id
    where user_id = new.owner_id and business_id is null;
  return null;
end;
$$;
revoke all on function nuvemmeet_private.link_company_payments() from public, anon, authenticated, service_role;
create trigger businesses_link_payments after insert on public.businesses
  for each row execute function nuvemmeet_private.link_company_payments();

create function public.business_analytics(p_range text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_business uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_start date;
  v_from timestamptz;
  v_until timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Faça login para consultar sua agenda.' using errcode = '42501'; end if;
  v_start := case p_range
    when '7d' then v_today - 6 when '30d' then v_today - 29
    when '3m' then (v_today + 1 - interval '3 months')::date
    when '1y' then (v_today + 1 - interval '1 year')::date else null end;
  if v_start is null then raise exception 'Período inválido.' using errcode = '22023'; end if;
  if not public.has_active_business_subscription() then
    raise exception 'Assinatura ativa necessária. Acesse os planos do NuvemMeet.' using errcode = '42501';
  end if;
  select id into v_business from public.businesses where owner_id = auth.uid();
  if not found then raise exception 'Cadastre sua empresa antes de consultar a agenda.' using errcode = '42501'; end if;
  v_from := v_start::timestamp at time zone 'America/Sao_Paulo';
  v_until := (v_today + 1)::timestamp at time zone 'America/Sao_Paulo';
  with daily_counts as (
    select (a.starts_at at time zone 'America/Sao_Paulo')::date as day,
      count(*) as appointments,
      count(*) filter (where a.status = 'completed') as completed,
      count(*) filter (where a.status = 'cancelled') as cancelled
    from public.appointments a where a.business_id = v_business
      and a.starts_at >= v_from and a.starts_at < v_until
    group by (a.starts_at at time zone 'America/Sao_Paulo')::date
  ), daily as (
    select d.day::date as date, coalesce(c.appointments,0) as appointments,
      coalesce(c.completed,0) as completed, coalesce(c.cancelled,0) as cancelled
    from generate_series(v_start::timestamp,v_today::timestamp,interval '1 day') d(day)
      left join daily_counts c on c.day = d.day::date
  ) select jsonb_build_object(
    'range',p_range,'timezone','America/Sao_Paulo','starts_on',v_start,'ends_on',v_today,
    'totals',jsonb_build_object(
      'appointments',(select coalesce(sum(appointments),0) from daily),
      'completed',(select coalesce(sum(completed),0) from daily),
      'cancelled',(select coalesce(sum(cancelled),0) from daily),
      'future',(select count(*) from public.appointments a where a.business_id = v_business
        and a.status in ('pending','confirmed') and a.starts_at >= now())
    ),
    'days',(select jsonb_agg(to_jsonb(d) order by d.date) from daily d)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.business_analytics(text) from public, anon, authenticated;
grant execute on function public.business_analytics(text) to authenticated;


commit;
