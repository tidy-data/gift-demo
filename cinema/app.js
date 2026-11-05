import * as THREE from './vendor/three/three.module.js';

const $ = id => document.getElementById(id);
const film = $('film'), experience = $('experience');
const canvas = $('particles'), ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const debugTimeout = Number(params.get('timeout'));
const expirySeconds = params.has('timeout') && Number.isFinite(debugTimeout) && debugTimeout >= 1 && debugTimeout <= 300 ? debugTimeout : 60;
const presets = ['愿你被这个世界温柔以待', '祝你生日快乐', '愿所有美好，都如约而至'];
const presetIndex = Math.max(0, Math.min(2, Number.parseInt(params.get('wish') || '1', 10) || 0));
let message = presets[presetIndex];
if (params.has('msg')) {
  const clean = (params.get('msg') || '').replace(/[\u0000-\u001f\u007f<>\\]/g, '').replace(/\s+/g, ' ').trim();
  if (clean) message = Array.from(clean).slice(0, 48).join('');
}
$('blessing').textContent = message;

const state = {
  phase: 'gate', source: '', startedAt: 0, expired: false,
  giftOpened: false, giftTaps: 0, explosionFired: false, blessingFired: false,
  particlesFired: 0, fingerSparks: 0, blessingParticles: 0,
  hapticsFired: false, orientationSwitches: 0,
  fullscreenRequested: false, fullscreenActive: false,
  tiltEnabled: false, frameSamples: 0, frameMeanMs: 0, frameMaxMs: 0
};
let expiryTimer, resumeAfterOrientation = false, videoMode = 'portrait';
let renderer, scene, camera, giftGroup, giftMaterials = [], crackMeshes = [], glowSprite;
let giftClock = 0, giftPunch = 0, giftShake = 0;
let particles = [], textParticles = [], raf = 0, lastFrame = 0;
let textFormationStart = 0, explosionAt = 0, finaleStart = 0, frameN = 0;
let parallaxX = 0, parallaxY = 0, targetTiltX = 0, targetTiltY = 0;
let pointerDown = false, lastPointerX = 0, lastPointerY = 0;
let audioContext, masterGain, perfWindowStart = 0;
const frameTimes = [];
const coarse = matchMedia('(pointer: coarse)').matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = isIOS && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
const lowPower = coarse || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const maxParticles = reducedMotion ? 140 : (lowPower ? 420 : 800);
let qualityScale = lowPower ? 1 : 1.25, slowWindows = 0, qualityChecked = false;

function setHidden(id, hidden) { $(id).classList.toggle('hidden', hidden); }
function chooseSource() { return innerHeight >= innerWidth ? 'portrait' : 'landscape'; }

async function enterFullscreen() {
  state.fullscreenRequested = true;
  const element = document.documentElement;
  const request = element.requestFullscreen || element.webkitRequestFullscreen;
  if (request) {
    try {
      await request.call(element, { navigationUI: 'hide' });
      state.fullscreenActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (coarse && screen.orientation?.lock) {
        const desired = innerHeight >= innerWidth ? 'portrait' : 'landscape';
        try { await screen.orientation.lock(desired); } catch (_) { /* Unsupported locks are harmless. */ }
      }
    } catch (_) { /* The full viewport remains as fallback. */ }
  }
  if (isSafari && !navigator.standalone && !window.matchMedia('(display-mode: fullscreen)').matches && !window.matchMedia('(display-mode: standalone)').matches) {
    setHidden('ios-hint', false);
    setTimeout(() => setHidden('ios-hint', true), 5200);
  }
}

function onFullscreenChange() {
  state.fullscreenActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if(!state.fullscreenActive && screen.orientation?.unlock){try{screen.orientation.unlock()}catch(_){}}
  resize();
}

async function requestTilt() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') return;
    }
    if (typeof DeviceOrientationEvent === 'undefined') return;
    window.addEventListener('deviceorientation', event => {
      if (event.gamma == null || event.beta == null) return;
      targetTiltX = THREE.MathUtils.clamp(event.gamma / 35, -1, 1);
      targetTiltY = THREE.MathUtils.clamp((event.beta - 40) / 45, -1, 1);
      state.tiltEnabled = true;
    }, { passive: true });
  } catch (_) { /* Finger parallax remains available. */ }
}

