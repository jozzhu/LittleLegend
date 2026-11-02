// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

let key='';
const $=s=>document.querySelector(s),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,body){const res=await fetch(url,{method:body?'POST':'GET',headers:{'X-Admin-Key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw Error(data.error);return data;}
const storage=document.createElement('section');storage.hidden=true;$('#admin-users').before(storage);
const resetDialog=document.createElement('dialog');resetDialog.innerHTML='<div class="dialog-head"><h2>账号恢复</h2><button id="reset-close" aria-label="关闭">×</button></div><p id="reset-account"></p><p>临时密码只在本次显示。请私下交给已核实身份的用户，登录后须修改。</p><input id="reset-secret" type="password" readonly autocomplete="off"><button id="reset-reveal">显示临时密码</button>';document.body.append(resetDialog);
$('#reset-close').onclick=()=>resetDialog.close();
resetDialog.addEventListener('close',()=>{$('#reset-secret').value='';$('#reset-secret').type='password';});
$('#reset-reveal').onclick=()=>{const input=$('#reset-secret');input.type=input.type==='password'?'text':'password';$('#reset-reveal').textContent=input.type==='password'?'显示临时密码':'隐藏临时密码';};
async function perform(work){try{await work();}catch(e){$('#admin-message').textContent=e.message;}}
async function load(){
 const [data,info]=await Promise.all([api('/api/admin/users'),api('/api/admin/storage')]);
 storage.hidden=false;
 storage.innerHTML=`<h2>服务器数据</h2><p>${esc(info.directory)}</p><p>${info.users} 个账户 · ${info.rooms} 个现存房间 · ${info.replays} 个共享回放</p><p>房主离开后顺时针移交身份；最后一人离开即解散房间并释放号码。注销账户可恢复；永久删除时，其他参与账户仍存在的回放和战绩保留，已无参与账户的回放自动清理。历史记录中的昵称和聊天原文保留。手动备份不在删除范围内。</p><button id="clear-data" class="danger">清空所有测试数据</button>`;
 $('#clear-data').onclick=()=>perform(async()=>{
  const confirmation=prompt('将清空所有人的账户、房间、聊天和共享回放。保留管理密钥，手动备份不受影响。输入“清空所有游戏数据”确认：');
  if(confirmation===null)return;
  await api('/api/admin/reset-data',{confirmation});await load();$('#admin-message').textContent='所有游戏数据已清空';
 });
 $('#admin-users').replaceChildren(...data.users.map(u=>{
  const section=document.createElement('section');section.className='module';section.style.marginTop='1rem';
  section.innerHTML=`<h2><span translate="no">${esc(u.nickname)}</span> <small><span translate="no">${esc(u.username)}</span> · ${u.disabled?'已注销':'正常'}</small></h2><label>昵称<input data-name value="${esc(u.nickname)}" maxlength="18"></label><details><summary>统计数据</summary><div class="profile-stats">${Object.entries(u.stats).map(([k,v])=>`<label>${esc(({games:'有效对局',interruptedGames:'中止对局',totalGames:'累计对局（自动计算）',wins:'胜利',losses:'落败'})[k]||k)}<input type="number" min="0" max="100000000" ${k==='totalGames'?'readonly':`data-stat="${esc(k)}"`} value="${v}"></label>`).join('')}</div></details><div class="row"><button data-save>保存资料和统计</button><button data-disable>${u.disabled?'恢复账户':'注销账户（可恢复）'}</button><button data-password>重置密码</button><button data-delete class="danger">永久删除账户</button></div>`;
  section.querySelector('[data-save]').onclick=()=>perform(async()=>{const stats={};section.querySelectorAll('[data-stat]').forEach(el=>stats[el.dataset.stat]=Number(el.value));await api('/api/admin/user',{id:u.id,nickname:section.querySelector('[data-name]').value,stats});await load();$('#admin-message').textContent='已保存';});
  section.querySelector('[data-disable]').onclick=()=>perform(async()=>{if(!confirm(u.disabled?'恢复账户？':'注销会使登录失效，保留资料、战绩和共享数据，可恢复。确认？'))return;await api('/api/admin/user',{id:u.id,disabled:!u.disabled});await load();});
  const password=section.querySelector('[data-password]');password.disabled=u.disabled;
  const resources=document.createElement('button');resources.textContent=u.resourceRefresh?.extraAvailable?'已有临时资源额度':'临时授予一次资源获取';resources.disabled=u.disabled||!!u.resourceRefresh?.extraAvailable;
  resources.onclick=()=>perform(async()=>{
   if(!confirm('允许 '+u.username+' 额外重新获取一次全部素材？额度当天有效（北京时间），不会清空该用户的账号或对局数据。'))return;
   resources.disabled=true;await api('/api/admin/resource-grant',{id:u.id});await load();$('#admin-message').textContent='已临时授予一次资源获取，当天有效';
  });section.querySelector('.row').append(resources);
  password.onclick=()=>perform(async()=>{if(!confirm('已核实 '+u.username+' 的身份？重置会使原密码和所有设备登录失效。'))return;const result=await api('/api/admin/reset-password',{id:u.id});$('#reset-account').textContent='账号：'+result.username;$('#reset-secret').value=result.temporaryPassword;$('#reset-secret').type='password';$('#reset-reveal').textContent='显示临时密码';resetDialog.showModal();});
  section.querySelector('[data-delete]').onclick=()=>perform(async()=>{
   const preview=await api('/api/admin/delete-preview?id='+encodeURIComponent(u.id));
   const phases={lobby:'准备房间',seating:'选座中',initial:'起始抽牌',playing:'对局中',finished:'对局结束，仍有人在房间'};
   const details=preview.rooms.map(r=>`${r.code}：${phases[r.phase]||r.phase}，在场 ${r.players} 人，${r.host?'房主':'参与者'}，${r.status==='surrendered'?'已认输':r.status==='away'?'暂离':'在场'}`).join('\n')||'没有关联房间';
   const confirmUsername=prompt(`${details}\n参与的共享回放：${preview.replays} 局。\n确认后进行中的席位先按认输处理并离开，房主顺时针移交；最后一人离开则解散房间。其他参与账户仍存在的回放保留，已无参与账户的回放自动清理。\n永久删除账户资料、统计和凭据，无法恢复。历史昵称、聊天原文及手动备份保留。\n输入完整账号 ${u.username} 确认：`);
   if(confirmUsername===null)return;
   await api('/api/admin/delete-user',{id:u.id,confirmUsername});await load();$('#admin-message').textContent='账户已永久删除；空房间和无人关联的回放已清理，其他参与者的共享数据保留';
  });
  return section;
 }));
}
$('#admin-login').onsubmit=async e=>{e.preventDefault();key=$('#admin-key').value;$('#admin-key').value='';try{await load();$('#admin-login').hidden=true;$('#admin-message').textContent='本机管理已解锁';}catch(e){key='';$('#admin-message').textContent=e.message;}};
