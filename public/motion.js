// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(){
 function visibleCards(state){
  const result=new Map();
  const put=(cards,zone,owner)=>{for(const card of cards||[])result.set(card.uid,{card,zone,owner});};
  for(const p of state.players){put(p.hand,'hand',p.id);put(p.board,'board',p.id);}
  put(state.tavern,'tavern');put(state.discard.royal,'discard');put(state.discard.monster,'discard');
  return result;
 }
 function planTransitions(before,after,viewer,catalog=[]){
  if(!before||before.matchId!==after.matchId||before.code!==after.code)return [];
  const old=visibleCards(before),next=visibleCards(after),seen=new Set(before.events.map(e=>e.id));
  const events=after.events.filter(e=>!seen.has(e.id)),moves=[];
  const pendingPlay=[...before.events].reverse().find(e=>e.type==='play');
  const playedFor=card=>[...after.events].reverse().find(e=>e.type==='play'&&(!seen.has(e.id)||before.pending&&e.id===pendingPlay?.id)&&(e.cardUid?e.cardUid===card.uid:e.cardId===card.id));
  if(events.some(e=>e.type==='undo'))return [];
  for(const [uid,to]of next){
   const from=old.get(uid);
   if(from&&from.zone===to.zone&&from.owner===to.owner)continue;
   if(from){moves.push({uid,card:to.card,from,to});continue;}
   if(to.zone==='hand'){
    const draw=events.find(e=>e.type==='draw'&&e.actor===to.owner);
    if(draw)moves.push({uid,card:to.card,from:{zone:draw.source||(/皇室牌库/.test(draw.text)?'royal':'monster')},to});
   }else if(to.zone==='board'||to.zone==='discard'){
    const discarded=events.find(e=>e.type==='discard'&&(e.cardUid?e.cardUid===uid:e.cardId===to.card.id));
    const played=playedFor(to.card);
    const owner=discarded?.actor||played?.actor||to.owner;
    if(owner)moves.push({uid,card:to.card,from:{zone:before.pending&&played&&played.id===pendingPlay?.id?'resolving':'hand',owner},to});
   }
  }
  for(const [uid,from]of old){
   if(next.has(uid)||!['board','discard'].includes(from.zone))continue;
   const retrieval=events.find(e=>['retrieve','search','return'].includes(e.type)&&(e.cardUid?e.cardUid===uid:e.cardId===from.card.id));
   const owner=after.players.find(p=>p.id===(retrieval?.actor||from.owner));
   if(owner&&owner.handCount>(before.players.find(p=>p.id===owner.id)?.handCount||0))moves.push({uid,card:from.card,from,to:{zone:'hand',owner:owner.id}});
  }
  for(const e of events.filter(e=>e.type==='draw'&&e.actor!==viewer)){
   const publicCard=e.cardId?[...old.values()].find(x=>x.zone==='tavern'&&(e.cardUid?x.card.uid===e.cardUid:x.card.id===e.cardId))?.card:null;
   moves.push({uid:e.id,card:publicCard||null,faction:e.faction,from:{zone:e.cardId?'tavern':e.source||(/皇室牌库/.test(e.text)?'royal':'monster')},to:{zone:'hand',owner:e.actor}});
  }
  for(const e of events.filter(e=>e.type==='play')){
   const card=catalog.find(c=>c.id===e.cardId);
   if(!card||[...next.values()].some(x=>e.cardUid?x.card.uid===e.cardUid:x.card.id===e.cardId&&x.owner===e.actor)||moves.some(m=>e.cardUid?m.uid===e.cardUid:m.card?.id===e.cardId))continue;
   moves.push({uid:e.cardUid||e.id,card,from:{zone:'hand',owner:e.actor},to:{zone:'resolving',owner:e.actor}});
  }
  return moves.slice(-8);
 }
 if(typeof module==='object'&&module.exports){module.exports={visibleCards,planTransitions};return;}
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let previous=null,identity=null;
 const active=new Set();
 function rect(node){
  if(!node||node.closest('[hidden]'))return null;
  const r=node.getBoundingClientRect();return r.width&&r.height?{left:r.left,top:r.top,width:r.width,height:r.height}:null;
 }
 function cardNode(uid){
  return [...document.querySelectorAll('#room .game-card')].find(el=>el.cardData?.uid===uid);
 }
 function zoneNode(zone){
  if(zone.zone==='royal'||zone.zone==='monster')return document.querySelector(`[data-source="${zone.zone}"]`);
  if(zone.zone==='tavern')return document.querySelector('#tavern');
  if(zone.zone==='discard')return document.querySelector('#discard-preview');
  if(zone.zone==='resolving')return document.querySelector('.table-center');
  const player=[...document.querySelectorAll('[data-player-id]')].find(el=>el.dataset.playerId===zone.owner);
  if(zone.zone==='board')return player?.querySelector('.board-card-row')||player;
  return zone.owner===seat.playerId?document.querySelector('#hand-cards'):player?.querySelector('.opponent-hand')||player;
 }
 function cancelAll(){for(const item of active){item.animation.cancel();item.node.remove();}active.clear();}
 function fly(move,from,to,delay){
  if(!from||!to)return;
  const image=document.createElement('img');image.className='motion-card';
  image.src=move.card?.image||`/assets/cardback_${move.faction==='royal'?'royal':'monster'}.png`;image.alt='';image.setAttribute('aria-hidden','true');
  const width=Math.min(105,Math.max(48,to.width)),height=width*2401/1746;
  Object.assign(image.style,{left:'0px',top:'0px',width:width+'px',height:height+'px'});
  document.body.append(image);
  if(active.size>16)cancelAll();
  const start={x:from.left+from.width/2-width/2,y:from.top+from.height/2-height/2};
  const end={x:to.left+to.width/2-width/2,y:to.top+to.height/2-height/2};
  const animation=image.animate([
   {transform:`translate(${start.x}px,${start.y}px) scale(.78) rotate(-5deg)`,opacity:.95},
   {transform:`translate(${(start.x+end.x)/2}px,${Math.min(start.y,end.y)-24}px) scale(1.04) rotate(2deg)`,opacity:1,offset:.5},
   {transform:`translate(${end.x}px,${end.y}px) scale(.9) rotate(0deg)`,opacity:0}
  ],{duration:310,delay,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'});
  const item={node:image,animation};active.add(item);
  animation.finished.catch(()=>{}).finally(()=>{image.remove();active.delete(item);});
 }
 const base=render;
 render=function(){
  const s=current(),key=s&&`${s.code}:${s.matchId}:${sessionEpoch}`;
  if(identity!==key||replay||s?.paused||s?.undoRequest){cancelAll();previous=null;identity=key;}
  const animate=s&&!replay&&typeof Element.prototype.animate==='function'&&document.visibilityState!=='hidden'&&!reduced()&&previous&&s.version>previous.version&&!s.paused&&!s.undoRequest;
  const moves=animate?planTransitions(previous,s,seat.playerId,meta?.cards||[]):[];
  const starts=new Map(moves.map(m=>[m.uid,rect(cardNode(m.uid))||rect(zoneNode(m.from))]));
  const handPositions=new Map([...document.querySelectorAll('#hand-cards .game-card')].map(node=>[node.cardData.uid,rect(node)]));
  base();
  if(animate){
   if(active.size>12)cancelAll();
   moves.forEach((move,i)=>fly(move,starts.get(move.uid),rect(cardNode(move.uid))||rect(zoneNode(move.to)),i*30));
   for(const node of document.querySelectorAll('#hand-cards .game-card')){
    const before=handPositions.get(node.cardData.uid),after=rect(node);
    if(before&&after&&(Math.abs(before.left-after.left)>1||Math.abs(before.top-after.top)>1))node.animate([{transform:`translate(${before.left-after.left}px,${before.top-after.top}px)`},{transform:'translate(0,0)'}],{duration:220,easing:'ease-out'});
   }
   const seen=new Set(previous.events.map(e=>e.id));
   for(const event of s.events.filter(e=>!seen.has(e.id))){
    if(!['attack','response','target'].includes(event.type))continue;
    const ids=event.type==='response'?[event.actor]:(event.targets||[event.target]);
    for(const id of ids){
     const player=[...document.querySelectorAll('[data-player-id]')].find(el=>el.dataset.playerId===id);
     player?.animate([{boxShadow:`inset 0 0 0 2px ${event.type==='response'?'#89d3df':'#e39077'}`},{boxShadow:'inset 0 0 0 0 transparent'}],{duration:430,easing:'ease-out'});
    }
   }
  }
  previous=s;
 };
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){cancelAll();previous=null;}});
})();
