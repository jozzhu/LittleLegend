// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const g=require('../game');
test('40 complete automated rule simulations preserve card identity and do not deadlock',()=>{
  for(let match=0;match<40;match++){
    const n=2+match%4,settings={...g.defaults(n),expansions:true,extraIds:g.extras,roles:g.groups.map((pair,i)=>pair[(match+i)%2])};
    const r=g.createRoom('甲',settings);while(r.players.length<n)g.join(r,'玩家'+r.players.length);
    r.players.slice(1).forEach(p=>g.command(r,p.id,{type:'ready'}));g.command(r,r.hostId,{type:'start'});
    for(let i=0;i<n;i++)g.command(r,r.seatOrder[r.seatCursor],{type:'seat',seat:i});
    let moves=0;
    while(r.phase!=='finished'&&moves++<1500){
      if(r.pending){let opt=r.pending.options[(moves+match)%r.pending.options.length];if(moves%3===0)opt=r.pending.options.find(o=>o.value==='pass')||opt;g.command(r,r.pending.playerId,{type:'choice',promptId:r.pending.id,key:opt.key});}
      else{const p=r.players.find(p=>p.id===r.currentId),v=g.view(r,p.id);if(r.phase==='initial'){g.command(r,p.id,{type:'draw',source:r.decks.royal.length?'royal':'monster'});}
        else if(r.actions===0&&p.hand.length>4){g.command(r,p.id,{type:'discard',uid:p.hand[0].uid});}
        else if(r.actions>0){const usable=p.hand.filter(c=>v.legalHand.includes(c.uid));if(usable.length&&moves%3!==0){g.command(r,p.id,{type:'play',uid:usable[(moves+match)%usable.length].uid});}else g.command(r,p.id,{type:'draw',source:r.decks.royal.length&&(moves%2||!r.decks.monster.length)?'royal':'monster'});}
        else g.command(r,p.id,{type:'end'});
      }
      // Pending effects can hold a card outside zones until their after-play task.
      const cards=[...Object.values(r.decks).flat(),...r.tavern,...Object.values(r.discard).flat(),...r.players.flatMap(p=>[...p.hand,...p.board])];
      assert.equal(new Set(cards.map(c=>c.uid)).size,cards.length,`duplicate card in simulation ${match} at ${moves}`);
      assert(r.actions>=0&&r.actions<=2);assert(r.players.every(p=>p.coins>=0));
    }
    assert.equal(r.phase,'finished',`simulation ${match} did not finish`);
  }
});
