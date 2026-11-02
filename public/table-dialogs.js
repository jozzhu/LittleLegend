// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(){
 const table=document.querySelector('#table-panel'),room=document.querySelector('#room');
 const response=document.querySelector('#response-overlay');
 if(!table||!room||typeof openDialog!=='function')return;
 const shield=document.createElement('div');shield.id='table-dialog-shield';shield.hidden=true;
 document.body.append(shield);
 const original=openDialog;
 let scheduled=false,dialogOrder=190,confirmationOpen=false;
 function rect(){
  const box=table.getBoundingClientRect();
  const left=Math.max(0,box.left),top=Math.max(0,box.top);
  return {left,top,width:Math.max(0,Math.min(innerWidth,box.right)-left),height:Math.max(0,Math.min(innerHeight,box.bottom)-top)};
 }
 function layout(){
  scheduled=false;
  const dialogs=[...document.querySelectorAll('dialog.table-dialog[open]')];
  const active=!room.hidden&&!table.hidden;
  const box=rect();
  const hidden=!active||!dialogs.length;
  if(shield.hidden!==hidden)shield.hidden=hidden;
  Object.assign(shield.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});
  response.classList.toggle('table-response',active);
  if(active)Object.assign(response.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});
  else for(const key of ['left','top','width','height'])response.style[key]='';
  for(const dialog of dialogs){
   dialog.style.left=(box.left+box.width/2)+'px';
   dialog.style.top=(box.top+box.height/2)+'px';
   dialog.style.width=Math.max(0,box.width-16)+'px';
   dialog.style.maxHeight=Math.max(0,box.height-16)+'px';
  }
  table.inert=active&&(dialogs.length>0||!response.hidden);
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(layout);}}
 openDialog=function(id){
  const dialog=typeof id==='string'?document.querySelector(id):id;
  if(room.hidden||table.hidden){
   dialog.classList.remove('table-dialog');
   for(const key of ['left','top','width','maxHeight','zIndex'])dialog.style[key]='';
   return original(id);
  }
  if(!dialog.open){
   dialog.classList.add('table-dialog');
   dialog.show();
  }
  dialog.style.zIndex=String(++dialogOrder);
  layout();
 };
 globalThis.confirmTable=function(text){
  if(room.hidden||table.hidden)return Promise.resolve(confirm(text));
  if(confirmationOpen)return Promise.resolve(false);
  confirmationOpen=true;
  const epoch=typeof sessionEpoch==='number'?sessionEpoch:null;
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.id='table-confirmation';
   const title=document.createElement('h2');title.textContent='确认';
   const message=document.createElement('p');message.textContent=text;
   const actions=document.createElement('div');actions.className='row';
   const cancel=document.createElement('button');cancel.textContent='取消';cancel.id='table-confirm-cancel';
   const accept=document.createElement('button');accept.textContent='确认';accept.id='table-confirm-accept';accept.className='primary';
   actions.append(cancel,accept);dialog.append(title,message,actions);document.body.append(dialog);
   let done=false;
   const finish=value=>{
    if(done)return;done=true;confirmationOpen=false;
    if(dialog.open)dialog.close();dialog.remove();
    resolve(!!value&&!room.hidden&&!table.hidden&&(epoch===null||epoch===sessionEpoch));
    layout();
   };
   cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);
   dialog.addEventListener('close',()=>finish(false),{once:true});
   openDialog(dialog);
  });
 };
 new MutationObserver(schedule).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
 addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
 if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(table);
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented)return;
  const dialogs=[...document.querySelectorAll('dialog.table-dialog[open]')].sort((a,b)=>Number(a.style.zIndex)-Number(b.style.zIndex)),dialog=dialogs.at(-1);
  if(!dialog)return;
  event.preventDefault();
  if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
 });
 layout();
})();
