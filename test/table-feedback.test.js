// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const g=require('../game');
const source=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
function harness(){
 const nodes=[],ids=new Map(),listeners={};
 function matches(node,selector){if(selector.includes(','))return selector.split(',').some(s=>matches(node,s));return selector.startsWith('#')?node.id===selector.slice(1):selector.startsWith('.')?node.className.split(' ').includes(selector.slice(1)):node.tagName===selector.toUpperCase();}
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style={setProperty(){}};this.events={};this.className='';this.value='';this.textContent='';this.hidden=false;this.isConnected=true;this.scrollTop=0;this.scrollHeight=0;this.clientHeight=0;nodes.push(this);this.classList={add:name=>{this.className+=' '+name;},toggle:(name,on)=>{this.className=this.className.split(' ').filter(n=>n!==name).concat(on?[name]:[]).join(' ');}};}
  append(...children){for(const child of children){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);this.children.push(child);child.parentElement=this;}}
  prepend(...children){this.append(...children);this.children=[...children,...this.children.filter(c=>!children.includes(c))];}
  replaceChildren(...children){this.children.forEach(c=>{c.parentElement=null;});this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return name==='src'?this.src??null:this.attributes[name]??null;}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(selector){const all=[];for(const c of this.children){if(matches(c,selector))all.push(c);all.push(...c.querySelectorAll(selector));}return all;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  before(){}
  showModal(){this.open=true;}
  close(){this.open=false;return this.events.close?.();}
  animate(){this.motionCount=(this.motionCount||0)+1;}
  getBoundingClientRect(){return {left:50,top:100,bottom:120};}
 }
 function element(selector){const found=nodes.find(n=>n.id===selector.slice(1));if(found)return found;if(!ids.has(selector)){const e=new Element();e.id=selector.slice(1);ids.set(selector,e);}return ids.get(selector);}
 const body=new Element('body');
 const document={body,documentElement:new Element('html'),createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:selector=>{
  if(selector==='input,textarea,form')return nodes.filter(n=>['INPUT','TEXTAREA','FORM'].includes(n.tagName));
  if(selector==='[data-player-id]')return nodes.filter(n=>n.dataset.playerId);
  if(selector==='#hand-cards .game-card')return element('#hand-cards').children;
  if(selector==='#response-options .response-option')return element('#response-options').children;
  return [];
 },addEventListener:(name,fn)=>{listeners[name]=fn;}};
 let mutation;
 const ctx=vm.createContext({document,window:{innerWidth:1280,innerHeight:800,matchMedia:()=>({matches:false})},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},
  localStorage:{getItem(){return null;},setItem(){}},fetch:async()=>({ok:true,json:async()=>({cards:g.catalog,defaults:g.defaults()})}),setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},console});
 vm.runInContext(source('app.js'),ctx);
 vm.runInContext(`meta=${JSON.stringify({cards:g.catalog})};render=()=>{};playerBlock=(p)=>{const el=document.createElement('article');el.dataset.playerId=p.id;const coin=document.createElement('span');coin.className='coins';el.append(coin);return el;};renderResponse=(s)=>{document.querySelector('#response-options').replaceChildren(...(s.pending?.options||[]).map(()=>{const b=document.createElement('button');b.className='response-option';return b;}));};`,ctx);
 vm.runInContext(source('table-interactions.js'),ctx);
 return {ctx,element,nodes,document,listeners,Element,run:code=>vm.runInContext(code,ctx),mutate:records=>mutation(records)};
}
test('card rerenders retain their image node and update the current card data',()=>{
 const h=harness();h.ctx.card=g.card(23);
 const first=h.run('cardButton(card,"hand","me")'),image=first.querySelector('img');
 h.run('card={...card,tapped:true};');const next=h.run('cardButton(card,"hand","me")');
 assert.equal(next,first);assert.equal(next.querySelector('img'),image);assert.equal(next.cardData.tapped,true);
 assert(first.className.includes('tapped'));assert.equal(image.src,h.ctx.card.image);assert(!image.loading);
});
test('hand-limit discard control follows server permission and blocks during an undo vote',()=>{
 const h=harness();h.ctx.card=g.card(23);
 h.run('seat={playerId:"me"};state={currentId:"me",actions:1,players:[{id:"me",handCount:5}],legalHand:[],legalBoard:[],canDiscard:false};');
 h.run('showCard(card,"hand","me")');assert(!h.element('#card-actions').children.some(b=>b.textContent==='弃置至手牌上限'));
 h.element('#card-actions').replaceChildren();h.run('state.actions=0;state.canDiscard=true;showCard(card,"hand","me")');
 const discard=h.element('#card-actions').children.find(b=>b.textContent==='弃置至手牌上限');assert(discard);assert(!discard.disabled);
 h.element('#card-actions').replaceChildren();h.run('state.undoRequest={id:"vote"};showCard(card,"hand","me")');
 assert(h.element('#card-actions').children.find(b=>b.textContent==='弃置至手牌上限').disabled);
});
test('closing the private notice through the dialog close event acknowledges it once and suppresses reopening',async()=>{
 const h=harness();h.run('seat={roomCode:"ABC",playerId:"me"};state={version:5,privateNotice:{id:"peek-one"}};');
 let calls=0;h.ctx.mockRequest=async(url,body)=>{calls++;assert.equal(body.type,'ackNotice');assert.equal(body.noticeId,'peek-one');return {version:6,privateNotice:null};};
 h.run('request=mockRequest;render=()=>{};');const dialog=h.element('#card-dialog');dialog.dataset.notice='peek-one';dialog.open=true;
 await dialog.close();assert.equal(calls,1);assert.equal(h.run('dismissedNotice'),'peek-one');assert.equal(h.run('state.privateNotice'),null);
 await dialog.close();assert.equal(calls,1);
});
test('late notice acknowledgements do not overwrite a newer room session',async()=>{
 const h=harness();h.run('seat={roomCode:"ABC",playerId:"me"};state={version:5,privateNotice:{id:"one"}};render=()=>{};');
 let complete;h.ctx.mockRequest=()=>new Promise(resolve=>complete=resolve);h.run('request=mockRequest;');
 const dialog=h.element('#card-dialog');dialog.dataset.notice='one';const pending=dialog.close();
 h.run('sessionEpoch++;state={version:1,code:"NEW"};');complete({version:6,privateNotice:null});await pending;
 assert.equal(h.run('state.code'),'NEW');
});
test('closing a played card immediately opens a newly generated bat notice without waiting for another server update',async()=>{
 const h=harness();h.run('state={privateNotice:{id:"fresh",cards:[]}};globalThis.renders=0;render=()=>{renders++;};');
 await h.element('#card-dialog').close();assert.equal(h.run('renders'),1);
 h.run('dismissedNotice="fresh";');await h.element('#card-dialog').close();assert.equal(h.run('renders'),1);
});
test('combat log escapes player text and includes faction card references, effect descriptions and keyboard tooltip targets',()=>{
 const h=harness();h.ctx.events=[{id:'e',type:'play',cardId:6,round:1,time:0,text:'<img src=x> 打出「勇者」'}];
 h.element('#log-filter').value='all';h.run('renderLog({events})');
 const html=h.element('#history-list').children[0].innerHTML;
 assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<img'));
 assert(html.includes('card-reference royal'));assert(html.includes('data-card-id="6"'));assert(html.includes('tabindex="0"'));
 assert(html.includes('event-detail'));assert(html.includes(g.byId(6).effect.slice(0,4)));
});
test('public declarations notify observers and discard preview selects the last three across both factions',()=>{
 const h=harness(),cards=[g.card(18),g.card(23),g.card(19),g.card(27),g.card(17)];
 cards.forEach((c,i)=>c.discardOrder=i);
 const state={code:'ABC',phase:'playing',players:[{id:'me',hand:[],coins:0}],events:[],discard:{royal:cards.filter(c=>c.faction==='royal'),monster:cards.filter(c=>c.faction==='monster')}};
 h.ctx.fixture=state;h.run('seat={playerId:"me"};state=fixture;render();');
 assert.deepEqual(Array.from(h.element('#discard-preview').children,c=>c.cardData.uid),cards.slice(-3).map(c=>c.uid));
 h.run('state.events.push({id:"declare",type:"declaration",text:"玩家宣言 Lv.2"});render();');
 assert.equal(h.element('#toast').textContent,'玩家宣言 Lv.2');
});
test('player names are prominent and escaped without confusing quoted card names or nested markup',()=>{
 const h=harness();h.ctx.people=[{id:'a',name:'勇者',seat:1},{id:'b',name:'<乙>',seat:3}];
 const html=h.run('recordText("勇者 向 <乙> 打出「勇者」",people)');
 assert(html.includes('player-reference player-tone-1'));assert(html.includes('player-reference player-tone-3'));
 assert(html.includes('&lt;乙&gt;'));assert(!html.includes('<乙>'));
 assert.equal((html.match(/card-reference royal/g)||[]).length,1);
 assert.equal((html.match(/player-reference/g)||[]).length,2);
});
test('opponents show faction backs without names and hidden choices get only the corresponding back image',()=>{
 const h=harness();h.run('seat={playerId:"me"};');
 h.ctx.opponent={id:'other',name:'对手',handCount:2,handBacks:['monster','royal']};
 const el=h.run('playerBlock(opponent,{})'),backs=el.querySelectorAll('img');assert.equal(backs.length,2);assert(backs.every(img=>img.src.includes('/cardback_')));
 h.run('renderResponse({pending:{playerId:"me",options:[{hiddenFaction:"royal"}]}})');
 assert(h.element('#response-options').children[0].querySelector('img').src.endsWith('cardback_royal.png'));
});
test('input preferences disable history for chat and dynamic fields, preserving explicit account credentials',()=>{
 const h=harness(),chat=new h.Element('input'),account=new h.Element('input'),password=new h.Element('input');
 account.autocomplete='username';password.type='password';password.autocomplete='current-password';
 vm.runInContext(source('input-preferences.js'),h.ctx);
 assert.equal(chat.autocomplete,'off');assert.equal(chat.spellcheck,false);assert.equal(account.autocomplete,'username');assert.equal(password.autocomplete,'current-password');
 const later=new h.Element('input'),parent=new h.Element();parent.append(later);later.nodeType=1;later.matches=()=>true;
 h.mutate([{addedNodes:[later]}]);assert.equal(later.autocomplete,'off');
});
