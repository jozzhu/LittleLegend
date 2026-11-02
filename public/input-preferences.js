// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

function protectInputs(root=document){
 for(const input of [...(root.matches?.('input,textarea,form')?[root]:[]),...root.querySelectorAll('input,textarea,form')]){
  if(input.tagName==='FORM'){input.autocomplete='off';continue;}
  const accountField=input.type==='password'||input.autocomplete==='username'||input.autocomplete==='current-password'||input.autocomplete==='new-password';
  if(accountField)continue;
  input.autocomplete='off';input.setAttribute('autocorrect','off');input.setAttribute('autocapitalize','off');input.spellcheck=false;
 }
}
protectInputs();
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)protectInputs(node);}).observe(document.body,{childList:true,subtree:true});