function loadFilm() {
  const next = chooseSource();
  if (videoMode === next && film.getAttribute('src')) return;
  const previousTime = film.currentTime || 0;
  const shouldResume = state.giftOpened && !state.expired && !film.paused;
  videoMode = next; state.source = next;
  if (state.startedAt) { resumeAfterOrientation = shouldResume; state.orientationSwitches++; }
  film.src = `./cinema-${next}.mp4`; film.load();
  film.addEventListener('loadedmetadata', function restore() {
    film.removeEventListener('loadedmetadata', restore);
    if (state.giftOpened && previousTime > 0) film.currentTime = Math.min(previousTime, film.duration - .05);
    if (resumeAfterOrientation && !state.expired) film.play().catch(showError);
    resumeAfterOrientation = false; setHidden('loading', true);
  });
}

function showError() {
  setHidden('loading', true); setHidden('error', false);
  $('error-detail').textContent = '背景暂时未能载入，请检查网络后重试。';
  state.phase = 'error';
  console.warn('Cinematic backdrop playback interrupted');
}

function initAudio() {
  if (audioContext) { audioContext.resume().catch(() => {}); return; }
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain(); masterGain.gain.value = .42; masterGain.connect(audioContext.destination);
    const notes = [146.832, 174.614, 220, 293.665];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.value = .012 / (i + 1);
      oscillator.connect(gain); gain.connect(masterGain); oscillator.start();
    });
  } catch (_) { /* The video has its own original soundtrack. */ }
}
function sound(kind) {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.type = kind === 'burst' ? 'sawtooth' : 'sine';
  oscillator.frequency.setValueAtTime(kind === 'burst' ? 100 : 330 + state.giftTaps * 110, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'burst' ? 32 : 110, now + (kind === 'burst' ? 1.2 : .3));
  gain.gain.setValueAtTime(kind === 'burst' ? .65 : .18, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 'burst' ? 1.5 : .35));
  oscillator.connect(gain); gain.connect(masterGain); oscillator.start(now); oscillator.stop(now + 1.6);
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gradient = g.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,249,216,1)'); gradient.addColorStop(.12,'rgba(255,211,119,.8)');
  gradient.addColorStop(.38,'rgba(237,154,48,.2)'); gradient.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = gradient; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
}

function initGift() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('gift-canvas'), alpha: true, antialias: !lowPower, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2)*qualityScale);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .1, 100);
    camera.position.set(4.2, 2.9, 7.2); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0x6d8fc7, 0x0d0905, 1.6));
    const key = new THREE.DirectionalLight(0xffdb98, 4); key.position.set(3,5,5); scene.add(key);
    const rim = new THREE.PointLight(0x629eff, 30, 20); rim.position.set(-4,1,-2); scene.add(rim);
    const goldLight = new THREE.PointLight(0xffb64a, 20, 8); goldLight.position.set(0,-1,2); scene.add(goldLight);
    giftGroup = new THREE.Group(); scene.add(giftGroup);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x101a2e, roughness: .34, metalness: .55, emissive: 0x4d2604, emissiveIntensity: .08 });
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xd8a34e, roughness: .24, metalness: .88, emissive: 0x6d3404, emissiveIntensity: .13 });
    giftMaterials = [bodyMat, ribbonMat];
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.35,1.75,2.05), bodyMat); body.position.y = -.05; giftGroup.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.48,.23,2.18), bodyMat); lid.position.y = .89; giftGroup.add(lid);
    const ribbon1 = new THREE.Mesh(new THREE.BoxGeometry(.31,2.03,2.09), ribbonMat); ribbon1.position.y = .015; giftGroup.add(ribbon1);
    const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(2.39,2.03,.31), ribbonMat); ribbon2.position.y = .015; giftGroup.add(ribbon2);
    const ribbonTop1 = new THREE.Mesh(new THREE.BoxGeometry(.32,.07,2.3), ribbonMat); ribbonTop1.position.y = 1.04; giftGroup.add(ribbonTop1);
    const ribbonTop2 = new THREE.Mesh(new THREE.BoxGeometry(2.56,.07,.32), ribbonMat); ribbonTop2.position.y = 1.04; giftGroup.add(ribbonTop2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,1.06,0),new THREE.Vector3(-.4,1.56,.03),new THREE.Vector3(-1.03,1.51,.02),
      new THREE.Vector3(-.91,1.16,0),new THREE.Vector3(0,1.06,0)
    ]);
    const leftBow = new THREE.Mesh(new THREE.TubeGeometry(curve,24,.085,6,false),ribbonMat); giftGroup.add(leftBow);
    const rightBow = leftBow.clone(); rightBow.scale.x = -1; giftGroup.add(rightBow);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),ribbonMat); knot.scale.set(1.3,.75,.9); knot.position.y = 1.12; giftGroup.add(knot);
    glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .65 }));
    glowSprite.scale.set(6.5,6.5,1); glowSprite.position.z = -.6; giftGroup.add(glowSprite);
    createCracks(); resizeRenderer();
  } catch (error) {
    console.warn('WebGL unavailable; keeping interactive canvas effects', error.message);
    renderer = null;
  }
}

