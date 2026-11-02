// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const g=require('../game');
function fixture(n=2){const r=g.createRoom('甲',{...g.defaults(n),maxPlayers:n});while(r.players.length<n)g.join(r,String.fromCharCode(20057+r.players.length-1));r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=r.players[0].id;r.actions=2;r.turnNumber=1;r.round=1;r.players[0].turns=1;r.decks.royal=[g.card(18),g.card(19),g.card(17),g.card(18),g.card(19)];r.decks.monster=[g.card(22),g.card(23),g.card(26),g.card(27),g.card(35)];return r;}
function passEmptyDefense(r){while(r.pending?.task.op==='defense'&&r.pending.options.length===1){g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:r.pending.options[0].key});}}
function answer(r,predicate){passEmptyDefense(r);assert(r.pending,'expected prompt');const o=predicate?r.pending.options.find(predicate):r.pending.options[0];assert(o,'expected matching option');g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:o.key});passEmptyDefense(r);}
function play(r,id=0){g.command(r,r.currentId,{type:'play',uid:r.players[0].hand.find(c=>c.id===id)?.uid||r.players[0].hand[0].uid});}
test('all 37 cards have metadata and unique ids',()=>{assert.equal(g.catalog.length,37);assert.equal(new Set(g.catalog.map(c=>c.id)).size,37);assert(g.catalog.every(c=>c.title&&c.image));});
test('ownership follows seated clockwise order, skips leavers and lets an observing host manage pause',()=>{
 const r=fixture(4),[h,q,t,z]=r.players;
 r.seats=[h.id,t.id,q.id,z.id];t.status='away';t.inRoom=false;q.status='surrendered';q.inRoom=true;
 g.command(r,h.id,{type:'away'});assert.equal(r.hostId,q.id);
 g.command(r,q.id,{type:'pauseRequest'});assert(r.paused);
 g.command(r,q.id,{type:'unpause'});assert(!r.paused);
 assert.throws(()=>g.command(r,q.id,{type:'draw',source:'royal'}));
 g.command(r,q.id,{type:'away'});assert.equal(r.hostId,z.id);
 g.command(r,z.id,{type:'away'});assert(r.dissolved);assert.equal(r.hostId,null);assert.equal(r.phase,'interrupted');
});
test('remaining action points prevent early turn end and empty action set allows escape',()=>{const r=fixture(),p=r.players[0];assert.throws(()=>g.command(r,p.id,{type:'end'}),/行动点/);assert.equal(g.view(r,p.id).canEnd,false);r.actions=0;assert.equal(g.view(r,p.id).canEnd,true);g.command(r,p.id,{type:'end'});assert.notEqual(r.currentId,p.id);const stuck=fixture();stuck.decks={royal:[],monster:[],tavern:[]};assert.equal(g.view(stuck,stuck.currentId).canEnd,true);});
test('base deck selects only one member of every role group',()=>{const c=g.composition(g.defaults(3));assert.equal(c[18],4);assert.equal(c[9],undefined);assert.equal(Object.values(c).reduce((a,b)=>a+b),49);assert.throws(()=>g.composition({...g.defaults(),counts:{9:1}}));});
test('lobby settings invalidate readiness; host need not ready',()=>{const r=g.createRoom('甲');const p=g.join(r,'乙');g.command(r,p.id,{type:'ready'});g.command(r,r.hostId,{type:'settings',settings:{expansions:true,extraIds:[4]}});assert(!p.ready);assert.throws(()=>g.command(r,r.hostId,{type:'start'}));g.command(r,p.id,{type:'ready'});g.command(r,r.hostId,{type:'start'});assert.equal(r.phase,'seating');assert(r.players.every(p=>p.roll.history.length));});
test('dice-selected players choose unique seats; initial draw is player-selected',()=>{const r=g.createRoom('甲');const p=g.join(r,'乙');g.command(r,p.id,{type:'ready'});g.command(r,r.hostId,{type:'start'});for(let i=0;i<2;i++)g.command(r,r.seatOrder[r.seatCursor],{type:'seat',seat:i});assert.equal(r.phase,'initial');assert.equal(r.tavern.length,2);assert.equal(r.decks.tavern.length,8);for(let i=0;i<6;i++)g.command(r,r.currentId,{type:'draw',source:i%2?'monster':'royal'});assert.equal(r.phase,'playing');assert.equal(r.currentId,r.seats[0]);assert(r.players.every(p=>p.hand.length===3));});
test('hand privacy, prompt privacy, no credential tokens in view',()=>{const r=fixture();r.players[0].hand=[g.card(6)];r.players[1].hand=[g.card(23)];const v=g.view(r,r.players[0].id);assert.equal(v.players[1].hand,undefined);assert(!JSON.stringify(v).includes(r.players[0].token));play(r,6);const spectator=g.view(r,r.players[1].id);assert.equal(spectator.pending.options,undefined);});
test('princess costs no action; ordinary cards go to discard',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(3),g.card(9),g.card(18),g.card(17)];play(r,3);assert.equal(r.actions,2);assert(p.board.some(c=>c.id===3));play(r,9);assert.equal(r.actions,1);assert(r.discard.royal.some(c=>c.id===9));assert.equal(p.board.length,3);});
test('blacksmith compares selected levels and adds a coin',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(18),g.card(17),g.card(8)];play(r,18);answer(r);answer(r);assert.equal(p.coins,1);assert.equal(p.board.length,2);assert(r.discard.royal.some(c=>c.id===18));});
test('fighter ignores itself, checks no crests and even sum',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(9),g.card(17),g.card(23)];play(r,9);assert.equal(p.coins,1);assert.equal(p.board.length,2);});
test('fighter can always play alone; only an empty placement depends on the room scoring rule',()=>{
 for(const enabled of [false,true])for(const extra of [null,9,31,19]){
  const r=fixture(),p=r.players[0];r.settings.rules.emptyFighter=enabled;
  p.hand=[g.card(9),...(extra===null?[]:[g.card(extra)])];const played=p.hand[0];
  assert(g.legal(r,p,played));play(r,9);
  assert.equal(r.actions,1);assert(r.discard.royal.some(c=>c.uid===played.uid));
  assert.equal(p.coins,extra===9||extra===null&&enabled?1:0);
  const log=r.events.find(e=>e.type==='place').text;
  if(extra===31){assert(log.includes('含无等级的纹章牌，不满足得分条件'));assert(!log.includes('等级合计'));}
  if(extra===9)assert(log.includes('等级合计 0'));
 }
});
test('hero selects hidden non-yellow hand and level comparison',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(6)];q.hand=[g.card(23),g.card(18)];play(r,6);answer(r);assert(r.pending.options.every(o=>!o.card));answer(r);assert.equal(p.coins,1);assert.equal(q.board[0].id,23);assert.equal(q.hand[0].id,18);});
test('gold hero gains on boss crest, silver hero compares level',()=>{for(const [id,target] of [[2,34],[11,27]]){const r=fixture(),p=r.players[0];p.hand=[g.card(id)];r.players[1].hand=[g.card(target)];play(r,id);answer(r);answer(r);assert.equal(p.coins,1);}});
test('berserker places all non-yellow cards and checks all levels',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(12)];q.hand=[g.card(22),g.card(23),g.card(18)];play(r,12);answer(r);assert.equal(p.coins,1);assert.equal(q.board.length,2);assert.equal(q.hand.length,1);});
test('guard cancels attack; attacker card is placed, response card discarded',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(6)];q.hand=[g.card(13),g.card(23)];play(r,6);answer(r);answer(r,o=>o.value.endsWith(':guard'));answer(r,o=>o.value==='royal');assert.equal(p.coins,0);assert(p.board.some(c=>c.id===6));assert.equal(q.board.length,0);assert(r.discard.royal.some(c=>c.id===13));});
test('paladin cancellation returns attack to attacker hand',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(6)];q.hand=[g.card(7),g.card(23)];play(r,6);answer(r);answer(r,o=>o.value.endsWith(':cancel'));answer(r,o=>o.value==='royal');assert.equal(p.hand[0].id,6);assert.equal(p.coins,0);});
test('minister taps and draws after resolution',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(6)];q.hand=[g.card(23)];q.board=[g.card(4)];play(r,6);answer(r);answer(r,o=>o.value.endsWith(':minister'));answer(r);answer(r,o=>o.value==='royal');assert(q.board.find(c=>c.id===4).tapped);assert.equal(q.hand.length,1);assert.equal(p.coins,1);});
test('mage asks opponent to place a matching level, otherwise gains',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(17)];q.hand=[g.card(23)];play(r,17);answer(r);answer(r,o=>o.value===2);assert.equal(r.pending.playerId,q.id);answer(r);assert.equal(q.board[0].id,23);assert.equal(p.coins,0);});
test('witch transfers a named card from board; clown discards matching hand',()=>{for(const id of [25,26]){const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(id)];(id===26?q.board:q.hand).push(g.card(23));play(r,id);answer(r);answer(r,o=>o.value===23);answer(r);if(id===26)assert(p.hand.some(c=>c.id===23));else assert.equal(p.coins,1);}});
test('goblin transfers coin only from richer opponent',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(27)];assert(!g.legal(r,p,p.hand[0]));q.coins=2;play(r,27);answer(r);assert.equal(p.coins,1);assert.equal(q.coins,1);});
test('merchant gives own board card and receives a coin',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(15)];p.board=[g.card(18)];q.coins=1;play(r,15);answer(r);answer(r);assert.equal(p.coins,1);assert(q.hand.some(c=>c.id===18));});
test('bull lets defender choose between crests and a coin',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(28)];q.board=[g.card(34)];q.coins=1;play(r,28);answer(r);answer(r,o=>o.value==='coin');assert.equal(p.coins,1);assert.equal(q.board.length,1);});
test('dragon flame discards board card and gains for level',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(35)];r.players[1].board=[g.card(23)];play(r,35);answer(r);answer(r);assert.equal(p.coins,1);assert(r.discard.monster.some(c=>c.id===23));});
test('baby dragon returns one from every target and requires all levels',()=>{const r=fixture(3),p=r.players[0];p.hand=[g.card(32)];r.players[1].board=[g.card(23)];r.players[2].board=[g.card(22)];play(r,32);answer(r);answer(r);assert.equal(p.coins,1);assert(r.players.slice(1).every(q=>q.hand.length===1&&q.board.length===0));});
test('bat records private reveal and returns the entire board',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(22)];q.hand=[g.card(27)];q.board=[g.card(3)];play(r,22);answer(r);assert.equal(p.privateNotice.cards[0].id,27);assert.equal(q.hand.length,2);assert(!g.view(r,q.id).privateNotice);});
test('black knight retrieves magic sword from arbitrary zone',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(33)];q.hand=[g.card(3)];q.board=[g.card(30)];play(r,33);answer(r);answer(r);assert(p.hand.some(c=>c.id===30));assert(!q.board.some(c=>c.id===30));});
test('slime and king retrieve only their legal discard cards',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(20)];r.discard.monster=[g.card(23)];play(r,20);answer(r);assert(p.hand.some(c=>c.id===23));p.board=[g.card(1)];r.discard.royal=[g.card(6)];g.command(r,p.id,{type:'activate',uid:p.board[0].uid});answer(r);assert(p.hand.some(c=>c.id===6));assert(p.board[0].tapped);});
test('skeleton and wolf place cards without activating their effects',()=>{for(const id of [23,24]){const r=fixture(),p=r.players[0];p.hand=[g.card(id)];r.discard.monster=[g.card(27)];play(r,id);if(id===24)answer(r,o=>o.value==='place');answer(r);assert(p.board.some(c=>c.id===27));assert.equal(p.coins,0);}});
test('monk can free-play a princess without spending another action',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(19)];r.discard.royal=[g.card(3)];play(r,19);answer(r);answer(r,o=>o.value==='play');assert.equal(r.actions,1);assert(p.board.some(c=>c.id===3));});
test('fairy returns tapped self; sword changes next hero target to board',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.board=[g.card(31),g.card(10)];g.command(r,p.id,{type:'activate',uid:p.board[0].uid});answer(r,o=>o.value===p.board[0].uid);assert(p.hand.some(c=>c.id===31));g.command(r,p.id,{type:'activate',uid:p.board[0].uid});p.hand.push(g.card(6));q.board=[g.card(23)];play(r,6);answer(r);answer(r);assert.equal(p.coins,1);assert.equal(q.board.length,0);});
test('magic sword permits yellow target and preserves the hero without a color prompt',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.board=[g.card(30)];p.hand=[g.card(6)];q.hand=[g.card(17)];g.command(r,p.id,{type:'activate',uid:p.board[0].uid});assert.equal(r.pending,null);play(r,6);answer(r);answer(r);assert(p.board.some(c=>c.id===6));assert.equal(p.coins,1);});
test('magic sword exposes both colors as hidden candidates and is consumed only by an applicable hero',()=>{
 for(const id of [2,6,11]){
  const r=fixture(),p=r.players[0],q=r.players[1];p.board=[g.card(30)];p.hand=[g.card(id),g.card(6)];q.hand=[g.card(18),g.card(23)];
  g.command(r,p.id,{type:'activate',uid:p.board[0].uid});assert.equal(r.pending,null);
  play(r,id);answer(r);assert.equal(r.pending.task.op,'attackCard');
  assert.deepEqual(new Set(r.pending.options.map(o=>o.hiddenFaction)),new Set(['royal','monster']));
  assert(r.pending.options.every(o=>!o.card));answer(r,o=>o.hiddenFaction==='monster');
  assert(p.board.some(c=>c.id===id));assert(!p.buffs.magicAllColors);
  assert(!g.legal(r,p,p.hand[0]),'remaining hero cannot target the remaining yellow card');
 }
 const r=fixture(),p=r.players[0],q=r.players[1];p.board=[g.card(30)];p.hand=[g.card(12),g.card(6)];q.hand=[g.card(18),g.card(23)];
 g.command(r,p.id,{type:'activate',uid:p.board[0].uid});play(r,12);answer(r);
 assert.equal(q.hand.length,1);assert.equal(q.hand[0].id,18);assert(p.buffs.magicAllColors);
 play(r,6);answer(r);answer(r);assert(p.board.some(c=>c.id===6));assert(!p.buffs.magicAllColors);
});
test('magic sword respects the Hero-family setting, expires at turn start, and accepts legacy saved buffs',()=>{
 const r=fixture(),p=r.players[0],q=r.players[1];r.settings.rules.heroFamily=false;p.board=[g.card(30)];p.hand=[g.card(2),g.card(6)];q.hand=[g.card(18)];
 g.command(r,p.id,{type:'activate',uid:p.board[0].uid});
 assert(!g.legal(r,p,p.hand[0]));assert(g.legal(r,p,p.hand[1]));
 p.buffs={magicColor:'monster'};play(r,6);answer(r);answer(r);assert(p.board.some(c=>c.id===6));assert(!p.buffs.magicColor);
 p.buffs.magicAllColors=true;r.actions=0;g.command(r,p.id,{type:'end'});r.actions=0;g.command(r,q.id,{type:'end'});assert(!p.buffs.magicAllColors);
});
test('dragon egg searches; fire dragon can retrieve crest discard',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(37)];play(r,37);answer(r,o=>o.card?.id===35);assert(p.hand.some(c=>c.id===35));p.board=[g.card(36)];r.discard.monster.push(g.card(32));g.command(r,p.id,{type:'activate',uid:p.board[0].uid});answer(r,o=>o.card?.id===32);answer(r,o=>o.value==='hand');assert(p.hand.some(c=>c.id===32));});
test('devil asks to tap after level-purple play',()=>{const r=fixture(),p=r.players[0];p.board=[g.card(34)];p.hand=[g.card(20)];r.discard.monster=[g.card(23)];play(r,20);answer(r);answer(r,o=>o.value==='activate');assert.equal(p.coins,1);assert(p.board[0].tapped);});
test('bomb placed on opponent; preparing returns another card then hand-limit discards it',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(21)];q.board=[g.card(3)];q.hand=[g.card(18),g.card(19),g.card(17),g.card(13)];q.turns=1;play(r,21);answer(r);r.actions=0;g.command(r,p.id,{type:'end'});answer(r);assert.equal(q.hand.length,5);assert(!q.board.some(c=>c.id===21));assert(r.discard.monster.some(c=>c.id===21));});
test('preparation returns nonpersistent cards only on owners next turn',()=>{const r=fixture(),p=r.players[0];p.board=[g.card(18),g.card(3)];r.actions=0;g.command(r,p.id,{type:'end'});assert(p.board.some(c=>c.id===18));r.actions=0;g.command(r,r.currentId,{type:'end'});assert(p.hand.some(c=>c.id===18));assert.equal(p.coins,1);});
test('stork triggers on preparation returns; chalice immediately ends at 4',()=>{const r=fixture(),p=r.players[0];p.hand=[g.card(14)];p.board=[g.card(18),g.card(17)];g.step(r,{op:'prepare',player:p.id});g.run(r);answer(r,o=>o.value!=='pass');assert.equal(p.coins,1);p.board=[g.card(5)];p.coins=4;g.step(r,{op:'prepare',player:p.id});g.run(r);assert.equal(r.phase,'finished');});
test('fifth coin ends before dancer/chest responses',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.coins=4;q.board=[g.card(8)];q.hand=[g.card(29)];g.coin(r,p);assert.equal(r.phase,'finished');assert.equal(r.queue.length,0);assert.equal(r.pending,null);assert.equal(q.coins,0);});
test('dancer and chest are optional, resolved clockwise',()=>{const r=fixture(),p=r.players[0],q=r.players[1];q.board=[g.card(8)];g.coin(r,p);g.run(r);answer(r,o=>o.value!=='pass');assert.equal(q.coins,1);assert(!q.board.length);});
test('nun takes impending discard; trigger itself goes to discard',()=>{const r=fixture(),p=r.players[0],q=r.players[1];p.hand=[g.card(9),g.card(17),g.card(23)];q.hand=[g.card(16)];play(r,9);while(r.pending)answer(r,o=>o.value==='take');assert(q.hand.some(c=>c.id===9));assert(r.discard.royal.some(c=>c.id===16));});
test('chest triggers after two draw actions and before next turn',()=>{const r=fixture(),p=r.players[0],q=r.players[1];q.hand=[g.card(29)];g.command(r,p.id,{type:'draw',source:'royal'});g.command(r,p.id,{type:'draw',source:'monster'});g.command(r,p.id,{type:'end'});answer(r,o=>o.value==='coin');assert.equal(q.coins,1);assert.equal(r.currentId,q.id);});
test('pause approval freezes actions; away preserves hand and clockwise host inherits',()=>{const r=fixture(3),p=r.players[0],q=r.players[1];p.hand=[g.card(18)];g.command(r,q.id,{type:'pauseRequest'});assert(!r.paused);g.command(r,p.id,{type:'pauseDecision',approve:true});assert.throws(()=>g.command(r,p.id,{type:'draw',source:'royal'}));g.command(r,p.id,{type:'away'});assert.equal(r.hostId,q.id);assert.equal(p.hand.length,1);g.command(r,p.id,{type:'resume'});assert.equal(p.status,'active');assert.equal(r.hostId,q.id);});
test('host pauses and restores directly; guests require host approval for both',()=>{
 const r=fixture(3),[h,q,t]=r.players;
 g.command(r,h.id,{type:'pauseRequest'});assert(r.paused);
 assert.throws(()=>g.command(r,q.id,{type:'unpause'}),/房主/);
 g.command(r,q.id,{type:'resumeRequest'});g.command(r,q.id,{type:'resumeRequest'});assert.deepEqual(r.resumeRequests,[q.id]);assert(r.paused);
 assert.throws(()=>g.command(r,t.id,{type:'resumeDecision',approve:true}),/房主/);
 g.command(r,h.id,{type:'resumeDecision',approve:false});assert(r.paused);assert.equal(r.resumeRequests.length,0);
 g.command(r,q.id,{type:'resumeRequest'});g.command(r,h.id,{type:'resumeDecision',approve:true});assert(!r.paused);
 assert.throws(()=>g.command(r,h.id,{type:'resumeDecision',approve:true}),/失效/);
 g.command(r,q.id,{type:'pauseRequest'});g.command(r,h.id,{type:'pauseDecision',approve:false});assert(!r.paused);
 g.command(r,h.id,{type:'pauseRequest'});g.command(r,h.id,{type:'unpause'});assert(!r.paused);
});
test('both-role options preserve defaults, accept independent counts and invalidate ready',()=>{
 const r=g.createRoom('甲'),q=g.join(r,'乙');g.command(r,q.id,{type:'ready'});
 g.command(r,r.hostId,{type:'settings',settings:{bothRoles:[0,5],counts:{18:2,9:6}}});
 const c=g.composition(r.settings);assert.equal(c[18],2);assert.equal(c[9],6);assert.equal(c[22],4);assert.equal(c[21],4);assert(!q.ready);
 assert.throws(()=>g.command(r,r.hostId,{type:'settings',settings:{bothRoles:[10]}}));
 assert.throws(()=>g.command(r,r.hostId,{type:'settings',settings:{bothRoles:[],counts:{9:1}}}));
 g.command(r,q.id,{type:'ready'});g.command(r,r.hostId,{type:'start'});while(r.phase==='seating')g.command(r,r.seatOrder[r.seatCursor],{type:'seat',seat:r.seats.indexOf(null)});
 const all=[...Object.values(r.decks).flat(),...r.tavern];for(const id of [18,9,22,21])assert.equal(all.filter(c=>c.id===id).length,c[id]);
});
test('disabled role groups and excluded EX ignore old overrides and retain standard default composition',()=>{
 const r=g.createRoom('甲',{disabledGroups:[0],expansions:true,extraIds:[4],counts:{18:12,4:7,14:9}});
 const c=g.composition(r.settings);assert.equal(c[18],undefined);assert.equal(c[4],7);assert.equal(c[14],undefined);
 g.command(r,r.hostId,{type:'settings',settings:{expansions:false}});
 assert.equal(g.composition(r.settings)[4],undefined);
});
test('surrender during seating and initial draws never strands the remaining players',()=>{
 for(const phase of ['seating','initial']){
  const r=g.createRoom('甲',g.defaults(3));g.join(r,'乙');g.join(r,'丙');for(const p of r.players.slice(1))g.command(r,p.id,{type:'ready'});g.command(r,r.hostId,{type:'start'});
  if(phase==='initial')while(r.phase==='seating')g.command(r,r.seatOrder[r.seatCursor],{type:'seat',seat:r.seats.indexOf(null)});
  const id=phase==='seating'?r.seatOrder[r.seatCursor]:r.currentId;g.command(r,id,{type:'surrender'});
  while(r.phase==='seating')g.command(r,r.seatOrder[r.seatCursor],{type:'seat',seat:r.seats.indexOf(null)});
  let steps=0;while(r.phase==='initial'&&steps++<10){assert.notEqual(r.currentId,id);g.command(r,r.currentId,{type:'draw',source:'royal'});}
  assert.equal(r.phase,'playing');assert.notEqual(r.currentId,id);
 }
});
test('surrender is irreversible and returning player is spectator',()=>{const r=fixture(3),p=r.players[0];p.hand=[g.card(18)];g.command(r,p.id,{type:'surrender'});g.command(r,p.id,{type:'resume'});assert.equal(p.status,'surrendered');assert.equal(g.view(r,p.id).players[0].hand,undefined);assert.throws(()=>g.command(r,p.id,{type:'draw',source:'royal'}));});
test('host surrender transfers clockwise, releases a response, and new host controls a paused game',()=>{
 const r=fixture(3),[h,q,t]=r.players;r.seats=[h.id,t.id,q.id];q.hand=[g.card(6)];h.hand=[g.card(23)];r.currentId=q.id;
 g.command(r,q.id,{type:'play',uid:q.hand[0].uid});assert(r.pending);const target=r.pending.options.find(o=>o.value===h.id);g.command(r,q.id,{type:'choice',promptId:r.pending.id,key:target.key});assert.equal(r.pending.playerId,h.id);
 g.command(r,h.id,{type:'pauseRequest'});g.command(r,h.id,{type:'surrender'});
 assert.equal(r.hostId,t.id);assert.equal(r.phase,'playing');assert.notEqual(r.pending?.playerId,h.id);assert(r.paused);
 g.command(r,t.id,{type:'unpause'});assert(!r.paused);
});
