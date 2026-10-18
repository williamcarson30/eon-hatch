/* Branded loading screen: loads real game art and waits for game initialization. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),screen=$('loading-screen');if(!screen)return;
  window.eonLoadingDone=false;const game=$('game');if(game)game.inert=true;const start=Date.now();let completed=0,ready=window.eonGameReady===true,dismissed=false;
  const assets=['assets/loading-nest.webp','assets/aces-full-studios.svg','assets/emberlynx.webp','assets/lunacrest.webp','assets/nyxara.webp','assets/sanctuary.webp'];
  const artwork=$('loading-illustration');function fallback(){artwork.hidden=true;$('loading-fallback').hidden=false;}artwork.addEventListener('error',fallback);if(artwork.complete&&!artwork.naturalWidth)fallback();
  function dismiss(){if(dismissed||!ready)return;dismissed=true;window.eonLoadingDone=true;if(game)game.inert=false;document.body.classList.remove('is-loading');screen.classList.add('loading-finished');setTimeout(()=>{screen.hidden=true;document.dispatchEvent(new Event('eon-loaded'));},450);}
  $('loading-enter').addEventListener('click',dismiss);
  function progress(){const percent=Math.round((completed+(ready?1:0))/(assets.length+1)*100);$('loading-fill').style.width=percent+'%';$('loading-percent').textContent=percent+'%';$('loading-progress').setAttribute('aria-valuenow',percent);if(ready&&completed===assets.length){$('loading-status').textContent='Your little world is ready.';$('loading-enter').hidden=false;setTimeout(dismiss,Math.max(0,3500-(Date.now()-start)));}}
  document.addEventListener('eon-ready',()=>{ready=true;progress();},{once:true});
  for(const src of assets){let settled=false;const img=new Image();const done=()=>{if(settled)return;settled=true;completed++;progress();};img.onload=done;img.onerror=done;img.src=src;if(img.complete)done();setTimeout(done,10000);}
  setTimeout(()=>{if(ready){$('loading-status').textContent='Welcome to your sanctuary.';$('loading-enter').hidden=false;dismiss();}else{$('loading-status').textContent='The sanctuary is taking a little longer to wake…';}},12000);
  progress();
})();
