// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {WebSocketServer,WebSocket}=require('ws');

function attachRealtime(server,{accounts,rooms,stateView,monitor}){
 const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:1024});
 function validate(client){
  const user=accounts.identify(client.request),room=rooms.get(client.code);
  const player=room?.players.find(p=>p.userId===user?.id);
  if(!user||user.mustChangePassword||!room||room.dissolved||!player||(player.inRoom??player.status!=='away')===false)return null;
  return {user,room,player};
 }
 function send(client,force=false){
  if(client.readyState!==WebSocket.OPEN)return;
  const entry=validate(client);
  if(!entry){client.close(4001,'Session or room expired');return;}
  const {room,player}=entry;
  if(!force&&client.version===room.version&&client.matchId===room.matchId)return;
  if(client.bufferedAmount>1024*1024){client.terminate();return;}
  client.send(JSON.stringify({type:'state',state:stateView(room,player.id)}));
  client.version=room.version;client.matchId=room.matchId;
 }
 server.on('upgrade',(req,socket,head)=>{
  const reject=status=>{socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);};
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname!=='/api/live')return reject('404 Not Found');
   if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)return reject('403 Forbidden');
   const client={request:req,code:url.searchParams.get('code')};
   if(!validate(client))return reject('401 Unauthorized');
   wss.handleUpgrade(req,socket,head,ws=>{
    Object.assign(ws,client,{alive:true});
    ws.on('error',()=>{});
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('message',()=>ws.close(1008,'Commands use HTTP'));
    send(ws,true);
   });
  }catch{reject('400 Bad Request');}
 });
 const timer=setInterval(()=>{
  for(const client of wss.clients){
   if(!client.alive){client.terminate();continue;}
   const entry=validate(client);
   if(!entry){client.close(4001,'Session or room expired');continue;}
   entry.player.lastSeen=Date.now();monitor.touch(client.request,entry.user);
   client.alive=false;client.ping();
  }
 },10000);timer.unref();
 const close=()=>{clearInterval(timer);for(const client of wss.clients)client.terminate();wss.close();};
 server.on('close',close);
 return {refresh(){for(const client of wss.clients)send(client);},close};
}
module.exports={attachRealtime};
