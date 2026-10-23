-- Branding only: keep the live definitions, ownership, ACLs and authorization
-- rules intact. The four previously applied migrations must not be replayed.
do $nuvlink_messages$
declare
  v_signature text;
  v_function oid;
  v_before_definition text;
  v_after_definition text;
  v_before_properties jsonb;
  v_after_properties jsonb;
  v_old_literal constant text := pg_catalog.quote_literal('Assinatura ativa necessária. Acesse os planos do NuvemMeet.');
  v_new_literal constant text := pg_catalog.quote_literal('Assinatura ativa necessária. Acesse os planos do NuvLink.');
  v_old_count integer;
  v_new_count integer;
begin
  foreach v_signature in array array[
    'public._require_paid_business_owner(uuid)',
    'public.business_analytics(text)'
  ] loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Expected subscription function is missing: %', v_signature;
    end if;

    select pg_catalog.pg_get_functiondef(p.oid), pg_catalog.to_jsonb(p) - 'prosrc'
      into v_before_definition, v_before_properties
      from pg_catalog.pg_proc p where p.oid = v_function;
    if not coalesce((v_before_properties ->> 'prosecdef')::boolean, false)
      or not coalesce((v_before_properties -> 'proconfig') @> '["search_path=\"\""]'::jsonb, false) then
      raise exception 'Unexpected subscription function security settings: %', v_signature;
    end if;
    v_old_count := (pg_catalog.length(v_before_definition)
      - pg_catalog.length(pg_catalog.replace(v_before_definition, v_old_literal, '')))
      / pg_catalog.length(v_old_literal);
    v_new_count := (pg_catalog.length(v_before_definition)
      - pg_catalog.length(pg_catalog.replace(v_before_definition, v_new_literal, '')))
      / pg_catalog.length(v_new_literal);
    if v_old_count = 0 and v_new_count = 1 then
      continue; -- Already branded; do not recreate the function.
    end if;
    if v_old_count <> 1 or v_new_count <> 0 then
      raise exception 'Unexpected subscription message definition: %', v_signature;
    end if;

    execute pg_catalog.replace(v_before_definition, v_old_literal, v_new_literal);

    select pg_catalog.pg_get_functiondef(p.oid), pg_catalog.to_jsonb(p) - 'prosrc'
      into v_after_definition, v_after_properties
      from pg_catalog.pg_proc p where p.oid = v_function;
    if v_after_definition is distinct from pg_catalog.replace(v_before_definition, v_old_literal, v_new_literal)
      or v_after_properties is distinct from v_before_properties then
      raise exception 'Subscription function changed beyond its brand message: %', v_signature;
    end if;
  end loop;
end;
$nuvlink_messages$;