function createCracks() {
  const material = new THREE.MeshBasicMaterial({ color: 0xffd681, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const points = []; const x = -1 + (i % 5) * .43;
    for (let j = 0; j < 5; j++) points.push(new THREE.Vector3(x + Math.sin(i*3+j*2.1)*.16, -.76 + j*.35, 1.037));
    const curve = new THREE.CatmullRomCurve3(points);
    const crack = new THREE.Mesh(new THREE.TubeGeometry(curve,10,.007+(i%3)*.002,3,false),material);
    crack.visible = false; giftGroup.add(crack); crackMeshes.push(crack);
  }
  for (let i = 0; i < 4; i++) {
    const points = []; const y = -.62 + i*.42;
    for (let j = 0; j < 5; j++) points.push(new THREE.Vector3(1.183,y+Math.sin(j*2+i)*.13,-.85+j*.42));
    const crack = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,.008,3,false),material);
    crack.visible = false; giftGroup.add(crack); crackMeshes.push(crack);
  }
}

function resizeRenderer() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2)*qualityScale);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(4.2,2.9,innerWidth < innerHeight ? 7.7 : 7.1);
  camera.updateProjectionMatrix(); camera.lookAt(0,0,0);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2)*qualityScale;
  canvas.width = Math.round(innerWidth*dpr); canvas.height = Math.round(innerHeight*dpr);
  canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0); resizeRenderer(); loadFilm();
}

async function begin() {
  $('gate').style.transition='none';
  await enterFullscreen();
  initAudio(); requestTilt();
  clearTimeout(expiryTimer);
  setHidden('error',true); setHidden('gate',true); setHidden('expired',true); setHidden('finale',true); setHidden('opening',false);
  setHidden('tap-prompt',false); setHidden('gift-hit',false); setHidden('sound',false);
  experience.classList.remove('blessing-particle-mode','burst-live');
  experience.classList.add('playing','gift-live'); experience.classList.remove('gift-opened');
  Object.assign(state,{ phase:'waiting', startedAt:performance.now(), expired:false, giftOpened:false, giftTaps:0,
    explosionFired:false, blessingFired:false, hapticsFired:false, particlesFired:0, fingerSparks:0, blessingParticles:0 });
  $('tap-count').textContent = 'TAP TO CRACK · 0 / 3';
  particles = []; textParticles = []; giftPunch = 0; giftShake = 0; giftClock = 0;
  frameTimes.length=0; perfWindowStart=performance.now(); state.frameSamples=0; state.frameMeanMs=0; state.frameMaxMs=0;
  crackMeshes.forEach(c=>c.visible=false);
  if (giftMaterials[0]) giftMaterials[0].emissiveIntensity = .08;
  film.pause(); film.currentTime = 0; film.muted = true;
  expiryTimer = setTimeout(expire, expirySeconds*1000);
  if (!raf) { lastFrame=performance.now(); raf=requestAnimationFrame(draw); }
}

