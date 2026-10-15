-- Incremental NuvemMeet identities, real reviews and company marketing content.
-- No real account, payment, entitlement or company data is seeded.
begin;
alter table public.profiles
  add column username text unique check(username ~ '^[a-z0-9_]{3,30}$'),
  add column phone text check(phone ~ '^\+?[0-9]{8,15}$'),
  add column avatar_path text;
alter table public.businesses
  add column category text not null default '' check(char_length(category)<=80),
  add column city text not null default '' check(char_length(city)<=100),
  add column state text not null default '' check(state='' or state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column address text not null default '' check(char_length(address)<=240),
  add column phone text not null default '' check(phone='' or phone ~ '^\+?[0-9]{8,15}$'),
  add column whatsapp text not null default '' check(whatsapp='' or whatsapp ~ '^\+?[0-9]{8,15}$'),
  add column instagram text not null default '' check(instagram='' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column logo_path text,add column cover_path text;
grant insert(category,city,state,address,phone,whatsapp,instagram),update(category,city,state,address,phone,whatsapp,instagram) on public.businesses to authenticated;

create table public.business_gallery(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null,position integer not null check(position between 0 and 11),created_at timestamptz not null default now(),
  unique(business_id,storage_path),unique(business_id,position) deferrable initially deferred
);
create table public.business_professionals(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 2 and 100),title text not null default '' check(char_length(title)<=120),
  active boolean not null default true,photo_path text,created_at timestamptz not null default now()
);
create index professionals_business_idx on public.business_professionals(business_id);
create table public.reviews(
  id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null check(char_length(btrim(reviewer_name)) between 1 and 100),rating integer not null check(rating between 1 and 5),
  comment text not null default '' check(char_length(comment)<=1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index reviews_business_idx on public.reviews(business_id,created_at desc);
create trigger reviews_touch before update on public.reviews for each row execute function public._touch_updated_at();
create table public.favorites(
  user_id uuid not null references auth.users(id) on delete cascade,business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),primary key(user_id,business_id)
);
create index favorites_business_idx on public.favorites(business_id);
alter table public.business_gallery enable row level security;
alter table public.business_professionals enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
create policy gallery_owner_read on public.business_gallery for select to authenticated
  using(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()));
create policy professionals_owner_read on public.business_professionals for select to authenticated
  using(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()));
create policy professionals_owner_insert on public.business_professionals for insert to authenticated
  with check(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()));
create policy professionals_owner_update on public.business_professionals for update to authenticated
  using(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()))
  with check(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()));
create policy professionals_owner_delete on public.business_professionals for delete to authenticated
  using(nuvemmeet_private.owns_business(business_id) and (select public.has_active_business_subscription()));
create trigger professionals_subscription before insert or update or delete on public.business_professionals
  for each row execute function public._enforce_business_subscription();
create trigger gallery_subscription before insert or update or delete on public.business_gallery
  for each row execute function public._enforce_business_subscription();
create function nuvemmeet_private.limit_company_professionals() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.businesses where id=new.business_id for update;
  perform public._require_paid_business_owner(v_owner);
  if(select count(*) from public.business_professionals where business_id=new.business_id)>=20 then
    raise exception 'Use até 20 profissionais.' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function nuvemmeet_private.limit_company_professionals() from public,anon,authenticated;
create trigger professionals_limit before insert on public.business_professionals
  for each row execute function nuvemmeet_private.limit_company_professionals();
create policy review_self_read on public.reviews for select to authenticated using(reviewer_id=(select auth.uid()));
create policy favorite_self_read on public.favorites for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.business_gallery,public.business_professionals,public.reviews,public.favorites from public,anon,authenticated;
grant select on public.business_gallery,public.business_professionals,public.reviews,public.favorites to authenticated;
grant insert(business_id,name,title,active),update(name,title,active),delete on public.business_professionals to authenticated;

