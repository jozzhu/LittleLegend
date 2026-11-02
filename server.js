// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const game=require('./game');
const store=process.env.XCS_DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(store,{recursive:true});
const accounts=require('./accounts').createAccounts(store,{deferWrites:true}),root=path.join(__dirname,'public'),saveFile=path.join(store,'rooms.json');
const {createJsonWriter,draftRoom}=require('./storage'),roomWriter=createJsonWriter(saveFile),streams=new Set();
let rooms=new Map(fs.existsSync(saveFile)?JSON.parse(fs.readFileSync(saveFile,'utf8')).map(r=>[r.code,r]):[]);
const maintenanceFile=path.join(store,'maintenance.json');
let maintenanceFailed=false;
const {createMonitor,localRequest}=require('./host-monitor');
const monitor=createMonitor({accounts,rooms,commit});
function deletionPlan(id){
 const names=new Set(),playerIds=new Set();
 function collect(value){
  if(!value||typeof value!=='object')return;
  if(value.userId===id){if(value.name)names.add(value.name);if(value.id)playerIds.add(value.id);if(value.playerId)playerIds.add(value.playerId);}
  for(const child of Object.values(value))collect(child);
 }
 for(const room of rooms.values())collect(room);
 collect(accounts.data.archives);
 const user=accounts.data.users.find(u=>u.id===id);if(user){names.add(user.nickname);names.add(user.username);}
 return {type:'deleteUser',id,names:[...names].filter(Boolean).sort((a,b)=>b.length-a.length),playerIds:[...playerIds]};
}
function anonymizeDeletedPlayer(value,plan){
 if(!value||typeof value!=='object')return;
 const owned=value.userId===plan.id;
 if(owned){delete value.userId;delete value.token;delete value.avatar;delete value.title;if(value.name)value.name='已删除玩家';if('privateNotice' in value)value.privateNotice=null;}
 if(plan.playerIds.includes(value.player)&&value.name)value.name='已删除玩家';
 if(Array.isArray(value.winners))value.winners=value.winners.map(winner=>typeof winner==='string'&&plan.names.includes(winner)?'已删除玩家':winner);
 for(const child of Object.values(value))anonymizeDeletedPlayer(child,plan);
}
function applyMaintenance(plan){
 if(plan.type==='reset'){accounts.clearAll();rooms.clear();}
 else if(plan.type==='deleteUser'){
  for(const original of [...rooms.values()]){
   const r=draftRoom(original),players=r.players.filter(p=>p.userId===plan.id);
   if(!players.length)continue;
   for(const p of players){
    if(!['lobby','finished'].includes(r.phase)&&p.status!=='surrendered')game.depart(r,p,true);
    game.depart(r,p,false);
    if(r.phase==='lobby')r.players=r.players.filter(q=>q.id!==p.id);
   }
   commit(r);
  }
  for(const room of rooms.values()){anonymizeDeletedPlayer(room,plan);room.version++;}
  anonymizeDeletedPlayer(accounts.data.archives,plan);
  accounts.eraseUser(plan.id);pruneStoredData();
 }else throw Error('数据维护记录无效');
 persist();maintenanceFailed=false;
}
function maintain(plan){
 fs.writeFileSync(maintenanceFile+'.tmp',JSON.stringify(plan));fs.renameSync(maintenanceFile+'.tmp',maintenanceFile);
 try{applyMaintenance(plan);}catch(e){maintenanceFailed=true;throw Error('数据维护未完成，请重启服务自动恢复；恢复前停止写入');}
}
// Replay an interrupted multi-file deletion before accepting any requests.
if(fs.existsSync(maintenanceFile))applyMaintenance(JSON.parse(fs.readFileSync(maintenanceFile,'utf8')));
accounts.migrateAchievements([...rooms.values()]);
pruneStoredData();persist();
// Startup recovery finishes before listening; gameplay saves use asynchronous writes.
accounts.flushSync();roomWriter.flushSync();
if(fs.existsSync(maintenanceFile))fs.unlinkSync(maintenanceFile);
function persist(){roomWriter.save(()=>[...rooms.values()]);}
async function flush(){
 do{await accounts.flush();await roomWriter.flush();}while(accounts.pendingWrites||roomWriter.pending);
 if(fs.existsSync(maintenanceFile))await fs.promises.unlink(maintenanceFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
function pruneStoredData(){
 const users=new Set(accounts.data.users.map(u=>u.id));
 accounts.pruneArchives();
 const archives=new Set(accounts.data.archives.map(a=>a.id));
 for(const r of rooms.values()){
  for(const p of r.players){
   p.inRoom=game.inRoom(p);
   if(p.userId?!users.has(p.userId):!p.token)p.inRoom=false;
  }
  if(r.dissolved||!r.players.some(game.inRoom)){rooms.delete(r.code);continue;}
  if(!r.players.some(p=>p.id===r.hostId&&game.inRoom(p)))game.inheritHost(r,{id:r.hostId,inRoom:false});
  // Unclaimed legacy seats retain their local replays until account migration.
  if(!r.players.some(p=>!p.userId&&p.token))r.replays=r.replays.filter(a=>archives.has(a.id));
 }
}
function commit(r){
 const before=rooms.get(r.code);
 const priorStats=new Map(r.players.map(p=>{const u=accounts.data.users.find(u=>u.id===p.userId);return [p.userId,u?{...u.stats}:null];}));
 if(r.undoApplied){
  for(const [userId,deltas] of Object.entries(r.undoApplied)){
   const u=accounts.data.users.find(u=>u.id===userId);if(!u)continue;
   for(const [key,delta] of Object.entries(deltas))u.stats[key]=Math.max(0,(u.stats[key]||0)-delta);
  }
  delete r.undoApplied;
 }
 accounts.measure(r,before);
 const point=r.undoStack?.at(-1);
 if(point&&point.id!==before?.undoStack?.at(-1)?.id&&!point.statDeltas){
  point.statDeltas={};
  for(const [userId,stats] of priorStats){
   const u=accounts.data.users.find(u=>u.id===userId);if(!u||!stats)continue;
   point.statDeltas[userId]=Object.fromEntries(Object.entries(u.stats).filter(([,v])=>typeof v==='number').map(([k,v])=>[k,v-(stats[k]||0)]));
  }
 }
 r.version++;r.frames.push({time:Date.now(),state:game.snapshot(r)});
 if(['finished','interrupted'].includes(r.phase)&&!r.replays.some(x=>x.id===r.matchId)){accounts.archive(r);r.replays.push({id:r.matchId,time:r.finishedAt||r.endedAt,winners:r.winners.map(id=>r.players.find(p=>p.id===id)?.name),frames:r.frames});r.replays=r.replays.slice(-5);r.frames=[];}
 if(r.dissolved||!r.players.some(game.inRoom))rooms.delete(r.code);else rooms.set(r.code,r);persist();
}
function stateView(r,id){const v=game.view(r,id);v.resumeRequests=r.resumeRequests||[];v.matchId=r.matchId;v.dissolved=!!r.dissolved;const viewer=accounts.data.users.find(u=>u.id===r.players.find(p=>p.id===id)?.userId);v.replays=viewer?listReplays(viewer):[];for(const p of v.players){const u=accounts.data.users.find(u=>u.id===r.players.find(q=>q.id===p.id)?.userId);if(u){const profile=accounts.profile(u);p.userId=u.id;p.name=u.nickname;p.avatar=profile.avatar;p.title=profile.titles.find(t=>t.id===profile.equipped);}}return v;}
function roomCodeAvailable(code){return !rooms.has(code);}
function leaveOtherFinishedRooms(u,except){
 for(const original of [...rooms.values()]){
  if(original.code===except)continue;
  const p=original.players.find(p=>p.userId===u.id&&game.inRoom(p));
  if(!p||original.phase!=='finished'&&p.status!=='surrendered')continue;
  const r=draftRoom(original);game.depart(r,r.players.find(q=>q.id===p.id),false);commit(r);
 }
}
function activeRoom(u,except){return [...rooms.values()].find(r=>r.code!==except&&!r.dissolved&&r.phase!=='finished'&&r.players.some(p=>p.userId===u.id&&(r.phase!=='lobby'||p.status==='active')&&p.status!=='surrendered'));}
function listReplays(u){return accounts.data.archives.filter(a=>a.participants.some(p=>p.userId===u.id)).slice(-5).reverse().map(({frames,participants,...a})=>({...a,frames:frames.length}));}
function replayView(frame,record){const s=frame.state,v=game.view({...s,replays:[]},s.players[0].id,{replay:true});v.replayDecks=s.decks;v.privateNotices=s.players.filter(p=>p.privateNotice).map(p=>({playerId:p.id,...p.privateNotice}));if(s.pending)v.pending.options=s.pending.options.map(({key,label,card})=>({key,label,card}));for(const p of v.players)p.userId=record.participants.find(q=>q.playerId===p.id)?.userId;return {time:frame.time,state:v};}
function listRooms(u){return [...rooms.values()].filter(r=>r.players.some(p=>p.userId===u.id&&(!['lobby','finished'].includes(r.phase)||game.inRoom(p)))).map(r=>({code:r.code,phase:r.phase,host:r.players.find(p=>p.id===r.hostId)?.name,status:r.players.find(p=>p.userId===u.id).status}));}
async function json(res,status,data,headers={}){
 try{await flush();for(const stream of streams)stream.refresh();}
 catch{maintenanceFailed=true;status=503;data={error:'存档写入失败，请重启服务器恢复后继续'};}
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));
}
function cookie(token){return `xcs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`;}
const attempts=new Map();
function resourceManifest(){
 const files=[];
 function visit(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
   const file=path.join(folder,entry.name),relative='/'+path.relative(root,file).split(path.sep).join('/');
   if(entry.isDirectory()){if(!['effects','frames'].includes(entry.name))visit(file);continue;}
   if(!/\.(png|jpe?g|webp|mp3|wav)$/.test(entry.name))continue;
   const kind=relative.startsWith('/assets/audio/bgm/')?'music':relative.startsWith('/cards/')?'cards':'other';
   files.push({url:relative+(relative.startsWith('/assets/audio/')?'?v=3.0.1':''),kind,bytes:fs.statSync(file).size});
  }
 }
 visit(path.join(root,'assets'));visit(path.join(root,'cards'));
 const rank={music:0,cards:1,other:2};files.sort((a,b)=>rank[a.kind]-rank[b.kind]||a.url.localeCompare(b.url));
 return {version:require('./package.json').version,files,bytes:files.reduce((n,f)=>n+f.bytes,0),cacheDays:30};
}
function createServer(){const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(maintenanceFailed&&url.pathname.startsWith('/api/'))return json(res,503,{error:'数据维护未完成，请重启服务自动恢复'});
 if(url.pathname.startsWith('/api/')){
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'不接受跨站请求'});
  if(req.method==='GET'&&url.pathname==='/api/catalog')return json(res,200,{cards:game.catalog,groups:game.groups,extras:game.extras,specials:game.specials,defaults:game.defaults()});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)return json(res,413,{error:'请求过大'});}const a=body?JSON.parse(body):{};
  if(url.pathname==='/api/auth/register'||url.pathname==='/api/auth/login'){
   if(req.method!=='POST')return json(res,405,{error:'需要 POST'});const key=req.socket.remoteAddress,now=Date.now(),recent=(attempts.get(key)||[]).filter(t=>now-t<60000);if(recent.length>=15)return json(res,429,{error:'尝试过于频繁，请稍后重试'});recent.push(now);attempts.set(key,recent);
   const u=url.pathname.endsWith('register')?accounts.register(a):accounts.login(a),token=accounts.session(u);
   monitor.touch({headers:{cookie:'xcs_session='+token}},u);
   return json(res,200,{user:accounts.profile(u),mustChangePassword:!!u.mustChangePassword,rooms:listRooms(u),replays:listReplays(u)},{'Set-Cookie':cookie(token)});
  }
  if(url.pathname==='/api/auth/logout'){const user=accounts.identify(req);if(user)leaveOtherFinishedRooms(user);accounts.logout(req);return json(res,200,{ok:true},{'Set-Cookie':'xcs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(url.pathname.startsWith('/api/admin/')){
   if(!accounts.adminAllowed(req))return json(res,403,{error:'管理后台仅限服务器本机，并需要 data/admin.key 中的管理密钥'});
   if(req.method==='GET'&&url.pathname==='/api/admin/live')return json(res,200,monitor.summary());
   if(req.method==='POST'&&url.pathname==='/api/admin/gm-ticket')return json(res,200,{ticket:monitor.ticket()});
   if(req.method==='GET'&&url.pathname==='/api/admin/users')return json(res,200,{users:accounts.data.users.map(u=>({...accounts.profile(u),username:u.username,disabled:u.disabled,resourceRefresh:accounts.resourceStatus(u)})),audit:accounts.data.audit.slice(-50)});
   if(req.method==='POST'&&url.pathname==='/api/admin/resource-grant')return json(res,200,accounts.grantResources(a.id));
   if(req.method==='POST'&&url.pathname==='/api/admin/reset-password')return json(res,200,accounts.resetPassword(a.id));
   if(req.method==='GET'&&url.pathname==='/api/admin/storage')return json(res,200,{directory:path.resolve(store),users:accounts.data.users.length,rooms:rooms.size,replays:accounts.data.archives.length});
   if(req.method==='GET'&&url.pathname==='/api/admin/delete-preview'){
    const user=accounts.data.users.find(u=>u.id===url.searchParams.get('id'));if(!user)return json(res,404,{error:'账户不存在'});
    const involved=[...rooms.values()].filter(r=>r.players.some(p=>p.userId===user.id)).map(r=>{const p=r.players.find(p=>p.userId===user.id);return {code:r.code,phase:r.phase,status:p.status,host:r.hostId===p.id,players:r.players.filter(game.inRoom).length};});
    return json(res,200,{username:user.username,rooms:involved,replays:accounts.data.archives.filter(r=>r.participants.some(p=>p.userId===user.id)).length});
   }
   if(req.method==='POST'&&url.pathname==='/api/admin/delete-user'){
    const user=accounts.data.users.find(u=>u.id===a.id);if(!user)return json(res,404,{error:'账户不存在'});
    if(a.confirmUsername!==user.username)return json(res,400,{error:'请输入完整账号以确认永久删除'});
    maintain(deletionPlan(user.id));return json(res,200,{ok:true});
   }
   if(req.method==='POST'&&url.pathname==='/api/admin/reset-data'){
    if(a.confirmation!=='清空所有游戏数据')return json(res,400,{error:'请输入“清空所有游戏数据”以确认'});
    maintain({type:'reset'});attempts.clear();return json(res,200,{ok:true});
   }
   if(req.method==='POST'&&url.pathname==='/api/admin/user')return json(res,200,{user:accounts.admin(a)});return json(res,404,{error:'接口不存在'});
  }
  if(url.pathname.startsWith('/api/gm/')){
   if(!localRequest(req))return json(res,403,{error:'观战仅限服务器本机'});
   if(req.method==='POST'&&url.pathname==='/api/gm/login'){
    const token=monitor.login(a.ticket);if(!token)return json(res,401,{error:'观战入口已过期，请从启动器重新打开'});
    return json(res,200,{ok:true},{'Set-Cookie':`xcs_gm=${token}; HttpOnly; SameSite=Strict; Path=/api/gm; Max-Age=43200`});
   }
   const gm=monitor.identify(req);if(!gm)return json(res,401,{error:'请从房主控制台打开 观战，或用本机管理密钥解锁'});
   if(req.method==='GET'&&url.pathname==='/api/gm/rooms')return json(res,200,monitor.summary());
   if(req.method==='POST'&&url.pathname==='/api/gm/enter')return json(res,200,{watchId:monitor.enter(gm,a)});
   if(req.method==='GET'&&url.pathname==='/api/gm/state')return json(res,200,monitor.state(gm,url.searchParams.get('watch')));
   if(req.method==='POST'&&url.pathname==='/api/gm/leave'){gm.watch=null;return json(res,200,{ok:true});}
   return json(res,404,{error:'观战接口不存在'});
  }
  const u=accounts.identify(req);if(!u)return json(res,401,{error:'请先登录账号'});monitor.touch(req,u);
  if(req.method==='POST'&&url.pathname==='/api/heartbeat')return json(res,200,{ok:true});
  if(url.pathname==='/api/auth/me')return json(res,200,{user:accounts.profile(u),mustChangePassword:!!u.mustChangePassword,rooms:listRooms(u),replays:listReplays(u)});
  if(req.method==='POST'&&url.pathname==='/api/auth/password'){accounts.changePassword(u,a);return json(res,200,{ok:true},{'Set-Cookie':cookie(accounts.session(u))});}
  if(u.mustChangePassword)return json(res,403,{error:'请先将临时密码修改为个人密码'});
  if(req.method==='GET'&&url.pathname==='/api/resources/status')return json(res,200,accounts.resourceStatus(u));
  if(req.method==='GET'&&url.pathname==='/api/resources/manifest')return json(res,200,resourceManifest());
  if(req.method==='POST'&&url.pathname==='/api/resources/refresh')return json(res,200,accounts.consumeResources(u,a.resumeId));
  if(req.method==='POST'&&url.pathname==='/api/claim-legacy'){
   const r=rooms.get(String(a.code||'').toUpperCase());const p=r?.players.find(p=>p.id===a.playerId&&p.token===a.token);if(!p||!a.token||(p.userId&&p.userId!==u.id))return json(res,403,{error:'旧身份验证失败，不能仅凭昵称接管座位'});if(r.players.some(q=>q.userId===u.id&&q.id!==p.id))return json(res,409,{error:'该账号已有坐席'});p.userId=u.id;p.statSeen=[...p.hand,...p.board].map(c=>c.uid);for(const record of r.replays||[]){const frame=record.frames.at(-1)?.state;if(frame?.players.some(q=>q.id===p.id)){frame.players.find(q=>q.id===p.id).userId=u.id;accounts.archive({...frame,frames:record.frames});}}persist();return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/profile'&&req.method==='GET'){const target=accounts.data.users.find(p=>p.id===(url.searchParams.get('id')||u.id));if(!target||target.disabled)return json(res,404,{error:'用户不存在'});return json(res,200,accounts.profile(target));}
  if(url.pathname==='/api/profile'&&req.method==='POST')return json(res,200,accounts.updateProfile(u,a));
  if(req.method==='GET'&&url.pathname==='/api/replays')return json(res,200,listReplays(u));
  if(req.method==='GET'&&url.pathname==='/api/replay'&&!url.searchParams.has('code')){const record=accounts.data.archives.find(a=>a.id===url.searchParams.get('match')&&a.participants.some(p=>p.userId===u.id));if(!record)return json(res,404,{error:'回放不存在或你未参与该局'});return json(res,200,{id:record.id,time:record.time,outcome:record.outcome||'finished',winners:record.winners,frames:record.frames.filter(f=>f.state.players.length>=2&&f.state.phase!=='lobby').map(f=>replayView(f,record))});}
  if(req.method==='POST'&&url.pathname==='/api/create'){
   const occupied=activeRoom(u);
   if(occupied)return json(res,409,{error:'你仍在房间 '+occupied.code+' 中，请返回继续游戏；准备阶段可离开，对局开始后需结束或认输才能加入新局',roomCode:occupied.code,phase:occupied.phase});
   const r=game.createRoom(u.nickname,a.settings||{}),requested=String(a.code||'').trim().toUpperCase();
   if(requested&&!/^[A-Z0-9]{3,12}$/.test(requested))return json(res,400,{error:'房间号需为 3–12 位字母或数字'});
   if(requested&&!roomCodeAvailable(requested))return json(res,409,{error:'房间号正在使用，请换一个'});
   if(requested)r.code=requested;else while(!roomCodeAvailable(r.code))r.code=game.createRoom(u.nickname,a.settings||{}).code;
   leaveOtherFinishedRooms(u,r.code);
   r.players[0].userId=u.id;commit(r);return json(res,200,{code:r.code,playerId:r.hostId,state:stateView(r,r.hostId)});
  }
  if(req.method==='POST'&&url.pathname==='/api/join'){
   const existing=rooms.get(String(a.code||'').toUpperCase());if(!existing||existing.dissolved)return json(res,404,{error:'房间已解散或不存在'});const occupied=activeRoom(u,existing.code);if(occupied&&!existing.players.some(p=>p.userId===u.id))return json(res,409,{error:'请先返回房间 '+occupied.code+' 处理未结束的对局',roomCode:occupied.code,phase:occupied.phase});const r=draftRoom(existing);let p=r.players.find(p=>p.userId===u.id);
   if(!p){p=game.join(r,u.nickname);p.userId=u.id;if(!r.hostId)r.hostId=p.id;}else game.command(r,p.id,{type:'resume'});leaveOtherFinishedRooms(u,r.code);commit(r);return json(res,200,{code:r.code,playerId:p.id,state:stateView(r,p.id)});
  }
  const existing=rooms.get(url.searchParams.get('code'));if(!existing||existing.dissolved)return json(res,404,{error:'房间已解散或不存在'});const authenticated=existing.players.find(p=>p.userId===u.id);if(!authenticated)return json(res,403,{error:'你不是该房间的参与者'});const id=authenticated.id;
  if(req.method==='GET'&&url.pathname==='/api/state'){authenticated.lastSeen=Date.now();if(url.searchParams.has('since')&&Number(url.searchParams.get('since'))===existing.version&&url.searchParams.get('match')===existing.matchId)return json(res,200,{unchanged:true,version:existing.version});return json(res,200,stateView(existing,id));}
  if(req.method==='POST'&&url.pathname==='/api/command'){
   if(a.matchId&&a.matchId!==existing.matchId)return json(res,409,{error:'该房间号已用于新对局，请重新进入房间'});
   const r=draftRoom(existing);
   if(a.type==='rematch'){if(r.phase!=='finished')throw Error('对局结束后才能返回准备房间');if(!game.inRoom(authenticated))throw Error('请先返回房间');const fresh=game.createRoom(u.nickname,r.settings);fresh.code=r.code;fresh.hostId=r.hostId;fresh.players=r.players.filter(p=>game.inRoom(p)&&accounts.data.users.some(u=>u.id===p.userId)).map(p=>({...game.player(p.name),id:p.id,userId:p.userId}));fresh.replays=r.replays;fresh.version=r.version;commit(fresh);return json(res,200,stateView(fresh,id));}
   game.command(r,id,a);commit(r);return json(res,200,stateView(r,id));
  }
  return json(res,404,{error:'接口不存在'});
 }
 if(req.method!=='GET')return json(res,405,{error:'不支持的请求方式'});const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return json(res,403,{error:'无效路径'});
 if(['.mp3','.wav'].includes(path.extname(file))){
  fs.stat(file,(err,stat)=>{
   if(err||!stat.isFile())return json(res,404,{error:'文件不存在'});
   const etag=`"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
   const headers={'Content-Type':path.extname(file)==='.mp3'?'audio/mpeg':'audio/wav','Accept-Ranges':'bytes','Cache-Control':'public, max-age=2592000',ETag:etag,'Last-Modified':stat.mtime.toUTCString(),'X-Content-Type-Options':'nosniff'};
   if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end();}
   let start=0,end=stat.size-1,status=200;
   if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag||req.headers['if-range']===headers['Last-Modified'])){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`});return res.end();}
    if(!match[1])start=Math.max(0,stat.size-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`});return res.end();}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
   }
   headers['Content-Length']=end-start+1;res.writeHead(status,headers);
   const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  });return;
 }
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8'};
 fs.stat(file,(err,stat)=>{
  if(err||!stat.isFile())return json(res,404,{error:'文件不存在'});
  const etag=`"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const asset=/^\/(?:cards\/|assets\/)/.test(url.pathname)&&/\.(png|jpg|jpeg|webp)$/.test(file);
  const headers={'Cache-Control':asset?'public, max-age=2592000':'no-cache',ETag:etag,'Last-Modified':stat.mtime.toUTCString(),'X-Content-Type-Options':'nosniff'};
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end();}
  fs.readFile(file,(err,data)=>{
   if(err)return json(res,404,{error:'文件不存在'});
   const type=path.extname(file)==='.png'&&data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':mime[path.extname(file)]||'application/octet-stream';
   res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':data.length});res.end(data);
  });
 });
 }catch(e){return json(res,400,{error:e instanceof SyntaxError?'请求格式不正确':e.message});}});
 const stream=require('./realtime').attachRealtime(server,{accounts,rooms,stateView,monitor});streams.add(stream);
 const reconnectUntil=Date.now()+60000;
 const presence=setInterval(async()=>{if(maintenanceFailed||Date.now()<reconnectUntil)return;try{for(const original of rooms.values()){const offline=original.players.filter(p=>game.inRoom(p)&&Date.now()-p.lastSeen>60000);if(!offline.length)continue;const r=draftRoom(original);for(const p of offline)game.depart(r,r.players.find(q=>q.id===p.id),false);commit(r);}await flush();stream.refresh();}catch{maintenanceFailed=true;}},5000);presence.unref();
 server.on('close',()=>{clearInterval(presence);streams.delete(stream);});
 server.flush=flush;server.closeRealtime=stream.close;
 return server;
}
module.exports={createServer};
if(require.main===module)require('./host-runner').run().catch(e=>{console.error(e.message);process.exit(1);});
