/* Runs only inside the guarded disposable database created by security.cjs. */
module.exports = async function brandMessages({admin,as,user,check,equal,migrationSql}) {
  const signatures = ['public._require_paid_business_owner(uuid)','public.business_analytics(text)'];
  const oldMessage = 'Assinatura ativa necessária. Acesse os planos do NuvemMeet.';
  const newMessage = 'Assinatura ativa necessária. Acesse os planos do NuvLink.';
  const readFunctions = async () => (await admin.query(`
    select p.oid, n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' as signature,
      pg_get_functiondef(p.oid) as definition, to_jsonb(p)-'prosrc' as properties,
      p.xmin::text as catalog_version
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','auth','nuvemmeet_private')
    order by p.oid`)).rows;
  const before = await readFunctions();
  const targets = before.filter(row=>signatures.includes(row.signature));
  equal(targets.length,2,'Both allowlisted subscription functions exist before branding');
  for (const target of targets) {
    equal(target.definition.split(oldMessage).length-1,1,`${target.signature} contains one legacy brand message`);
    check(target.properties.prosecdef,`${target.signature} retains SECURITY DEFINER`);
    equal(target.properties.proconfig,['search_path=""'],`${target.signature} keeps its empty search path`);
  }
  await admin.query(migrationSql);
  const after = await readFunctions();
  equal(after.map(({catalog_version,...row})=>row),before.map(({catalog_version,...row})=>({
    ...row,definition:signatures.includes(row.signature)?row.definition.replace(oldMessage,newMessage):row.definition,
  })),'Branding changes only the exact two messages; signatures, ACLs, owners, security and all other function definitions are preserved');

  for (const [sql,params] of [
    ["insert into public.businesses(owner_id,slug,name) values ($1,'unpaid-brand-fixture','Empresa sem plano')",[user]],
    ["select public.business_analytics('7d')",[]],
  ]) {
    let failure;
    try { await as(user,sql,params); } catch(error) { failure=error; }
    equal(failure?.code,'42501','Unpaid operations retain their authorization error code');
    equal(failure?.message,newMessage,'Both subscription errors display NuvLink to the caller');
  }

  await admin.query(migrationSql);
  equal(await readFunctions(),after,'Reapplying branding is a no-op, including function catalog versions');

  // Fail closed on drift. A failure in the second function must roll back the
  // first replacement too; the enclosing transaction restores the test fixture.
  await admin.query('begin');
  try {
    for (const target of targets) await admin.query(target.definition);
    const drifted = targets.find(row=>row.signature==='public.business_analytics(text)');
    await admin.query(drifted.definition.replace(oldMessage,'Unexpected subscription message.'));
    const driftedState = await readFunctions();
    await admin.query('savepoint before_branding');
    let failure;
    try { await admin.query(migrationSql); } catch(error) { failure=error; }
    await admin.query('rollback to savepoint before_branding');
    check(failure?.message.includes('Unexpected subscription message definition'),
      'An unexpected existing message is rejected without silently changing it');
    equal(await readFunctions(),driftedState,'A rejected branding migration leaves every function unchanged');
  } finally { await admin.query('rollback'); }
  equal(await readFunctions(),after,'Drift fixtures never persist beyond their local transaction');
};
