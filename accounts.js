// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const avatars=require('./public/avatars');
const metrics=['games','interruptedGames','wins','coinsEarned','royalCards','monsterCards','royalSelections','monsterSelections','attacks','responses','responseOffers','returns','losses'];
const emptyStats=()=>Object.fromEntries(metrics.map(k=>[k,0]));
const recentThree=matches=>matches.filter(m=>m.outcome!=='interrupted').slice(-3);
function matchMetrics(events,playerId){const own=events.filter(e=>!e.undone&&e.actor===playerId),choices=own.filter(e=>e.type==='responseChoice');return {responses:choices.filter(e=>e.accepted).length,responseOffers:choices.length,responseSuccesses:own.filter(e=>e.type==='responseResult'&&e.success).length};}
function selectedFaction(e){if(e.type!=='draw')return null;return e.faction||(/^.+ 从皇室牌库/.test(e.text||'')?'royal':/^.+ 从魔物牌库/.test(e.text||'')?'monster':null);}
const titles=[
 {id:'wanderer',name:'初来乍到',description:'踏入小传说的第一步',tone:'silver',test:()=>true},
 {id:'never-return',name:'绝不还手之人',description:'最近 3 局合计主动应对不超过 10 次（需完成 3 局）',tone:'jade',test:(s,m=[])=>recentThree(m).length===3&&recentThree(m).every(g=>Number.isSafeInteger(g.responses))&&recentThree(m).reduce((n,g)=>n+g.responses,0)<=10},
 {id:'berserker',name:'战斗狂',description:'累计打出 15 张攻击牌',tone:'ruby',test:s=>s.attacks>=15},
 {id:'robber',name:'强盗',description:'累计从其他玩家处成功抢夺至少 10 枚金币（不含自产金币及商人交易）',tone:'ruby',test:s=>(s.stolenCoins||0)>=10},
 {id:'tragic',name:'惨！！',description:'最近 3 局全部落败（需完成 3 局）',tone:'violet',test:(s,m=[])=>recentThree(m).length===3&&recentThree(m).every(g=>g.won===false)},
 {id:'responder',name:'休想得逞',description:'有一局所有可选应对均接受并成功结算，且至少有一次应对机会',tone:'jade',test:(s,m=[])=>m.some(g=>g.outcome!=='interrupted'&&g.responseOffers>0&&g.responses===g.responseOffers&&g.responseSuccesses===g.responseOffers)},
 {id:'wealth',name:'富可敌国',description:'累计获取 30 枚金币',tone:'gold',test:s=>s.coinsEarned>=30},
 {id:'royal',name:'王国座上宾',description:'累计主动选取的皇室牌多于魔物牌',tone:'gold',test:s=>(s.royalSelections||0)>(s.monsterSelections||0)},
 {id:'monster',name:'魔物的挚友',description:'累计主动选取的魔物牌多于皇室牌',tone:'violet',test:s=>(s.monsterSelections||0)>(s.royalSelections||0)},
];
function createAccounts(dir,{deferWrites=false}={}){
 const file=path.join(dir,'accounts.json');let data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{users:[],sessions:[],archives:[],audit:[]};
 const keyFile=path.join(dir,'admin.key');if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const adminKey=fs.readFileSync(keyFile,'utf8').trim();
 const writer=deferWrites?require('./storage').createJsonWriter(file):null;
 function save(){if(writer){writer.save(()=>data);return;}fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);}
 async function flush(){if(writer)await writer.flush();}
 function flushSync(){if(writer)writer.flushSync();}
 function migrateAchievements(rooms=[]){
  if(data.achievementVersion===2)return;
  const histories=new Map();
  for(const archive of data.archives){const state=archive.frames?.at(-1)?.state;if(state)histories.set(archive.id,state);}
  for(const room of rooms){const previous=histories.get(room.matchId);if(!previous||room.events.length>previous.events.length)histories.set(room.matchId,room);}
  for(const u of data.users){u.stats.royalSelections??=0;u.stats.monsterSelections??=0;}
  for(const room of histories.values())for(const p of room.players){
   const u=data.users.find(u=>u.id===p.userId);if(!u)continue;
   const record=u.matches.find(m=>m.id===room.matchId);if(record&&record.responses===undefined)Object.assign(record,matchMetrics(room.events,p.id));
   for(const e of room.events.filter(e=>e.actor===p.id)){const faction=selectedFaction(e);if(faction)u.stats[faction==='royal'?'royalSelections':'monsterSelections']++;}
   // Older merchant transfers used the robbery event type; only subtract verifiable trades.
   for(let i=0;i<room.events.length;i++){const e=room.events[i];if(e.type!=='trade'||!e.text?.startsWith(p.name+' 将'))continue;const transfer=room.events.slice(Math.max(0,i-3),i).find(e=>e.type==='stealCoin'&&e.actor===p.id);if(transfer)u.stats.stolenCoins=Math.max(0,(u.stats.stolenCoins||0)-1);}
  }
  data.achievementVersion=2;save();
 }
 function audit(action,user){data.audit.push({time:Date.now(),action,user});data.audit=data.audit.slice(-300);}
 function passwordHash(password,salt){return crypto.scryptSync(password,salt,64).toString('hex');}
 function setPassword(u,password){if(typeof password!=='string'||password.length<8||password.length>128)throw Error('密码长度为 8–128 位');const salt=crypto.randomBytes(16).toString('hex');const hash=passwordHash(password,salt);u.salt=salt;u.hash=hash;data.sessions=data.sessions.filter(s=>s.userId!==u.id);}
 function changePassword(u,a){if(typeof a.currentPassword!=='string'||a.currentPassword.length>128||!crypto.timingSafeEqual(Buffer.from(u.hash,'hex'),Buffer.from(passwordHash(a.currentPassword,u.salt),'hex')))throw Error('当前密码不正确');if(a.newPassword===a.currentPassword)throw Error('新密码不能与当前密码相同');setPassword(u,a.newPassword);u.mustChangePassword=false;audit('password changed',u.id);save();}
 function resetPassword(id){const u=data.users.find(u=>u.id===id);if(!u||u.disabled)throw Error('账户不存在或已注销，请先恢复账户');const temporaryPassword=crypto.randomBytes(18).toString('base64url');setPassword(u,temporaryPassword);u.mustChangePassword=true;audit('admin password reset',u.id);save();return {temporaryPassword,username:u.username};}
 function register(a){const username=String(a.username||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('账号为 3–24 位字母、数字或下划线');if(typeof a.password!=='string'||a.password.length<8||a.password.length>128)throw Error('密码长度为 8–128 位');if(data.users.some(u=>u.username===username))throw Error('账号已存在');const salt=crypto.randomBytes(16).toString('hex');const u={id:crypto.randomUUID(),username,nickname:String(a.nickname||username).trim().slice(0,18)||username,salt,hash:passwordHash(a.password,salt),createdAt:Date.now(),disabled:false,stats:{...emptyStats(),stolenCoins:0},equipped:'wanderer',showcase:['wanderer'],matches:[]};data.users.push(u);audit('register',u.id);save();return u;}
 function login(a){const u=data.users.find(u=>u.username===String(a.username||'').trim().toLowerCase());if(!u||u.disabled||typeof a.password!=='string'||a.password.length>128||!crypto.timingSafeEqual(Buffer.from(u.hash,'hex'),Buffer.from(passwordHash(a.password,u.salt),'hex')))throw Error('账号或密码不正确，或账户已注销');return u;}
 function session(u){const token=crypto.randomBytes(32).toString('hex');data.sessions=data.sessions.filter(s=>s.expires>Date.now());data.sessions.push({hash:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,expires:Date.now()+30*86400000});save();return token;}
 function identify(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('xcs_session='))?.slice(12);if(!token)return null;const hash=crypto.createHash('sha256').update(token).digest('hex');const s=data.sessions.find(s=>s.hash===hash&&s.expires>Date.now());return s?data.users.find(u=>u.id===s.userId&&!u.disabled):null;}
 function logout(req){const u=identify(req);if(u){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('xcs_session='))?.slice(12);const hash=crypto.createHash('sha256').update(token).digest('hex');data.sessions=data.sessions.filter(s=>s.hash!==hash);save();}}
 function profile(u){
  const earned=titles.filter(t=>t.test(u.stats,u.matches)),interruptedGames=u.stats.interruptedGames||0;
  const stats={...u.stats,interruptedGames,totalGames:u.stats.games+interruptedGames};
  return {id:u.id,nickname:u.nickname,avatar:u.avatar||{mode:'default'},createdAt:u.createdAt,stats,equipped:earned.find(t=>t.id===u.equipped)?u.equipped:'wanderer',showcase:u.showcase.filter(id=>earned.some(t=>t.id===id)),titles:earned.map(({test,...t})=>t),titleCatalog:titles.map(({test,...t})=>t),favoriteFaction:(u.stats.royalSelections||0)===(u.stats.monsterSelections||0)?'尚无偏好':(u.stats.royalSelections||0)>(u.stats.monsterSelections||0)?'皇室':'魔物',attackPreference:stats.totalGames?Math.round(u.stats.attacks/stats.totalGames*10)/10:null,responseRate:u.stats.responseOffers?Math.round(u.stats.responses/u.stats.responseOffers*100):null,matches:u.matches.slice(-20).reverse()};
 }
 function updateProfile(u,a){const patch={};if(a.avatar!==undefined)patch.avatar=avatars.normalize(a.avatar);if(a.nickname!==undefined){const name=String(a.nickname).trim();if(!name||name.length>18)throw Error('昵称长度 1–18');patch.nickname=name;}const earned=titles.filter(t=>t.test(u.stats,u.matches)).map(t=>t.id);if(a.equipped!==undefined){if(!earned.includes(a.equipped))throw Error('词条尚未解锁');patch.equipped=a.equipped;}if(a.showcase!==undefined){if(!Array.isArray(a.showcase)||a.showcase.length>3||new Set(a.showcase).size!==a.showcase.length||!a.showcase.every(id=>earned.includes(id)))throw Error('最多展示三个已解锁词条');patch.showcase=a.showcase;}Object.assign(u,patch);save();return profile(u);}
 function measure(room,before){const old=before?.matchId===room.matchId?before.events.length:0;const events=room.events.slice(old);for(const p of room.players){const u=data.users.find(u=>u.id===p.userId);if(!u)continue;const s=u.stats;for(const e of events){if(e.actor!==p.id)continue;const faction=selectedFaction(e);if(faction)s[faction==='royal'?'royalSelections':'monsterSelections']=(s[faction==='royal'?'royalSelections':'monsterSelections']||0)+1;if(e.type==='coin'&&e.delta>0)s.coinsEarned+=e.delta;if(e.type==='play'&&require('./game').byId(e.cardId)?.attack)s.attacks++;if(e.type==='responseChoice'){s.responseOffers++;if(e.accepted)s.responses++;}if(e.type==='prepare')s.returns+=e.count||0;if(e.type==='return'&&e.cardId)s.returns++;}const seen=new Set(p.statSeen||[]);for(const c of [...p.hand,...p.board]){if(!seen.has(c.uid)){s[c.faction==='royal'?'royalCards':'monsterCards']++;seen.add(c.uid);}}p.statSeen=[...seen];}
  // Only robbery transfers count here; generated coins and merchant trades have separate event types.
  for(const e of events.filter(e=>e.type==='stealCoin')){const u=data.users.find(u=>u.id===room.players.find(p=>p.id===e.actor)?.userId);if(u)u.stats.stolenCoins=(u.stats.stolenCoins||0)+1;}
  if(['finished','interrupted'].includes(room.phase)&&(before?.matchId!==room.matchId||before?.phase!==room.phase)){
   for(const p of room.players){
    const u=data.users.find(u=>u.id===p.userId);if(!u||u.matches.some(m=>m.id===room.matchId))continue;
    const interrupted=room.phase==='interrupted',won=interrupted?null:room.winners.includes(p.id);
    if(interrupted)u.stats.interruptedGames=(u.stats.interruptedGames||0)+1;
    else{u.stats.games++;u.stats[won?'wins':'losses']++;}
    u.matches.push({id:room.matchId,time:room.finishedAt||room.endedAt,outcome:room.phase,won,coins:p.coins,room:room.code,...matchMetrics(room.events,p.id)});
   }
  }
  save();
 }
 function archive(room){const participants=room.players.filter(p=>p.userId).map(p=>({userId:p.userId,playerId:p.id}));const existing=data.archives.find(a=>a.id===room.matchId);if(existing){for(const p of participants)if(!existing.participants.some(q=>q.userId===p.userId))existing.participants.push(p);}else data.archives.push({id:room.matchId,time:room.finishedAt||room.endedAt,code:room.code,outcome:room.phase==='interrupted'?'interrupted':'finished',participants,winners:room.winners.map(id=>room.players.find(p=>p.id===id)?.name),frames:room.frames});data.archives.sort((a,b)=>a.time-b.time);const keep=new Set();for(const u of data.users)data.archives.filter(a=>a.participants.some(p=>p.userId===u.id)).slice(-5).forEach(a=>keep.add(a.id));data.archives=data.archives.filter(a=>keep.has(a.id));save();}
 function adminAllowed(req){const remote=req.socket.remoteAddress,host=String(req.headers.host||'').split(':')[0];return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&['localhost','127.0.0.1'].includes(host)&&req.headers['x-admin-key']===adminKey;}
 function admin(a){const u=data.users.find(u=>u.id===a.id);if(!u)throw Error('账户不存在');if(a.disabled!==undefined&&typeof a.disabled!=='boolean')throw Error('状态无效');if(a.nickname!==undefined&&(!String(a.nickname).trim()||String(a.nickname).trim().length>18))throw Error('昵称长度 1–18');if(a.stats){for(const [k,v]of Object.entries(a.stats)){if(![...metrics,'stolenCoins'].includes(k)||!Number.isSafeInteger(v)||v<0||v>100000000)throw Error('统计值无效');}}if(a.nickname!==undefined)u.nickname=String(a.nickname).trim();if(a.disabled!==undefined){u.disabled=a.disabled;data.sessions=data.sessions.filter(s=>s.userId!==u.id);}if(a.stats)Object.assign(u.stats,a.stats);audit('admin update',u.id);save();return profile(u);}
 function eraseUser(id){
  data.users=data.users.filter(u=>u.id!==id);
  data.sessions=data.sessions.filter(s=>s.userId!==id);
  data.audit=data.audit.filter(e=>e.user!==id);
  audit('admin permanent delete',null);save();
 }
 function pruneArchives(){
  const users=new Set(data.users.map(u=>u.id));
  const archives=data.archives.filter(a=>a.participants.some(p=>users.has(p.userId)));
  if(archives.length!==data.archives.length){data.archives=archives;save();}
 }
 function clearAll(){data.users=[];data.sessions=[];data.archives=[];data.audit=[];data.achievementVersion=2;save();}
 function resourceStatus(u,now=Date.now()){
  const day=new Date(now+8*3600000).toISOString().slice(0,10),r=u.resourceRefresh||{};
  return {userId:u.id,day,timezone:'Asia/Shanghai',dailyAvailable:r.usedDay!==day,extraAvailable:r.extraDay===day&&r.extra===true,lastAt:r.lastAt||null,job:r.job?.day===day?r.job:null};
 }
 function grantResources(id,now=Date.now()){
  const u=data.users.find(u=>u.id===id&&!u.disabled);if(!u)throw Error('账户不存在或已注销');
  const status=resourceStatus(u,now);if(status.extraAvailable)throw Error('该账户已有一次未使用的临时额度');
  u.resourceRefresh={...u.resourceRefresh,extraDay:status.day,extra:true};
  audit('admin resource refresh grant',u.id);save();return resourceStatus(u,now);
 }
 function consumeResources(u,resumeId,now=Date.now()){
  const status=resourceStatus(u,now);
  if(resumeId){if(status.job?.id!==resumeId)throw Error('资源获取任务已过期，请重新申请');return {...status,resumed:true};}
  if(!status.dailyAvailable&&!status.extraAvailable)throw Error('今日重新获取次数已用完，请联系后台管理临时授权一次');
  const r={...u.resourceRefresh,lastAt:now,job:{id:crypto.randomUUID(),day:status.day}};
  if(status.dailyAvailable)r.usedDay=status.day;else r.extra=false;
  u.resourceRefresh=r;audit('resource refresh',u.id);save();return resourceStatus(u,now);
 }
 return {data,save,flush,flushSync,get pendingWrites(){return !!writer?.pending;},register,login,session,identify,logout,profile,updateProfile,measure,archive,adminAllowed,admin,adminKey,emptyStats,changePassword,resetPassword,migrateAchievements,eraseUser,clearAll,pruneArchives,resourceStatus,grantResources,consumeResources};
}
module.exports={createAccounts,titles};
