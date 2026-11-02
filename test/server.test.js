// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('accounts, lobby departure, cross-device return, omniscient archives, admin and persistence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-test-'));process.env.XCS_DATA_DIR=dir;
 delete require.cache[require.resolve('../server')];let server=require('../server').createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let base=`http://127.0.0.1:${server.address().port}`;
 async function req(url,body,who,headers={}){const res=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(who?.cookie?{Cookie:who.cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function register(username){const r=await req('/api/auth/register',{username,password:'test-password',nickname:username});assert.equal(r.status,200);return {...r,user:r.data.user};}
 try{
  for(const file of ['battlefield_2560x1440.png','cardback_royal.png','cardback_monster.png','wood_table_texture.png','emblem_royal_sword.png','emblem_monster_spiral.png']){const r=await fetch(base+'/assets/'+file);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),file.startsWith('emblem_')?'image/png':'image/jpeg');const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.equals(fs.readFileSync(path.join(__dirname,'../assets',file))));}
  assert.equal((await req('/api/create',{})).status,401);
  const h=await register('host'),q=await register('guest'),stranger=await register('outsider');
  assert.equal((await req('/api/create',{code:'../bad',settings:{maxPlayers:2}},h)).status,400);
  const created=(await req('/api/create',{code:'friends88',settings:{maxPlayers:2}},h)).data,code=created.code;h.playerId=created.playerId;assert.equal(code,'FRIENDS88');assert.equal((await req('/api/create',{code:'friends88'},stranger)).status,409);
  assert.equal((await req('/api/profile',{avatar:{mode:'preset',preset:'01_king'}},h)).status,200);assert.equal((await req('/api/state?code='+code,null,h)).data.players[0].avatar.preset,'01_king');
  const blocked=await req('/api/create',{},h);assert.equal(blocked.status,409);assert.equal(blocked.data.roomCode,code);assert.equal(blocked.data.phase,'lobby');assert.equal((await req('/api/join',{code:blocked.data.roomCode},h)).data.playerId,h.playerId);
  let joined=(await req('/api/join',{code},q)).data;q.playerId=joined.playerId;
  const cmd=(who,a)=>req('/api/command?code='+code,a,who);
  assert.equal((await cmd(q,{type:'surrender'})).status,400);await cmd(q,{type:'away'});
  assert((await req('/api/join',{code},stranger)).data.playerId);assert.equal((await req('/api/join',{code},q)).status,400);
  await cmd(stranger,{type:'away'});joined=(await req('/api/join',{code},q)).data;assert.equal(joined.playerId,q.playerId);
  assert.equal((await cmd(h,{type:'settings',settings:{counts:{9:1}}})).status,400);
  assert.deepEqual((await req('/api/state?code='+code,null,h)).data.settings.counts,{});
  for(let match=0;match<6;match++){
   await cmd(q,{type:'ready'});let s=(await cmd(h,{type:'start'})).data;assert.equal(s.players.length,2);
   for(let i=0;i<2;i++)s=(await cmd(s.seatChooser===h.playerId?h:q,{type:'seat',seat:i})).data;
   for(let i=0;i<6;i++)s=(await cmd(s.currentId===h.playerId?h:q,{type:'draw',source:i%2?'royal':'monster'})).data;
   assert.equal((await req('/api/state?code='+code,null,h)).data.players.find(p=>p.id===q.playerId).hand,undefined);
   assert.equal((await cmd(q,{type:'away'})).status,200);
   const cannotCreate=await req('/api/create',{},q);assert.equal(cannotCreate.status,409);assert.equal(cannotCreate.data.roomCode,code);
   q.cookie=(await req('/api/auth/login',{username:'guest',password:'test-password'})).cookie;
   const returned=await req('/api/join',{code},q);assert.equal(returned.data.playerId,q.playerId);assert.equal(returned.data.state.players.find(p=>p.id===q.playerId).hand.length,3);
   const ended=await cmd(q,{type:'surrender'});assert.equal(ended.data.phase,'finished');
   const records=(await req('/api/replays',null,q)).data;assert.equal(records.length,Math.min(match+1,5));
   const archive=await req('/api/replay?match='+records[0].id,null,q);assert.equal(archive.status,200);assert(archive.data.frames.length>5);assert(archive.data.frames.every(f=>f.state.players.every(p=>Array.isArray(p.hand))));assert(archive.data.frames.some(f=>f.state.players.every(p=>p.hand.length===3)));
   assert.equal((await req('/api/replay?match='+records[0].id,null,stranger)).status,404);
   assert(!JSON.stringify(archive.data).includes('"token"'));assert(!JSON.stringify(archive.data).includes('"hash"'));
   await cmd(q,{type:'away'});assert.equal((await req('/api/join',{code},q)).data.state.players.find(p=>p.id===q.playerId).status,'surrendered');assert.equal((await cmd(q,{type:'draw',source:'royal'})).status,400);
   if(match<5){const prepared=await cmd(match%2?q:h,{type:'rematch'});assert.equal(prepared.status,200);assert.equal(prepared.data.hostId,h.playerId);assert(prepared.data.players.every(p=>p.status==='active'&&!p.ready));}
  }
  const profile=(await req('/api/profile',null,q)).data;assert.equal(profile.stats.games,6);assert.equal(profile.stats.losses,6);assert(profile.stats.royalCards+profile.stats.monsterCards>=12);assert(profile.titles.some(t=>t.id==='tragic'));
  assert.equal((await req('/api/profile',{equipped:'tragic',showcase:['tragic','wanderer']},q)).status,200);
  assert.equal((await req('/api/profile',{nickname:'must-not-stick',equipped:'wealth'},q)).status,400);assert.equal((await req('/api/profile',null,q)).data.nickname,'guest');
  const lobby=(await req('/api/create',{settings:{maxPlayers:2}},h)).data;await req('/api/join',{code:lobby.code},q);
  assert.equal((await req('/api/command?code='+lobby.code,{type:'away'},h)).status,200);
  const inherited=(await req('/api/join',{code:lobby.code},q)).data;assert.equal(inherited.state.hostId,inherited.playerId);
  await req('/api/command?code='+lobby.code,{type:'away'},q);
  assert.equal((await req('/api/join',{code:lobby.code},q)).status,404);
  const adminKey=fs.readFileSync(path.join(dir,'admin.key'),'utf8');assert.equal((await req('/api/admin/users')).status,403);
  const allowed=require('../accounts').createAccounts(dir).adminAllowed;
  assert.equal(allowed({socket:{remoteAddress:'127.0.0.1'},headers:{host:'example.com','x-admin-key':adminKey}}),false);
  assert.equal(allowed({socket:{remoteAddress:'192.168.1.5'},headers:{host:'localhost','x-admin-key':adminKey}}),false);
  const admin=await req('/api/admin/users',null,null,{'X-Admin-Key':adminKey});assert.equal(admin.status,200);assert(!JSON.stringify(admin.data).includes('"hash"'));
  assert.equal((await req('/api/admin/user',{id:q.user.id,disabled:true},null,{'X-Admin-Key':adminKey})).status,200);assert.equal((await req('/api/auth/me',null,q)).status,401);
  await req('/api/admin/user',{id:q.user.id,disabled:false},null,{'X-Admin-Key':adminKey});q.cookie=(await req('/api/auth/login',{username:'guest',password:'test-password'})).cookie;
  await new Promise(resolve=>server.close(resolve));delete require.cache[require.resolve('../server')];server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await req('/api/replays',null,q)).data.length,5);assert.equal((await req('/api/profile',null,q)).data.equipped,'tragic');
  const old=require('../game').createRoom('legacy');const p=old.players[0];p.hand=[require('../game').card(18)];old.phase='finished';old.finishedAt=Date.now();old.winners=[p.id];old.frames=[{time:Date.now(),state:require('../game').snapshot(old)}];old.replays=[{id:old.matchId,time:old.finishedAt,frames:old.frames,winners:['legacy']}];old.frames=[];
  await new Promise(resolve=>server.close(resolve));const stored=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));stored.push(old);fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify(stored));delete require.cache[require.resolve('../server')];server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await req('/api/claim-legacy',{code:old.code,playerId:p.id,token:'wrong'},h)).status,403);
  assert.equal((await req('/api/claim-legacy',{code:old.code,playerId:p.id,token:p.token},h)).status,200);
  assert.equal((await req('/api/join',{code:old.code},h)).data.playerId,p.id);
  assert.equal((await req('/api/claim-legacy',{code:old.code,playerId:p.id,token:p.token},q)).status,403);
  assert.equal((await req('/api/admin/reset-password',{id:q.user.id},h)).status,403);
  const reset=await req('/api/admin/reset-password',{id:q.user.id},null,{'X-Admin-Key':adminKey});assert.equal(reset.status,200);assert.equal((await req('/api/auth/me',null,q)).status,401);
  const recovery=await req('/api/auth/login',{username:'guest',password:reset.data.temporaryPassword});q.cookie=recovery.cookie;assert.equal(recovery.data.mustChangePassword,true);assert.equal((await req('/api/replays',null,q)).status,403);
  assert.equal((await req('/api/auth/password',{currentPassword:'wrong',newPassword:'fresh-password'},q)).status,400);
  const changed=await req('/api/auth/password',{currentPassword:reset.data.temporaryPassword,newPassword:'fresh-password'},q);assert.equal(changed.status,200);q.cookie=changed.cookie;assert.equal((await req('/api/replays',null,q)).data.length,5);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});delete process.env.XCS_DATA_DIR;}
});
