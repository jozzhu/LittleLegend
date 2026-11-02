// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('avatar validation permits only known presets and single character with hex color',()=>{const a=require('../public/avatars');assert.equal(a.names.length,37);assert.deepEqual(a.normalize({mode:'text',text:'王',color:'#943b3b'}),{mode:'text',text:'王',color:'#943b3b'});assert.throws(()=>a.normalize({mode:'text',text:'两个',color:'#943b3b'}));assert.throws(()=>a.normalize({mode:'text',text:'<',color:'red'}));assert.throws(()=>a.normalize({mode:'preset',preset:'../../admin.key'}));assert.equal(a.html(null,'小明'),'小');for(const preset of a.names)assert(fs.existsSync(path.join(__dirname,'../public/assets/avatars',preset+'.png')));});
test('password recovery revokes sessions, preserves records and never stores temporary plaintext',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-password-'));
 try{const a=require('../accounts').createAccounts(dir),u=a.register({username:'tester',password:'original-password'});u.stats.wins=3;const token=a.session(u),req={headers:{cookie:'xcs_session='+token}};assert.equal(a.identify(req).id,u.id);
  assert.throws(()=>a.changePassword(u,{currentPassword:'incorrect',newPassword:'new-password'}));assert(a.identify(req));
  const reset=a.resetPassword(u.id);assert.equal(a.identify(req),null);assert.throws(()=>a.login({username:'tester',password:'original-password'}));assert.equal(a.login({username:'tester',password:reset.temporaryPassword}).id,u.id);assert(u.mustChangePassword);assert.equal(u.stats.wins,3);assert(!fs.readFileSync(path.join(dir,'accounts.json'),'utf8').includes(reset.temporaryPassword));
  assert.throws(()=>a.changePassword(u,{currentPassword:reset.temporaryPassword,newPassword:'short'}));assert(u.mustChangePassword);
  a.changePassword(u,{currentPassword:reset.temporaryPassword,newPassword:'personal-password'});assert.equal(u.mustChangePassword,false);assert.throws(()=>a.login({username:'tester',password:reset.temporaryPassword}));assert.equal(a.login({username:'tester',password:'personal-password'}).id,u.id);assert.equal(u.stats.wins,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('account validation, earned title authorization and atomic admin changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-accounts-'));
 try{const a=require('../accounts').createAccounts(dir),u=a.register({username:'tester',password:'long-password'});
  assert.throws(()=>a.register({username:'tester',password:'long-password'}));assert.throws(()=>a.login({username:'tester',password:'wrong-password'}));
  assert.throws(()=>a.updateProfile(u,{nickname:'changed',equipped:'berserker'}));assert.equal(u.nickname,'tester');
  assert.throws(()=>a.admin({id:u.id,disabled:true,nickname:'changed',stats:{wins:-1}}));assert.equal(u.disabled,false);assert.equal(u.nickname,'tester');
  assert.throws(()=>a.updateProfile(u,{showcase:['wanderer','wanderer']}));
  u.stats.games=3;u.stats.returns=1;u.stats.attacks=15;u.matches=[{responses:3},{responses:3},{responses:4}];assert(a.profile(u).titles.some(t=>t.id==='berserker'));
  a.updateProfile(u,{equipped:'berserker',showcase:['wanderer','berserker','never-return']});assert.equal(a.profile(u).showcase.length,3);
  a.updateProfile(u,{avatar:{mode:'text',text:'战',color:'#943b3b'}});const reloaded=require('../accounts').createAccounts(dir);assert.equal(reloaded.profile(reloaded.data.users.find(p=>p.id===u.id)).avatar.text,'战');assert.throws(()=>a.updateProfile(u,{nickname:'wrong',avatar:{mode:'preset',preset:'bad'}}));assert.equal(u.nickname,'tester');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('statistics count completed response choices and preparation without counting reconnection as card return',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-metrics-'));
 try{const a=require('../accounts').createAccounts(dir),g=require('../game'),u=a.register({username:'tester',password:'long-password'}),r=g.createRoom('tester');r.players[0].userId=u.id;const p=r.players[0];const before=structuredClone(r);
  r.events.push({type:'coin',actor:p.id,delta:2},{type:'prepare',actor:p.id,count:3},{type:'return',actor:p.id},{type:'responseChoice',actor:p.id,accepted:true},{type:'responseChoice',actor:p.id,accepted:false});p.hand=[g.card(18),g.card(22)];a.measure(r,before);
  assert.equal(u.stats.coinsEarned,2);assert.equal(u.stats.returns,3);assert.equal(u.stats.responses,1);assert.equal(u.stats.responseOffers,2);assert.equal(a.profile(u).responseRate,50);assert.equal(u.stats.royalCards,1);assert.equal(u.stats.monsterCards,1);
  a.measure(structuredClone(r),r);assert.equal(u.stats.coinsEarned,2);assert.equal(u.stats.royalCards,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('participation totals distinguish valid and interrupted matches, remain idempotent and survive reload',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xcs-participation-'));
 try{
  const {createAccounts}=require('../accounts'),g=require('../game'),a=createAccounts(dir),u=a.register({username:'tester',password:'long-password'});
  const r=g.createRoom('tester');r.players[0].userId=u.id;
  for(const phase of ['finished','interrupted','finished']){
   const before=structuredClone(r);r.matchId=require('node:crypto').randomUUID();r.phase=phase;r.finishedAt=Date.now();r.endedAt=Date.now();r.winners=u.matches.length?[]:[r.hostId];
   a.measure(r,before);a.measure(r,before);a.measure(r,r);
  }
  const stats=a.profile(u).stats;
  assert.equal(stats.totalGames,3);assert.equal(stats.games,2);assert.equal(stats.interruptedGames,1);assert.equal(stats.wins,1);assert.equal(stats.losses,1);
  assert.equal(Math.round(stats.wins/stats.games*100),50);
  const reloaded=createAccounts(dir);assert.deepEqual(reloaded.profile(reloaded.data.users[0]).stats,stats);
  a.admin({id:u.id,stats:{games:4,interruptedGames:2}});assert.equal(a.profile(u).stats.totalGames,6);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
