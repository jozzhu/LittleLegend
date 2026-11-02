// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const crypto=require('node:crypto'),game=require('./game');
const runningPhases=new Set(['seating','initial','playing']);
function cookie(req,name){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
function localRequest(req){
 return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1'].includes(String(req.headers.host||'').split(':')[0]);
}
function createMonitor({accounts,rooms,commit,now=Date.now}){
 const seen=new Map(),tickets=new Map(),sessions=new Map();
 function touch(req,user){
  const token=cookie(req,'xcs_session');if(!token)return;
  seen.set(crypto.createHash('sha256').update(token).digest('hex'),{userId:user.id,time:now()});
 }
 function summary(){
  const valid=new Set(accounts.data.sessions.filter(s=>s.expires>now()).map(s=>s.hash)),online=new Set();
  for(const [token,entry] of seen){
   if(now()-entry.time>=30000||!valid.has(token)||!accounts.data.users.some(u=>u.id===entry.userId&&!u.disabled)){seen.delete(token);continue;}
   online.add(entry.userId);
  }
  const roomList=[...rooms.values()].map(r=>({
   code:r.code,matchId:r.matchId,phase:r.phase,round:r.round,paused:r.paused,
   host:r.players.find(p=>p.id===r.hostId)?.name||'—',
   present:r.players.filter(game.inRoom).length,players:r.players.length,createdAt:r.createdAt,
   canWatch:runningPhases.has(r.phase)
  })).sort((a,b)=>b.createdAt-a.createdAt);
  return {online:online.size,rooms:roomList.length,playing:roomList.filter(r=>runningPhases.has(r.phase)).length,roomList};
 }
 function ticket(){
  for(const [id,expires] of tickets)if(expires<=now())tickets.delete(id);
  const id=crypto.randomBytes(24).toString('hex');tickets.set(id,now()+30000);return id;
 }
 function login(value){
  const expires=tickets.get(value);tickets.delete(value);
  if(!expires||expires<=now())return null;
  for(const [id,s] of sessions)if(s.expires<=now())sessions.delete(id);
  const id=crypto.randomBytes(32).toString('hex');sessions.set(id,{expires:now()+12*3600000,watch:null});return id;
 }
 function identify(req){
  if(!localRequest(req))return null;
  const token=cookie(req,'xcs_gm'),session=sessions.get(token);
  if(!session||session.expires<=now()){sessions.delete(token);return null;}
  return session;
 }
 function enter(session,{code,matchId}){
  const r=rooms.get(String(code||'').toUpperCase());
  if(!r||r.matchId!==matchId)throw Error('房间已解散或房间号已用于新对局');
  if(!runningPhases.has(r.phase))throw Error('该房间当前没有进行中的对局');
  if(session.watch?.matchId===matchId&&session.watch.lastSeen>now()-30000)return session.watch.id;
  const next=structuredClone(r);
  next.events.push({id:crypto.randomUUID(),index:next.events.length,time:now(),round:next.round||0,turn:next.turnNumber||0,type:'gm',text:'观战者进入全知观战'});
  commit(next);
  const id=crypto.randomBytes(18).toString('hex');session.watch={id,code:r.code,matchId,lastSeen:now()};return id;
 }
 function state(session,id){
  const watch=session.watch;if(!watch||watch.id!==id)throw Error('观战已结束，请重新选择对局');
  const r=rooms.get(watch.code);if(!r||r.matchId!==watch.matchId)throw Error('房间已解散，请返回对局列表');
  watch.lastSeen=now();
  const v=game.view(r,r.players[0].id,{replay:true});
  v.matchId=r.matchId;v.replays=[];v.replayDecks=structuredClone(r.decks);
  v.privateNotices=r.players.filter(p=>p.privateNotice).map(p=>({playerId:p.id,...p.privateNotice}));
  if(r.pending)v.pending.options=r.pending.options.map(({key,label,card})=>({key,label,card}));
  for(const p of v.players){const source=r.players.find(q=>q.id===p.id),user=accounts.data.users.find(u=>u.id===source.userId);p.inRoom=game.inRoom(source);if(user){p.name=user.nickname;p.avatar=user.avatar;}}
  return v;
 }
 return {touch,summary,ticket,login,identify,enter,state};
}
module.exports={createMonitor,localRequest};
