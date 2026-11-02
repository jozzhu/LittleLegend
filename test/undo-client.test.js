// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('undo interface submits the displayed request, shows voter progress and closes when resolved',async()=>{
 const elements=new Map(),calls=[];
 function element(id){if(!elements.has(id))elements.set(id,{id,hidden:false,open:false,children:[],append(e){this.children.push(e);},querySelector:element,addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
 let created=0;
 const state={phase:'playing',canUndo:true,players:[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'c',name:'丙'}]};
 const context=vm.createContext({document:{createElement:()=>element('new'+created++),querySelector:element,body:element('body')},openDialog:dialog=>dialog.showModal(),render(){},current:()=>state,seat:{playerId:'a'},replay:null,confirm:()=>true,cmd:(...args)=>calls.push(args)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/undo.js'),'utf8'),context);
 context.render();const button=element('new0'),dialog=element('new1');
 assert(!button.disabled);await button.onclick();assert.equal(calls.at(-1)[0],'undoRequest');
 state.canUndo=false;state.undoRequest={id:'vote-1',playerId:'b',voters:['a','c'],approved:[]};context.render();
 assert(dialog.open);assert.equal(element('#undo-progress').textContent,'等待：甲、丙');assert(!element('#undo-approve').hidden);assert(element('#undo-cancel').hidden);
 element('#undo-approve').onclick();assert.equal(calls.at(-1)[0],'undoVote');assert.equal(calls.at(-1)[1].requestId,'vote-1');assert(calls.at(-1)[1].approve);
 state.undoRequest.approved.push('a');context.render();assert(element('#undo-approve').hidden);assert.equal(element('#undo-progress').textContent,'等待：丙');
 state.undoRequest=null;context.render();assert(!dialog.open);
 context.replay={};context.render();assert(button.hidden);
 context.replay=null;context.seat.playerId='b';state.undoRequest={id:'vote-2',playerId:'b',voters:['a','c'],approved:[]};context.render();
 assert(!element('#undo-cancel').hidden);element('#undo-cancel').onclick();assert.equal(calls.at(-1)[0],'undoCancel');assert.equal(calls.at(-1)[1].requestId,'vote-2');
});
