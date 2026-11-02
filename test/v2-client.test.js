// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
function harness(){
 const ids=new Map(),listeners={};
 function node(id=''){
  if(ids.has(id))return ids.get(id);
  const n={id,children:[],style:{},dataset:{},value:'16',hidden:false,open:false,events:{},textContent:'',innerHTML:'',
   append(...children){this.children.push(...children);},
   replaceChildren(...children){this.children=children;this.rebuilds=(this.rebuilds||0)+1;},
   querySelector:s=>node(id+s),querySelectorAll:()=>[],setAttribute(){},
   addEventListener(name,fn){this.events[name]=fn;},
   showModal(){this.open=true;},close(){this.open=false;this.events.close?.();}};
  ids.set(id,n);return n;
 }
 let count=0;
 const ctx=vm.createContext({document:{body:node('body'),documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],createElement:()=>node('new'+count++),addEventListener:(name,fn)=>{listeners[name]=fn;}},
  location:{host:'localhost:1234',protocol:'http:'},localStorage:{getItem:()=>null,setItem(){}},console,encodeURIComponent,
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({})})});
 vm.runInContext(source('app.js'),ctx);
 vm.runInContext('render=()=>{};seat={roomCode:"ROOM",playerId:"me"};meta={cards:[]};state={code:"ROOM",matchId:"one",version:1,paused:false,players:[{id:"me"}],pending:null};',ctx);
 return {ctx,node,run:code=>vm.runInContext(code,ctx)};
}
test('card choices show effects and require confirmation, allow back, and invalidate paused or stale prompts',async()=>{
 const h=harness(),calls=[];
 h.ctx.commandMock=async(type,body)=>{calls.push({type,body});return true;};
 h.run('cmd=commandMock;state.pending={id:"pick",playerId:"me",text:"铁匠：选择第一张放置手牌",options:[{key:"card",label:"勇者",card:{id:6,title:"勇者",image:"/cards/card-06.jpg",badge:"Lv.4",effect:"测试效果",faction:"royal"}}]};renderResponse(state);');
 h.node('#response-options').children[0].onclick();
 assert.equal(calls.length,0);assert(h.node('#choice-preview-detail').innerHTML.includes('测试效果'));
 h.node('#choice-preview-back').onclick();assert.equal(calls.length,0);
 h.node('#response-options').children[0].onclick();await h.node('#choice-preview-confirm').onclick();
 assert.equal(calls.length,1);assert.equal(calls[0].body.key,'card');
 h.node('#response-options').children[0].onclick();h.run('state.paused=true;renderResponse(state);');assert.equal(h.run('choiceContext'),null);
 h.run('state.paused=false;');h.node('#response-options').children[0].onclick();
 h.run('state.pending.id="new-prompt";');await h.node('#choice-preview-confirm').onclick();assert.equal(calls.length,1);
});
test('hidden choices preview only the faction back, and board activation is a separate command',async()=>{
 const h=harness(),calls=[];h.ctx.commandMock=async(type,body)=>{calls.push({type,body});return true;};
 h.run('cmd=commandMock;state.pending={id:"hidden",playerId:"me",text:"选择暗牌",options:[{key:"opaque",label:"第 1 张暗牌（紫色）",hiddenFaction:"monster"}]};renderResponse(state);');
 h.node('#response-options').children[0].onclick();assert(h.node('#choice-preview-detail').innerHTML.includes('cardback_monster.png'));assert(!h.node('#choice-preview-detail').innerHTML.includes('/cards/'));
 assert.equal(calls.length,0);
 h.run('state.pending=null;state.currentId="me";state.legalBoard=["sword"];state.legalHand=[];showCard({uid:"sword",id:10,title:"圣剑",image:"/cards/card-10.jpg",effect:"横置",faction:"royal",badge:"王族纹章"},"board","me");');
 assert.equal(calls.length,0);const button=h.node('#card-actions').children.find(b=>b.textContent==='发动');assert(button);await button.onclick();assert.equal(calls.at(-1).type,'activate');
});
test('stale and duplicate snapshots do not rerender, and unchanged regions retain their children',()=>{
 const h=harness();h.run('count=0;render=()=>count++;acceptState({code:"ROOM",matchId:"one",version:1,players:[{id:"me"}]});acceptState({code:"ROOM",matchId:"one",version:0,players:[{id:"me"}]});');
 assert.equal(h.run('count'),0);
 h.run('acceptState({code:"ROOM",matchId:"one",version:2,players:[{id:"me"}]});patchRegion("#chat-list",["same"],()=>[document.createElement("div")]);patchRegion("#chat-list",["same"],()=>{throw Error("unnecessary rebuild")});');
 assert.equal(h.run('count'),1);assert.equal(h.node('#chat-list').rebuilds,1);
});
test('live client consumes pushed states, falls back after disconnect, and cannot update another session',()=>{
 const h=harness(),sockets=[];
 h.ctx.WebSocket=class{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}close(){this.readyState=3;}};
 h.run('updates=[];acceptState=(s)=>updates.push(s);poll=()=>{};');vm.runInContext(source('live.js'),h.ctx);
 h.run('startLive();');const socket=sockets[0];socket.readyState=1;socket.onopen();
 assert.equal(h.node('#connection-label').textContent,'实时连接');
 socket.onmessage({data:JSON.stringify({type:'state',state:{version:2}})});assert.equal(h.run('updates.length'),1);
 socket.onclose();assert.equal(h.node('#connection-label').textContent,'同步中');
 h.run('sessionEpoch++;');socket.onmessage({data:JSON.stringify({type:'state',state:{version:3}})});assert.equal(h.run('updates.length'),1);
 h.run('stopLive();');assert.equal(socket.readyState,3);
});
test('timed-out commands resynchronize after releasing the action lock without retrying the command',async()=>{
 const h=harness();
 h.run('requests=0;syncs=0;toast=()=>{};request=async()=>{requests++;const e=Error("timeout");e.name="AbortError";throw e;};poll=()=>{if(!busy)syncs++;};');
 assert.equal(await h.run('cmd("draw",{source:"royal"})'),false);
 assert.equal(h.run('requests'),1);assert.equal(h.run('syncs'),1);assert.equal(h.run('busy'),false);
});
