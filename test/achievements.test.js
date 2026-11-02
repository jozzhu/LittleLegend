// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {titles,createAccounts}=require('../accounts'),g=require('../game');
const earned=(id,stats={},matches=[])=>titles.find(t=>t.id===id).test(stats,matches);
test('interrupted matches do not fill, replace or unlock completed-match achievement windows',()=>{
 const interrupted={outcome:'interrupted',won:null,responses:0,responseOffers:1,responseSuccesses:1};
 assert(!earned('never-return',{},[{responses:0},interrupted,interrupted]));
 assert(!earned('tragic',{},[{won:false},{won:false},interrupted]));
 assert(!earned('responder',{},[{...interrupted,responses:1}]));
 assert(earned('tragic',{},[{won:false},interrupted,{won:false},interrupted,{won:false},interrupted]));
 assert(!earned('never-return',{},[{responses:11},{responses:0},interrupted,{responses:0},interrupted]));
});
test('engine records successful optional response resolution and separates merchant payments',()=>{
 function fixture(){const r=g.createRoom('甲');g.join(r,'乙');r.phase='playing';r.seats=r.players.map(p=>p.id);r.currentId=r.hostId;r.actions=2;r.decks.royal=[g.card(18),g.card(19)];r.decks.monster=[g.card(23)];return r;}
 function answer(r,value){while(r.pending?.task.op==='defense'&&r.pending.options.length===1)g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:r.pending.options[0].key});const option=r.pending.options.find(o=>typeof value==='function'?value(o.value):o.value===value);assert(option);g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:option.key});while(r.pending?.task.op==='defense'&&r.pending.options.length===1)g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:r.pending.options[0].key});}
 const r=fixture(),[p,q]=r.players;p.hand=[g.card(6)];q.hand=[g.card(13),g.card(23)];g.command(r,p.id,{type:'play',uid:p.hand[0].uid});answer(r,q.id);answer(r,v=>v.endsWith(':guard'));answer(r,'royal');
 assert(r.events.some(e=>e.type==='responseResult'&&e.actor===q.id&&e.success));assert(r.events.some(e=>e.type==='draw'&&e.actor===q.id&&e.faction==='royal'));
 const trade=fixture(),[seller,buyer]=trade.players;seller.hand=[g.card(15)];seller.board=[g.card(18)];buyer.coins=1;g.command(trade,seller.id,{type:'play',uid:seller.hand[0].uid});answer(trade,buyer.id);answer(trade,seller.board[0].uid);assert(trade.events.some(e=>e.type==='tradeCoin'));assert(!trade.events.some(e=>e.type==='stealCoin'));
 const theft=fixture(),[robber,victim]=theft.players;robber.hand=[g.card(27)];victim.coins=2;g.command(theft,robber.id,{type:'play',uid:robber.hand[0].uid});answer(theft,victim.id);assert(theft.events.some(e=>e.type==='stealCoin'));
});
test('recent-three titles use completed match windows and inclusive response threshold',()=>{
 assert(!earned('never-return',{},[{responses:0},{responses:0}]));
 assert(earned('never-return',{},[{responses:100},{responses:3},{responses:3},{responses:4}]));
 assert(!earned('never-return',{},[{responses:3},{responses:4},{responses:4}]));
 assert(!earned('never-return',{},[{},{responses:0},{responses:0}]));
 assert(earned('tragic',{},[{won:true},{won:false},{won:false},{won:false}]));
 assert(!earned('tragic',{},[{won:false},{won:false},{won:true}]));
 assert(!earned('tragic',{},[{won:false},{won:false}]));
});
test('perfect responses require a nonempty fully accepted and successfully resolved match',()=>{
 assert(!earned('responder',{},[{responseOffers:0,responses:0,responseSuccesses:0}]));
 assert(!earned('responder',{},[{responseOffers:2,responses:1,responseSuccesses:1}]));
 assert(!earned('responder',{},[{responseOffers:2,responses:2,responseSuccesses:1}]));
 assert(!earned('responder',{},[{responseOffers:2,responses:2}]));
 assert(earned('responder',{},[{responseOffers:2,responses:2,responseSuccesses:2},{responseOffers:1,responses:0}]));
});
test('robber requires ten coins and faction preference compares selections, not acquisitions',()=>{
 assert(!earned('robber',{stolenCoins:9}));assert(earned('robber',{stolenCoins:10}));
 assert(!earned('royal',{royalCards:100,monsterCards:0}));
 assert(earned('royal',{royalSelections:1,monsterSelections:0}));
 assert(earned('monster',{royalSelections:1,monsterSelections:2}));
 for(const id of ['royal','monster'])assert(!earned(id,{royalSelections:5,monsterSelections:5}));
});
test('completed match response counters persist and incomplete matches cannot grant perfect responses',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-achievements-'));
 try{const a=createAccounts(dir),u=a.register({username:'tester',password:'long-password'}),r=g.createRoom('tester');r.players[0].userId=u.id;const p=r.players[0];
  r.phase='playing';const before=structuredClone(r);r.events.push({type:'responseChoice',actor:p.id,accepted:true},{type:'responseResult',actor:p.id,success:true},{type:'draw',actor:p.id,faction:'monster'},{type:'tradeCoin',actor:p.id});
  a.measure(r,before);assert.equal(u.stats.monsterSelections,1);assert.equal(u.stats.stolenCoins,0);assert(!a.profile(u).titles.some(t=>t.id==='responder'));
  const playing=structuredClone(r);r.phase='finished';r.finishedAt=Date.now();r.winners=[p.id];a.measure(r,playing);
  assert.equal(u.matches[0].responseSuccesses,1);assert(a.profile(u).titles.some(t=>t.id==='responder'));assert.equal(a.profile(u).favoriteFaction,'魔物');
  a.measure(r,r);assert.equal(u.matches.length,1);assert.equal(u.stats.monsterSelections,1);
  const loaded=createAccounts(dir),saved=loaded.data.users[0];assert(loaded.profile(saved).titles.some(t=>t.id==='responder'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('achievement migration is idempotent and does not infer missing successful responses',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-title-migrate-'));
 try{const a=createAccounts(dir),u=a.register({username:'tester',password:'long-password'}),r=g.createRoom('tester'),p=r.players[0];p.userId=u.id;
  u.matches=[{id:r.matchId,won:false}];u.stats.stolenCoins=3;
  r.events=[{type:'responseChoice',actor:p.id,accepted:true},{type:'draw',actor:p.id,text:'tester 从皇室牌库获得 1 张牌'},{type:'stealCoin',actor:p.id},{type:'coin'},{type:'coin'},{type:'trade',text:'tester 将「牌」交付 其他人'}];
  a.migrateAchievements([r]);assert.equal(u.stats.royalSelections,1);assert.equal(u.stats.stolenCoins,2);assert.equal(u.matches[0].responses,1);assert(!a.profile(u).titles.some(t=>t.id==='responder'));
  a.migrateAchievements([r]);assert.equal(u.stats.royalSelections,1);assert.equal(u.stats.stolenCoins,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
