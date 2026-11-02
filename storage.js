// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs=require('node:fs');

// Serialize writes per file. A successful flush means the latest queued state was renamed into place.
function createJsonWriter(file){
 let dirty=false,running=null,error=null,latest,writes=0;
 function pump(){
  if(running)return running;
  running=(async()=>{
   while(dirty){
    dirty=false;
    const text=JSON.stringify(typeof latest==='function'?latest():latest);
    await fs.promises.writeFile(file+'.tmp',text);
    await fs.promises.rename(file+'.tmp',file);
    writes++;
   }
  })().catch(e=>{error=e;throw e;}).finally(()=>{running=null;});
  return running;
 }
 return {
  save(value){latest=value;dirty=true;error=null;},
  async flush(){if(error)throw error;while(dirty||running)await pump();},
  flushSync(){if(running)throw Error('Cannot synchronously flush an active writer');if(dirty){fs.writeFileSync(file+'.tmp',JSON.stringify(typeof latest==='function'?latest():latest));fs.renameSync(file+'.tmp',file);dirty=false;error=null;writes++;}},
  get pending(){return dirty||!!running;},
  get writes(){return writes;}
 };
}
function draftRoom(room){
 const {frames=[],replays=[],undoStack=[],...live}=room;
 return {...structuredClone(live),frames:[...frames],replays:[...replays],undoStack:[...undoStack]};
}
module.exports={createJsonWriter,draftRoom};
