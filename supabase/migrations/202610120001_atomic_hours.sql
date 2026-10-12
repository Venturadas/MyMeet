-- Replace a host's weekly hours atomically and serialize against reservations.
begin;

create function public.save_business_hours(p_hours jsonb) returns void
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

  -- The browser cannot choose a company or owner. This shares the booking lock.
  select b.id into v_business_id from public.businesses b
    where b.owner_id = v_user for update;
  if not found then
    raise exception 'Cadastre sua empresa antes de configurar o expediente.' using errcode = '42501';
  end if;
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
  -- Casting, quarter-hour/day/order checks and duplicate-day constraints execute
  -- after DELETE. Any invalid row rolls the entire call back, preserving hours.
  insert into public.business_hours(business_id, weekday, start_time, end_time)
    select v_business_id, (item.value ->> 'weekday')::integer,
      (item.value ->> 'start_time')::time, (item.value ->> 'end_time')::time
    from jsonb_array_elements(p_hours) as item(value);
end;
$$;

revoke all on function public.save_business_hours(jsonb) from public, anon, authenticated;
grant execute on function public.save_business_hours(jsonb) to authenticated;

commit;