-- Definer views enumerate only safe public fields, never profile/account IDs.
create or replace view public.business_catalog with(security_barrier=true) as
 select b.id,b.slug,b.name,b.description,b.timezone,b.created_at,b.category,b.city,b.state,b.address,b.phone,b.whatsapp,b.instagram,b.logo_path,b.cover_path,
 coalesce(r.rating_average,0::numeric) rating_average,coalesce(r.rating_count,0::bigint) rating_count
 from public.businesses b left join lateral(
   select round(avg(v.rating)::numeric,2) rating_average,count(*) rating_count from public.reviews v join public.appointments a on a.id=v.appointment_id
   where v.business_id=b.id and a.business_id=b.id and a.customer_id=v.reviewer_id and a.status='completed'
 )r on true where nuvemmeet_private.business_is_bookable(b.id);
create view public.business_reviews_public with(security_barrier=true) as
 select r.id,r.business_id,r.rating,r.comment,r.reviewer_name,r.created_at,r.updated_at from public.reviews r join public.appointments a on a.id=r.appointment_id
 where a.status='completed' and a.business_id=r.business_id and a.customer_id=r.reviewer_id and nuvemmeet_private.business_is_bookable(r.business_id);
create view public.business_gallery_public with(security_barrier=true) as
 select g.id,g.business_id,g.storage_path,g.position from public.business_gallery g where nuvemmeet_private.business_is_bookable(g.business_id);
create view public.business_professionals_public with(security_barrier=true) as
 select p.id,p.business_id,p.name,p.title,p.photo_path from public.business_professionals p where p.active and nuvemmeet_private.business_is_bookable(p.business_id);
create view public.customer_favorites with(security_invoker=true,security_barrier=true) as
 select f.user_id,f.business_id,f.created_at,c.slug,c.name,c.category,c.city,c.state,c.logo_path,c.rating_average,c.rating_count
 from public.favorites f join public.business_catalog c on c.id=f.business_id;
revoke all on public.business_reviews_public,public.business_gallery_public,public.business_professionals_public,public.customer_favorites from public,anon,authenticated;
grant select on public.business_reviews_public,public.business_gallery_public,public.business_professionals_public to anon,authenticated;
grant select on public.customer_favorites to authenticated;

create function public.save_review(p_appointment_id uuid,p_rating integer,p_comment text default '') returns public.reviews
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_item public.appointments%rowtype;v_name text;v_review public.reviews%rowtype;
begin
 if v_user is null then raise exception 'Faça login para avaliar.' using errcode='42501';end if;
 if p_rating is null or p_rating not between 1 and 5 or p_comment is null or char_length(p_comment)>1000 then
   raise exception 'Informe nota de 1 a 5 e comentário de até 1000 caracteres.' using errcode='22023';end if;
 select * into v_item from public.appointments where id=p_appointment_id for share;
 if not found or v_item.customer_id is distinct from v_user or v_item.status<>'completed' or nuvemmeet_private.owns_business(v_item.business_id) then
   raise exception 'Avalie somente seu atendimento concluído em outra empresa.' using errcode='42501';end if;
 select coalesce(username,split_part(btrim(display_name),' ',1)) into v_name from public.profiles where id=v_user;
 insert into public.reviews(appointment_id,business_id,reviewer_id,reviewer_name,rating,comment)
 values(v_item.id,v_item.business_id,v_user,coalesce(nullif(v_name,''),'Cliente'),p_rating,btrim(p_comment))
 on conflict(appointment_id) do update set rating=excluded.rating,comment=excluded.comment,reviewer_name=excluded.reviewer_name
 where public.reviews.reviewer_id=v_user returning * into v_review;
 if not found then raise exception 'Avaliação indisponível.' using errcode='42501';end if;
 return v_review;
