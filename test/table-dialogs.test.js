// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('table dialogs block only table bounds, preserve chat and tools, follow layout, and release after close',async()=>{
 const nodes=new Map(),events={},frames=[];let observer,box={left:250,top:120,right:1050,bottom:720};
 function node(id){
  if(nodes.has(id))return nodes.get(id);
  const classes=new Set(),listeners={},n={id,hidden:false,open:false,inert:false,style:{},
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
   getBoundingClientRect:()=>box,append(){},show(){this.open=true;},showModal(){throw Error('room dialogs must not make the document modal');},
   close(){this.open=false;listeners.close?.();},remove(){nodes.delete(id);},
   addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent(){return !this.preventCancel;}};
  nodes.set(id,n);return n;
 }
 const table=node('#table-panel'),room=node('#room'),response=node('#response-overlay'),chat=node('#chat-input'),tools=node('.bar-actions');
 response.hidden=true;
 let created=0;
 const doc={querySelector:node,querySelectorAll:()=>[...nodes.values()].filter(n=>n.open&&n.classList.contains('table-dialog')),
  createElement:()=>node(created++===0?'shield':'generated-'+created),body:node('body'),addEventListener:(name,fn)=>events[name]=fn};
 const context={document:doc,innerWidth:1400,innerHeight:900,Event,addEventListener:(name,fn)=>events[name]=fn,
  requestAnimationFrame:fn=>{frames.push(fn);},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},
  ResizeObserver:class{observe(){}},openDialog:()=>{context.fallback=true;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/table-dialogs.js'),'utf8'),context);
 const shield=node('shield'),dialog=node('#card-dialog');
 context.openDialog('#card-dialog');
 assert(dialog.open);assert(table.inert);assert(!chat.inert);assert(!tools.inert);assert(!shield.hidden);
 assert.equal(shield.style.left,'250px');assert.equal(shield.style.width,'800px');assert.equal(dialog.style.left,'650px');
 box={left:150,top:80,right:750,bottom:550};events.resize();frames.splice(0).forEach(fn=>fn());
 assert.equal(shield.style.left,'150px');assert.equal(dialog.style.width,'584px');
 const settings=node('#settings-dialog');context.openDialog('#settings-dialog');
 assert(Number(settings.style.zIndex)>Number(dialog.style.zIndex));
 events.keydown({key:'Escape',preventDefault(){}});assert(!settings.open);assert(dialog.open);
 let prevented=false;dialog.preventCancel=true;events.keydown({key:'Escape',preventDefault(){prevented=true;}});assert(prevented);assert(dialog.open);
 dialog.preventCancel=false;events.keydown({key:'Escape',preventDefault(){}});observer([]);frames.splice(0).forEach(fn=>fn());
 assert(!dialog.open);assert(!table.inert);assert(shield.hidden);
 response.hidden=false;observer([]);frames.splice(0).forEach(fn=>fn());
 assert(table.inert);assert(response.classList.contains('table-response'));assert.equal(response.style.width,'600px');assert(!chat.inert);
 response.hidden=true;observer([]);frames.splice(0).forEach(fn=>fn());assert(!table.inert);
 const accepted=context.confirmTable('Confirm action');assert(table.inert);assert(!chat.inert);
 assert.equal(await context.confirmTable('Duplicate'),false);
 [...nodes.values()].find(n=>n.id==='table-confirm-accept').onclick();assert.equal(await accepted,true);assert(!table.inert);
 const dismissed=context.confirmTable('Dismiss');events.keydown({key:'Escape',preventDefault(){}});assert.equal(await dismissed,false);assert(!table.inert);
 room.hidden=true;context.openDialog('#card-dialog');assert(context.fallback);assert(!dialog.classList.contains('table-dialog'));assert.equal(dialog.style.width,'');
});
