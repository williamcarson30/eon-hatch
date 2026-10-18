/* Eon Hatch — deterministic game rules shared by web, Android, and desktop. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EonCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SPECIES = [
    { id:'emberlynx', name:'Emberlynx', title:'The Cinderheart', egg:'Cinder egg', realm:'Ashen Grove', element:'FIRE', rarity:'RARE', goal:100000000, color:'#f4b466', rgb:[1,.46,.13], description:'Born where the last ember meets the first dawn. This little guardian carries a living flame in its tufted ears, and enough courage for a creature ten times its size.' },
    { id:'lunacrest', name:'Lunacrest', title:'The Moonfeather', egg:'Moonfrost egg', realm:'Moonlit Spires', element:'FROST', rarity:'EPIC', goal:500000000, color:'#8de0f4', rgb:[.25,.76,1], description:'A lunar gryphon with frost-crystal wings and crescent antlers. Its soft feathers gather moonlight, leaving a trail of tiny constellations wherever it wanders.' },
    { id:'nyxara', name:'Nyxara', title:'The Starweaver', egg:'Astral egg', realm:'The Starfall Veil', element:'COSMIC', rarity:'MYTHIC', goal:1000000000, color:'#c5a0ff', rgb:[.65,.35,1], description:'An ancient sky in a very small body. This curious cosmic axolotl bends starlight around its crystal gills and keeps a newborn star balanced on its curling tail.' }
  ];
  const CRACKS = [.005,.02,.05,.1,.2,.35,.5,.65,.8,.92];
  const UPGRADE_PRICE_MULTIPLIER = 10;
  const REWARDS_USD=[5,10,15];
  const OFFLINE_GAIN_PER_LEVEL=0.01; // 0.01/sec at level 1, 0.20/sec at level 20
  const SURGE_DURATION_MS = 10000, SURGE_COOLDOWN_MS = 3600000;
  const UPGRADES = {
    power:{name:'Resonant touch', max:20, base:25, scale:2.05, icon:'touch', desc:'Each purchase adds exactly +1 progress per tap.'},
    auto:{name:'Ancient incubator', max:20, base:100, scale:2.25, icon:'auto', desc:'Each purchase adds exactly +1 progress per second.'},
    resonance:{name:'Prismatic heart', max:20, base:2000, scale:3.1, icon:'prism', desc:'Adds +1 per tap and +1/sec if the incubator is unlocked.'}
  };
  const finite = (n, fallback=0) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  function fresh(now=Date.now()) {
    return {version:1, selected:0, sparks:0, totalEarned:0, manualTaps:0, eggs:[0,0,0], hatched:[false,false,false], upgrades:{power:0,auto:0,resonance:0}, incubatorResonance:0,offlineRemainder:0, milestones:[], surgeReadyAt:now, surgeUntil:0, lastSeen:now, createdAt:now, settings:{sound:true,haptics:true,quality:'balanced',motion:true}, tutorial:true};
  }
  function normalize(raw,now=Date.now()) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.eggs)) throw new Error('This is not an Eon Hatch save.');
    const s=fresh(now);
    s.selected=clamp(Math.floor(finite(raw.selected)),0,2);
    for (const k of ['sparks','totalEarned','manualTaps']) s[k]=clamp(Math.floor(finite(raw[k])),0,Number.MAX_SAFE_INTEGER);
    for(let i=0;i<3;i++) {s.eggs[i]=clamp(Math.floor(finite(raw.eggs[i])),0,SPECIES[i].goal);s.hatched[i]=s.eggs[i]>=SPECIES[i].goal;}
    for(const k of Object.keys(UPGRADES))s.upgrades[k]=clamp(Math.floor(finite(raw.upgrades?.[k])),0,UPGRADES[k].max);
    s.incubatorResonance=s.upgrades.auto?clamp(Math.floor(finite(raw.incubatorResonance,s.upgrades.resonance)),0,s.upgrades.resonance):0;
    s.offlineRemainder=clamp(finite(raw.offlineRemainder),0,0.999999999);
    if(typeof raw.surgeReadyAt==='number'&&Number.isFinite(raw.surgeReadyAt)){
      s.surgeReadyAt=clamp(raw.surgeReadyAt,0,now+SURGE_COOLDOWN_MS);
      s.surgeUntil=clamp(finite(raw.surgeUntil),0,now+SURGE_DURATION_MS);
    }
    s.lastSeen=clamp(finite(raw.lastSeen,now),0,now);
    s.createdAt=clamp(finite(raw.createdAt,now),0,now);
    s.milestones=Array.isArray(raw.milestones)?[...new Set(raw.milestones.filter(x=>typeof x==='string'&&/^\d-\d+$/.test(x)))]:[];
    for(const k of ['sound','haptics','motion'])if(typeof raw.settings?.[k]==='boolean')s.settings[k]=raw.settings[k];
    if(['eco','balanced','ultra'].includes(raw.settings?.quality))s.settings.quality=raw.settings.quality;
    s.tutorial=raw.tutorial!==false;
    return s;
  }
  function basePower(s){return 1+s.upgrades.power+s.upgrades.resonance;}
  function baseRate(s){return s.upgrades.auto?s.upgrades.auto+s.incubatorResonance:0;}
  function power(s){return basePower(s)+s.hatched.filter(Boolean).length;}
  function rate(s){return baseRate(s);}
  function offlineRate(s){return Math.round(s.upgrades.auto * OFFLINE_GAIN_PER_LEVEL * 100) / 100;}
  function tapPower(s,now=Date.now()){return power(s)*(now<s.surgeUntil?2:1);}
  function surgeStatus(s,now=Date.now()){
    const active=now<s.surgeUntil,remainingMs=Math.max(0,s.surgeReadyAt-now);
    return {active,ready:!active&&remainingMs===0,remainingMs,activeMs:Math.max(0,s.surgeUntil-now),charge:clamp(1-remainingMs/SURGE_COOLDOWN_MS,0,1)};
  }
  function cost(s,k){const u=UPGRADES[k];return !u||s.upgrades[k]>=u.max?Infinity:Math.ceil(u.base*u.scale**s.upgrades[k])*UPGRADE_PRICE_MULTIPLIER;}
  function buy(s,k){const c=cost(s,k);if(s.sparks<c||!Number.isFinite(c))return false;s.sparks-=c;s.upgrades[k]++;if(k==='resonance'&&s.upgrades.auto>0)s.incubatorResonance++;return true;}
  function previewUpgrade(s,k,now=Date.now()){
    if(!Number.isFinite(cost(s,k)))return null;
    const next={...s,upgrades:{...s.upgrades},sparks:cost(s,k)};buy(next,k);
    return {tap:power(next),boostedTap:tapPower(next,now),incubator:rate(next)};
  }
  function cracks(s,i=s.selected){return CRACKS.filter(v=>s.eggs[i]/SPECIES[i].goal>=v).length;}
  function apply(s,amount,i=s.selected){
    amount=Math.max(0,Math.floor(finite(amount)));
    const applied=Math.min(amount,SPECIES[i].goal-s.eggs[i]);
    const before=cracks(s,i);
    s.eggs[i]+=applied;s.sparks+=applied;s.totalEarned+=applied;
    const stage=cracks(s,i), rewards=[];
    for(let n=before+1;n<=stage;n++){
      const id=i+'-'+n;
      if(!s.milestones.includes(id)){s.milestones.push(id);const reward=Math.ceil(SPECIES[i].goal*.0005*n);s.sparks+=reward;rewards.push({stage:n,reward});}
    }
    const hatched=!s.hatched[i]&&s.eggs[i]>=SPECIES[i].goal;
    if(hatched)s.hatched[i]=true;
    return {applied,hatched,rewards,stage};
  }
  function tap(s,now=Date.now()){
    if(s.hatched[s.selected])return {applied:0,hatched:false,rewards:[],stage:10};
    s.manualTaps++;
    return apply(s,tapPower(s,now));
  }
  function surge(s,now=Date.now()){
    if(!surgeStatus(s,now).ready||s.hatched[s.selected])return false;
    s.surgeUntil=now+SURGE_DURATION_MS;s.surgeReadyAt=now+SURGE_COOLDOWN_MS;return true;
  }
  function offline(s,now=Date.now()){
    const seconds=clamp((now-s.lastSeen)/1000,0,8*3600);
    s.lastSeen=now;
    const accrued=seconds*offlineRate(s)+s.offlineRemainder;
    const whole=Math.floor(accrued+1e-9);
    s.offlineRemainder=Math.max(0,accrued-whole);
    return {...apply(s,whole),seconds};
  }
  function progress(s,i=s.selected){return s.eggs[i]/SPECIES[i].goal;}
  return {SPECIES,CRACKS,UPGRADES,REWARDS_USD,OFFLINE_GAIN_PER_LEVEL,SURGE_DURATION_MS,SURGE_COOLDOWN_MS,offlineRate,fresh,normalize,basePower,baseRate,power,rate,tapPower,surgeStatus,previewUpgrade,cost,buy,cracks,apply,tap,surge,offline,progress};
});
