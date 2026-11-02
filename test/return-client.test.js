// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(){
  const elements=new Map(),storage=new Map(),requests=[];
  function element(id){if(!elements.has(id))elements.set(id,{value:'16',hidden:false,style:{setProperty(){}},dataset:{},replaceChildren(){},append(){},addEventListener(){},close(){this.open=false;}});return elements.get(id);}
  const document={querySelector:element,querySelectorAll:()=>[],documentElement:{style:{}}};
  const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},ResizeObserver:class{observe(){}},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},console,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({defaults:{},cards:[],groups:[],extras:[]})};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),context);
  return {context,requests,storage,elements,run:code=>vm.runInContext(code,context)};
}
test('return clears replay and rejoins through the authenticated account',async()=>{
  const h=harness();h.storage.set('xcs-seat-v2',JSON.stringify({roomCode:'ABCDEF',playerId:'public-id',token:'private-token'}));
  h.run("replay={frames:[]}; replayTimer=42; render=()=>{};");
  await h.run('restore()');
  const calls=h.requests.filter(r=>r.url==='/api/join');assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].options.body).code,'ABCDEF');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.headers['X-Player-Token'],undefined);
  assert.equal(h.run('replay'),null);assert.equal(h.elements.get('#replay-controls').hidden,true);
});
test('leaving during replay exits replay and actually submits away',async()=>{
  const h=harness();h.run("seat={roomCode:'ABCDEF',playerId:'p',token:'t'}; replay={frames:[]}; render=()=>{};");
  await h.run("leave('away')");
  const req=h.requests.find(r=>r.url.includes('/api/command'));assert(req);assert.equal(JSON.parse(req.options.body).type,'away');assert.equal(h.run('replay'),null);assert.equal(h.elements.get('#room').hidden,true);
});
test('surrender stays at the live table, closes the exit dialog and keeps polling/session identity',async()=>{
 const h=harness();h.run("seat={roomCode:'ABCDEF',playerId:'p'};state={matchId:'m'};render=()=>{};$('#room').hidden=false;$('#lobby').hidden=true;sessionEpoch=7;pollTimer=42;");
 await h.run("leave('surrender')");
 assert.equal(h.elements.get('#room').hidden,false);assert.equal(h.elements.get('#lobby').hidden,true);
 assert.equal(h.run('sessionEpoch'),7);assert.equal(h.run('pollTimer'),42);assert.equal(h.run('seat.playerId'),'p');
 const req=h.requests.find(r=>r.url.includes('/api/command'));assert.equal(JSON.parse(req.options.body).type,'surrender');
});
test('toast reopens above existing modal dialogs using the browser top layer',()=>{
 const h=harness();h.run("globalThis.popoverVisible=false;globalThis.popoverShown=0;globalThis.popoverHidden=0;const notice=$('#toast');notice.matches=()=>popoverVisible;notice.showPopover=()=>{popoverVisible=true;popoverShown++;};notice.hidePopover=()=>{popoverVisible=false;popoverHidden++;};toast('第一次');toast('第二次');");
 assert.equal(h.run('popoverShown'),2);assert.equal(h.run('popoverHidden'),1);assert.equal(h.elements.get('#toast').textContent,'第二次');
 assert.equal(h.elements.get('#toast').hidden,false);
});
test('returning through room code reuses the original identity rather than joins again',async()=>{
  const h=harness();h.storage.set('xcs-seat-v2',JSON.stringify({roomCode:'ABCDEF',playerId:'p',token:'t'}));h.run("$('#room-code').value='abcdef';render=()=>{};");
  await h.elements.get('#join-room').onclick();assert.equal(h.requests.filter(r=>r.url==='/api/join').length,1);assert(!h.requests.some(r=>r.url.includes('/api/command')));
});
test('stale polling response cannot overwrite a returned session',async()=>{
  const h=harness();h.run("seat={roomCode:'ABCDEF',token:'t'};state={version:10};render=()=>{};fetch=()=>new Promise(resolve=>globalThis.resolvePoll=resolve);");
  const pending=h.run('poll()');h.run('sessionEpoch++;state={version:11};resolvePoll({ok:true,json:async()=>({version:9})});');await pending;assert.equal(h.run('state.version'),11);
});
