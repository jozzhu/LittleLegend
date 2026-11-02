// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {audioHarness}=require('./helpers/audio.cjs');
const {createPreloader,isResource,music,core,sounds}=require('../public/resource-cache');
const g=require('../game');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('music shares one context with effects, survives interruption and retains independent volume',async()=>{
 const h=audioHarness(),m=h.mixer;m.setMusic('/music');await m.unlock();
 const musicElement=h.media[0],ctx=h.contexts[0];assert.equal(musicElement.src,'/music');assert(!musicElement.paused);
 musicElement.currentTime=42;
 for(let i=0;i<5;i++)assert(await m.play('/effect'));
 assert.equal(h.requests.length,1);assert.equal(h.media.length,1);assert.equal(h.contexts.length,1);
 assert.equal(h.sources.length,5);assert.equal(await m.play('/sixth'),false);
 assert(h.sources.every(s=>s.connections[0]===ctx.gains[1]));assert.equal(ctx.mediaSources[0].connections[0],ctx.gains[0]);
 m.setVolumes(.4,.2);assert.equal(ctx.gains[0].gain.value,.4);assert.equal(ctx.gains[1].gain.value,.2);
 assert(!musicElement.paused);assert.equal(musicElement.currentTime,42);
 musicElement.pause();await h.flush();assert(!musicElement.paused);assert.equal(musicElement.currentTime,42);
 ctx.state='interrupted';musicElement.paused=true;await m.unlock();assert(!musicElement.paused);
 m.visibility(false);assert(musicElement.paused);assert(h.sources.every(s=>s.stopped));
 m.visibility(true);await h.flush();assert(!musicElement.paused);
 m.setVolumes(0,.7);assert(musicElement.paused);assert(await m.play('/effect'));
 m.setVolumes(1,0);assert(!await m.play('/effect'));await h.flush();assert(!musicElement.paused);m.destroy();
});
test('late and cancelled effects do not play and failed audio loads can retry',async()=>{
 let resolveLoad,now=0,fail=false;
 const h=audioHarness({clock:()=>now,fetchAudio:()=>fail?Promise.reject(Error('offline')):new Promise(resolve=>resolveLoad=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}))});
 h.mixer.setMusic('/music');await h.mixer.unlock();
 const late=h.mixer.play('/late');now=1600;resolveLoad();assert.equal(await late,false);
 const cancelled=h.mixer.play('/cancelled');h.mixer.clearEffects();resolveLoad();assert.equal(await cancelled,false);
 fail=true;assert.equal(await h.mixer.play('/retry'),false);fail=false;
 const retry=h.mixer.play('/retry');resolveLoad();assert.equal(await retry,true);h.mixer.destroy();
});
test('without Web Audio the mixer retains one BGM player without competing effect media',async()=>{
 const h=audioHarness({ContextClass:null});h.mixer.setMusic('/music');h.mixer.setVolumes(.6,.7);await h.mixer.unlock();
 assert.equal(h.media.length,1);assert.equal(h.media[0].volume,.6);assert(!h.media[0].paused);
 assert.equal(await h.mixer.play('/effect'),false);assert.equal(h.media.length,1);h.mixer.destroy();
});
test('preload prioritizes music, deduplicates and bounds concurrency without bypassing cache expiration',async()=>{
 const calls=[],pending=[];let online=false;
 const p=createPreloader({online:()=>online,fetchResource:(url,options)=>{calls.push({url,options});return new Promise(resolve=>pending.push(resolve));}});
 p.add([...music,'/cards/card-01.jpg',...core,...sounds]);p.add(music);p.add(['/assets/audio/bgm/current.mp3'],true);
 assert.equal(calls.length,0);online=true;p.resume();assert.equal(calls.length,2);
 assert.equal(calls[0].url,'/assets/audio/bgm/current.mp3');assert.equal(calls[1].url,music[0]);
 assert(calls.every(c=>c.options.cache==='default'&&c.options.credentials==='omit'));
 pending.shift()({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await tick();
 assert.equal(calls[2].url,music[1]);assert.equal(p.status().ready,1);
 p.stop();while(pending.length)pending.shift()({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await tick();
 assert.equal(p.status().running,0);assert.equal(calls.length,3);
 for(const url of ['/api/auth/me','/data/accounts.json','https://evil.test/assets/a.png','//evil.test/assets/a.mp3','/assets/private.json'])assert(!isResource(url),url);
 assert(isResource('/assets/audio/bgm/bgm_lobby(1).mp3?v=3.0.1'));assert(isResource('/cards/card-01.jpg'));
});
test('refresh limits persist across login and restart, allow resume, and reset at Beijing midnight',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-resource-quota-'));
 try{
  const {createAccounts}=require('../accounts');let a=createAccounts(dir),u=a.register({username:'cacheuser',password:'long-password'});
  const now=Date.parse('2026-11-02T15:59:59Z'),first=a.consumeResources(u,null,now);
  assert.equal(first.day,'2026-11-02');assert.equal(first.dailyAvailable,false);
  assert.equal(a.consumeResources(u,first.job.id,now).resumed,true);
  assert.throws(()=>a.consumeResources(u,null,now),/次数已用完/);
  a=createAccounts(dir);u=a.login({username:'cacheuser',password:'long-password'});
  assert(!a.resourceStatus(u,now).dailyAvailable);
  a.grantResources(u.id,now);assert.throws(()=>a.grantResources(u.id,now),/已有一次/);
  const extra=a.consumeResources(u,null,now);assert(!extra.extraAvailable);assert.notEqual(extra.job.id,first.job.id);
  assert.throws(()=>a.consumeResources(u,first.job.id,now),/已过期/);
  assert.throws(()=>a.consumeResources(u,null,now),/次数已用完/);
  const tomorrow=now+1000;assert.equal(a.resourceStatus(u,tomorrow).day,'2026-11-03');assert(a.resourceStatus(u,tomorrow).dailyAvailable);
  assert.throws(()=>a.consumeResources(u,extra.job.id,tomorrow),/已过期/);
  a.grantResources(u.id,now);assert(!a.resourceStatus(u,tomorrow).extraAvailable);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('manual refresh resumes only missing resources, persists completion, and charges after confirmation',async()=>{
 const storage=new Map(),downloads=[],charges=[],files=[...music.slice(0,2),'/cards/card-01.jpg'].map(url=>({url,bytes:1}));
 let confirmed=false,broken=true,job=null;
 const context=vm.createContext({
  URL,AbortController,setTimeout,clearTimeout,MutationObserver:class{observe(){}},
  document:{querySelector:()=>null,visibilityState:'visible',addEventListener(){}},
  window:{
   navigator:{onLine:true},requestIdleCallback(){},addEventListener(){},confirm:()=>confirmed,
   localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
   fetch:async(url,options)=>{
    let result;
    if(url==='/api/auth/me')result={user:{id:'user'}};
    else if(url==='/api/resources/status')result={day:'2026-11-02',job};
    else if(url==='/api/resources/manifest')result={files,bytes:3};
    else if(url==='/api/resources/refresh'){
     const body=JSON.parse(options.body);charges.push(body);
     if(body.resumeId)assert.equal(body.resumeId,job.id);else job={id:'job',day:'2026-11-02'};
     result={job,day:'2026-11-02'};
    }else{
     downloads.push(url);assert.equal(options.cache,'reload');
     if(broken&&url===files[1].url)throw Error('network');
     return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};
    }
    return {ok:true,json:async()=>result};
   }
  }
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/resource-cache.js'),'utf8'),context);
 const refresh=context.window.LegendResources.refreshAll;
 await refresh();assert.equal(charges.length,0);assert.equal(downloads.length,0);
 confirmed=true;const first=await refresh();assert.equal(first.failed,1);assert.equal(first.done,2);
 assert.equal(charges.length,1);assert(!charges[0].resumeId);
 broken=false;confirmed=false;const resumed=await refresh();
 assert.equal(resumed.failed,0);assert.equal(resumed.done,3);
 assert.equal(charges[1].resumeId,'job');assert.equal(downloads.length,4);assert.equal(downloads[3],files[1].url);
 assert(JSON.parse(storage.get('xcs-resource-job-user')).finished);
 await refresh();assert.equal(charges.length,2);
});
function room(){
 const r=g.createRoom('施法者');g.join(r,'受术者');
 Object.assign(r,{phase:'playing',seats:r.players.map(p=>p.id),currentId:r.hostId,actions:2,round:1});
 return r;
}
test('Witch distinguishes duplicate hand and board cards and transfers the exact selected instance',()=>{
 for(const origin of ['hand','board']){
  const r=room(),[p,q]=r.players;q.hand=[g.card(23)];q.board=[g.card(23)];
  const chosen=q[origin][0];
  g.step(r,{op:'nameGuess',player:p.id,target:q.id,card:g.card(26),choice:23});
  const options=g.view(r,q.id).pending.options;assert(options.some(o=>o.label.includes('你的手牌')));assert(options.some(o=>o.label.includes('你的场上')));
  const opt=r.pending.options.find(o=>o.value===chosen.uid);
  g.command(r,q.id,{type:'choice',promptId:r.pending.id,key:opt.key});
  assert(p.hand.some(c=>c.uid===chosen.uid));assert.equal(q[origin].length,0);assert.equal(q[origin==='hand'?'board':'hand'].length,1);
 }
});
test('Dragon Egg labels duplicate deck and discard candidates without disclosing deck order',()=>{
 const r=room(),p=r.players[0];r.decks.monster=[g.card(35)];r.discard.monster=[g.card(35)];
 g.step(r,{op:'effect',player:p.id,card:g.card(37)});
 const options=g.view(r,p.id).pending.options;assert.equal(options.length,2);
 assert(options.some(o=>o.label.includes('魔物牌库')));assert(options.some(o=>o.label.includes('魔物弃牌堆')));
 const other=g.view(r,r.players[1].id);assert(!other.pending.options);
});
test('resource HTTP enforces authentication and admin grants; assets cache 30 days and support validators',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-resource-http-')),old=process.env.XCS_DATA_DIR;
 process.env.XCS_DATA_DIR=dir;delete require.cache[require.resolve('../server')];
 const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(url,body,headers={}){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {r,data:await r.json()};}
 try{
  assert.equal((await request('/api/resources/manifest')).r.status,401);
  const login=await request('/api/auth/register',{username:'resourceuser',password:'long-password'}),headers={Cookie:login.r.headers.get('set-cookie').split(';')[0]};
  const manifest=await request('/api/resources/manifest',null,headers);assert.equal(manifest.r.status,200);assert.equal(manifest.r.headers.get('cache-control'),'no-store');assert.equal(manifest.data.version,require('../package.json').version);
  assert.equal(manifest.data.files.filter(f=>f.kind==='music').length,5);assert.equal(manifest.data.files.filter(f=>f.kind==='cards').length,37);
  const rank={music:0,cards:1,other:2};assert(manifest.data.files.every((f,i,all)=>isResource(f.url)&&(!i||rank[f.kind]>=rank[all[i-1].kind])));
  const first=await request('/api/resources/refresh',{},headers);assert.equal(first.r.status,200);
  assert.equal((await request('/api/resources/refresh',{},headers)).r.status,400);
  assert.equal((await request('/api/resources/refresh',{resumeId:first.data.job.id},headers)).data.resumed,true);
  const id=login.data.user.id;assert.equal((await request('/api/admin/resource-grant',{id},headers)).r.status,403);
  const key=fs.readFileSync(path.join(dir,'admin.key'),'utf8').trim();
  assert.equal((await request('/api/admin/resource-grant',{id},{'x-admin-key':key})).r.status,200);
  assert.equal((await request('/api/resources/refresh',{},headers)).r.status,200);
  for(const url of ['/cards/card-01.jpg','/assets/audio/bgm/bgm_lobby.mp3?v=3.0.1','/audio-mixer.js']){
   const r=await fetch(base+url),etag=r.headers.get('etag');await r.arrayBuffer();
   assert.equal(r.headers.get('cache-control'),url.endsWith('.js')?'no-cache':'public, max-age=2592000');assert(etag);
   const cached=await fetch(base+url,{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);
  }
  const full=await fetch(base+'/assets/audio/bgm/bgm_lobby.mp3',{headers:{Range:'bytes=0-7','If-Range':'"old"'}});
  assert.equal(full.status,200);await full.arrayBuffer();
 }finally{
  server.closeRealtime();await server.flush();await new Promise(resolve=>server.close(resolve));delete require.cache[require.resolve('../server')];
  if(old===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=old;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
