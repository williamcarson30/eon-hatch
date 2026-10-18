/* Eon Hatch — UI, accessible controls, audio, persistence, and game loop. */
(() => {
  'use strict';
  const C=EonCore,$=id=>document.getElementById(id),KEY='eon-hatch-save-v1',PROFILE_KEY='eon-hatch-profile-v1',CLAIMS_KEY='eon-hatch-claim-records-v1',SESSION_KEY='eon-hatch-review-session-v1';
  const fmt=n=>Math.floor(n).toLocaleString('en-US');
  const short=n=>n>=1e9?(n/1e9).toFixed(n%1e9===0?0:2)+'B':n>=1e6?(n/1e6).toFixed(n%1e6===0?0:2)+'M':n>=1e3?(n/1e3).toFixed(n%1e3===0?0:1)+'K':fmt(n);
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  let saveAvailable=true,recovered=false,modalLocked=false,profile=null,claims={},reviewSession=null,remoteClaims={};
  try {const stored=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(stored&&typeof stored.token==='string'&&stored.email)reviewSession=stored;}catch(e){}
  const reviewBase=String(window.EON_REDEMPTION?.apiBase||'').trim().replace(/\/$/,'');
  const reviewConfigured=!!reviewBase&&(/^https:\/\//.test(reviewBase)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reviewBase));
  const replyStatus={pending_review:'RECEIVED · UNDER REVIEW',needs_evidence:'MORE EVIDENCE REQUIRED',rejected:'REJECTED'};
  let serverProgress=null,onlineQueue=[],onlineFlushing=false,onlineWarning='',onlineLastUpdate=0;
  const onlineConnected=()=>reviewConfigured&&!!reviewSession?.token&&reviewSession.email===profile?.email;
  function queueOnline(kind,extra={}){if(!onlineConnected())return;const prev=onlineQueue.at(-1);if(kind==='tap_batch'&&prev?.kind==='tap_batch'&&prev.egg===extra.egg&&prev.count<24){prev.count++;return;}if(onlineQueue.length<90)onlineQueue.push({kind,...extra});else onlineWarning='Some taps were not recorded online. Your local game is unaffected.';}
  async function flushOnline(){if(!onlineConnected()||onlineFlushing||document.hidden||nativePaused)return;onlineFlushing=true;try{if(onlineQueue.length){const item=onlineQueue[0];try{serverProgress=await reviewCall('/api/progress/event','POST',item);onlineQueue.shift();onlineWarning='';}catch(error){if(/Too many taps|Not enough server-recorded|is not ready|Unknown/.test(error.message)){onlineQueue.shift();onlineWarning='Online event not accepted: '+error.message;}else onlineWarning='Online recording paused: '+error.message;}}else if(Date.now()-onlineLastUpdate>10000){serverProgress=await reviewCall('/api/progress');onlineWarning='';}onlineLastUpdate=Date.now();}catch(e){onlineWarning='Online connection unavailable: '+e.message;}finally{onlineFlushing=false;}}
  try {const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null');if(p&&typeof p.name==='string'&&typeof p.email==='string')profile=p;}catch(e){}
  try {const c=JSON.parse(localStorage.getItem(CLAIMS_KEY)||'{}');if(c&&typeof c==='object'&&!Array.isArray(c))claims=c;}catch(e){}
  const safe=s=>String(s).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  function persistProfile(){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return true;}catch(e){toast('Profile is only saved for this session. Enable device storage to keep it.');return false;}}
  function persistClaims(){try{localStorage.setItem(CLAIMS_KEY,JSON.stringify(claims));}catch(e){toast('Claim record could not be saved on this device.');}}
  function claimRecord(i){if(!state.hatched[i])return null;const id=C.SPECIES[i].id;if(!claims[id]){claims[id]={egg:id,hatchedAt:new Date().toISOString(),reference:(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))};persistClaims();}return claims[id];}

  let state=C.fresh();
  try{const raw=window.EonDesktop?.loadSave?.()||window.EonAndroid?.loadSave?.()||localStorage.getItem(KEY);if(raw)state=C.normalize(JSON.parse(raw));}catch(e){recovered=true;try{localStorage.setItem(KEY+'-recovery',localStorage.getItem(KEY)||'');}catch(err){saveAvailable=false;}}
  const away=C.offline(state);
  let renderer=new EggRenderer($('egg-canvas'),text=>{$('render-label').textContent=text;});
  let lastUI=0,lastFrame=performance.now(),lastSave=Date.now(),autoFraction=0,page='sanctuary',lastFocus=null,hatchTimer=null,controllerDown=false,lastTone=0,nativePaused=false;
  let audio=null,ambient=null;const seenHatchets=[...state.hatched];
  function toast(text){const el=document.createElement('div');el.className='toast';el.textContent=text;$('toast-container').append(el);setTimeout(()=>el.remove(),4800);}
  function save(){state.lastSeen=Date.now();const json=JSON.stringify(state);let persisted=false;try{localStorage.setItem(KEY,json);persisted=true;}catch(e){}try{if(window.EonDesktop?.persistSave){persisted=window.EonDesktop.persistSave(json)!==false||persisted;}if(window.EonAndroid?.persistSave){window.EonAndroid.persistSave(json);persisted=true;}}catch(e){}saveAvailable=persisted;$('save-status').textContent=!persisted?'SAVING UNAVAILABLE · EXPORT YOUR SAVE':onlineConnected()?(onlineWarning?'LOCAL SAVED · ONLINE SYNC NEEDS ATTENTION':'LOCAL SAVED · ONLINE RECORDING ACTIVE'):'PROGRESS SAVED ON THIS DEVICE';lastSave=Date.now();}
  function initAudio(){
    if(audio){if(audio.state==='suspended')audio.resume().catch(()=>{});return;}
    try{audio=new(window.AudioContext||window.webkitAudioContext)();
      ambient=audio.createGain();ambient.gain.value=state.settings.sound ? .012 : 0;ambient.connect(audio.destination);
      [110,164.81,220,329.63].forEach((f,i)=>{const o=audio.createOscillator();const g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.value=[.45,.25,.2,.1][i];o.connect(g);g.connect(ambient);o.start();});
    }catch(e){audio=null;}
  }
  function tone(kind='tap'){
    if(!state.settings.sound)return;initAudio();if(!audio)return;const now=audio.currentTime;if(kind==='tap'&&now-lastTone<.045)return;lastTone=now;
    const notes=kind==='hatch'?[261.63,329.63,392,523.25,659.25]:kind==='buy'?[392,523.25]:kind==='crack'?[130.81,196,261.63]:[380+Math.random()*160];
    notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='crack'?'triangle':'sine';const t=now+i*.1;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*(kind==='tap'?.55:1),t+.14);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(kind==='tap'?.035:.07,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+(kind==='tap'?.18:.8));o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+1);});
  }
  function haptic(ms=8){if(state.settings.haptics&&navigator.vibrate)navigator.vibrate(ms);}
  function effects(amount,x,y){
    if(!state.settings.motion)return;const box=$('egg-stage').getBoundingClientRect();x=Number.isFinite(x)?x-box.left:box.width/2;y=Number.isFinite(y)?y-box.top:box.height*.42;
    const wrap=$('tap-effects');if(wrap.children.length>75)return;const el=document.createElement('span');el.className='tap-number';el.textContent='+'+short(amount);el.style.left=x+'px';el.style.top=y+'px';wrap.append(el);setTimeout(()=>el.remove(),950);
    for(let i=0;i<5;i++){const p=document.createElement('span');p.className='tap-particle';p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--px',(Math.random()-.5)*100+'px');p.style.setProperty('--py',(-20-Math.random()*85)+'px');wrap.append(p);setTimeout(()=>p.remove(),750);}
  }
  function handleResult(result,physical=false){
    if(result.rewards.length){const reward=result.rewards.reduce((a,b)=>a+b.reward,0);toast('The shell fractures. +'+short(reward)+' bonus essence.');tone('crack');haptic([20,50,20]);}
    if(result.hatched){claimRecord(state.selected);renderer.configure(state);render();save();reveal(state.selected);}
    else if(result.rewards.length)renderer.configure(state);
    if(physical&&result.applied){renderer.pulse();tone();}
  }
  function tap(e){if(window.eonLoadingDone===false||page!=='sanctuary'||!$('modal-overlay').hidden)return;initAudio();if(state.hatched[state.selected]){showSpecies(state.selected);return;}const egg=C.SPECIES[state.selected].id;const r=C.tap(state);handleResult(r,true);if(r.applied){queueOnline('tap_batch',{egg,count:1});effects(r.applied,e?.clientX,e?.clientY);haptic();}render();}
  function selectEgg(i){save();autoFraction=0;state.selected=i;queueOnline('select',{egg:C.SPECIES[i].id});switchPage('sanctuary');renderer.configure(state);render();tone('buy');save();}
  function renderRoster(){
    $('egg-list').innerHTML=C.SPECIES.map((sp,i)=>'<button class="egg-card '+(state.selected===i?'selected':'')+'" style="--card-color:'+sp.color+'" data-egg="'+i+'" aria-pressed="'+(state.selected===i)+'" aria-label="Select '+sp.egg+', '+fmt(sp.goal)+' hatch taps"><span class="egg-mini"></span><div><small>'+sp.element+' · '+sp.rarity+'</small><h3>'+sp.egg+'</h3><span class="egg-goal">'+(state.hatched[i]?'Companion awakened':short(sp.goal)+' hatch taps')+' · $'+C.REWARDS_USD[i]+' reward'+'</span><div class="mini-progress"><i style="width:'+C.progress(state,i)*100+'%"></i></div></div>'+(state.hatched[i]?icon('check').replace('<svg','<svg class="card-check"'):'')+'</button>').join('');
  }
  function renderUpgrades(){
    $('upgrade-list').innerHTML=Object.entries(C.UPGRADES).map(([key,u])=>{const level=state.upgrades[key],cost=C.cost(state,key),max=level>=u.max;const now=Date.now(),next=C.previewUpgrade(state,key,now);const effect=max?'Fully attuned':key==='power'?C.power(state)+' → '+next.tap+' permanent / tap (+1)':key==='auto'?C.rate(state)+' → '+next.incubator+' / sec (+1)':C.power(state)+' → '+next.tap+' permanent / tap'+(state.upgrades.auto?' · '+C.rate(state)+' → '+next.incubator+' / sec':'')+' (+1)';
      return '<article class="upgrade-card"><div class="upgrade-header"><span class="upgrade-icon">'+icon(u.icon)+'</span><div><h4>'+u.name+'</h4><small>LEVEL '+String(level).padStart(2,'0')+' / '+u.max+'</small></div></div><p>'+u.desc+'<br><span style="color:#c7c5a4">'+(max?'Fully attuned':effect)+'</span></p><button data-upgrade="'+key+'" '+(max||state.sparks<cost?'disabled':'')+'><span>'+(max?'MASTERED':'ATTUNE')+'</span><span class="upgrade-price">'+icon('spark')+(max?'MAX':short(cost))+'</span></button></article>';
    }).join('');
  }
  function renderCodex(){
    $('codex-grid').innerHTML=C.SPECIES.map((sp,i)=>'<article class="species-card" style="--species-color:'+sp.color+'"><span class="eyebrow">'+sp.rarity+' · '+sp.element+'</span><span class="species-number">0'+(i+1)+'</span><img class="species-art" src="assets/'+sp.id+'.webp" alt="'+sp.name+', '+sp.title+'" loading="lazy"><span class="codex-note">'+(state.hatched[i]?'COMPANION AWAKENED · +1 TAP POWER':'SPECIES PREVIEW · NOT YET HATCHED')+'</span><h2>'+sp.name+'</h2><h4>'+sp.title.toUpperCase()+'</h4><p>'+sp.description+'</p><button data-select="'+i+'">'+(state.hatched[i]?'Visit companion':'Return to '+sp.egg+' · '+short(sp.goal))+'</button></article>').join('');
  }
  let lastRoster='',lastUpgrade='',lastSelected=-1;
  function render(){
    const sp=C.SPECIES[state.selected],prog=C.progress(state),stage=C.cracks(state),hatched=state.hatched[state.selected];
    document.documentElement.style.setProperty('--accent',sp.color);
    $('sparks').textContent=short(state.sparks);$('realm-name').textContent=sp.realm;$('egg-name').textContent=hatched?sp.name:sp.egg;$('egg-rarity').textContent=sp.rarity+' · '+sp.element;$('progress-value').innerHTML=fmt(state.eggs[state.selected])+' <small>/ '+fmt(sp.goal)+'</small>';$('progress-percent').textContent=(prog*100).toFixed(prog>=.01?2:4)+'%';$('progress-fill').style.width=(prog*100)+'%';
    $('crack-count').textContent=hatched?'AWAKENED':stage?'FRACTURE '+String(stage).padStart(2,'0')+' / 10':'SHELL INTACT';
    $('next-crack').textContent=hatched?'+1 tap power':stage<10?'Next crack at '+(C.CRACKS[stage]*100)+'%':'The shell is breaking open';
    $('remaining').textContent=hatched?'Welcome to the sanctuary':short(sp.goal-state.eggs[state.selected])+' to awaken';$('stage-caption').innerHTML='<span class="tiny-diamond"></span> '+(hatched?'A NEW FRIEND, A NEW BEGINNING':stage>7?'SOMETHING EXTRAORDINARY IS ALMOST HERE':stage?'THERE IS A HEARTBEAT INSIDE':'A NEW LIFE IS STIRRING')+' <span class="tiny-diamond"></span>';
    const now=Date.now(),surge=C.surgeStatus(state,now),surging=surge.active;
    $('power-stat').textContent='+'+short(C.tapPower(state,now));$('auto-stat').textContent=short(C.rate(state));$('manual-stat').textContent=fmt(state.manualTaps);$('earned-stat').textContent=short(state.totalEarned);
    const sum=state.eggs.reduce((n,x,i)=>n+C.CRACKS.filter(v=>x/C.SPECIES[i].goal>=v).length,0);$('fractures-stat').textContent=sum+' / 30';$('journey-fill').style.width=(sum/30*100)+'%';const awakened=state.hatched.filter(Boolean).length;$('awakened-count').textContent=String(awakened).padStart(2,'0');$('codex-count').textContent=awakened+'/3';
    const recharge=Math.ceil(surge.remainingMs/1000),clock=String(Math.floor(recharge/60)).padStart(2,'0')+':'+String(recharge%60).padStart(2,'0');
    $('surge-button').disabled=hatched||!surge.ready;$('surge-button').classList.toggle('ready',surge.ready&&!hatched);$('surge-button').classList.toggle('running',surging);$('surge-button').style.setProperty('--surge-charge',(surge.charge*100)+'%');$('surge-label').innerHTML=(surging?'×2 STAR SURGE':'STAR SURGE')+' <small>'+(surging?Math.ceil(surge.activeMs/1000)+'s remaining':surge.ready?'READY · ×2 / 10s':clock+' recharge')+'</small>';$('surge-button').setAttribute('aria-label',surging?'Star Surge active: double tap power for '+Math.ceil(surge.activeMs/1000)+' more seconds':surge.ready?'Activate Star Surge: double tap power for 10 seconds':'Star Surge recharges in '+clock);
    $('hatched-creature').hidden=!hatched;if(hatched){$('hatched-creature').src='assets/'+sp.id+'.webp';$('hatched-creature').alt=sp.name+', your awakened companion';}
    $('tap-target').setAttribute('aria-label',hatched?'Visit '+sp.name:'Tap '+sp.egg+' to add '+C.tapPower(state,now)+' hatch progress');
    const roster=state.selected+'|'+state.eggs.map((n,i)=>Math.floor(n/C.SPECIES[i].goal*10000)).join(',')+'|'+state.hatched.join();if(roster!==lastRoster){lastRoster=roster;renderRoster();}
    const upgrades=JSON.stringify(state.upgrades)+'|'+Object.keys(C.UPGRADES).map(k=>state.sparks>=C.cost(state,k)).join()+'|'+awakened+'|'+surging;if(upgrades!==lastUpgrade){lastUpgrade=upgrades;renderUpgrades();}
    if(lastSelected!==state.selected||renderer.stage!==stage||renderer.hatched!==hatched){lastSelected=state.selected;renderer.configure(state);}
  }
  function switchPage(next){
    if(next==='upgrades'&&window.innerWidth>700){next='sanctuary';setTimeout(()=>$('upgrades-panel').scrollIntoView({behavior:state.settings.motion?'smooth':'instant',block:'center'}),20);}
    page=next;$('sanctuary-page').hidden=next==='codex';$('codex-page').hidden=next!=='codex';document.body.classList.toggle('upgrades-page-mobile',next==='upgrades');
    document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===next));
    if(next==='codex')renderCodex();if(next==='sanctuary')setTimeout(()=>renderer.resize(),0);window.scrollTo({top:0,behavior:'instant'});
  }
  function openModal(content,locked=false){modalLocked=locked;lastFocus=document.activeElement;$('modal-content').innerHTML=content;$('modal-overlay').hidden=false;$('modal-close').hidden=locked;document.body.style.overflow='hidden';const modal=$('modal-overlay').querySelector('.modal');modal.scrollTop=0;modal.focus();}
  function closeModal(force=false){if(modalLocked&&!force)return;modalLocked=false;clearTimeout(hatchTimer);$('modal-overlay').hidden=true;document.body.style.overflow='';lastFocus?.focus?.();}
  function profileDialog(){
    openModal('<div class="eyebrow">WELCOME TO EON HATCH</div><h2 id="modal-title">Your keeper profile</h2><p>Enter your name and email to create your on-device redemption profile before you start. Your details remain on this device; they are <strong>not submitted</strong> to any server until you separately consent in the Rewards screen.</p><form id="keeper-form" class="keeper-form"><label>Keeper name<input id="keeper-name" type="text" maxlength="80" autocomplete="name" placeholder="Your name" required value="'+safe(profile?.name||'')+'"></label><label>Email for future redemption contact<input id="keeper-email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" required value="'+safe(profile?.email||'')+'"></label><p class="reward-terms">Egg rewards advertised: $5 for Emberlynx, $10 for Lunacrest, and $15 for Nyxara (Amazon gift cards). <strong>Only the first 25 verified hatchers of each egg may receive a reward.</strong> Rewards are not guaranteed. Redemption is not active until online eligibility verification and fulfillment are configured. Not sponsored by or affiliated with Amazon.</p><button class="primary-button" type="submit">SAVE PROFILE &amp; ENTER</button></form>',true);
    $('keeper-name').focus();
  }
  async function reviewCall(path,method='GET',body=null){
    if(!reviewConfigured)throw new Error('No secure claim-review service has been configured.');
    const headers={'Accept':'application/json'};
    if(body!==null)headers['Content-Type']='application/json';
    if(reviewSession?.token)headers.Authorization='Bearer '+reviewSession.token;
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),10000);
    try{
      const response=await fetch(reviewBase+path,{method,headers,body:body===null?undefined:JSON.stringify(body),signal:ctrl.signal,cache:'no-store'});
      const json=await response.json().catch(()=>({error:'The server did not return a readable reply.'}));
      if(!response.ok)throw new Error(json.error||('Service error '+response.status));
      return json;
    }finally{clearTimeout(timeout);}
  }
  async function refreshReview(){
    if(!onlineConnected())return;
    try{
      const [received,progress]=await Promise.all([reviewCall('/api/claims'),reviewCall('/api/progress')]);
      remoteClaims=Object.fromEntries((received.claims||[]).map(c=>[c.egg,c]));
      serverProgress=progress;
      for(const [egg,item] of Object.entries(remoteClaims)){
        const node=$('reward-sync-'+egg);
        if(node)node.textContent=replyStatus[item.status]||'UNDER MANUAL REVIEW';
      }
      const label=$('server-progress-message');if(label)label.textContent=serverSummary();
    }catch(error){if($('review-message'))$('review-message').textContent='Online service unavailable: '+error.message;}
  }
  function serverSummary(){
    if(!onlineConnected())return 'Online tracking is not enabled. Existing local progress does not automatically qualify for rewards.';
    if(!serverProgress?.eggs)return 'Signed in. Retrieving server-recorded progress. Local and online totals are separate.';
    return 'SERVER-RECORDED: '+serverProgress.eggs.map(x=>x.egg+' '+short(x.recorded)+' / '+short(x.goal)).join(' · ')+'. '+(onlineWarning||'Online activity recording is experimental and does not prove human participation or guarantee a reward.');
  }
  function rewards(){
    const prize=C.SPECIES.map((sp,i)=>{
      const unlocked=state.hatched[i],r=unlocked?claimRecord(i):null,serverStatus=remoteClaims[sp.id],status=serverStatus?(replyStatus[serverStatus.status]||'UNDER MANUAL REVIEW'):(unlocked?'LOCAL RECORD · NOT SUBMITTED':'LOCKED UNTIL LOCAL HATCH');
      return '<article class="reward-item"><div><b>'+sp.name+'</b><small>Egg '+(i+1)+' · $'+C.REWARDS_USD[i]+' Amazon gift card</small></div><span class="reward-status" id="reward-sync-'+sp.id+'">'+status+'</span>'+(r?'<button data-claim="'+i+'">EXPORT REQUEST</button>':'')+(r&&reviewConfigured&&!serverStatus?'<button class="secondary-button" data-sync="'+i+'">SEND FOR REVIEW</button>':'')+'</article>';
    }).join('');
    openModal('<div class="eyebrow">KEEPER REDEMPTION · SANDBOX V1.0.6</div><h2 id="modal-title">Egg rewards</h2><p>Profile: '+safe(profile?.name||'Not registered')+' · '+safe(profile?.email||'')+'</p><div class="reward-list">'+prize+'</div><p class="reward-terms">Only the first 25 verified hatchers for each egg may receive a reward. Server recording does not prove human participation or establish prize eligibility. <strong>No prizes are currently available or reserved.</strong> Amazon is not a sponsor.</p>'+(reviewConfigured?'<p class="review-service" id="server-progress-message">'+safe(serverSummary())+'</p><label class="review-consent"><input type="checkbox" id="review-consent"> I consent to sending my name, email, and server-recorded game interactions for optional review. My local progress will remain separate.</label><button class="secondary-button" id="online-connect">'+(onlineConnected()?'REFRESH ONLINE STATUS':'VERIFY EMAIL & ENABLE ONLINE TRACKING')+'</button><p class="review-service" id="review-message">Online tracking begins after email verification. No previous local progress is certified.</p>':'<p class="review-service" id="review-message"><strong>ONLINE CLAIMS INACTIVE.</strong> This build has no live verification service connected. EXPORT REQUEST saves an unsubmitted local record.</p>')+'<button class="secondary-button" id="edit-profile">EDIT KEEPER PROFILE</button>');
    refreshReview();
  }
  async function beginOnlineSignIn(){
    if(!reviewConfigured||!profile)return toast('Configure an online test endpoint and local keeper profile first.');
    if(!$('review-consent')?.checked)return toast('Please read and check the optional data consent box.');
    const btn=$('online-connect');if(btn){btn.disabled=true;btn.textContent='CONTACTING SERVER…';}
    try{
      if(onlineConnected()){await refreshReview();return toast('Online session updated.');}
      try{await reviewCall('/api/register','POST',{name:profile.name,email:profile.email,consent:true});}
      catch(error){if(!/already has an account/.test(error.message))throw error;await reviewCall('/api/login/start','POST',{email:profile.email});}
      openModal('<div class="eyebrow">EMAIL VERIFICATION · SANDBOX</div><h2 id="modal-title">Check your email</h2><p>Enter the six-digit code sent to '+safe(profile.email)+'. It expires in 15 minutes. A code only verifies mailbox access; it does not prove reward eligibility.</p><form id="verify-code-form" class="keeper-form"><label>Six-digit verification code<input id="verification-code" type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required></label><button type="submit" class="primary-button">VERIFY EMAIL</button></form><p id="verification-message" class="review-service">Your progress stays saved on this device.</p><button id="modal-close-verification" class="secondary-button">CANCEL</button>');
      $('verification-code').focus();
    }catch(error){if($('review-message'))$('review-message').textContent='Could not start email verification: '+error.message;toast('Email verification unavailable: '+error.message);}
    finally{if(btn){btn.disabled=false;btn.textContent='VERIFY EMAIL & ENABLE ONLINE TRACKING';}}
  }
  async function confirmOnlineCode(){
    const field=$('verification-code'),msg=$('verification-message');if(!field||!profile)return;
    const code=field.value.trim();if(!/^\d{6}$/.test(code)){msg.textContent='Enter six digits.';return;}
    field.disabled=true;
    try{
      const result=await reviewCall('/api/login/confirm','POST',{email:profile.email,code});
      reviewSession={token:result.token,email:profile.email};localStorage.setItem(SESSION_KEY,JSON.stringify(reviewSession));
      onlineQueue=[];onlineWarning='';await refreshReview();rewards();toast('Email verified. Online tracking has started from zero. Existing local saves are not verified.');
    }catch(error){field.disabled=false;if(msg)msg.textContent='Verification failed: '+error.message;}
  }
  async function submitReview(i){
    if(!reviewConfigured||!profile||!state.hatched[i])return toast('A hatched egg and an online review service are required.');
    if(!$('review-consent')?.checked)return toast('Review the data notice and check the consent box before submitting.');
    if(!onlineConnected())return beginOnlineSignIn();
    const btn=document.querySelector('[data-sync="'+i+'"]');if(btn){btn.disabled=true;btn.textContent='SENDING…';}
    const message=$('review-message');
    try{
      const r=claimRecord(i),result=await reviewCall('/api/claims','POST',{
        egg:r.egg,reportedProgress:state.eggs[i],clientReference:r.reference,clientHatchedAt:r.hatchedAt
      });
      remoteClaims[r.egg]=result;
      const node=$('reward-sync-'+r.egg);if(node)node.textContent=replyStatus[result.status]||'UNDER MANUAL REVIEW';
      if(btn){btn.textContent='REQUEST RECEIVED';btn.disabled=true;}
      if(message)message.textContent='Request recorded for admin review. Server recorded hatch: '+(result.serverHatched?'YES':'NO')+'. This does not establish eligibility or reserve a reward.';
      toast('Review request received. No reward reserved.');
    }catch(error){if(btn){btn.disabled=false;btn.textContent='RETRY REVIEW REQUEST';}if(message)message.textContent='Request not submitted: '+error.message;toast('Review request failed: '+error.message);}
  }
  function exportClaim(i){
    if(!profile||!state.hatched[i]){toast('Complete the hatch and keeper profile first.');return;}
    const record=claimRecord(i),data={kind:'eon-hatch-redemption-request',version:1,game:'Eon Hatch',studio:'Aces Full Studios',reference:record.reference,name:profile.name,email:profile.email,egg:record.egg,hatchedAt:record.hatchedAt,rewardUSD:C.REWARDS_USD[i],progress:state.eggs[i],manualTaps:state.manualTaps,createdAt:new Date().toISOString(),status:'UNSUBMITTED - A SERVER MUST VERIFY ELIGIBILITY'};
    const json=JSON.stringify(data,null,2),a=document.createElement('a'),url=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.href=url;a.download='eon-hatch-'+record.egg+'-redemption-request.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(json).catch(()=>{});
    toast('Redemption record prepared and download requested. It has NOT been submitted.');
  }
  function guide(){openModal('<div class="eyebrow">WELCOME, KEEPER</div><h2 id="modal-title">Life begins with a touch.</h2><p>Deep inside three ancient eggs, extraordinary companions are waiting to meet you.</p><div class="guide-step"><span>01</span><div><b>Touch. Discover. Awaken.</b><p>Tap the egg, click, press Space, or use controller A. Cinder needs 100 million hatch taps, Moonfrost 500 million, and Astral 1 billion.</p></div></div><div class="guide-step"><span>02</span><div><b>Turn essence into possibility.</b><p>Each touch begins at 1 hatch tap. Each upgrade type has 20 levels and costs 10× the original essence prices. Every purchase adds +1 permanent tap or incubator power. Prismatic Heart adds +1 to taps and +1/sec to an already unlocked incubator. Star Surge temporarily doubles tap power; physical taps are tracked separately. While away, incubators add 0.01 progress per second at level 1 up to 0.20 at level 20, for up to 8 hours.</p></div></div><div class="guide-step"><span>03</span><div><b>Watch the shell tell its story.</b><p>Ten fracture stages begin at 0.5%, then 2%, 5%, 10%, 20%, 35%, 50%, 65%, 80%, and 92%. Every fracture gives bonus essence. Reach 100% to reveal your companion.</p></div></div><div class="guide-step"><span>04</span><div><b>Find your rhythm.</b><p>Star Surge doubles your tap power for 10 seconds and recharges once every hour, even while away. Every awakened companion adds a fixed +1 tap power. Your progress saves on this device. Export a save to move between devices.</p></div></div><button class="primary-button" id="guide-start">ENTER THE SANCTUARY</button>');}
  function settings(){const t=(key,label,detail)=>'<div class="setting-row"><div>'+label+'<small>'+detail+'</small></div><button class="toggle '+(state.settings[key]?'on':'')+'" data-setting="'+key+'" aria-label="Toggle '+label+'" aria-pressed="'+state.settings[key]+'"></button></div>';
    openModal('<div class="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="modal-title">Sanctuary settings</h2><p class="eyebrow">VERSION 1.0.6 · +1 PERMANENT POWER PER UPGRADE</p><div class="setting-row"><div>Visual quality<small>Ray-traced egg lighting and altar shadows</small></div><select id="quality-select" aria-label="Visual quality"><option value="eco" '+(state.settings.quality==='eco'?'selected':'')+'>Eco · 480p / 20fps</option><option value="balanced" '+(state.settings.quality==='balanced'?'selected':'')+'>Balanced · up to 900p</option><option value="ultra" '+(state.settings.quality==='ultra'?'selected':'')+'>Ultra · 1440p / 30fps</option></select></div>'+t('sound','Sanctuary sound','Ambient tones and hatching sounds')+t('haptics','Touch feedback','Supported phones and controllers')+t('motion','Ambient motion','Floating particles, egg movement, tap effects')+'<div class="setting-row"><div>Offline incubator gain<small>'+C.offlineRate(state).toFixed(2)+' progress/sec at incubator level '+state.upgrades.auto+' (up to 8 hours)</small></div></div><p style="font-size:9px">Eggs use a custom WebGL ray tracer. Creature artwork is original pre-rendered 3D art. Quality describes the egg render buffer; device performance varies.</p><p class="legal-small">rewards are distributed too only the first 25 people too hatch each egg</p><button class="secondary-button" id="settings-rewards">Rewards &amp; redemption</button><div class="settings-actions"><button id="export-save">Export save</button><button id="import-save">Import save</button></div><button class="secondary-button" id="fullscreen">Toggle full screen</button><button class="secondary-button" id="settings-guide">Read the field guide</button><button class="danger-button" id="reset-save">Start a new sanctuary</button>');
  }
  function showSpecies(i){const sp=C.SPECIES[i];openModal('<div class="eyebrow">'+(state.hatched[i]?'YOUR COMPANION':'SPECIES PREVIEW')+' · '+sp.rarity+'</div><h2 id="modal-title">'+sp.name+'</h2><img class="hatch-art" src="assets/'+sp.id+'.webp" alt="'+sp.name+'"><div class="eyebrow">'+sp.title.toUpperCase()+'</div><p>'+sp.description+'</p><p>'+(state.hatched[i]?'Companion bond: +1 tap power.':short(sp.goal-state.eggs[i])+' hatch progress remains before this companion awakens.')+'</p><button class="primary-button" id="species-back">BACK TO THE SANCTUARY</button>');}
  function reveal(i){
    if(seenHatchets[i])return;seenHatchets[i]=true;const sp=C.SPECIES[i];$('egg-stage').classList.add('hatch-flash');tone('hatch');haptic([40,50,40,60,100]);setTimeout(()=>$('egg-stage').classList.remove('hatch-flash'),1400);
    hatchTimer=setTimeout(()=>{openModal('<div class="eyebrow">A BOND WRITTEN IN THE STARS</div><h2 id="modal-title">'+sp.name+' has awakened.</h2><img class="hatch-art" src="assets/'+sp.id+'.webp" alt="Your new '+sp.name+' companion"><div class="eyebrow">'+sp.title.toUpperCase()+'</div><p>'+sp.description+'</p><p style="color:var(--gold)">COMPANION BOND · +1 TAP POWER · $'+C.REWARDS_USD[i]+' GIFT CARD REQUEST AVAILABLE (SUBJECT TO VERIFICATION)</p><button class="primary-button" id="hatch-continue">'+(state.hatched.every(Boolean)?'YOUR SANCTUARY IS COMPLETE':'MEET YOUR NEW COMPANION')+'</button>');save();},700);
  }
  function exportSave(){save();const json=JSON.stringify(state,null,2);if(window.EonAndroid?.exportSave){window.EonAndroid.exportSave(json);toast('Choose where to save your sanctuary.');return;}const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='eon-hatch-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Save exported. Keep it to move your progress.');}
  async function importSave(file){try{const text=await file.text();if(text.length>100000)throw Error('Save file is too large.');const candidate=C.normalize(JSON.parse(text));openModal('<div class="eyebrow">RESTORE A SANCTUARY</div><h2 id="modal-title">Welcome back, keeper.</h2><p>This save has '+fmt(candidate.manualTaps)+' physical taps and '+candidate.hatched.filter(Boolean).length+' awakened companions. Importing replaces progress on this device.</p><button class="primary-button" id="confirm-import">IMPORT THIS SAVE</button><button class="secondary-button" id="cancel-import">KEEP CURRENT SANCTUARY</button>');$('confirm-import').onclick=()=>{claims={};persistClaims();state=candidate;C.offline(state);seenHatchets.splice(0,3,...state.hatched);autoFraction=0;lastRoster='';lastUpgrade='';lastSelected=-1;applySettings();render();save();closeModal();switchPage('sanctuary');toast('Your sanctuary has been restored.');};}catch(e){toast('Could not import: '+e.message);}finally{$('save-import').value='';}}
  function applySettings(){document.body.classList.toggle('motion-off',!state.settings.motion);$('sound-toggle').classList.toggle('muted',!state.settings.sound);$('sound-toggle').setAttribute('aria-pressed',state.settings.sound);renderer.configure(state);if(ambient&&audio)ambient.gain.setTargetAtTime(state.settings.sound ? .012 : 0,audio.currentTime,.3);}
  $('tap-target').addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();$('tap-target').focus({preventScroll:true});tap(e);});
  $('tap-target').addEventListener('click',e=>{if(e.detail===0)tap();});
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,a');if(!target)return;
    if(target.dataset.page){initAudio();switchPage(target.dataset.page);}
    if(target.dataset.egg!==undefined)selectEgg(Number(target.dataset.egg));
    if(target.dataset.select!==undefined)selectEgg(Number(target.dataset.select));
    if(target.dataset.upgrade){initAudio();const key=target.dataset.upgrade;if(C.buy(state,key)){queueOnline('upgrade',{upgrade:key});haptic(18);tone('buy');render();save();toast(C.UPGRADES[key].name+' attuned to level '+state.upgrades[key]+'.');}}
    if(target.dataset.claim!==undefined){exportClaim(Number(target.dataset.claim));}
    if(target.dataset.sync!==undefined){submitReview(Number(target.dataset.sync));}
    if(target.dataset.setting){const key=target.dataset.setting;state.settings[key]=!state.settings[key];target.classList.toggle('on',state.settings[key]);target.setAttribute('aria-pressed',state.settings[key]);initAudio();applySettings();save();}
    switch(target.id){
      case 'settings-open':settings();break;
      case 'rewards-open':case 'settings-rewards':rewards();break;
      case 'edit-profile':profileDialog();break;
      case 'online-connect':beginOnlineSignIn();break;
      case 'modal-close-verification':rewards();break;
      case 'keeper-save':break;
      case 'guide-open':case 'settings-guide':guide();break;
      case 'modal-close':case 'species-back':case 'hatch-continue':case 'cancel-import':closeModal();break;
      case 'guide-start':state.tutorial=false;save();closeModal();initAudio();break;
      case 'sound-toggle':state.settings.sound=!state.settings.sound;initAudio();applySettings();save();break;
      case 'surge-button':if(C.surge(state)){queueOnline('surge');toast('Star Surge! ×2 tap power for 10 seconds. Recharges in 1 hour.');tone('buy');render();save();}break;
      case 'export-save':exportSave();break;
      case 'import-save':if(window.EonAndroid?.importSave)window.EonAndroid.importSave();else $('save-import').click();break;
      case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>toast('Full screen is unavailable in this browser.'));break;
      case 'reset-save':openModal('<div class="eyebrow">A NEW BEGINNING</div><h2 id="modal-title">Begin again?</h2><p>This replaces all progress on this device. Export your current save first if you want to keep it.</p><button class="primary-button" id="confirm-reset">START A NEW SANCTUARY</button><button class="secondary-button" id="cancel-import">KEEP CURRENT SANCTUARY</button>');break;
      case 'confirm-reset':claims={};persistClaims();state=C.fresh();seenHatchets.splice(0,3,false,false,false);autoFraction=0;lastRoster='';lastUpgrade='';lastSelected=-1;applySettings();render();save();switchPage('sanctuary');closeModal();toast('A new story begins.');break;
    }
    if(target.matches('.brand')){e.preventDefault();switchPage('sanctuary');}
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='verify-code-form'){e.preventDefault();confirmOnlineCode();return;}
    if(e.target.id!=='keeper-form')return;e.preventDefault();
    const name=$('keeper-name').value.trim().replace(/\s+/g,' '),email=$('keeper-email').value.trim().toLowerCase();
    if(name.length<2||name.length>80||!/^\S+@\S+\.\S+$/.test(email)||email.length>254){toast('Enter a valid name and email to continue.');return;}
    if(profile?.email&&profile.email!==email){reviewSession=null;remoteClaims={};onlineQueue=[];serverProgress=null;try{localStorage.removeItem(SESSION_KEY);}catch(e){}}
    profile={name,email,createdAt:profile?.createdAt||new Date().toISOString()};persistProfile();closeModal(true);toast('Keeper profile saved on this device.');
  });
  document.addEventListener('change',e=>{if(e.target.id==='quality-select'){state.settings.quality=e.target.value;applySettings();save();}if(e.target.id==='save-import'&&e.target.files[0])importSave(e.target.files[0]);});
  $('modal-overlay').addEventListener('click',e=>{if(e.target===$('modal-overlay'))closeModal();});
  document.addEventListener('keydown',e=>{
    if(window.eonLoadingDone===false)return;
    if(e.key==='Escape'){if(modalLocked){e.preventDefault();return;}if(!$('modal-overlay').hidden)closeModal();else settings();return;}
    if(!$('modal-overlay').hidden&&e.key==='Tab'){
      const a=[...$('modal-overlay').querySelectorAll('button:not(:disabled),select,input,[tabindex="0"]')].filter(el=>!el.hidden);if(!a.length)return;const first=a[0],last=a.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement.matches('.modal'))){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;
    }
    const tag=document.activeElement?.tagName;if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;
    if(e.code==='Space'&&page==='sanctuary'&&$('modal-overlay').hidden&&(document.activeElement===document.body||document.activeElement===$('tap-target'))){e.preventDefault();if(!e.repeat)tap();}
    if(['Digit1','Digit2','Digit3'].includes(e.code)&&$('modal-overlay').hidden)selectEgg(Number(e.code.at(-1))-1);
  });
  window.eonImportNative=json=>{importSave(new File([json],'save.json',{type:'application/json'}));};
  window.eonBack=()=>{if(!$('modal-overlay').hidden)closeModal();else if(page!=='sanctuary')switchPage('sanctuary');else settings();};
  window.eonNativePause=()=>{nativePaused=true;save();audio?.suspend().catch(()=>{});};
  window.eonNativeResume=()=>{if(!nativePaused)return;nativePaused=false;const result=C.offline(state);autoFraction=0;lastFrame=performance.now();handleResult(result);render();if(result.applied)toast('While you were away: +'+short(result.applied)+' hatch progress.');};
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(!nativePaused)save();audio?.suspend().catch(()=>{});}else if(!nativePaused){const result=C.offline(state);autoFraction=0;lastFrame=performance.now();if(result.applied>0)toast('While you were away: +'+short(result.applied)+' hatch progress.');handleResult(result);render();if(audio&&state.settings.sound)audio.resume().catch(()=>{});}
  });
  window.addEventListener('resize',()=>{if(window.innerWidth>700&&page==='upgrades')switchPage('sanctuary');});
  function frame(now){
    const dt=Math.min((now-lastFrame)/1000,1);lastFrame=now;
    if(!document.hidden&&!nativePaused){
      if(!state.hatched[state.selected]){autoFraction+=C.rate(state)*dt;const amount=Math.floor(autoFraction);if(amount){autoFraction-=amount;handleResult(C.apply(state,amount));}}
      if(page==='sanctuary')renderer.render(now);
      const pad=navigator.getGamepads?.()?.[0];if(pad){const pressed=pad.buttons[0]?.pressed;if(pressed&&!controllerDown)tap();controllerDown=pressed;}else controllerDown=false;
      if(now-lastUI>180){render();lastUI=now;}if(Date.now()-lastSave>5000)save();
    }
    requestAnimationFrame(frame);
  }
  setInterval(()=>{if(onlineConnected()&&!document.hidden)flushOnline();},1000);
  applySettings();render();requestAnimationFrame(frame);window.eonGameReady=true;document.dispatchEvent(new Event('eon-ready'));
  if(recovered)toast('Your last save could not be read. A recovery copy was kept when possible.');
  if(away.hatched)claimRecord(state.selected);
  document.addEventListener('eon-loaded',()=>{if(!profile)profileDialog();},{once:true});
  if(window.eonLoadingDone===true&&!profile)profileDialog();
  if(away.applied>0){setTimeout(()=>toast('Welcome back. Your incubator added '+short(away.applied)+' hatch progress.'),800);if(away.hatched){seenHatchets[state.selected]=false;setTimeout(()=>reveal(state.selected),1200);}}
  if(!saveAvailable)toast('Saving is unavailable here. Export a save before leaving.');
  if(state.tutorial)setTimeout(()=>{if(profile)toast('Welcome, keeper. Touch your egg to begin. The field guide is below.');},1200);
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
})();
