// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const elements=new Map(),requests=[],profiles=[];let finish,phase;
 const finished=new Promise(resolve=>finish=resolve),el=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:''});return elements.get(id);};
 let catalogResolve,profileResolve;
 const catalog=new Promise(resolve=>catalogResolve=resolve),profile=new Promise(resolve=>profileResolve=resolve);
 let failure;
 const scene={finished,start(){this.started=true;},finish(){finish();},dispose(){this.disposed=true;}};
 const ctx=vm.createContext({document:{querySelector:el,documentElement:{removeAttribute(){ctx.revealed=true;}}},
  meta:null,account:null,StartupScene:{create(root,callback){phase=callback;return scene;}},
  request:async url=>{requests.push(url);if(failure)throw failure;return url==='/api/catalog'?catalog:profile;},
  loadAccount:async data=>profiles.push(data)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/startup.js'),'utf8'),ctx);
 return {ctx,scene,el,requests,profiles,phase:text=>phase(text),catalog:data=>catalogResolve(data),profile:data=>profileResolve(data),
  fail:error=>{failure=error;},clearFailure:()=>{failure=null;},run:code=>vm.runInContext(code,ctx),tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('opening hides the old UI until both data and the approved animation are ready',async()=>{
 const h=fixture();h.catalog({cards:[]});h.profile({user:{id:'a'}});await h.tick();
 assert.equal(h.ctx.revealed,undefined);assert.equal(h.profiles.length,0);
 h.scene.finish();await h.tick();assert(h.ctx.revealed);assert.equal(h.profiles.length,1);assert(h.el('#startup-screen').hidden);assert(h.scene.disposed);
});
test('skipping the opening still waits for real server data',async()=>{
 const h=fixture();h.el('#startup-skip').onclick();await h.tick();assert.equal(h.ctx.revealed,undefined);
 h.catalog({cards:[]});h.profile({user:{id:'a'}});await h.tick();assert(h.ctx.revealed);
 assert.deepEqual(h.requests,['/api/catalog','/api/auth/me']);
});
test('opening connection failures retain the screen and a usable retry without repeating the animation',async()=>{
 const h=fixture();h.catalog({cards:[]});h.fail(Error('离线'));await h.tick();
 assert(!h.el('#startup-screen').hidden);assert(!h.el('#startup-retry').hidden);assert(h.el('#startup-message').textContent.includes('离线'));
 h.phase('王国苏醒');assert(h.el('#startup-message').textContent.includes('离线'));
 h.scene.finish();h.clearFailure();h.profile({user:{id:'a'}});await h.el('#startup-retry').onclick();assert(h.ctx.revealed);assert.equal(h.profiles.length,1);
});
test('an expired session opens login after animation completion rather than exposing the legacy lobby',async()=>{
 const h=fixture();h.catalog({cards:[]});const error=Error('请先登录');error.status=401;h.fail(error);await h.tick();
 h.scene.finish();await h.tick();assert(h.ctx.revealed);assert.equal(h.el('#auth-screen').hidden,false);assert.equal(h.el('#lobby').hidden,true);assert.equal(h.profiles.length,0);
});
test('startup resources precede the initialization script and the legacy UI is masked before scripts run',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert(html.includes('html[data-starting] body>:not(#startup-screen){visibility:hidden}'));
 assert(html.indexOf('/startup-scene.js')<html.indexOf('/startup.js'));
 assert(html.includes('/startup-scene.css'));assert(html.includes('data-starting'));
});
test('login carries the final scene into its layout and unlocks the form after the handoff',async()=>{
 const h=fixture(),tracks=[],sourceRect={left:500,top:200,width:300,height:120},targetRect={left:150,top:210,width:240,height:96};
 h.ctx.window={matchMedia:()=>({matches:false})};
 h.el('#startup-screen').querySelector=()=>({getBoundingClientRect:()=>sourceRect});
 h.el('#auth-screen').querySelector=()=>({
  getBoundingClientRect:()=>targetRect,
  animate(frames,options){
   let done;const finished=new Promise(resolve=>done=resolve);
   const track={frames,options,finished,done,cancel(){this.canceled=true;}};tracks.push(track);return track;
  }
 });
 h.catalog({cards:[]});const error=Error('请先登录');error.status=401;h.fail(error);await h.tick();h.scene.finish();await h.tick();
 assert(h.ctx.revealed);assert(h.el('#startup-screen').hidden);assert(h.scene.disposed);
 assert.equal(tracks.length,6);assert(h.el('#auth-screen').inert);
 assert.equal(tracks[0].frames[0].transform,'translate(350px,-10px) scale(1.25,1.25)');
 assert.equal(tracks[5].options.delay,250);
 tracks.forEach(t=>t.done());await h.tick();
 assert.equal(h.el('#auth-screen').inert,false);assert(tracks.every(t=>t.canceled));
});
test('reduced motion reveals login immediately without a moving handoff',async()=>{
 const h=fixture();h.ctx.window={matchMedia:()=>({matches:true})};
 h.el('#auth-screen').querySelector=()=>{throw Error('motion must be skipped');};
 h.catalog({cards:[]});const error=Error('请先登录');error.status=401;h.fail(error);await h.tick();h.scene.finish();await h.tick();
 assert(h.ctx.revealed);assert.equal(h.el('#auth-screen').inert,false);assert(h.el('#startup-screen').hidden);
});
test('the opening clock completes, skips safely, respects reduced motion and releases its animation objects',async()=>{
 for(const reduced of [false,true]){
  const tracks=[];let nextFrame,phases=[];
  const element={style:{},animate(frames,options){const a={frames,options,currentTime:0,pause(){},cancel(){this.canceled=true;}};tracks.push(a);return a;}};
  const root={querySelectorAll:selector=>selector==='img'?[]:selector==='.wordmark span'?[element,element,element]:[element]};
  const ctx=vm.createContext({window:{matchMedia:()=>({matches:reduced})},Image:class{decode(){return Promise.resolve();}},setTimeout,clearTimeout,
   performance:{now:()=>0},requestAnimationFrame:fn=>{nextFrame=fn;return 1;},cancelAnimationFrame(){},root,phase:text=>phases.push(text)});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/startup-scene.js'),'utf8'),ctx);
  const scene=vm.runInContext('StartupScene.create(root,phase)',ctx);await scene.start();
  if(!reduced){
   for(let time=0;time<=6400;time+=16)nextFrame(time);
   assert.deepEqual(phases,['王国苏醒','暗影回应','传说将启','请入席']);
  }
  await scene.finished;assert(tracks.every(a=>a.currentTime===6400));scene.finish();scene.dispose();assert(tracks.every(a=>a.canceled));
 }
});
