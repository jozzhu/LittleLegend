// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),g=require('../game');
async function withServer(seed,work){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-lifecycle-')),previous=process.env.XCS_DATA_DIR;
 const a=require('../accounts').createAccounts(dir);
 const users=['host','guest','outsider'].map(username=>a.register({username,password:'password-test'}));
 const cookies=new Map(users.map(u=>[u.id,'xcs_session='+a.session(u)]));
 await seed(a,users,dir);process.env.XCS_DATA_DIR=dir;
 delete require.cache[require.resolve('../server')];const server=require('../server').createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function req(url,body,user,admin=false){
  const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:cookies.get(user.id)}:{}),...(admin?{'X-Admin-Key':a.adminKey}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 }
 try{await work({req,users,dir,a});}
 finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;fs.rmSync(dir,{recursive:true,force:true});}
}
function playedRoom(users,finished=false){
 const r=g.createRoom(users[0].nickname,g.defaults(2));r.code='TABLE';r.players[0].userId=users[0].id;
 g.join(r,users[1].nickname).userId=users[1].id;
 r.seats=r.players.map(p=>p.id);r.phase=finished?'finished':'playing';r.currentId=r.hostId;r.actions=2;
 r.players[0].hand=[g.card(18)];r.players[1].hand=[g.card(23)];
 r.decks.royal=[g.card(19)];r.decks.monster=[g.card(22)];
 if(finished){r.finishedAt=Date.now();r.winners=[r.hostId];}
 r.frames=[{time:Date.now(),state:g.snapshot(r)}];return r;
}
test('lobby host departure transfers ownership; the last departure removes the room and releases its code',async()=>{
 await withServer(()=>{},async({req,users,dir})=>{
  const [h,q]=users;
  await req('/api/create',{code:'TABLE',settings:{maxPlayers:2}},h);
  const joined=(await req('/api/join',{code:'TABLE'},q)).data;
  await req('/api/command?code=TABLE',{type:'away'},h);
  assert.equal((await req('/api/state?code=TABLE',null,q)).data.hostId,joined.playerId);
  await req('/api/join',{code:'TABLE'},h);
  assert.equal((await req('/api/state?code=TABLE',null,q)).data.hostId,joined.playerId);
  await req('/api/command?code=TABLE',{type:'away'},q);
  const returned=(await req('/api/state?code=TABLE',null,h)).data;
  assert.equal(returned.hostId,returned.players.find(p=>p.userId===h.id).id);
  await req('/api/command?code=TABLE',{type:'away'},h);
  assert.equal((await req('/api/join',{code:'TABLE'},q)).status,404);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))),[]);
  assert.equal((await req('/api/create',{code:'TABLE'},q)).status,200);
 });
});
test('all players leaving an unfinished match archives an interruption without creating wins or losses',async()=>{
 await withServer((a,users,dir)=>{
  users[0].stats.coinsEarned=7;a.save();
  fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([playedRoom(users)]));
 },async({req,users,dir})=>{
  const [h,q]=users;
  await req('/api/command?code=TABLE',{type:'away'},h);
  assert.equal((await req('/api/profile',null,h)).data.stats.interruptedGames,0);
  await req('/api/command?code=TABLE',{type:'away'},q);
  assert.equal((await req('/api/state?code=TABLE',null,h)).status,404);
  const info=(await req('/api/admin/storage',null,null,true)).data;assert.equal(info.rooms,0);assert.equal(info.replays,1);
  for(const u of [h,q]){
   const profile=(await req('/api/profile',null,u)).data;
   assert.equal(profile.stats.totalGames,1);assert.equal(profile.stats.games,0);assert.equal(profile.stats.interruptedGames,1);
   assert.equal(profile.stats.wins,0);assert.equal(profile.stats.losses,0);assert.equal(profile.matches[0].outcome,'interrupted');assert.equal(profile.matches[0].won,null);
   const records=(await req('/api/replays',null,u)).data;assert.equal(records[0].outcome,'interrupted');
   const replay=(await req('/api/replay?match='+records[0].id,null,u)).data;
   assert.equal(replay.frames.at(-1).state.phase,'interrupted');assert(replay.frames.every(f=>f.state.players.every(p=>Array.isArray(p.hand))));
  }
  assert.equal((await req('/api/profile',null,h)).data.stats.coinsEarned,7);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))),[]);
 });
});
test('surrender stays in the room; departure dissolves it while shared replays survive until the last participant is deleted',async()=>{
 await withServer((a,users,dir)=>fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([playedRoom(users)])),async({req,users})=>{
  const [h,q,outsider]=users;
  const ended=(await req('/api/command?code=TABLE',{type:'surrender'},q)).data;assert.equal(ended.phase,'finished');
  assert.equal((await req('/api/admin/storage',null,null,true)).data.rooms,1);
  await req('/api/command?code=TABLE',{type:'away'},h);
  const observer=(await req('/api/state?code=TABLE',null,q)).data;
  assert.equal(observer.hostId,observer.players.find(p=>p.userId===q.id).id);
  await req('/api/command?code=TABLE',{type:'away'},q);
  assert.equal((await req('/api/admin/storage',null,null,true)).data.rooms,0);
  for(const [u,wins] of [[h,1],[q,0]]){
   const stats=(await req('/api/profile',null,u)).data.stats;
   assert.equal(stats.totalGames,1);assert.equal(stats.games,1);assert.equal(stats.interruptedGames,0);assert.equal(stats.wins,wins);
  }
  assert.equal((await req('/api/admin/delete-user',{id:h.id,confirmUsername:h.username},null,true)).status,200);
  const records=(await req('/api/replays',null,q)).data;assert.equal(records.length,1);
  assert.equal((await req('/api/replay?match='+records[0].id,null,q)).status,200);
  await req('/api/admin/user',{id:q.id,disabled:true},null,true);
  assert.equal((await req('/api/admin/storage',null,null,true)).data.replays,1);
  await req('/api/admin/delete-user',{id:q.id,confirmUsername:q.username},null,true);
  const info=(await req('/api/admin/storage',null,null,true)).data;assert.equal(info.users,1);assert.equal(info.rooms,0);assert.equal(info.replays,0);
  assert.equal((await req('/api/profile',null,outsider)).data.stats.totalGames,0);
 });
});
test('startup cleans old orphan archives and rooms left behind by permanently deleted accounts',async()=>{
 await withServer((a,users,dir)=>{
  const r=playedRoom(users,true);a.archive(r);
  a.eraseUser(users[0].id);a.eraseUser(users[1].id);
  for(const p of r.players){delete p.userId;delete p.token;p.name='已删除玩家';}
  fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([r]));
 },async({req,dir})=>{
  const info=(await req('/api/admin/storage',null,null,true)).data;assert.equal(info.rooms,0);assert.equal(info.replays,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))),[]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'accounts.json'))).archives.length,0);
 });
});
