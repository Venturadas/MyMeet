-- MyMeet MVP: tenant isolation is enforced in PostgreSQL, including RPCs.
-- Apply through Supabase migrations or the SQL editor as the database owner.
begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0),
  price_cents integer not null check (price_cents between 0 and 100000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create index services_business_idx on public.services(business_id);

create table public.business_hours (
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (business_id, weekday),
  check (start_time < end_time),
  check (extract(second from start_time) = 0 and extract(minute from start_time)::integer % 15 = 0),
  check (extract(second from end_time) = 0 and extract(minute from end_time)::integer % 15 = 0)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  service_id uuid not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 100),
  service_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  price_cents integer not null check (price_cents >= 0),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (service_id, business_id) references public.services(id, business_id) on delete restrict,
  check (ends_at > starts_at),
  -- This constraint also serializes competing reservations, unlike a SELECT check.
  constraint appointments_no_overlap exclude using gist (
    business_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_customer_idx on public.appointments(customer_id, starts_at);
create index appointments_business_idx on public.appointments(business_id, starts_at);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed'))
);
create unique index privacy_request_pending_idx on public.privacy_requests(user_id)
  where status in ('pending', 'processing');

-- Minimal administrative audit: deliberately omits names, email and comments.
-- No foreign keys: deleting/anonymizing a record does not erase its audit trail.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  actor_id uuid,
  action text not null,
  old_status text,
  new_status text,
  old_starts_at timestamptz,
  new_starts_at timestamptz,
  old_ends_at timestamptz,
  new_ends_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index audit_appointment_idx on public.audit_events(appointment_id, recorded_at);

create function public._audit_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'created';
  elsif tg_op = 'DELETE' then v_action := 'deleted';
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then v_action := 'reschedule';
  elsif new.status is distinct from old.status then v_action := new.status;
  elsif new.comment is distinct from old.comment then v_action := 'comment';
  else v_action := 'updated'; end if;
  insert into public.audit_events(appointment_id, actor_id, action,
    old_status, new_status, old_starts_at, new_starts_at, old_ends_at, new_ends_at)
  values (coalesce(new.id, old.id), auth.uid(), v_action,
    old.status, new.status, old.starts_at, new.starts_at, old.ends_at, new.ends_at);
  return null;
end;
$$;
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public._audit_appointment();

create function public._touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public._touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function public._touch_updated_at();

create function public._validate_business() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso horário inválido.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'O proprietário da empresa não pode ser alterado.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger businesses_validate before insert or update on public.businesses
  for each row execute function public._validate_business();

create function public._create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', 'Cliente')), 100);
  if char_length(v_name) < 2 then v_name := 'Cliente'; end if;
  insert into public.profiles(id, display_name) values (new.id, v_name);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._create_profile();
-- Existing Supabase Auth accounts also receive a minimal private profile.
insert into public.profiles(id, display_name)
select u.id, case
  when char_length(btrim(coalesce(u.raw_user_meta_data ->> 'display_name', ''))) >= 2
    then left(btrim(u.raw_user_meta_data ->> 'display_name'), 100)
  else 'Cliente'
end from auth.users u;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.appointments enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.audit_events enable row level security;

create policy profile_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profile_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy business_owner_read on public.businesses for select to authenticated using (owner_id = (select auth.uid()));
create policy business_owner_insert on public.businesses for insert to authenticated with check (owner_id = (select auth.uid()));
create policy business_owner_update on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy business_owner_delete on public.businesses for delete to authenticated using (owner_id = (select auth.uid()));
create policy services_public_read on public.services for select to anon, authenticated using (active);
create policy services_owner_read on public.services for select to authenticated using (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy service_owner_insert on public.services for insert to authenticated with check (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy service_owner_update on public.services for update to authenticated using (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
)) with check (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy service_owner_delete on public.services for delete to authenticated using (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy hours_public_read on public.business_hours for select to anon, authenticated using (true);
create policy hours_owner_insert on public.business_hours for insert to authenticated with check (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy hours_owner_update on public.business_hours for update to authenticated using (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
)) with check (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy hours_owner_delete on public.business_hours for delete to authenticated using (exists (
  select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
));
create policy appointments_participant_read on public.appointments for select to authenticated using (
  customer_id = (select auth.uid()) or exists (
    select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())
  )
);
create policy privacy_self_read on public.privacy_requests for select to authenticated using (user_id = (select auth.uid()));

-- The owner UUID never appears in the public catalogue. This view deliberately
-- uses the database owner to expose ONLY the listed safe business fields.
create view public.business_catalog with (security_barrier = true) as
  select id, slug, name, description, timezone, created_at from public.businesses;

revoke all on public.profiles, public.businesses, public.services, public.business_hours,
  public.appointments, public.privacy_requests, public.audit_events, public.business_catalog from public, anon, authenticated;
grant select on public.business_catalog, public.services, public.business_hours to anon, authenticated;
grant select on public.profiles, public.businesses, public.appointments, public.privacy_requests to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (owner_id, slug, name, description, timezone), update (slug, name, description, timezone), delete
  on public.businesses to authenticated;
grant insert (business_id, name, description, duration_minutes, price_cents, active),
  update (name, description, duration_minutes, price_cents, active), delete on public.services to authenticated;
grant insert (business_id, weekday, start_time, end_time),
  update (business_id, weekday, start_time, end_time), delete on public.business_hours to authenticated;

-- Private implementation helper: validates a slot independently of the browser.
create function public._validated_end(p_business_id uuid, p_service_id uuid, p_starts_at timestamptz)
returns timestamptz language plpgsql set search_path = '' as $$
declare
  v_timezone text;
  v_duration integer;
  v_local timestamp;
  v_hours public.business_hours%rowtype;
  v_ends_at timestamptz;
begin
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

create function public.available_slots(p_business_id uuid, p_service_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_timezone text;
  v_duration integer;
  v_hours public.business_hours%rowtype;
begin
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

create function public.book_appointment(p_business_id uuid, p_service_id uuid, p_starts_at timestamptz)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_end timestamptz;
  v_service public.services%rowtype;
  v_result public.appointments%rowtype;
begin
  if v_user is null then raise exception 'Faça login para agendar.' using errcode = '42501'; end if;
  -- Serialize a customer's requests before applying the anti-abuse limit.
  select display_name into v_name from public.profiles where id = v_user for update;
  if not found then raise exception 'Complete seu perfil antes de agendar.' using errcode = '22023'; end if;
  if (select count(*) from public.appointments where customer_id = v_user
      and status in ('pending', 'confirmed') and starts_at > now()) >= 10 then
    raise exception 'Você já possui 10 reservas futuras ativas. Cancele ou conclua uma antes de reservar novamente.' using errcode = '22023';
  end if;
  -- Lock configuration while capturing the immutable booking snapshot.
  -- Serializing per agenda also prevents GiST speculative-insert deadlocks.
  perform 1 from public.businesses where id = p_business_id for update;
  select * into v_service from public.services where id = p_service_id and business_id = p_business_id for share;
  v_end := public._validated_end(p_business_id, p_service_id, p_starts_at);
  insert into public.appointments(business_id, service_id, customer_id, customer_name, service_name, starts_at, ends_at, price_cents)
    values (p_business_id, p_service_id, v_user, v_name, v_service.name, p_starts_at, v_end, v_service.price_cents)
    returning * into v_result;
  return v_result;
exception when exclusion_violation then
  raise exception 'Esse horário acabou de ser reservado. Escolha outro.' using errcode = '23P01';
end;
$$;

create function public.update_appointment(p_appointment_id uuid, p_action text,
  p_starts_at timestamptz default null, p_comment text default null)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item public.appointments%rowtype;
  v_host boolean;
  v_end timestamptz;
  v_business_id uuid;
begin
  if v_user is null then raise exception 'Faça login para alterar agendamentos.' using errcode = '42501'; end if;
  select * into v_item from public.appointments where id = p_appointment_id;
  if not found then raise exception 'Agendamento indisponível.' using errcode = '42501'; end if;
  select exists(select 1 from public.businesses where id = v_item.business_id and owner_id = v_user) into v_host;
  if not v_host and v_item.customer_id is distinct from v_user then
    raise exception 'Agendamento indisponível.' using errcode = '42501';
  end if;
  -- Use the same lock order as booking: agenda before appointment.
  v_business_id := v_item.business_id;
  perform 1 from public.businesses where id = v_business_id for update;
  select * into v_item from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Agendamento indisponível.' using errcode = '42501'; end if;
  if v_item.business_id is distinct from v_business_id then
    raise exception 'Agendamento alterado. Atualize a página e tente novamente.' using errcode = '40001';
  end if;
  select exists(select 1 from public.businesses where id = v_item.business_id and owner_id = v_user) into v_host;
  if not v_host and v_item.customer_id is distinct from v_user then
    raise exception 'Agendamento indisponível.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('confirm', 'cancel', 'reschedule', 'complete', 'comment') then
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  if not v_host and p_action not in ('cancel', 'reschedule') then
    raise exception 'Somente a empresa pode executar essa ação.' using errcode = '42501';
  end if;
  if p_action = 'comment' then
    if p_comment is null or char_length(p_comment) > 2000 then
      raise exception 'Comentário inválido (máximo 2000 caracteres).' using errcode = '22023';
    end if;
    update public.appointments set comment = p_comment where id = v_item.id returning * into v_item;
    return v_item;
  end if;
  if v_item.status in ('cancelled', 'completed') then
    raise exception 'Esse agendamento já foi encerrado.' using errcode = '22023';
  end if;
  if not v_host and v_item.starts_at <= now() then
    raise exception 'Este agendamento já começou. Entre em contato com a empresa.' using errcode = '22023';
  end if;
  case p_action
    when 'confirm' then
      if v_item.status <> 'pending' then raise exception 'Agendamento já confirmado.' using errcode = '22023'; end if;
      update public.appointments set status = 'confirmed' where id = v_item.id;
    when 'cancel' then
      update public.appointments set status = 'cancelled' where id = v_item.id;
    when 'complete' then
      if v_item.status <> 'confirmed' or v_item.ends_at > now() then
        raise exception 'Somente serviços confirmados e finalizados podem ser concluídos.' using errcode = '22023';
      end if;
      update public.appointments set status = 'completed' where id = v_item.id;
    when 'reschedule' then
      perform 1 from public.services where id = v_item.service_id for share;
      v_end := public._validated_end(v_item.business_id, v_item.service_id, p_starts_at);
      update public.appointments set starts_at = p_starts_at, ends_at = v_end, status = 'pending' where id = v_item.id;
  end case;
  select * into v_item from public.appointments where id = v_item.id;
  return v_item;
exception when exclusion_violation then
  raise exception 'Esse horário acabou de ser reservado. Escolha outro.' using errcode = '23P01';
end;
$$;

create function public.request_data_erasure() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Faça login para solicitar exclusão.' using errcode = '42501'; end if;
  -- A single pending request per user, even under competing requests.
  insert into public.privacy_requests(user_id) values (v_user)
    on conflict (user_id) where status in ('pending', 'processing') do update set user_id = excluded.user_id
    returning id into v_id;
  return v_id;
end;
$$;

create function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Faça login para exportar seus dados.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = v_user),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from public.appointments a where a.customer_id = v_user), '[]'::jsonb),
    'privacy_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at) from public.privacy_requests r where r.user_id = v_user), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.get_my_spending() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_total bigint;
begin
  if v_user is null then raise exception 'Faça login para consultar seus gastos.' using errcode = '42501'; end if;
  select coalesce(sum(price_cents), 0) into v_total from public.appointments
    where customer_id = v_user and status = 'completed';
  return v_total;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly close every RPC.
revoke all on function public._touch_updated_at(), public._validate_business(), public._create_profile(), public._audit_appointment(),
  public._validated_end(uuid, uuid, timestamptz), public.available_slots(uuid, uuid, date),
  public.book_appointment(uuid, uuid, timestamptz), public.update_appointment(uuid, text, timestamptz, text),
  public.request_data_erasure(), public.export_my_data(), public.get_my_spending() from public, anon, authenticated;
grant execute on function public.available_slots(uuid, uuid, date) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, timestamptz),
  public.update_appointment(uuid, text, timestamptz, text), public.request_data_erasure(), public.export_my_data(),
  public.get_my_spending() to authenticated;

commit;