end;
$$;
create function public.delete_review(p_review_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Faça login para excluir a avaliação.' using errcode='42501';end if;
 delete from public.reviews where id=p_review_id and reviewer_id=auth.uid();return found;
end;
$$;
create function public.toggle_favorite(p_business_id uuid,p_favorite boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Faça login para salvar favoritos.' using errcode='42501';end if;
 if p_favorite is null then raise exception 'Estado do favorito inválido.' using errcode='22023';end if;
 if p_favorite then
   if not nuvemmeet_private.business_is_bookable(p_business_id) then raise exception 'Empresa indisponível.' using errcode='22023';end if;
   insert into public.favorites(user_id,business_id) values(auth.uid(),p_business_id) on conflict do nothing;
 else delete from public.favorites where user_id=auth.uid() and business_id=p_business_id;end if;
 return p_favorite;
end;
$$;
create function public.customer_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Faça login para consultar seu resumo.' using errcode='42501';end if;
 return jsonb_build_object(
 'upcoming',(select count(*) from public.appointments where customer_id=auth.uid() and starts_at>=now() and status in('pending','confirmed')),
 'completed',(select count(*) from public.appointments where customer_id=auth.uid() and status='completed'),
 'spending_cents',(select coalesce(sum(price_cents),0) from public.appointments where customer_id=auth.uid() and status='completed'),
 'favorites',(select count(*) from public.favorites where user_id=auth.uid() and nuvemmeet_private.business_is_bookable(business_id)));
end;
$$;
create function public.business_client_summary(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;v_result jsonb;
begin
 if auth.uid() is null or not public.has_active_business_subscription() then raise exception 'Assinatura ativa necessária.' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 select id into v_business from public.businesses where owner_id=auth.uid();
 if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.client_key),'[]'::jsonb) into v_result from(
 select md5(v_business::text||':'||a.customer_id::text) client_key,(array_agg(a.customer_name order by a.starts_at desc,a.id))[1] name,
 count(*) appointments,count(*) filter(where a.status='completed') completed,count(*) filter(where a.status='cancelled') cancelled,
 max(a.starts_at) filter(where a.status='completed') last_visit,
 min(a.starts_at) filter(where a.status in('pending','confirmed') and a.starts_at>=now()) next_visit
 from public.appointments a where a.business_id=v_business and a.customer_id is not null group by a.customer_id
 order by name,client_key limit p_limit offset p_offset)c;
 return v_result;
end;
$$;
create function public.business_review_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_business uuid;v_result jsonb;
begin
 if auth.uid() is null or not public.has_active_business_subscription() then raise exception 'Assinatura ativa necessária.' using errcode='42501';end if;
 select id into v_business from public.businesses where owner_id=auth.uid();if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 with valid as(select r.rating from public.reviews r join public.appointments a on a.id=r.appointment_id
 where r.business_id=v_business and a.business_id=v_business and a.customer_id=r.reviewer_id and a.status='completed')
 select jsonb_build_object('average',coalesce((select round(avg(rating)::numeric,2) from valid),0),'count',(select count(*) from valid),
 'distribution',(select jsonb_agg(jsonb_build_object('rating',rating,'count',(select count(*) from valid v where v.rating=d.rating)) order by rating) from generate_series(1,5)d(rating))) into v_result;
 return v_result;
end;
$$;

-- Storage already exists in hosted Supabase; disposable tests emulate it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('company-images','company-images',true,2097152,array['image/webp']),('user-avatars','user-avatars',false,2097152,array['image/webp']);
create function nuvemmeet_private.valid_media_path(p_path text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$',false);
$$;
create function nuvemmeet_private.company_path_in_use(p_business uuid,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.businesses where id=p_business and(logo_path=p_path or cover_path=p_path))
 or exists(select 1 from public.business_gallery where business_id=p_business and storage_path=p_path)
 or exists(select 1 from public.business_professionals where business_id=p_business and photo_path=p_path);
$$;
create function nuvemmeet_private.can_company_media(p_path text,p_delete boolean default false,p_insert boolean default false) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v_business uuid;v_owner uuid;
begin
 if auth.uid() is null or not nuvemmeet_private.valid_media_path(p_path) then return false;end if;
 v_business:=split_part(p_path,'/',1)::uuid;
 -- Serialize upload quotas, attachment and deletion with the same company lock.
 select owner_id into v_owner from public.businesses where id=v_business and owner_id=auth.uid() for update;
 if not found or v_owner is distinct from auth.uid() or not public.has_active_business_subscription() then return false;end if;
 if p_insert and(select count(*) from storage.objects where bucket_id='company-images' and name like v_business::text||'/%')>=64 then return false;end if;
 return not p_delete or not nuvemmeet_private.company_path_in_use(v_business,p_path);
end;
$$;
create function nuvemmeet_private.can_avatar_media(p_path text,p_delete boolean default false,p_insert boolean default false) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v_current text;
begin
 if auth.uid() is null or not nuvemmeet_private.valid_media_path(p_path) or split_part(p_path,'/',1)<>auth.uid()::text then return false;end if;
 select avatar_path into v_current from public.profiles where id=auth.uid() for update;
 if not found then return false;end if;
 if p_insert and(select count(*) from storage.objects where bucket_id='user-avatars' and name like auth.uid()::text||'/%')>=8 then return false;end if;
 return not p_delete or v_current is distinct from p_path;
end;
$$;
create policy nuvemmeet_company_media_select on storage.objects for select to authenticated using(bucket_id='company-images' and nuvemmeet_private.can_company_media(name));
create policy nuvemmeet_company_media_insert on storage.objects for insert to authenticated with check(bucket_id='company-images' and nuvemmeet_private.can_company_media(name,false,true));
create policy nuvemmeet_company_media_delete on storage.objects for delete to authenticated using(bucket_id='company-images' and nuvemmeet_private.can_company_media(name,true));
create policy nuvemmeet_avatar_select on storage.objects for select to authenticated using(bucket_id='user-avatars' and nuvemmeet_private.can_avatar_media(name));
create policy nuvemmeet_avatar_insert on storage.objects for insert to authenticated with check(bucket_id='user-avatars' and nuvemmeet_private.can_avatar_media(name,false,true));
create policy nuvemmeet_avatar_delete on storage.objects for delete to authenticated using(bucket_id='user-avatars' and nuvemmeet_private.can_avatar_media(name,true));
-- No UPDATE policy: overwrite/rename is forbidden, uploads use fresh UUIDs.
revoke all on function nuvemmeet_private.valid_media_path(text),nuvemmeet_private.company_path_in_use(uuid,text),
 nuvemmeet_private.can_company_media(text,boolean,boolean),nuvemmeet_private.can_avatar_media(text,boolean,boolean) from public,anon,authenticated;
grant execute on function nuvemmeet_private.can_company_media(text,boolean,boolean),nuvemmeet_private.can_avatar_media(text,boolean,boolean) to authenticated;

create function public.company_media_path_in_use(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_business uuid;
begin
 if auth.uid() is null then raise exception 'Faça login para gerenciar imagens.' using errcode='42501';end if;
 select id into v_business from public.businesses where owner_id=auth.uid();if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 perform public._require_paid_business_owner(auth.uid());
 if not nuvemmeet_private.valid_media_path(p_path) or split_part(p_path,'/',1)<>v_business::text then raise exception 'Imagem inválida.' using errcode='22023';end if;
 return nuvemmeet_private.company_path_in_use(v_business,p_path);
end;
$$;
create function public.attach_company_image(p_kind text,p_path text,p_record_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_id uuid;v_old text;v_count integer;
begin
 if auth.uid() is null then raise exception 'Faça login para enviar imagens.' using errcode='42501';end if;
 select id into v_business from public.businesses where owner_id=auth.uid() for update;
 if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 perform public._require_paid_business_owner(auth.uid());
 if not nuvemmeet_private.valid_media_path(p_path) or split_part(p_path,'/',1)<>v_business::text then raise exception 'Imagem inválida.' using errcode='22023';end if;
 perform 1 from storage.objects where bucket_id='company-images' and name=p_path for share;
 if not found then raise exception 'Envie a imagem antes de vinculá-la.' using errcode='22023';end if;
 case p_kind
 when 'logo' then
   if p_record_id is not null then raise exception 'Referência inválida.' using errcode='22023';end if;
   select logo_path into v_old from public.businesses where id=v_business;update public.businesses set logo_path=p_path where id=v_business;v_id:=v_business;
 when 'cover' then
   if p_record_id is not null then raise exception 'Referência inválida.' using errcode='22023';end if;
   select cover_path into v_old from public.businesses where id=v_business;update public.businesses set cover_path=p_path where id=v_business;v_id:=v_business;
 when 'gallery' then
   if p_record_id is not null then raise exception 'Referência inválida.' using errcode='22023';end if;
   select count(*) into v_count from public.business_gallery where business_id=v_business;
   if v_count>=12 then raise exception 'Use até 12 imagens na galeria.' using errcode='22023';end if;
   insert into public.business_gallery(business_id,storage_path,position) values(v_business,p_path,v_count) returning id into v_id;
 when 'professional' then
   select id,photo_path into v_id,v_old from public.business_professionals where id=p_record_id and business_id=v_business for update;
   if not found then raise exception 'Profissional indisponível.' using errcode='42501';end if;
   update public.business_professionals set photo_path=p_path where id=v_id;
 else raise exception 'Tipo de imagem inválido.' using errcode='22023';end case;
 return jsonb_build_object('id',v_id,'path',p_path,'previous_path',v_old);
end;
$$;
create function public.remove_company_image(p_kind text,p_record_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_id uuid;v_old text;
begin
 if auth.uid() is null then raise exception 'Faça login para remover imagens.' using errcode='42501';end if;
 select id into v_business from public.businesses where owner_id=auth.uid() for update;
 if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 perform public._require_paid_business_owner(auth.uid());
 case p_kind
 when 'logo' then
   if p_record_id is not null then raise exception 'Referência inválida.' using errcode='22023';end if;
   select logo_path into v_old from public.businesses where id=v_business;update public.businesses set logo_path=null where id=v_business;v_id:=v_business;
 when 'cover' then
   if p_record_id is not null then raise exception 'Referência inválida.' using errcode='22023';end if;
   select cover_path into v_old from public.businesses where id=v_business;update public.businesses set cover_path=null where id=v_business;v_id:=v_business;
 when 'gallery' then
   delete from public.business_gallery where id=p_record_id and business_id=v_business returning id,storage_path into v_id,v_old;
   if not found then raise exception 'Imagem indisponível.' using errcode='42501';end if;
   with ordered as(select id,row_number() over(order by position)-1 pos from public.business_gallery where business_id=v_business)
   update public.business_gallery g set position=o.pos from ordered o where g.id=o.id;
 when 'professional' then
   select id,photo_path into v_id,v_old from public.business_professionals where id=p_record_id and business_id=v_business for update;
   if not found then raise exception 'Profissional indisponível.' using errcode='42501';end if;
   update public.business_professionals set photo_path=null where id=v_id;
 else raise exception 'Tipo de imagem inválido.' using errcode='22023';end case;
 return jsonb_build_object('id',v_id,'path',null,'previous_path',v_old);
end;
$$;
create function public.reorder_company_gallery(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare v_business uuid;v_count integer;
begin
 if auth.uid() is null then raise exception 'Faça login para ordenar a galeria.' using errcode='42501';end if;
 select id into v_business from public.businesses where owner_id=auth.uid() for update;
 if not found then raise exception 'Empresa indisponível.' using errcode='42501';end if;
 perform public._require_paid_business_owner(auth.uid());select count(*) into v_count from public.business_gallery where business_id=v_business;
 if p_ids is null or cardinality(p_ids)<>v_count or cardinality(p_ids)>12 or(select count(distinct item) from unnest(p_ids)item)<>v_count
 or exists(select 1 from unnest(p_ids)item where not exists(select 1 from public.business_gallery g where g.id=item and g.business_id=v_business)) then
   raise exception 'Informe todas as imagens da sua galeria uma única vez.' using errcode='22023';end if;
 update public.business_gallery g set position=ids.ordinality-1 from unnest(p_ids) with ordinality ids(id,ordinality) where g.id=ids.id and g.business_id=v_business;
end;
$$;
create function public.set_avatar(p_path text) returns text language plpgsql security definer set search_path='' as $$
declare v_old text;
begin
 if auth.uid() is null then raise exception 'Faça login para editar sua foto.' using errcode='42501';end if;
 select avatar_path into v_old from public.profiles where id=auth.uid() for update;
 if p_path is not null then
   if not nuvemmeet_private.valid_media_path(p_path) or split_part(p_path,'/',1)<>auth.uid()::text then raise exception 'Foto inválida.' using errcode='22023';end if;
   perform 1 from storage.objects where bucket_id='user-avatars' and name=p_path for share;
   if not found then raise exception 'Envie a foto antes de vinculá-la.' using errcode='22023';end if;
 end if;
 update public.profiles set avatar_path=p_path where id=auth.uid();return v_old;
end;
$$;
create function public.save_profile(p_display_name text,p_username text,p_phone text) returns public.profiles
language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles%rowtype;
begin
 if auth.uid() is null then raise exception 'Faça login para editar o perfil.' using errcode='42501';end if;
 if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 100 then raise exception 'Nome deve ter entre 2 e 100 caracteres.' using errcode='22023';end if;
 if nullif(btrim(p_username),'') is not null and lower(btrim(p_username)) !~ '^[a-z0-9_]{3,30}$' then raise exception 'Usuário deve ter de 3 a 30 letras, números ou sublinhado.' using errcode='22023';end if;
 if nullif(btrim(p_phone),'') is not null and btrim(p_phone) !~ '^\+?[0-9]{8,15}$' then raise exception 'Telefone inválido.' using errcode='22023';end if;
 update public.profiles set display_name=btrim(p_display_name),username=nullif(lower(btrim(p_username)),''),phone=nullif(btrim(p_phone),'') where id=auth.uid() returning * into v_profile;
 return v_profile;
end;
$$;
create function public.get_my_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Faça login para consultar seu perfil.' using errcode='42501';end if;
 return jsonb_build_object('email',(select email from auth.users where id=auth.uid()),'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()));
end;
$$;

-- Preserve complete financial history and add only the caller's new records.
create or replace function public.export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;
begin
 if v_user is null then raise exception 'Faça login para exportar seus dados.' using errcode='42501';end if;
 select jsonb_build_object('email',(select email from auth.users where id=v_user),
 'profile',(select to_jsonb(p) from public.profiles p where p.id=v_user),
 'appointments',coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from public.appointments a where a.customer_id=v_user),'[]'::jsonb),
 'privacy_requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at) from public.privacy_requests r where r.user_id=v_user),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reviews r where r.reviewer_id=v_user),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.favorites f where f.user_id=v_user),'[]'::jsonb),
 'payment_history',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'business_id',i.business_id,'payment_id',i.payment_id,
 'amount_cents',i.amount_cents,'currency',i.currency,'status',i.status,'paid_at',i.paid_at,'coverage_start',i.coverage_start,
 'coverage_end',i.coverage_end,'created_at',i.created_at,'updated_at',i.updated_at) order by i.created_at) from nuvemmeet_private.billing_payment_intents i where i.user_id=v_user),'[]'::jsonb),
 'business_subscription',(select to_jsonb(s) from public.business_subscriptions s where s.user_id=v_user)) into v_result;
 return v_result;
end;
$$;
revoke all on function public.save_review(uuid,integer,text),public.delete_review(uuid),public.toggle_favorite(uuid,boolean),public.customer_overview(),
 public.business_client_summary(integer,integer),public.business_review_summary(),public.company_media_path_in_use(text),public.attach_company_image(text,text,uuid),
 public.remove_company_image(text,uuid),public.reorder_company_gallery(uuid[]),public.set_avatar(text),public.save_profile(text,text,text),public.get_my_identity()
 from public,anon,authenticated;
grant execute on function public.save_review(uuid,integer,text),public.delete_review(uuid),public.toggle_favorite(uuid,boolean),public.customer_overview(),
 public.business_client_summary(integer,integer),public.business_review_summary(),public.company_media_path_in_use(text),public.attach_company_image(text,text,uuid),
 public.remove_company_image(text,uuid),public.reorder_company_gallery(uuid[]),public.set_avatar(text),public.save_profile(text,text,text),public.get_my_identity()
 to authenticated;
commit;
