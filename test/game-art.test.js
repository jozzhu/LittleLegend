// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('supplied interface artwork is published unchanged and artwork scripts are loaded last',()=>{
 let count=0;
 function check(dir){for(const entry of fs.readdirSync(path.join(root,'assets',dir),{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())check(file);else{assert(fs.readFileSync(path.join(root,'assets',file)).equals(fs.readFileSync(path.join(root,'public/assets',file))),file);count++;}}}
 for(const dir of ['ui','effects','profiles'])check(dir);assert.equal(count,57);
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');assert(html.includes('href="/game-art.css"'));assert(html.indexOf('src="/game-art.js"')>html.indexOf('src="/customization.js"'));
 const code=fs.readFileSync(path.join(root,'public/game-art.js'),'utf8');new vm.Script(code);
 const css=fs.readFileSync(path.join(root,'public/game-art.css'),'utf8');for(const [,url]of css.matchAll(/url\('([^']+)'\)/g))assert(fs.existsSync(path.join(root,'public',url)),url);assert(css.includes('animation:none!important'));
});
test('achievement artwork preserves saved title identifiers and corrects the displayed name',()=>{
 const {titles}=require('../accounts');assert.equal(titles.find(t=>t.id==='never-return').name,'绝不还手之人');
 const code=fs.readFileSync(path.join(root,'public/game-art.js'),'utf8');const context=vm.createContext({playerBlock(){},render(){},showCard(){},showProfile(){},loadAccount(){}});vm.runInContext(code,context);
 for(const title of titles){const file=vm.runInContext(`achievementArt[${JSON.stringify(title.id)}]`,context);assert(fs.existsSync(path.join(root,'public/assets/ui/achievements',file+'.png')));}
});
test('artwork render keeps action counts and delegates gameplay without effect state',()=>{
 const elements=new Map();function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',hidden:true,dataset:{},querySelector(){return null;},insertAdjacentHTML(){}});return elements.get(key);}
 const state={code:'TEST',players:[{id:'p'}],events:[{id:'one'}],phase:'playing',actions:1};let renders=0;
 const context=vm.createContext({document:{querySelectorAll:()=>[]},$ :element,current:()=>state,render:()=>renders++,playerBlock(){},showCard(){},showProfile(){},loadAccount:async()=>{},esc:String,replay:null});
 vm.runInContext(fs.readFileSync(path.join(root,'public/game-art.js'),'utf8'),context);vm.runInContext('render()',context);assert.equal(renders,1);assert(element('#actions-label').innerHTML.includes('行动点 1 / 2'));assert(element('#actions-label').innerHTML.includes('action_point_dark'));
 context.replay={};state.events.push({id:'two',type:'responseResult',success:true,actor:'p'});vm.runInContext('render()',context);assert.equal(renders,2);
});
test('legacy avatar frames, selection overlays and bitmap animation producers remain disabled',()=>{
 const code=fs.readFileSync(path.join(root,'public/game-art.js'),'utf8'),app=fs.readFileSync(path.join(root,'public/app.js'),'utf8'),css=fs.readFileSync(path.join(root,'public/game-art.css'),'utf8');
 for(const text of ['dataset.frame','playArtEffect','preloadEffect','card-art-preview','/assets/effects/'])assert(!code.includes(text),text);
 assert(!app.includes('animateEvent'));assert(!css.includes('/assets/ui/frames/'));assert(!css.includes('@keyframes'));assert(css.includes('transition:none!important'));assert(css.includes('#effect-layer,.floating-event,.art-effect{display:none!important}'));assert(css.includes('.avatar::after,.card-art-preview::after{content:none!important;display:none!important}'));
});
