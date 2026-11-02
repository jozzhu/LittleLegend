// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(root){
 'use strict';
 const supported=['zh-CN','en','ja'];
 function normalize(value){return supported.includes(value)?value:'zh-CN';}
 function createTranslator(data,catalog=[]){
  const translations=new Map(data.entries.map(([zh,en,ja])=>[zh,{en,ja}]));
  function registerCards(cards){
   for(const c of cards){
    const effects=data.effects[c.id-1];
    if(effects)translations.set(c.effect,{en:effects[0],ja:effects[1]});
   }
  }
  registerCards(catalog);
  let pattern;
  function compile(){pattern=new RegExp([...translations.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');}
  compile();
  function t(input,language,names=[]){
   const source=String(input??''),lang=normalize(language);
   if(lang==='zh-CN'||!source)return source;
   const protectedParts=[];
   const tokens=[...new Set(names.filter(Boolean))].sort((a,b)=>b.length-a.length);
   let text=source;
   if(tokens.length){
    const namesPattern=new RegExp(tokens.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
    text=text.replace(namesPattern,(value,offset,full)=>{if(full[offset-1]==='「'&&full[offset+value.length]==='」')return value;protectedParts.push(value);return '\uE000'+(protectedParts.length-1)+'\uE001';});
   }
   const exact=translations.get(text);
   if(exact)text=exact[lang];
   else {
    text=text.replace(pattern,key=>lang==='en'?' '+translations.get(key)[lang]+' ':translations.get(key)[lang]);
    if(lang==='en')text=text.replace(/[ \t]+/g,' ').replace(/ +([.,;:!?])/g,'$1');
   }
   return text.replace(/\uE000(\d+)\uE001/g,(_,i)=>protectedParts[Number(i)]);
  }
  return {t,registerCards(cards){registerCards(cards);compile();}};
 }
 if(typeof module==='object'&&module.exports){module.exports={createTranslator,normalize,supported};return;}
 const translator=createTranslator(root.LegendLanguages);
 let spectatedPlayers=[];
 let language='zh-CN';
 try{language=normalize(root.localStorage.getItem('xcs-language'));}catch{}
 const requested=new URL(root.location.href).searchParams.get('lang');
 if(supported.includes(requested)){language=requested;try{root.localStorage.setItem('xcs-language',language);}catch{}}
 const sources=new WeakMap(),attributes=new WeakMap();
 const skip='script,style,textarea,input,code,pre,[translate="no"],.avatar,.player-reference,.player-name>strong,.player-block header strong,.waiting-player strong,.profile-banner h2,#account-name,#chat-list,#gm-chat,#language-select';
 const mixed='#room-status,#turn-label,#response-title,#choice-preview-context,#private-notice,#return-room,#account-replays,#replay-list,#gm-turn,#gm-pending,#undo-description,#undo-progress,.player-block small,.dice-results,#seat-picker span';
 function names(){
  const list=[];
  if(typeof current==='function')for(const p of current()?.players||[])list.push(p.name);
  if(typeof account==='object'&&account)list.push(account.nickname);
  if(typeof accountReplays==='object')for(const r of accountReplays)list.push(...r.winners||[]);
  if(typeof state==='object'&&state)for(const r of state.replays||[])list.push(...r.winners||[]);
  for(const p of spectatedPlayers)list.push(p.name);
  return list;
 }
 function translateText(node){
  const parent=node.parentElement;if(!parent||parent.closest(skip))return;
  const saved=sources.get(node),raw=saved&&saved.output===node.nodeValue?saved.raw:node.nodeValue;
  const output=translator.t(raw,language,parent.closest(mixed)?names():[]);
  sources.set(node,{raw,output});if(output!==node.nodeValue)node.nodeValue=output;
 }
 function translateAttributes(el){
  if(el.closest(skip))return;
  const saved=attributes.get(el)||{};
  for(const key of ['title','aria-label','placeholder','alt']){
   const value=el.getAttribute(key);if(value===null)continue;
   const raw=saved[key]?.output===value?saved[key].raw:value,output=translator.t(raw,language);
   saved[key]={raw,output};if(output!==value)el.setAttribute(key,output);
  }
  attributes.set(el,saved);
 }
 function translateTree(node){
  if(node.nodeType===3){translateText(node);return;}
  if(node.nodeType!==1||node.closest(skip))return;
  translateAttributes(node);
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let child;while((child=walker.nextNode())){if(child.nodeType===3)translateText(child);else translateAttributes(child);}
 }
 function setLanguage(next){
  language=normalize(next);
  try{root.localStorage.setItem('xcs-language',language);}catch{}
  try{const url=new URL(root.location.href);url.searchParams.set('lang',language);root.history.replaceState(null,'',url.href);}catch{}
  document.documentElement.lang=language;document.title=translator.t(pageTitle,language);translateTree(document.body);
  const control=document.querySelector('#language-select');if(control)control.value=language;
  root.dispatchEvent(new CustomEvent('legend-language',{detail:{language}}));
 }
 const select=document.createElement('select');select.id='language-select';select.className='language-select';select.setAttribute('aria-label','Language / 言語 / 语言');select.setAttribute('translate','no');
 for(const [value,label]of [['zh-CN','中文'],['en','English'],['ja','日本語']]){
  const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
 }
 select.value=language;select.onchange=()=>setLanguage(select.value);
 const target=document.querySelector('.bar-actions,.header-actions,#admin-login');
 if(target)target.prepend(select);
 function position(){
  const auth=document.querySelector('#auth-screen'),bar=document.querySelector('.bar-actions');
  if(!bar)return;
  const destination=auth&&!auth.hidden?auth.querySelector('.topbar'):bar;
  if(destination&&select.parentElement!==destination)destination.append(select);
 }
 const dirty=new Set();
 let translationTimer=null;
 const observation={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt','hidden']};
 function collect(records){
  for(const r of records){
   if(r.type==='characterData')dirty.add(r.target);
   else if(r.type==='attributes')dirty.add(r.target);
   else for(const child of r.addedNodes)dirty.add(child);
  }
 }
 function flushTranslations(){
  translationTimer=null;
  collect(observer.takeRecords());
  observer.disconnect();
  try{
   const pending=[...dirty];dirty.clear();
   for(const node of pending)if(node.isConnected)translateTree(node);
   position();
  }finally{observer.observe(document.body,observation);}
 }
 const observer=new MutationObserver(records=>{
  collect(records);
  // Translation writes must not feed back into the observer or starve animation frames.
  if(translationTimer===null)translationTimer=root.setTimeout(flushTranslations,16);
 });
 observer.observe(document.body,observation);
 root.LegendI18n={
  t:(text,protectedNames=[])=>translator.t(text,language,protectedNames),
  get language(){return language;},
  setLanguage,
  setPlayers(players){spectatedPlayers=players||[];},
  originalText(el){let text='';const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){const saved=sources.get(node);text+=saved&&saved.output===node.nodeValue?saved.raw:node.nodeValue;}return text;},
  guide(kind,fallback){return root.LegendGuides?.[language]?.[kind]||fallback;},
  searchText(c){return [translator.t(c.title||c.name,language),translator.t(c.effect,language),translator.t(c.badge,language)].join(' ');}
 };
 for(const name of ['confirm','prompt','alert']){
  const original=root[name];if(typeof original==='function')root[name]=(text,...rest)=>original.call(root,translator.t(text,language),...rest);
 }
 root.fetch('/cards.json',{cache:'default'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(cards=>{translator.registerCards(cards);translateTree(document.body);}).catch(()=>{});
 const pageTitle=document.title;
 document.documentElement.lang=language;document.title=translator.t(pageTitle,language);translateTree(document.body);position();
})(typeof window==='object'?window:globalThis);
