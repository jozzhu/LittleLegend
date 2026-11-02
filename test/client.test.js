// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('desktop layout fixes all three columns and discards manual resize restoration',()=>{
 const dir=path.join(__dirname,'../public'),html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),css=fs.readFileSync(path.join(dir,'desktop-layout.css'),'utf8'),app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
 assert(html.includes('href="/desktop-layout.css"'));assert(html.includes('id="sidebar-resize" hidden aria-hidden="true"'));assert(css.includes('minmax(0,3.6fr)'));assert(css.includes('#room{height:auto;'));assert(css.includes('resize:none'));assert(css.includes('repeat(2,minmax(0,1fr))'));assert(css.includes('[data-count="1"]'));assert(css.includes('max-width:720px'));assert(!css.includes('overflow-y:hidden'));assert(!app.includes('xcs-module-sizes'));assert(!app.includes('xcs-sidebar'));assert(!app.includes('setPointerCapture'));
});
test('client static selectors resolve to page elements or known dynamic elements',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'duplicate page ids');
  const dynamic=new Set(['notice-gallery','ack-notice','card-actions','save-settings','pause-button','back-seat','setting-count','setting-ex','rule-hero','rule-empty','discard-gallery','choice-preview-back','choice-preview-confirm','choice-preview-title','choice-preview-context','choice-preview-detail']);
  for(const [,id] of js.matchAll(/\$\('#([\w-]+)'\)/g))assert(ids.includes(id)||dynamic.has(id),`missing element ${id}`);
  assert(!html.includes('fonts.googleapis.com'));assert(!html.includes('style.css"'));
});
test('all six supplied artwork assets are referenced and retain their original bytes',()=>{
 const publicDir=path.join(__dirname,'../public'),css=fs.readFileSync(path.join(publicDir,'artwork.css'),'utf8'),html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');assert(html.includes('href="/artwork.css"'));
 const files=['battlefield_2560x1440.png','cardback_royal.png','cardback_monster.png','wood_table_texture.png','emblem_royal_sword.png','emblem_monster_spiral.png'];
 for(const file of files){assert(css.includes('/assets/'+file),file+' missing reference');const served=fs.readFileSync(path.join(publicDir,'assets',file)),original=fs.readFileSync(path.join(__dirname,'../assets',file));assert(served.equals(original),file+' changed');assert(served.subarray(1,4).toString()==='PNG'||served.subarray(0,3).toString('hex')==='ffd8ff',file+' unsupported image');}
 assert(css.includes('prefers-reduced-motion'));assert(css.includes('@media(max-width:720px)'));
});
