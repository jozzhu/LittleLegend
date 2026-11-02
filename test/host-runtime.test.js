// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parsePort,acquireStoreLock,networkInfo,listen}=require('../host-runtime');
test('host ports accept automatic assignment and reject malformed or out-of-range values',()=>{
 for(const value of ['',undefined,'0',0])assert.equal(parsePort(value),0);assert.equal(parsePort('4174'),4174);assert.equal(parsePort(65535),65535);
 for(const value of ['abc','-1','1.2','65536',' 80 ',true])assert.throws(()=>parsePort(value));
});
test('OS binds a free port atomically and occupied requested ports fail without replacement',async()=>{
 const first=http.createServer((req,res)=>res.end('ok')),second=http.createServer();
 try{const info=await listen(first,0);assert(info.port>0);assert.equal(info.tunnelTarget,'127.0.0.1:'+info.port);assert.equal((await fetch(info.localUrl)).status,200);await assert.rejects(listen(second,info.port),{code:'EADDRINUSE'});}
 finally{first.closeAllConnections();await new Promise(resolve=>first.close(resolve));}
});
test('LAN addresses exclude loopback and deduplicate adapters',()=>{
 const info=networkInfo(5000,{a:[{address:'127.0.0.1',family:'IPv4',internal:true},{address:'192.168.1.8',family:'IPv4',internal:false}],b:[{address:'192.168.1.8',family:'IPv4',internal:false},{address:'::1',family:'IPv6',internal:true}]});assert.deepEqual(info.lanUrls,['http://192.168.1.8:5000']);
});
test('store locks reject duplicate servers and release only the owned lock',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legend-host-lock-'));try{const unlock=acquireStoreLock(dir);assert.throws(()=>acquireStoreLock(dir),/正在运行/);unlock();const next=acquireStoreLock(dir);unlock();assert(fs.existsSync(path.join(dir,'host.lock')));next();assert(!fs.existsSync(path.join(dir,'host.lock')));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('mobile landscape styling is opt-in for touch landscape and keeps desktop layout intact',()=>{
 const root=path.join(__dirname,'../public'),css=fs.readFileSync(path.join(root,'mobile-landscape.css'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(css.includes('(pointer:coarse) and (orientation:landscape)'));assert(css.includes('(orientation:portrait)'));assert(!css.includes('rotate('));assert(html.includes('href="/mobile-landscape.css"'));assert(html.includes('src="/mobile-landscape.js"'));
});
