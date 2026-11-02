// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const crypto=require('node:crypto');
const raw=require('./public/cards.json');
const {presets}=require('./public/deck-presets');
const uid=()=>crypto.randomUUID();
const groups=[[18,9],[19,16],[17,8],[13,7],[6,12],[22,21],[23,24],[26,25],[27,28],[35,32]];
const extras=[4,14,15,20,29,30,31,33];
const specials=[1,3,5,10,34,36,37];
const catalog=raw.map(c=>({...c,title:c.name.split('（')[0],level:/Lv\.(\d+)/.test(c.badge)?Number(c.badge.match(/Lv\.(\d+)/)[1]):null,crests:c.badge.includes('纹章')?c.badge.split('、'):[],persistent:c.effect.startsWith('∞'),trigger:c.effect.startsWith('⚡'),attack:c.effect.startsWith('△'),expansion:extras.includes(c.id),group:groups.findIndex(g=>g.includes(c.id))}));
const byId=id=>catalog.find(c=>c.id===Number(id));
function assert(ok,message){if(!ok)throw new Error(message);}
function shuffle(list){for(let i=list.length-1;i>0;i--){const j=crypto.randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}return list;}
function defaults(n=2){return {maxPlayers:n,expansions:false,roles:groups.map(g=>g[0]),bothRoles:[],disabledGroups:[],extraIds:[],counts:{},rules:{heroFamily:true,emptyFighter:false}};}
function normalizeSettings(input,old=defaults()){
  const s={...old,...input,rules:{...old.rules,...input.rules},counts:{...(input.counts??old.counts)}};
  assert(Number.isInteger(s.maxPlayers)&&s.maxPlayers>=2&&s.maxPlayers<=5,'人数必须为 2–5 人');assert(typeof s.expansions==='boolean','拓展开关无效');
  assert(Array.isArray(s.roles)&&s.roles.length===10&&s.roles.every((v,i)=>groups[i].includes(v)),'每组必须且只能选一个角色');
  s.bothRoles??=[];
  assert(Array.isArray(s.bothRoles)&&new Set(s.bothRoles).size===s.bothRoles.length&&s.bothRoles.every(i=>Number.isInteger(i)&&i>=0&&i<groups.length),'替换角色同时启用配置无效');
  s.disabledGroups??=[];
  assert(Array.isArray(s.disabledGroups)&&new Set(s.disabledGroups).size===s.disabledGroups.length&&s.disabledGroups.every(i=>Number.isInteger(i)&&i>=0&&i<groups.length),'角色启用配置无效');
  assert(Array.isArray(s.extraIds)&&new Set(s.extraIds).size===s.extraIds.length&&s.extraIds.every(v=>extras.includes(v)),'EX 角色配置无效');
  for(const [id,count] of Object.entries(s.counts))assert(byId(id)&&Number.isInteger(count)&&count>=0&&count<=12,'每种牌的自定义数量必须是 0–12');
  assert(Object.values(s.rules).every(v=>typeof v==='boolean'),'规则选项无效');return s;
}
function composition(s){
 const counts=presets(s,groups,extras,specials);
 for(const [id,v] of Object.entries(s.counts)){
  const c=byId(id);
  if(c.expansion&&(!s.expansions||!s.extraIds.includes(c.id))||(s.disabledGroups||[]).includes(c.group))continue;
  counts[id]=v;
 }
 groups.forEach((pair,i)=>assert((s.bothRoles||[]).includes(i)||!(counts[pair[0]]>0&&counts[pair[1]]>0),'同组两种角色同时加入需勾选“同时启用”'));
 return counts;
}
function player(name){return {id:uid(),token:uid(),name:String(name||'旅人').trim().slice(0,18)||'旅人',ready:false,status:'active',hand:[],board:[],coins:0,seat:null,roll:null,turns:0,drawActions:0,buffs:{},lastSeen:Date.now(),privateNotice:null};}
function event(r,type,text,details={}){r.events.push({id:uid(),index:r.events.length,time:Date.now(),round:r.round||0,turn:r.turnNumber||0,type,text,...details});}
function createRoom(name,input={}){const p=player(name),settings=normalizeSettings(input);composition(settings);const r={code:crypto.randomBytes(3).toString('hex').toUpperCase(),hostId:p.id,players:[p],settings,phase:'lobby',version:0,events:[],chat:[],paused:false,pauseRequests:[],seats:[],seatOrder:[],seatCursor:0,decks:{royal:[],monster:[],tavern:[]},tavern:[],discard:{royal:[],monster:[]},queue:[],pending:null,currentId:null,actions:0,round:0,turnNumber:0,winners:[],initialRemaining:0,matchId:uid(),replays:[],frames:[],createdAt:Date.now()};event(r,'room',`${p.name} 创建了房间`);return r;}
const getP=(r,id)=>r.players.find(p=>p.id===id);
const active=r=>r.players.filter(p=>p.status!=='surrendered');
const seated=r=>r.seats.map(id=>getP(r,id)).filter(Boolean);
function clockwise(r){const ps=seated(r);const i=Math.max(0,ps.findIndex(p=>p.id===r.currentId));return ps.slice(i).concat(ps.slice(0,i)).filter(p=>p.status!=='surrendered');}
const opponents=(r,p)=>clockwise(r).filter(q=>q.id!==p.id);
const card=id=>({...byId(id),uid:uid(),tapped:false});
function enqueue(r,...tasks){if(r.phase!=='finished')r.queue.unshift(...tasks);}
function cardOrigin(r,p,c){
 if(!c?.uid)return null;
 for(const owner of r.players){
  const who=owner.id===p.id?'你的':`${owner.name} 的`;
  if(owner.hand.some(h=>h.uid===c.uid))return `${who}手牌`;
  if(owner.board.some(h=>h.uid===c.uid))return `${who}场上${c.persistent?c.tapped?' · 已横置':' · 未横置':''}`;
 }
 for(const faction of ['royal','monster']){
  if(r.discard[faction].some(h=>h.uid===c.uid))return `${faction==='royal'?'皇室':'魔物'}弃牌堆`;
  if(r.decks[faction].some(h=>h.uid===c.uid))return `${faction==='royal'?'皇室':'魔物'}牌库`;
 }
 if(r.tavern.some(h=>h.uid===c.uid))return '酒馆明牌';
 return null;
}
function ask(r,p,text,options,task){
 assert(options.length,'此效果当前没有合法选项');
 r.pending={id:uid(),playerId:p.id,text,options:options.map(o=>{
  const sourceLabel=o.hiddenFaction?null:cardOrigin(r,p,o.card);
  return {key:uid(),...o,...(sourceLabel?{sourceLabel,label:`${o.label} · ${sourceLabel}`}:{})};
 }),task};
}
const option=(label,value,cardData)=>({label,value,...(cardData?{card:cardData}:{})});
function chooseCard(r,p,text,cards,task,hidden=false){const ordered=hidden?shuffle([...cards]):cards;ask(r,p,text,ordered.map((c,i)=>({...option(hidden?`第 ${i+1} 张暗牌（${c.faction==='royal'?'黄色':'紫色'}）`:c.title,c.uid,hidden?null:c),...(hidden?{hiddenFaction:c.faction}:{})})),task);}
function take(list,id){const i=list.findIndex(c=>c.uid===id);assert(i>=0,'卡牌已经不在原位置');return list.splice(i,1)[0];}
function sources(r){return [{label:'皇室牌库',value:'royal',size:r.decks.royal.length},{label:'魔物牌库',value:'monster',size:r.decks.monster.length},...r.tavern.map(c=>({label:`酒馆 · ${c.title}`,value:c.uid,size:1,card:c}))].filter(x=>x.size);}
function drawOne(r,p,source,reason='抽牌'){let c;const publicCard=source!=='royal'&&source!=='monster';if(!publicCard){c=r.decks[source].pop();assert(c,'该牌库已经抽空');}else{c=take(r.tavern,source);if(r.decks.tavern.length)r.tavern.push(r.decks.tavern.pop());}p.hand.push(c);event(r,'draw',`${p.name} 从${source==='royal'?'皇室牌库':source==='monster'?'魔物牌库':'酒馆'}获得${publicCard?`「${c.title}」`:' 1 张牌'}`,{actor:p.id,reason,faction:c.faction,source:publicCard?'tavern':source,...(publicCard?{cardId:c.id,cardUid:c.uid}:{})});bombCheck(r,p);}
function bombCheck(r,p){if(p.hand.length>=5){for(const b of p.board.filter(c=>c.id===21))discard(r,p,take(p.board,b.uid));}}
function discard(r,owner,c,{triggered=false}={}){c.discardOrder=r.events.length;r.discard[c.faction].push(c);const text=triggered&&c.id===29?'「宝箱怪」被触发了，自己跑进了魔物弃牌堆':c.id===21?`${owner.name} 弃置「炸弹怪」，丢进了魔物弃牌堆`:`${owner.name} 弃置「${c.title}」，进入${c.faction==='royal'?'皇室':'魔物'}弃牌堆`;event(r,'discard',text,{actor:owner.id,cardId:c.id,cardUid:c.uid});enqueue(r,...clockwise(r).filter(p=>p.id!==owner.id&&p.hand.some(h=>h.id===16)&&c.level!==1).map(p=>({op:'nun',player:p.id,owner:owner.id,card:c.uid})));}
function finish(r,winners,reason){if(r.phase==='finished')return;r.phase='finished';r.winners=winners.map(p=>p.id);r.pending=null;r.queue=[];r.paused=false;r.finishedAt=Date.now();event(r,'victory',`${winners.map(p=>p.name).join('、')} 获胜 · ${reason}`);}
function coin(r,p,amount=1,sourceCardId=null){if(r.phase==='finished')return;p.coins+=amount;const source=byId(sourceCardId),text=amount>0&&source?`「${source.title}」${source.id===29?'留给了':'给了'} ${p.name} ${amount} 枚金币，现有 ${p.coins} 枚`:`${p.name} ${amount>0?'获得':'支付'} ${Math.abs(amount)} 枚金币，现有 ${p.coins} 枚`;event(r,'coin',text,{actor:p.id,delta:amount,...(source?{sourceCardId:source.id}:{})});if(p.coins>=5)return finish(r,[p],'集齐 5 枚金币，立即胜利');if(amount>0)enqueue(r,...clockwise(r).filter(q=>q.id!==p.id).map(q=>({op:'goldResponse',player:q.id,source:p.id})));}
function transferCoin(r,from,to,trade=false){assert(from.coins>0,'对方没有可支付的金币');event(r,trade?'tradeCoin':'stealCoin',`${to.name} 从 ${from.name} ${trade?'取得':'抢走了'} 1 金币`,{actor:to.id,target:from.id});coin(r,from,-1);coin(r,to,1);}
function moveToHand(r,owner,c,target=owner,sourceCardId=null){target.hand.push(c);bombCheck(r,target);const source=byId(sourceCardId);event(r,'return',source?`「${source.title}」使 ${owner.name} 将自己场上的「${c.title}」收回自己的手牌`:`${owner.name} 的「${c.title}」加入${target.name}手牌`,{actor:owner.id,cardId:c.id,...(source?{sourceCardId:source.id}:{})});}
function deckEnd(r){if(['playing','initial'].includes(r.phase)&&!r.decks.royal.length&&!r.decks.monster.length){const ps=active(r),max=Math.max(...ps.map(p=>p.coins));finish(r,ps.filter(p=>p.coins===max),'双牌库耗尽，比较金币');}}
function rollRanking(ps){ps.forEach(p=>p.roll={history:[]});function rank(list){if(list.length<2)return list;const buckets=new Map();for(const p of list){const n=crypto.randomInt(1,7);p.roll.history.push(n);if(!buckets.has(n))buckets.set(n,[]);buckets.get(n).push(p);}return [...buckets.keys()].sort((a,b)=>b-a).flatMap(n=>buckets.get(n).length>1?rank(buckets.get(n)):buckets.get(n));}const order=rank(ps);ps.forEach(p=>p.roll.value=p.roll.history[0]??6);return order.map(p=>p.id);}
function start(r){assert(r.phase==='lobby','对局已经开始');const present=r.players.filter(p=>p.status==='active');assert(present.length===r.settings.maxPlayers,'请按实际人数调整座位上限后开始，以匹配人数牌库配置');assert(present.filter(p=>p.id!==r.hostId).every(p=>p.ready),'需要所有非房主玩家准备完成');const counts=composition(r.settings);assert(Object.values(counts).reduce((a,b)=>a+b,0)>=present.length*3+2,'牌数不足以发初始手牌');r.players=present;r.phase='seating';r.seats=Array(r.players.length).fill(null);r.seatOrder=rollRanking(r.players);r.seatCursor=0;event(r,'dice',`掷骰选座：${r.seatOrder.map(id=>{const p=getP(r,id);return `${p.name} ${p.roll.history.join(' / ')} 点`;}).join('；')}。同点重掷，点数高者先选座。`);}
function beginDecks(r){const counts=composition(r.settings);for(const [id,n] of Object.entries(counts))for(let i=0;i<n;i++)r.decks[byId(id).faction].push(card(Number(id)));if(r.players.length===2)for(const [id,n] of Object.entries(counts)){if(n===4){const deck=r.decks[byId(id).faction],i=deck.findIndex(c=>c.id===Number(id));r.decks.tavern.push(deck.splice(i,1)[0]);}}Object.values(r.decks).forEach(shuffle);r.tavern=r.decks.tavern.splice(-2);r.phase='initial';r.currentId=r.seats.find(id=>getP(r,id).status!=='surrendered');r.initialRemaining=3;event(r,'start','坐席确定，从 1 号座位起顺时针，各自选择 3 张初始手牌');}
function advanceSeating(r){
 while(r.seatCursor<r.seatOrder.length&&getP(r,r.seatOrder[r.seatCursor]).status==='surrendered'){
  const p=getP(r,r.seatOrder[r.seatCursor]),index=r.seats.indexOf(null);r.seats[index]=p.id;p.seat=index;r.seatCursor++;
 }
 if(r.seatCursor===r.seatOrder.length)beginDecks(r);
}
function advanceInitial(r){
 const next=r.seats.slice(r.seats.indexOf(r.currentId)+1).find(id=>getP(r,id).status!=='surrendered');
 if(next){r.currentId=next;r.initialRemaining=3;}
 else{r.phase='playing';enterTurn(r,getP(r,r.seats.find(id=>getP(r,id).status!=='surrendered')));}
}
function enterTurn(r,p){r.currentId=p.id;r.turnNumber++;r.round=Math.floor((r.turnNumber-1)/r.seats.length)+1;r.actions=2;p.drawActions=0;p.buffs={};const first=p.turns===0;p.turns++;event(r,'turn',`第 ${r.round} 轮 · ${p.name} 的回合`,{actor:p.id});if(!first)enqueue(r,{op:'bombPrep',player:p.id},{op:'prepare',player:p.id});}
function promptDraw(r,p,n,continuation=[]){if(n<=0){enqueue(r,...continuation);return;}const opts=sources(r);if(!opts.length){deckEnd(r);return;}ask(r,p,`选择抽牌来源（还需抽 ${n} 张）`,opts.map(s=>option(s.label,s.value,s.card)),{op:'drawChoice',player:p.id,remaining:n,continuation});}
function hero(c,r){return r.settings.rules.heroFamily?[2,6,11].includes(c.id):c.id===6;}
function magicSword(r,p,c){return hero(c,r)&&!!(p.buffs.magicAllColors||p.buffs.magicColor);}
function attackTargets(r,p,c){return opponents(r,p).filter(q=>{if([2,6,11,12].includes(c.id))return hero(c,r)&&p.buffs.sword?q.board.length:q.hand.some(h=>magicSword(r,p,c)||h.faction!=='royal');if([17,22,33].includes(c.id))return q.hand.length>0;if(c.id===15)return p.board.length>0&&q.coins>0;if(c.id===27)return q.coins>p.coins;if(c.id===28)return q.board.some(h=>h.crests.length);if([32,35].includes(c.id))return q.board.length>0;return [25,26].includes(c.id);});}
const allDiscard=r=>[...r.discard.royal,...r.discard.monster];
function legal(r,p,c,activation=false){if(activation)return !c.tapped&&([10,30].includes(c.id)||c.id===1&&allDiscard(r).some(x=>x.id===6)||c.id===31&&p.board.length>0||c.id===36&&allDiscard(r).some(x=>x.crests.includes('炎族纹章')));if(c.trigger)return false;if(c.attack)return attackTargets(r,p,c).length>0;if(c.id===21)return opponents(r,p).length>0;if(c.id===18)return p.hand.filter(x=>x.uid!==c.uid).length>=2;if(c.id===19)return r.discard.royal.some(x=>x.level!==1);if(c.id===20)return allDiscard(r).some(x=>[1,2].includes(x.level));if(c.id===23)return r.discard.monster.length>0;if(c.id===24)return r.discard.monster.some(x=>x.level!==null)||allDiscard(r).some(x=>x.crests.length);if(c.id===37)return [...r.decks.monster,...r.discard.monster].some(x=>x.crests.includes('炎族纹章'));return true;}
function play(r,p,c,free=false){assert(legal(r,p,c),'这张牌当前无法合理执行');assert(free||c.id===3||r.actions>0,'行动点不足');if(!free&&c.id!==3)r.actions--;take(p.hand,c.uid);event(r,'play',`${p.name} 打出「${c.title}」${free?'（免费）':''}`,{actor:p.id,cardId:c.id,cardUid:c.uid});const ctx={player:p.id,card:c,keep:c.persistent||c.id===8||magicSword(r,p,c),activation:false};enqueue(r,{op:'effect',...ctx},{op:'afterPlay',...ctx});}
function responseChain(r,p,c,targets,ctx){event(r,'target',`${p.name} 的「${c.title}」指定 ${targets.map(t=>t.name).join('、')}，等待被指定玩家确认应对后结算`,{actor:p.id,cardId:c.id,targets:targets.map(t=>t.id)});enqueue(r,...targets.map(t=>({op:'attackResponse',player:t.id,attacker:p.id,ctx})),{...ctx,op:'attackResolve',targets:targets.map(t=>t.id)});}
function run(r){let n=0;while(r.queue.length&&!r.pending&&r.phase!=='finished'){assert(++n<500,'规则事件链超过安全长度');step(r,r.queue.shift());}deckEnd(r);}
const responseOps=['defense','goldAnswer','nunAnswer','storkAnswer','chestEndAnswer'];
function step(r,t){
 const p=getP(r,t.player),accepted=responseOps.includes(t.op)&&t.choice!=='pass';
 const valid=accepted&&p?.status!=='surrendered'&&(t.op!=='defense'||r.queue.some(x=>x.op==='attackResolve'&&x.card.uid===t.ctx.card.uid))&&(t.op!=='nunAnswer'||p.hand.some(x=>x.id===16)&&allDiscard(r).some(x=>x.uid===t.card));
 resolveStep(r,t);
 if(accepted)event(r,'responseResult',`${p.name} 的应对${valid?'成功结算':'未能生效'}`,{actor:p.id,success:!!valid,responseOp:t.op});
}
function resolveStep(r,t){const p=getP(r,t.player),c=t.card;if(p?.status==='surrendered'&&!['attackResolve','afterPlay'].includes(t.op))return;switch(t.op){
  case 'drawChoice':drawOne(r,p,t.choice);promptDraw(r,p,t.remaining-1,t.continuation);break;
  case 'draw':promptDraw(r,p,t.count);break;
  case 'goldResponse':{const opts=[option('不响应','pass'),...p.board.filter(x=>x.id===8).map(x=>option('舞娘：弃置并获得 1 金币',x.uid,x)),...p.hand.filter(x=>x.id===29).map(x=>option('宝箱怪：抽 2 张牌',x.uid,x))];if(opts.length>1)ask(r,p,'对手获得金币：是否响应？',opts,{...t,op:'goldAnswer'});break;}
  case 'goldAnswer':if(t.choice==='pass')break;{enqueue(r,{op:'goldResponse',player:p.id,source:t.source});const d=p.board.find(x=>x.uid===t.choice);if(d){discard(r,p,take(p.board,d.uid));coin(r,p,1,8);}else{discard(r,p,take(p.hand,t.choice),{triggered:true});enqueue(r,{op:'draw',player:p.id,count:2});}break;}
  case 'nun':{const dc=allDiscard(r).find(x=>x.uid===t.card),nun=p.hand.find(x=>x.id===16);if(dc&&nun)ask(r,p,`修女：是否取得「${dc.title}」？`,[option('不响应','pass'),option('打出修女并取得卡牌','take',nun)],{...t,op:'nunAnswer'});break;}
  case 'nunAnswer':if(t.choice==='take'){const h=p.hand.find(x=>x.id===16),dc=allDiscard(r).find(x=>x.uid===t.card);if(h&&dc){take(p.hand,h.uid);take(r.discard[dc.faction],dc.uid);p.hand.push(dc);discard(r,p,h);event(r,'trigger',`${p.name} 的修女收取「${dc.title}」`);bombCheck(r,p);}}break;
  case 'bombPrep':{enqueue(r,...p.board.filter(x=>x.id===21).map(x=>({op:'bombSingle',player:p.id,uid:x.uid})));break;}
  case 'bombSingle':if(p.board.some(x=>x.uid===t.uid)&&p.board.length>1)chooseCard(r,p,'炸弹怪：将自己场上的另一张牌返回自己的手牌',p.board.filter(x=>x.uid!==t.uid),{op:'bombReturn',player:p.id});break;
  case 'bombReturn':moveToHand(r,p,take(p.board,t.choice),p,21);break;
  case 'prepare':{const back=p.board.filter(x=>!x.persistent);p.board=p.board.filter(x=>x.persistent);p.hand.push(...back);if(back.length)event(r,'prepare',`${p.name} 准备阶段收回 ${back.length} 张非持续牌：${back.map(h=>`「${h.title}」`).join('、')}。持续牌留在场上`,{actor:p.id,count:back.length});bombCheck(r,p);enqueue(r,{op:'stork',player:p.id,returned:back.map(x=>x.uid)},...p.board.filter(x=>[3,5].includes(x.id)).map(x=>({op:'prepPersistent',player:p.id,card:x})));break;}
  case 'stork':{const h=p.hand.find(x=>x.id===14&&t.returned.filter(v=>v!==x.uid).length>=2);if(h)ask(r,p,'送子鹤：其它至少 2 张牌回手，是否响应？',[option('不响应','pass'),option('打出送子鹤，获得 1 金币',h.uid,h)],{op:'storkAnswer',player:p.id});break;}
  case 'storkAnswer':if(t.choice!=='pass'){discard(r,p,take(p.hand,t.choice));coin(r,p,1,14);}break;
  case 'prepPersistent':if(!p.board.some(x=>x.uid===c.uid))break;if(c.id===3)coin(r,p,1,3);else if(c.id===5&&p.coins===4)finish(r,[p],'圣杯在准备阶段满足胜利条件');break;
  case 'effect':if(c.attack){const targets=attackTargets(r,p,c);if(!targets.length){event(r,'fizzle',`「${c.title}」已无合法目标`);break;}if(c.id===32)responseChain(r,p,c,targets,t);else ask(r,p,`「${c.title}」：选择目标`,targets.map(x=>option(x.name,x.id)),{...t,op:'targetChosen'});}else effect(r,p,c,t);break;
  case 'targetChosen':responseChain(r,p,c,[getP(r,t.choice)],t);break;
  case 'attackResponse':{const opts=[option('不应对，继续结算','pass')];p.hand.filter(x=>[7,13].includes(x.id)).forEach(x=>{if(x.id===7)opts.push(option('圣骑士：抽 2 张',`${x.uid}:draw`,x),option('圣骑士：收回攻击牌并抽 1 张',`${x.uid}:cancel`,x));else opts.push(option('卫兵：使攻击无效并抽 1 张',`${x.uid}:guard`,x));});p.board.filter(x=>x.id===4&&!x.tapped).forEach(x=>opts.push(option('大臣：结算后抽 1 张',`${x.uid}:minister`,x)));ask(r,p,`${getP(r,t.attacker).name} 用「${t.ctx.card.title}」指定了你，是否应对？`,opts,{...t,op:'defense'});break;}
  case 'defense':{if(t.choice==='pass')break;const [id,mode]=t.choice.split(':');const attack=r.queue.find(x=>x.op==='attackResolve'&&x.card.uid===t.ctx.card.uid);if(!attack)break;attack.canceled??={};attack.ministers??=[];if(mode==='minister'){const m=p.board.find(x=>x.uid===id);assert(m&&!m.tapped,'大臣不可用');m.tapped=true;attack.ministers.push(p.id);enqueue(r,{op:'attackResponse',player:p.id,attacker:t.attacker,ctx:t.ctx});}else{discard(r,p,take(p.hand,id));if(mode==='guard')attack.canceled[p.id]='board';if(mode==='cancel')attack.canceled[p.id]='hand';enqueue(r,{op:'draw',player:p.id,count:mode==='draw'?2:1});}event(r,'response',`${p.name} 响应「${t.ctx.card.title}」：${mode==='minister'?'大臣护驾，被横置了':mode==='guard'?'卫兵护驾':mode==='cancel'?'圣骑士：退！退！！退！！！':'圣骑士：那我受着呗，美美抽卡了！'}`,{actor:p.id,target:t.attacker});break;}
  case 'attackResolve':{const valid=t.targets.filter(id=>!t.canceled?.[id]&&getP(r,id).status!=='surrendered'),after=r.queue.find(x=>x.op==='afterPlay'&&x.card.uid===c.uid),cancels=Object.values(t.canceled||{});if(after&&cancels.length&&c.id!==32)after.destination=cancels.includes('hand')?'hand':'board';enqueue(r,...(valid.length?[{...t,op:'attackEffect',targets:valid}]:[]),...(t.ministers||[]).map(id=>({op:'draw',player:id,count:1})));break;}
  case 'attackEffect':attackEffect(r,p,c,t);break;
  case 'afterPlay':{if(t.activation)break;const inZone=r.players.some(q=>[...q.board,...q.hand].some(x=>x.uid===c.uid))||allDiscard(r).some(x=>x.uid===c.uid);if(!inZone){if(t.destination==='hand')p.hand.push(c);else if(t.destination==='board'||t.keep)p.board.push(c);else discard(r,p,c);}if(hero(c,r)){delete p.buffs.sword;delete p.buffs.magicColor;delete p.buffs.magicAllColors;}const devil=p.board.find(x=>x.id===34&&!x.tapped);if(devil&&c.faction==='monster'&&c.level!==null)enqueue(r,{op:'devilPrompt',player:p.id,uid:devil.uid});bombCheck(r,p);break;}
  case 'devilPrompt':{const d=p.board.find(x=>x.uid===t.uid&&!x.tapped);if(d)ask(r,p,'魔王：是否横置并获得 1 金币？',[option('不发动','pass'),option('横置魔王','activate',d)],{op:'devil',player:p.id,uid:d.uid});break;}
  case 'devil':if(t.choice==='activate'){const d=p.board.find(x=>x.uid===t.uid);if(d&&!d.tapped){d.tapped=true;coin(r,p);}}break;
  case 'selectEffect':selectEffect(r,p,t);break;
  case 'attackCard':resolveAttackCard(r,p,t);break;
  case 'guessLevel':{const target=getP(r,t.target),matches=target.hand.filter(x=>x.level===Number(t.choice));event(r,'declaration',`${p.name} 以「法师」向 ${target.name} 宣言 Lv.${t.choice}：${matches.length?'命中，对方需选择一张该等级手牌放到场上':'未命中，法师发动者获得 1 枚金币'}`,{actor:p.id,target:target.id,cardId:17,level:Number(t.choice)});if(matches.length)chooseCard(r,target,'法师：选择一张相应等级的牌放置到场上',matches,{op:'magePlace',player:target.id});else coin(r,p);break;}
  case 'magePlace':{const h=take(p.hand,t.choice);p.board.push(h);event(r,'place',`${p.name} 放置「${h.title}」到场上`);break;}
  case 'nameGuess':{const target=getP(r,t.target),matches=[...target.hand,...(c.id===26?target.board:[])].filter(x=>x.id===Number(t.choice));event(r,'guess',`${p.name} 以「${c.title}」向 ${target.name} 宣告「${byId(t.choice).title}」：${matches.length?'命中，等待对方选择同名牌'+(c.id===26?'交付给发动者':'弃置'):'未命中，此次宣言没有后续效果'}`,{actor:p.id,target:target.id,cardId:c.id,declaredCardId:Number(t.choice)});if(matches.length)chooseCard(r,target,c.id===26?'女巫：选择交付的一张同名牌':'小丑女：选择弃置的一张同名牌',matches,{op:'guessTransfer',player:target.id,attacker:p.id,card:c});break;}
  case 'guessTransfer':{const attacker=getP(r,t.attacker),h=p.hand.find(x=>x.uid===t.choice)||p.board.find(x=>x.uid===t.choice);assert(h,'卡牌不存在');take(p.hand.some(x=>x.uid===h.uid)?p.hand:p.board,h.uid);if(c.id===26){attacker.hand.push(h);bombCheck(r,attacker);event(r,'steal',`${p.name} 向 ${attacker.name} 交付「${h.title}」`);}else{discard(r,p,h);if(h.level!==null)coin(r,attacker,1,25);}break;}
  case 'bullAnswer':{const attacker=getP(r,t.attacker);if(t.choice==='coin')transferCoin(r,p,attacker);else{const cards=p.board.filter(x=>x.crests.length);p.board=p.board.filter(x=>!x.crests.length);attacker.hand.push(...cards);bombCheck(r,attacker);event(r,'steal',`${p.name} 交付 ${cards.length} 张纹章牌给 ${attacker.name}${cards.length?'：'+cards.map(h=>`「${h.title}」`).join('、'):''}`);}break;}
  case 'babyPick':if(p.board.length)chooseCard(r,getP(r,t.attacker),`龙幼崽：选择 ${p.name} 的一张场上牌返回其手牌`,p.board,{op:'babyReturn',player:t.attacker,target:p.id,key:t.key});break;
  case 'babyReturn':{const target=getP(r,t.target),h=take(target.board,t.choice);moveToHand(r,target,h);const last=r.queue.find(x=>x.op==='babyGold'&&x.key===t.key);if(last&&h.level===null)last.allLevel=false;break;}
  case 'babyGold':if(t.allLevel)coin(r,p);break;
  case 'merchantGive':{const target=getP(r,t.target),h=take(p.board,t.choice);target.hand.push(h);bombCheck(r,target);transferCoin(r,target,p,true);event(r,'trade',`${p.name} 将「${h.title}」交给了 ${target.name}`);break;}
  case 'chestEnd':{const chest=p.hand.find(x=>x.id===29);if(p.id!==t.current&&chest)ask(r,p,'宝箱怪：对手两次行动都抽牌，是否响应？',[option('不响应','pass'),option('打出宝箱怪并获得 1 金币','coin',chest)],{op:'chestEndAnswer',player:p.id});break;}
  case 'chestEndAnswer':if(t.choice==='coin'){const h=p.hand.find(x=>x.id===29);discard(r,p,take(p.hand,h.uid));coin(r,p,1,29);}break;
  case 'advance':advance(r,p);break;
  default:throw new Error(`未知规则事件：${t.op}`);
}}
function effect(r,p,c,t){switch(c.id){
  case 1:if(t.activation)chooseCard(r,p,'国王：取回 Lv.4 勇者',allDiscard(r).filter(x=>x.id===6),{op:'selectEffect',player:p.id,mode:'retrieve'});break;
  case 3:case 4:case 5:case 8:case 34:break;
  case 9:{
   const hand=p.hand.splice(0);p.board.push(...hand);
   const hasCrest=hand.some(x=>x.crests.length),allLevels=hand.every(x=>x.level!==null);
   const total=allLevels?hand.reduce((s,x)=>s+x.level,0):null;
   const gain=!hasCrest&&allLevels&&total%2===0&&(hand.length>0||r.settings.rules.emptyFighter);
   const reason=!hand.length?(gain?'未放置其他手牌，按本局空手得分约定获得 1 枚金币':'未放置其他手牌，本局未允许空手得分，不获得金币')
    :hasCrest?(allLevels?'含纹章牌，不满足得分条件':'含无等级的纹章牌，不满足得分条件')
    :!allLevels?'含无等级牌，不满足得分条件'
    :`等级合计 ${total}，${gain?'没有纹章且合计为偶数，获得 1 枚金币':'合计为奇数，不获得金币'}`;
   event(r,'place',`${p.name} 以「格斗家」放置了 ${hand.length} 张手牌${hand.length?'：'+hand.map(h=>`「${h.title}」`).join('、'):''}到场上。${reason}`,{actor:p.id,cardId:9});if(gain)coin(r,p);break;
  }
  case 10:if(t.activation){p.buffs.sword=true;event(r,'buff',`${p.name} 下一张勇者改为攻击场上牌`);}break;
  case 18:chooseCard(r,p,'铁匠：选择第一张放置手牌',p.hand,{op:'selectEffect',player:p.id,mode:'smith1'});break;
  case 19:chooseCard(r,p,'僧侣：选择黄色非 Lv.1 弃牌',r.discard.royal.filter(x=>x.level!==1),{op:'selectEffect',player:p.id,mode:'monk'});break;
  case 20:chooseCard(r,p,'史莱姆：选择 Lv.1 或 Lv.2 弃牌',allDiscard(r).filter(x=>[1,2].includes(x.level)),{op:'selectEffect',player:p.id,mode:'retrieve'});break;
  case 21:ask(r,p,'炸弹怪：选择放置对象',opponents(r,p).map(q=>option(q.name,q.id)),{op:'selectEffect',player:p.id,mode:'bomb',card:c});break;
  case 23:chooseCard(r,p,'白骨：选择紫色弃牌放置到场上',r.discard.monster,{op:'selectEffect',player:p.id,mode:'placeDiscard'});break;
  case 24:{const opts=[];if(r.discard.monster.some(x=>x.level!==null))opts.push(option('放置紫色 Lv 牌','place'));if(allDiscard(r).some(x=>x.crests.length))opts.push(option('取回纹章牌','retrieve'));ask(r,p,'狼人：选择效果',opts,{op:'selectEffect',player:p.id,mode:'wolf'});break;}
  case 30:if(t.activation){p.buffs.magicAllColors=true;event(r,'buff',`${p.name} 发动「魔剑」，本回合下一张勇者可指定任意颜色手牌，结算后勇者留在场上`,{actor:p.id,cardId:30});}break;
  case 31:if(t.activation)chooseCard(r,p,'妖精：选择自己场上的一张牌返回自己的手牌',p.board,{op:'selectEffect',player:p.id,mode:'fairy'});break;
  case 36:if(t.activation)chooseCard(r,p,'火龙：选择炎族弃牌',allDiscard(r).filter(x=>x.crests.includes('炎族纹章')),{op:'selectEffect',player:p.id,mode:'fire'});break;
  case 37:chooseCard(r,p,'龙蛋：检索炎族卡牌',[...r.decks.monster,...r.discard.monster].filter(x=>x.crests.includes('炎族纹章')),{op:'selectEffect',player:p.id,mode:'egg'});break;
  default:throw new Error(`没有实现卡牌效果 ${c.title}`);
}}
function selectEffect(r,p,t){switch(t.mode){
  case 'bomb':getP(r,t.choice).board.push(t.card);bombCheck(r,getP(r,t.choice));event(r,'place',`${p.name} 把炸弹怪放到 ${getP(r,t.choice).name} 场上`);break;
  case 'magic':effect(r,p,byId(30),{activation:true});break;
  case 'fairy':moveToHand(r,p,take(p.board,t.choice),p,31);break;
  case 'smith1':{const a=take(p.hand,t.choice);p.board.push(a);chooseCard(r,p,'铁匠：选择第二张放置手牌',p.hand,{op:'selectEffect',player:p.id,mode:'smith2',first:a});break;}
  case 'smith2':{const b=take(p.hand,t.choice);p.board.push(b);const gain=t.first.level!==null&&t.first.level===b.level||t.first.crests.some(x=>b.crests.includes(x));event(r,'place',`${p.name} 用「铁匠」放置「${t.first.title}」和「${b.title}」：${gain?'具有相同等级或相同纹章，获得 1 枚金币':'等级及纹章不满足相同条件，不获得金币'}`,{actor:p.id,cardId:18});if(gain)coin(r,p);break;}
  case 'wolf':chooseCard(r,p,'狼人：选择卡牌',t.choice==='place'?r.discard.monster.filter(x=>x.level!==null):allDiscard(r).filter(x=>x.crests.length),{op:'selectEffect',player:p.id,mode:t.choice==='place'?'placeDiscard':'retrieve'});break;
  case 'monk':case 'fire':{const h=allDiscard(r).find(x=>x.uid===t.choice);assert(h,'弃牌不存在');const opts=[option('加入手牌','hand',h)];if(legal(r,p,h))opts.push(option('立即免费打出','play',h));ask(r,p,`「${h.title}」：如何处理？`,opts,{op:'selectEffect',player:p.id,mode:'freeChoice',uid:h.uid});break;}
  case 'freeChoice':{const h=allDiscard(r).find(x=>x.uid===t.uid);take(r.discard[h.faction],h.uid);p.hand.push(h);event(r,'retrieve',`${p.name} 从弃牌区取得「${h.title}」${t.choice==='play'?'并立即免费打出':'加入手牌'}`,{actor:p.id,cardId:h.id});if(t.choice==='play')play(r,p,h,true);else bombCheck(r,p);break;}
  case 'egg':{const h=[...r.decks.monster,...r.discard.monster].find(x=>x.uid===t.choice);take(r.decks.monster.some(x=>x.uid===h.uid)?r.decks.monster:r.discard.monster,h.uid);p.hand.push(h);shuffle(r.decks.monster);bombCheck(r,p);event(r,'search',`${p.name} 通过龙蛋取得「${h.title}」，重新洗牌`);break;}
  case 'retrieve':case 'placeDiscard':{const h=allDiscard(r).find(x=>x.uid===t.choice);take(r.discard[h.faction],h.uid);(t.mode==='retrieve'?p.hand:p.board).push(h);event(r,'retrieve',t.mode==='retrieve'?`${p.name} 从弃牌区取回「${h.title}」`:`${p.name} 从弃牌区拿了一张「${h.title}」放置场上`);bombCheck(r,p);break;}
  default:throw new Error('未知选择');
}}
function attackEffect(r,p,c,t){const target=getP(r,t.targets[0]);if([2,6,11,33].includes(c.id)){const sword=hero(c,r)&&p.buffs.sword,hs=sword?target.board:target.hand.filter(x=>c.id===33||magicSword(r,p,c)||x.faction!=='royal');if(hs.length)chooseCard(r,p,`「${c.title}」：选择 ${target.name} 的${sword?'场上牌':'暗牌'}`,hs,{op:'attackCard',player:p.id,card:c,target:target.id,sword},!sword);return;}
  switch(c.id){
    case 12:{const hs=target.hand.filter(x=>x.faction!=='royal');target.hand=target.hand.filter(x=>!hs.includes(x));target.board.push(...hs);const gain=hs.length&&hs.every(x=>x.level!==null);event(r,'place',`${target.name} 被「狂战士」放置了 ${hs.length} 张牌${hs.length?'：'+hs.map(h=>`「${h.title}」`).join('、'):''}。${gain?'放置的牌全部具有等级，发动者获得 1 枚金币':'未满足放置的牌全部具有等级，不获得金币'}`,{actor:p.id,target:target.id,cardId:12});if(gain)coin(r,p);break;}
    case 15:chooseCard(r,p,'商人：选择交付对手的场上牌',p.board,{op:'merchantGive',player:p.id,target:target.id});break;
    case 17:ask(r,p,'法师：宣言一个等级',[1,2,3,4].map(n=>option(`Lv.${n}`,n)),{op:'guessLevel',player:p.id,target:target.id});break;
    case 22:p.privateNotice={id:uid(),title:`蝙蝠 · ${target.name} 的手牌`,cards:structuredClone(target.hand)};{const returned=target.board.splice(0);target.hand.push(...returned);bombCheck(r,target);event(r,'peek',`${p.name} 用「蝙蝠」秘密查看 ${target.name} 的 ${p.privateNotice.cards.length} 张手牌，并将其场上 ${returned.length} 张牌全部返回手牌${returned.length?'：'+returned.map(h=>`「${h.title}」`).join('、'):''}。查看内容仅发动者可见`,{actor:p.id,target:target.id,cardId:22});}break;
    case 25:case 26:ask(r,p,`「${c.title}」：宣告一张牌的名字`,catalog.map(x=>option(x.title,x.id,x)),{op:'nameGuess',player:p.id,card:c,target:target.id});break;
    case 27:if(target.coins>p.coins)transferCoin(r,target,p);break;
    case 28:{const opts=[option('交付场上所有纹章牌','cards')];if(target.coins>0)opts.push(option('支付 1 金币','coin'));ask(r,target,'牛头人：交付纹章牌或支付金币',opts,{op:'bullAnswer',player:target.id,attacker:p.id});break;}
    case 32:{const key=uid();enqueue(r,...t.targets.map(id=>({op:'babyPick',player:id,attacker:p.id,key})),{op:'babyGold',player:p.id,key,allLevel:true});break;}
    case 35:if(target.board.length)chooseCard(r,p,'龙炎：选择弃置的场上牌',target.board,{op:'attackCard',player:p.id,card:c,target:target.id});break;
  }
}
function resolveAttackCard(r,p,t){
 const target=getP(r,t.target),c=t.card,h=take(t.sword||c.id===35?target.board:target.hand,t.choice);
 if(t.sword||c.id===35)discard(r,target,h);else target.board.push(h);
 event(r,'attack',t.sword||c.id===35?`${p.name} ${c.id===35?'扔掉了':'弃置了'} ${target.name} 的「${h.title}」`:`${p.name}${c.id===33?'':' '}把 ${target.name} 的「${h.title}」放置到了场上`,{actor:p.id,target:target.id,cardId:h.id,sourceCardId:c.id});
 let gain=false,reason='';
 if(c.id===35||c.id===33){gain=h.level!==null;reason=gain?`「${h.title}」有等级，满足获得金币的条件`:`「${h.title}」没有等级，不获得金币`;}
 else if(c.id===2&&!t.sword){gain=h.level!==null||h.crests.includes('首领纹章');reason=gain?`「${h.title}」具有等级或首领纹章，满足金勇者的得分条件`:'目标没有等级或首领纹章，不获得金币';}
 else{gain=h.level!==null&&c.level!==null&&c.level>h.level;reason=`比较等级：「${c.title}」${c.level===null?'无等级':'Lv.'+c.level} / 「${h.title}」${h.level===null?'无等级':'Lv.'+h.level}，${gain?'攻击牌等级更高，获得 1 枚金币':'不满足攻击牌等级更高的条件，不获得金币'}`;}
 event(r,'effectResult',`${p.name}：${reason}`,{actor:p.id,cardId:c.id});
 if(gain)coin(r,p);
 else if(c.id===33&&h.crests.length){
  const zones=[...r.players.flatMap(q=>[q.hand,q.board]),...Object.values(r.decks),...Object.values(r.discard),r.tavern],zone=zones.find(z=>z.some(x=>x.id===30));
  if(zone){const magic=zone.find(x=>x.id===30);take(zone,magic.uid);p.hand.push(magic);Object.values(r.decks).forEach(shuffle);event(r,'search',`${p.name} 的「黑骑士」命中纹章牌，检索取得「魔剑」并重新洗牌`,{actor:p.id,cardId:30});bombCheck(r,p);}
  else event(r,'effectResult',`${p.name} 的「黑骑士」命中纹章牌，但可检索区域内没有「魔剑」`,{actor:p.id,cardId:33});
 }
}
function advance(r,p){p.board.forEach(c=>c.tapped=false);event(r,'end',`${p.name} 结束回合，重置持续牌`);if(r.phase==='finished')return;const ps=seated(r);let i=ps.findIndex(x=>x.id===p.id);for(let n=0;n<ps.length;n++){i=(i+1)%ps.length;if(ps[i].status!=='surrendered'){enterTurn(r,ps[i]);return;}}}
const inRoom=p=>p.inRoom??p.status!=='away';
function inheritHost(r,leaver){
 if(r.hostId!==leaver.id)return;
 const order=r.seats.length&&r.seats.every(Boolean)?seated(r):r.players;
 const i=order.findIndex(p=>p.id===leaver.id);
 for(let n=1;n<order.length;n++){
  const p=order[(i+n)%order.length];
  if(inRoom(p)){r.hostId=p.id;event(r,'host',`房主顺时针移交给 ${p.name}`);return;}
 }
 if(!inRoom(leaver))r.hostId=null;
}
function depart(r,p,surrender){
 if(r.phase==='lobby')assert(!surrender,'准备房间没有认输，请直接离开');
 if(r.undoRequest)event(r,'undoCancel','有人离开或认输，回退申请已取消');
 r.undoRequest=null;r.undoStack=[];
 p.inRoom=surrender?inRoom(p):false;
 p.status=surrender||p.status==='surrendered'?'surrendered':'away';p.ready=false;
 r.pauseRequests=r.pauseRequests.filter(id=>id!==p.id);r.resumeRequests=(r.resumeRequests||[]).filter(id=>id!==p.id);
 event(r,surrender?'surrender':'away',`${p.name} ${surrender?'认输，留在房间观战':r.phase==='lobby'?'离开准备房间':p.status==='surrendered'?'离开观战':'暂离，可在房间仍存在时返回'}`);
 inheritHost(r,p);
 if(!r.players.some(inRoom)){
  r.dissolved=true;r.hostId=null;
  if(['seating','initial','playing'].includes(r.phase)){r.phase='interrupted';r.endedAt=Date.now();r.pending=null;r.queue=[];r.paused=false;event(r,'interrupted','所有参与者离开，对局中止，不计胜负');}
  event(r,'dissolve','最后一位参与者离开，房间已解散');
 }
 if(surrender&&['playing','initial','seating'].includes(r.phase)){const left=active(r);if(left.length===1)return finish(r,left,'其余玩家认输');if(r.phase==='seating'){advanceSeating(r);return;}for(const c of [...p.hand,...p.board])r.discard[c.faction].push(c);p.hand=[];p.board=[];if(r.pending?.playerId===p.id)r.pending=null;if(r.currentId===p.id){r.queue=[];if(r.phase==='initial')advanceInitial(r);else advance(r,p);}run(r);}
}
function commandAction(r,id,a){const p=getP(r,id);assert(p,'无效的玩家凭证');p.lastSeen=Date.now();
  if(a.type==='resume'){assert(!r.dissolved,'房间已解散');if(p.status==='away'){if(r.phase==='lobby')assert(r.players.filter(q=>q.status==='active').length<r.settings.maxPlayers,'房间已满，可稍后重新加入');p.status='active';}p.inRoom=true;event(r,'return',`${p.name} ${p.status==='surrendered'?'返回观战':'回到房间'}`);return;}
  if(a.type==='away'||a.type==='surrender'){if(a.type==='surrender')assert(p.status!=='surrendered','已经认输');depart(r,p,a.type==='surrender');return;}
  assert(inRoom(p),'请先返回房间');
  if(a.type==='chat'){const text=String(a.text||'').trim();assert(text&&text.length<=500,'消息长度应为 1–500 字');r.chat.push({id:uid(),time:Date.now(),player:p.id,name:p.name,text});r.chat=r.chat.slice(-200);return;}
  const hostControl=p.id===r.hostId&&['pauseRequest','resumeRequest','pauseDecision','resumeDecision','unpause'].includes(a.type);
  assert(p.status==='active'||hostControl,'请先返回房间；认输玩家只能观战');
  if(a.type==='settings'){assert(r.phase==='lobby'&&r.hostId===id,'只有房主能在准备房间修改设置');const s=normalizeSettings(a.settings,r.settings);assert(s.maxPlayers>=r.players.filter(q=>q.status==='active').length,'人数不能少于已加入人数');composition(s);r.settings=s;r.players.forEach(q=>q.ready=false);event(r,'settings',`${p.name} 更新了设置，其他玩家需要重新准备`);return;}
  if(a.type==='ready'){assert(r.phase==='lobby'&&r.hostId!==id,'房主无需准备');p.ready=!p.ready;event(r,'ready',`${p.name} ${p.ready?'已准备':'取消准备'}`);return;}
  if(a.type==='start'){assert(r.hostId===id,'只有房主能开始');start(r);return;}
  if(a.type==='pauseRequest'||a.type==='resumeRequest'){assert(['playing','initial','seating'].includes(r.phase),'尚未开始');const resume=a.type==='resumeRequest';assert(resume?r.paused:!r.paused,resume?'游戏未暂停':'游戏已暂停');const field=resume?'resumeRequests':'pauseRequests';r[field]??=[];if(r.hostId===id){r.paused=!resume;r.pauseRequests=[];r.resumeRequests=[];event(r,resume?'resume':'pause',`${p.name} ${resume?'恢复':'暂停'}游戏`);}else if(!r[field].includes(id)){r[field].push(id);event(r,resume?'resumeRequest':'pauseRequest',`${p.name} 请求${resume?'恢复':'暂停'}，等待房主同意`);}return;}
  if(a.type==='pauseDecision'||a.type==='resumeDecision'){const resume=a.type==='resumeDecision',field=resume?'resumeRequests':'pauseRequests';assert(r.hostId===id,'只有房主能决定暂停或恢复');assert(typeof a.approve==='boolean','决定无效');assert((resume?r.paused:!r.paused)&&(r[field]||[]).length,'请求已失效');r[field]=[];if(a.approve){r.paused=!resume;r.pauseRequests=[];r.resumeRequests=[];}event(r,resume?'resume':'pause',`房主${a.approve?'同意':'拒绝'}${resume?'恢复':'暂停'}请求`);return;}
  if(a.type==='unpause'){assert(r.hostId===id,'只有房主能恢复');assert(r.paused,'游戏未暂停');r.paused=false;r.pauseRequests=[];r.resumeRequests=[];event(r,'resume','房主恢复游戏');return;}
  if(a.type==='ackNotice'){if(!a.noticeId||p.privateNotice?.id===a.noticeId)p.privateNotice=null;return;}assert(!r.paused,'游戏已暂停');assert(r.phase!=='finished','对局已结束');
  if(a.type==='seat'){assert(r.phase==='seating'&&r.seatOrder[r.seatCursor]===id,'还没轮到你选座');assert(Number.isInteger(a.seat)&&a.seat>=0&&a.seat<r.seats.length&&!r.seats[a.seat],'位置不可选');r.seats[a.seat]=id;p.seat=a.seat;r.seatCursor++;event(r,'seat',`${p.name} 选择 ${a.seat+1} 号坐席`);advanceSeating(r);return;}
  if(a.type==='choice'){assert(r.pending&&r.pending.id===a.promptId&&r.pending.playerId===id,'当前没有需要你处理的响应');const opt=r.pending.options.find(o=>o.key===a.key);assert(opt,'选择无效');const pending=r.pending;if(['defense','goldAnswer','nunAnswer','storkAnswer','chestEndAnswer'].includes(pending.task.op))event(r,'responseChoice',`${p.name} ${opt.value==='pass'?'放弃响应':'选择响应'}`,{actor:id,accepted:opt.value!=='pass'});r.pending=null;enqueue(r,{...pending.task,choice:opt.value});run(r);return;}
  assert(!r.pending&&!r.queue.length,'等待当前卡牌效果与触发响应结算完成');assert(r.currentId===id,'还没轮到你');
  if(r.phase==='initial'){assert(a.type==='draw','初始阶段只能抽牌');drawOne(r,p,a.source);r.initialRemaining--;if(!r.initialRemaining)advanceInitial(r);run(r);return;}
  assert(r.phase==='playing','当前无法执行游戏行动');switch(a.type){
    case 'draw':assert(r.actions>0,'行动点不足');drawOne(r,p,a.source);r.actions--;p.drawActions++;break;
    case 'play':{const c=p.hand.find(h=>h.uid===a.uid);assert(c,'手牌不存在');play(r,p,c);break;}
    case 'activate':{const c=p.board.find(h=>h.uid===a.uid);assert(c&&legal(r,p,c,true),'持续牌无法发动');c.tapped=true;event(r,'activate',`${p.name} 横置「${c.title}」发动效果`,{actor:id,cardId:c.id});enqueue(r,{op:'effect',player:id,card:c,activation:true});break;}
    case 'discard':assert(r.actions===0,'行动点用完后才能弃置至手牌上限');assert(p.hand.length>4,'当前无需弃至上限');discard(r,p,take(p.hand,a.uid));break;
    case 'end':assert(r.actions===0||(!sources(r).length&&!p.hand.some(c=>legal(r,p,c))&&!p.board.some(c=>legal(r,p,c,true))),'还有行动点，请先完成行动');assert(p.hand.length<=4,'请先弃牌至 4 张');enqueue(r,...(p.drawActions===2?clockwise(r).filter(q=>q.id!==id).map(q=>({op:'chestEnd',player:q.id,current:id})):[]),{op:'advance',player:id});break;
    default:throw new Error('未知操作');
  }run(r);
}
function join(r,name){assert(r.phase==='lobby','对局已开始，请使用原身份返回');assert(r.players.filter(p=>p.status==='active').length<r.settings.maxPlayers,'房间已满');const p=player(name);r.players.push(p);event(r,'join',`${p.name} 加入房间`);return p;}
function view(r,id,{replay=false}={}){const p=getP(r,id);assert(p,'身份凭证无效');const spectator=p.status==='surrendered';return {code:r.code,hostId:r.hostId,phase:r.phase,version:r.version,settings:r.settings,composition:composition(r.settings),currentId:r.currentId,actions:r.actions,canEnd:r.actions===0||(!sources(r).length&&!p.hand.some(c=>legal(r,p,c))&&!p.board.some(c=>legal(r,p,c,true))),canDiscard:r.phase==='playing'&&r.currentId===id&&r.actions===0&&p.hand.length>4&&!r.pending&&!r.paused&&!r.undoRequest,canUndo:!replay&&['initial','playing'].includes(r.phase)&&inRoom(p)&&p.status==='active'&&!!r.undoStack?.length&&!r.undoRequest,undoRequest:r.undoRequest?structuredClone(r.undoRequest):null,round:r.round,turnNumber:r.turnNumber,paused:r.paused,pauseRequests:r.pauseRequests,seats:r.seats,seatChooser:r.seatOrder[r.seatCursor],initialRemaining:r.initialRemaining,winners:r.winners,events:r.events.slice(-250),chat:r.chat,privateNotice:p.privateNotice,players:r.players.map(q=>({id:q.id,name:q.name,ready:q.ready,status:q.status,seat:q.seat,roll:q.roll,coins:q.coins,handCount:q.hand.length,handBacks:q.hand.map(h=>h.faction).sort(),board:q.board,hand:q.id===id&&!spectator||replay?q.hand:undefined,online:Date.now()-q.lastSeen<15000})),decks:{royal:r.decks.royal.length,monster:r.decks.monster.length,tavern:r.decks.tavern.length},tavern:r.tavern,discard:r.discard,pending:r.pending?{id:r.pending.id,playerId:r.pending.playerId,text:r.pending.text,options:r.pending.playerId===id?r.pending.options.map(({key,label,card,hiddenFaction})=>({key,label,card,...(hiddenFaction?{hiddenFaction}:{})})):undefined}:null,legalHand:p.status==='active'&&r.phase==='playing'?p.hand.filter(c=>legal(r,p,c)).map(c=>c.uid):[],legalBoard:p.status==='active'&&r.phase==='playing'?p.board.filter(c=>legal(r,p,c,true)).map(c=>c.uid):[],replays:(r.replays||[]).map(x=>({id:x.id,time:x.time,winners:x.winners,frames:x.frames.length}))};}
function command(r,id,a){
 const p=getP(r,id);assert(p,'无效的玩家凭证');
 if(a.type==='undoCancel'){
  assert(r.undoRequest&&r.undoRequest.id===a.requestId&&r.undoRequest.playerId===id&&inRoom(p),'回退申请已失效或你不是申请人');
  r.undoRequest=null;event(r,'undoCancel',`${p.name} 撤销回退申请`);return;
 }
 if(a.type==='undoRequest'){
  assert(inRoom(p)&&p.status==='active','只有在场且未认输的玩家可以申请回退');
  assert(['initial','playing'].includes(r.phase),'当前阶段不可回退');
  assert(!r.undoRequest,'已有回退申请');
  const point=r.undoStack?.at(-1);assert(point,'没有可以回退的操作');
  r.undoRequest={id:uid(),playerId:id,checkpointId:point.id,voters:r.players.filter(q=>q.id!==id).map(q=>q.id),approved:[]};
  event(r,'undoRequest',`${p.name} 申请回退上一步操作，等待其他所有参赛者同意`);return;
 }
 if(a.type==='undoVote'){
  const request=r.undoRequest;assert(request&&request.id===a.requestId,'回退申请已失效');
  assert(inRoom(p)&&request.voters.includes(id),'你不能投票');
  assert(typeof a.approve==='boolean'&&!request.approved.includes(id),'投票无效或已投票');
  if(!a.approve){r.undoRequest=null;event(r,'undoReject',`${p.name} 拒绝回退，继续对局`);return;}
  request.approved.push(id);event(r,'undoVote',`${p.name} 同意回退`);
  if(request.approved.length===request.voters.length){
   const point=r.undoStack.at(-1);assert(point?.id===request.checkpointId,'回退目标已失效');
   const preserved={version:r.version,events:r.events,chat:r.chat,paused:r.paused,pauseRequests:r.pauseRequests,resumeRequests:r.resumeRequests,hostId:r.hostId};
   const identities=new Map(r.players.map(q=>[q.id,{lastSeen:q.lastSeen,inRoom:q.inRoom,status:q.status,name:q.name,userId:q.userId,token:q.token}]));
   Object.assign(r,structuredClone(point.state),preserved);
   for(const q of r.players){Object.assign(q,identities.get(q.id));if(q.privateNotice)q.privateNotice.id=uid();}
   if(r.pending){r.pending.id=uid();for(const o of r.pending.options)o.key=uid();}
   for(const e of r.events)if(point.eventIds.includes(e.id))e.undone=true;
   r.undoStack.pop();r.undoRequest=null;r.undoApplied=point.statDeltas||{};
   event(r,'undo',`其他所有参赛者均已同意，回退了 ${getP(r,point.actor)?.name||'玩家'} 的上一步操作`,{actor:id});
  }return;
 }
 const gameplay=['draw','play','activate','discard','end','choice'].includes(a.type);
 assert(!gameplay||!r.undoRequest,'等待所有参赛者决定回退申请');
 const before=gameplay&&['initial','playing'].includes(r.phase)?snapshot(r):null;
 commandAction(r,id,a);
 if(before){
  const eventIds=r.events.slice(before.events.length).map(e=>e.id);
  // History and chat remain append-only; checkpoints only need the rules state.
  delete before.events;delete before.chat;
  r.undoStack??=[];r.undoStack.push({id:uid(),actor:id,state:before,eventIds});r.undoStack=r.undoStack.slice(-20);
 }
}
function snapshot(r){const {frames,replays,undoStack,undoRequest,undoApplied,...data}=r;return structuredClone(data);}
module.exports={catalog,groups,extras,specials,defaults,composition,createRoom,join,command,view,snapshot,byId,card,run,legal,coin,drawOne,player,step,enterTurn,shuffle,depart,inRoom,inheritHost};