function giftPosition() { return { x:innerWidth*.5, y:innerHeight*.49 }; }
function tapGift() {
  if (state.expired || state.giftOpened || !['waiting','cracking'].includes(state.phase)) return;
  state.giftTaps++; state.phase='cracking'; state.particlesFired+=1;
  const visible = state.giftTaps === 1 ? 4 : state.giftTaps === 2 ? 9 : crackMeshes.length;
  crackMeshes.forEach((c,i)=>c.visible=i<visible);
  if (giftMaterials[0]) giftMaterials[0].emissiveIntensity = .12+state.giftTaps*.5;
  giftPunch = 1; giftShake = .11+state.giftTaps*.04;
  const p=giftPosition(); burst(p.x,p.y,24+state.giftTaps*10,false);
  if(navigator.vibrate)navigator.vibrate(22+state.giftTaps*10);
  sound('tap'); $('tap-count').textContent=`TAP TO CRACK · ${state.giftTaps} / 3`;
  if(state.giftTaps>=3) openGift();
}

function openGift() {
  if(state.giftOpened || state.expired)return;
  state.giftOpened=true; state.phase='explosion'; state.explosionFired=true; state.hapticsFired=true;
  explosionAt=performance.now(); experience.classList.add('gift-opened','burst-live');
  setHidden('tap-prompt',true); setHidden('gift-hit',true);
  const p=giftPosition(); burst(p.x,p.y,reducedMotion?60:(lowPower?160:300),true);
  if(navigator.vibrate)navigator.vibrate([50,35,110]); sound('burst');
  film.currentTime=10.9; film.muted=false; film.volume=.88;
  film.play().catch(()=>{film.muted=true;film.play().catch(showError)});
  $('flash').animate([{opacity:0},{opacity:.88,offset:.08},{opacity:0}],{duration:850,easing:'ease-out'});
  if(!reducedMotion)experience.animate([
    {transform:'translate(0,0)'},{transform:'translate(-11px,7px)'},{transform:'translate(10px,-7px)'},
    {transform:'translate(-6px,-3px)'},{transform:'translate(3px,2px)'},{transform:'translate(0,0)'}
  ],{duration:850,easing:'ease-out'});
  if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(draw)}
}

function onTime() {
  if(state.expired || state.phase==='gate' || state.phase==='error')return;
  const t=film.currentTime;
  if(state.giftOpened && t>=19.0 && !state.blessingFired)showBlessing();
  if(film.ended && state.giftOpened){state.phase='finale';setHidden('finale',false);setHidden('sound',true)}
}
function showBlessing() {
  state.blessingFired=true; state.phase='finale'; setHidden('finale',false);
  experience.classList.add('blessing-particle-mode');
  makeTextParticles(); finaleStart=performance.now();
}
function expire() {
  if(state.expired)return;
  state.expired=true; state.phase='expired'; clearTimeout(expiryTimer); film.pause();
  setHidden('opening',true); setHidden('finale',true); setHidden('sound',true); setHidden('loading',true); setHidden('expired',false);
  if(navigator.vibrate)navigator.vibrate(0);
}

function burst(x,y,count,powerful) {
  const allowed=Math.min(count,Math.max(0,maxParticles-particles.length));
  const colors=['#fff8dc','#f5d28c','#e9ae54','#a9d9ff'];
  for(let i=0;i<allowed;i++){
    const angle=Math.random()*Math.PI*2, speed=(powerful?110:35)+Math.random()*(powerful?480:100);
    particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-(powerful?20:8),age:0,
      life:.55+Math.random()*(powerful?1.7:.8),size:.7+Math.random()*(powerful?3:2),color:colors[i%4],gravity:powerful?30:8});
  }
  state.particlesFired+=allowed;
  if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(draw)}
}
function fingerSpray(x,y,dx,dy) {
  if(state.expired || state.phase==='gate' || state.phase==='error')return;
  const count=lowPower?5:9;
  for(let i=0;i<count && particles.length<maxParticles;i++){
    const angle=Math.atan2(dy,dx)+Math.PI+(Math.random()-.5)*2.8;
    const speed=30+Math.random()*130;
    particles.push({x:x+(Math.random()-.5)*8,y:y+(Math.random()-.5)*8,vx:Math.cos(angle)*speed-dx*3,
      vy:Math.sin(angle)*speed-dy*3,age:0,life:.35+Math.random()*.8,size:.5+Math.random()*1.9,
      color:i%3===0?'#fff8d2':'#efbc63',gravity:15});
  }
  state.fingerSparks+=count; state.particlesFired+=count;
  targetTiltX=(x/innerWidth-.5)*2;targetTiltY=(y/innerHeight-.5)*2;
  if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(draw)}
}

