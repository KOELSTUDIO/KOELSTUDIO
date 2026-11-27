// KOELSTUDIO API – Cloudflare Pages Functions + D1 (binding: DB) + secret ADMIN_PIN
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const E=(e,s=400)=>J({e},s);
const rid=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');
const OK=['berhasil','selesai'],ST=['pending','berhasil','selesai','gagal'];
let ready;
const init=env=>ready||(ready=env.DB.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS orders (inv TEXT PRIMARY KEY, name TEXT, wa TEXT, pid TEXT, item TEXT, total INTEGER, pm TEXT, st TEXT, code TEXT DEFAULT '', hide INTEGER DEFAULT 0, date TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS reviews (inv TEXT PRIMARY KEY, pid TEXT, s INTEGER, name TEXT, txt TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS album (id TEXT PRIMARY KEY, name TEXT, cap TEXT, img TEXT, w REAL, h REAL, pid TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS img (id TEXT PRIMARY KEY, ct TEXT, b64 TEXT);
CREATE TABLE IF NOT EXISTS rl (k TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS rl_k ON rl(k, ts);`).then(()=>env.DB.exec("ALTER TABLE album ADD COLUMN ok INTEGER DEFAULT 1").catch(()=>{})).catch(e=>{ready=null;throw e}));
const mac=async(env,x)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(env.ADMIN_PIN||'k')),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(x))).slice(0,6),b=>b.toString(16).padStart(2,'0')).join('')};
const TM='Terlalu banyak permintaan. Coba lagi beberapa saat.';
const cnt=async(env,k,sec)=>(await env.DB.prepare('SELECT COUNT(*) c FROM rl WHERE k=? AND ts>?').bind(k,Date.now()-sec*1000).first()).c;
const hit=(env,k)=>env.DB.prepare('INSERT INTO rl(k,ts) VALUES(?,?)').bind(k,Date.now()).run();
const lim=async(env,k,max,sec)=>{if(await cnt(env,k,sec)>=max)return true;await hit(env,k);return false};
const cut=(s,n)=>String(s||'').trim().slice(0,n);

export async function onRequest({request:q,env}){
 const url=new URL(q.url),p=url.pathname.replace(/^\/api\//,'').replace(/\/$/,'').split('/'),key=p.join('/'),m=q.method,DB=env.DB;
 const R=(sql,...a)=>DB.prepare(sql).bind(...a),ip=q.headers.get('cf-connecting-ip')||'x';
 const getCfg=async()=>{const r=await R("SELECT v FROM kv WHERE k='cfg'").first();return r?JSON.parse(r.v):await(await env.ASSETS.fetch(new URL('/def.json',url))).json()};
 const saveImg=async d=>{const x=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d||'');if(!x||d.length>1400000)throw new Error('Gambar tidak valid atau terlalu besar');const id=rid(14);await R('INSERT INTO img(id,ct,b64) VALUES(?,?,?)',id,x[1],x[2]).run();return'/api/img/'+id};
 try{
  if(!DB)return E('Binding D1 "DB" belum dipasang',500);
  await init(env);if(Math.random()<.05)await DB.prepare('DELETE FROM rl WHERE ts<?').bind(Date.now()-36e5).run();
  const B=m=='POST'?await q.json().catch(()=>({})):{};
  if(p[0]=='admin'){const pin=String(env.ADMIN_PIN||'').trim();if(!pin)return E('ADMIN_PIN belum terpasang di Cloudflare (Production). Tambahkan lalu deploy ulang.',500);if(await cnt(env,'pin:'+ip,600)>=8)return E(TM,429);if((q.headers.get('x-pin')||'').trim()!==pin){await hit(env,'pin:'+ip);return E('PIN salah',401)}}

  if(key=='state'){
   const [rv,tk,al]=await Promise.all([R('SELECT pid,s,name,txt FROM reviews ORDER BY ts DESC LIMIT 200').all(),R("SELECT name,item FROM orders WHERE st IN ('berhasil','selesai') AND hide=0 ORDER BY ts DESC LIMIT 15").all(),R('SELECT id,name,cap,img,w,h FROM album WHERE ok=1 ORDER BY ts DESC LIMIT 300').all()]);
   return J({cfg:await getCfg(),reviews:rv.results,ticker:tk.results.map(o=>({n:o.name.split(' ')[0],item:o.item})),album:al.results})}
  if(p[0]=='img'&&m=='GET'){const r=await R('SELECT ct,b64 FROM img WHERE id=?',p[1]).first();if(!r)return E('Tidak ada',404);const b=atob(r.b64),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Response(u,{headers:{'content-type':r.ct,'cache-control':'public,max-age=31536000,immutable'}})}

  if(key=='order'){if(await lim(env,'o:'+ip,5,600))return E(TM,429);const c=await getCfg(),pr=c.prods.find(x=>x.id==B.pid),pm=c.pay.find(x=>x.n==B.pm);const name=cut(B.name,60),wa=cut(B.wa,20).replace(/[^\d+]/g,'');
   if(!pr||!pm||!name||wa.length<8)return E('Data pesanan tidak lengkap');
   const inv='KS-'+rid(6),total=Math.round(pr.p*(1-(pr.d||0)/100)),date=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
   await R("INSERT INTO orders(inv,name,wa,pid,item,total,pm,st,date,ts) VALUES(?,?,?,?,?,?,?,'pending',?,?)",inv,name,wa,pr.id,pr.n,total,pm.n,date,Date.now()).run();
   return J({inv,total,item:pr.n,pm:pm.n,date})}
  if(key=='mine'){if(await lim(env,'m:'+ip,30,60))return E(TM,429);const l=(Array.isArray(B.invs)?B.invs:[]).slice(0,30).map(x=>String(x).toUpperCase());if(!l.length)return J({orders:[]});
   const r=await R(`SELECT inv,pid,item,total,pm,st,date,(code!='') AS hc FROM orders WHERE inv IN (${l.map(()=>'?').join(',')}) ORDER BY ts DESC`,...l).all();return J({orders:r.results})}
  if(key=='verify'){if(await lim(env,'v:'+ip,10,60))return E(TM,429);const o=await R("SELECT inv,pid,st FROM orders WHERE code=? AND code!=''",cut(B.code,20).toUpperCase()).first();
   if(!o)return E('Kode akses tidak valid.',404);if(!OK.includes(o.st))return E('Pembayaran belum dikonfirmasi admin. Tekan Hubungi Admin.',403);return J({ok:1,pid:o.pid})}
  if(key=='review'){if(await lim(env,'r:'+ip,5,600))return E(TM,429);const o=await R('SELECT pid,st,name FROM orders WHERE inv=?',cut(B.inv,20).toUpperCase()).first(),s=Math.min(5,Math.max(1,+B.s||5));
   if(!o)return E('Kode invoice tidak ditemukan.');if(o.pid!=B.pid)return E('Invoice ini untuk produk lain.');if(!OK.includes(o.st))return E('Pembayaran invoice ini belum dikonfirmasi admin (status: '+o.st+').');
   const inv=cut(B.inv,20).toUpperCase();if(await R('SELECT 1 FROM reviews WHERE inv=?',inv).first())return E('Invoice ini sudah dipakai untuk ulasan.');
   await R('INSERT INTO reviews(inv,pid,s,name,txt,ts) VALUES(?,?,?,?,?,?)',inv,o.pid,s,cut(B.name,40)||o.name,cut(B.txt,300)||'-',Date.now()).run();return J({ok:1})}
  if(key=='album'){if(await lim(env,'a:'+ip,6,600))return E(TM,429);const o=await R("SELECT inv,pid,st FROM orders WHERE code=? AND code!=''",cut(B.code,20).toUpperCase()).first();
   if(!o||!OK.includes(o.st))return E('Kode akses tidak valid / belum aktif.',403);
   const pr=(await getCfg()).prods.find(x=>x.id==o.pid);if(!pr)return E('Produk tidak ditemukan');
   const oh=await mac(env,o.inv),cnt=await R("SELECT COUNT(*) c FROM album WHERE id LIKE ?",oh+'-%').first();if(cnt.c>=5)return E('Batas 5 foto per pembelian.');
   const img=await saveImg(B.img);await R('INSERT INTO album(id,name,cap,img,w,h,pid,ts,ok) VALUES(?,?,?,?,?,?,?,?,0)',oh+'-'+rid(5),cut(B.name,40)||'Pelanggan',cut(B.cap,80),img,pr.w||8.8,pr.h||10.7,pr.id,Date.now()).run();return J({ok:1})}

  if(key=='admin/check')return J({ok:1});
  if(key=='admin/orders')return J({orders:(await R('SELECT * FROM orders ORDER BY ts DESC LIMIT 500').all()).results});
  if(key=='admin/reviews')return J({reviews:(await R('SELECT * FROM reviews ORDER BY ts DESC LIMIT 300').all()).results});
  if(key=='admin/upload')return J({url:await saveImg(B.data)});
  if(key=='admin/cfg'){const s=JSON.stringify(B.cfg||{});if(!B.cfg||!Array.isArray(B.cfg.prods)||s.length>300000)return E('Config tidak valid');await R("INSERT INTO kv(k,v) VALUES('cfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",s).run();return J({ok:1})}
  if(key=='admin/order'){const o=await R('SELECT * FROM orders WHERE inv=?',B.inv).first();if(!o)return E('Pesanan tidak ada',404);
   if(B.del){await R('DELETE FROM orders WHERE inv=?',B.inv).run();return J({ok:1})}
   if(B.st){if(!ST.includes(B.st))return E('Status salah');await R('UPDATE orders SET st=? WHERE inv=?',B.st,B.inv).run()}
   if(B.hide!==undefined)await R('UPDATE orders SET hide=? WHERE inv=?',B.hide?1:0,B.inv).run();
   let code=o.code;if(B.code){const pr=(await getCfg()).prods.find(x=>x.id==o.pid);if(pr&&pr.t=='inv')return E('Produk undangan tidak memakai kode akses');
    if(!OK.includes(B.st||o.st))return E('Ubah status ke berhasil/selesai dulu');if(!code){code='AK-'+rid(6);await R('UPDATE orders SET code=? WHERE inv=?',code,B.inv).run()}}
   return J({ok:1,code})}
  if(key=='admin/review/del'){await R('DELETE FROM reviews WHERE inv=?',B.inv).run();return J({ok:1})}
  if(key=='admin/album')return J({album:(await R('SELECT id,name,cap,img,w,h,ok,ts FROM album ORDER BY ok ASC, ts DESC LIMIT 300').all()).results});
  if(key=='admin/album/ok'){await R('UPDATE album SET ok=? WHERE id=?',B.ok?1:0,B.id).run();return J({ok:1})}
  if(key=='admin/album/del'){const a=await R('SELECT img FROM album WHERE id=?',B.id).first();await R('DELETE FROM album WHERE id=?',B.id).run();const m=/^\/api\/img\/([A-Z0-9]+)$/.exec((a&&a.img)||'');if(m)await R('DELETE FROM img WHERE id=?',m[1]).run();return J({ok:1})}
  return E('Endpoint tidak ada',404);
 }catch(e){return E(e.message||'Server error',500)}
}
