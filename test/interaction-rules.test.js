// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const g=require('../game');
function fixture(n=2){
 const r=g.createRoom('攻击者',g.defaults(n));
 while(r.players.length<n)g.join(r,'玩家'+r.players.length);
 Object.assign(r,{phase:'playing',seats:r.players.map(p=>p.id),currentId:r.hostId,actions:2,round:1});
 r.decks.royal=[g.card(18),g.card(19)];r.decks.monster=[g.card(23),g.card(27)];
 for(const p of r.players.slice(1)){p.hand=[g.card(23),g.card(18)];p.board=[g.card(34),g.card(23)];p.coins=2;}
 r.players[0].board=[g.card(18)];return r;
}
function answer(r,value){const pending=r.pending,option=pending.options.find(o=>o.value===value);assert(option);g.command(r,pending.playerId,{type:'choice',promptId:pending.id,key:option.key});}
test('every attack waits for its target even when no response card is available',()=>{
 for(const c of g.catalog.filter(c=>c.attack)){
  const r=fixture(),[p,q]=r.players;p.hand=[g.card(c.id)];
  g.command(r,p.id,{type:'play',uid:p.hand[0].uid});
  if(r.pending.task.op==='targetChosen')answer(r,q.id);
  assert.equal(r.pending.task.op,'defense',c.title);
  assert.equal(r.pending.playerId,q.id);
  assert.equal(r.pending.options.length,1);
  assert.equal(r.pending.options[0].value,'pass');
  const attacker=g.view(r,p.id),defender=g.view(r,q.id);
  assert.equal(attacker.pending.options,undefined);
  assert.equal(defender.pending.options.length,1);
  assert(!r.events.some(e=>e.type==='attack'||e.type==='peek'),'no attack resolves before confirmation');
  answer(r,'pass');
  assert(r.events.some(e=>e.type==='responseChoice'&&e.actor===q.id&&!e.accepted));
 }
});
test('multi-target attacks ask each player clockwise before resolving',()=>{
 const r=fixture(4),p=r.players[0];p.hand=[g.card(32)];
 g.command(r,p.id,{type:'play',uid:p.hand[0].uid});
 for(const q of r.players.slice(1)){
  assert.equal(r.pending.task.op,'defense');assert.equal(r.pending.playerId,q.id);
  assert(r.players.slice(1).every(q=>q.board.length===2));answer(r,'pass');
 }
 assert.equal(r.pending.task.op,'babyReturn');
});
test('hidden selection shuffles a copy, exposes only backs, and binds choices to opaque option keys',()=>{
 const r=fixture(),[p,q]=r.players;q.hand=[g.card(23),g.card(27),g.card(22)];
 const original=q.hand.map(c=>c.uid),randomInt=crypto.randomInt;
 try{
  crypto.randomInt=()=>0;
  g.step(r,{op:'attackEffect',player:p.id,card:g.card(6),targets:[q.id]});
 }finally{crypto.randomInt=randomInt;}
 assert.deepEqual(q.hand.map(c=>c.uid),original);
 assert.notDeepEqual(r.pending.options.map(o=>o.value),original);
 const v=g.view(r,p.id),options=v.pending.options;
 assert(options.every(o=>o.hiddenFaction==='monster'&&!o.card&&!o.value));
 for(const uid of original)assert(!JSON.stringify(v).includes(uid));
 assert.deepEqual(v.players[1].handBacks,['monster','monster','monster']);
});
test('mage and name declarations broadcast targets, choices and results without disclosing unrelated hidden cards',()=>{
 for(const id of [17,25,26]){
  const r=fixture(3),[p,q,observer]=r.players;p.hand=[g.card(id)];
  g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,q.id);answer(r,'pass');answer(r,id===17?2:23);
  const e=g.view(r,observer.id).events.find(e=>['guess','declaration'].includes(e.type));
  assert(e);assert.equal(e.actor,p.id);assert.equal(e.target,q.id);
  assert(e.text.includes(q.name));assert(e.text.includes('命中'));
  assert(id===17?e.level===2:e.declaredCardId===23);
 }
});
test('bat dismissal clears private reveal and a stale acknowledgement cannot clear a new reveal',()=>{
 const r=fixture(),[p,q]=r.players;p.hand=[g.card(22)];
 g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,q.id);answer(r,'pass');
 assert(p.privateNotice?.id);assert.equal(g.view(r,q.id).privateNotice,null);
 const old=p.privateNotice.id;
 g.command(r,p.id,{type:'ackNotice',noticeId:'wrong'});assert.equal(p.privateNotice.id,old);
 g.command(r,p.id,{type:'ackNotice',noticeId:old});assert.equal(g.view(r,p.id).privateNotice,null);
 p.privateNotice={id:'new',cards:[]};g.command(r,p.id,{type:'ackNotice',noticeId:old});assert.equal(p.privateNotice.id,'new');
});
test('discard order is global across factions and combat logs explain the score check',()=>{
 const r=fixture(),[p,q]=r.players;p.hand=[g.card(6)];q.hand=[g.card(23)];
 g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,q.id);answer(r,'pass');answer(r,q.hand[0].uid);
 assert(r.events.some(e=>e.type==='effectResult'&&e.text.includes('Lv.4')&&e.text.includes('Lv.2')));
 r.actions=2;p.hand=[g.card(23)];r.discard.monster.push(g.card(27));
 g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,r.discard.monster[0].uid);
 assert(r.discard.royal[0].discardOrder<r.discard.monster[0].discardOrder);
});
