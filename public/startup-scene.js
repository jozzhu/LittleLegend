// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

/* The approved opening has its own clock; network readiness is managed separately. */
const StartupScene={
 create(root,onPhase=()=>{}){
  const duration=6400,animations=[],reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ended=false,frame=0,origin=0,resolveFinished,assetTimer,lastPhase;
  const finished=new Promise(resolve=>resolveFinished=resolve);
  function motion(selector,keyframes,delay,time,easing='cubic-bezier(.22,.7,.2,1)'){
   for(const el of root.querySelectorAll(selector)){
    if(typeof el.animate!=='function'){Object.assign(el.style,keyframes.at(-1));continue;}
    const animation=el.animate(keyframes,{duration:time,delay,fill:'both',easing});animation.pause();animation.currentTime=0;animations.push(animation);
   }
  }
  motion('.world',[{opacity:0,transform:'scale(1.1)'},{opacity:1,transform:'scale(1)'}],0,4200);
  motion('.shade',[{opacity:.95},{opacity:.55}],0,2600);
  motion('.travel.royal',[{opacity:0,transform:'translateX(-420px) translateY(40px) rotate(-28deg)'},{opacity:1,offset:.35,transform:'translateX(-170px) translateY(-8px) rotate(-13deg)'},{opacity:1,offset:.7,transform:'translateX(-130px) translateY(0) rotate(-8deg)'},{opacity:0,transform:'translateX(-70px) translateY(-30px) scale(.8) rotate(0deg)'}],250,1950);
  motion('.travel.monster',[{opacity:0,transform:'translateX(420px) translateY(40px) rotate(28deg)'},{opacity:1,offset:.35,transform:'translateX(170px) translateY(-8px) rotate(13deg)'},{opacity:1,offset:.7,transform:'translateX(130px) translateY(0) rotate(8deg)'},{opacity:0,transform:'translateX(70px) translateY(-30px) scale(.8) rotate(0deg)'}],450,1750);
  motion('.trail.left',[{opacity:0,transform:'scaleX(0)'},{opacity:.8,offset:.55,transform:'scaleX(1)'},{opacity:0,transform:'scaleX(1)'}],1100,1150);
  motion('.trail.right',[{opacity:0,transform:'scaleX(0)'},{opacity:.8,offset:.55,transform:'scaleX(1)'},{opacity:0,transform:'scaleX(1)'}],1200,1050);
  motion('.crosslight',[{opacity:0,transform:'scaleY(0)'},{opacity:.8,offset:.4,transform:'scaleY(1)'},{opacity:0,transform:'scaleY(1.1)'}],1800,700);
  motion('.crest.royal',[{opacity:0,transform:'translate(-38px,12px) scale(.88)'},{opacity:1,transform:'translate(0,0) scale(1)'}],1950,1000);
  motion('.crest.monster',[{opacity:0,transform:'translate(38px,12px) rotate(-18deg) scale(.88)'},{opacity:1,transform:'translate(0,0) rotate(0deg) scale(1)'}],2050,1100);
  motion('.crest-divider',[{opacity:0,transform:'rotate(17deg) scaleY(0)'},{opacity:.36,transform:'rotate(17deg) scaleY(1)'}],2600,700);
  root.querySelectorAll('.wordmark span').forEach((el,index)=>motion(`.wordmark span:nth-child(${index+1})`,[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],2600+index*160,1000));
  motion('.english',[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],3300,800);
  motion('.rule',[{opacity:0,transform:'scaleX(.2)'},{opacity:1,transform:'scaleX(1)'}],3550,900);
  motion('.tagline',[{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],4000,900);
  motion('.phase-line i',[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],0,duration,'linear');
  function paint(time){for(const animation of animations)animation.currentTime=Math.min(duration,time);}
  function finish(){if(ended)return;ended=true;clearTimeout(assetTimer);cancelAnimationFrame(frame);paint(duration);resolveFinished();}
  function tick(now){
   if(ended)return;
   const time=now-origin;paint(time);
   const phase=time<1800?'王国苏醒':time<3000?'暗影回应':time<4900?'传说将启':'请入席';
   if(phase!==lastPhase){lastPhase=phase;onPhase(phase);}
   if(time>=duration)finish();else frame=requestAnimationFrame(tick);
  }
  async function start(){
   const images=[...root.querySelectorAll('img')],background=new Image();background.src='/assets/battlefield_2560x1440.png';images.push(background);
   await Promise.race([Promise.all(images.map(img=>img.decode?.().catch(()=>{}))),new Promise(resolve=>assetTimer=setTimeout(resolve,2000))]);
   clearTimeout(assetTimer);if(ended)return;
   if(reduced||!animations.length){finish();return;}
   origin=performance.now();frame=requestAnimationFrame(tick);
  }
  function dispose(){finish();for(const animation of animations)animation.cancel();}
  return {start,finish,finished,dispose};
 }
};