function makeTextParticles() {
  const w=Math.min(innerWidth-24,850),h=Math.min(200,innerHeight*.24);
  const c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);
  const g=c.getContext('2d',{willReadFrequently:true});
  let fontSize=Math.min(innerWidth<innerHeight?46:52, w/Math.max(5,Array.from(message).length)*1.3);
  g.font=`700 ${fontSize}px "Songti SC","Noto Serif CJK SC","STSong",serif`;
  g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff';
  const lines=message.length>18?[message.slice(0,Math.ceil(message.length/2)),message.slice(Math.ceil(message.length/2))]:[message];
  lines.forEach((line,i)=>g.fillText(line,c.width/2,c.height/2+(i-(lines.length-1)/2)*fontSize*1.45,w-8));
  const pixels=g.getImageData(0,0,c.width,c.height).data, points=[];
  const step=lowPower?3:3;
  for(let y=0;y<c.height;y+=step)for(let x=0;x<c.width;x+=step){
    if(pixels[(y*c.width+x)*4+3]>100)points.push({x:x+(innerWidth-c.width)/2,y:y+innerHeight*.59});
  }
  const cap=lowPower?1900:3000;
  const stride=Math.max(1,Math.ceil(points.length/cap));
  textParticles=points.filter((_,i)=>i%stride===0).map((p,i)=>{
    const a=Math.random()*Math.PI*2,r=Math.max(innerWidth,innerHeight)*(.45+Math.random()*.45);
    return {...p,sx:innerWidth/2+Math.cos(a)*r,sy:innerHeight/2+Math.sin(a)*r,size:.85+Math.random()*1.15,delay:Math.random()*.35};
  });
  state.blessingParticles=textParticles.length; textFormationStart=performance.now();
}

function drawGift(now,dt) {
  if(!renderer || !giftGroup || state.giftOpened || state.phase==='gate' || state.phase==='expired')return;
  giftClock+=dt; giftPunch=Math.max(0,giftPunch-dt*2.8);giftShake=Math.max(0,giftShake-dt*.25);
  parallaxX+=(targetTiltX-parallaxX)*dt*3;parallaxY+=(targetTiltY-parallaxY)*dt*3;
  giftGroup.position.y=Math.sin(giftClock*1.35)*.07-.12;
  giftGroup.rotation.y=-.35+Math.sin(giftClock*.5)*.09+parallaxX*.13;
  giftGroup.rotation.x=Math.sin(giftClock*.7)*.025+parallaxY*.06;
  giftGroup.rotation.z=Math.sin(now*.061)*giftShake;
  const scale=1+giftPunch*.055;giftGroup.scale.setScalar(scale);
  if(glowSprite)glowSprite.material.opacity=.42+Math.sin(giftClock*2)*.08+state.giftTaps*.13;
  renderer.render(scene,camera);
}

