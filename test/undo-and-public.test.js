// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const g=require('../game');
function fixture(n=3){
 const r=g.createRoom('甲',g.defaults(n));while(r.players.length<n)g.join(r,'玩家'+r.players.length);
 r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=r.hostId;r.actions=2;r.round=1;r.turnNumber=1;
 r.decks.royal=[g.card(18),g.card(19)];r.decks.monster=[g.card(23),g.card(22)];
 return r;
}
function answer(r,value){const p=r.pending;assert(p);const o=p.options.find(o=>value===undefined||o.value===value);assert(o);g.command(r,p.playerId,{type:'choice',promptId:p.id,key:o.key});}
test('dragonling choices belong to the attacker for every opponent and check the chosen cards',()=>{
 const r=fixture(),[p,q,t]=r.players;p.hand=[g.card(32)];q.board=[g.card(23),g.card(3)];t.board=[g.card(22)];
 g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,'pass');answer(r,'pass');
 assert.equal(r.pending.playerId,p.id);assert(r.pending.text.includes(q.name));
 const choice=r.pending.options.find(o=>o.card.id===3);
 assert.throws(()=>g.command(r,q.id,{type:'choice',promptId:r.pending.id,key:choice.key}),/响应/);
 answer(r,choice.value);assert(q.hand.some(c=>c.id===3));
 assert.equal(r.pending.playerId,p.id);answer(r);assert(t.hand.some(c=>c.id===22));assert.equal(p.coins,0);
});
test('tavern and discard recovery publish card names while blind decks stay private',()=>{
 const r=fixture(),p=r.players[0];r.tavern=[g.card(3)];g.drawOne(r,p,r.tavern[0].uid);
 const visible=r.events.at(-1);assert.equal(visible.cardId,3);assert(visible.text.includes('「公主」'));
 g.drawOne(r,p,'monster');const hidden=r.events.at(-1);assert(!hidden.cardId);assert(!hidden.text.includes('蝙蝠'));
 p.hand=[g.card(19)];r.discard.royal=[g.card(3)];g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r);answer(r,'hand');
 for(const q of r.players){const v=g.view(r,q.id);assert(v.events.some(e=>e.type==='retrieve'&&e.text.includes('「公主」')&&e.cardId===3));}
});
test('hand-limit discarding requires zero action points, overflow, current turn and completed responses',()=>{
 const r=fixture(),p=r.players[0];p.hand=Array.from({length:6},()=>g.card(23));
 assert.equal(g.view(r,p.id).canDiscard,false);
 assert.throws(()=>g.command(r,p.id,{type:'discard',uid:p.hand[0].uid}),/行动点/);
 r.actions=0;assert(g.view(r,p.id).canDiscard);g.command(r,p.id,{type:'discard',uid:p.hand[0].uid});g.command(r,p.id,{type:'discard',uid:p.hand[0].uid});
 assert.equal(p.hand.length,4);assert.throws(()=>g.command(r,p.id,{type:'discard',uid:p.hand[0].uid}),/上限/);
});
test('undo requires every other participant, freezes play, preserves chat and supports rejection and cancellation',()=>{
 const r=fixture(),[p,q,t]=r.players;g.command(r,p.id,{type:'draw',source:'royal'});const drawn=p.hand[0].uid;
 g.command(r,q.id,{type:'undoRequest'});const request=r.undoRequest.id;
 assert.throws(()=>g.command(r,p.id,{type:'draw',source:'monster'}),/回退/);
 assert.throws(()=>g.command(r,q.id,{type:'undoVote',requestId:request,approve:true}),/投票/);
 g.command(r,p.id,{type:'undoVote',requestId:request,approve:true});assert(r.undoRequest);
 assert.throws(()=>g.command(r,p.id,{type:'undoVote',requestId:request,approve:true}),/投票/);
 g.command(r,t.id,{type:'chat',text:'保留的聊天'});
 g.command(r,t.id,{type:'undoVote',requestId:request,approve:true});
 assert(!r.undoRequest);assert.equal(r.actions,2);assert(!r.players[0].hand.length);assert(r.decks.royal.some(c=>c.uid===drawn));assert.equal(r.chat[0].text,'保留的聊天');
 assert(r.events.some(e=>e.type==='draw'&&e.undone));assert(r.events.some(e=>e.type==='undo'));
 assert(!JSON.stringify(g.view(r,p.id)).includes('statDeltas'));assert(!('undoStack' in g.snapshot(r)));
 g.command(r,p.id,{type:'draw',source:'monster'});g.command(r,p.id,{type:'undoRequest'});
 g.command(r,q.id,{type:'undoVote',requestId:r.undoRequest.id,approve:false});assert.equal(r.players[0].hand.length,1);
 g.command(r,p.id,{type:'undoRequest'});g.command(r,p.id,{type:'undoCancel',requestId:r.undoRequest.id});assert(!r.undoRequest);
 g.command(r,p.id,{type:'undoRequest'});g.command(r,t.id,{type:'away'});assert(!r.undoRequest);assert.equal(r.undoStack.length,0);
});
test('undo restores a previous turn and cannot skip consent from a surrendered spectator',()=>{
 const r=fixture(),[p,q,t]=r.players;t.status='surrendered';t.inRoom=true;r.actions=0;
 g.command(r,p.id,{type:'end'});assert.equal(r.currentId,q.id);g.command(r,q.id,{type:'undoRequest'});
 g.command(r,p.id,{type:'undoVote',requestId:r.undoRequest.id,approve:true});assert(r.undoRequest);
 g.command(r,t.id,{type:'undoVote',requestId:r.undoRequest.id,approve:true});assert.equal(r.currentId,p.id);assert.equal(r.actions,0);
 r.phase='finished';assert.throws(()=>g.command(r,p.id,{type:'undoRequest'}),/阶段/);
});
test('HTTP undo reverses only action statistics, survives reload, refreshes pending keys and remains private',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-undo-')),previous=process.env.XCS_DATA_DIR;
 const accounts=require('../accounts').createAccounts(dir),a=accounts.register({username:'undo_a',password:'password-test'}),b=accounts.register({username:'undo_b',password:'password-test'});
 const cookies=[a,b].map(u=>'xcs_session='+accounts.session(u));
 const r=fixture(2),[p,q]=r.players;p.userId=a.id;q.userId=b.id;p.hand=[g.card(27)];q.coins=2;
 accounts.measure(r);fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify([r]));process.env.XCS_DATA_DIR=dir;
 delete require.cache[require.resolve('../server')];let server=require('../server').createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let base='http://127.0.0.1:'+server.address().port;
 async function req(user,url,body){const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Cookie:cookies[user],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};}
 async function command(user,body){const res=await req(user,'/api/command?code='+r.code,body);assert.equal(res.status,200,JSON.stringify(res.data));return res.data;}
 try{
  let state=await command(0,{type:'play',uid:p.hand[0].uid});
  state=await command(0,{type:'choice',promptId:state.pending.id,key:state.pending.options[0].key});
  const pending=(await req(1,'/api/state?code='+r.code)).data.pending;
  state=await command(1,{type:'choice',promptId:pending.id,key:pending.options[0].key});
  assert.equal(state.players[0].coins,1);
  assert.equal((await req(0,'/api/profile')).data.stats.stolenCoins,1);
  await command(0,{type:'undoRequest'});
  await new Promise(resolve=>server.close(resolve));delete require.cache[require.resolve('../server')];server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  state=(await req(1,'/api/state?code='+r.code)).data;const version=state.version;
  state=await command(1,{type:'undoVote',requestId:state.undoRequest.id,approve:true});
  assert(state.version>version);assert.equal(state.players[0].coins,0);assert.equal(state.players[1].coins,2);
  assert.notEqual(state.pending.id,pending.id);assert.notEqual(state.pending.options[0].key,pending.options[0].key);
  assert.equal((await req(0,'/api/profile')).data.stats.stolenCoins,0);
  assert.equal((await req(0,'/api/profile')).data.stats.coinsEarned,0);
  assert.equal((await req(0,'/api/profile')).data.stats.attacks,1);
  assert.equal((await req(1,'/api/profile')).data.stats.responseOffers,0);
  assert(!JSON.stringify(state).includes('undoStack'));assert.equal(state.players[0].hand,undefined);
  assert.equal((await req(1,'/api/command?code='+r.code,{type:'choice',promptId:pending.id,key:pending.options[0].key})).status,400);
  state=await command(1,{type:'choice',promptId:state.pending.id,key:state.pending.options[0].key});
  assert.equal((await req(0,'/api/profile')).data.stats.stolenCoins,1);
  assert.equal((await req(1,'/api/profile')).data.stats.responseOffers,1);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=previous;delete require.cache[require.resolve('../server')];fs.rmSync(dir,{recursive:true,force:true});}
});
