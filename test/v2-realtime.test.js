// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebSocket}=require('ws'),g=require('../game');
const {createJsonWriter,draftRoom}=require('../storage');
test('asynchronous atomic writer coalesces queued saves, serializes overlapping flushes and exposes errors',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-writer-')),file=path.join(dir,'state.json'),w=createJsonWriter(file);
 try{
  w.save({version:1});w.save({version:2});const first=w.flush();
  w.save({version:3});await Promise.all([first,w.flush()]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:3});assert(!fs.existsSync(file+'.tmp'));assert(w.writes<=2);
  const bad=createJsonWriter(path.join(dir,'missing','file.json'));bad.save({});await assert.rejects(bad.flush());
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('room draft isolates mutable rules while sharing immutable replay and undo history',()=>{
 const r=g.createRoom('甲');r.frames=[{state:{large:'history'}}];r.replays=[{frames:r.frames}];r.undoStack=[{state:{actions:2}}];
 const draft=draftRoom(r);draft.players[0].coins=2;draft.frames.push({});
 assert.equal(r.players[0].coins,0);assert.equal(r.frames.length,1);
 assert.equal(draft.frames[0],r.frames[0]);assert.equal(draft.replays[0],r.replays[0]);assert.equal(draft.undoStack[0],r.undoStack[0]);
});
async function fixture({stalePresence=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-stream-')),old=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir),users=Array.from({length:5},(_,i)=>a.register({username:'live'+i,password:'testing-password'}));
 const cookies=users.map(u=>'xcs_session='+a.session(u)),r=g.createRoom('甲',g.defaults(5));
 while(r.players.length<5)g.join(r,'玩家'+r.players.length);
 r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=r.hostId;r.round=1;r.actions=2;
 r.players.forEach((p,i)=>{p.userId=users[i].id;p.hand=[g.card(3+i)];});
 if(stalePresence)r.players.forEach(p=>p.lastSeen=Date.now()-120000);
 r.decks.royal=[g.card(18),g.card(19)];r.decks.monster=[g.card(22),g.card(23)];
 fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([r]));
 process.env.XCS_DATA_DIR=dir;delete require.cache[require.resolve('../server')];
 const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,sockets=[];
 async function request(i,url,body){
  const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Cookie:cookies[i],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;
 }
 function connect(i,origin=base,cookie=cookies[i]){
  return new Promise((resolve,reject)=>{
   const ws=new WebSocket(base.replace('http:','ws:')+'/api/live?code='+r.code,{headers:{Origin:origin,Cookie:cookie||''}});
   sockets.push(ws);const inbox=[],waiters=[];
   ws.on('message',data=>{const message=JSON.parse(data).state;if(waiters.length)waiters.shift()(message);else inbox.push(message);});
   const client={ws,take:()=>inbox.length?Promise.resolve(inbox.shift()):new Promise((done,fail)=>{const timer=setTimeout(()=>fail(Error('No live update')),3000);waiters.push(s=>{clearTimeout(timer);done(s);});})};
   ws.on('error',reject);ws.on('unexpected-response',(_,res)=>{res.resume();ws.terminate();reject(Object.assign(Error('Upgrade rejected'),{status:res.statusCode}));});ws.once('open',()=>resolve(client));
  });
 }
 return {dir,r,server,base,request,connect,async close(){for(const ws of sockets)ws.terminate();server.closeRealtime();await server.flush();await new Promise(resolve=>server.close(resolve));delete require.cache[require.resolve('../server')];if(old===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=old;fs.rmSync(dir,{recursive:true,force:true});}};
}
test('restored matches get a reconnect grace period instead of dissolving on the first offline sweep',async()=>{
 const f=await fixture({stalePresence:true});
 try{
  await new Promise(resolve=>setTimeout(resolve,5200));
  const state=await f.request(0,'/api/state?code='+f.r.code);
  assert.equal(state.phase,'playing');assert.equal(state.players.length,5);
  assert(state.players.every(p=>p.status==='active'));
  const client=await f.connect(1);assert.equal((await client.take()).phase,'playing');
 }finally{await f.close();}
});
test('five-player live updates are immediate, personalized, durable and recover on reconnect; idle HTTP stays compact',async t=>{
 const f=await fixture();
 try{
  const clients=await Promise.all(Array.from({length:5},(_,i)=>f.connect(i)));
  const first=await Promise.all(clients.map(c=>c.take()));
  first.forEach((state,i)=>{assert(state.players[i].hand);state.players.forEach((p,j)=>{if(i!==j)assert.equal(p.hand,undefined);});assert(!JSON.stringify(state).includes('undoStack'));});
  const idle=await f.request(0,`/api/state?code=${f.r.code}&since=${first[0].version}&match=${first[0].matchId}`);assert(idle.unchanged);assert(JSON.stringify(idle).length<100);
  const latencies=[];
  for(let i=0;i<12;i++){
   const pending=clients.map(c=>c.take()),start=performance.now();
   const ack=await f.request(0,'/api/command?code='+f.r.code,{type:'chat',text:'实时消息'+i});
   const pushed=await Promise.all(pending);latencies.push(performance.now()-start);
   assert(pushed.every(s=>s.version===ack.version&&s.chat.at(-1).text==='实时消息'+i));
   const disk=JSON.parse(fs.readFileSync(path.join(f.dir,'rooms.json')));assert.equal(disk[0].version,ack.version);
  }
  const concurrent=clients.map(async c=>{let s;do{s=await c.take();}while(s.chat.filter(m=>m.text.startsWith('同时提交')).length<5);return s;});
  await Promise.all(Array.from({length:5},(_,i)=>f.request(i,'/api/command?code='+f.r.code,{type:'chat',text:'同时提交'+i})));
  const combined=await Promise.all(concurrent);assert(combined.every(s=>s.chat.filter(m=>m.text.startsWith('同时提交')).length===5));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'rooms.json')))[0].chat.filter(m=>m.text.startsWith('同时提交')).length,5);
  clients[2].ws.terminate();const reconnected=await f.connect(2),latest=await reconnected.take();assert.equal(latest.chat.filter(m=>m.text.startsWith('同时提交')).length,5);
  await assert.rejects(f.connect(0,'http://untrusted.invalid'),e=>e.status===403);
  await assert.rejects(f.connect(0,f.base,''),e=>e.status===401);
  const closed=new Promise(resolve=>clients[0].ws.once('close',resolve));await f.request(0,'/api/auth/logout',{});await closed;
  latencies.sort((a,b)=>a-b);t.diagnostic('Five clients, durable command + push p50='+latencies[5].toFixed(1)+'ms p95='+latencies[11].toFixed(1)+'ms');
  assert(latencies[11]<1000,'Local push should finish within the previous polling interval');
 }finally{await f.close();}
});
