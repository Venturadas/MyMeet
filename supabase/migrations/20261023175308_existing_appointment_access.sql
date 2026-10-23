-- Additive owner-only context for fulfilling existing appointments after expiry.
-- Does not relax businesses RLS, grant a subscription or enable new reservations.
create function public.get_my_business_agenda_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_context jsonb;
begin
  if v_user is null then
    raise exception 'Faça login para consultar sua agenda.' using errcode = '42501';
  end if;
  select jsonb_build_object('id', b.id, 'name', b.name, 'timezone', b.timezone)
    into v_context from public.businesses b where b.owner_id = v_user;
  return v_context;
end;
$$;
revoke all on function public.get_my_business_agenda_context() from public, anon, authenticated;
grant execute on function public.get_my_business_agenda_context() to authenticated;
