// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

(function(){
 const button=document.createElement('button');button.id='request-undo';button.textContent='申请回退';button.title='申请撤销上一步游戏操作';
 document.querySelector('.room-toolbar').append(button);
 const dialog=document.createElement('dialog');dialog.id='undo-dialog';
 dialog.innerHTML='<div class="dialog-head"><h2>回退申请</h2></div><p id="undo-description"></p><p id="undo-progress" class="muted"></p><div class="row"><button id="undo-approve" class="primary">同意回退</button><button id="undo-reject">拒绝回退</button><button id="undo-cancel">撤销申请</button></div>';
 document.body.append(dialog);
 const approve=dialog.querySelector('#undo-approve'),reject=dialog.querySelector('#undo-reject'),cancel=dialog.querySelector('#undo-cancel');
 let requestId=null;
 button.onclick=async()=>{const message='申请撤销上一步游戏操作？已经看到的牌面无法抹去，需要其他所有参赛者同意。';if(await (typeof confirmTable==='function'?confirmTable(message):confirm(message)))cmd('undoRequest');};
 approve.onclick=()=>cmd('undoVote',{requestId,approve:true});reject.onclick=()=>cmd('undoVote',{requestId,approve:false});
 cancel.onclick=()=>cmd('undoCancel',{requestId});
 dialog.addEventListener('cancel',event=>event.preventDefault());
 const previousRender=render;
 render=function(){
  previousRender();
  const s=current();if(!s)return;
  button.hidden=!!replay||!['initial','playing'].includes(s.phase);
  button.disabled=!s.canUndo;
  const request=!replay&&s.undoRequest;requestId=request?.id;
  if(!request){if(dialog.open)dialog.close();return;}
  const name=id=>s.players.find(p=>p.id===id)?.name||'玩家';
  dialog.querySelector('#undo-description').textContent=`${name(request.playerId)} 申请撤销上一步游戏操作，对局等待投票。`;
  dialog.querySelector('#undo-progress').textContent='等待：'+request.voters.filter(id=>!request.approved.includes(id)).map(name).join('、');
  const canVote=request.voters.includes(seat.playerId)&&!request.approved.includes(seat.playerId);
  approve.hidden=reject.hidden=!canVote;
  cancel.hidden=request.playerId!==seat.playerId;
  if(!dialog.open)openDialog(dialog);
 };
})();
