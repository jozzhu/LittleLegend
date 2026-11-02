// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),g=require('../game');
test('permanent account deletion preserves shared room, archive access, and other accounts; reset is separate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-maintenance-')),previous=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir),h=a.register({username:'deleted',nickname:'法师',password:'password-test'}),q=a.register({username:'survivor',password:'password-test'}),third=a.register({username:'third',password:'password-test'});
 const cookies=new Map([h,q,third].map(u=>[u.id,'xcs_session='+a.session(u)]));
 const r=g.createRoom(h.nickname,g.defaults(3));r.code='SHARED';r.players[0].userId=h.id;
 for(const u of [q,third])g.join(r,u.nickname).userId=u.id;
 r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=r.hostId;r.actions=2;r.decks.royal=[g.card(18),g.card(19)];r.decks.monster=[g.card(22),g.card(23)];
 const ended=structuredClone(r);ended.matchId='past-match';ended.phase='finished';ended.finishedAt=Date.now();ended.winners=[ended.players[1].id];ended.frames=[{time:Date.now(),state:g.snapshot(ended)}];
 a.archive(ended);q.matches.push({id:ended.matchId,won:true});q.stats.games=1;q.stats.wins=1;a.save();
 const lobby=g.createRoom(h.nickname);lobby.code='WAIT';lobby.players[0].userId=h.id;g.join(lobby,q.nickname).userId=q.id;
 fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([r,lobby]));
 process.env.XCS_DATA_DIR=dir;let server,base;
 async function boot(){delete require.cache[require.resolve('../server')];server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;}
 async function req(url,body,user,admin=false){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(user?{Cookie:cookies.get(user.id)}:{}),...(admin?{'X-Admin-Key':a.adminKey}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 try{
  await boot();
  assert.equal((await req('/api/admin/delete-user',{id:h.id,confirmUsername:h.username},h)).status,403);
  const preview=(await req('/api/admin/delete-preview?id='+h.id,null,null,true)).data;
  assert.equal(preview.rooms.length,2);assert(preview.rooms.every(r=>r.host));assert.equal(preview.replays,1);
  assert.equal((await req('/api/admin/delete-user',{id:h.id,confirmUsername:'wrong'},null,true)).status,400);
  assert.equal((await req('/api/admin/delete-user',{id:h.id,confirmUsername:h.username},null,true)).status,200);
  assert.equal((await req('/api/auth/me',null,h)).status,401);
  const state=(await req('/api/state?code=SHARED',null,q)).data;
  assert.equal(state.phase,'playing');assert.equal(state.hostId,r.players[1].id);assert.equal(state.players[0].status,'surrendered');assert.equal(state.players[0].name,'已删除玩家');
  const waiting=(await req('/api/state?code=WAIT',null,q)).data;assert.equal(waiting.phase,'lobby');assert.equal(waiting.hostId,lobby.players[1].id);assert.equal(waiting.players.length,1);
  assert.equal((await req('/api/replay?match=past-match',null,q)).status,200);
  assert.equal((await req('/api/profile',null,q)).data.stats.wins,1);
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json')));
  assert(!persisted.users.some(u=>u.id===h.id));assert(!persisted.sessions.some(s=>s.userId===h.id));assert.equal(persisted.archives.length,1);
  assert.equal(persisted.archives[0].frames[0].state.players[0].name,'已删除玩家');
  const reRegister=await req('/api/auth/register',{username:h.username,password:'new-password'});assert.equal(reRegister.status,200);assert.notEqual(reRegister.data.user.id,h.id);
  assert.equal((await req('/api/replay?match=past-match',null,{id:'new'})).status,401);
  await new Promise(resolve=>server.close(resolve));await boot();
  assert.equal((await req('/api/replay?match=past-match',null,q)).status,200);
  assert.equal((await req('/api/admin/delete-user',{id:third.id,confirmUsername:third.username},null,true)).status,200);
  assert.equal((await req('/api/state?code=SHARED',null,q)).data.phase,'finished');
  const recent=(await req('/api/replays',null,q)).data;assert.equal(recent.length,2);
  assert.equal((await req('/api/replay?match='+recent[0].id,null,q)).status,200);
  assert.equal((await req('/api/profile',null,q)).data.stats.wins,2);
  assert.equal((await req('/api/admin/reset-data',{confirmation:'wrong'},null,true)).status,400);
  assert.equal((await req('/api/admin/reset-data',{confirmation:'清空所有游戏数据'},null,true)).status,200);
  assert.equal(fs.readFileSync(path.join(dir,'admin.key'),'utf8'),a.adminKey);
  const empty=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json')));for(const k of ['users','sessions','archives','audit'])assert.equal(empty[k].length,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))),[]);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
test('startup resumes an interrupted maintenance journal before serving requests',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-recovery-')),previous=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir);a.register({username:'testing',password:'password-test'});
 fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([g.createRoom('testing')]));
 fs.writeFileSync(path.join(dir,'maintenance.json'),JSON.stringify({type:'reset'}));
 process.env.XCS_DATA_DIR=dir;
 try{
  delete require.cache[require.resolve('../server')];require('../server');
  assert(!fs.existsSync(path.join(dir,'maintenance.json')));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))),[]);
  const empty=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json')));assert.equal(empty.users.length,0);assert.equal(empty.archives.length,0);
  assert.equal(fs.readFileSync(path.join(dir,'admin.key'),'utf8'),a.adminKey);
 }finally{if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
test('room code reuse retains shared replay and rejects stale match commands',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-reuse-')),previous=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir),u=a.register({username:'player',password:'password-test'}),cookie='xcs_session='+a.session(u);
 const ended=g.createRoom('player');ended.code='REUSE';ended.players[0].userId=u.id;ended.phase='finished';ended.finishedAt=Date.now();ended.winners=[ended.hostId];ended.frames=[{time:Date.now(),state:g.snapshot(ended)}];a.archive(ended);
 const dissolved=g.createRoom('old');dissolved.code='CLOSED';dissolved.dissolved=true;
 fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([ended,dissolved]));process.env.XCS_DATA_DIR=dir;delete require.cache[require.resolve('../server')];const server=require('../server').createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 async function req(url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 try{
  assert.equal((await req('/api/create',{code:'REUSE'})).status,409);
  await req('/api/command?code=REUSE',{type:'away'});
  const created=await req('/api/create',{code:'REUSE'});assert.equal(created.status,200);assert.notEqual(created.data.state.matchId,ended.matchId);
  assert.equal((await req('/api/command?code=REUSE',{type:'chat',text:'stale',matchId:ended.matchId})).status,409);
  assert.equal((await req('/api/replays')).data[0].id,ended.matchId);
  await req('/api/command?code=REUSE',{type:'away'});assert.equal((await req('/api/create',{code:'CLOSED'})).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
