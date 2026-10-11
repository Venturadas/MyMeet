/* Real PostgreSQL integration tests. NEVER point this at a Supabase project.
 * Only an empty local disposable database named mymeet_security_* is accepted.
 * Run: npm ci && npm test; or PG_BIN=/path/to/bin npm test.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Use run-local.sh or an empty disposable DATABASE_URL.');
const url = new URL(connectionString);
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^mymeet_security_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error('Refusing database: only localhost and mymeet_security_* disposable databases are allowed.');
}

const admin = new Client({ connectionString });
const ids = {
  hostA: '10000000-0000-4000-8000-000000000001',
  hostB: '10000000-0000-4000-8000-000000000002',
  alice: '10000000-0000-4000-8000-000000000003',
  bob: '10000000-0000-4000-8000-000000000004',
};
let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }

async function as(user, sql, params = [], client = admin) {
  await client.query('begin');
  try {
    await client.query(user ? 'set local role authenticated' : 'set local role anon');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user || '']);
    const result = await client.query(sql, params);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function rejects(user, sql, params, codes = ['42501'], message = 'Operation must fail') {
  try { await as(user, sql, params); }
  catch (error) { check(codes.includes(error.code), `${message}: expected ${codes}, received ${error.code}: ${error.message}`); return; }
  throw new Error(message);
}

async function appointment(user, business, service, at) {
  return (await as(user, 'select * from public.book_appointment($1,$2,$3)', [business, service, at])).rows[0];
}
async function action(user, id, operation, at = null, comment = null) {
  return (await as(user, 'select * from public.update_appointment($1,$2,$3,$4)', [id, operation, at, comment])).rows[0];
}
function plusMinutes(date, minutes) { return new Date(date.getTime() + minutes * 60000); }

async function main() {
  await admin.connect();
  const state = (await admin.query(`select current_database() as db,
    (select count(*)::int from pg_catalog.pg_tables where schemaname in ('public','auth')) as tables,
    (select rolsuper from pg_catalog.pg_roles where rolname=current_user) as superuser`)).rows[0];
  equal(state.db, databaseName, 'Database identity must match disposable URL');
  equal(state.tables, 0, 'Refusing a database with application/auth tables');
  check(state.superuser, 'Fixture needs a local test superuser to emulate Supabase roles');
  await admin.query(`
    do $$ begin
      if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  check((await admin.query("select count(*)::int as count from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)")).rows[0].count === 0, 'Test roles cannot bypass RLS');
  const existingUsers = ['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
  await admin.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3),($4,$5,$6)',
    [existingUsers[0],'existing@example.test',{display_name:'  Cliente Existente  '},existingUsers[1],'fallback@example.test',{display_name:' '}]);
  await admin.query(readFileSync(path.join(__dirname, '../migrations/202610110001_mymeet.sql'), 'utf8'));
  equal((await as(existingUsers[0],'select display_name from public.profiles')).rows[0].display_name,'Cliente Existente','Migration backfills existing auth accounts');
  equal((await as(existingUsers[1],'select display_name from public.profiles')).rows[0].display_name,'Cliente','Existing empty display name uses safe fallback');
  for (const [key, id] of Object.entries(ids)) {
    await admin.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [id, `${key.toLowerCase()}@example.test`, { display_name: { hostA: 'Empresa A', hostB: 'Empresa B', alice: 'Alice Cliente', bob: 'Bob Cliente' }[key] }]);
  }

  const businesses = {};
  for (const name of ['A','B']) {
    businesses[name] = (await as(ids[`host${name}`], `insert into public.businesses(owner_id,slug,name)
      values ($1,$2,$3) returning id`, [ids[`host${name}`], `empresa-${name.toLowerCase()}`, `Empresa ${name}`])).rows[0].id;
  }
  await rejects(ids.alice, 'insert into public.businesses(owner_id,slug,name) values ($1,$2,$3)', [ids.hostA, 'forged-business', 'Empresa falsa'], ['42501'], 'Cannot create a business for someone else');
  await rejects(ids.hostA, 'insert into public.businesses(owner_id,slug,name) values ($1,$2,$3)', [ids.hostA, 'duplicate-business', 'Empresa repetida'], ['23505'], 'MVP must enforce one company per owner');
  equal((await as(ids.hostA, 'select id from public.businesses')).rows.map(row => row.id), [businesses.A], 'Host reads only its own private company');
  equal((await as(ids.alice, 'select * from public.businesses')).rowCount, 0, 'Customer cannot inspect private business records');
  equal((await as(ids.hostA, 'update public.businesses set name=$1 where id=$2 returning id', ['Intrusão', businesses.B])).rowCount, 0, 'Host cannot alter another business');
  await rejects(ids.hostA, 'update public.businesses set owner_id=$1 where id=$2', [ids.hostB, businesses.A], ['42501'], 'Owner transfer column is not writable');
  await rejects(ids.hostA, 'update public.businesses set timezone=$1 where id=$2', ['Invalid/MyMeet', businesses.A], ['22023'], 'Invalid timezone rejected');
  const catalog = await as(null, 'select * from public.business_catalog order by slug');
  equal(catalog.rowCount, 2, 'Anonymous users can find public companies');
  check(!catalog.fields.some(field => field.name === 'owner_id'), 'Public catalogue never exposes owner UUID');
  await rejects(null, 'select owner_id from public.business_catalog', [], ['42703'], 'Owner UUID is absent from public catalogue');
  await rejects(null, 'select * from public.businesses', [], ['42501'], 'Anonymous users cannot read private business table');

  const services = {};
  for (const name of ['A','B']) {
    services[name] = (await as(ids[`host${name}`], `insert into public.services(business_id,name,duration_minutes,price_cents)
      values ($1,$2,30,8500) returning id`, [businesses[name], `Serviço ${name}`])).rows[0].id;
    for (let day = 0; day < 7; day++) {
      await as(ids[`host${name}`], "insert into public.business_hours(business_id,weekday,start_time,end_time) values ($1,$2,'09:00','17:00')", [businesses[name], day]);
    }
  }
  await rejects(ids.hostA, "insert into public.services(business_id,name,duration_minutes,price_cents) values ($1,'Invasão',30,1)", [businesses.B], ['42501'], 'Host cannot create services for another company');
  equal((await as(ids.hostA, "update public.services set name='Invadido' where id=$1 returning id", [services.B])).rowCount, 0, 'Host cannot edit foreign service');
  equal((await as(ids.hostA, 'delete from public.services where id=$1 returning id', [services.B])).rowCount, 0, 'Host cannot delete foreign service');
  await rejects(ids.hostA, "insert into public.business_hours(business_id,weekday,start_time,end_time) values ($1,0,'07:00','08:00')", [businesses.B], ['42501'], 'Host cannot insert foreign hours');
  equal((await as(ids.hostA, "update public.business_hours set start_time='07:00' where business_id=$1 returning business_id", [businesses.B])).rowCount, 0, 'Host cannot edit foreign hours');
  equal((await as(ids.hostA, 'delete from public.business_hours where business_id=$1 returning business_id', [businesses.B])).rowCount, 0, 'Host cannot delete foreign hours');
  const hoursKey = (await admin.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.business_hours'::regclass and contype='p'")).rows[0].definition;
  equal(hoursKey, 'PRIMARY KEY (business_id, weekday)', 'Hours use the composite key expected by application upsert');
  equal((await as(ids.hostA, `insert into public.business_hours(business_id,weekday,start_time,end_time) values ($1,1,'09:00','17:00')
    on conflict (business_id,weekday) do update set business_id=excluded.business_id,weekday=excluded.weekday,start_time=excluded.start_time,end_time=excluded.end_time returning weekday`, [businesses.A])).rowCount, 1, 'Hours upsert works with all supplied application fields');
  await rejects(ids.hostA, `insert into public.business_hours(business_id,weekday,start_time,end_time) values ($1,1,'09:00','17:00')
    on conflict (business_id,weekday) do update set business_id=excluded.business_id,weekday=excluded.weekday,start_time=excluded.start_time,end_time=excluded.end_time`, [businesses.B], ['42501'], 'Hours upsert cannot update foreign business');
  await rejects(ids.hostA, 'update public.business_hours set business_id=$1 where business_id=$2 and weekday=1', [businesses.B,businesses.A], ['42501'], 'Hours cannot be transferred to another business');

  equal((await as(ids.alice, 'select id from public.profiles')).rows.map(row => row.id), [ids.alice], 'Customer sees only own profile');
  equal((await as(ids.hostA, 'select id from public.profiles')).rows.map(row => row.id), [ids.hostA], 'Host cannot inspect customer profiles');
  await rejects(null, 'select * from public.profiles', [], ['42501'], 'Anonymous profile access denied');
  equal((await as(ids.bob, "update public.profiles set display_name='Invadido' where id=$1 returning id", [ids.alice])).rowCount, 0, 'Cross-customer profile writes denied by RLS');
  await rejects(ids.alice, 'update public.profiles set id=$1 where id=$2', [ids.bob, ids.alice], ['42501'], 'Customer cannot change profile identity');

  const dates = (await admin.query(`select
    ((now() at time zone 'America/Sao_Paulo')::date + 1 + time '09:00') at time zone 'America/Sao_Paulo' as tomorrow,
    ((now() at time zone 'America/Sao_Paulo')::date + 1)::text as tomorrow_date,
    ((now() at time zone 'America/Sao_Paulo')::date - 1)::text as yesterday_date,
    ((now() at time zone 'America/Sao_Paulo')::date + 91)::text as distant_date`)).rows[0];
  const at = dates.tomorrow;
  equal((await as(null, 'select * from public.available_slots($1,$2,$3)', [businesses.A, services.A, dates.tomorrow_date])).rowCount, 31, 'Availability exposes 15-minute starts within opening hours');
  equal((await as(null, 'select * from public.available_slots($1,$2,$3)', [businesses.A, services.A, dates.yesterday_date])).rowCount, 0, 'Past availability hidden');
  equal((await as(null, 'select * from public.available_slots($1,$2,$3)', [businesses.A, services.A, dates.distant_date])).rowCount, 0, 'Availability beyond 90 days hidden');
  await rejects(null, 'select * from public.available_slots($1,$2,$3)', [businesses.A, services.B, dates.tomorrow_date], ['22023'], 'Service must belong to requested company');
  await rejects(null, 'select * from public.book_appointment($1,$2,$3)', [businesses.A, services.A, at], ['42501'], 'Booking requires authentication');
  await rejects(ids.alice, 'select public._validated_end($1,$2,$3)', [businesses.A, services.A, at], ['42501'], 'Private validation helper is not callable');
  await rejects(ids.alice, 'select * from public.book_appointment($1,$2,$3)', [businesses.A, services.B, at], ['22023'], 'Booking rejects cross-company service');
  for (const invalid of [null, new Date(Date.now() - 60000), new Date(Date.now() + 91 * 86400000), plusMinutes(at, -15), plusMinutes(at, 465), plusMinutes(at, 7), plusMinutes(at, 0.01)]) {
    await rejects(ids.alice, 'select * from public.book_appointment($1,$2,$3)', [businesses.A, services.A, invalid], ['22023'], 'Invalid, past, distant, closed-hours, or unaligned starts rejected');
  }
  await rejects(ids.alice, `insert into public.appointments(business_id,service_id,customer_id,customer_name,service_name,starts_at,ends_at,price_cents)
    values ($1,$2,$3,'Fraude','Fraude',$4,$5,1)`, [businesses.A, services.A, ids.bob, at, plusMinutes(at,30)], ['42501'], 'Direct appointment insert cannot spoof identity or price');
  await rejects(ids.alice, 'select * from public.book_appointment($1,$2,$3,$4,$5)', [businesses.A, services.A, at, 'Fraude', 1], ['42883'], 'Booking RPC does not accept caller-supplied name or price');
  const aliceBooking = await appointment(ids.alice, businesses.A, services.A, at);
  equal(aliceBooking.customer_id, ids.alice, 'Booking identity comes from authenticated session');
  equal(aliceBooking.customer_name, 'Alice Cliente', 'Booking name comes from own profile');
  equal(aliceBooking.service_name, 'Serviço A', 'Booking service name comes from service snapshot');
  equal(aliceBooking.price_cents, 8500, 'Booking price comes from current service');
  equal(aliceBooking.ends_at.getTime() - aliceBooking.starts_at.getTime(), 30 * 60000, 'Duration comes from service configuration');
  await rejects(ids.bob, 'select * from public.book_appointment($1,$2,$3)', [businesses.A, services.A, plusMinutes(at,15)], ['23P01'], 'Partly overlapping interval is rejected');
  const adjacentBooking = await appointment(ids.bob, businesses.A, services.A, plusMinutes(at,30));
  equal(adjacentBooking.status, 'pending', 'Adjacent interval does not overlap');
  const foreignBooking = await appointment(ids.bob, businesses.B, services.B, at);
  equal((await as(ids.alice, 'select id from public.appointments')).rows.map(row => row.id), [aliceBooking.id], 'Customer sees only own appointments');
  equal((await as(ids.hostA, 'select id from public.appointments order by starts_at')).rows.map(row => row.id), [aliceBooking.id, adjacentBooking.id], 'Host sees only appointments in own company');
  await rejects(null, 'select * from public.appointments', [], ['42501'], 'Anonymous appointment table access denied');
  await rejects(ids.alice, 'update public.appointments set price_cents=1 where id=$1', [aliceBooking.id], ['42501'], 'Direct appointment update denied');
  await rejects(ids.alice, 'delete from public.appointments where id=$1', [aliceBooking.id], ['42501'], 'Direct appointment delete denied');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [foreignBooking.id, 'cancel'], ['42501'], 'Cross-host appointment change denied');
  await rejects(ids.bob, 'select * from public.update_appointment($1,$2)', [aliceBooking.id, 'cancel'], ['42501'], 'Cross-customer appointment change denied');
  const freeSlots = await as(null, 'select * from public.available_slots($1,$2,$3)', [businesses.A, services.A, dates.tomorrow_date]);
  check(freeSlots.rows.every(row => row.starts_at.getTime() >= plusMinutes(at,60).getTime()), 'Availability removes all starts overlapping reservations');

  // Two genuine independent connections race for the same interval.
  const racers = [new Client({ connectionString }), new Client({ connectionString })];
  await Promise.all(racers.map(client => client.connect()));
  let results;
  try {
    results = await Promise.allSettled(racers.map((client,index) => as(index ? ids.bob : ids.alice,
      'select * from public.book_appointment($1,$2,$3)', [businesses.A, services.A, plusMinutes(at,120)], client)));
  } finally { await Promise.all(racers.map(client => client.end())); }
  equal(results.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent booking has exactly one winner');
  equal(results.filter(result => result.status === 'rejected').map(result => result.reason.code), ['23P01'], 'Concurrent loser receives exclusion violation');

  await as(ids.hostA, "update public.services set name='Novo serviço',price_cents=9900 where id=$1", [services.A]);
  await as(ids.alice, "update public.profiles set display_name='Alice Atualizada' where id=$1", [ids.alice]);
  const snapshot = (await as(ids.hostA, 'select * from public.appointments where id=$1', [aliceBooking.id])).rows[0];
  equal([snapshot.price_cents,snapshot.service_name,snapshot.customer_name], [8500,'Serviço A','Alice Cliente'], 'Existing appointment preserves snapshots after catalogue/profile edits');
  const updated = await appointment(ids.alice, businesses.A, services.A, plusMinutes(at,180));
  equal([updated.price_cents,updated.service_name,updated.customer_name], [9900,'Novo serviço','Alice Atualizada'], 'New booking captures current trusted values');
  await as(ids.hostB, 'update public.services set active=false where id=$1', [services.B]);
  check(!(await as(null, 'select id from public.services')).rows.some(row => row.id === services.B), 'Inactive services hidden from public');
  check((await as(ids.hostB, 'select id from public.services')).rows.some(row => row.id === services.B), 'Owner can inspect inactive own service');
  await rejects(ids.bob, 'select * from public.book_appointment($1,$2,$3)', [businesses.B, services.B, plusMinutes(at,60)], ['22023'], 'Inactive service cannot be booked');

  for (const forbidden of ['confirm','complete','comment']) {
    await rejects(ids.alice, 'select * from public.update_appointment($1,$2,$3,$4)', [aliceBooking.id,forbidden,null,'texto'], ['42501'], 'Customer is restricted to cancel/reschedule');
  }
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [aliceBooking.id,'unknown'], ['22023'], 'Unknown appointment action rejected');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2,$3,$4)', [aliceBooking.id,'comment',null,'x'.repeat(2001)], ['22023'], 'Oversized appointment comment rejected');
  equal((await action(ids.hostA,aliceBooking.id,'comment',null,'Cliente solicitou atenção.')).comment, 'Cliente solicitou atenção.', 'Host can comment on its appointment');
  equal((await action(ids.hostA,aliceBooking.id,'confirm')).status, 'confirmed', 'Host can confirm');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [aliceBooking.id,'confirm'], ['22023'], 'Duplicate confirmation rejected');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [aliceBooking.id,'complete'], ['22023'], 'Future service cannot be completed');
  const customerMoved = await action(ids.alice,aliceBooking.id,'reschedule',plusMinutes(at,240));
  equal(customerMoved.starts_at.getTime(), plusMinutes(at,240).getTime(), 'Customer can reschedule own appointment');
  equal(customerMoved.status,'pending','Reschedule requires fresh host confirmation');
  equal((await action(ids.hostA,aliceBooking.id,'reschedule',plusMinutes(at,270))).starts_at.getTime(), plusMinutes(at,270).getTime(), 'Host can reschedule');
  await rejects(ids.alice, 'select * from public.update_appointment($1,$2,$3)', [aliceBooking.id,'reschedule',plusMinutes(at,120)], ['23P01'], 'Reschedule cannot take another reserved interval');
  equal((await action(ids.alice,aliceBooking.id,'cancel')).status,'cancelled','Customer can cancel own future appointment');
  await rejects(ids.alice, 'select * from public.update_appointment($1,$2,$3)', [aliceBooking.id,'reschedule',plusMinutes(at,300)], ['22023'], 'Customer cannot reopen cancelled appointment');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [aliceBooking.id,'confirm'], ['22023'], 'Host cannot reopen cancelled appointment');
  equal((await action(ids.hostA,adjacentBooking.id,'cancel')).status,'cancelled','Host can cancel company booking');

  // Only the fixture administrator can create already-ended records to test transitions.
  const past = (await admin.query(`insert into public.appointments(business_id,service_id,customer_id,customer_name,service_name,starts_at,ends_at,price_cents,status)
    values ($1,$2,$3,'Alice Cliente','Serviço A',now()-interval '2 hours',now()-interval '90 minutes',8500,'confirmed') returning id`, [businesses.A,services.A,ids.alice])).rows[0].id;
  await rejects(ids.alice, 'select * from public.update_appointment($1,$2)', [past,'cancel'], ['22023'], 'Customer cannot cancel a service that started');
  equal((await action(ids.hostA,past,'complete')).status,'completed','Host can complete a confirmed ended service');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2,$3)', [past,'reschedule',plusMinutes(at,330)], ['22023'], 'Completed appointments cannot reopen');
  await rejects(ids.hostA, 'select * from public.update_appointment($1,$2)', [past,'cancel'], ['22023'], 'Completed appointments cannot cancel');
  await rejects(null, 'select public.get_my_spending()', [], ['42501'], 'Spending requires authentication');
  equal((await as(ids.alice,'select public.get_my_spending() as total')).rows[0].total,'8500','Spending sums only own completed services');
  equal((await as(ids.bob,'select public.get_my_spending() as total')).rows[0].total,'0','Spending excludes others, pending, and cancelled appointments');
  equal((await as(ids.hostA,'select public.get_my_spending() as total')).rows[0].total,'0','Host spending cannot aggregate customer expenditure');
  await rejects(ids.hostA,'delete from public.services where id=$1',[services.A],['23503'],'Service with history cannot be deleted');
  await rejects(ids.hostA,'delete from public.businesses where id=$1',[businesses.A],['23503'],'Business with booking history cannot be deleted');

  await rejects(null, 'select public.request_data_erasure()', [], ['42501'], 'Erasure requires authentication');
  const request1 = (await as(ids.alice, 'select public.request_data_erasure() as id')).rows[0].id;
  equal((await as(ids.alice,'select public.request_data_erasure() as id')).rows[0].id,request1,'Erasure request is idempotent');
  const request2 = (await as(ids.bob,'select public.request_data_erasure() as id')).rows[0].id;
  check(request1 !== request2,'Each customer gets its own erasure request');
  equal((await as(ids.alice,'select id from public.privacy_requests')).rows.map(row=>row.id),[request1],'Erasure requests isolated by customer');
  equal((await as(ids.hostA,'select * from public.privacy_requests')).rowCount,0,'Host cannot inspect customer privacy requests');
  await rejects(ids.alice,'insert into public.privacy_requests(user_id) values ($1)',[ids.bob],['42501'],'Customer cannot directly submit erasure for someone else');
  await rejects(null,'select public.export_my_data()',[],['42501'],'Data export requires authentication');
  const exported = (await as(ids.alice,'select public.export_my_data() as data')).rows[0].data;
  equal(exported.profile.id,ids.alice,'Export contains only own profile');
  equal(exported.email,'alice@example.test','Export contains only own authentication email');
  check(exported.appointments.length >= 3,'Export includes own historical appointments');
  check(exported.appointments.every(item=>item.customer_id===ids.alice),'Export excludes other customers appointments');
  equal(exported.privacy_requests.map(item=>item.user_id),[ids.alice],'Export excludes other privacy requests');
  equal((await as(ids.hostA,'select public.export_my_data() as data')).rows[0].data.appointments,[],'Host personal export cannot extract company customer records');

  const cappedUser = '30000000-0000-4000-8000-000000000001';
  await admin.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[cappedUser,'limited@example.test',{display_name:'Cliente Limite'}]);
  await as(ids.hostB, 'update public.services set active=true where id=$1', [services.B]);
  const cappedBookings = [];
  for (let day=1;day<=9;day++) cappedBookings.push(await appointment(cappedUser,businesses.A,services.A,plusMinutes(at,day*1440)));
  const capRacers = [new Client({connectionString}),new Client({connectionString})];
  await Promise.all(capRacers.map(client=>client.connect()));
  let capResults;
  try {
    capResults = await Promise.allSettled(capRacers.map((client,index)=>as(cappedUser,
      'select * from public.book_appointment($1,$2,$3)',[businesses[index?'B':'A'],services[index?'B':'A'],plusMinutes(at,10*1440)],client)));
  } finally { await Promise.all(capRacers.map(client=>client.end())); }
  equal(capResults.filter(result=>result.status==='fulfilled').length,1,'Two concurrent cross-business requests cannot exceed global customer cap');
  equal(capResults.filter(result=>result.status==='rejected').map(result=>result.reason.code),['22023'],'Customer cap returns a controlled validation error');
  equal((await as(cappedUser,'select count(*)::int as total from public.appointments')).rows[0].total,10,'Customer has exactly ten future active reservations');
  await rejects(cappedUser,'select * from public.book_appointment($1,$2,$3)',[businesses.B,services.B,plusMinutes(at,11*1440)],['22023'],'Eleventh active future reservation is denied');
  await action(cappedUser,cappedBookings[0].id,'cancel');
  equal((await appointment(cappedUser,businesses.B,services.B,plusMinutes(at,11*1440))).status,'pending','Cancellation releases one position in customer cap');

  const createdAudit = (await admin.query("select actor_id,action from public.audit_events where appointment_id=$1 and action='created'",[aliceBooking.id])).rows;
  equal(createdAudit,[{actor_id:ids.alice,action:'created'}],'Successful booking generates one administrative audit event');
  check((await admin.query("select action from public.audit_events where appointment_id=$1 and action='reschedule'",[aliceBooking.id])).rowCount>=1,'Reschedules produce administrative audit records');
  await rejects(ids.alice,'select * from public.audit_events',[],['42501'],'Customers cannot read administrative audit records');
  await rejects(ids.hostA,'select * from public.audit_events',[],['42501'],'Hosts cannot read administrative audit records');
  await rejects(null,'select * from public.audit_events',[],['42501'],'Anonymous users cannot read audit records');
  await rejects(ids.hostA,"insert into public.audit_events(appointment_id,action) values ($1,'forged')",[aliceBooking.id],['42501'],'Host cannot forge audit events');
  check((await admin.query("select count(*)::int as count from pg_tables where schemaname='public' and not rowsecurity")).rows[0].count===0,'Every application table enables RLS');
  console.log(`PASS: ${assertions} assertions on real PostgreSQL; tenant isolation, trusted snapshots, races, lifecycle, privacy.`);
}

main().catch(error => { console.error(`FAIL: ${error.stack}`); process.exitCode=1; }).finally(()=>admin.end());
