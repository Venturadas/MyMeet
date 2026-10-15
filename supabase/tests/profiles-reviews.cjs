/* Synthetic fixtures run only after security.cjs verifies a disposable localhost database. */
const {randomUUID}=require('node:crypto');
module.exports=async function({admin,as,rejects,check,equal,Client,connectionString,ids,businesses,services}){
 const json=async(u,s,p=[])=>(await as(u,s,p)).rows[0].data;
 const path=u=>`${u}/${randomUUID()}.webp`;
 const upload=(u,b,p)=>as(u,'insert into storage.objects(bucket_id,name) values($1,$2) returning id',[b,p]);
 const remove=(u,b,p)=>as(u,'delete from storage.objects where bucket_id=$1 and name=$2 returning id',[b,p]);
 const race=async(user,sql,parameters)=>{
  const clients=parameters.map(()=>new Client({connectionString}));
  await Promise.all(clients.map(client=>client.connect()));
  try{return await Promise.allSettled(clients.map((client,index)=>as(user,sql,parameters[index],client)));}
  finally{await Promise.all(clients.map(client=>client.end()));}
 };
 equal((await admin.query('select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id')).rows,
 [{id:'company-images',public:true,file_size_limit:'2097152',allowed_mime_types:['image/webp']},{id:'user-avatars',public:false,file_size_limit:'2097152',allowed_mime_types:['image/webp']}],
 'Company marketing is public; avatar private; only WEBP2MiB configured');
 const profileSql='select to_jsonb(public.save_profile($1,$2,$3)) as data';
 const profile=await json(ids.alice,profileSql,['Alice Privada',' ALICE_01 ','+5511999999999']);
 equal([profile.username,profile.phone],['alice_01','+5511999999999'],'Own username canonicalized, phone private');
 await rejects(ids.bob,profileSql,['Bob Privado','alice_01',null],['23505'],'Username uniqueness enforced');
 await rejects(ids.bob,profileSql,['Bob Privado','x',null],['22023'],'Username bounds enforced');
 await rejects(ids.bob,profileSql,['Bob Privado',null,'invalid'],['22023'],'Phone validated in DB');
 await rejects(null,profileSql,['Intruso',null,null],['42501'],'Anonymous profile edit denied');
 await rejects(ids.alice,'update public.profiles set phone=$1 where id=$2',['123456789',ids.alice],['42501'],'Private extended fields only through checkedRPC');
 equal((await as(ids.hostA,'select phone,username,avatar_path from public.profiles where id=$1',[ids.alice])).rowCount,0,'Company has no private profile contact access');
 const identity=await json(ids.alice,'select public.get_my_identity() as data');
 equal([identity.profile.id,identity.email],[ids.alice,'alice@example.test'],'Own identity only');
 await rejects(null,'select public.get_my_identity()',[],['42501'],'Anonymous identity denied');
 await rejects(ids.alice,'select public.get_my_identity($1)',[ids.bob],['42883'],'Identity accepts no arbitraryuser');
 await as(ids.hostA,"update public.businesses set category='Saúde',city='São Paulo',state='SP',address='Rua pública',phone='5511999999999',whatsapp='5511999999999',instagram='empresa_a' where id=$1",[businesses.A]);
 const catalog=await as(null,'select * from public.business_catalog where id=$1',[businesses.A]);
 equal(catalog.rows[0].category,'Saúde','Actual public company profile fields');
 check(!catalog.fields.some(f=>['owner_id','email','username','avatar_path'].includes(f.name)),'No accountidentity inpubliccatalog');
 equal(catalog.rows[0].rating_count,'0','No fictitious ratings');
 await rejects(ids.hostA,'update public.businesses set logo_path=$1 where id=$2',[path(businesses.A),businesses.A],['42501'],'Direct unuploadedlogo assign denied');
 const pro=(await as(ids.hostA,"insert into public.business_professionals(business_id,name,title) values($1,'Profissional A','Especialista') returning id",[businesses.A])).rows[0].id;
 await rejects(ids.hostB,"insert into public.business_professionals(business_id,name) values($1,'Intruso')",[businesses.A],['42501'],'Foreign professional insertion denied');
 equal((await as(ids.hostB,"update public.business_professionals set name='Intruso' where id=$1 returning id",[pro])).rowCount,0,'Foreign professional edits denied');
 await rejects(ids.hostA,'update public.business_professionals set business_id=$1 where id=$2',[businesses.B,pro],['42501'],'Professional cannot transfer tenants');
 equal((await as(null,'select name,title from public.business_professionals_public where business_id=$1',[businesses.A])).rows,[{name:'Profissional A',title:'Especialista'}],'Safe real professional listing');
 await as(ids.hostA,'update public.business_professionals set active=false where id=$1',[pro]);
 equal((await as(null,'select id from public.business_professionals_public where id=$1',[pro])).rowCount,0,'Inactive professional notpublic');
 await as(ids.hostA,'update public.business_professionals set active=true where id=$1',[pro]);
 const items={};
 for(const [key,status,user] of [['completed','completed',ids.alice],['pending','pending',ids.alice],['cancelled','cancelled',ids.alice],['self','completed',ids.hostA]]){
  items[key]=(await admin.query(`insert into public.appointments(business_id,service_id,customer_id,customer_name,service_name,starts_at,ends_at,price_cents,status)
   values($1,$2,$3,'Cliente Público','Serviço real',now()-interval '30 days'+$5::integer*interval '1 hour',now()-interval '30 days'+$5::integer*interval '1 hour'+interval '30 minutes',3500,$4) returning id`,
   [businesses.A,services.A,user,status,Object.keys(items).length])).rows[0].id;
 }
 const reviewSql='select to_jsonb(public.save_review($1,$2,$3)) as data';
 const review=await json(ids.alice,reviewSql,[items.completed,5,'Excelente.']);
 equal([review.reviewer_id,review.business_id,review.reviewer_name],[ids.alice,businesses.A,'alice_01'],'Review identity/company derived, publicalias no fullname');
 equal((await json(ids.alice,reviewSql,[items.completed,4,'Ótimo.'])).id,review.id,'One review per completed appointment');
 await rejects(ids.bob,reviewSql,[items.completed,1,'Forjado'],['42501'],'Foreign bookingcannotreview');
 await rejects(ids.alice,reviewSql,[items.pending,5,'Passado'],['42501'],'Pastpending is not completed');
 await rejects(ids.alice,reviewSql,[items.cancelled,5,'Cancelado'],['42501'],'Cancelled bookingcannotreview');
 await rejects(ids.hostA,reviewSql,[items.self,5,'Minha empresa'],['42501'],'Hostselfreview forbidden');
 await rejects(null,reviewSql,[items.completed,5,'Anon'],['42501'],'Anonymous reviewforbidden');
 for(const [rating,comment] of [[0,''],[6,''],[null,''],[5,'x'.repeat(1001)],[5,null]])await rejects(ids.alice,reviewSql,[items.completed,rating,comment],['22023'],'Ratings/comments DB bounds');
 await rejects(ids.hostA,'update public.reviews set rating=1 where id=$1',[review.id],['42501'],'Company cannot change ratings');
 await rejects(ids.alice,'insert into public.reviews(appointment_id,business_id,reviewer_id,reviewer_name,rating) values($1,$2,$3,$4,5)',[items.pending,businesses.A,ids.alice,'Intruso'],['42501'],'Direct inserts cannot bypass completedrule');
 equal((await as(ids.bob,'select * from public.reviews')).rowCount,0,'Private bookingreferencesownonly');
 const publicReview=await as(null,'select * from public.business_reviews_public where id=$1',[review.id]);
 equal(publicReview.rows[0].rating,4,'Public actualrating');
 check(!publicReview.fields.some(f=>['appointment_id','reviewer_id','customer_id','email','phone'].includes(f.name)),'No booking or auth IDs inpublicreviews');
 equal((await as(null,'select rating_average,rating_count from public.business_catalog where id=$1',[businesses.A])).rows[0],{rating_average:'4.00',rating_count:'1'},'Rating aggregates realrows');
 const ratingSummary=await json(ids.hostA,'select public.business_review_summary() as data');
 equal([ratingSummary.average,ratingSummary.count,ratingSummary.distribution.find(d=>d.rating===4).count],[4,1,1],'Owner ratingdistribution real');
 await rejects(ids.bob,'select public.business_review_summary()',[],['42501'],'Customer cannot read paidreviewanalysis');
 await admin.query("update public.appointments set status='cancelled' where id=$1",[items.completed]);
 equal((await as(null,'select id from public.business_reviews_public where id=$1',[review.id])).rowCount,0,'Noncompleted reviewhidden');
 equal((await as(null,'select rating_count from public.business_catalog where id=$1',[businesses.A])).rows[0].rating_count,'0','No invalid completion contributesaverage');
 await admin.query("update public.appointments set status='completed' where id=$1",[items.completed]);
 await json(ids.alice,'select public.toggle_favorite($1,true) as data',[businesses.A]);await json(ids.alice,'select public.toggle_favorite($1,true) as data',[businesses.A]);
 equal((await as(ids.alice,'select business_id from public.favorites')).rows,[{business_id:businesses.A}],'Favorite idempotent');
 equal((await as(ids.bob,'select * from public.customer_favorites')).rowCount,0,'Favorite viewRLS selfonly');
 equal((await as(ids.alice,'select business_id,name from public.customer_favorites')).rows,[{business_id:businesses.A,name:'Empresa A'}],'Favorite realpubliccompany');
 await rejects(null,'select public.toggle_favorite($1,true)',[businesses.A],['42501'],'Anonymousfavorite denied');
 await rejects(ids.alice,'insert into public.favorites(user_id,business_id) values($1,$2)',[ids.bob,businesses.A],['42501'],'Cannotforge favoriteowner');
 const overview=await json(ids.alice,'select public.customer_overview() as data');
 const expected=(await admin.query(`select count(*) filter(where status='completed')::int completed,coalesce(sum(price_cents) filter(where status='completed'),0)::int spending_cents,
  count(*) filter(where status in('pending','confirmed') and starts_at>=now())::int upcoming from public.appointments where customer_id=$1`,[ids.alice])).rows[0];
 equal({completed:overview.completed,spending_cents:overview.spending_cents,upcoming:overview.upcoming},expected,'Overview matches all ownrows beyond listlimit');
 equal(overview.favorites,1,'Favorite count equalsbookablefavoritelist');
 const clients=await json(ids.hostA,'select public.business_client_summary(26,0) as data');
 check(clients.some(c=>c.completed>0),'Clientsummary from own realbookings');
 check(clients.every(c=>Object.keys(c).sort().join(',')==='appointments,cancelled,client_key,completed,last_visit,name,next_visit'),'Company sees onlybooking snapshots andcounts');
 check(clients.every(c=>c.client_key!==ids.alice&&c.client_key!==ids.bob),'Client keys are scoped, noauthUID');
 equal((await json(ids.hostA,'select public.business_client_summary(1,0) as data')).length,1,'Clientsummary bounded');
 await rejects(ids.hostA,'select public.business_client_summary(101,0)',[],['22023'],'Unbounded reportdenied');
 await rejects(ids.alice,'select public.business_client_summary()',[],['42501'],'Client cannot read companyreport');
 const logo=path(businesses.A),cover=path(businesses.A),other=path(businesses.B),avatar=path(ids.alice);
 await upload(ids.hostA,'company-images',logo);await upload(ids.hostA,'company-images',cover);
 await rejects(ids.hostB,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',path(businesses.A)],['42501'],'Foreign companyupload denied');
 await rejects(ids.alice,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',path(businesses.A)],['42501'],'Customer companyupload denied');
 for(const bad of [`${businesses.A}/x.svg`,`${businesses.A}/../${randomUUID()}.webp`,`${ids.hostA}/${businesses.A}/${randomUUID()}.webp`])await rejects(ids.hostA,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',bad],['42501'],'Invalid path or exposedownerUID forbidden');
 await rejects(null,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',path(businesses.A)],['42501'],'Anonymous uploadsdenied');
 equal((await json(ids.hostA,'select public.attach_company_image($1,$2) as data',['logo',logo])).path,logo,'Attach realown uploadedimage');
 equal((await remove(ids.hostA,'company-images',logo)).rowCount,0,'Referenced imagecannotdelete');
 equal((await as(ids.hostA,'update storage.objects set name=$1 where bucket_id=$2 and name=$3 returning id',[other,'company-images',logo])).rowCount,0,'Renameoverwrite notpermitted');
 await rejects(ids.hostA,'select public.attach_company_image($1,$2)',['cover',path(businesses.A)],['22023'],'Absentimagecannotattach');
 await rejects(ids.hostB,'select public.attach_company_image($1,$2)',['logo',logo],['22023'],'Foreignpathcannotattach');
 equal((await json(ids.hostA,'select public.attach_company_image($1,$2,$3) as data',['professional',cover,pro])).id,pro,'Ownprofessionalphotoattach');
 equal((await json(ids.hostA,'select public.attach_company_image($1,$2) as data',['logo',cover])).previous_path,logo,'Replacement returnsoldobject');
 equal(await json(ids.hostA,'select public.company_media_path_in_use($1) as data',[cover]),true,'Cleanuphelper protectsotherrefs');
 equal((await remove(ids.hostA,'company-images',logo)).rowCount,1,'Unreferencedoldimage deletable');
 equal((await remove(ids.hostA,'company-images',cover)).rowCount,0,'Reusedimagecannotdelete');
 const gallery=[];
 for(let n=0;n<12;n++){const p=path(businesses.A);await upload(ids.hostA,'company-images',p);gallery.push(await json(ids.hostA,'select public.attach_company_image($1,$2) as data',['gallery',p]));}
 const surplus=path(businesses.A);await upload(ids.hostA,'company-images',surplus);
 await rejects(ids.hostA,'select public.attach_company_image($1,$2)',['gallery',surplus],['22023'],'Gallery max12DB enforced');
 await rejects(ids.hostA,'insert into public.business_gallery(business_id,storage_path,position) values($1,$2,0)',[businesses.A,surplus],['42501'],'Directgalleryinsert forbidden');
 const reversed=gallery.map(g=>g.id).reverse();await as(ids.hostA,'select public.reorder_company_gallery($1)',[reversed]);
 equal((await as(null,'select id from public.business_gallery_public where business_id=$1 order by position',[businesses.A])).rows.map(r=>r.id),reversed,'Atomicgalleryreorder');
 await rejects(ids.hostA,'select public.reorder_company_gallery($1)',[[reversed[0],reversed[0]]],['22023'],'Incomplete/duplicate galleryorderinvalid');
 await rejects(ids.hostB,'select public.remove_company_image($1,$2)',['gallery',reversed[0]],['42501'],'Foreigngalleryremovaldenied');
 equal((await json(ids.hostA,'select public.remove_company_image($1,$2) as data',['gallery',reversed[0]])).previous_path,gallery.at(-1).path,'Galleryremovalreturns exactpath');
 equal((await as(null,'select position from public.business_gallery_public where business_id=$1 order by position',[businesses.A])).rows.map(r=>r.position),Array.from({length:11},(_,n)=>n),'Gallerypositionscontinuousafterremove');
 await upload(ids.alice,'user-avatars',avatar);
 await rejects(ids.bob,'insert into storage.objects(bucket_id,name) values($1,$2)',['user-avatars',path(ids.alice)],['42501'],'Crossuseravatarupload denied');
 equal((await as(ids.bob,'select * from storage.objects where bucket_id=$1 and name=$2',['user-avatars',avatar])).rowCount,0,'Avatarobject privateownonly');
 await rejects(null,'select * from storage.objects where bucket_id=$1',['user-avatars'],['42501'],'Anonymousprivateavatardenied');
 await json(ids.alice,'select public.set_avatar($1) as data',[avatar]);
 await rejects(ids.bob,'select public.set_avatar($1)',[avatar],['22023'],'Crossuseravatarattachdenied');
 equal((await remove(ids.alice,'user-avatars',avatar)).rowCount,0,'Currentavatarcannotdelete');
 equal(await json(ids.alice,'select public.set_avatar(null) as data'),avatar,'Avatarremoval returnsownoldpath');
 equal((await remove(ids.alice,'user-avatars',avatar)).rowCount,1,'Oldprivateavatardeletable');
 for(let n=0;n<7;n++)await upload(ids.alice,'user-avatars',path(ids.alice));
 const avatarRace=await race(ids.alice,'insert into storage.objects(bucket_id,name) values($1,$2) returning id',
  Array.from({length:2},()=>['user-avatars',path(ids.alice)]));
 equal(avatarRace.filter(result=>result.status==='fulfilled').length,1,'Concurrent avatar uploads have exactly one remaining quota slot');
 equal(avatarRace.filter(result=>result.status==='rejected').map(result=>result.reason.code),['42501'],'Concurrent avatar quota loser is denied by RLS');
 equal((await admin.query("select count(*)::int n from storage.objects where bucket_id='user-avatars' and name like $1",[`${ids.alice}/%`])).rows[0].n,8,'Concurrent avatar uploads never exceed eight objects');
 await rejects(ids.alice,'insert into storage.objects(bucket_id,name) values($1,$2)',['user-avatars',path(ids.alice)],['42501'],'Avatarorphanquota preventsunlimiteduploads');
 const stored=(await admin.query("select count(*)::int n from storage.objects where bucket_id='company-images' and name like $1",[`${businesses.A}/%`])).rows[0].n;
 for(let n=stored;n<63;n++)await upload(ids.hostA,'company-images',path(businesses.A));
 const companyRace=await race(ids.hostA,'insert into storage.objects(bucket_id,name) values($1,$2) returning id',
  Array.from({length:2},()=>['company-images',path(businesses.A)]));
 equal(companyRace.filter(result=>result.status==='fulfilled').length,1,'Concurrent company uploads have exactly one remaining quota slot');
 equal(companyRace.filter(result=>result.status==='rejected').map(result=>result.reason.code),['42501'],'Concurrent company quota loser is denied by RLS');
 equal((await admin.query("select count(*)::int n from storage.objects where bucket_id='company-images' and name like $1",[`${businesses.A}/%`])).rows[0].n,64,'Concurrent company uploads never exceed sixty-four objects');
 await rejects(ids.hostA,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',path(businesses.A)],['42501'],'Companyorphanquota preventsunlimiteduploads');
 for(let n=1;n<19;n++)await as(ids.hostA,'insert into public.business_professionals(business_id,name) values($1,$2)',[businesses.A,`Profissional ${n}`]);
 const professionalRace=await race(ids.hostA,'insert into public.business_professionals(business_id,name) values($1,$2) returning id',
  Array.from({length:2},(_,index)=>[businesses.A,`Profissional concorrente ${index}`]));
 equal(professionalRace.filter(result=>result.status==='fulfilled').length,1,'Concurrent professional creation has exactly one remaining slot');
 equal(professionalRace.filter(result=>result.status==='rejected').map(result=>result.reason.code),['22023'],'Concurrent professional quota returns controlled validation');
 equal((await as(ids.hostA,'select count(*)::int n from public.business_professionals where business_id=$1',[businesses.A])).rows[0].n,20,'Concurrent professional creation never exceeds twenty records');
 await rejects(ids.hostA,"insert into public.business_professionals(business_id,name) values($1,'Excedente')",[businesses.A],['22023'],'Professionalmax20 enforceddirectly');
 const exported=await json(ids.alice,'select public.export_my_data() as data');
 equal(exported.reviews.map(r=>r.id),[review.id],'Exportownreviews');equal(exported.favorites.map(f=>f.business_id),[businesses.A],'Exportownfavorites');
 check(Array.isArray(exported.payment_history)&&Object.hasOwn(exported,'business_subscription'),'Completefinancialexportpreserved');
 equal((await json(ids.hostA,'select public.export_my_data() as data')).reviews,[],'Hostexport no privatecustomerreviews');
 await admin.query("update public.business_subscriptions set current_period_end=now()-interval '1 second' where user_id=$1",[ids.hostA]);
 equal((await as(null,'select * from public.business_gallery_public where business_id=$1',[businesses.A])).rowCount,0,'Expiredgalleryhidden');
 equal((await as(null,'select * from public.business_reviews_public where business_id=$1',[businesses.A])).rowCount,0,'Expiredreviewshidden');
 equal((await as(ids.alice,'select * from public.customer_favorites')).rowCount,0,'Expiredcompanyremovedfromfavoritediscovery');
 equal((await as(ids.alice,'select * from public.favorites')).rowCount,1,'Expiry preservesfavoritehistory');
 await rejects(ids.hostA,'select public.attach_company_image($1,$2)',['logo',cover],['42501'],'ExpiredmediagateDB');
 await rejects(ids.hostA,'insert into storage.objects(bucket_id,name) values($1,$2)',['company-images',path(businesses.A)],['42501'],'ExpiredStoragegateDB');
 await rejects(ids.hostA,'select public.business_client_summary()',[],['42501'],'Expiredclientanalysisgate');
 await rejects(ids.hostA,'select public.business_review_summary()',[],['42501'],'Expiredreviewanalysisgate');
 equal(await json(ids.bob,'select public.delete_review($1) as data',[review.id]),false,'Foreigncustomerdelete no effect');
 equal(await json(ids.alice,'select public.delete_review($1) as data',[review.id]),true,'Ownreviewdeletable evenexpiredcompany');
 await json(ids.alice,'select public.toggle_favorite($1,false) as data',[businesses.A]);
 equal((await as(ids.alice,'select * from public.favorites')).rowCount,0,'Ownfavorite removalevenexpired');
 await admin.query("update public.business_subscriptions set current_period_end=now()+interval '30 days' where user_id=$1",[ids.hostA]);
};
