// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(root){
 function createMixer({AudioClass=root.Audio,ContextClass=root.AudioContext||root.webkitAudioContext,fetchAudio=url=>root.fetch(url),clock=()=>Date.now()}={}){
  let context=null,element=null,mediaSource=null,musicGain=null,effectsGain=null,desired=null,playing=null,visible=true,enabled=false,destroyed=false,generation=0,recovering=false;
  let musicVolume=1,effectsVolume=.7;
  const buffers=new Map(),voices=new Set();
  function gain(node,value,fade=false){
   if(!node)return;
   const time=context.currentTime;
   node.gain.cancelScheduledValues(time);
   node.gain.setValueAtTime(node.gain.value,time);
   if(fade)node.gain.linearRampToValueAtTime(value,time+.35);else node.gain.setValueAtTime(value,time);
  }
  function initialize(){
   if(element||destroyed)return;
   element=new AudioClass();element.loop=true;element.preload='none';
   if(ContextClass){
    try{
     context=new ContextClass();musicGain=context.createGain();effectsGain=context.createGain();
     musicGain.connect(context.destination);effectsGain.connect(context.destination);
     mediaSource=context.createMediaElementSource(element);mediaSource.connect(musicGain);
     element.volume=1;gain(musicGain,musicVolume);gain(effectsGain,effectsVolume);
     context.onstatechange=()=>{if(context.state==='running')ensureMusic();};
    }catch{
     // If a context cannot initialize, retain one music player and omit competing media effects.
     if(mediaSource){mediaSource.disconnect();element=new AudioClass();element.loop=true;element.preload='none';}
     musicGain?.disconnect();effectsGain?.disconnect();context?.close().catch(()=>{});
     context=null;mediaSource=null;musicGain=null;effectsGain=null;
    }
   }
   element.addEventListener('pause',()=>{
    if(!enabled||!visible||!desired||!musicVolume||recovering||destroyed)return;
    recovering=true;
    Promise.resolve().then(()=>ensureMusic()).finally(()=>{recovering=false;});
   });
  }
  function ensureMusic(){
   if(!element||destroyed||!enabled||!visible||!desired||musicVolume===0)return Promise.resolve(false);
   if(context&&context.state!=='running')return Promise.resolve(false);
   if(playing)return playing;
   if(!element.paused)return Promise.resolve(true);
   const attempt=Promise.resolve().then(()=>element.play()).then(()=>true,()=>false);
   playing=attempt;attempt.finally(()=>{if(playing===attempt)playing=null;});
   return playing;
  }
  function clearEffects(){
   generation++;
   for(const source of voices){source.onended=null;try{source.stop();}catch{}source.disconnect();}
   voices.clear();
  }
  function setVolumes(music,effects){
   const wasMuted=musicVolume===0;musicVolume=music;effectsVolume=effects;
   gain(musicGain,music);gain(effectsGain,effects);
   if(!effects)clearEffects();
   if(element){
    if(!context)element.volume=music;
    if(!music){element.pause();}else if(wasMuted)ensureMusic();
   }
  }
  function setMusic(url){
   if(destroyed)return;
   if(desired===url){ensureMusic();return;}
   desired=url;
   if(!element)return;
   element.pause();element.src=url;playing=null;
   if(musicGain){gain(musicGain,0);gain(musicGain,musicVolume,true);}
   ensureMusic();
  }
  async function unlock(){
   if(destroyed)return false;
   enabled=true;initialize();
   if(desired&&element.getAttribute('src')!==desired)element.src=desired;
   if(context&&context.state!=='running'){try{await context.resume();}catch{return false;}}
   if(!context)element.volume=musicVolume;
   await ensureMusic();return !context||context.state==='running';
  }
  async function load(url){
   if(!buffers.has(url)){
    const pending=fetchAudio(url).then(res=>{if(!res.ok)throw Error('Audio unavailable');return res.arrayBuffer();})
     .then(data=>context.decodeAudioData(data));
    buffers.set(url,pending);pending.catch(()=>{if(buffers.get(url)===pending)buffers.delete(url);});
   }
   return buffers.get(url);
  }
  async function play(url){
   if(!context||context.state!=='running'||!enabled||!visible||destroyed||!effectsVolume||voices.size>=5)return false;
   const ticket=generation,time=clock();
   try{
    const buffer=await load(url);
    if(ticket!==generation||!visible||destroyed||!effectsVolume||context.state!=='running'||voices.size>=5||clock()-time>1500)return false;
    const source=context.createBufferSource();source.buffer=buffer;source.connect(effectsGain);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();};source.start();return true;
   }catch{return false;}
  }
  function visibility(show){
   visible=show;
   if(!show){clearEffects();element?.pause();if(context?.state==='running')context.suspend().catch(()=>{});}
   else if(enabled)unlock();
  }
  function destroy(){
   destroyed=true;clearEffects();element?.pause();element?.removeAttribute('src');element?.load();
   mediaSource?.disconnect();musicGain?.disconnect();effectsGain?.disconnect();
   if(context){context.onstatechange=null;context.close().catch(()=>{});}buffers.clear();
  }
  return {unlock,setMusic,setVolumes,play,clearEffects,visibility,destroy};
 }
 if(typeof module==='object'&&module.exports)module.exports={createMixer};
 else root.LegendAudioMixer={createMixer};
})(typeof window==='object'?window:globalThis);