function draw(now) {
  const rawDt=(now-lastFrame)/1000;lastFrame=now;
  const dt=Math.min(rawDt,.04);
  if(rawDt<.2 && now-perfWindowStart>1200 && state.phase!=='gate'){
    const ms=rawDt*1000;frameTimes.push(ms);if(frameTimes.length>600)frameTimes.shift();
    state.frameSamples=frameTimes.length;state.frameMeanMs=frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length;
    state.frameMaxMs=Math.max(...frameTimes);
    if(!qualityChecked && now-perfWindowStart>5000){
      qualityChecked=true;
      if(state.frameMeanMs>25 && qualityScale>.65){qualityScale=.72;resize();}
    }
  }
  if(document.hidden){raf=0;return}
  ctx.clearRect(0,0,innerWidth,innerHeight);
  drawGift(now,dt);
  if(particles.length){
    ctx.save();ctx.globalCompositeOperation='lighter';
    particles=particles.filter(p=>{
      p.age+=dt;if(p.age>=p.life)return false;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.983;p.vy=p.vy*.983+p.gravity*dt;
      const a=(1-p.age/p.life)**1.5;
      ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=lowPower?3:7;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*(1-p.age/p.life*.45),0,Math.PI*2);ctx.fill();return true;
    });ctx.restore();
  }
  if(textParticles.length){
    const elapsed=(now-textFormationStart)/1000;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const textGlow=ctx.createRadialGradient(innerWidth/2,innerHeight*.72,0,innerWidth/2,innerHeight*.72,innerWidth*.48);
    textGlow.addColorStop(0,'rgba(240,185,88,.10)');textGlow.addColorStop(1,'rgba(240,185,88,0)');
    ctx.fillStyle=textGlow;ctx.fillRect(0,innerHeight*.5,innerWidth,innerHeight*.4);
    for(const p of textParticles){
      const t=Math.max(0,Math.min(1,(elapsed-p.delay)/2.3));
      const ease=1-Math.pow(1-t,3);
      const drift=t<1?0:Math.sin(now*.001+p.x)*.3;
      const x=p.sx+(p.x-p.sx)*ease+parallaxX*9*(1-t*.6)+drift;
      const y=p.sy+(p.y-p.sy)*ease+parallaxY*7*(1-t*.6);
      ctx.globalAlpha=Math.min(1,t*2.5)*(.78+Math.sin(now*.003+p.x)*.16);
      ctx.fillStyle='#ffe6b0';ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(x,y,p.size,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  const activeGift=renderer && !state.giftOpened && !['gate','expired','error'].includes(state.phase);
  raf=(particles.length || textParticles.length || activeGift)?requestAnimationFrame(draw):0;
}

function onPointerDown(event) {
  if(event.target.closest('button'))return;
  pointerDown=true;lastPointerX=event.clientX;lastPointerY=event.clientY;
  fingerSpray(event.clientX,event.clientY,0,0);
}
function onPointerMove(event) {
  if(!pointerDown)return;
  const dx=event.clientX-lastPointerX,dy=event.clientY-lastPointerY;
  if(Math.hypot(dx,dy)<3)return;
  fingerSpray(event.clientX,event.clientY,dx,dy);
  lastPointerX=event.clientX;lastPointerY=event.clientY;
}
function endPointer(){pointerDown=false}

$('begin').addEventListener('click',begin);
$('gift-hit').addEventListener('click',tapGift);
$('replay').addEventListener('click',begin);
$('reopen').addEventListener('click',begin);
$('retry').addEventListener('click',()=>location.reload());
$('sound').addEventListener('click',()=>{film.muted=!film.muted;$('sound').setAttribute('aria-pressed',String(film.muted));$('sound').textContent=film.muted?'×':'♪'});
experience.addEventListener('pointerdown',onPointerDown,{passive:true});
experience.addEventListener('pointermove',onPointerMove,{passive:true});
window.addEventListener('pointerup',endPointer,{passive:true});window.addEventListener('pointercancel',endPointer,{passive:true});
film.addEventListener('timeupdate',onTime);film.addEventListener('ended',onTime);film.addEventListener('error',showError);
film.addEventListener('waiting',()=>{if(state.giftOpened&&!state.expired)setHidden('loading',false)});
film.addEventListener('playing',()=>setHidden('loading',true));film.addEventListener('canplay',()=>setHidden('loading',true));
document.addEventListener('fullscreenchange',onFullscreenChange);document.addEventListener('webkitfullscreenchange',onFullscreenChange);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(!film.paused){film.pause();resumeAfterOrientation=true}if(raf){cancelAnimationFrame(raf);raf=0}}
  else {if(resumeAfterOrientation&&!state.expired){film.play().catch(showError);resumeAfterOrientation=false}if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(draw)}}
});
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,150));
film.muted=true;initGift();resize();
window.cinemaDebug={state,get expirySeconds(){return expirySeconds},get blessing(){return message},get videoTime(){return film.currentTime},get source(){return videoMode},
  get activeParticles(){return particles.length},get textParticles(){return textParticles.length},get renderer(){return renderer?'webgl':'canvas-fallback'}};
