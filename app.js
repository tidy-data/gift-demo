import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GiftAudio } from './audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const safeText = (key, fallback, max) => { try { return (params.get(key) || fallback).trim().slice(0, max) || fallback; } catch { return fallback; } };
const gift = { to: safeText('to','小美',24), from: safeText('from','阿明',24), msg: safeText('msg','生日快乐！\n愿你的每一天都像星河一样闪耀。',160) };
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const lowPower = mobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debugTimeout = Math.min(60, Math.max(1, Number(params.get('timeout')) || 60));
const debugSpeed = params.has('fast') ? 2.2 : 1;
const testQuality = params.get('quality') === 'test';
const audio = new GiftAudio();
const state = { phase:'intro', time:0, phaseTime:0, landed:false, muted:false, frames:0, fpsTime:0, fps:0, width:innerWidth, height:innerHeight };
let renderer, scene, camera, composer, bloom, film, clock, giftRoot, lid, galaxy, nameParticles, stars, floor, dust, shockwave, coreLight;
let fragments = [], cracks = [], nebulae = [], meteors = [], resizeTimer;
let elapsed = 0, last = performance.now(), explosionLight;
const easeOut = t => 1 - Math.pow(1 - THREE.MathUtils.clamp(t,0,1),3);
const easeInOut = t => { t=THREE.MathUtils.clamp(t,0,1); return t*t*(3-2*t); };
const rand = (a,b) => a + Math.random()*(b-a);
const setPhase = phase => { state.phase=phase; state.phaseTime=0; document.body.dataset.phase=phase; };

// Read-only diagnostics used by the automated flow test.
window.giftDemo = { freeze:()=>state.paused=true,resume:()=>{state.paused=false;last=performance.now();}, get state() { return { phase:state.phase, phaseTime:state.phaseTime, fps:state.fps, mobile:lowPower, to:gift.to, triangles:renderer?.info.render.triangles, points:renderer?.info.render.points }; } };

