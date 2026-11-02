// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let watchId=null,watchMatch=null,epoch=0,pending=false,catalog=[],lastVersion=-1;
const phases={lobby:'准备房间',seating:'掷骰选座',initial:'起始抽牌',playing:'对局中',finished:'对局已结束',interrupted:'对局中止'};
async function api(url,body,adminKey){
 const res=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(adminKey?{'X-Admin-Key':adminKey}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json();if(!res.ok){const error=Error(data.error||'连接失败');error.status=res.status;throw error;}return data;
}
function message(text){$('#gm-message').textContent=text;}
function cardsRow(cards){
 const row=document.createElement('div');row.className='gm-cards';
 if(!cards.length){row.innerHTML='<span class="empty-zone">无牌</span>';return row;}
 for(const c of cards){const button=document.createElement('button');button.className='gm-card'+(c.tapped?' tapped':'');button.title=c.title+' · '+c.effect;button.setAttribute('aria-label',c.title);button.innerHTML=`<img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy">`;button.onclick=()=>showCard(c);row.append(button);}
 return row;
}
function showCard(c){
 $('#gm-card-title').textContent=c.title;
 $('#gm-card-detail').innerHTML=`<img src="${esc(c.image)}" alt="${esc(c.title)}"><p><strong class="${c.faction}">${c.faction==='royal'?'皇室':'魔物'} · ${esc(c.badge)}</strong><br><br>${esc(c.effect)}</p>`;
 if(!$('#gm-card-dialog').open)$('#gm-card-dialog').showModal();
}
function logText(text,players){
 const tokens=[...new Set([...players.map(p=>p.name),...catalog.map(c=>c.title)])].filter(Boolean).sort((a,b)=>b.length-a.length);
 if(!tokens.length)return esc(text);
 const pattern=new RegExp(tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
 let html='',offset=0;
 for(const match of String(text).matchAll(pattern)){
  const player=players.find(p=>p.name===match[0]),card=catalog.find(c=>c.title===match[0]),quoted=text[match.index-1]==='「'&&text[match.index+match[0].length]==='」';
  html+=esc(text.slice(offset,match.index))+(player&&!(quoted&&card)?`<strong class="player-reference">${esc(match[0])}</strong>`:`<span class="card-reference ${card.faction}" title="${esc(card.effect)}">${esc(match[0])}</span>`);offset=match.index+match[0].length;
 }
 return html+esc(text.slice(offset));
}
function renderRooms(data){
 $('#gm-online').textContent=data.online;$('#gm-rooms').textContent=data.rooms;$('#gm-playing').textContent=data.playing;
 $('#gm-empty').hidden=data.roomList.length>0;
 $('#gm-room-list').replaceChildren(...data.roomList.map(r=>{
  const tr=document.createElement('tr');
  tr.innerHTML=`<td>${esc(r.code)}</td><td>${esc(phases[r.phase]||r.phase)}${r.paused?' · 暂停':''}</td><td translate="no">${esc(r.host)}</td><td>${r.present} / ${r.players}</td><td></td>`;
  if(r.canWatch){const b=document.createElement('button');b.textContent='全知观战';b.onclick=()=>enterWatch(r);tr.lastElementChild.append(b);}return tr;
 }));
}
async function enterWatch(room){
 const current=++epoch;
 try{
  const data=await api('/api/gm/enter',{code:room.code,matchId:room.matchId});
  if(current!==epoch)return;
  watchId=data.watchId;watchMatch=room.matchId;lastVersion=-1;
  $('#gm-overview').hidden=true;$('#gm-watch').hidden=false;message('');
  await refresh();
 }catch(e){message(e.message);}
}
function renderWatch(s){
 globalThis.LegendI18n?.setPlayers(s.players);
 globalThis.LegendAudio?.observe(s,{spectator:true});
 $('#gm-room-title').textContent='房间 '+s.code;
 $('#gm-phase').textContent=(phases[s.phase]||s.phase)+(s.paused?' · 暂停':'')+(s.round?' · 第 '+s.round+' 轮':'');
 const turn=s.players.find(p=>p.id===(s.phase==='seating'?s.seatChooser:s.currentId));
 $('#gm-turn').textContent=s.phase==='finished'?s.players.filter(p=>s.winners.includes(p.id)).map(p=>p.name).join('、')+' 获胜':turn?turn.name+(s.phase==='seating'?' 选座':' 的回合'):'';
 $('#gm-actions').textContent=s.phase==='playing'?'行动点 '+s.actions+' / 2':'';
 const notices=s.privateNotices.map(n=>`${s.players.find(p=>p.id===n.playerId)?.name||''}：${n.title}`);
 $('#gm-pending').hidden=!s.pending&&!notices.length;
 $('#gm-pending').textContent=[s.pending?`等待 ${s.players.find(p=>p.id===s.pending.playerId)?.name||''}：${s.pending.text}\n${s.pending.options.map(o=>o.label).join(' · ')}`:'',...notices].filter(Boolean).join('\n');
 $('#gm-players').replaceChildren(...s.players.slice().sort((a,b)=>(a.seat??99)-(b.seat??99)).map(p=>{
  const article=document.createElement('article');article.className='gm-player'+(p.id===s.currentId?' current':'');
  article.innerHTML=`<header><span class="avatar">${Avatars.html(p.avatar,p.name)}</span><div class="player-name"><strong>${esc(p.name)}</strong><small>${p.seat===null?'未选座':p.seat+1+' 号座'}${p.id===s.hostId?' · 房主':''} · ${!p.inRoom?'暂离':p.status==='surrendered'?'认输观战':'在场'}</small></div><span class="coin"><img src="/assets/ui/coin_front.png" alt="金币">${p.coins}</span></header><div class="zone-label">场上 <span>${p.board.length} 张</span></div>`;
  article.append(cardsRow(p.board));
  const label=document.createElement('div');label.className='zone-label';label.textContent='手牌 · '+p.hand.length+' 张';article.append(label,cardsRow(p.hand));return article;
 }));
 const open=new Set([...$('#gm-piles').querySelectorAll('details[open]')].map(el=>el.dataset.pile));
 const piles=[['tavern','酒馆',s.tavern],['discard','弃牌',[...s.discard.royal,...s.discard.monster]],...Object.entries(s.replayDecks).map(([id,cards])=>[id,(id==='royal'?'皇室牌库':id==='monster'?'魔物牌库':'酒馆补牌库')+' · 从上到下',cards.slice().reverse()])];
 $('#gm-piles').replaceChildren(...piles.map(([id,label,cards])=>{
  const details=document.createElement('details');details.dataset.pile=id;details.open=open.has(id);
  const summary=document.createElement('summary');summary.textContent=label+' · '+cards.length+' 张';details.append(summary,cardsRow(cards));return details;
 }));
 const list=$('#gm-events'),scroll=list.scrollTop;
 list.replaceChildren(...s.events.slice().reverse().map(e=>{
  const li=document.createElement('li');li.className='event-'+e.type;
  li.innerHTML=`<small>${new Date(e.time).toLocaleTimeString()}${e.round?' · 第 '+e.round+' 轮':''}${e.undone?' · 已回退':''}</small><p>${logText(e.text,s.players)}</p>`;return li;
 }));list.scrollTop=scroll;
 $('#gm-chat').replaceChildren(...s.chat.slice().reverse().map(e=>{
  const li=document.createElement('li');li.innerHTML=`<strong>${esc(e.name)}</strong><time>${new Date(e.time).toLocaleTimeString()}</time><p>${esc(e.text)}</p>`;return li;
 }));
}
async function refresh(){
 if(pending)return;pending=true;const current=epoch;
 try{
  if(watchId){
   const s=await api('/api/gm/state?watch='+encodeURIComponent(watchId));
   if(current!==epoch||s.matchId!==watchMatch)return;
   if(s.version!==lastVersion){renderWatch(s);lastVersion=s.version;}
  }else{
   const data=await api('/api/gm/rooms');if(current!==epoch)return;renderRooms(data);
   $('#gm-overview').hidden=false;$('#gm-unlock').hidden=true;
  }
  $('#gm-connection').textContent='已连接 · 只读';message('');
 }catch(e){
  if(current!==epoch)return;
  $('#gm-connection').textContent='连接未完成';message(e.message);
  if(e.status===401){$('#gm-unlock').hidden=false;$('#gm-overview').hidden=true;$('#gm-watch').hidden=true;watchId=null;watchMatch=null;}
 }finally{pending=false;}
}
$('#gm-back').onclick=async()=>{
 globalThis.LegendAudio?.reset();
 ++epoch;watchId=null;watchMatch=null;lastVersion=-1;$('#gm-watch').hidden=true;$('#gm-overview').hidden=false;$('#gm-card-dialog').close();
 try{await api('/api/gm/leave',{});}catch{}await refresh();
};
$('#gm-refresh').onclick=()=>refresh();
$('#gm-card-close').onclick=()=>$('#gm-card-dialog').close();
$('#gm-unlock').onsubmit=async e=>{
 e.preventDefault();let key=$('#gm-key').value;$('#gm-key').value='';
 try{const entry=await api('/api/admin/gm-ticket',{},key);key='';await api('/api/gm/login',{ticket:entry.ticket});await refresh();}catch(error){message(error.message);}finally{key='';}
};
async function initialize(){
 const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');if(location.hash)history.replaceState(null,'',location.pathname);
 try{catalog=(await api('/api/catalog')).cards;if(ticket)await api('/api/gm/login',{ticket});await refresh();}catch(e){message(e.message);$('#gm-unlock').hidden=false;}
 setInterval(refresh,1500);
}
initialize();
