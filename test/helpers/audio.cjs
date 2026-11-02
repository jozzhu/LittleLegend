// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {createMixer}=require('../../public/audio-mixer');
function audioHarness({ContextClass,fetchAudio,clock}={}){
 const media=[],contexts=[],requests=[],sources=[];
 class Audio{
  constructor(){this.src='';this.volume=1;this.paused=true;this.events={};this.playCount=0;this.currentTime=0;media.push(this);}
  play(){this.paused=false;this.playCount++;return Promise.resolve();}
  pause(){if(!this.paused){this.paused=true;this.events.pause?.();}}
  addEventListener(type,fn){this.events[type]=fn;}
  getAttribute(){return this.src;}removeAttribute(){this.src='';}load(){}
 }
 class Node{
  constructor(){this.connections=[];this.gain={value:1,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;}};}
  connect(node){this.connections.push(node);}disconnect(){this.disconnected=true;}
 }
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination=new Node();this.gains=[];this.mediaSources=[];contexts.push(this);}
  createGain(){const node=new Node();this.gains.push(node);return node;}
  createMediaElementSource(element){const node=new Node();node.element=element;this.mediaSources.push(node);return node;}
  createBufferSource(){const node=new Node();node.start=()=>{node.started=true;};node.stop=()=>{node.stopped=true;};sources.push(node);return node;}
  decodeAudioData(data){return Promise.resolve({data});}
  resume(){this.state='running';this.onstatechange?.();return Promise.resolve();}
  suspend(){this.state='suspended';this.onstatechange?.();return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
 }
 const mixer=createMixer({AudioClass:Audio,ContextClass:ContextClass===undefined?Context:ContextClass,clock,fetchAudio:fetchAudio||((url)=>{requests.push(url);return Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});})});
 return {mixer,media,contexts,requests,sources,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
module.exports={audioHarness};
