// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const path=require('node:path'),fs=require('node:fs');
const {parsePort,acquireStoreLock,listen}=require('./host-runtime');
async function run(){
 const port=parsePort(process.env.PORT),dataDir=path.resolve(process.env.XCS_DATA_DIR||path.join(__dirname,'data'));
 const unlock=acquireStoreLock(dataDir);process.once('exit',unlock);
 const server=require('./server').createServer();
 try{const info=await listen(server,port);const status={type:'started',pid:process.pid,...info,dataDir};console.log(JSON.stringify(status));if(process.env.XCS_HOST_STATUS){fs.writeFileSync(process.env.XCS_HOST_STATUS+'.tmp',JSON.stringify(status));fs.renameSync(process.env.XCS_HOST_STATUS+'.tmp',process.env.XCS_HOST_STATUS);}}
 catch(e){throw Error(e.code==='EADDRINUSE'?'该端口已占用，请改用自动分配或选择其他端口':e.message);}
 let stopping=false;
 async function stop(){if(stopping)return;stopping=true;try{await server.flush();}catch(e){console.error('保存失败：'+e.message);process.exitCode=1;}server.closeRealtime();const timeout=setTimeout(()=>{server.closeAllConnections();process.exit(process.exitCode||0);},2500);timeout.unref();server.close(()=>process.exit(process.exitCode||0));server.closeIdleConnections();}
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 if(process.env.XCS_STOP_FILE){const timer=setInterval(()=>{if(fs.existsSync(process.env.XCS_STOP_FILE)){fs.unlinkSync(process.env.XCS_STOP_FILE);clearInterval(timer);stop();}},250);timer.unref();}
 if(process.env.XCS_HOST_UI==='1'){const readline=require('node:readline');const input=readline.createInterface({input:process.stdin});input.on('line',line=>{if(line==='stop')stop();});input.on('close',stop);}
 return server;
}
if(require.main===module)run().catch(e=>{const status={type:'error',message:e.message};console.error(JSON.stringify(status));if(process.env.XCS_HOST_STATUS)try{fs.writeFileSync(process.env.XCS_HOST_STATUS,JSON.stringify(status));}catch{}process.exit(1);});
module.exports={run};
