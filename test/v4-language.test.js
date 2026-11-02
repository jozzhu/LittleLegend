// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const data=require('../public/languages'),catalog=require('../public/cards.json'),{createTranslator,normalize}=require('../public/i18n');
test('Chinese, English and Japanese provide all 37 names, complete card effects and crests',()=>{
 const t=createTranslator(data,catalog);
 assert.equal(data.names.length,37);assert.equal(data.effects.length,37);
 for(const [i,c]of catalog.entries()){
  assert.equal(t.t(c.effect,'zh-CN'),c.effect);
  assert.equal(t.t(c.effect,'en'),data.effects[i][0]);assert.equal(t.t(c.effect,'ja'),data.effects[i][1]);
  assert(!/[\u3400-\u9fff]/.test(t.t(c.name,'en')),c.name);
  assert(t.t(c.effect,'ja').length>10);assert(!t.t(c.effect,'en').includes('undefined'));
 }
 for(const invalid of [null,'fr','EN','<script>'])assert.equal(normalize(invalid),'zh-CN');
 assert.equal(normalize('ja'),'ja');assert.equal(normalize('en'),'en');
});
test('translated choices retain origins, mandatory responses and user names without translating quoted card names as users',()=>{
 const {t}=createTranslator(data,catalog);
 assert.equal(t('女巫','en'),'Witch');
 assert(t('白骨 · 你的手牌','en').includes('Your hand'));assert(t('白骨 · 你的场上','en').includes('Your board'));
 assert(t('卫兵 · 你的场上 · 已横置','ja').includes('使用済み'));
 assert.equal(t('不应对，继续结算','en'),'Do not respond; resolve effect');
 const text=t('公主 用「公主」指定了你，是否应对？','en',['公主']);assert(text.startsWith('公主 '));assert(text.includes('Princess'));assert(!text.includes('「公主」'));
 assert(t('King[.*] 的回合','en',['King[.*]']).includes('King[.*]'));
 assert(t(' 准备房间','en').startsWith(' '),'preserve spaces separating log names');
});
test('localized guides cover both tabs and atlas search accepts translated names and effect text',()=>{
 const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/guide-translations.js'),'utf8'),sandbox);
 for(const lang of ['en','ja'])for(const section of ['rules','platform']){
  const html=sandbox.LegendGuides[lang][section];assert(html.includes('<h3>'));assert(html.length>700);assert(!html.includes('<script'));
 }
 const {filterCards}=require('../public/game-reference'),t=createTranslator(data,catalog);
 const previous=globalThis.LegendI18n;
 try{
  globalThis.LegendI18n={searchText:c=>[t.t(c.title||c.name,'en'),t.t(c.effect,'en')].join(' ')};
  assert.deepEqual(filterCards(catalog,{query:'Witch'}).map(c=>c.id),[26]);
  globalThis.LegendI18n={searchText:c=>[t.t(c.title||c.name,'ja'),t.t(c.effect,'ja')].join(' ')};
  assert.deepEqual(filterCards(catalog,{query:'コウモリ'}).map(c=>c.id),[22]);
 }finally{if(previous===undefined)delete globalThis.LegendI18n;else globalThis.LegendI18n=previous;}
});
test('all web entries load offline translations and native builds share the dictionary',()=>{
 for(const file of ['index.html','admin.html','gz.html']){
  const html=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
  for(const resource of ['languages.js','guide-translations.js','i18n.js','i18n.css'])assert(html.includes('/'+resource),file+': '+resource);
 }
 for(const platform of ['windows','android'])assert(fs.readFileSync(path.join(__dirname,`../host/${platform}/build.ps1`),'utf8').includes('prepare-languages.js'));
 const entries=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/host-languages.json'),'utf8'));
 assert.deepEqual(entries,data.entries);
 for(const key of ['启动服务','停止','房主控制台','服务器管理密钥'])assert(entries.some(e=>e[0]===key&&e[1]&&e[2]));
});
test('live DOM language changes restore source text, preserve chat and names, translate new prompts and persist selection',async()=>{
 const nodes=[],listeners={},storage=new Map(),observers=[],timers=[];
 let observing=false,records=[],deliveries=0;
 const notify=record=>{if(observing)records.push(record);};
 function settle(){
  let turns=0;
  while(records.length||timers.length){
   assert(++turns<40,'translation mutations must settle without starving startup');
   if(records.length){deliveries++;observers[0](records.splice(0));}
   if(timers.length)timers.shift()();
  }
 }
 class Element{
  constructor(tag='div',id=''){this.nodeType=1;this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.attributes={};this.isConnected=true;nodes.push(this);}
  append(...items){for(const child of items){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);}}
  prepend(child){this.append(child);this.children.unshift(this.children.pop());}
  setAttribute(k,v){this.attributes[k]=v;if(['title','aria-label','placeholder','alt','hidden'].includes(k))notify({type:'attributes',target:this});}getAttribute(k){return this.attributes[k]??null;}
  closest(selectors){
   for(let node=this;node;node=node.parentElement)for(const s of selectors.split(',')){
    if(s.startsWith('#')&&node.id===s.slice(1))return node;
    if(s==='[translate="no"]'&&node.getAttribute('translate')==='no')return node;
    if(s==='.player-reference'&&node.className==='player-reference')return node;
    if(s===node.tagName.toLowerCase())return node;
   }
   return null;
  }
 }
 const body=new Element('body'),bar=new Element();bar.className='bar-actions';body.append(bar);
 const text=(parent,value)=>{const node={nodeType:3,isConnected:true,get nodeValue(){return value;},set nodeValue(next){value=next;notify({type:'characterData',target:this});}};parent.append(node);return node;};
 const play=new Element('button');play.setAttribute('title','打出');body.append(play);const label=text(play,'打出');
 const logName=new Element('strong');logName.className='player-reference';body.append(logName);const name=text(logName,'公主');
 const chat=new Element('div','chat-list');body.append(chat);const message=text(chat,'打出 公主');
 const input=new Element('input');input.value='打出';body.append(input);
 const doc={
  title:'小传说 · 联机桌',body,documentElement:{lang:'zh-CN'},createElement:tag=>new Element(tag),
  querySelector:s=>s.startsWith('.bar-actions')?bar:s==='#language-select'?nodes.find(n=>n.id==='language-select'):null,
  createTreeWalker(node,mask){const flat=[];function walk(p){for(const c of p.children||[]){if(c.nodeType===1&&mask&1||c.nodeType===3&&mask&4)flat.push(c);walk(c);}}walk(node);let i=0;return {nextNode:()=>flat[i++]||null};}
 };
 const context={document:doc,LegendLanguages:data,URL,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},location:{href:'http://localhost/?lang=en'},
  history:{replaceState(a,b,url){context.location.href=url;}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  dispatchEvent:e=>(listeners[e.type]||[]).forEach(fn=>fn(e)),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  MutationObserver:class{constructor(fn){observers.push(fn);}observe(){observing=true;}disconnect(){observing=false;records=[];}takeRecords(){return records.splice(0);}},
  setTimeout:fn=>{timers.push(fn);return timers.length;},
  fetch:async()=>({ok:true,json:async()=>catalog}),confirm:t=>t,prompt:t=>t,alert:t=>t
 };
 context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/i18n.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));settle();const api=context.LegendI18n;
 assert.equal(label.nodeValue,'Play');assert.equal(play.getAttribute('title'),'Play');assert.equal(doc.documentElement.lang,'en');
 assert.equal(api.originalText(play),'打出');
 assert.equal(name.nodeValue,'公主');assert.equal(message.nodeValue,'打出 公主');assert.equal(input.value,'打出');
 api.setLanguage('ja');settle();assert.equal(label.nodeValue,'プレイ');assert.equal(play.getAttribute('title'),'プレイ');assert.equal(storage.get('xcs-language'),'ja');
 assert(context.location.href.includes('lang=ja'));assert.equal(name.nodeValue,'公主');assert.equal(message.nodeValue,'打出 公主');
 api.setLanguage('zh-CN');settle();assert.equal(label.nodeValue,'打出');assert.equal(play.getAttribute('title'),'打出');
 api.setLanguage('en');settle();deliveries=0;label.nodeValue='准备';settle();assert.equal(label.nodeValue,'Ready');
 assert.equal(deliveries,1,'translated output must not enqueue another observer delivery');
 api.setLanguage('zh-CN');assert.equal(label.nodeValue,'准备');
 assert(context.confirm('认输不可撤销，本局返回后只能观战。确定认输吗？').includes('认输'));
 api.setLanguage('en');assert(context.confirm('认输不可撤销，本局返回后只能观战。确定认输吗？').includes('irreversible'));
 for(const language of ['ja','en','zh-CN']){
  api.setLanguage(language);settle();
  for(const phase of ['王国苏醒','暗影回应','传说将启','请入席']){
   deliveries=0;label.nodeValue=phase;play.setAttribute('title',phase);settle();
   assert.equal(deliveries,1);assert.equal(label.nodeValue,createTranslator(data).t(phase,language));
   assert.equal(play.getAttribute('title'),label.nodeValue);
  }
 }
});
