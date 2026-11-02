// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const fs=require('node:fs'),path=require('node:path');
function publishWave(input){
 const output=Buffer.from(input);
 if(output.toString('ascii',0,4)!=='RIFF'||output.toString('ascii',8,12)!=='WAVE')throw Error('Expected RIFF/WAVE audio');
 // Streaming encoders leave unknown lengths; repair headers without re-encoding PCM.
 output.writeUInt32LE(output.length-8,4);
 let found=false;
 for(let offset=12;offset+8<=output.length;){
  const type=output.toString('ascii',offset,offset+4),length=output.readUInt32LE(offset+4);
  if(type==='data'){
   if(length===0xffffffff)output.writeUInt32LE(output.length-offset-8,offset+4);
   else if(length>output.length-offset-8)throw Error('Truncated WAVE audio');
   found=true;break;
  }
  if(length>output.length-offset-8)throw Error('Invalid WAVE chunk');
  offset+=8+length+(length%2);
 }
 if(!found)throw Error('WAVE data chunk missing');
 return output;
}
function prepare(root=path.resolve(__dirname,'..')){
 const source=path.join(root,'assets/audio'),destination=path.join(root,'public/assets/audio');
 let count=0;
 for(const kind of ['bgm','sfx']){
  fs.mkdirSync(path.join(destination,kind),{recursive:true});
  for(const file of fs.readdirSync(path.join(source,kind))){
   if(!/\.(mp3|wav)$/i.test(file))continue;
   const input=fs.readFileSync(path.join(source,kind,file));
   fs.writeFileSync(path.join(destination,kind,file),file.endsWith('.wav')?publishWave(input):input);count++;
  }
 }
 console.log(`Published ${count} audio assets (WAVE lengths normalized, original PCM preserved).`);
}
module.exports={publishWave,prepare};
if(require.main===module)prepare();
