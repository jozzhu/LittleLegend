// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

/* Room configuration owns its controls; table layout attributes are unrelated. */
settingsForm=function(settings,editable){
 const disabled=editable?'':'disabled',c=meta.cards;
 return `<div class="settings-fields">
 <label>座位上限<select id="setting-count" ${disabled}>${[2,3,4,5].map(n=>`<option ${settings.maxPlayers===n?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="checkbox"><input id="setting-ex" type="checkbox" ${settings.expansions?'checked':''} ${disabled}>启用 EX 拓展</label>
 <div class="settings-section-head"><h3>基础 / 替换角色</h3><label class="checkbox"><input data-enable-all="roles" type="checkbox" ${disabled}>全部启用</label></div>
 ${meta.groups.map((g,i)=>`<div class="role-pair"><label class="checkbox"><input data-group-enabled="${i}" type="checkbox" ${(settings.disabledGroups||[]).includes(i)?'':'checked'} ${disabled}>启用</label><label>${i<5?'皇室':'魔物'} · ${g.map(id=>esc(c.find(x=>x.id===id).title)).join(' / ')}<select data-role="${i}" ${disabled}>${g.map(id=>`<option value="${id}" ${settings.roles[i]===id?'selected':''}>${esc(c.find(x=>x.id===id).title)}</option>`).join('')}</select></label><label class="checkbox"><input data-both="${i}" type="checkbox" ${(settings.bothRoles||[]).includes(i)?'checked':''} ${disabled}>同时启用</label></div>`).join('')}
 <div class="settings-section-head"><h3>EX 角色</h3><label class="checkbox"><input data-enable-all="extras" type="checkbox" ${disabled}>全部启用</label></div>
 ${meta.extras.map(id=>`<label class="checkbox"><input data-extra="${id}" type="checkbox" ${settings.extraIds.includes(id)?'checked':''} ${disabled}>${esc(c.find(x=>x.id===id).title)}</label>`).join('')}
 <details class="deck-counts"><summary>每种牌数量 <span data-deck-total></span></summary><div class="count-grid">
 ${c.map(x=>`<label>${esc(x.title)}<small data-preset-for="${x.id}"></small><input data-card-count="${x.id}" type="number" step="1" min="0" max="12" aria-label="${esc(x.title)}数量" value="${settings.counts[x.id]??''}" ${disabled}></label>`).join('')}
 </div></details>
 <details><summary>待确认裁定（当前房间约定）</summary><label class="checkbox"><input id="rule-hero" type="checkbox" ${settings.rules.heroFamily?'checked':''} ${disabled}>圣剑 / 魔剑将金、银、Lv.4 勇者视为勇者系列</label><label class="checkbox"><input id="rule-empty" type="checkbox" ${settings.rules.emptyFighter?'checked':''} ${disabled}>允许格斗家以空手效果得分</label></details>
 </div>${editable?'<button class="primary" id="save-settings">保存设置</button>':''}`;
};
function bindRoomSettings(settings){
 const root=$('#settings-content'),one=s=>root.querySelector(s),all=s=>[...root.querySelectorAll(s)];
 let previousPresets=null;
 function draft(){
  return {maxPlayers:Number(one('#setting-count').value),expansions:one('#setting-ex').checked,
   roles:all('[data-role]').map(el=>Number(el.value)),bothRoles:all('[data-both]:checked').map(el=>Number(el.dataset.both)),
   disabledGroups:all('[data-group-enabled]').filter(el=>!el.checked).map(el=>Number(el.dataset.groupEnabled)),
   extraIds:all('[data-extra]:checked').map(el=>Number(el.dataset.extra)),counts:{},
   rules:{heroFamily:one('#rule-hero').checked,emptyFighter:one('#rule-empty').checked}};
 }
 function update(){
  const s=draft(),presets=DeckPresets.presets(s,meta.groups,meta.extras,meta.specials);
  let total=0;
  for(const input of all('input[data-card-count]')){
   const id=Number(input.dataset.cardCount),enabled=Object.hasOwn(presets,id),value=presets[id]||0;
   // A preset change starts affected cards at their new default; untouched overrides survive.
   if(previousPresets&&(previousPresets[id]||0)!==value)input.value='';
   if(!enabled)input.value='';
   input.disabled=!enabled;input.placeholder=String(value);
   one(`[data-preset-for="${id}"]`).textContent=enabled?`默认 ${value} 张`:'未启用';
   total+=enabled&&input.value!==''?Number(input.value):value;
  }
  for(const select of all('[data-role]'))select.disabled=s.disabledGroups.includes(Number(select.dataset.role))||s.bothRoles.includes(Number(select.dataset.role));
  for(const check of all('[data-both]'))check.disabled=s.disabledGroups.includes(Number(check.dataset.both));
  const roles=one('[data-enable-all="roles"]'),enabled=10-s.disabledGroups.length;
  roles.checked=enabled===10&&s.bothRoles.length===10;roles.indeterminate=enabled>0&&!roles.checked;
  const extras=one('[data-enable-all="extras"]');extras.checked=s.expansions&&s.extraIds.length===meta.extras.length;
  extras.indeterminate=s.expansions&&s.extraIds.length>0&&!extras.checked;
  one('[data-deck-total]').textContent=`· ${Number.isFinite(total)?total:'—'} 张`;
  previousPresets=presets;
 }
 all('[data-role],[data-group-enabled],[data-both],[data-extra],#setting-count,#setting-ex').forEach(el=>el.addEventListener('change',()=>{
  if(el.dataset.extra!==undefined&&el.checked)one('#setting-ex').checked=true;
  update();
 }));
 all('input[data-card-count]').forEach(el=>el.addEventListener('input',update));
 one('[data-enable-all="roles"]').addEventListener('change',e=>{
  all('[data-group-enabled],[data-both]').forEach(el=>el.checked=e.target.checked);update();
 });
 one('[data-enable-all="extras"]').addEventListener('change',e=>{
  one('#setting-ex').checked=e.target.checked;all('[data-extra]').forEach(el=>el.checked=e.target.checked);update();
 });
 one('#save-settings').addEventListener('click',async()=>{
  const s=draft();
  for(const input of all('input[data-card-count]')){
   if(input.disabled)continue;
   if(input.validity?.badInput||input.value!==''&&(!Number.isInteger(Number(input.value))||Number(input.value)<0||Number(input.value)>12)){
    const card=meta.cards.find(c=>c.id===Number(input.dataset.cardCount));
    input.closest('details').open=true;input.focus();toast(`${card.title}的数量须为 0–12 的整数`);return;
   }
   if(input.value!=='')s.counts[input.dataset.cardCount]=Number(input.value);
  }
  if(await cmd('settings',{settings:s})){$('#settings-dialog').close();toast('设置已保存，其他玩家需重新准备');}
 });
 update();
}
showSettings=function(){
 const s=current(),host=state.hostId===seat.playerId,editable=!replay&&host&&state.phase==='lobby';
 $('#settings-title').textContent=editable?'准备房间设置':'设置与本局详情';
 $('#settings-content').innerHTML=(editable?settingsForm(state.settings,true):'')+
 `<div class="stack">${!replay&&['initial','playing','seating'].includes(state.phase)?`<button id="pause-button">${state.paused?(host?'恢复游戏':'申请恢复'):(host?'暂停游戏':'请求暂停')}</button>`:''}<button id="back-seat">关闭 · 返回${replay?'回放':'牌桌'}</button></div>`+(!editable?gameDetails(s):'');
 if(editable)bindRoomSettings(state.settings);
 $('#pause-button')?.addEventListener('click',async()=>{if(await cmd(state.paused?(state.hostId===seat.playerId?'unpause':'resumeRequest'):'pauseRequest'))$('#settings-dialog').close();});
 $('#back-seat').onclick=()=>$('#settings-dialog').close();openDialog('#settings-dialog');
};
$('#room-settings').onclick=()=>showSettings();
$('#open-settings').onclick=()=>state?showSettings():toast('可使用 Aa 滑块调整界面字号');
