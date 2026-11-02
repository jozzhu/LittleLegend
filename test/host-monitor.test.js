// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createMonitor,localRequest}=require('../host-monitor'),g=require('../game');
test('online presence deduplicates accounts, expires at thirty seconds and respects revoked sessions',()=>{
 let time=1000;
 const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
 const accounts={data:{users:[{id:'a'},{id:'b'}],sessions:['one','two','three'].map(token=>({hash:tokenHash(token),expires:100000}))}};
 const monitor=createMonitor({accounts,rooms:new Map(),commit(){},now:()=>time});
 const touch=(token,user)=>monitor.touch({headers:{cookie:'xcs_session='+token}},{id:user});
 touch('one','a');touch('two','a');touch('three','b');assert.equal(monitor.summary().online,2);
 time=30999;assert.equal(monitor.summary().online,2);time=31000;assert.equal(monitor.summary().online,0);
 touch('one','a');touch('three','b');accounts.data.sessions=accounts.data.sessions.filter(s=>s.hash!==tokenHash('one'));
 assert.equal(monitor.summary().online,1);
 accounts.data.users[1].disabled=true;assert.equal(monitor.summary().online,0);
 for(const [remote,host,expected] of [['127.0.0.1','localhost:5000',true],['::ffff:127.0.0.1','127.0.0.1:5000',true],['192.168.1.2','localhost:5000',false],['127.0.0.1','evil.test:5000',false]])assert.equal(localRequest({socket:{remoteAddress:remote},headers:{host}}),expected);
});
test('GM tickets are single use, expire and issue local cookie sessions only',()=>{
 let time=0;const monitor=createMonitor({accounts:{data:{users:[],sessions:[]}},rooms:new Map(),commit(){},now:()=>time});
 const ticket=monitor.ticket(),token=monitor.login(ticket);assert(token);assert.equal(monitor.login(ticket),null);
 const req={headers:{host:'localhost:5000',cookie:'xcs_gm='+token},socket:{remoteAddress:'127.0.0.1'}};
 assert(monitor.identify(req));assert.equal(monitor.identify({...req,socket:{remoteAddress:'192.168.1.2'}}),null);
 const expired=monitor.ticket();time=30000;assert.equal(monitor.login(expired),null);
 time=12*3600000;assert.equal(monitor.identify(req),null);
});
test('GM entry records one event, exposes complete views without credentials and cannot retain or replace a room',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-gm-')),previous=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir),h=a.register({username:'host',password:'password-test'}),q=a.register({username:'guest',password:'password-test'});
 const hCookie='xcs_session='+a.session(h),qCookie='xcs_session='+a.session(q);
 const r=g.createRoom(h.nickname);r.code='GMTEST';r.players[0].userId=h.id;g.join(r,q.nickname).userId=q.id;
 r.phase='playing';r.seats=r.players.map(p=>p.id);r.currentId=r.hostId;r.actions=2;
 r.players[0].hand=[g.card(18)];r.players[1].hand=[g.card(23)];r.players[1].privateNotice={id:'notice',title:'秘密查看',cards:[g.card(17)]};
 r.decks.royal=[g.card(19)];r.decks.monster=[g.card(22)];
 r.pending={id:'prompt',playerId:r.players[1].id,text:'选择应对',options:[{key:'opaque',label:'放弃',value:'pass'}],task:{op:'defense'}};
 fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([r]));process.env.XCS_DATA_DIR=dir;
 delete require.cache[require.resolve('../server')];const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function req(url,body,headers={}){
  const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
 }
 const admin={'X-Admin-Key':a.adminKey};
 try{
  assert.equal((await req('/api/admin/live')).status,403);
  assert.equal((await req('/api/gm/rooms',null,{Cookie:hCookie})).status,401);
  assert.equal((await req('/api/gm/login',{ticket:'fake'})).status,401);
  assert.equal((await req('/api/admin/live',null,admin)).data.online,0);
  await req('/api/heartbeat',{}, {Cookie:hCookie});await req('/api/heartbeat',{}, {Cookie:qCookie});
  const live=(await req('/api/admin/live',null,admin)).data;assert.equal(live.online,2);assert.equal(live.playing,1);assert.equal(live.roomList[0].code,'GMTEST');
  const ticket=(await req('/api/admin/gm-ticket',{},admin)).data.ticket;
  const login=await req('/api/gm/login',{ticket});assert.equal(login.status,200);assert(login.cookie.includes('HttpOnly'));assert(login.cookie.includes('Path=/api/gm'));
  const gm={Cookie:login.cookie.split(';')[0]};
  assert.equal((await req('/api/gm/login',{ticket})).status,401);
  assert.equal((await req('/api/gm/enter',{code:r.code,matchId:'wrong'},gm)).status,400);
  const entered=(await req('/api/gm/enter',{code:r.code,matchId:r.matchId},gm)).data;
  const duplicate=(await req('/api/gm/enter',{code:r.code,matchId:r.matchId},gm)).data;assert.equal(duplicate.watchId,entered.watchId);
  const view=(await req('/api/gm/state?watch='+entered.watchId,null,gm)).data;
  assert(view.players.every(p=>p.hand.length===1));assert.equal(view.replayDecks.royal[0].id,19);assert.equal(view.privateNotices[0].cards[0].id,17);assert.equal(view.pending.options[0].label,'放弃');
  assert.equal(view.events.filter(e=>e.type==='gm').length,1);assert(view.events.at(-1).text.includes('观战'));
  const serialized=JSON.stringify(view);for(const secret of ['"token"','"hash"','"salt"',h.hash,h.token])if(secret)assert(!serialized.includes(secret));
  assert.equal((await req('/api/gm/command',{type:'surrender'},gm)).status,404);
  assert.equal((await req('/api/command?code='+r.code,{type:'surrender'},gm)).status,401);
  const participant=(await req('/api/state?code='+r.code,null,{Cookie:hCookie})).data;assert.equal(participant.players[1].hand,undefined);assert.equal(participant.events.filter(e=>e.type==='gm').length,1);
  await req('/api/command?code='+r.code,{type:'away'},{Cookie:hCookie});await req('/api/command?code='+r.code,{type:'away'},{Cookie:qCookie});
  const stopped=(await req('/api/gm/rooms',null,gm)).data;assert.equal(stopped.rooms,0);assert.equal(stopped.playing,0);
  assert.equal((await req('/api/gm/state?watch='+entered.watchId,null,gm)).status,400);
  assert.equal((await req('/api/create',{code:r.code},{Cookie:hCookie})).status,200);
  assert.equal((await req('/api/gm/state?watch='+entered.watchId,null,gm)).status,400);
  assert.equal((await req('/api/gm/rooms',null,gm)).data.roomList[0].canWatch,false);
  const replay=(await req('/api/replays',null,{Cookie:hCookie})).data[0];
  const frames=(await req('/api/replay?match='+replay.id,null,{Cookie:hCookie})).data.frames;
  assert(frames.some(f=>f.state.events.some(e=>e.type==='gm')));
  await req('/api/auth/logout',{}, {Cookie:qCookie});assert.equal((await req('/api/admin/live',null,admin)).data.online,1);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
