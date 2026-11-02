// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(root){
 const characters=typeof module!=='undefined'&&module.exports?require('./avatar-characters'):root.AvatarCharacters;
 const names=['01_king','02_gold_hero','03_princess','04_minister_EX','05_grail','06_hero_lv4','07_paladin','08_dancer','09_boxer','10_holy_sword','11_silver_hero_lv5','12_berserker','13_guard','14_stork_EX','15_merchant_EX','16_nun','17_mage','18_blacksmith','19_monk','20_slime_EX','21_bomb','22_bat','23_skeleton','24_werewolf','25_clowngirl','26_witch','27_goblin','28_minotaur','29_chest_EX','30_demon_sword_EX','31_fairy_EX','32_dragonling','33_blackknight_EX','34_demonking','35_dragonflame','36_firedragon','37_dragegg'];
 function normalize(a){if(!a||typeof a!=='object')throw Error('头像配置无效');if(a.mode==='default')return {mode:'default'};if(a.mode==='preset'&&names.includes(a.preset))return {mode:'preset',preset:a.preset};if(a.mode==='text'&&typeof a.text==='string'&&Array.from(a.text.trim()).length===1&&characters.test(a.text.trim())&&/^#[0-9a-f]{6}$/i.test(a.color))return {mode:'text',text:a.text.trim(),color:a.color};throw Error('请选择预设头像，或输入一个字与有效背景色');}
 function html(a,name){a=a||{mode:'default'};if(a.mode==='preset'&&names.includes(a.preset))return '<img src="/assets/avatars/'+a.preset+'.png" alt="" loading="lazy">';const text=a.mode==='text'?a.text:Array.from(name||'旅')[0];return String(text||'旅').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 const api={names,normalize,html};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Avatars=api;
})(globalThis);
