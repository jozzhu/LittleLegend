// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

/* Account presence is independent from membership in a room. */
let presencePending=false;
async function sendPresence(){
 if(presencePending||!account||document.visibilityState==='hidden')return;
 presencePending=true;
 try{await request('/api/heartbeat',{});}catch{}finally{presencePending=false;}
}
setInterval(sendPresence,10000);
document.addEventListener('visibilitychange',sendPresence);
