// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
function parsePort(value){if(value===undefined||value===null||value==='')return 0;const text=String(value);if(!/^\d+$/.test(text))throw Error('端口必须是 1–65535 的整数，留空自动分配');const port=Number(text);if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('端口超出范围');return port;}
function acquireStoreLock(dir){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'host.lock'),token=crypto.randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});return ()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}};}
  catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('存档锁无法读取，请确认其他服务已停止后检查 host.lock');}if(!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('存档锁无效，请先确认其他服务已停止');try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH'){fs.unlinkSync(file);continue;}throw Error('无法确认已有服务状态，请勿重复打开同一存档');}throw Error('这份存档已有服务正在运行，请先关闭原服务');}
 }
 throw Error('无法取得存档锁，请重试');
}
function networkInfo(port,interfaces){
 if(!interfaces)try{interfaces=os.networkInterfaces();}catch{interfaces={};}
 const addresses=[...new Set(Object.values(interfaces).flat().filter(info=>info&&!info.internal&&(info.family==='IPv4'||info.family===4)).map(info=>info.address))];
 return {port,localUrl:`http://localhost:${port}`,adminUrl:`http://localhost:${port}/admin.html`,lanUrls:addresses.map(ip=>`http://${ip}:${port}`),tunnelTarget:`127.0.0.1:${port}`};
}
function listen(server,port){return new Promise((resolve,reject)=>{function error(e){server.off('listening',ready);reject(e);}function ready(){server.off('error',error);resolve(networkInfo(server.address().port));}server.once('error',error);server.once('listening',ready);server.listen(parsePort(port),'0.0.0.0');});}
module.exports={parsePort,acquireStoreLock,networkInfo,listen};
