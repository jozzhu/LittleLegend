// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

/* Supplied bitmap artwork; cosmetic only, never changes game state. */
const achievementArt={wanderer:'ach_newcomer','never-return':'ach_hold',berserker:'ach_berserk',robber:'ach_robber',tragic:'ach_crash',responder:'ach_block',wealth:'ach_rich',royal:'ach_court',monster:'ach_friend'};
function artImage(path,className='',alt=''){return `<img class="${className}" src="/assets/${path}.png" alt="${esc(alt)}" draggable="false">`;}
function decorateTitles(root=document){for(const badge of root.querySelectorAll('.title-badge')){if(badge.dataset.artReady)continue;const title=Object.entries(achievementArt).find(([id])=>({wanderer:'初来乍到','never-return':'绝不还手之人',berserker:'战斗狂',robber:'强盗',tragic:'惨！！',responder:'休想得逞',wealth:'富可敌国',royal:'王国座上宾',monster:'魔物的挚友'})[id]===badge.textContent.trim());if(title){badge.insertAdjacentHTML('afterbegin',artImage('ui/achievements/'+title[1],'achievement-icon'));badge.dataset.artReady='true';}}}
function decoratePlayer(el,p,s){
 el.dataset.playerId=p.id;
 const coins=el.querySelector('.coins');if(coins)coins.innerHTML=artImage('ui/coin_front','coin-icon')+` ${p.coins}<small>/ 5</small>`;
 const status=p.status==='surrendered'?'concede':p.status==='away'?'away':p.ready?'ready':null;
 const label=el.querySelector('header small')||el.querySelector('small');if(label&&status)label.insertAdjacentHTML('afterbegin',artImage('ui/state_'+status,'state-icon'));
 if(s.phase==='finished'||p.status==='surrendered'){const won=s.phase==='finished'&&s.winners.includes(p.id),header=el.querySelector('header');if(header)header.insertAdjacentHTML('beforeend',artImage('ui/result_'+(won?'win':'lose'),'result-icon',won?'胜利':'落败'));}
}
const playerBlockBeforeArt=playerBlock;playerBlock=function(p,s){const el=playerBlockBeforeArt(p,s);decoratePlayer(el,p,s);return el;};
const renderBeforeArt=render;render=function(){
 renderBeforeArt();const s=current();if(!s)return;
 const actions=$('#actions-label');if(s.phase==='playing'){actions.innerHTML=`<span>行动点 ${s.actions} / 2</span><span class="action-gems" aria-hidden="true">${[0,1].map(i=>artImage('ui/action_point_'+(i<s.actions?'light':'dark'))).join('')}</span>`;}
 document.querySelectorAll('.dice-face').forEach((el,i)=>{const value=s.players[i]?.roll?.value||1;el.innerHTML=artImage('ui/dice_'+value,'dice-art',String(value)+'点');});
 document.querySelectorAll('.waiting-player').forEach((el,i)=>{if(s.players[i])decoratePlayer(el,s.players[i],s);});
 const pause=$('#paused-banner');if(!pause.hidden&&!pause.querySelector('.state-icon'))pause.insertAdjacentHTML('afterbegin',artImage('ui/state_pause','state-icon'));
 decorateTitles();
};
const loadAccountBeforeArt=loadAccount;loadAccount=async function(data){await loadAccountBeforeArt(data);decorateTitles();};
let artProfileRequest=0;
const showProfileBeforeArt=showProfile;showProfile=async function(id){const requestId=++artProfileRequest;await showProfileBeforeArt(id);if(requestId!==artProfileRequest||!$('#profile-dialog').open)return;const banner=$('#profile-content .profile-banner');if(!banner)return;try{const profile=await request('/api/profile?id='+encodeURIComponent(id));if(requestId!==artProfileRequest||!$('#profile-dialog').open||!banner.isConnected)return;const faction=profile.favoriteFaction==='皇室'?'royal':profile.favoriteFaction==='魔物'?'monster':'neutral';banner.dataset.faction=faction;decorateTitles(banner.parentElement);}catch(e){if(requestId===artProfileRequest)toast(e.message);}};
