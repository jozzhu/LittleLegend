// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const g=require('../game'),DeckPresets=require('../public/deck-presets');
function fixture(settings=g.defaults()){
 const controls=[],toasts=[],commands=[];
 const make=(id='',dataset={},value='',checked=false)=>{const node={id,dataset,value:String(value),checked,disabled:false,events:{},validity:{badInput:false},textContent:'',addEventListener(type,fn){this.events[type]=fn;},closest(){return details;},focus(){this.focused=true;}};controls.push(node);return node;};
 const details={open:false},dialog={open:true,close(){this.open=false;}};
 const dataKey=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 function matches(el,selector){
  if(selector.startsWith('#'))return el.id===selector.slice(1);
  const match=selector.match(/^(input)?\[data-([\w-]+)(?:="([^"]*)")?\](:checked)?$/);
  return !!match&&Object.hasOwn(el.dataset,dataKey(match[2]))&&(match[3]===undefined||el.dataset[dataKey(match[2])]===match[3])&&(!match[4]||el.checked);
 }
 const root={querySelectorAll:s=>controls.filter(el=>s.split(',').some(part=>matches(el,part))),querySelector(s){return this.querySelectorAll(s)[0];}};
 make('setting-count',{},settings.maxPlayers);make('setting-ex',{},'',settings.expansions);
 make('',{enableAll:'roles'});make('',{enableAll:'extras'});
 g.groups.forEach((pair,i)=>{make('',{role:String(i)},settings.roles[i]);make('',{groupEnabled:String(i)},'',!(settings.disabledGroups||[]).includes(i));make('',{both:String(i)},'',settings.bothRoles.includes(i));});
 g.extras.forEach(id=>make('',{extra:String(id)},'',settings.extraIds.includes(id)));
 g.catalog.forEach(c=>{make('',{cardCount:String(c.id)},settings.counts[c.id]??'');make('',{presetFor:String(c.id)});});
 make('',{deckTotal:''});make('rule-hero',{},'',settings.rules.heroFamily);make('rule-empty',{},'',settings.rules.emptyFighter);make('save-settings');
 const context=vm.createContext({DeckPresets,meta:{cards:g.catalog,groups:g.groups,extras:g.extras,specials:g.specials},settingsForm:null,showSettings:null,
  $:s=>s==='#settings-content'?root:s==='#settings-dialog'?dialog:{},
  cmd:async(type,body)=>{commands.push({type,...JSON.parse(JSON.stringify(body))});return true;},toast:text=>toasts.push(text)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/room-settings.js'),'utf8'),context);
 context.inputSettings=settings;vm.runInContext('bindRoomSettings(inputSettings)',context);
 return {root,context,commands,toasts,dialog,details,find:s=>root.querySelector(s),
  change(selector,values){const el=root.querySelector(selector);Object.assign(el,values);el.events.change?.({target:el});},
  input(id,value){const el=root.querySelector(`[data-card-count="${id}"]`);el.value=String(value);el.events.input?.({target:el});},
  save:()=>root.querySelector('#save-settings').events.click()};
}
test('unchanged room settings save with empty overrides, close the dialog, and ignore table data-count attributes',async()=>{
 const h=fixture();await h.save();
 assert.equal(h.commands.length,1);assert.deepEqual(h.commands[0].settings.counts,{});assert.equal(h.dialog.open,false);
 const saved=g.createRoom('甲',h.commands[0].settings);assert.deepEqual(g.composition(saved.settings),g.composition(g.defaults()));
 assert(h.toasts[0].includes('已保存'));
 const source=fs.readFileSync(path.join(__dirname,'../public/room-settings.js'),'utf8');
 assert(!source.includes("$$('[data-count]')"));assert(source.includes("root.querySelectorAll"));
});
test('presets track replacements, enable switches and expansions; unaffected custom counts survive',async()=>{
 const h=fixture();assert.equal(h.find('[data-card-count="18"]').placeholder,'4');assert(h.find('[data-card-count="9"]').disabled);
 h.input(19,7);h.input(18,8);
 h.change('[data-role="0"]',{value:'9'});
 assert(h.find('[data-card-count="18"]').disabled);assert.equal(h.find('[data-card-count="9"]').placeholder,'4');
 assert.equal(h.find('[data-card-count="19"]').value,'7');
 h.change('[data-both="0"]',{checked:true});assert(!h.find('[data-card-count="18"]').disabled);assert.equal(h.find('[data-card-count="18"]').value,'');
 h.input(18,0);await h.save();assert.equal(h.commands[0].settings.counts[18],0);assert.equal(h.commands[0].settings.counts[19],7);
 h.change('[data-group-enabled="0"]',{checked:false});assert(h.find('[data-card-count="9"]').disabled);
 h.change('[data-group-enabled="0"]',{checked:true});assert.equal(h.find('[data-card-count="18"]').value,'');
 h.change('[data-extra="4"]',{checked:true});assert(h.find('#setting-ex').checked);assert.equal(h.find('[data-card-count="4"]').placeholder,'1');assert(!h.find('[data-card-count="4"]').disabled);
 h.input(4,5);h.change('#setting-ex',{checked:false});assert(h.find('[data-card-count="4"]').disabled);assert.equal(h.find('[data-card-count="4"]').value,'');
 h.change('#setting-ex',{checked:true});assert.equal(h.find('[data-card-count="4"]').placeholder,'1');
});
test('separate enable-all controls include both replacements and all EX cards, with final custom counts authoritative',async()=>{
 const h=fixture();h.change('[data-enable-all="roles"]',{checked:true});h.change('[data-enable-all="extras"]',{checked:true});h.input(18,12);
 await h.save();const s=h.commands[0].settings,counts=g.composition(g.createRoom('甲',s).settings);
 assert.equal(s.bothRoles.length,10);assert.equal(s.extraIds.length,8);assert(s.expansions);assert.equal(counts[18],12);
 for(const pair of g.groups)for(const id of pair)assert.equal(counts[id],id===18?12:4);
 for(const id of g.extras)assert.equal(counts[id],1);
 h.change('[data-enable-all="roles"]',{checked:false});assert.equal(h.find('[data-enable-all="extras"]').checked,true);
 await h.save();assert.equal(h.commands[1].settings.disabledGroups.length,10);
});
test('invalid custom counts keep settings open, focus the field and show a specific error without submitting',async()=>{
 for(const value of ['13','-1','1.5']){
  const h=fixture();h.input(18,value);await h.save();
  assert.equal(h.commands.length,0);assert(h.dialog.open);assert(h.details.open);assert(h.find('[data-card-count="18"]').focused);assert(h.toasts[0].includes('铁匠'));
 }
});