async function init() {
  try {
    await document.fonts.load('32px StarSerif', '星河降临生日快乐');
    renderer = new THREE.WebGLRenderer({ canvas:$('stage'), antialias:!lowPower, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer:testQuality });
    renderer.setPixelRatio(testQuality ? .4 : Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#02030b'); scene.fog = new THREE.FogExp2('#03040d',.028);
    camera = new THREE.PerspectiveCamera(mobile ? 47 : 40, innerWidth/innerHeight, .1, 130);
    camera.position.set(0,1.6, mobile ? 8.8 : 8.2); camera.lookAt(0,.8,0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(); scene.environment = pmrem.fromScene(room,.035).texture; room.dispose(); pmrem.dispose();
    setupLights(); createBackground(); createGift(); createGalaxy(); createName();
    const target = new THREE.WebGLRenderTarget(innerWidth,innerHeight,{ type:THREE.HalfFloatType, samples:0 });
    composer = new EffectComposer(renderer,target); composer.addPass(new RenderPass(scene,camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), lowPower?.62:.8,.65,.76); composer.addPass(bloom);
    film = new ShaderPass({
      uniforms:{ tDiffuse:{value:null}, time:{value:0}, grain:{value:lowPower?.018:.026}, aberration:{value:.00065} },
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform float time;uniform float grain;uniform float aberration;varying vec2 vUv;
      float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time)*43758.5453);}
      void main(){vec2 p=vUv-.5;float d=dot(p,p);vec2 shift=p*aberration*d*8.;float r=texture2D(tDiffuse,vUv+shift).r;float g=texture2D(tDiffuse,vUv).g;float b=texture2D(tDiffuse,vUv-shift).b;vec3 col=vec3(r,g,b);col*=1.-d*.58;col+=(random(vUv*900.)-.5)*grain;gl_FragColor=vec4(col,1.);}`
    }); composer.addPass(film); composer.addPass(new OutputPass());
    resize(); addEventListener('resize',()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(resize,80); });
    document.addEventListener('visibilitychange',()=>{last=performance.now();});
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showError('图形渲染暂时中断，请刷新重试。');});
    $('loading').style.opacity='0'; setTimeout(()=>$('loading').classList.add('hidden'),750);
    requestAnimationFrame(animate);
  } catch(e) { console.error('Gift initialization failed',e); showError('当前浏览器无法开启 3D 效果，请使用最新版 Safari、Chrome 或 Edge。'); }
}
function setupLights(){
  scene.add(new THREE.HemisphereLight('#a9bdff','#110c21',1.0));
  const key=new THREE.SpotLight('#ffe2ae',75,25,Math.PI/5,.65,1.5);key.position.set(-3,6,5);key.target.position.set(0,.6,0);scene.add(key,key.target);
  const rim=new THREE.SpotLight('#6b7fff',85,24,Math.PI/4,.7,1.6);rim.position.set(4,4,-3);rim.target.position.set(0,.8,0);scene.add(rim,rim.target);
  const front=new THREE.PointLight('#ffc880',7,8,2);front.position.set(0,1,4);scene.add(front);
  coreLight=new THREE.PointLight('#e9d7ff',0,9,1.6);coreLight.position.set(0,1.1,0);scene.add(coreLight);
  explosionLight=new THREE.PointLight('#c5d9ff',0,45,1.4);explosionLight.position.set(0,1,0);scene.add(explosionLight);
}
function canvasTexture(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function radialTexture(inner='#ffffff',middle='#819cff') {return canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,inner);g.addColorStop(.08,inner);g.addColorStop(.28,middle+'88');g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},128,128);}
function createBackground(){
  const count=lowPower?1300:3000, positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){positions[i*3]=rand(-48,48);positions[i*3+1]=rand(-26,32);positions[i*3+2]=rand(-65,-10);const c=new THREE.Color().setHSL(rand(.53,.72),rand(.1,.6),rand(.45,.9));c.toArray(colors,i*3);sizes[i]=rand(.6,2.2);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  stars=new THREE.Points(geo,new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:.7},uPixel:{value:renderer.getPixelRatio()}},vertexShader:`attribute float aSize;attribute vec3 color;varying vec3 vColor;uniform float uTime;uniform float uPixel;void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPixel*(80./-mv.z)*(0.8+0.2*sin(uTime+position.x));gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec3 vColor;uniform float uOpacity;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vColor*1.6,a*uOpacity);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(stars);
  const map=radialTexture('#c5ccff','#4b5799');for(let i=0;i<(lowPower?6:12);i++){const m=new THREE.SpriteMaterial({map,color:i%2?'#393e90':'#563471',transparent:true,opacity:.11,depthWrite:false,blending:THREE.AdditiveBlending});const s=new THREE.Sprite(m);s.position.set(rand(-17,17),rand(-9,10),rand(-30,-16));s.scale.setScalar(rand(8,19));scene.add(s);nebulae.push(s);}
}
function createGift(){
  giftRoot=new THREE.Group();giftRoot.position.y=7;scene.add(giftRoot);
  const lacquer=new THREE.MeshPhysicalMaterial({color:'#111932',metalness:.44,roughness:.23,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.5});
  const gold=new THREE.MeshStandardMaterial({color:'#d5ac57',metalness:.86,roughness:.23,envMapIntensity:2.1});
  const goldSoft=new THREE.MeshPhysicalMaterial({color:'#b88740',metalness:.72,roughness:.29,clearcoat:.8});
  const body=new THREE.Mesh(new RoundedBoxGeometry(1.6,1.3,1.6,4,.07),lacquer);body.position.y=0;giftRoot.add(body);
  const lowerTrim=new THREE.Mesh(new RoundedBoxGeometry(1.63,.055,1.63,3,.024),goldSoft);lowerTrim.position.y=-.57;giftRoot.add(lowerTrim);
  const ribbonV=new THREE.Mesh(new THREE.BoxGeometry(.23,1.315,1.617),gold);giftRoot.add(ribbonV);
  const ribbonCross=new THREE.Mesh(new THREE.BoxGeometry(1.617,1.315,.23),gold);giftRoot.add(ribbonCross);
  lid=new THREE.Group();lid.position.y=.75;giftRoot.add(lid);
  const lidMesh=new THREE.Mesh(new RoundedBoxGeometry(1.78,.27,1.78,4,.055),lacquer);lid.add(lidMesh);
  const lidTrim=new THREE.Mesh(new RoundedBoxGeometry(1.8,.047,1.8,3,.02),gold);lidTrim.position.y=-.1;lid.add(lidTrim);
  const lidRibbon=new THREE.Mesh(new THREE.BoxGeometry(.24,.283,1.79),gold);lid.add(lidRibbon);
  const lidCross=new THREE.Mesh(new THREE.BoxGeometry(1.79,.283,.24),gold);lid.add(lidCross);
  // Sculpted metallic ribbon loops and curled tails.
  for(const side of [-1,1]){
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.9,0),new THREE.Vector3(side*.24,1.25,.04),new THREE.Vector3(side*.69,1.32,.03),new THREE.Vector3(side*.72,1.04,.02),new THREE.Vector3(side*.35,1.02,.04),new THREE.Vector3(0,.94,0)]);
    const loop=new THREE.Mesh(new THREE.TubeGeometry(path,36,.066,8,false),gold);loop.scale.z=1.6;giftRoot.add(loop);
    const tailPath=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.07,.96,.08),new THREE.Vector3(side*.28,.96,.24),new THREE.Vector3(side*.49,.88,.42),new THREE.Vector3(side*.57,.82,.62)]);
    const tail=new THREE.Mesh(new THREE.TubeGeometry(tailPath,22,.055,6,false),goldSoft);giftRoot.add(tail);
  }
  const knot=new THREE.Mesh(new THREE.SphereGeometry(.15,20,14),gold);knot.scale.set(1.35,.8,1);knot.position.y=.98;giftRoot.add(knot);
  // Fine decorative gold lines around the box edges.
  const edgeMat=new THREE.LineBasicMaterial({color:'#d1ad6a',transparent:true,opacity:.34});
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.595,1.295,1.595),35),edgeMat);giftRoot.add(edges);
  floor=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:'#070916',metalness:.65,roughness:.34,transparent:true,opacity:.85}));floor.rotation.x=-Math.PI/2;floor.position.y=-.69;scene.add(floor);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.5,4.5),new THREE.MeshBasicMaterial({map:radialTexture('#000000','#000000'),transparent:true,opacity:.75,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.675;scene.add(shadow);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.6,1.608,100),new THREE.MeshBasicMaterial({color:'#8276b9',transparent:true,opacity:.16,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.667;scene.add(ring);
  createDust(); createCracks();
}
function createDust(){
  const n=lowPower?90:180,geo=new THREE.BufferGeometry(),p=new Float32Array(n*3),v=[];for(let i=0;i<n;i++){p[i*3]=rand(-.7,.7);p[i*3+1]=-.58;p[i*3+2]=rand(-.7,.7);v.push(new THREE.Vector3(rand(-1.8,1.8),rand(.15,1.2),rand(-1.8,1.8)));}
  geo.setAttribute('position',new THREE.BufferAttribute(p,3));dust=new THREE.Points(geo,new THREE.PointsMaterial({color:'#e0caa0',size:.025,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));dust.userData.vel=v;scene.add(dust);
}
function createCracks(){
  const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(3.3,2.25,1.05),transparent:true,opacity:0,depthWrite:false});
  // Branching paths sit just above the front and right faces of the lacquered box.
  const paths=[
    [[.12,.65,.807],[.03,.38,.814],[.23,.16,.814],[.07,-.1,.814],[.22,-.39,.814],[.1,-.65,.814]],
    [[.03,.38,.817],[-.23,.24,.817],[-.39,.35,.817],[-.66,.21,.817]],
    [[.07,-.1,.818],[-.19,-.22,.818],[-.37,-.13,.818],[-.61,-.38,.818]],
    [[.23,.16,.818],[.49,.06,.818],[.62,.24,.818],[.77,.16,.818]],
    [[.812,.53,.18],[.818,.22,.05],[.818,.03,.29],[.818,-.21,.13],[.818,-.54,.4]],
    [[.818,.03,.29],[.818,.1,.55],[.818,-.12,.72]],
    [[-.45,.82,.89],[-.27,.83,.55],[.02,.84,.33],[.23,.84,.05],[.4,.84,-.35]],
    [[.02,.84,.33],[-.13,.85,.03],[-.38,.85,-.18]]
  ];
  paths.forEach((raw,i)=>{const curve=new THREE.CatmullRomCurve3(raw.map(a=>new THREE.Vector3(...a)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,raw.length*6,.009+(i===0?.006:0),4,false),mat.clone());mesh.userData.delay=i*.13;mesh.scale.setScalar(.001);giftRoot.add(mesh);cracks.push(mesh);});
  const inner=new THREE.Mesh(new THREE.SphereGeometry(.48,20,12),new THREE.MeshBasicMaterial({color:new THREE.Color(3.8,2.9,1.8),transparent:true,opacity:0}));inner.position.y=.1;giftRoot.add(inner);giftRoot.userData.inner=inner;
}
function createGalaxy(){
  const count=lowPower?34000:88000,positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),seeds=new Float32Array(count);
  const colorA=new THREE.Color('#ffc78a'),colorB=new THREE.Color('#eee6ff'),colorC=new THREE.Color('#728cff'),colorD=new THREE.Color('#bc6ee8');
  for(let i=0;i<count;i++){
    const arm=i%4,r=Math.pow(Math.random(),.56)*12,angle=r*.59+arm*Math.PI/2+rand(-.22,.22)*(1-r/17),spread=(.2+r*.037)*rand(-1,1);
    positions[i*3]=Math.cos(angle)*r+Math.cos(angle+Math.PI/2)*spread;
    positions[i*3+1]=rand(-1,1)*(.2+r*.026)*(Math.random()<.05?3:1);
    positions[i*3+2]=Math.sin(angle)*r+Math.sin(angle+Math.PI/2)*spread;
    const t=Math.min(1,r/9);let c;
    if(r<2)c=colorA.clone().lerp(colorB,r/2);else c=colorB.clone().lerp(Math.random()<.26?colorD:colorC,t);
    c.multiplyScalar(rand(.32,1.18));c.toArray(colors,i*3);sizes[i]=Math.random()<.025?rand(2.2,3.8):rand(.55,1.65);seeds[i]=Math.random()*10;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));geo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:0},uPixel:{value:renderer.getPixelRatio()}},vertexShader:`attribute vec3 color;attribute float aSize;attribute float aSeed;uniform float uTime;uniform float uPixel;varying vec3 vColor;varying float vTwinkle;void main(){vec3 p=position;float a=uTime*.012*(1.-smoothstep(0.,12.,length(p.xz)));float c=cos(a),s=sin(a);p.xz=mat2(c,-s,s,c)*p.xz;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(9.,aSize*uPixel*(24./-mv.z));vColor=color;vTwinkle=.76+.24*sin(uTime*.8+aSeed);}`,fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vTwinkle;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);if(d>.5)discard;float a=exp(-d*d*18.)*vTwinkle;gl_FragColor=vec4(vColor*1.22,a*uOpacity);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  galaxy=new THREE.Points(geo,mat);galaxy.position.set(0,.7,-6);galaxy.rotation.x=.61;galaxy.rotation.z=-.15;scene.add(galaxy);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTexture('#fff1d2','#a37ade'),color:'#d9c6ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));glow.position.copy(galaxy.position);glow.scale.set(8,8,1);scene.add(glow);galaxy.userData.glow=glow;
  for(let i=0;i<6;i++){const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(-1.5,.5,0)]);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#c6d6ff',transparent:true,opacity:0,blending:THREE.AdditiveBlending}));line.userData={start:rand(0,7),x:rand(-7,7),y:rand(0,6),z:rand(-4,0)};scene.add(line);meteors.push(line);}
}
function createName(){
  const c=document.createElement('canvas');c.width=1200;c.height=300;const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  let fontSize=180;ctx.font=`400 ${fontSize}px StarSerif,"Noto Serif CJK SC",serif`;
  const width=ctx.measureText(gift.to).width;if(width>1030){fontSize*=1030/width;ctx.font=`400 ${fontSize}px StarSerif,"Noto Serif CJK SC",serif`;}
  ctx.fillText(gift.to,600,155);
  const data=ctx.getImageData(0,0,c.width,c.height).data,candidates=[];
  for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2)if(data[(y*c.width+x)*4+3]>100)candidates.push([x,y]);
  const count=Math.min(lowPower?6000:13000,Math.max(2000,candidates.length*2)),start=new Float32Array(count*3),target=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
  const worldWidth=mobile?4.5:6.2,scale=worldWidth/c.width;
  for(let i=0;i<count;i++){
    const q=candidates[Math.floor(Math.random()*candidates.length)]||[600,150],r=rand(2,12),a=rand(0,Math.PI*2);
    start[i*3]=Math.cos(a)*r;start[i*3+1]=rand(-4,5);start[i*3+2]=rand(-7,-1);
    target[i*3]=(q[0]-600)*scale+rand(-.005,.005);target[i*3+1]=(150-q[1])*scale+.7;target[i*3+2]=1.4+rand(-.05,.05);
    const color=new THREE.Color().setHSL(rand(.09,.17),rand(.12,.43),rand(.72,1));color.multiplyScalar(rand(1.1,2));color.toArray(colors,i*3);sizes[i]=rand(.9,2.2);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(start,3));geo.setAttribute('aTarget',new THREE.BufferAttribute(target,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uProgress:{value:0},uOpacity:{value:0},uPixel:{value:renderer.getPixelRatio()}},vertexShader:`attribute vec3 aTarget;attribute vec3 color;attribute float aSize;uniform float uTime;uniform float uProgress;uniform float uPixel;varying vec3 vColor;void main(){float p=clamp((uProgress-length(position.xy)*.022),0.,1.);p=p*p*(3.-2.*p);vec3 pos=mix(position,aTarget,p);pos.x+=sin(uTime*.8+aTarget.y*8.)*.012*(1.-p);vec4 mv=modelViewMatrix*vec4(pos,1.);gl_PointSize=min(9.,aSize*uPixel*(30./-mv.z));gl_Position=projectionMatrix*mv;vColor=color;}`,fragmentShader:`uniform float uOpacity;varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=exp(-d*d*17.);gl_FragColor=vec4(vColor*1.5,a*uOpacity);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  nameParticles=new THREE.Points(geo,mat);nameParticles.visible=false;scene.add(nameParticles);
}
async function accept(){
  if(state.phase!=='intro')return;
  $('accept').disabled=true;
  try{await audio.unlock();}catch(e){console.warn('Audio unavailable; continuing silently.');}
  if(document.documentElement.requestFullscreen && !mobile){try{await document.documentElement.requestFullscreen();}catch{/* Optional browser fullscreen. */}}
  $('intro').classList.add('hidden');$('opening').classList.remove('hidden');$('sound-toggle').classList.remove('hidden');
  giftRoot.visible=true;giftRoot.position.set(0,6.5,0);giftRoot.rotation.set(.1,-.35,.12);giftRoot.scale.set(1,1,1);
  setPhase('falling');
}
function landed(){
  state.landed=true;setPhase('waiting');audio.thud();state.shake=.19;
  $('prompt').classList.remove('hidden');$('gift-target').classList.remove('hidden');$('timer').classList.remove('hidden');
  dust.material.opacity=.8;dust.userData.time=0;
}
function tapGift(){
  if(state.phase!=='waiting')return;
  setPhase('cracking');audio.tap();audio.crack();audio.rise(2.7/debugSpeed);
  $('prompt').classList.add('hidden');$('gift-target').classList.add('hidden');$('timer').classList.add('hidden');
}
function explode(){
  setPhase('explosion');audio.boom();state.shake=.6;bloom.strength=lowPower?1.6:2.3;
  giftRoot.updateMatrixWorld(true);
  giftRoot.traverse(obj=>{
    if(!obj.isMesh || obj===giftRoot.userData.inner || obj.geometry.type==='SphereGeometry'&&obj.scale.x!==1) return;
    const world=new THREE.Vector3();obj.getWorldPosition(world);
    const mesh=new THREE.Mesh(obj.geometry,obj.material.clone());mesh.position.copy(world);mesh.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()));mesh.scale.copy(obj.getWorldScale(new THREE.Vector3()));
    if(mesh.material.color)mesh.material.color.multiplyScalar(.75);
    const dir=world.clone().sub(new THREE.Vector3(0,.1,0)).normalize();dir.x+=rand(-.9,.9);dir.y=rand(.4,1.5);dir.z+=rand(-.5,1.3);
    mesh.userData.velocity=dir.multiplyScalar(rand(3.5,7));mesh.userData.spin=new THREE.Vector3(rand(-5,5),rand(-5,5),rand(-5,5));scene.add(mesh);fragments.push(mesh);
  });
  giftRoot.visible=false;coreLight.intensity=0;explosionLight.intensity=180;
  createExplosionParticles();createShockwave();floor.visible=false;
}
function createExplosionParticles(){
  const n=lowPower?3000:6500,geo=new THREE.BufferGeometry(),p=new Float32Array(n*3),v=new Float32Array(n*3),c=new Float32Array(n*3),s=new Float32Array(n);
  for(let i=0;i<n;i++){
    const theta=rand(0,Math.PI*2),z=rand(-1,1),r=Math.sqrt(1-z*z),speed=rand(1.5,9)*(Math.random()<.1?1.6:1);
    p[i*3]=rand(-.4,.4);p[i*3+1]=rand(.1,1.6);p[i*3+2]=rand(-.4,.4);
    v[i*3]=Math.cos(theta)*r*speed;v[i*3+1]=(z*.6+.4)*speed;v[i*3+2]=Math.sin(theta)*r*speed;
    const col=new THREE.Color(Math.random()<.4?'#ffd69a':'#b3c7ff');col.multiplyScalar(rand(1,2.4));col.toArray(c,i*3);s[i]=rand(.6,2.8);
  }
  geo.setAttribute('position',new THREE.BufferAttribute(p,3));geo.setAttribute('aVelocity',new THREE.BufferAttribute(v,3));geo.setAttribute('color',new THREE.BufferAttribute(c,3));geo.setAttribute('aSize',new THREE.BufferAttribute(s,1));
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:1},uPixel:{value:renderer.getPixelRatio()}},vertexShader:`attribute vec3 aVelocity;attribute vec3 color;attribute float aSize;uniform float uTime;uniform float uPixel;varying vec3 vColor;void main(){vec3 p=position+aVelocity*uTime;p.y-=uTime*uTime*.65;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=min(14.,aSize*uPixel*(36./-mv.z)/(1.+uTime*.6));gl_Position=projectionMatrix*mv;vColor=color;}`,fragmentShader:`uniform float uOpacity;varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor*1.7,exp(-d*d*17.)*uOpacity);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geo,mat);points.name='explosionParticles';scene.add(points);state.explosion=points;
}
function createShockwave(){
  const mat=new THREE.ShaderMaterial({uniforms:{uAlpha:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float uAlpha;void main(){float d=length(vUv-.5)*2.;float a=smoothstep(.055,0.,abs(d-.82));gl_FragColor=vec4(.62,.76,1.,a*uAlpha);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  shockwave=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);shockwave.position.set(0,.4,1);shockwave.scale.setScalar(.1);scene.add(shockwave);
}
function expire(){
  if(!['waiting','falling'].includes(state.phase))return;
  setPhase('expiring');$('prompt').classList.add('hidden');$('gift-target').classList.add('hidden');$('timer').classList.add('hidden');
}
function replay(){ location.href=location.pathname+location.search; }
function resize(){
  if(!renderer)return;state.width=innerWidth;state.height=innerHeight;
  camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<innerHeight?47:40;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
}
function animate(now){
  requestAnimationFrame(animate);
  if(state.paused) {last=now;return;}
  let dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;
  elapsed+=dt;state.time+=dt;state.phaseTime+=dt;
  const rawDt=(now-(state.lastFpsStamp||now-16.67))/1000;state.lastFpsStamp=now;
  state.frames++;state.fpsTime+=rawDt;if(state.fpsTime>=1){state.fps=Math.round(state.frames/state.fpsTime);state.frames=0;state.fpsTime=0;}
  const t=state.phaseTime;
  stars.material.uniforms.uTime.value=elapsed;
  stars.rotation.y=Math.sin(elapsed*.02)*.035;
  if(['intro','falling','waiting','cracking'].includes(state.phase)){
    const aspect=innerWidth/innerHeight;
    camera.position.x=Math.sin(elapsed*.14)*.14;camera.position.y=1.55+Math.sin(elapsed*.27)*.035;camera.position.z=aspect<.8?8.6:8.0;
    camera.lookAt(0,.55,0);
  }
  if(state.phase==='falling'){
    const drop=Math.min(1,t/1.18);giftRoot.position.y=6.5-6.5*drop*drop;giftRoot.rotation.y=-.35+t*.8;giftRoot.rotation.z=.12*(1-drop);
    if(drop>=1)landed();
  }else if(state.phase==='waiting'){
    // Two diminishing bounces with gentle squash-and-stretch.
    let y=0,squash=0;
    if(t<.17){const p=t/.17;y=-.075*Math.sin(p*Math.PI);squash=Math.sin(p*Math.PI)*.13;}
    else if(t<.58){const p=(t-.17)/.41;y=Math.sin(p*Math.PI)*.28;}
    else if(t<.67){squash=Math.sin((t-.58)/.09*Math.PI)*.05;}
    else if(t<.97){const p=(t-.67)/.3;y=Math.sin(p*Math.PI)*.1;}
    giftRoot.position.y=y;giftRoot.scale.set(1+squash*.55,1-squash,1+squash*.55);giftRoot.rotation.y+=dt*.11;
    giftRoot.position.x=Math.sin(elapsed*.8)*.016;
    if(dust.userData.time<2){dust.userData.time+=dt;const a=dust.geometry.attributes.position;dust.userData.vel.forEach((v,i)=>{a.array[i*3]+=v.x*dt;a.array[i*3+1]+=v.y*dt;a.array[i*3+2]+=v.z*dt;v.y-=dt*.7;});a.needsUpdate=true;dust.material.opacity=Math.max(0,.8-t*.5);}
    const remain=Math.max(0,debugTimeout-t);$('timer-number').textContent=Math.ceil(remain);$('timer-progress').style.strokeDashoffset=119.38*(1-remain/debugTimeout);
    if(remain<=0)expire();
  }else if(state.phase==='cracking'){
    const p=Math.min(1,t/(2.45));giftRoot.position.x=Math.sin(t*62)*.017*p;giftRoot.position.y=Math.sin(t*46)*.012*p;
    giftRoot.rotation.z=Math.sin(t*43)*.008*p;
    cracks.forEach(c=>{const q=THREE.MathUtils.clamp((p-c.userData.delay)*3,0,1);c.scale.setScalar(Math.max(.001,q));c.material.opacity=q;});
    giftRoot.userData.inner.material.opacity=p*.95;giftRoot.userData.inner.scale.setScalar(.5+p*1.2);coreLight.intensity=p*p*40;
    camera.position.z-=.32*dt;camera.fov=(innerWidth<innerHeight?47:40)-easeInOut(p)*3;camera.updateProjectionMatrix();camera.lookAt(0,.5,0);
    if(p>=1)explode();
  }else if(state.phase==='explosion'){
    fragments.forEach(m=>{m.position.addScaledVector(m.userData.velocity,dt);m.userData.velocity.y-=dt*2.7;m.rotation.x+=m.userData.spin.x*dt;m.rotation.y+=m.userData.spin.y*dt;m.rotation.z+=m.userData.spin.z*dt;m.material.transparent=true;m.material.opacity=Math.max(0,1-t*.6);});
    if(state.explosion){state.explosion.material.uniforms.uTime.value=t;state.explosion.material.uniforms.uOpacity.value=Math.max(0,1-t/2.5);}
    shockwave.scale.setScalar(.1+t*12);shockwave.material.uniforms.uAlpha.value=Math.max(0,1-t/1.05);
    explosionLight.intensity=Math.max(0,180*Math.exp(-t*5));
    $('flash').style.opacity=String(Math.max(0,(t<.12?t/.12:1-(t-.12)/.55))*.92);
    camera.position.z+=(11-camera.position.z)*dt*1.3;camera.position.y+=(1.3-camera.position.y)*dt;camera.lookAt(0,.6,-2);
    if(t>.38){galaxy.material.uniforms.uOpacity.value=Math.min(1,(t-.38)*.8);galaxy.userData.glow.material.opacity=Math.min(.48,(t-.38)*.4);}
    if(t>2.45){setPhase('galaxy');$('chapter').classList.remove('hidden');audio.galaxy();}
  }else if(state.phase==='galaxy'||state.phase==='name'||state.phase==='finale'){
    fragments.forEach(m=>m.visible=false);if(state.explosion&&t>1)state.explosion.visible=false;
    $('flash').style.opacity='0';explosionLight.intensity=0;coreLight.intensity=0;
    if(state.explosion&&state.explosion.material.uniforms.uOpacity.value>0){state.explosion.material.uniforms.uTime.value+=dt;state.explosion.material.uniforms.uOpacity.value=Math.max(0,state.explosion.material.uniforms.uOpacity.value-dt*.5);}
    fragments.forEach(m=>{if(m.material.opacity>0){m.position.addScaledVector(m.userData.velocity,dt);m.material.opacity=Math.max(0,m.material.opacity-dt*1.4);}});
    if(shockwave)shockwave.visible=false;
    const p=Math.min(1,t/5);
    galaxy.material.uniforms.uOpacity.value=Math.min(1,t*.7);galaxy.userData.glow.material.opacity=Math.min(.5,t*.25);
    // A slow dolly that reveals the spiral's depth before settling under the name.
    const flight=easeInOut(t/4.6);
    camera.position.set(Math.sin(t*.18)*.42*(1-flight),THREE.MathUtils.lerp(4.4,1.1,flight),THREE.MathUtils.lerp(-.2,7.5,flight));
    const look=new THREE.Vector3(0,THREE.MathUtils.lerp(.4,.7,flight),THREE.MathUtils.lerp(-5,1.2,flight));camera.lookAt(look);
    if(state.phase==='galaxy'){
      meteors.forEach(m=>{const local=(t-m.userData.start)%7;if(local>=0&&local<.8){m.visible=true;m.position.set(m.userData.x-local*3,m.userData.y-local*1.6,m.userData.z);m.material.opacity=Math.sin(local/.8*Math.PI)*.6;}else m.visible=false;});
      if(t>4.6){setPhase('name');nameParticles.visible=true;$('chapter').classList.add('hidden');}
    }else{
      meteors.forEach(m=>m.visible=false);
      const progress=state.phase==='name'?Math.min(1.25,t/2.6):1.25;
      nameParticles.material.uniforms.uProgress.value=progress;nameParticles.material.uniforms.uOpacity.value=Math.min(1,t*1.1);
      galaxy.rotation.z=-.15+Math.sin(elapsed*.06)*.02;
      if(state.phase==='name'&&t>3.6){setPhase('finale');$('finale').classList.remove('hidden');audio.finale();}
    }
  }else if(state.phase==='expiring'){
    giftRoot.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=Math.max(0,1-t/1.5);}});
    giftRoot.scale.multiplyScalar(1-dt*.25);giftRoot.rotation.y+=dt*.7;stars.material.uniforms.uOpacity.value=Math.max(.15,.7-t*.3);
    if(t>1.7){setPhase('expired');$('opening').classList.add('hidden');$('expired').classList.remove('hidden');}
  }
  if(state.shake>0){camera.position.x+=rand(-state.shake,state.shake);camera.position.y+=rand(-state.shake,state.shake)*.5;state.shake=Math.max(0,state.shake-dt*.9);}
  galaxy.material.uniforms.uTime.value=elapsed;galaxy.userData.glow.material.rotation=elapsed*.005;
  nameParticles.material.uniforms.uTime.value=elapsed;
  nebulae.forEach((s,i)=>{s.visible=state.phase!=='finale'||i<4;s.material.rotation=elapsed*.003*(i%2?1:-1);});
  bloom.strength+=( (state.phase==='explosion'?1.35:(state.phase==='cracking'?.85:(lowPower?.62:.8)))-bloom.strength)*dt*2.4;
  film.uniforms.time.value=elapsed;
  composer.render();
}
function showError(message){$('loading').classList.add('hidden');$('intro').classList.add('hidden');$('fallback').classList.remove('hidden');$('fallback-message').textContent=message;$('fallback-from').textContent=gift.msg;}
$('accept').addEventListener('click',accept);$('gift-target').addEventListener('click',tapGift);$('replay').addEventListener('click',replay);$('restart').addEventListener('click',replay);
$('message').textContent=gift.msg;$('from').textContent=`— 来自 ${gift.from}`;
$('sound-toggle').addEventListener('click',()=>{state.muted=!state.muted;audio.setMuted(state.muted);$('sound-toggle').setAttribute('aria-pressed',String(state.muted));$('sound-toggle').setAttribute('aria-label',state.muted?'开启声音 Unmute sound':'关闭声音 Mute sound');});
addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&state.phase==='intro'){e.preventDefault();accept();}else if((e.key==='Enter'||e.key===' ')&&state.phase==='waiting'){e.preventDefault();tapGift();}});
init();
