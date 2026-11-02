// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

let startupBusy=false,startupFailed=false;
const startupScreen=document.querySelector('#startup-screen'),startupMessage=document.querySelector('#startup-message'),startupRetry=document.querySelector('#startup-retry');
const startupScene=StartupScene.create(startupScreen,text=>{if(!startupFailed)startupMessage.textContent=text;});
document.querySelector('#startup-skip').onclick=()=>{startupScene.finish();startupMessage.textContent=startupFailed?startupMessage.textContent:'正在连接牌桌…';};
async function revealTable(login){
 const auth=document.querySelector('#auth-screen'),animations=[];
 const reduced=typeof window==='undefined'||!window.matchMedia||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Measure both layouts before removing the splash; the shared scene stays stationary.
 if(login&&!reduced&&auth.querySelector){
  for(const selector of ['.crests','.wordmark','.english','.rule','.tagline']){
   const source=startupScreen.querySelector(selector),target=auth.querySelector(selector);
   if(!source||!target?.animate)continue;
   const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
   if(!to.width||!to.height)continue;
   animations.push(target.animate([
    {transformOrigin:'0 0',transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`},
    {transformOrigin:'0 0',transform:'none'}
   ],{duration:900,easing:'cubic-bezier(.22,.7,.2,1)',fill:'both'}));
  }
  const form=auth.querySelector('.auth-pane');
  if(form?.animate)animations.push(form.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:650,delay:250,easing:'ease-out',fill:'both'}));
 }
 auth.inert=login&&animations.length>0;
 document.documentElement.removeAttribute('data-starting');
 startupScreen.hidden=true;startupScene.dispose();
 try{await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));}
 finally{for(const animation of animations)animation.cancel();auth.inert=false;}
}
async function initializeTable(){
 if(startupBusy)return;
 startupBusy=true;startupFailed=false;
 startupRetry.hidden=true;startupMessage.textContent='正在连接牌桌…';
 try{
  meta=await request('/api/catalog');
  let profile;
  try{profile=await request('/api/auth/me');}catch(e){if(e.status!==401)throw e;}
  await startupScene.finished;
  if(profile)await loadAccount(profile);
  else{account=null;document.querySelector('#auth-screen').hidden=false;document.querySelector('#account-hub').hidden=true;document.querySelector('#lobby').hidden=true;}
  await revealTable(!profile);
 }catch(e){
  startupFailed=true;startupMessage.textContent='连接未完成：'+e.message;
  startupRetry.hidden=false;
 }finally{startupBusy=false;}
}
startupScene.finished.then(()=>{document.querySelector('#startup-skip').hidden=true;if(startupBusy&&!startupFailed)startupMessage.textContent='正在连接牌桌…';});
startupRetry.onclick=initializeTable;
startupScene.start();
initializeTable();
