// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,meta=null,seat=null,replay=null,replayIndex=0,replayTimer=null,pollTimer=null,busy=false,lastEvent=null,lastPrompt=null,sessionEpoch=0;
const saved=()=>{try{return JSON.parse(localStorage.getItem('xcs-seat-v2'));}catch{return null;}};
async function request(url,body){const controller=typeof AbortController==='function'?new AbortController():null;const timeout=controller?setTimeout(()=>controller.abort(),15000):null;try{const res=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',...(controller?{signal:controller.signal}:{}),headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{cache:'no-store'})});const data=await res.json();if(!res.ok){const error=new Error(data.error||'请求失败');error.status=res.status;if(data.roomCode){error.roomCode=data.roomCode;if(typeof showReturnRoom==='function')showReturnRoom(data.roomCode,data.phase);}throw error;}return data;}finally{if(timeout)clearTimeout(timeout);}}
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;if(typeof el.showPopover==='function'){if(el.matches(':popover-open'))el.hidePopover();el.showPopover();}else{const parent=document.querySelector('dialog[open]')||document.body;if(parent&&el.parentElement!==parent)parent.append(el);}clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidePopover?.();el.hidden=true;},4500);}
function acceptState(next,epoch=sessionEpoch){
 if(epoch!==sessionEpoch||!seat||next.unchanged)return false;
 if(next.players&&!next.players.some(p=>p.id===seat.playerId)){if(typeof returnToAccount==='function'){toast('房间身份已更新，请重新进入');returnToAccount();}return false;}
 if(state&&next.code===state.code&&next.version<state.version)return false;
 if(state&&next.code===state.code&&next.matchId===state.matchId&&next.version===state.version)return false;
 state=next;if(!replay)render();return true;
}
async function cmd(type,data={}){if(replay)return toast('回放模式不能操作实时对局');if(busy)return;busy=true;const epoch=sessionEpoch,code=seat.roomCode;let resync=false;try{const next=await request(`/api/command?code=${code}`,{type,matchId:state?.matchId,...data});if(epoch!==sessionEpoch)return false;acceptState(next,epoch);return true;}catch(e){if(epoch===sessionEpoch)toast(e.name==='AbortError'?'操作确认超时，正在重新同步，请先查看当前状态':e.message);resync=e.name==='AbortError'&&epoch===sessionEpoch;return false;}finally{busy=false;if(resync)poll();}}
function resetReplay(){clearInterval(replayTimer);replayTimer=null;replay=null;replayIndex=0;lastPrompt=null;$('#replay-controls').hidden=true;$('#replay-play').textContent='▶';}
function enter(result){sessionEpoch++;resetReplay();seat={roomCode:result.code,playerId:result.playerId,token:result.token};localStorage.setItem('xcs-seat-v2',JSON.stringify(seat));state=result.state;$('#lobby').hidden=true;$('#room').hidden=false;lastEvent=null;render();clearInterval(pollTimer);pollTimer=setInterval(poll,1000);if(typeof startLive==='function')startLive();}
let pollingEpoch=null;
async function poll(){if(!seat||busy||pollingEpoch===sessionEpoch)return;const epoch=sessionEpoch;pollingEpoch=epoch;try{const next=await request(`/api/state?code=${seat.roomCode}&since=${state?.version??-1}&match=${encodeURIComponent(state?.matchId||'')}`);if(epoch!==sessionEpoch)return;$('#connection-label').textContent='已连接';acceptState(next,epoch);}catch(e){if(epoch!==sessionEpoch)return;if([401,403,404].includes(e.status)&&typeof returnToAccount==='function'){toast(e.message);returnToAccount();return;}$('#connection-label').textContent='重连中';}finally{if(pollingEpoch===epoch)pollingEpoch=null;}}
async function restore(){const s=saved();if(!s?.roomCode)return toast('请从账号大厅选择需要返回的房间');try{enter(await request('/api/join',{code:s.roomCode}));}catch(e){toast(e.message);}}
function current(){return replay?replay.frames[replayIndex].state:state;}
const cardElements=new Map();
const regionCache=new Map(),playerElements=new Map();
function patchRegion(selector,key,build){
 const signature=JSON.stringify([sessionEpoch,!!replay,current()?.matchId,key]);
 if(regionCache.get(selector)===signature)return;
 $(selector).replaceChildren(...build());regionCache.set(selector,signature);
}
function stablePlayerBlock(p,s){
 if(playerElements.size>20)playerElements.clear();
 const signature=JSON.stringify([sessionEpoch,!!replay,p,s.currentId,s.hostId,s.phase,s.winners]);
 let cached=playerElements.get(p.id);
 if(!cached||cached.signature!==signature){cached={signature,node:playerBlock(p,s)};playerElements.set(p.id,cached);}
 return cached.node;
}
function cardButton(c,zone='hand',owner=null){const key=[zone,owner,c.uid||c.id].join(':');let b=cardElements.get(key);if(!b){b=document.createElement('button');const image=document.createElement('img'),label=document.createElement('span');image.decoding='async';image.draggable=false;b.append(image,label);b.addEventListener('click',()=>showCard(b.cardData,zone,owner));cardElements.set(key,b);}b.cardData=c;b.className=`game-card ${c.faction} ${c.tapped?'tapped':''}`;const image=b.querySelector('img');if(image.getAttribute('src')!==c.image)image.src=c.image;image.alt=c.title;b.querySelector('span').textContent=c.title;b.title=c.effect;return b;}
function playerBlock(p,s){const a=document.createElement('article');a.className=`player-block ${p.id===s.currentId?'current':''} ${p.status}`;a.innerHTML=`<header><button class="avatar profile-link" data-user="${esc(p.userId||'')}">${esc(p.name.slice(0,1))}</button><div><strong>${esc(p.name)}</strong>${p.title?`<span class="title-badge ${esc(p.title.tone)}">${esc(p.title.name)}</span>`:''}<small>${p.seat===null?'未选座':`${p.seat+1} 号座`} · ${p.id===s.hostId?'房主 · ':''}${p.status==='surrendered'?'观战':p.status==='away'?'暂离':p.online?'在线':'断线'}</small></div><span class="coins">◆ ${p.coins}<small>/ 5</small></span></header><div class="board-label">手牌 ${p.handCount} · 场上 ${p.board.length}</div><div class="board-card-row"></div>`;p.board.forEach(c=>a.querySelector('.board-card-row').append(cardButton(c,'board',p.id)));if(replay){const h=document.createElement('div');h.className='omniscient-hand';h.innerHTML='<small>全知 · 手牌</small>';for(const c of p.hand||[])h.append(cardButton(c,'replay',p.id));a.append(h);}return a;}
function render(){const s=current();if(!s)return;const me=s.players.find(p=>p.id===seat.playerId)||(replay?s.players[0]:null);if(!me)return;const host=s.hostId===seat.playerId,mine=s.currentId===seat.playerId&&me?.status==='active',playing=['playing','initial','seating','finished','interrupted'].includes(s.phase);$('#copy-room').textContent=s.code;$('#phase-label').textContent=replay?'全知复盘':({lobby:'准备房间',seating:'掷骰选座',initial:'起始手牌',playing:'进行中',finished:'已结束',interrupted:'已中止'})[s.phase];$('#room-status').textContent=s.phase==='interrupted'?'对局中止 · 不计胜负':s.winners.length?`${s.players.filter(p=>s.winners.includes(p.id)).map(p=>p.name).join('、')} 获胜`:s.paused?'游戏暂停':s.pending?`等待 ${s.players.find(p=>p.id===s.pending.playerId)?.name} 响应`:s.phase==='lobby'?`${s.players.length} / ${s.settings.maxPlayers} 人`:'';
  $('#waiting-panel').hidden=s.phase!=='lobby';$('#table-panel').hidden=!playing;$('#hand-panel').hidden=!playing;$('#room-settings').textContent=s.phase==='lobby'?'游戏设置':'设置 / 暂停';
  patchRegion('#waiting-players',[s.players.map(p=>[p.id,p.name,p.ready,p.status,p.avatar]),s.hostId],()=>s.players.map(p=>{const d=document.createElement('div');d.className='waiting-player';d.innerHTML=`<span class="avatar">${esc(p.name.slice(0,1))}</span><strong>${esc(p.name)}</strong><small>${p.id===s.hostId?'房主 · 无需准备':p.status==='away'?'暂离':p.ready?'已准备':'等待准备'}</small>`;return d;}));$('#ready-count').textContent=`${s.players.filter(p=>p.ready).length} 人已准备`;$('#config-summary').textContent=`${s.settings.expansions?'启用 EX 拓展':'不含 EX 拓展'} · 共 ${Object.values(s.composition).reduce((a,b)=>a+b,0)} 张牌${s.settings.maxPlayers===2?'，另设双人酒馆':''}`;$('#ready-button').hidden=host;$('#ready-button').textContent=me.ready?'取消准备':'准备';$('#start-game').hidden=!host;$('#start-game').disabled=s.players.length<2||s.players.some(p=>p.id!==s.hostId&&(!p.ready||p.status!=='active'));
  $('#turn-label').textContent=s.phase==='seating'?`等待 ${s.players.find(p=>p.id===s.seatChooser)?.name} 选座`:s.phase==='interrupted'?'对局中止':s.phase==='finished'?'传说落幕':`${s.players.find(p=>p.id===s.currentId)?.name} 的回合`;$('#actions-label').textContent=s.phase==='playing'?`行动点 ${s.actions} / 2`:s.phase==='initial'?`还需抽 ${s.initialRemaining} 张`:'';$('#round-label').textContent=s.round?`第 ${s.round} 轮 · 顺时针进行`:'掷骰定序';
  $('#seat-picker').hidden=s.phase!=='seating';$('#seat-picker').replaceChildren(...(s.seats||[]).map((id,i)=>{const b=document.createElement('button');b.innerHTML=`<strong>${i+1}</strong><span>${id?esc(s.players.find(p=>p.id===id).name):'选择座位'}</span>`;b.disabled=!!id||s.seatChooser!==seat.playerId||s.paused||!!replay;b.addEventListener('click',()=>cmd('seat',{seat:i}));return b;}));if(s.phase==='seating'){const rolls=document.createElement('div');rolls.className='dice-results';rolls.innerHTML=s.players.map(p=>`<span><b class="dice-face">${['','⚀','⚁','⚂','⚃','⚄','⚅'][p.roll?.value||1]}</b>${esc(p.name)}<small>${p.roll?.history.join(' / ')} 点</small></span>`).join('');$('#seat-picker').prepend(rolls);}
  const order=s.seats.length?s.seats.filter(Boolean).map(id=>s.players.find(p=>p.id===id)):s.players;
  const opponents=order.filter(p=>p.id!==me.id).map(p=>stablePlayerBlock(p,s)),own=stablePlayerBlock(me,s);
  if(opponents.some((node,i)=>$('#opponents').children?.[i]!==node)||$('#opponents').children?.length!==opponents.length)$('#opponents').replaceChildren(...opponents);
  if($('#my-board').children?.[0]!==own)$('#my-board').replaceChildren(own);
  $('#royal-count').textContent=s.decks.royal;$('#monster-count').textContent=s.decks.monster;$$('[data-source]').forEach(b=>b.disabled=!mine||s.paused||s.pending||!!replay||!['initial','playing'].includes(s.phase)||s.phase==='playing'&&!s.actions||!s.decks[b.dataset.source]);patchRegion('#tavern',s.tavern,()=>s.tavern.map(c=>cardButton(c,'tavern')));$('#tavern-zone').hidden=s.settings.maxPlayers!==2||s.phase==='seating';$('#tavern-count').textContent=`待补 ${s.decks.tavern} 张 · 明牌 ${s.tavern.length} 张`;$('#tavern-empty').hidden=!!s.tavern.length;
  $('#hand-count').textContent=`${me.handCount} / 4`;patchRegion('#hand-cards',[me.id,me.hand||[]],()=>(me.hand||[]).map(c=>cardButton(c,'hand',me.id)));$('#end-turn').disabled=!s.canEnd||!mine||s.phase!=='playing'||s.paused||!!s.pending||!!replay;$('#turn-help').textContent=me.status==='surrendered'?'你已认输，目前为观战视角':me.status==='away'?'你当前暂离，请返回后继续':mine?(s.phase==='initial'?'自由选择牌库，抽取起始手牌':me.handCount>4?'结束前需要弃牌至 4 张':'选择手牌打出，或点击牌库抽牌'):'等待对手行动';
  renderLog(s);renderChat(s);renderResponse(s);$('#paused-banner').hidden=!s.paused||!!replay;$('#resume-game').hidden=me.status!=='active'&&!host;$('#resume-game').textContent=host?'恢复游戏':(s.resumeRequests||[]).includes(me.id)?'已申请恢复':'申请恢复';$('#resume-game').disabled=!host&&(s.resumeRequests||[]).includes(me.id);const requests=s.paused?(s.resumeRequests||[]):s.pauseRequests;$('#pause-request').hidden=!host||!requests.length||!!replay;$('#pause-request-text').textContent=`${s.players.filter(p=>requests.includes(p.id)).map(p=>p.name).join('、')} 请求${s.paused?'恢复':'暂停'}`;
  $('#rematch').hidden=s.phase!=='finished'||!host||!!replay;if(!replayLoading)$('#replay-list').replaceChildren(...state.replays.map(x=>{const b=document.createElement('button');b.className='replay-item';b.textContent=`${new Date(x.time).toLocaleString()} · ${x.winners.join('、')} 获胜 · ${x.frames} 步`;b.onclick=()=>openReplay(x.id,b);return b;}));
  if(s.privateNotice&&!replay&&!$('#card-dialog').open&&noticeKey(s.privateNotice)!==dismissedNotice){$('#card-dialog').dataset.notice=noticeKey(s.privateNotice);$('#card-title').textContent=s.privateNotice.title;$('#card-detail').innerHTML='<div class="gallery" id="notice-gallery"></div><button id="ack-notice">已查看</button>';s.privateNotice.cards.forEach(c=>$('#notice-gallery').append(cardButton(c,'notice')));$('#ack-notice').onclick=()=>$('#card-dialog').close();openDialog('#card-dialog');}
}
let dismissedNotice=null;
function noticeKey(notice){return notice?.id||JSON.stringify([notice?.title,notice?.cards?.map(c=>c.uid)]);}
$('#card-dialog').addEventListener('close',async()=>{
 const dialog=$('#card-dialog'),key=dialog.dataset.notice;if(!key){if(state?.privateNotice&&!replay&&noticeKey(state.privateNotice)!==dismissedNotice)render();return;}
 delete dialog.dataset.notice;dismissedNotice=key;
 const epoch=sessionEpoch,code=seat?.roomCode,noticeId=state?.privateNotice?.id;
 if(!code)return;
 try{const next=await request(`/api/command?code=${code}`,{type:'ackNotice',noticeId});if(epoch===sessionEpoch&&next.version>=state.version){state=next;if(!replay)render();}}
 catch(e){dismissedNotice=null;toast('确认已查看失败：'+e.message);}
});
function renderLog(s){const filter=$('#log-filter').value,roomTypes=['room','join','ready','settings','host','away','return','pause','pauseRequest','resume','seat','dice','surrender'];$('#history-list').replaceChildren(...s.events.filter(e=>filter==='all'||(filter==='room')===roomTypes.includes(e.type)).slice().reverse().map(e=>{const li=document.createElement('li');li.className=`event-${e.type}`;li.innerHTML=`<span>${e.round?`第 ${e.round} 轮 · `:''}${new Date(e.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><p>${esc(e.text)}</p>`;return li;}));}
function renderChat(s){const el=$('#chat-list'),atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<45;patchRegion('#chat-list',s.chat,()=>s.chat.map(m=>{const d=document.createElement('div');d.className=`chat-message ${m.player===seat.playerId?'mine':''}`;d.innerHTML=`<small>${esc(m.name)} <time>${new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></small><p>${esc(m.text)}</p>`;return d;}));if(atBottom)el.scrollTop=el.scrollHeight;}
let choicePreview=null,choiceContext=null;
function syncChoicePreview(s){
 if(!choiceContext)return;
 const {epoch,code,promptId,key}=choiceContext;
 if(epoch!==sessionEpoch||code!==s.code||replay||s.paused||s.undoRequest||s.pending?.playerId!==seat.playerId||s.pending?.id!==promptId||!s.pending.options?.some(o=>o.key===key)){
  choicePreview.close();choiceContext=null;
 }
}
function previewChoice(prompt,option){
 const s=current();if(busy||replay||s.paused||s.undoRequest||s.pending?.id!==prompt.id)return;
 if(!choicePreview){
  choicePreview=document.createElement('dialog');choicePreview.id='choice-preview-dialog';choicePreview.setAttribute('aria-labelledby','choice-preview-title');
  choicePreview.innerHTML='<div class="dialog-head"><h2 id="choice-preview-title"></h2><button type="button" aria-label="关闭">×</button></div><p id="choice-preview-context" class="muted"></p><div id="choice-preview-detail"></div><div class="row choice-preview-actions"><button type="button" id="choice-preview-back">返回选择</button><button type="button" id="choice-preview-confirm" class="primary">确认选择</button></div>';
  document.body.append(choicePreview);
  choicePreview.querySelector('.dialog-head button').onclick=()=>choicePreview.close();
  $('#choice-preview-back').onclick=()=>choicePreview.close();
  choicePreview.addEventListener('close',()=>{choiceContext=null;});
  $('#choice-preview-confirm').onclick=async()=>{
   const context=choiceContext;if(!context||busy)return;
   const now=current();
   if(context.epoch!==sessionEpoch||context.code!==now?.code||replay||now.paused||now.undoRequest||now.pending?.id!==context.promptId||now.pending?.playerId!==seat.playerId||!now.pending.options?.some(o=>o.key===context.key)){
    choicePreview.close();toast('选择已失效，请按当前提示重新选择');return;
   }
   choicePreview.close();
   await cmd('choice',{promptId:context.promptId,key:context.key});
  };
 }
 choiceContext={epoch:sessionEpoch,code:s.code,promptId:prompt.id,key:option.key};
 $('#choice-preview-title').textContent=option.label;
 $('#choice-preview-context').textContent=prompt.text;
 const c=option.card;
 $('#choice-preview-detail').innerHTML=c?`<div class="card-detail-grid"><img src="${esc(c.image)}" alt="${esc(c.title)}"><div><h3>${esc(c.title)}</h3><span class="kicker">${c.faction==='royal'?'皇室':'魔物'} · ${esc(c.badge)}</span><p>${esc(c.effect)}</p></div></div>`:`<div class="hidden-choice-detail"><img src="/assets/cardback_${option.hiddenFaction==='royal'?'royal':'monster'}.png" alt="${esc(option.label)}"><strong>${esc(option.label)}</strong></div>`;
 if(!choicePreview.open)openDialog(choicePreview);
}
function renderResponse(s){const prompt=s.pending,mine=prompt?.playerId===seat.playerId&&!replay;syncChoicePreview(s);$('#response-overlay').hidden=!mine||s.paused;if(!mine){lastPrompt=null;return;}if(lastPrompt===prompt.id)return;lastPrompt=prompt.id;$('#response-title').textContent=prompt.text;$('#response-options').replaceChildren(...prompt.options.map(o=>{const b=document.createElement('button');b.className='response-option';b.innerHTML=`${o.card?`<img src="${o.card.image}" alt="">`:''}<span${!o.card&&!o.hiddenFaction&&s.players.some(p=>p.name===o.label)?' translate="no"':''}>${esc(o.label)}</span>`;b.onclick=()=>o.card||o.hiddenFaction?previewChoice(prompt,o):cmd('choice',{promptId:prompt.id,key:o.key});return b;}));const controls=document.createElement('div');controls.className='row response-controls';const pause=document.createElement('button');pause.textContent=s.hostId===seat.playerId?'暂停游戏':'请求暂停';pause.onclick=()=>cmd('pauseRequest');const leave=document.createElement('button');leave.textContent='暂离';leave.onclick=()=>leaveDuringResponse();controls.append(pause,leave);$('#response-options').append(controls);}
async function leaveDuringResponse(){await leave('away');}
function openDialog(id){const d=typeof id==='string'?$(id):id;if(!d.open)d.showModal();}
function showCard(c,zone,owner){const s=current(),mine=s.currentId===seat.playerId,can=!replay&&!s.paused&&!s.pending&&!s.undoRequest;$('#card-title').textContent=c.title;$('#card-detail').innerHTML=`<div class="card-detail-grid"><img src="${c.image}" alt="${esc(c.title)}"><div><span class="kicker">${c.faction==='royal'?'皇室':'魔物'} · ${esc(c.badge)}</span><p>${esc(c.effect)}</p><div id="card-actions" class="stack"></div></div></div>`;const add=(label,type,data,disabled=false)=>{const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=async()=>{if(await cmd(type,data))$('#card-dialog').close();};$('#card-actions').append(b);};if(zone==='hand'&&owner===seat.playerId){add('打出','play',{uid:c.uid},!can||!mine||!s.legalHand.includes(c.uid)||s.actions<1&&c.id!==3);if(s.canDiscard)add('弃置至手牌上限','discard',{uid:c.uid},!can||!mine);}if(zone==='board'&&owner===seat.playerId&&[1,10,30,31,36].includes(c.id))add(c.tapped?'已横置':'发动','activate',{uid:c.uid},!can||!mine||!s.legalBoard.includes(c.uid));if(zone==='tavern')add('拿取酒馆牌','draw',{source:c.uid},!can||!mine||!['initial','playing'].includes(s.phase)||s.phase==='playing'&&!s.actions);openDialog('#card-dialog');}
let settingsForm,showSettings;
function gameDetails(s){const entries=Object.entries(s.composition).filter(([,n])=>n>0),two=s.settings.maxPlayers===2;return `<section class="game-details"><h3>本局游戏详情</h3><p class="muted">${s.settings.maxPlayers} 人 · ${s.settings.expansions?'启用 EX 拓展':'不含 EX 拓展'} · 总计 ${entries.reduce((n,[,count])=>n+count,0)} 张${two?'（含酒馆）':''}</p>${['royal','monster'].map(f=>`<h3>${f==='royal'?'皇室':'魔物'}</h3><ul class="composition-list">${entries.filter(([id])=>meta.cards.find(c=>c.id===Number(id))?.faction===f).map(([id,n])=>`<li><span>${esc(meta.cards.find(c=>c.id===Number(id)).title)}</span><strong>${n} 张</strong>${two&&n===4?'<small>主牌库 3 · 酒馆 1</small>':''}</li>`).join('')}</ul>`).join('')}<h3>本局约定</h3><ul class="rules-list"><li>圣剑 / 魔剑：${s.settings.rules.heroFamily?'金勇者、银勇者及 Lv.4 勇者均属于勇者系列':'仅 Lv.4 勇者属于指定勇者'}</li><li>格斗家：${s.settings.rules.emptyFighter?'允许空手效果得分':'不允许空手效果得分'}</li><li>固定 1 号座先手，顺时针进行；5 金币立即获胜。</li>${two?'<li>每种正好 4 张的牌分出 1 张进入酒馆；取走明牌后立即补位。</li>':''}</ul></section>`;}
let replayLoading=false;
async function withReplayLoad(button,load){
 if(replayLoading)return;
 replayLoading=true;
 const buttons=[...new Set([...$$('.replay-item, #account-replays button'),...(button?[button]:[])])];
 const previous=buttons.map(b=>({b,disabled:b.disabled,label:globalThis.LegendI18n?.originalText?.(b)??b.textContent}));
 buttons.forEach(b=>{b.disabled=true;});
 if(button){button.textContent='请稍等…';button.setAttribute('aria-busy','true');}
 try{return await load();}
 catch(e){toast(e.message);}
 finally{
  replayLoading=false;
  for(const {b,disabled,label}of previous){b.disabled=disabled;b.textContent=label;}
  button?.removeAttribute?.('aria-busy');
 }
}
async function openReplay(id,button){return withReplayLoad(button,async()=>{
 const epoch=sessionEpoch,record=await request(`/api/replay?match=${id}`);
 if(epoch!==sessionEpoch)return;
 if(!record.frames.length)throw Error('此回放没有可展示的帧');
 resetReplay();replay=record;replayIndex=0;$('#replay-controls').hidden=false;$('#replay-range').max=replay.frames.length-1;renderReplay();
});}
function renderReplay(){$('#replay-range').value=replayIndex;$('#replay-position').textContent=`${replayIndex+1} / ${replay.frames.length}`;$('#replay-note').textContent=(replay.outcome==='interrupted'?'中止对局 · 不计胜负':'赛后全知视角')+' · 逐步重现已存档状态';render();}
$('#replay-range').oninput=e=>{replayIndex=Number(e.target.value);renderReplay();};$('#replay-play').onclick=()=>{if(replayTimer){clearInterval(replayTimer);replayTimer=null;$('#replay-play').textContent='▶';return;}$('#replay-play').textContent='Ⅱ';replayTimer=setInterval(()=>{if(replayIndex>=replay.frames.length-1){clearInterval(replayTimer);replayTimer=null;$('#replay-play').textContent='▶';return;}replayIndex++;renderReplay();},1000);};$('#replay-close').onclick=()=>{clearInterval(replayTimer);replayTimer=null;replay=null;$('#replay-controls').hidden=true;lastPrompt=null;render();};
$('#create-room').onclick=async()=>{try{enter(await request('/api/create',{code:$('#custom-room-code').value,name:$('#player-name').value,settings:{...meta.defaults,maxPlayers:Number($('#player-count').value),expansions:$('#create-ex').checked,extraIds:$('#create-ex').checked?meta.extras.slice(0,2):[]}}));}catch(e){toast(e.message);}};
$('#join-room').onclick=async()=>{try{const code=$('#room-code').value.trim().toUpperCase();if(saved()?.roomCode===code){await restore();return;}enter(await request('/api/join',{name:$('#player-name').value,code}));}catch(e){$('#lobby-note').textContent=e.message;}};$('#return-room').onclick=restore;$('#ready-button').onclick=()=>cmd('ready');$('#start-game').onclick=()=>cmd('start');$('#room-settings').onclick=showSettings;$('#open-settings').onclick=()=>state?showSettings():toast('可使用 Aa 滑块调整界面字号');$('#end-turn').onclick=()=>cmd('end');$$('[data-source]').forEach(b=>b.onclick=()=>cmd('draw',{source:b.dataset.source}));$('#resume-game').onclick=()=>cmd(state.hostId===seat.playerId?'unpause':'resumeRequest');$('#approve-pause').onclick=()=>cmd(state.paused?'resumeDecision':'pauseDecision',{approve:true});$('#deny-pause').onclick=()=>cmd(state.paused?'resumeDecision':'pauseDecision',{approve:false});$('#rematch').onclick=()=>cmd('rematch');$('#exit-menu').onclick=()=>openDialog('#exit-dialog');
async function leave(type){resetReplay();if(await cmd(type)){$$('dialog[open]').forEach(d=>d.close());if(type==='surrender'){render();return;}sessionEpoch++;clearInterval(pollTimer);if(typeof stopLive==='function')stopLive();$('#response-overlay').hidden=true;$('#paused-banner').hidden=true;$('#pause-request').hidden=true;$('#room').hidden=true;$('#lobby').hidden=false;$('#return-room').hidden=false;}}
$('#away-button').onclick=()=>leave('away');$('#surrender-button').onclick=async()=>{const message='认输不可撤销，本局返回后只能观战。确定认输吗？';if(await (typeof confirmTable==='function'?confirmTable(message):confirm(message)))await leave('surrender');};$('#chat-form').onsubmit=async e=>{e.preventDefault();const text=$('#chat-input').value;if(await cmd('chat',{text}))$('#chat-input').value='';};$('#log-filter').onchange=()=>renderLog(current());$('#copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast('已复制房间号');}catch{toast(state.code);}};
$('#view-discard').onclick=()=>{$('#card-title').textContent='公共弃牌区';$('#card-detail').innerHTML='<div id="discard-gallery" class="gallery"></div>';[...current().discard.royal,...current().discard.monster].forEach(c=>$('#discard-gallery').append(cardButton(c,'discard')));openDialog('#card-dialog');};$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
const font=$('#font-scale');font.value=localStorage.getItem('xcs-font')||16;function applyFont(){document.documentElement.style.fontSize=font.value+'px';$('#font-value').value=font.value;localStorage.setItem('xcs-font',font.value);}font.oninput=applyFont;applyFont();
