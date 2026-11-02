// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const elements=new Map(),requests=[],timers=[];let created=0,response=async()=>({online:0,rooms:0,playing:0,roomList:[]});
 function el(id){
  if(!elements.has(id))elements.set(id,{id,hidden:false,textContent:'',value:'',children:[],dataset:{},scrollTop:0,open:false,
   setAttribute(){},append(...children){this.children.push(...children);this.lastElementChild=this.children.at(-1);},
   replaceChildren(...children){this.children=children;},querySelectorAll(){return [];},
   set innerHTML(value){this.html=value;this.lastElementChild=el(id+' last');},get innerHTML(){return this.html;},
   showModal(){this.open=true;},close(){this.open=false;}
  });return elements.get(id);
 }
 const context=vm.createContext({document:{querySelector:el,createElement:tag=>el(tag+(created++))},location:{hash:'#ticket=once',pathname:'/gz.html'},history:{replaceState(...args){context.replaced=args;}},
  URLSearchParams,setInterval:fn=>{timers.push(fn);return 1;},Avatars:{html:()=>'<span>人</span>'},
  fetch:async(url,options)=>{requests.push({url,options});const data=await response(url,options);return {ok:true,json:async()=>url==='/api/catalog'?{cards:[]}:data};}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/gz.js'),'utf8'),context);
 return {el,context,requests,timers,setResponse:fn=>response=fn,run:code=>vm.runInContext(code,context),tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('GM startup removes its one-time ticket from history and uses a separate spectator session',async()=>{
 const h=harness();await h.tick();
 assert.deepEqual([...h.context.replaced],[null,'','/gz.html']);
 const login=h.requests.find(r=>r.url==='/api/gm/login');assert(login);assert.equal(JSON.parse(login.options.body).ticket,'once');
 assert(h.requests.some(r=>r.url==='/api/gm/rooms'));
 assert.equal(h.el('#gm-connection').textContent,'已连接 · 只读');
 assert(h.requests.every(r=>!r.url.startsWith('/api/command')&&!r.url.startsWith('/api/join')));
});
test('GM renders all hands and records, retains card browsing and drops stale state when leaving',async()=>{
 const h=harness();await h.tick();h.run('watchId="watch";watchMatch="match";');
 const s={matchId:'match',code:'TEST',version:1,phase:'playing',round:1,currentId:'a',actions:2,pending:null,privateNotices:[],players:[
  {id:'a',name:'甲',inRoom:true,status:'active',seat:0,coins:1,board:[],hand:[{id:18,title:'铁匠',effect:'效果',image:'/cards/card-18.jpg',faction:'royal'}]},
  {id:'b',name:'乙',inRoom:true,status:'active',seat:1,coins:0,board:[],hand:[{id:23,title:'骷髅',effect:'效果',image:'/cards/card-23.jpg',faction:'monster'}]}
 ],hostId:'a',tavern:[],discard:{royal:[],monster:[]},replayDecks:{royal:[],monster:[],tavern:[]},events:[{id:'e',time:1,type:'gm',text:'观战者进入全知观战'}],chat:[]};
 h.setResponse(async()=>s);await h.run('refresh()');assert.equal(h.el('#gm-players').children.length,2);
 assert(h.el('#gm-events').children[0].innerHTML.includes('观战者进入全知观战'));
 const handRow=h.el('#gm-players').children[1].children.at(-1);assert.equal(handRow.children.length,1);
 handRow.children[0].onclick();assert(h.el('#gm-card-dialog').open);assert.equal(h.el('#gm-card-title').textContent,'骷髅');
 let resolve;h.run('lastVersion=-1');h.setResponse(url=>url.startsWith('/api/gm/state')?new Promise(done=>resolve=done):Promise.resolve({ok:true}));
 const refresh=h.run('refresh()');await h.tick();
 const leaving=h.el('#gm-back').onclick();await h.tick();resolve(s);
 await refresh;
 assert.equal(h.el('#gm-watch').hidden,true);assert.equal(h.run('watchId'),null);assert.equal(h.el('#gm-card-dialog').open,false);
 await leaving;
});
