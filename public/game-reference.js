// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(){
 'use strict';
 const extraIds=new Set([4,14,15,20,29,30,31,33]);
 function filterCards(cards,filters={}){
  const query=String(filters.query||'').trim().toLocaleLowerCase();
  return cards.filter(c=>{
   const effect=c.effect||'',ex=c.expansion??extraIds.has(c.id);
   const type=effect.startsWith('△')?'attack':effect.startsWith('∞')?'persistent':effect.startsWith('⚡')?'response':'ordinary';
   const badgeLevel=/Lv\.(\d+)/.exec(c.badge||'');
   const level=Number.isInteger(c.level)?c.level:badgeLevel?Number(badgeLevel[1]):null;
   return (!query||[c.name,c.title,c.badge,effect,globalThis.LegendI18n?.searchText(c)||''].join(' ').toLocaleLowerCase().includes(query))&&
    (!filters.faction||c.faction===filters.faction)&&(!filters.type||type===filters.type)&&
    (!filters.expansion||(filters.expansion==='ex'?ex:!ex))&&
    (filters.level===undefined||filters.level===null||filters.level===''||(filters.level==='none'?level===null:level===Number(filters.level)));
  });
 }
 function constrain(rect,viewport){
  const width=Math.min(Math.max(260,rect.width),Math.max(1,viewport.width-16));
  const height=Math.min(Math.max(220,rect.height),Math.max(1,viewport.height-16));
  return {width,height,x:Math.max(8,Math.min(rect.x,viewport.width-width-8)),y:Math.max(8,Math.min(rect.y,viewport.height-height-8))};
 }
 if(typeof module==='object'&&module.exports){module.exports={filterCards,constrain};return;}
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rules=`
 <h3>目标与胜利</h3><p>2–5 人争夺皇室与魔物两种牌库。集齐 5 枚金币立即获胜；两种主牌库都耗尽时，金币最多者获胜，可以并列。圣杯等卡牌还具有各自的胜利条件。</p>
 <h3>准备与选座</h3><p>房主配置人数、替换角色、EX 拓展和卡牌数量，其他人准备后由房主开始。设置改变后需要重新准备。大家掷骰，点数高者先选座，同点重掷；从 1 号座开始顺时针行动，每人依次选取 3 张起始手牌。</p>
 <h3>两人酒馆</h3><p>两人局将配置数量恰为 4 的每种牌各移出 1 张组成酒馆。抽牌时可以选皇室、魔物或可用的酒馆牌；最终组成以“本局游戏详情”为准。</p>
 <h3>回合流程</h3><p>每人每回合有 2 个行动点，首个自己的回合跳过准备阶段。之后准备阶段会自动收回场上非持续牌，并结算相关准备效果。行动时可抽牌、打出合法手牌，或发动可用的场上持续牌。公主不消耗行动点；横置发动的持续牌不消耗行动点，是否可发动以卡牌效果为准。</p>
 <p>行动点需用完才能结束回合；没有任何合法行动时可结束。只有行动点为零且手牌超过 4 张时，才可主动弃至 4 张；卡牌效果要求的弃置照常结算。应对与选择未结算时不能跳过。酒馆和弃牌区取得的牌会公开记录牌名，主牌库暗抽不公开。</p>
 <h3>卡牌标记与应对</h3><p>△ 为攻击，指定目标后会询问应对，即使没有应对牌也要选择不应对；⚡ 为符合条件时可选的应对；∞ 为持续牌。放置与打出不同：被放置到场上的牌不会自动发动打出效果。场上牌公开，手牌牌面仅持有人可见；公开宣言会记录并广播。</p>
 <h3>暂停、暂离与认输</h3><p>房主可以直接暂停或恢复，其他人向房主申请。准备房间只有离开，没有认输。对局中暂离可用原账号返回；认输不可撤销，留在桌边观战。房主离开顺时针移交权限，最后一人离开后解散房间。未结束且全部离开记为中止，不计胜负。</p>
 <h3>回退</h3><p>初始抽牌或对局进行中，可申请撤销上一步游戏操作。其他所有参赛者一致同意后执行，任一人拒绝则取消，申请人可撤销申请。投票期间暂停游戏操作，已看到的信息无法抹去。有人离开或认输会取消申请并清空可回退历史，结束后不再回退。</p>
 <h3>回放与房规</h3><p>参赛者可查看自己最近五局的全知回放，支持步进与播放。服务器本机另有实时全知观战。圣剑 / 魔剑对“勇者”的范围、格斗家空手判定及各牌数量等约定以本局游戏详情为准；图鉴展示全部 37 种牌，不代表本局全部启用。</p>`;
 const platform=`
 <h3>连接与登录</h3><p>由一台 Windows 或 Android 设备启动主机服务，端口留空会自动选择空闲端口。同一网络的玩家在浏览器打开主机给出的局域网地址，各自注册或登录。通过樱花穿透游玩时，使用主机对应的穿透地址，主机需要持续运行。</p>
 <h3>创建、加入与准备</h3><p>登录后创建房间，房间号可自定义，留空随机生成；其他玩家输入房间号加入。房主在准备房间选择人数、基础 / 替换角色、EX 拓展和牌数。上方选择是预设，下方自定义数量优先；修改设置会取消其他玩家的准备状态。非房主都准备好后，房主开始对局。</p>
 <h3>牌桌操作</h3><p>点击牌先查看效果，再按打出、发动或拿取按钮；需要选牌时先预览再确认，来源会标明手牌、场上或牌堆。场上牌正面公开，其他人的手牌只显示牌背。系统自动处理效果、应对、行动点和胜负，不能跳过未完成的结算。右上角可调游戏字号、声音，查阅介绍与筛选卡牌图鉴；浮窗可拖动、缩放、置顶及关闭。</p>
 <h3>沟通、暂停与回退</h3><p>左侧查看带牌名效果提示的对局记录，右侧桌边聊天用于交流。对局设置中，房主可直接暂停和恢复，其他玩家提出申请后由房主决定。回退需要其他所有参赛者同意；已经看到的信息不会重新变成秘密。</p>
 <h3>离开、返回与房主交接</h3><p>准备阶段可以离开，没有认输。对局中暂离后用原账号返回，可继续原来的席位；认输后留在牌桌观战，返回也不能恢复参赛。房主离开时按顺时针移交权限，最后一人离开解散房间并释放号码。主机设备停服会影响所有连接，房主身份移交不会把服务器搬到另一台设备。</p>
 <h3>存档、名片与观战</h3><p>账户、战绩和存档保存在搭建服务器的设备上，同一服务器登录可恢复自己的数据。名片可编辑头像、佩戴词条及展示三个词条，并查看累计 / 有效 / 中止对局和胜率。最近五局支持全知复盘、步进、拖动与自动播放；主机控制台另可进入只读全知观战，进入时会写入对局记录。</p>
 <h3>音乐、音效与缓存</h3><p>音乐与音效分别控制开关和音量，新设备默认音乐 100、音效 70；首次点击或按键后开始播放，切后台停声。资源优先加载音乐，其次卡牌，最后其他素材，加载后由浏览器缓存 30 天，登录不重置有效期。浏览器空间不足或手动清理可能提前移除缓存。保持同一访问域名和端口，有利于复用缓存、节约穿透流量。</p>
 <h3>重新获取素材与账号帮助</h3><p>顶栏下载图标打开“本地资源”，可重新获取全部音乐、卡牌及其他素材，确认前显示预计下载流量。每个账号按北京时间每天一次，未完成部分可继续；额外次数需联系后台管理临时授权，当天有效。自动补齐缺失素材不扣次数。忘记密码请联系主机管理员核实身份后重置；卸载安卓主机或删除服务器数据前，应先备份存档。</p>`;
 const windows=[];
 let catalogPromise;
 function getCatalog(){
  if(!catalogPromise)catalogPromise=fetch('/api/catalog',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('图鉴读取失败');return r.json();}).then(data=>data.cards||data.catalog||data).catch(e=>{catalogPromise=null;throw e;});
  return catalogPromise;
 }
 function createWindow(kind,title){
  const el=document.createElement('section');
  el.className='reference-window';el.id='reference-'+kind;el.setAttribute('popover','manual');el.setAttribute('role','region');el.setAttribute('aria-label',title);el.tabIndex=-1;
  el.innerHTML=`<header class="reference-head"><h2>${title}</h2><button class="reference-pin" aria-label="置顶" title="置顶" aria-pressed="true">⌖</button><button class="reference-close" aria-label="关闭" title="关闭">×</button></header><div class="reference-content"></div><button class="reference-resize" title="拖动调整大小" aria-label="调整浮窗大小"></button>`;
  document.body.append(el);
  const state={el,open:false,pinned:true,rect:{x:Math.max(8,(innerWidth-760)/2),y:Math.max(8,(innerHeight-560)/2),width:760,height:560}};
  const viewport=()=>({width:innerWidth,height:innerHeight});
  function layout(){state.rect=constrain(state.rect,viewport());Object.assign(el.style,{left:state.rect.x+'px',top:state.rect.y+'px',width:state.rect.width+'px',height:state.rect.height+'px'});}
  function promote(){
   if(!state.open||!state.pinned)return;
   // A popover outside a modal dialog is inert even when drawn above it.
   const dialogs=[...document.querySelectorAll('dialog[open]')].filter(d=>!d.matches||d.matches(':modal'));
   const parent=dialogs.at(-1)||document.body;
   if(el.showPopover)try{el.hidePopover();}catch{}
   if(el.parentElement!==parent)parent.append(el);
   if(el.showPopover)try{el.showPopover();}catch{}
  }
  function open(){state.open=true;el.hidden=false;layout();if(state.pinned)promote();el.focus();}
  function close(){if(el.hidePopover)try{el.hidePopover();}catch{}state.open=false;el.hidden=true;}
  el.querySelector('.reference-close').onclick=close;
  const pin=el.querySelector('.reference-pin');pin.onclick=()=>{
   state.pinned=!state.pinned;pin.setAttribute('aria-pressed',String(state.pinned));pin.title=state.pinned?'取消置顶':'置顶';pin.setAttribute('aria-label',pin.title);
   if(state.pinned){el.setAttribute('popover','manual');promote();}
   else {if(el.hidePopover)try{el.hidePopover();}catch{}el.removeAttribute('popover');}
  };
  function gesture(handle,resizing){
   handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button')&&!resizing)return;
    event.preventDefault();const start={...state.rect},x=event.clientX,y=event.clientY;
    handle.setPointerCapture(event.pointerId);
    const move=e=>{state.rect=resizing?{...start,width:start.width+e.clientX-x,height:start.height+e.clientY-y}:{...start,x:start.x+e.clientX-x,y:start.y+e.clientY-y};layout();};
    const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
   });
  }
  gesture(el.querySelector('.reference-head'),false);gesture(el.querySelector('.reference-resize'),true);
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
  addEventListener('resize',layout);windows.push({...state,promote});close();
  return {el,open,content:el.querySelector('.reference-content'),promote};
 }
 let ruleWindow,atlasWindow;
 const introductionButton=document.querySelector('#open-rules');
 introductionButton.textContent='介绍';introductionButton.title='介绍';introductionButton.setAttribute('aria-label','介绍');
 document.querySelector('#open-rules').onclick=()=>{
  if(!ruleWindow){
   ruleWindow=createWindow('rules','介绍');
   const tabs=document.createElement('div');tabs.className='reference-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','介绍分类');
   ruleWindow.content.id='introduction-panel';ruleWindow.content.setAttribute('role','tabpanel');ruleWindow.content.tabIndex=0;
   const choices=[['玩法介绍',rules],['平台介绍',platform]],buttons=[];let selected=0;
   const select=index=>{
    buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    selected=index;ruleWindow.content.setAttribute('translate',globalThis.LegendI18n&&globalThis.LegendI18n.language!=='zh-CN'?'no':'yes');ruleWindow.content.innerHTML=globalThis.LegendI18n?.guide(index===0?'rules':'platform',choices[index][1])||choices[index][1];ruleWindow.content.scrollTop=0;ruleWindow.content.setAttribute('aria-labelledby',buttons[index].id);
   };
   choices.forEach(([name],index)=>{
    const button=document.createElement('button');button.type='button';button.id='introduction-tab-'+index;button.textContent=name;button.setAttribute('role','tab');button.setAttribute('aria-controls','introduction-panel');
    button.onclick=()=>select(index);
    button.addEventListener('keydown',e=>{
     const next=e.key==='Home'?0:e.key==='End'?1:e.key==='ArrowRight'?(index+1)%2:e.key==='ArrowLeft'?(index+1)%2:null;
     if(next!==null){e.preventDefault();select(next);buttons[next].focus();}
    });
    buttons.push(button);tabs.append(button);
   });
   ruleWindow.el.insertBefore(tabs,ruleWindow.content);select(0);addEventListener('legend-language',()=>select(selected));
  }
  ruleWindow.open();
 };
 document.querySelector('#open-atlas').onclick=async()=>{
  if(!atlasWindow){
   atlasWindow=createWindow('atlas','卡牌图鉴');
   const tools=document.createElement('div');tools.className='reference-tools';
   tools.innerHTML='<input type="search" aria-label="搜索卡牌" placeholder="搜索名称、纹章、效果" autocomplete="off"><select aria-label="阵营"><option value="">全部阵营</option><option value="royal">皇室</option><option value="monster">魔物</option></select><select aria-label="效果类型"><option value="">全部效果</option><option value="attack">攻击 △</option><option value="persistent">持续 ∞</option><option value="response">应对 ⚡</option><option value="ordinary">一般效果</option></select><select aria-label="拓展"><option value="">基础与 EX</option><option value="base">基础</option><option value="ex">EX</option></select><select aria-label="等级"><option value="">全部等级</option><option value="none">无等级</option>'+[0,1,2,3,4,5].map(n=>`<option value="${n}">Lv.${n}</option>`).join('')+'</select>';
   const count=document.createElement('div');count.className='reference-count';count.setAttribute('role','status');
   atlasWindow.el.insertBefore(tools,atlasWindow.content);atlasWindow.el.insertBefore(count,atlasWindow.content);
   atlasWindow.tools=tools;atlasWindow.count=count;
  }
  atlasWindow.open();atlasWindow.content.textContent='正在读取图鉴…';
  try{
   const cards=await getCatalog(),[search,faction,type,expansion,level]=atlasWindow.tools.children;
   const render=()=>{
    const results=filterCards(cards,{query:search.value,faction:faction.value,type:type.value,expansion:expansion.value,level:level.value});
    atlasWindow.count.textContent=`${results.length} / ${cards.length} 种卡牌`;
    atlasWindow.content.innerHTML=results.length?'<div class="reference-grid">'+results.map(c=>`<button class="reference-card ${escape(c.faction)}" data-card="${c.id}" title="${escape(c.effect)}"><img src="${escape(c.image)}" alt="${escape(c.name)}" loading="lazy"><span>${escape(c.title||c.name.split('（')[0])}</span></button>`).join('')+'</div>':'没有符合条件的卡牌';
    atlasWindow.content.querySelectorAll('[data-card]').forEach(button=>button.onclick=()=>{
     const c=cards.find(c=>c.id===Number(button.dataset.card));
     atlasWindow.content.innerHTML=`<button class="reference-back">← 返回图鉴</button><div class="reference-detail"><img src="${escape(c.image)}" alt="${escape(c.name)}"><div><h3>${escape(c.title||c.name)}</h3><p>${c.faction==='royal'?'皇室':'魔物'} · ${extraIds.has(c.id)?'EX':'基础'}</p><p>${escape(c.badge)}</p><p>${escape(c.effect)}</p></div></div>`;
     atlasWindow.content.querySelector('.reference-back').onclick=render;
    });
   };
   search.oninput=render;for(const select of [faction,type,expansion,level])select.onchange=render;render();
  }catch(error){atlasWindow.content.textContent=error.message+'，请重新打开重试。';}
 };
 // Native dialogs also use the top layer; reinsert pinned windows after they open.
 new MutationObserver(records=>{if(records.some(r=>r.target.tagName==='DIALOG'))for(const w of windows)w.promote();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
})();
