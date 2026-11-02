// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

/* Public game feedback uses only the current player's server-filtered view. */
function cardReference(card,label=card.title){
 return `<span class="card-reference ${card.faction}" tabindex="0" data-card-id="${card.id}" title="${esc(card.effect)}">${esc(label)}</span>`;
}
function recordText(text,players=[]){
 const cards=(meta?.cards||[]).slice().sort((a,b)=>b.title.length-a.title.length);
 const names=[...new Set(players.map(p=>p.name).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const tokens=[...new Set([...names,...cards.map(c=>c.title)])].sort((a,b)=>b.length-a.length);
 if(!tokens.length)return esc(text);
 const pattern=new RegExp(tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
 let html='',offset=0;
 for(const match of String(text).matchAll(pattern)){
  const player=players.find(p=>p.name===match[0]),card=cards.find(c=>c.title===match[0]);
  // Explicit card quotes disambiguate a player who chose a card name as their nickname.
  const quoted=String(text)[match.index-1]==='「'&&String(text)[match.index+match[0].length]==='」';
  const index=players.indexOf(player),tone=player&&Number.isInteger(player.seat)?player.seat:index;
  html+=esc(text.slice(offset,match.index))+(player&&!(quoted&&card)?`<strong class="player-reference player-tone-${Math.max(0,tone)%5}">${esc(match[0])}</strong>`:cardReference(card));
  offset=match.index+match[0].length;
 }
 return html+esc(text.slice(offset));
}
const eventLabels={play:'打出',activate:'发动',target:'指定',responseChoice:'应对决定',response:'应对',responseResult:'应对结果',attack:'攻击结算',effectResult:'条件判定',draw:'抽牌',discard:'弃牌',coin:'金币',turn:'回合开始',end:'回合结束',guess:'公开宣言',declaration:'公开宣言',peek:'秘密查看',place:'放置',prepare:'准备阶段',buff:'效果',fizzle:'效果失效',retrieve:'回收',search:'检索'};
function eventExplanation(e){
 const card=meta?.cards.find(c=>c.id===e.cardId);
 if(['play','activate'].includes(e.type)&&card)return card.effect;
 if(e.type==='responseChoice')return e.accepted?'所选应对将按效果顺序结算。':'不使用应对，继续结算指定效果；这不代表手中没有应对牌。';
 if(e.type==='draw')return `原因：${e.reason||'抽牌'}。${e.cardId?'从酒馆取得的牌公开可见。':'暗抽的牌名仅持有者可见。'}`;
 if(e.type==='turn')return '本回合有 2 个行动点；准备阶段先处理回手及持续牌效果。';
 if(e.type==='end')return '当前玩家完成行动与手牌上限检查，顺时针轮到下一位玩家。';
 return '';
}
let logSignature=null;
const logNodes=new Map();
renderLog=function(s){
 const filter=$('#log-filter').value,roomTypes=['room','join','ready','settings','host','away','return','pause','pauseRequest','resume','resumeRequest','seat','dice','surrender','interrupted','dissolve','gm','undoRequest','undoVote','undoReject','undoCancel','undo'];
 const names=(s.players||[]).map(p=>[p.id,p.name,p.seat]);
 const signature=JSON.stringify([s.code,s.matchId,s.events,filter,names]);
 if(signature===logSignature)return;logSignature=signature;
 const list=$('#history-list'),scroll=list.scrollTop;
 list.replaceChildren(...s.events.filter(e=>filter==='all'||(filter==='room')===roomTypes.includes(e.type)).slice().reverse().map(e=>{
  const key=JSON.stringify([e,names]);if(logNodes.has(key))return logNodes.get(key);
  const li=document.createElement('li'),detail=eventExplanation(e);li.className=`event-${e.type}`;
  li.innerHTML=`<span>${e.round?`第 ${e.round} 轮 · `:''}${new Date(e.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ${esc(eventLabels[e.type]||'房间动态')}${e.undone?' · 已回退':''}</span><p>${recordText(e.text,s.players)}</p>${detail?`<small class="event-detail">${recordText(detail)}</small>`:''}`;
  logNodes.set(key,li);return li;
 }));
 if(logNodes.size>750)for(const [key,node]of logNodes)if(!node.isConnected)logNodes.delete(key);
 list.scrollTop=scroll;
};

const cardTooltip=document.createElement('div');cardTooltip.id='card-effect-tooltip';cardTooltip.setAttribute('role','tooltip');cardTooltip.hidden=true;document.body.append(cardTooltip);
function hideCardTooltip(){cardTooltip.hidden=true;}
function showCardTooltip(target){
 const reference=target.closest?.('.card-reference');if(!reference)return;
 const card=meta?.cards.find(c=>c.id===Number(reference.dataset.cardId));if(!card)return;
 cardTooltip.innerHTML=`<strong class="${card.faction}">${esc(card.title)}</strong><p>${esc(card.effect)}</p>`;
 cardTooltip.hidden=false;
 const rect=reference.getBoundingClientRect(),width=cardTooltip.offsetWidth;
 cardTooltip.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
 const height=cardTooltip.offsetHeight;
 cardTooltip.style.top=Math.max(8,rect.top>height+16?rect.top-height-8:Math.min(rect.bottom+8,window.innerHeight-height-8))+'px';
}
document.addEventListener('pointerover',e=>showCardTooltip(e.target));
document.addEventListener('focusin',e=>showCardTooltip(e.target));
document.addEventListener('pointerout',e=>{if(e.target.closest?.('.card-reference'))hideCardTooltip();});
document.addEventListener('focusout',hideCardTooltip);
document.addEventListener('scroll',hideCardTooltip,true);

const playerBlockWithArtwork=playerBlock;
playerBlock=function(p,s){
 const el=playerBlockWithArtwork(p,s);
 if(!replay){
  const hand=document.createElement('div');hand.className='opponent-hand';hand.setAttribute('aria-label',`${p.name} 的 ${p.handCount} 张手牌（牌背）`);
  const backs=p.handBacks||Array(p.handCount).fill('monster');
  for(const faction of backs){const img=document.createElement('img');img.src=`/assets/cardback_${faction}.png`;img.alt=faction==='royal'?'皇室手牌（背面）':'魔物手牌（背面）';img.draggable=false;hand.append(img);}
  el.append(hand);
 }
 return el;
};
const renderResponseWithControls=renderResponse;
renderResponse=function(s){
 renderResponseWithControls(s);
 if(!s.pending||s.pending.playerId!==seat.playerId||replay)return;
 const buttons=$$('#response-options .response-option');
 s.pending.options.forEach((option,index)=>{
  const button=buttons[index];if(!button||!option.hiddenFaction||button.querySelector('img'))return;
  const image=document.createElement('img');image.src=`/assets/cardback_${option.hiddenFaction}.png`;image.alt='暗牌背面';button.prepend(image);button.classList.add('hidden-card-option');
 });
};

const discardPreview=document.createElement('div');discardPreview.id='discard-preview';discardPreview.setAttribute('aria-label','最近三张弃牌');$('#view-discard').before(discardPreview);
function sortedDiscards(s){
 return [...s.discard.royal,...s.discard.monster].sort((a,b)=>(a.discardOrder??-1)-(b.discardOrder??-1));
}
function showDiscardPile(){
 const cards=sortedDiscards(current()).reverse();
 $('#card-title').textContent=`公共弃牌区 · ${cards.length} 张`;
 $('#card-detail').innerHTML='<div id="discard-gallery" class="gallery"></div>';
 for(const card of cards)$('#discard-gallery').append(cardButton(card,'discard'));
 openDialog('#card-dialog');
}
$('#view-discard').onclick=showDiscardPile;
discardPreview.onclick=showDiscardPile;

let previousTable=null;
document.addEventListener('pointerdown',e=>{
 const control=e.target.closest?.('.game-card,.draw-deck,.response-option,#end-turn,#card-actions button');
 if(control&&!control.disabled&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)control.animate([{scale:1},{scale:.97},{scale:1}],{duration:150,easing:'ease-out'});
});
function animateTable(s){
 const identity=JSON.stringify([s.code,s.matchId||'',s.phase==='lobby']);
 const seen=previousTable?.identity===identity?previousTable:null;
 const newEvents=seen?s.events.filter(e=>!seen.events.has(e.id)):[];
 if(!replay)for(const event of newEvents)if(['guess','declaration'].includes(event.type))toast(event.text);
 if(!replay&&seen&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  for(const p of s.players){
   const old=seen.players.get(p.id);if(!old)continue;
   const el=$$('[data-player-id]').find(el=>el.dataset.playerId===p.id);if(!el)continue;
   const action=newEvents.some(e=>e.actor===p.id&&['play','activate','response','coin'].includes(e.type));
   if(action)el.animate([{backgroundColor:'#7b694840'},{backgroundColor:'transparent'}],{duration:450,easing:'ease-out'});
   if(p.coins!==old.coins)el.querySelector('.coins')?.animate([{transform:'scale(1.15)',color:'#fff1b4'},{transform:'scale(1)'}],{duration:360});
  }
  const me=s.players.find(p=>p.id===seat.playerId);
  if(me)for(const button of $$('#hand-cards .game-card'))if(!seen.hand.has(button.cardData?.uid))button.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});
 }
 previousTable={identity,events:new Set(s.events.map(e=>e.id)),players:new Map(s.players.map(p=>[p.id,{coins:p.coins}])),hand:new Set(s.players.find(p=>p.id===seat.playerId)?.hand?.map(c=>c.uid)||[])};
}
const renderWithArtwork=render;
render=function(){
 renderWithArtwork();const s=current();if(!s)return;
 const me=s.players.find(p=>p.id===seat.playerId);
 $('#rematch').hidden=!!replay||s.phase!=='finished';
 if(!replay&&me?.status==='surrendered')$('#room-status').textContent=s.phase==='finished'?'你已落败 · 对局结束，可返回准备房间':'你已落败 · 正在观战';
 const cards=sortedDiscards(s),latest=cards.slice(-3);
 patchRegion('#discard-preview',latest,()=>latest.map(c=>cardButton(c,'discard-preview')));
 $('#view-discard').textContent=`弃牌 ${cards.length} 张 · 查看全部`;
 discardPreview.classList.toggle('has-stack',cards.length>3);
 animateTable(s);hideCardTooltip();
 // Removed cards no longer need cached DOM nodes; preserve visible card images.
 for(const [key,node]of cardElements)if(!node.isConnected)cardElements.delete(key);
};
