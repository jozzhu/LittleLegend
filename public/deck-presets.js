// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(root){
 function presets(settings,groups,extras,specials){
  const counts={};
  groups.forEach((pair,i)=>{
   if((settings.disabledGroups||[]).includes(i))return;
   const enabled=(settings.bothRoles||[]).includes(i)?pair:[settings.roles[i]];
   enabled.forEach(id=>counts[id]=4);
  });
  counts[2]=1;counts[11]=1;
  if(settings.maxPlayers>2)specials.forEach(id=>counts[id]=1);
  if(settings.expansions)settings.extraIds.filter(id=>extras.includes(id)).forEach(id=>counts[id]=1);
  return counts;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={presets};
 else root.DeckPresets={presets};
})(globalThis);
