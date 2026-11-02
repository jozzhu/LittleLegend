// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(){
 const tracks={lobby:'bgm_lobby.mp3',waiting:'bgm_lobby(1).mp3',match:'bgm_match.mp3',replay:'bgm_replay.wav',tension:'bgm_tension.mp3'};
 const defaults={sfx:70,bgm:100,sfxMuted:false,bgmMuted:false};
 function preferences(value){
  const result={...defaults};
  for(const key of ['sfx','bgm'])if(Number.isFinite(value?.[key]))result[key]=Math.max(0,Math.min(100,value[key]));
  for(const key of ['sfxMuted','bgmMuted'])if(typeof value?.[key]==='boolean')result[key]=value[key];
  return result;
 }
 function musicFor(s,{visible=true,replay=false,spectator=false}={}){
  if(!visible||!s)return 'lobby';
  if(replay||spectator||['finished','interrupted'].includes(s.phase))return 'replay';
  if(s.phase==='lobby')return 'waiting';
  if(s.phase==='playing'&&s.players.some(p=>p.status!=='surrendered'&&p.coins>=4))return 'tension';
  return 'match';
 }
 function soundsFor(before,after,viewer,{replay=false,spectator=false}={}){
  if(!before||!after||replay||before.code!==after.code||before.matchId!==after.matchId||after.version<=before.version)return [];
  const seen=new Set(before.events.map(e=>e.id)),events=after.events.filter(e=>!seen.has(e.id)&&!e.undone);
  if(events.some(e=>e.type==='undo'))return [];
  const sounds=[];
  const add=name=>{if(!sounds.includes(name))sounds.push(name);};
  for(const e of events){
   switch(e.type){
    case 'ready':if(after.players.some(p=>p.id===e.actor&&p.ready)||after.players.some(p=>p.ready&&!before.players.find(q=>q.id===p.id)?.ready))add('player_ready');break;
    case 'dice':add('dice_roll');add('dice_result');break;
    case 'start':add('match_start');break;
    case 'turn':if(e.actor===viewer||spectator)add('turn_start');break;
    case 'draw':add('card_draw');break;
    case 'play':add('card_play');break;
    case 'place':add('card_place');break;
    case 'discard':add('card_discard');break;
    case 'prepare':add('card_return');break;
    case 'return':if(e.cardId)add('card_return');break;
    case 'retrieve':case 'search':case 'steal':case 'trade':add('card_return');break;
    case 'coin':if(e.delta>0)add('coin_gain');break;
    case 'stealCoin':add('coin_steal');break;
    case 'target':add('attack');break;
    case 'responseResult':add(e.success?'defend_success':'effect_fizzle');break;
    case 'response':if(!events.some(x=>x.type==='responseResult'&&x.actor===e.actor))add('defend_success');break;
    case 'fizzle':add('effect_fizzle');break;
    case 'declaration':case 'guess':add('declaration');break;
    case 'pause':case 'resume':if(before.paused!==after.paused)add('pause');break;
    case 'victory':add(spectator||after.winners.includes(viewer)?'victory':'defeat');break;
   }
  }
  if(events.some(e=>e.type==='stealCoin')){const i=sounds.indexOf('coin_gain');if(i>=0)sounds.splice(i,1);}
  const oldChat=new Set((before.chat||[]).map(m=>m.id||`${m.time}:${m.player}:${m.text}`));
  if((after.chat||[]).some(m=>m.player!==viewer&&!oldChat.has(m.id||`${m.time}:${m.player}:${m.text}`)))add('chat');
  if(after.pending?.playerId===viewer&&after.pending.id!==before.pending?.id)add('response_request');
  return sounds.slice(-6);
 }
 if(typeof module==='object'&&module.exports){module.exports={tracks,preferences,musicFor,soundsFor};return;}
 let prefs=preferences(),unlocked=false,previous=null,identity=null,desired='lobby',queueTimer=null;
 const pendingSounds=[],mixer=window.LegendAudioMixer.createMixer();
 try{prefs=preferences(JSON.parse(localStorage.getItem('xcs-audio-v3')));}catch{}
 const volume=()=>prefs.bgmMuted?0:prefs.bgm/100;
 function updateMusic(){
  mixer.setVolumes(volume(),prefs.sfxMuted?0:prefs.sfx/100);
  window.LegendResources?.prioritize('/assets/audio/bgm/'+tracks[desired]+'?v=3.0.1');
  mixer.setMusic('/assets/audio/bgm/'+tracks[desired]+'?v=3.0.1');
 }
 function clearSounds(){clearTimeout(queueTimer);queueTimer=null;pendingSounds.length=0;mixer.clearEffects();}
 function play(name){
  if(!unlocked||prefs.sfxMuted||prefs.sfx===0||document.visibilityState==='hidden')return;
  mixer.play('/assets/audio/sfx/sfx_'+name+'.wav?v=3.0.1');
 }
 function enqueue(sounds){
  if(!unlocked||prefs.sfxMuted||document.visibilityState==='hidden')return;
  pendingSounds.push(...sounds);if(pendingSounds.length>8)pendingSounds.splice(0,pendingSounds.length-8);
  if(queueTimer)return;
  const next=()=>{queueTimer=null;if(!pendingSounds.length)return;play(pendingSounds.shift());if(pendingSounds.length)queueTimer=setTimeout(next,170);};
  next();
 }
 function unlock(){unlocked=true;updateMusic();mixer.unlock();}
 function observe(s,options={}){
  const key=s&&`${s.code}:${s.matchId}:${options.replay?'replay':'live'}:${options.viewer||''}`;
  if(key!==identity){previous=null;identity=key;clearSounds();}
  if(options.visible!==false)enqueue(soundsFor(previous,s,options.viewer,options));
  previous=s?{code:s.code,matchId:s.matchId,version:s.version,events:s.events.map(e=>({...e})),players:s.players.map(p=>({id:p.id,ready:p.ready})),chat:(s.chat||[]).map(m=>({...m})),pending:s.pending?{id:s.pending.id}:null,paused:s.paused}:null;
  const track=musicFor(s,options);if(track!==desired){desired=track;updateMusic();}
 }
 function save(){
  try{localStorage.setItem('xcs-audio-v3',JSON.stringify(prefs));}catch{}
  if(prefs.sfxMuted||prefs.sfx===0)clearSounds();
  updateMusic();syncControls();
 }
 function syncControls(){
  for(const kind of ['sfx','bgm']){
   const button=document.querySelector('#audio-'+kind),muted=prefs[kind+'Muted']||prefs[kind]===0;
   if(button){button.dataset.muted=String(muted);button.title=(kind==='sfx'?'音效':'背景音乐')+(muted?' · 已静音':' · '+prefs[kind]+'%');}
   const slider=document.querySelector('#audio-'+kind+'-volume'),mute=document.querySelector('#audio-'+kind+'-mute');
   if(slider)slider.value=prefs[kind];
   if(mute){mute.checked=!prefs[kind+'Muted'];mute.setAttribute('aria-label',kind==='sfx'?'启用音效':'启用背景音乐');}
   const output=document.querySelector('#audio-'+kind+'-value');if(output)output.textContent=prefs[kind]+'%';
  }
 }
 function controls(){
  const actions=document.querySelector('.bar-actions')||document.querySelector('.header-actions');if(!actions)return;
  const group=document.createElement('div');group.className='audio-controls';
  for(const [kind,symbol,label]of [['sfx','♬','音效'],['bgm','♫','背景音乐']]){
   const button=document.createElement('button');button.type='button';button.id='audio-'+kind;button.className='audio-button';
   button.setAttribute('aria-label',label+'控制');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','audio-'+kind+'-panel');
   button.innerHTML=`<span aria-hidden="true">${symbol}</span><span class="audio-button-label">${kind==='sfx'?'音效':'音乐'}</span>`;
   const panel=document.createElement('div');panel.id='audio-'+kind+'-panel';panel.className='audio-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label',label+'控制');
   panel.innerHTML=`<div class="audio-heading"><strong>${label}</strong><label><input id="audio-${kind}-mute" type="checkbox">启用</label></div><label class="audio-volume"><input id="audio-${kind}-volume" type="range" min="0" max="100" step="1" aria-label="${label}音量"><output id="audio-${kind}-value"></output></label>`;
   button.onclick=()=>{const open=panel.hidden;for(const p of group.querySelectorAll('.audio-panel'))p.hidden=true;for(const b of group.querySelectorAll('.audio-button'))b.setAttribute('aria-expanded','false');panel.hidden=!open;button.setAttribute('aria-expanded',String(open));};
   panel.querySelector('input[type=range]').oninput=e=>{prefs[kind]=Number(e.target.value);save();};
   panel.querySelector('input[type=range]').onchange=()=>{if(kind==='sfx')play('ui_click');};
   panel.querySelector('input[type=checkbox]').onchange=e=>{prefs[kind+'Muted']=!e.target.checked;save();};
   group.append(button,panel);
  }
  const font=actions.querySelector('.font-control');if(font)font.after(group);else actions.prepend(group);
  const auth=document.querySelector('#auth-screen'),loginBar=auth?.querySelector('.topbar');
  if(loginBar){
   const place=()=>{if(!auth.hidden)loginBar.append(group);else if(font)font.after(group);else actions.prepend(group);};
   new MutationObserver(place).observe(auth,{attributes:true,attributeFilter:['hidden']});place();
  }
  const close=()=>{for(const p of group.querySelectorAll('.audio-panel'))p.hidden=true;for(const b of group.querySelectorAll('.audio-button'))b.setAttribute('aria-expanded','false');};
  document.addEventListener('pointerdown',e=>{if(!group.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const button=group.querySelector('[aria-expanded=true]');close();button?.focus();}});
  syncControls();
 }
 document.addEventListener('pointerdown',unlock,{capture:true});
 document.addEventListener('keydown',unlock,{capture:true});
 document.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&!button.disabled&&!button.closest('.audio-panel'))play('ui_click');});
 document.addEventListener('visibilitychange',()=>{previous=null;clearSounds();mixer.visibility(document.visibilityState!=='hidden');updateMusic();});
 window.addEventListener('pagehide',()=>{clearSounds();mixer.visibility(false);});
 window.addEventListener('pageshow',()=>{mixer.visibility(document.visibilityState!=='hidden');updateMusic();});
 if(typeof render==='function'){
  const base=render;
  const refresh=()=>{
   const visible=!document.querySelector('#room')?.hidden;
   const s=visible?current():null,viewer=typeof seat==='object'?seat?.playerId:null;
   observe(s,{visible,viewer,replay:!!replay,spectator:s?.players.find(p=>p.id===viewer)?.status==='surrendered'});
  };
  render=function(){base();refresh();};
  const room=document.querySelector('#room');if(room)new MutationObserver(refresh).observe(room,{attributes:true,attributeFilter:['hidden']});
  if(typeof toast==='function'){const baseToast=toast;toast=function(text){baseToast(text);if(/失败|不足|不能|不可|超时|无效|错误/.test(text))play('ui_error');};}
  if(typeof openDialog==='function'){const baseDialog=openDialog;openDialog=function(id){const wasOpen=document.querySelector(id)?.open;baseDialog(id);if(!wasOpen)play('ui_panel');};}
  refresh();
 }
 controls();
 window.LegendAudio={observe,play,baseline(s){previous=null;clearSounds();if(s)observe(s,{viewer:typeof seat==='object'?seat?.playerId:null,replay:typeof replay!=='undefined'&&!!replay});},reset(){observe(null);}};
})();
