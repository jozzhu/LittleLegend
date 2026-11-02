// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {filterCards,constrain}=require('../public/game-reference');
const {catalog}=require('../game');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
test('atlas filters the complete catalog by combined search, faction, effect and expansion',()=>{
 assert.equal(filterCards(catalog).length,37);
 assert.deepEqual(filterCards(catalog,{query:'  国王  '}).map(c=>c.id),[1]);
 assert.equal(filterCards(catalog,{expansion:'ex'}).length,8);
 assert.equal(filterCards(catalog,{expansion:'base'}).length,29);
 const attacks=filterCards(catalog,{type:'attack',faction:'monster',expansion:'base'});
 assert(attacks.length>0);
 assert(attacks.every(c=>c.attack&&c.faction==='monster'&&!c.expansion));
 assert.equal(filterCards(catalog,{query:'不存在的牌'}).length,0);
 assert(filterCards(catalog,{query:'准备阶段'}).length>0);
 for(const type of ['persistent','response','ordinary'])assert(filterCards(catalog,{type}).length>0);
});
test('floating references remain reachable after dragging, resizing and viewport rotation',()=>{
 assert.deepEqual(constrain({x:-900,y:900,width:760,height:560},{width:640,height:360}),{x:8,y:8,width:624,height:344});
 assert.deepEqual(constrain({x:500,y:500,width:10,height:10},{width:1000,height:800}),{x:500,y:500,width:260,height:220});
 const rect=constrain({x:3000,y:900,width:950,height:700},{width:1280,height:720});
 assert(rect.x+rect.width<=1272);assert(rect.y+rect.height<=712);
});
function referenceHarness(){
 const nodes=new Map(),observers=[],dialogs=[];
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.style={};this.children=[];this.listeners={};this.attrs={};this.hidden=false;this.parts=new Map();this.value='';}
  set innerHTML(value){
   this.html=value;
   if(value.includes('reference-head'))for(const name of ['.reference-head','.reference-content','.reference-resize','.reference-pin','.reference-close'])this.parts.set(name,new Element(name.includes('head')?'header':name.includes('content')?'div':'button'));
   if(value.includes('type="search"'))this.children=[new Element('input'),...Array.from({length:[...value.matchAll(/<select /g)].length},()=>new Element('select'))];
   this.cards=[...value.matchAll(/data-card="(\d+)"/g)].map(m=>{const e=new Element('button');e.dataset={card:m[1]};return e;});
   if(value.includes('reference-back'))this.parts.set('.reference-back',new Element('button'));
  }
  get innerHTML(){return this.html||'';}
  querySelector(s){return this.parts.get(s);}
  querySelectorAll(s){return s==='[data-card]'?this.cards||[]:[];}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
  append(e){if(e.parentElement)e.parentElement.children=e.parentElement.children.filter(n=>n!==e);this.children.push(e);e.parentElement=this;}insertBefore(e,b){this.children.splice(this.children.indexOf(b),0,e);e.parentElement=this;}
  addEventListener(t,fn){(this.listeners[t]??=new Set()).add(fn);}
  removeEventListener(t,fn){this.listeners[t]?.delete(fn);}
  emit(t,e){for(const fn of this.listeners[t]||[])fn(e);}
  showPopover(){this.top=true;this.promotions=(this.promotions||0)+1;}
  hidePopover(){this.top=false;}
  focus(){this.focused=true;}
  setPointerCapture(){}
 }
 const body=new Element('body');
 nodes.set('#open-rules',new Element('button'));nodes.set('#open-atlas',new Element('button'));
 const context=vm.createContext({document:{body,createElement:tag=>new Element(tag),querySelector:s=>nodes.get(s),querySelectorAll:()=>dialogs.filter(d=>d.open)},innerWidth:1000,innerHeight:700,addEventListener(){},MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},fetch:async()=>({ok:true,json:async()=>({cards:catalog})})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/game-reference.js'),'utf8'),context);
 return {nodes,body,observers,dialogs,Element};
}
test('atlas browses cards, filters, pins over dialogs, drags, resizes and closes without game commands',async()=>{
 const h=referenceHarness();await h.nodes.get('#open-atlas').onclick();
 const panel=h.body.children[0],content=panel.querySelector('.reference-content'),tools=panel.children.find(e=>e.className==='reference-tools');
 assert(panel.top);assert.equal(content.querySelectorAll('[data-card]').length,37);
 tools.children[0].value='国王';tools.children[0].oninput();
 assert.equal(content.querySelectorAll('[data-card]').length,1);
 content.querySelectorAll('[data-card]')[0].onclick();assert(content.innerHTML.includes(catalog[0].effect));
 content.querySelector('.reference-back').onclick();assert.equal(content.querySelectorAll('[data-card]').length,1);
 const pin=panel.querySelector('.reference-pin');pin.onclick();assert(!panel.top);assert.equal(pin.attrs['aria-pressed'],'false');assert(!('popover' in panel.attrs));
 pin.onclick();assert(panel.top);const before=panel.promotions;h.observers[0]([{target:{tagName:'DIALOG',open:true}}]);assert(panel.promotions>before);
 const head=panel.querySelector('.reference-head');
 head.emit('pointerdown',{button:0,target:{closest:()=>null},preventDefault(){},clientX:200,clientY:100,pointerId:1});
 head.emit('pointermove',{clientX:220,clientY:130});head.emit('pointerup',{});
 assert.equal(panel.style.left,'140px');assert.equal(panel.style.top,'100px');
 const resize=panel.querySelector('.reference-resize');
 resize.emit('pointerdown',{button:0,target:{closest:()=>true},preventDefault(){},clientX:0,clientY:0,pointerId:2});
 resize.emit('pointermove',{clientX:-200,clientY:-100});resize.emit('pointerup',{});
 assert.equal(panel.style.width,'560px');assert.equal(panel.style.height,'460px');
 panel.querySelector('.reference-close').onclick();assert(panel.hidden);assert(!panel.top);
 await h.nodes.get('#open-atlas').onclick();assert(!panel.hidden);assert(panel.top);
});
test('rules open independently and can coexist with the pinned atlas',async()=>{
 const h=referenceHarness();h.nodes.get('#open-rules').onclick();await h.nodes.get('#open-atlas').onclick();
 assert.equal(h.body.children.length,2);assert(h.body.children.every(e=>e.top));
 const rules=h.body.children[0];assert(rules.querySelector('.reference-content').innerHTML.includes('5 枚金币'));
 rules.emit('keydown',{key:'Escape',preventDefault(){}});assert(rules.hidden);assert(!h.body.children[1].hidden);
});
test('introduction tabs switch content with mouse and keyboard while preserving the floating window',()=>{
 const h=referenceHarness(),button=h.nodes.get('#open-rules');assert.equal(button.textContent,'介绍');button.onclick();
 const panel=h.body.children[0],content=panel.querySelector('.reference-content'),tabs=panel.children.find(e=>e.className==='reference-tabs').children;
 assert.deepEqual(tabs.map(t=>t.textContent),['玩法介绍','平台介绍']);
 assert.equal(tabs[0].attrs['aria-selected'],'true');assert(content.innerHTML.includes('5 枚金币'));
 content.scrollTop=100;tabs[1].onclick();assert.equal(content.scrollTop,0);
 assert.equal(tabs[1].attrs['aria-selected'],'true');assert.equal(tabs[0].tabIndex,-1);
 assert(content.innerHTML.includes('北京时间'));assert(content.innerHTML.includes('复盘'));
 assert.equal(content.attrs['aria-labelledby'],tabs[1].id);
 tabs[1].emit('keydown',{key:'Home',preventDefault(){}});assert(tabs[0].focused);assert.equal(tabs[0].attrs['aria-selected'],'true');
 tabs[0].emit('keydown',{key:'ArrowRight',preventDefault(){}});assert(tabs[1].focused);assert.equal(tabs[1].attrs['aria-selected'],'true');
 panel.querySelector('.reference-close').onclick();button.onclick();assert(!panel.hidden);assert(panel.top);assert(content.innerHTML.includes('北京时间'));
});
test('pinned atlas joins the active modal to remain interactive and returns to the page on close',async()=>{
 const h=referenceHarness();await h.nodes.get('#open-atlas').onclick();
 const panel=h.body.children[0],dialog=new h.Element('dialog');dialog.open=true;h.dialogs.push(dialog);h.body.append(dialog);
 h.observers[0]([{target:dialog}]);assert.equal(panel.parentElement,dialog);assert(panel.top);
 dialog.open=false;h.observers[0]([{target:dialog}]);assert.equal(panel.parentElement,h.body);assert(panel.top);
});
