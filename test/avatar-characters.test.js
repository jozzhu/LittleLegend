// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const characters=require('../public/avatar-characters');
test('ICU-independent avatar ranges preserve letter, number and symbol categories for every code point',()=>{
 const original=/^[\p{L}\p{N}\p{So}]$/u;
 for(let point=0;point<=0x10ffff;point++){
  const text=String.fromCodePoint(point);
  if(characters.test(text)!==original.test(text))assert.fail('Unicode category mismatch at '+point.toString(16));
 }
});
test('browser avatar validation loads its ICU-independent dependency before use',()=>{
 const context=vm.createContext({});
 for(const file of ['avatar-characters.js','avatars.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),context);
 for(const text of ['战','A','7','😀'])assert.equal(vm.runInContext(`Avatars.normalize({mode:'text',text:${JSON.stringify(text)},color:'#943b3b'}).text`,context),text);
 for(const text of ['<','\u200b','\ud800','两个'])assert.throws(()=>vm.runInContext(`Avatars.normalize({mode:'text',text:${JSON.stringify(text)},color:'#943b3b'})`,context));
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert(html.indexOf('src="/avatar-characters.js"')<html.indexOf('src="/avatars.js"'));
 assert(!fs.readFileSync(path.join(__dirname,'../public/avatars.js'),'utf8').includes('\\p{'));
});
