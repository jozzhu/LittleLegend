// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(root){
 const version='3.0.1';
 const core=['battlefield_2560x1440.png','cardback_royal.png','cardback_monster.png','wood_table_texture.png','emblem_royal_sword.png','emblem_monster_spiral.png'].map(f=>'/assets/'+f);
 const music=['bgm_lobby.mp3','bgm_lobby(1).mp3','bgm_match.mp3','bgm_tension.mp3','bgm_replay.wav'].map(f=>'/assets/audio/bgm/'+f+'?v='+version);
 const sounds=['ui_click','ui_panel','ui_error','player_ready','dice_roll','dice_result','match_start','turn_start','card_draw','card_play','card_place','card_return','card_discard','coin_gain','coin_steal','attack','response_request','defend_success','effect_fizzle','declaration','chat','pause','victory','defeat'].map(f=>'/assets/audio/sfx/sfx_'+f+'.wav?v='+version);
 function isResource(input){
  try{const url=new URL(input,'http://legend.local');return url.origin==='http://legend.local'&&/^\/(?:cards\/[^/]+\.jpg|assets\/.+\.(?:png|jpg|jpeg|webp|mp3|wav))$/.test(url.pathname)&&!url.searchParams.has('private');}catch{return false;}
 }
 function createPreloader({fetchResource,online=()=>true,concurrency=2}){
  const queue=[],entries=new Map(),controllers=new Set();let running=0,stopped=false;
  const pump=()=>{
   while(!stopped&&online()&&running<concurrency&&queue.length){
    const item=queue.shift();running++;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);controllers.add(controller);
    fetchResource(item.url,{cache:'default',credentials:'omit',priority:'low',signal:controller.signal})
     .then(async res=>{if(!res.ok)throw Error('Resource unavailable');await res.arrayBuffer();item.status='ready';})
     .catch(()=>{entries.delete(item.url);})
     .finally(()=>{clearTimeout(timeout);running--;controllers.delete(controller);pump();});
   }
  };
  function add(urls,urgent=false){
   const added=[];
   for(const url of urls){
    if(!isResource(url))continue;
    if(entries.has(url)){
     const item=entries.get(url),index=queue.indexOf(item);
     if(urgent&&index>=0){queue.splice(index,1);added.push(item);}continue;
    }
    const item={url,status:'queued'};entries.set(url,item);added.push(item);
   }
   if(urgent)queue.unshift(...added);else queue.push(...added);pump();
  }
  return {add,resume:pump,stop(){stopped=true;queue.length=0;for(const c of controllers)c.abort();},status(){return {ready:[...entries.values()].filter(e=>e.status==='ready').length,queued:queue.length,running};}};
 }
 if(typeof module==='object'&&module.exports){module.exports={isResource,createPreloader,core,music,sounds};return;}
 const loader=createPreloader({fetchResource:(url,options)=>root.fetch(url,options),online:()=>root.navigator.onLine!==false&&document.visibilityState!=='hidden'});
 let manifest=null,manualBusy=false;
 function cards(values){loader.add((values||[]).map(c=>c.image).filter(Boolean));}
 // Wait until initial page setup has settled; never block login on a download queue.
 const begin=()=>{
  loader.add(music);
  loader.add(Array.from({length:37},(_,i)=>`/cards/card-${String(i+1).padStart(2,'0')}.jpg`));
  loader.add([...core,...sounds]);
  extraResources();
 };
 if(typeof root.requestIdleCallback==='function')root.requestIdleCallback(begin,{timeout:2000});else setTimeout(begin,1000);
 root.addEventListener('online',()=>loader.resume());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')loader.resume();});
 async function api(url,body){
  const response=await root.fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'资源请求失败');return data;
 }
 async function extraResources(){
  if(manifest)return;
  try{manifest=await api('/api/resources/manifest');loader.add(manifest.files.map(f=>f.url));}catch{}
 }
 function storageGet(key){try{return JSON.parse(root.localStorage.getItem(key));}catch{return null;}}
 function storageSet(key,value){try{root.localStorage.setItem(key,JSON.stringify(value));}catch{}}
 async function refreshAll(progress){
  if(manualBusy)throw Error('资源正在获取中');manualBusy=true;
  try{
   const [profile,status,resourceList]=await Promise.all([api('/api/auth/me'),api('/api/resources/status'),api('/api/resources/manifest')]);
   manifest=resourceList;
   const key='xcs-resource-job-'+profile.user.id;
   const saved=storageGet(key),resume=saved?.id===status.job?.id&&saved?.day===status.day&&!saved.finished;
   if(!resume){
    const message=`重新下载音乐、卡牌及其他素材，约 ${Math.ceil(resourceList.bytes/1048576)} MB，可能消耗穿透流量。每天一次，额外次数需管理员授权（北京时间）。确定继续？`;
    if(!await (typeof root.confirmTable==='function'?root.confirmTable(message):root.confirm(message)))return;
   }
   const result=await api('/api/resources/refresh',resume?{resumeId:saved.id}:{});
   const job=resume?saved:{id:result.job.id,day:result.day,done:[],finished:false};
   storageSet(key,job);
   const completed=new Set(job.done);let done=resourceList.files.filter(f=>completed.has(f.url)).length,failed=0;
   // Pause speculative work while the explicit refresh replaces the same HTTP cache entries.
   loader.stop();
   for(const item of resourceList.files){
    if(completed.has(item.url))continue;
    progress?.({done,total:resourceList.files.length,file:item.url,failed});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try{
     const response=await root.fetch(item.url,{cache:'reload',credentials:'omit',signal:controller.signal});
     if(!response.ok)throw Error('资源下载失败');await response.arrayBuffer();
     completed.add(item.url);done++;job.done=[...completed];storageSet(key,job);
    }catch{failed++;}finally{clearTimeout(timer);}
   }
   job.finished=failed===0;storageSet(key,job);progress?.({done,total:resourceList.files.length,failed});
   return {done,total:resourceList.files.length,failed};
  }finally{manualBusy=false;}
 }
 function installControls(){
  const actions=document.querySelector('.bar-actions');if(!actions)return;
  const button=document.createElement('button');button.id='open-resources';button.className='resource-button';button.type='button';button.title='本地资源';button.setAttribute('aria-label','本地资源');button.textContent='⇩';
  actions.append(button);
  const dialog=document.createElement('dialog');dialog.id='resources-dialog';
  dialog.innerHTML='<div class="dialog-head"><h2>本地资源</h2><button type="button" aria-label="关闭">×</button></div><p>音乐 → 卡牌 → 其他素材</p><p class="muted">资源缓存 30 天，登录不会重置有效期。浏览器可能提前清理空间；账号和对局始终从服务器实时读取。</p><p id="resources-quota"></p><progress id="resources-progress" max="1" value="0"></progress><p id="resources-status" role="status"></p><button id="resources-refresh" type="button">重新获取全部资源</button>';
  document.body.append(dialog);
  const statusNode=dialog.querySelector('#resources-status'),quotaNode=dialog.querySelector('#resources-quota'),refreshButton=dialog.querySelector('#resources-refresh'),bar=dialog.querySelector('progress');
  dialog.querySelector('.dialog-head button').onclick=()=>dialog.close();
  const quota=async()=>{try{const status=await api('/api/resources/status'),saved=storageGet('xcs-resource-job-'+status.userId),resume=saved?.id===status.job?.id&&saved?.day===status.day&&!saved.finished;quotaNode.textContent=`今日常规额度：${status.dailyAvailable?'1':'0'} 次 · 临时额度：${status.extraAvailable?'1':'0'} 次（北京时间）`;refreshButton.disabled=manualBusy||(!status.dailyAvailable&&!status.extraAvailable&&!resume);refreshButton.textContent=resume?'继续获取未完成资源':'重新获取全部资源';if(!manualBusy)statusNode.textContent='缓存不足时会自动补齐；重新获取会消耗下载流量。';}catch(e){quotaNode.textContent=e.message;refreshButton.disabled=true;}};
  button.onclick=()=>{if(!dialog.open){if(typeof openDialog==='function')openDialog(dialog);else dialog.showModal();}quota();};
  refreshButton.onclick=async()=>{
   refreshButton.disabled=true;
   try{
    const result=await refreshAll(p=>{bar.max=p.total;bar.value=p.done;statusNode.textContent=`已获取 ${p.done} / ${p.total}${p.failed?` · 失败 ${p.failed}`:''}`;});
    await quota();
    if(result){statusNode.textContent=result.failed?`已完成 ${result.done} / ${result.total}，${result.failed} 项未完成，可继续获取未完成资源，不再扣次。`:'全部资源已更新并写入浏览器缓存。';if(result.failed)refreshButton.textContent='继续获取未完成资源';}
   }catch(e){statusNode.textContent=e.message;refreshButton.disabled=false;}
  };
 }
 installControls();
 const auth=document.querySelector('#auth-screen');
 if(auth)new MutationObserver(()=>{if(auth.hidden)extraResources();}).observe(auth,{attributes:true,attributeFilter:['hidden']});
 root.LegendResources={cards,refreshAll,prioritize(url){loader.add([url],true);},status:loader.status};
})(typeof window==='object'?window:globalThis);
