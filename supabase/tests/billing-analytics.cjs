/* Disposable PostgreSQL checks for real payment entitlements and owner analytics.
 * No external API, live payment, email, or production database is contacted. */
module.exports = async function billingAnalytics(t) {
  const {admin,as,rejects,check,equal,Client,connectionString,ids,businesses,services,dates}=t;
  async function billing(sql,params=[],client=admin) {
    await client.query('begin');
    try {
      await client.query('set local role service_role');
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      const r=await client.query(sql,params);
      await client.query('commit');return r;
    } catch(error) {await client.query('rollback');throw error;}
  }
  async function billingReject(sql,params,codes=['22023']) {
    try {await billing(sql,params);} catch(error) {check(codes.includes(error.code),`Billing rejection expected ${codes}, got ${error.code}: ${error.message}`);return;}
    throw new Error('Invalid payment must fail');
  }
  const claimSql='select public.claim_pix_checkout($1) as data';
  const applySql='select public.apply_pix_payment($1,$2,$3,$4,$5,$6,$7,$8,$9) as data';
  const bindSql='select public.bind_pix_checkout($1,$2,$3,$4,$5,$6) as data';
  const now=(await admin.query('select now() as at')).rows[0].at;
  const expires=new Date(now.getTime()+30*60000);
  equal((await as(ids.alice,'select public.has_active_business_subscription() as active')).rows[0].active,false,'Free customer has no paid company entitlement');
  await rejects(ids.alice,"insert into public.businesses(owner_id,slug,name) values ($1,'unpaid-company','Empresa sem plano')",[ids.alice],['42501'],'Unpaid user cannot create a company');
  await rejects(ids.alice,claimSql,[ids.alice],['42501'],'Customer cannot call privileged checkout claim');
  await rejects(null,claimSql,[ids.alice],['42501'],'Anonymous callers cannot claim checkout');
  await rejects(ids.hostA,'select public.get_latest_pix_checkout($1)',[ids.hostB],['42501'],'Customer JWT cannot fetch other billing references');
  await rejects(ids.alice,"insert into public.business_subscriptions(user_id,status,current_period_end) values ($1,'active',now()+interval '30 days')",[ids.alice],['42501'],'Client cannot self-activate a subscription');
  await rejects(ids.hostA,"update public.business_subscriptions set current_period_end=now()+interval '10 years' where user_id=$1",[ids.hostA],['42501'],'Client cannot extend paid access');
  await rejects(ids.alice,'select * from nuvemmeet_private.billing_payment_intents',[],['42501'],'Ledger is not readable with customer JWT');
  await rejects(ids.alice,"select public.claim_pix_checkout(case when set_config('request.jwt.claim.role','service_role',true)='service_role' then $1::uuid end)",[ids.alice],['42501'],'Spoofing JWT role text does not grant billing execution');
  equal((await as(ids.hostA,'select user_id from public.business_subscriptions')).rows.map(r=>r.user_id),[ids.hostA],'Paid subscription reads are private to the owner');

  const paidUser='40000000-0000-4000-8000-000000000001';
  await admin.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[paidUser,'payment-fixture@example.test',{display_name:'Empresário pago'}]);
  const racers=[new Client({connectionString}),new Client({connectionString})];
  await Promise.all(racers.map(c=>c.connect()));let claims;
  try {claims=await Promise.all(racers.map(c=>billing(claimSql,[paidUser],c)));}
  finally {await Promise.all(racers.map(c=>c.end()));}
  const first=claims[0].rows[0].data;
  equal(first.status,'new','New checkout is awaiting payment');
  equal(claims[1].rows[0].data.checkout_id,first.checkout_id,'Concurrent checkout requests share one idempotency UUID');
  equal((await billing(claimSql,[paidUser])).rows[0].data.checkout_id,first.checkout_id,'Ambiguous API retry reuses its checkout UUID');
  await admin.query("update nuvemmeet_private.billing_payment_intents set expires_at=now()-interval '1 hour' where id=$1",[first.checkout_id]);
  equal((await billing(claimSql,[paidUser])).rows[0].data.checkout_id,first.checkout_id,'An expired ambiguous request never creates another payment blindly');
  equal((await billing(bindSql,[first.checkout_id,'910001','approved',now,expires,'700001'])).rows[0].data.status,'pending','Binding an approved API response does not grant access before verified apply');
  equal((await as(paidUser,'select public.has_active_business_subscription() as active')).rows[0].active,false,'Bound transaction alone leaves paid access disabled');
  const args=[first.checkout_id,'910001','approved',now,now,expires,'700001',1499,'BRL'];
  await billingReject(applySql,args.with(7,1498));
  await billingReject(applySql,args.with(8,'USD'));
  await billingReject(applySql,args.with(6,'700002'));
  await billingReject(applySql,args.with(1,'910002'));
  await billingReject(applySql,args.with(3,null));
  await rejects(paidUser,applySql,args,['42501'],'Customer cannot forge an approved payment');
  const paid=(await billing(applySql,args)).rows[0].data;
  equal(paid.status,'approved','Verified approval is persisted');
  equal(new Date(paid.subscription_expires_at).getTime(),now.getTime()+30*86400000,'First entitlement starts at actual payment time');
  equal((await as(paidUser,'select public.has_active_business_subscription() as active')).rows[0].active,true,'Verified payment activates paid access');
  const exportData=(await as(paidUser,'select public.export_my_data() as data')).rows[0].data;
  equal(exportData.payment_history.map(p=>p.payment_id),['910001'],'Own export includes the actual financial ledger');
  equal((await as(ids.alice,'select public.export_my_data() as data')).rows[0].data.payment_history,[],'A different user cannot export another financial ledger');
  check(!Object.keys(exportData.payment_history[0]).some(key=>/merchant|secret|qr/.test(key)),'Financial export excludes merchant secrets and Pix payloads');
  equal((await billing(applySql,args)).rows[0].data.subscription_expires_at,paid.subscription_expires_at,'Same payment replay never adds another billing period');
  equal((await billing(claimSql,[paidUser])).rows[0].data.status,'active','Active subscriber is not charged a duplicate checkout');
  const later=new Date(now.getTime()+1000);
  equal((await billing(applySql,args.with(2,'pending').with(3,null).with(4,later))).rows[0].data.status,'approved','Later pending update cannot downgrade an approved payment');
  equal((await billing(applySql,args.with(2,'refunded').with(3,null).with(4,new Date(now.getTime()-1000)))).rows[0].data.status,'approved','Older refund event cannot override newer authoritative state');
  const paidBusiness=(await as(paidUser,"insert into public.businesses(owner_id,slug,name) values ($1,'paid-fixture-company','Empresa paga') returning id",[paidUser])).rows[0].id;
  equal((await billing('select public.get_pix_checkout($1) as data',[first.checkout_id])).rows[0].data.business_id,paidBusiness,'Payment made before company creation links to immutable company owner');
  await rejects(paidUser,'delete from public.businesses where id=$1',[paidBusiness],['23503'],'Financial company reference cannot be silently deleted');
  try {await admin.query('delete from auth.users where id=$1',[paidUser]);throw new Error('Financial user should remain referenced');}
  catch(error) {equal(error.code,'23503','Paid account removal requires deliberate financial retention/anonymization');}

  // Exercise out-of-order physical payment dates and concurrent retries. A
  // privileged fixture inserts the second intent because the live UI prevents
  // charging active users. Both are legitimate distinct transactions in SQL.
  const secondId='50000000-0000-4000-8000-000000000002';
  const earlierPaid=new Date(now.getTime()-86400000);
  await admin.query(`insert into nuvemmeet_private.billing_payment_intents(id,user_id,business_id,created_at)
    values ($1,$2,$3,$4)`,[secondId,paidUser,paidBusiness,new Date(now.getTime()-2*86400000)]);
  const secondArgs=[secondId,'910003','approved',earlierPaid,later,expires,'700001',1499,'BRL'];
  const paymentRacers=[new Client({connectionString}),new Client({connectionString})];
  await Promise.all(paymentRacers.map(c=>c.connect()));let paymentResults;
  try {paymentResults=await Promise.all(paymentRacers.map(c=>billing(applySql,secondArgs,c)));}
  finally {await Promise.all(paymentRacers.map(c=>c.end()));}
  equal(paymentResults[0].rows[0].data.subscription_expires_at,paymentResults[1].rows[0].data.subscription_expires_at,'Concurrent same-ID webhooks converge to one expiry');
  equal(new Date(paymentResults[0].rows[0].data.subscription_expires_at).getTime(),earlierPaid.getTime()+60*86400000,'Out-of-order distinct payments are recomputed by physical payment date');
  equal((await billing(applySql,secondArgs)).rows[0].data.subscription_expires_at,paymentResults[0].rows[0].data.subscription_expires_at,'Repeated renewal webhook is idempotent');
  const refunded=(await billing(applySql,secondArgs.with(2,'refunded').with(3,null).with(4,new Date(now.getTime()+2000)))).rows[0].data;
  equal(new Date(refunded.subscription_expires_at).getTime(),now.getTime()+30*86400000,'Refund removes only that transaction contribution and preserves other paid access');
  equal((await billing(applySql,secondArgs.with(4,new Date(now.getTime()+3000)))).rows[0].data.status,'refunded','Refunded payment cannot regain access through a newer approval replay');
  const chargeback=(await billing(applySql,args.with(2,'charged_back').with(3,null).with(4,new Date(now.getTime()+4000)))).rows[0].data;
  equal(chargeback.subscription_expires_at,null,'Last approved payment chargeback revokes its entitlement');
  equal((await as(paidUser,'select public.has_active_business_subscription() as active')).rows[0].active,false,'Chargeback suspends the paid company');
  equal((await billing(applySql,args.with(4,new Date(now.getTime()+5000)))).rows[0].data.status,'charged_back','Charged-back payment never reactivates from approval replay');

  const oldUser='40000000-0000-4000-8000-000000000002';
  await admin.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[oldUser,'late-payment-fixture@example.test',{display_name:'Pagamento antigo'}]);
  const old=(await billing(claimSql,[oldUser])).rows[0].data;
  const oldDate=new Date(now.getTime()-40*86400000);
  await admin.query('update nuvemmeet_private.billing_payment_intents set created_at=$1 where id=$2',[oldDate,old.checkout_id]);
  const oldPaid=(await billing(applySql,[old.checkout_id,'910004','approved',oldDate,now,expires,'700001',1499,'BRL'])).rows[0].data;
  equal(new Date(oldPaid.subscription_expires_at).getTime(),oldDate.getTime()+30*86400000,'Delayed old approval does not start a new period at webhook receipt');
  equal((await as(oldUser,'select public.has_active_business_subscription() as active')).rows[0].active,false,'Already expired physical payment remains inactive');

  // Expiry changes availability and configuration, while customer records and
  // cancellation/fulfilment RPCs keep their established authorization.
  await admin.query("update public.business_subscriptions set current_period_end=now()-interval '1 second' where user_id=$1",[ids.hostA]);
  equal((await as(ids.hostA,'select * from public.businesses')).rowCount,0,'Expired company panel cannot read its private company table');
  check(!(await as(null,'select id from public.business_catalog')).rows.some(r=>r.id===businesses.A),'Expired company is hidden from public catalogue');
  equal((await as(null,'select * from public.services where business_id=$1',[businesses.A])).rowCount,0,'Expired company services are not exposed for new reservations');
  equal((await as(null,'select * from public.business_hours where business_id=$1',[businesses.A])).rowCount,0,'Expired company availability configuration is hidden');
  equal((await as(null,'select * from public.available_slots($1,$2,$3)',[businesses.A,services.A,dates.tomorrow_date])).rowCount,0,'Expired company offers no bookable slots');
  await rejects(ids.hostA,"insert into public.services(business_id,name,duration_minutes,price_cents) values ($1,'Blocked',30,1)",[businesses.A],['42501'],'Expired subscriber cannot write service configuration');
  await rejects(ids.hostA,"select public.save_business_hours('[]'::jsonb)",[],['42501'],'Expired subscriber cannot clear hours through SECURITY DEFINER RPC');
  await rejects(ids.bob,'select * from public.book_appointment($1,$2,$3)',[businesses.A,services.A,new Date(dates.tomorrow.getTime()+420*60000)],['42501'],'Expired company rejects booking at the database layer');
  check((await as(ids.hostA,'select id from public.appointments where business_id=$1',[businesses.A])).rowCount>0,'Expired host retains authorized appointment history');
  const remaining=(await as(ids.alice,"select id from public.appointments where business_id=$1 and status in ('pending','confirmed') and starts_at>now() limit 1",[businesses.A])).rows[0];
  if(remaining) equal((await as(ids.alice,"select * from public.update_appointment($1,'cancel')",[remaining.id])).rows[0].status,'cancelled','Customer can cancel an existing booking after subscription expiry');
  await rejects(ids.hostA,"select public.business_analytics('7d')",[],['42501'],'Expired subscriber cannot access paid analytics');
  await admin.query("update public.business_subscriptions set current_period_end=now()+interval '30 days' where user_id=$1",[ids.hostA]);

  // Dedicated analytics fixtures have no provider traffic and no mocked UI
  // totals: SQL computes directly from every real appointment row below.
  await admin.query("update public.business_subscriptions set status='active',current_period_end=now()+interval '30 days' where user_id=$1",[paidUser]);
  const paidService=(await as(paidUser,"insert into public.services(business_id,name,duration_minutes,price_cents) values ($1,'Consulta real',30,1499) returning id",[paidBusiness])).rows[0].id;
  async function analyticRow(relativeDate,time,status,customer=ids.alice) {
    return admin.query(`insert into public.appointments(business_id,service_id,customer_id,customer_name,service_name,starts_at,ends_at,price_cents,status)
      select $1,$2,$3,'Cliente teste','Consulta real',at,at+interval '30 minutes',1499,$4
      from (select (((now() at time zone 'America/Sao_Paulo')::date+$5::integer)+$6::time) at time zone 'America/Sao_Paulo' as at) x`,[paidBusiness,paidService,customer,status,relativeDate,time]);
  }
  await analyticRow(-6,'00:00','completed');
  await analyticRow(-7,'23:45','completed');
  await analyticRow(-1,'23:30','completed');
  await analyticRow(-2,'12:00','confirmed');
  await analyticRow(-2,'13:00','cancelled');
  await analyticRow(1,'09:00','pending');
  await analyticRow(2,'09:00','confirmed');
  await analyticRow(3,'09:00','cancelled');
  await admin.query(`insert into public.appointments(business_id,service_id,customer_id,customer_name,service_name,starts_at,ends_at,price_cents,status)
    select $1,$2,$3,'Cliente teste','Consulta real',at,at+interval '30 minutes',1499,'completed'
    from generate_series(1,250) n cross join lateral (select (((now() at time zone 'America/Sao_Paulo')::date-3)+time '10:00') at time zone 'America/Sao_Paulo' as at) x`,[paidBusiness,paidService,ids.alice]);
  const seven=(await as(paidUser,"select public.business_analytics('7d') as data")).rows[0].data;
  equal(seven.days.length,7,'Seven-day analytics includes every civil day with legitimate zero-count days');
  equal(seven.totals,{appointments:254,completed:252,cancelled:1,future:2},'Analytics counts all database rows, excludes confirmed from completed and includes future outside the selected range');
  equal(seven.days.reduce((n,d)=>n+d.completed,0),252,'Chart daily completed totals match real status counts above the UI list limit');
  equal(seven.days.find(d=>d.date===seven.ends_on).appointments,0,'Missing appointment days are zeroes generated by SQL');
  const timezoneDay=(await admin.query("select ((now() at time zone 'America/Sao_Paulo')::date-1)::text as day")).rows[0].day;
  equal(seven.days.find(d=>d.date===timezoneDay).completed,1,'Appointment near UTC midnight belongs to its Sao Paulo civil day');
  const thirty=(await as(paidUser,"select public.business_analytics('30d') as data")).rows[0].data;
  equal(thirty.days.length,30,'Thirty-day analytics spans 30 civil dates');
  equal(thirty.totals.completed,253,'Expanded range includes the previous boundary appointment');
  for(const [range,interval] of [['3m','3 months'],['1y','1 year']]) {
    const data=(await as(paidUser,'select public.business_analytics($1) as data',[range])).rows[0].data;
    const expected=(await admin.query(`select (((now() at time zone 'America/Sao_Paulo')::date+1)-$1::interval)::date::text as starts`,[interval])).rows[0].starts;
    equal(data.starts_on,expected,`${range} uses civil calendar months/years rather than arbitrary fixed-day approximations`);
    equal(data.totals.completed,253,`${range} derives actual completed status from database history`);
  }
  await rejects(null,"select public.business_analytics('7d')",[],['42501'],'Anonymous analytics access denied');
  await rejects(ids.alice,"select public.business_analytics('7d')",[],['42501'],'Unpaid customer cannot inspect a company dashboard');
  await rejects(paidUser,"select public.business_analytics('bad-range')",[],['22023'],'Analytics period is restricted to allowed filters');
  await rejects(paidUser,'select public.business_analytics($1,$2)',['7d',businesses.A],['42883'],'Analytics cannot be redirected to another business UUID');
  const other=(await as(ids.hostB,"select public.business_analytics('7d') as data")).rows[0].data;
  check(other.totals.completed<253,'Another owner dashboard cannot aggregate this company appointments');
};
