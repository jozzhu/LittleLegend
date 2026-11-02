// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

let liveSocket=null,liveRetry=null,liveGeneration=0,liveAttempt=0;
function stopLive(){
 liveGeneration++;clearTimeout(liveRetry);liveRetry=null;
 const socket=liveSocket;liveSocket=null;
 if(socket){socket.onclose=null;socket.close();}
}
function startLive(){
 stopLive();liveAttempt=0;
 const generation=liveGeneration,epoch=sessionEpoch,code=seat?.roomCode;
 const active=()=>generation===liveGeneration&&epoch===sessionEpoch&&seat?.roomCode===code;
 function fallback(){
  clearInterval(pollTimer);pollTimer=setInterval(poll,1500);
  $('#connection-label').textContent='同步中';poll();
 }
 function connect(){
  if(!active())return;
  if(typeof WebSocket!=='function'){fallback();return;}
  let socket,needsBaseline=true;
  try{socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/live?code=${encodeURIComponent(code)}`);}
  catch{fallback();return;}
  liveSocket=socket;
  socket.onopen=()=>{if(!active()){socket.close();return;}liveAttempt=0;clearInterval(pollTimer);$('#connection-label').textContent='实时连接';};
  socket.onmessage=event=>{
   if(!active())return;
   try{const message=JSON.parse(event.data);if(message.type==='state'){if(needsBaseline){globalThis.LegendAudio?.baseline(message.state);needsBaseline=false;}acceptState(message.state,epoch);}}catch{socket.close();}
  };
  socket.onerror=()=>socket.close();
  socket.onclose=()=>{
   if(!active())return;
   fallback();
   liveRetry=setTimeout(connect,Math.min(10000,500*2**Math.min(liveAttempt++,5))+Math.random()*300);
  };
 }
 fallback();connect();
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&seat&&!replay){poll();if(!liveSocket||liveSocket.readyState>1)startLive();}
});
