// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),g=require('../game');
const {planTransitions}=require('../public/motion');
const {filterCards}=require('../public/game-reference');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function state(){return {code:'TABLE',matchId:'match',events:[],players:[{id:'me',hand:[],board:[],handCount:0},{id:'other',board:[],handCount:0}],discard:{royal:[],monster:[]},tavern:[]};}
test('motion follows visible card identity and never invents an opponent hidden face',()=>{
 const before=state(),after=structuredClone(before),card=g.card(3);before.players[0].hand=[card];after.players[0].board=[card];
 const move=planTransitions(before,after,'me');assert.equal(move.length,1);assert.equal(move[0].from.zone,'hand');assert.equal(move[0].to.zone,'board');
 const hidden=structuredClone(after);hidden.events=[{id:'draw',type:'draw',actor:'other',faction:'monster',source:'monster'}];hidden.players[1].handCount=1;
 const draw=planTransitions(after,hidden,'me').find(m=>m.to.owner==='other');assert.equal(draw.card,null);assert.equal(draw.faction,'monster');
 hidden.events.push({id:'undo',type:'undo'});assert.deepEqual(planTransitions(after,hidden,'me'),[]);
});
test('opponent public placement, response discards and tavern pickups animate without exposing other hand cards',()=>{
 const before=state(),after=structuredClone(before),placed=g.card(18),response=g.card(13),tavern=g.card(3);
 before.players[1].handCount=3;before.tavern=[tavern];after.players[1].handCount=2;after.players[1].board=[placed];after.discard.royal=[response];
 after.events=[{id:'discard',type:'discard',actor:'other',cardId:13,cardUid:response.uid},{id:'draw',type:'draw',actor:'other',cardId:3,cardUid:tavern.uid,faction:'royal',source:'tavern'}];
 const moves=planTransitions(before,after,'me',g.catalog);
 assert(moves.some(m=>m.uid===placed.uid&&m.from.owner==='other'&&m.from.zone==='hand'&&m.to.zone==='board'));
 assert(moves.some(m=>m.uid===response.uid&&m.from.owner==='other'&&m.to.zone==='discard'));
 assert(moves.some(m=>m.card?.uid===tavern.uid&&m.from.zone==='tavern'&&m.to.owner==='other'));
});
test('opponent attack plays appear while waiting and resolve later even when the play event is no longer new',()=>{
 const before=state(),pending=structuredClone(before),attack=g.card(6);
 pending.pending={playerId:'me'};pending.events=[{id:'play',type:'play',actor:'other',cardId:attack.id,cardUid:attack.uid}];
 const played=planTransitions(before,pending,'me',g.catalog);
 assert.equal(played.length,1);assert.equal(played[0].from.owner,'other');assert.equal(played[0].to.zone,'resolving');assert.equal(played[0].card.id,6);
 const resolved=structuredClone(pending);resolved.pending=null;resolved.discard.royal=[attack];resolved.events.push({id:'discard',type:'discard',actor:'other',cardId:attack.id,cardUid:attack.uid});
 const moves=planTransitions(pending,resolved,'me',g.catalog);
 assert.equal(moves.length,1);assert.equal(moves[0].from.zone,'resolving');assert.equal(moves[0].to.zone,'discard');
});
test('public repeated copies use instance identity and opponent discard retrieval animates to the correct hand',()=>{
 const before=state(),after=structuredClone(before),old=g.card(3),played=g.card(3),retrieved=g.card(20);
 before.players[1].board=[old];after.players[1].board=[old];before.discard.monster=[retrieved];after.players[1].handCount=1;
 after.events=[{id:'play',type:'play',actor:'other',cardId:3,cardUid:played.uid},{id:'retrieve',type:'retrieve',actor:'other',cardId:20}];
 const moves=planTransitions(before,after,'me',g.catalog);
 assert(moves.some(m=>m.uid===played.uid&&m.to.zone==='resolving'));
 assert(moves.some(m=>m.uid===retrieved.uid&&m.from.zone==='discard'&&m.to.owner==='other'));
});
test('a historical play never assigns the wrong hand owner when a previously returned card is placed again by an effect',()=>{
 const before=state(),after=structuredClone(before),card=g.card(23);
 before.events=[{id:'old-play',type:'play',actor:'me',cardId:23,cardUid:card.uid}];after.events=[...before.events,{id:'place',type:'place',actor:'me',target:'other'}];
 after.players[1].board=[card];
 const move=planTransitions(before,after,'me',g.catalog).find(m=>m.uid===card.uid);
 assert.equal(move.from.owner,'other');assert.equal(move.from.zone,'hand');
});
test('every player receives enough public information for opponent play and blind draws in two through five player games',()=>{
 for(let n=2;n<=5;n++){
  const r=g.createRoom('甲',g.defaults(n));while(r.players.length<n)g.join(r,'乙'+r.players.length);
  r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=r.hostId;r.actions=2;r.round=1;
  r.players[0].hand=[g.card(3)];r.decks.monster=[g.card(23)];
  const before=r.players.map(p=>structuredClone(g.view(r,p.id)));
  g.command(r,r.hostId,{type:'play',uid:r.players[0].hand[0].uid});
  for(let i=1;i<n;i++){
   const after=structuredClone(g.view(r,r.players[i].id)),moves=planTransitions(before[i],after,r.players[i].id,g.catalog);
   assert(moves.some(m=>m.card?.id===3&&m.from.owner===r.hostId&&m.to.zone==='board'));
   assert.equal(after.players[0].hand,undefined);
  }
  const prior=r.players.map(p=>structuredClone(g.view(r,p.id)));
  g.command(r,r.hostId,{type:'draw',source:'monster'});
  for(let i=1;i<n;i++){
   const after=g.view(r,r.players[i].id),move=planTransitions(prior[i],after,r.players[i].id,g.catalog).find(m=>m.to.owner===r.hostId&&m.from.zone==='monster');
   assert(move);assert.equal(move.card,null);assert.equal(move.faction,'monster');
   const draw=after.events.at(-1);assert.equal(draw.cardUid,undefined);assert.equal(draw.cardId,undefined);
  }
 }
});
test('motion renderer creates a visible flight from an opponent hand and shows only a back for their hidden draw',()=>{
 const flights=[],animations=[];let cards=[];
 class Element{
  constructor(rect={left:10,top:20,width:70,height:100}){this.bounds=rect;this.style={};this.dataset={};}
  closest(){return null;}getBoundingClientRect(){return this.bounds;}
  querySelector(){return this.hand||null;}
  setAttribute(){}remove(){this.removed=true;}
  animate(frames,options){animations.push({node:this,frames,options});return {cancel(){},finished:new Promise(()=>{})};}
 }
 const opponent=new Element({left:300,top:30,width:200,height:120});opponent.dataset.playerId='other';opponent.hand=new Element({left:350,top:70,width:90,height:50});
 const hand=new Element(),center=new Element(),discard=new Element(),deck=new Element();
 const document={visibilityState:'visible',body:{append(node){flights.push(node);}},addEventListener(){},
  createElement(){return new Element();},
  querySelectorAll(selector){if(selector==='#room .game-card')return cards;if(selector==='[data-player-id]')return [opponent];return [];},
  querySelector(selector){if(selector.includes('data-source'))return deck;if(selector==='#hand-cards')return hand;if(selector==='#discard-preview')return discard;if(selector==='.table-center')return center;return null;}};
 const initial=state();initial.version=1;initial.players[1].handCount=1;
 const ctx=vm.createContext({document,Element,window:{matchMedia:()=>({matches:false})},seat:{playerId:'me'},meta:{cards:g.catalog},sessionEpoch:1,replay:null,s:initial,
  current(){return ctx.s;},render(){cards=ctx.s.players.flatMap(p=>p.board.map(card=>Object.assign(new Element(),{cardData:card})));}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/motion.js'),'utf8'),ctx);ctx.render();
 const next=structuredClone(initial),card=g.card(3);next.version=2;next.players[1].board=[card];next.events=[{id:'play',type:'play',actor:'other',cardId:3,cardUid:card.uid}];ctx.s=next;ctx.render();
 assert.equal(flights.length,1);assert.equal(flights[0].src,card.image);
 assert(animations[0].frames[0].transform.includes('translate(360px,'),'The flight starts at the opponent hand, not the local hand');
 const drawn=structuredClone(next);drawn.version=3;drawn.events.push({id:'draw',type:'draw',actor:'other',source:'monster',faction:'monster'});drawn.players[1].handCount++;
 ctx.s=drawn;ctx.render();assert.equal(flights.at(-1).src,'/assets/cardback_monster.png');
});
test('card atlas level filters distinguish level zero from crest-only and compose with other filters',()=>{
 for(let n=0;n<=5;n++)assert(filterCards(g.catalog,{level:String(n)}).every(c=>c.level===n));
 assert(filterCards(g.catalog,{level:'0'}).some(c=>c.id===20));
 assert(filterCards(g.catalog,{level:'none'}).every(c=>c.level===null));
 const raw=require('../public/cards.json');assert(filterCards(raw,{level:'0'}).some(c=>c.id===20));
 assert(filterCards(g.catalog,{level:'4',faction:'monster',type:'attack'}).every(c=>c.level===4&&c.faction==='monster'&&c.attack));
});
test('reviewed source-specific gold and self-return records preserve coin ownership and robbery statistics',()=>{
 const r=g.createRoom('甲'),p=r.players[0];g.join(r,'乙');r.seats=r.players.map(p=>p.id);r.phase='playing';r.currentId=p.id;r.decks.royal=[g.card(18)];p.board=[g.card(3),g.card(31),g.card(21),g.card(10)];
 g.step(r,{op:'prepPersistent',player:p.id,card:p.board[0]});assert(r.events.at(-1).text.startsWith('「公主」给了 甲'));
 g.step(r,{op:'selectEffect',mode:'fairy',player:p.id,choice:p.board[3].uid});
 assert(p.hand.some(c=>c.id===10));assert(r.events.at(-1).text.includes('「妖精」使 甲 将自己场上的「圣剑」收回自己的手牌'));
 assert(!r.events.some(e=>e.type==='stealCoin'));
});
