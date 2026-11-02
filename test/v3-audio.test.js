// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {tracks,preferences,musicFor,soundsFor}=require('../public/audio');
const {publishWave}=require('../host/prepare-audio');
const {audioHarness}=require('./helpers/audio.cjs');
function state(){return {code:'AUDIO',matchId:'match',version:1,phase:'playing',paused:false,events:[],chat:[],players:[{id:'me',coins:0,ready:false},{id:'other',coins:0,ready:false}],winners:[]};}
function advance(before,events=[]){return {...structuredClone(before),version:before.version+1,events:[...before.events,...events.map((e,i)=>({id:'event-'+i,...e}))]};}
test('audio preferences validate independent stored channels and music follows actual scenes',()=>{
 assert.deepEqual(preferences(null),{sfx:70,bgm:100,sfxMuted:false,bgmMuted:false});
 assert.deepEqual(preferences({sfx:180,bgm:-5,sfxMuted:true,bgmMuted:'false'}),{sfx:100,bgm:0,sfxMuted:true,bgmMuted:false});
 assert.equal(preferences({sfx:NaN,bgm:'20'}).bgm,100);
 const s=state();assert.equal(musicFor(null),'lobby');s.phase='lobby';assert.equal(musicFor(s),'waiting');
 s.phase='seating';assert.equal(musicFor(s),'match');s.phase='playing';s.players[1].coins=4;assert.equal(musicFor(s),'tension');
 s.players[1].status='surrendered';assert.equal(musicFor(s),'match');
 assert.equal(musicFor(s,{replay:true}),'replay');assert.equal(musicFor(s,{spectator:true}),'replay');
 s.phase='finished';assert.equal(musicFor(s),'replay');assert.equal(musicFor(s,{visible:false}),'lobby');
});
test('public opponent actions sound for every client while private prompts are addressed only to their recipient',()=>{
 const before=state(),after=advance(before,[{type:'play',actor:'other',cardId:6},{type:'target',actor:'other',targets:['me']}]);
 after.pending={id:'response',playerId:'me'};
 assert.deepEqual(soundsFor(before,after,'me'),['card_play','attack','response_request']);
 assert.deepEqual(soundsFor(before,after,'other'),['card_play','attack']);
 const blind=advance(before,[{type:'draw',actor:'other',faction:'royal'}]);
 const second=structuredClone(blind);second.events[0].faction='monster';
 assert.deepEqual(soundsFor(before,blind,'me'),soundsFor(before,second,'me'));
 assert.deepEqual(soundsFor(before,after,'gm',{spectator:true}),['card_play','attack']);
});
test('replays, duplicates, initial snapshots, rejoining and undo do not replay historical effects',()=>{
 const before=state(),after=advance(before,[{type:'play',actor:'other'}]);
 assert.deepEqual(soundsFor(null,after,'me'),[]);
 assert.deepEqual(soundsFor(after,after,'me'),[]);
 assert.deepEqual(soundsFor(before,after,'me',{replay:true}),[]);
 assert.deepEqual(soundsFor(before,{...after,code:'OTHER'},'me'),[]);
 assert.deepEqual(soundsFor(before,{...after,matchId:'new'},'me'),[]);
 assert.deepEqual(soundsFor(before,advance(before,[{type:'play'},{type:'undo'}]),'me'),[]);
 assert.deepEqual(soundsFor(before,advance(before,[{type:'play',undone:true}]),'me'),[]);
});
test('response result, coin theft, winner, chat, readiness and pause feedback preserve their meanings',()=>{
 const before=state();
 assert.deepEqual(soundsFor(before,advance(before,[{type:'response',actor:'me'},{type:'responseResult',actor:'me',success:false}]),'me'),['effect_fizzle']);
 assert.deepEqual(soundsFor(before,advance(before,[{type:'stealCoin'},{type:'coin',delta:-1},{type:'coin',delta:1}]),'me'),['coin_steal']);
 const won=advance(before,[{type:'victory'}]);won.winners=['other'];
 assert.deepEqual(soundsFor(before,won,'me'),['defeat']);assert.deepEqual(soundsFor(before,won,'other'),['victory']);
 const chat=advance(before);chat.chat=[{player:'me',text:'hello',time:1}];assert.deepEqual(soundsFor(before,chat,'me'),[]);
 chat.chat.push({player:'other',text:'hi',time:2});assert.deepEqual(soundsFor(before,chat,'me'),['chat']);
 const ready=advance(before,[{type:'ready'}]);ready.players[1].ready=true;assert.deepEqual(soundsFor(before,ready,'me'),['player_ready']);
 assert.deepEqual(soundsFor(ready,advance(ready,[{type:'ready'}]),'me'),[]);
 const pause=advance(before,[{type:'pause'}]);assert.deepEqual(soundsFor(before,pause,'me'),[]);pause.paused=true;
 assert.deepEqual(soundsFor(before,pause,'me'),['pause']);
});
test('all provided audio ships with unchanged MP3 or original PCM and valid WAVE lengths',()=>{
 const source=path.join(__dirname,'../assets/audio'),published=path.join(__dirname,'../public/assets/audio');
 const files=fs.readdirSync(path.join(source,'sfx'));assert.equal(files.filter(f=>f.endsWith('.wav')).length,24);
 for(const [kind,names]of [['bgm',Object.values(tracks)],['sfx',files]]){
  for(const file of names){
   const original=fs.readFileSync(path.join(source,kind,file)),actual=fs.readFileSync(path.join(published,kind,file));
   if(file.endsWith('.wav')){
    assert(publishWave(original).equals(actual),file);assert.equal(actual.readUInt32LE(4),actual.length-8);
    const marker=original.indexOf(Buffer.from('data'));assert.equal(actual.readUInt32LE(marker+4),actual.length-marker-8);
    assert(original.subarray(marker+8).equals(actual.subarray(marker+8)),file+' PCM');
   }else assert(original.equals(actual),file);
  }
 }
 const types=['ready','dice','start','turn','draw','play','place','discard','prepare','return','retrieve','search','coin','stealCoin','target','responseResult','fizzle','declaration','pause','victory'];
 const before=state(),after=advance(before,types.map(type=>({type,actor:'me',cardId:3,delta:1,success:true})));after.paused=true;after.winners=['me'];after.players[0].ready=true;
 for(const name of soundsFor(before,after,'me'))assert(fs.existsSync(path.join(published,'sfx','sfx_'+name+'.wav')),name);
});
test('browser audio engine unlocks on interaction, baselines reconnects, and stops in background',async()=>{
 const handlers={},audio=audioHarness(),timers=new Map();let timerId=0,s=state();
 const document={visibilityState:'visible',querySelector(){return null;},addEventListener(type,fn){handlers[type]=fn;}};
 const context=vm.createContext({document,localStorage:{getItem(){return null;}},window:{LegendAudioMixer:{createMixer:()=>audio.mixer},addEventListener(){}},
  current:()=>s,seat:{playerId:'me'},replay:null,render(){},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},setInterval(){return ++timerId;},clearInterval(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/audio.js'),'utf8'),context);
 context.render();assert.equal(audio.media.length,0);
 handlers.pointerdown();await audio.flush();assert.equal(audio.media.length,1);assert(audio.media[0].src.includes('bgm_match.mp3'));
 s=advance(s,[{type:'draw',actor:'other'}]);context.render();await audio.flush();assert(audio.requests.at(-1).includes('sfx_card_draw.wav'));
 const count=audio.sources.length;context.render();await audio.flush();assert.equal(audio.sources.length,count);
 context.window.LegendAudio.baseline();s=advance(s,[{id:'later',type:'play'}]);context.render();await audio.flush();assert.equal(audio.sources.length,count);
 document.visibilityState='hidden';handlers.visibilitychange();assert(audio.media[0].paused);assert(audio.sources.every(p=>p.stopped));
 document.visibilityState='visible';handlers.visibilitychange();context.render();await audio.flush();assert(!audio.media[0].paused);
 context.replay={};context.render();await audio.flush();assert(audio.media[0].src.includes('bgm_replay.wav'));assert.equal(audio.media.length,1);
});
test('audio HTTP supports mobile seeking, proper MIME, suffix bytes and invalid ranges',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-audio-')),old=process.env.XCS_DATA_DIR;
 process.env.XCS_DATA_DIR=dir;delete require.cache[require.resolve('../server')];
 const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const file=fs.readFileSync(path.join(__dirname,'../public/assets/audio/bgm/bgm_replay.wav'));
  const r=await fetch(base+'/assets/audio/bgm/bgm_replay.wav',{headers:{Range:'bytes=12-31'}});
  assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'audio/wav');assert.equal(r.headers.get('content-range'),`bytes 12-31/${file.length}`);
  assert(Buffer.from(await r.arrayBuffer()).equals(file.subarray(12,32)));
  const suffix=await fetch(base+'/assets/audio/bgm/bgm_replay.wav',{headers:{Range:'bytes=-16'}});
  assert(Buffer.from(await suffix.arrayBuffer()).equals(file.subarray(-16)));
  for(const range of ['bytes=99999999-','bytes=4-1','bytes=-0','bytes=','bytes=1-2,4-5']){
   const bad=await fetch(base+'/assets/audio/bgm/bgm_replay.wav',{headers:{Range:range}});assert.equal(bad.status,416,range);await bad.arrayBuffer();
  }
  const mp3=await fetch(base+'/assets/audio/bgm/bgm_lobby(1).mp3',{headers:{Range:'bytes=0-7'}});
  assert.equal(mp3.status,206);assert.equal(mp3.headers.get('content-type'),'audio/mpeg');await mp3.arrayBuffer();
  const wav=await fetch(base+'/assets/audio/sfx/sfx_ui_click.wav');assert.equal(wav.status,200);assert.equal(wav.headers.get('accept-ranges'),'bytes');await wav.arrayBuffer();
 }finally{
  server.closeRealtime();await server.flush();await new Promise(resolve=>server.close(resolve));delete require.cache[require.resolve('../server')];
  if(old===undefined)delete process.env.XCS_DATA_DIR;else process.env.XCS_DATA_DIR=old;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('audio toolbar keeps channel volumes and mute independent, remembers changes and closes predictably',async()=>{
 const registry=new Map(),handlers={},audio=audioHarness();let stored=null;
 class Node{
  constructor(){this.children=[];this.attrs={};this.dataset={};this.hidden=false;this.type='';}
  set id(id){this.nodeId=id;registry.set('#'+id,this);}get id(){return this.nodeId;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  prepend(node){node.parent=this;this.children.unshift(node);}
  after(node){const p=this.parent;node.parent=p;p.children.splice(p.children.indexOf(this)+1,0,node);}
  setAttribute(key,value){this.attrs[key]=value;}
  querySelectorAll(selector){
   return this.children.flatMap(n=>[n,...n.querySelectorAll(selector)]).filter(n=>selector==='[aria-expanded=true]'?n.attrs['aria-expanded']==='true':n.className===selector.slice(1));
  }
  querySelector(selector){if(selector.startsWith('input'))return this.children.find(n=>n.type===(selector.includes('range')?'range':'checkbox'));return this.querySelectorAll(selector)[0]||null;}
  contains(node){return node===this||this.children.some(n=>n.contains(node));}
  focus(){this.focused=true;}
  set innerHTML(html){
   for(const match of html.matchAll(/<(input|output)[^>]*id="([^"]+)"[^>]*>/g)){
    const child=new Node();child.id=match[2];child.type=/type="([^"]+)"/.exec(match[0])?.[1]||'';this.append(child);
   }
  }
 }
 const actions=new Node(),font=new Node();font.className='font-control';actions.append(font);
 const document={visibilityState:'visible',createElement:()=>new Node(),querySelector:s=>s==='.bar-actions'?actions:registry.get(s)||null,addEventListener(type,fn){(handlers[type]??=[]).push(fn);}};
 const emit=(type,event)=>handlers[type].forEach(fn=>fn(event));
 const context=vm.createContext({document,window:{LegendAudioMixer:{createMixer:()=>audio.mixer},addEventListener(){}},localStorage:{getItem:()=>null,setItem(key,value){stored=JSON.parse(value);}},
  performance:{now:()=>1000},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/audio.js'),'utf8'),context);
 const el=id=>registry.get('#audio-'+id);
 assert.equal(actions.children[1].className,'audio-controls');assert.equal(el('sfx-volume').value,70);assert.equal(el('bgm-volume').value,100);
 emit('pointerdown',{target:actions});await audio.flush();assert(audio.media[0].src.includes('bgm_lobby.mp3'));
 el('sfx').onclick();assert.equal(el('sfx-panel').hidden,false);assert.equal(el('sfx').attrs['aria-expanded'],'true');
 el('bgm').onclick();assert.equal(el('sfx-panel').hidden,true);assert.equal(el('bgm-panel').hidden,false);
 el('sfx-volume').oninput({target:{value:'81'}});assert.equal(stored.sfx,81);assert.equal(stored.bgm,100);
 el('sfx-mute').onchange({target:{checked:false}});assert.equal(stored.sfxMuted,true);assert(!audio.media[0].paused);
 const count=audio.sources.length;context.window.LegendAudio.play('card_draw');await audio.flush();assert.equal(audio.sources.length,count);
 el('bgm-mute').onchange({target:{checked:false}});assert.equal(stored.bgmMuted,true);assert(audio.media[0].paused);
 el('bgm-volume').oninput({target:{value:'42'}});assert.equal(stored.bgm,42);assert.equal(stored.sfx,81);
 el('bgm-mute').onchange({target:{checked:true}});await audio.flush();assert(!audio.media[0].paused);assert.equal(stored.sfxMuted,true);assert.equal(audio.media.length,1);
 emit('keydown',{key:'Escape'});assert.equal(el('bgm-panel').hidden,true);assert(el('bgm').focused);
 el('sfx').onclick();emit('pointerdown',{target:actions});assert.equal(el('sfx-panel').hidden,true);
});
