const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');

const R=(a,b)=>Math.random()*(b-a)+a;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const easeInQuad=t=>t*t;
const easeOutExpo=t=> t===1?1:1-Math.pow(2,-10*t);

const MOON_STORE_KEY = 'meddash_moon_v1';
function loadMoonState(){
  try{
    const s = JSON.parse(localStorage.getItem(MOON_STORE_KEY));
    if(s && typeof s.angle==='number' && typeof s.t==='number'){
      const dt = Date.now() - s.t;
      moon.angle = s.angle + moon.speed * dt;
      return;
    }
  }catch(e){}
  resetMoon();
}
function saveMoonState(){
  try{
    localStorage.setItem(MOON_STORE_KEY, JSON.stringify({ angle: moon.angle % (Math.PI*2), t: Date.now() }));
  }catch(e){}
}
window.addEventListener('pagehide', saveMoonState);
window.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveMoonState(); });

let stars=[], shooters=[], nebulas=[];
const moon = { angle: Math.PI, r: 56, rx: 0, ry: 0, cx: 0, cy: 0, speed: 0.0001, img: null };

function fit(){
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  updateOrbit();
}

function updateOrbit(){
  const w = canvas.width, h = canvas.height;
  const m = Math.min(w, h);
  moon.rx = w * 0.62;
  moon.ry = h * 0.22;
  moon.cx = w / 2;
  moon.cy = h * 0.50;
  moon.r  = clamp(m * 0.06, 26, 84);
}

fit();
addEventListener('resize', fit);

function createStars(n){
  stars.length=0;
  for(let i=0;i<n;i++) stars.push({
    x:Math.random()*canvas.width,
    y:Math.random()*canvas.height,
    size:Math.random()*1.8+0.2,
    a:R(0.3,1), tw:R(0.015,0.045)
  });
}
function drawStars(){
  ctx.save();
  for(const s of stars){
    s.a+=s.tw; if(s.a<=0.2||s.a>=1) s.tw*=-1;
    ctx.shadowBlur=8; ctx.shadowColor=`rgba(255,255,255,${Math.min(0.6,s.a)})`;
    ctx.fillStyle=`rgba(255,255,255,${s.a})`;
    ctx.beginPath(); ctx.arc(s.x,s.y,s.size,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function createNebulas(layers=3, blobs=10){
  nebulas=[];
  for(let L=0;L<layers;L++){
    const layer=[]; const scale=L===0?1.0:1.4;
    for(let i=0;i<blobs;i++) layer.push({
      x:Math.random()*canvas.width,
      y:Math.random()*canvas.height,
      r:R(280,560)*scale,
      hue:R(200,340), sat:R(80,100), light:R(50,70),
      alpha:R(0.03,0.07), dx:R(-0.05,0.05)*(L+1)*0.2, dy:R(-0.03,0.03)*(L+1)*0.2
    });
    nebulas.push(layer);
  }
}
function drawNebulas(){
  ctx.save(); ctx.globalCompositeOperation='screen';
  for(const layer of nebulas){
    for(const n of layer){
      n.x+=n.dx; n.y+=n.dy;
      if(n.x<-n.r) n.x=canvas.width+n.r; if(n.x>canvas.width+n.r) n.x=-n.r;
      if(n.y<-n.r) n.y=canvas.height+n.r; if(n.y>canvas.height+n.r) n.y=-n.r;
      const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
      g.addColorStop(0,`hsla(${n.hue},${n.sat}%,${n.light}%,${n.alpha})`);
      g.addColorStop(1,`hsla(${n.hue},${n.sat}%,${n.light}%,0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

function spawnShooter(){
  const sx=R(-canvas.width*0.2,canvas.width*0.8);
  const sy=R(0,canvas.height*0.4);
  const ex=sx+R(220,540), ey=sy+R(130,360);
  const duration=R(900,1800);
  shooters.push({startX:sx,startY:sy,endX:ex,endY:ey,t:0,duration,trail:[],maxTrail:26,headStopped:false,lifeAfterStop:900,stopTimer:0,maxSize:R(1.2,2.6)});
}
function drawShooter(sh){
  if(!sh.headStopped){
    sh.t+=16/sh.duration; const e=easeInQuad(clamp(sh.t,0,1));
    const x=lerp(sh.startX,sh.endX,e), y=lerp(sh.startY,sh.endY,e);
    sh.trail.push({x,y}); if(sh.trail.length>sh.maxTrail) sh.trail.shift();
    if(sh.t>=1) sh.headStopped=true;
  }else{
    sh.stopTimer+=16; const k=clamp(1-(sh.stopTimer/sh.lifeAfterStop),0,1);
    const targetLen=Math.max(1,Math.floor(sh.maxTrail*k));
    while(sh.trail.length>targetLen) sh.trail.shift();
  }
  const minB=0.12; const travelB=minB+(1-minB)*easeOutExpo(clamp(sh.t,0,1));
  const fade=clamp(1-(sh.stopTimer/sh.lifeAfterStop),0,1);
  const bright=sh.headStopped?0.85*fade:travelB;
  ctx.save(); ctx.lineCap='round';
  for(let i=1;i<sh.trail.length;i++){
    const p0=sh.trail[i-1], p1=sh.trail[i];
    const tSeg=i/sh.trail.length; const a=clamp((1-tSeg)*bright,0,1);
    ctx.strokeStyle=`rgba(255,255,255,${a})`; ctx.lineWidth=sh.maxSize*(1-tSeg*0.9);
    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
  }
  const head=sh.trail[sh.trail.length-1];
  if(head){
    const size=sh.maxSize*(0.8+travelB*0.6);
    const g=ctx.createRadialGradient(head.x,head.y,0,head.x,head.y,size*6);
    g.addColorStop(0,`rgba(255,255,255,${0.8*bright})`);
    g.addColorStop(0.25,`rgba(255,255,255,${0.35*bright})`);
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(head.x,head.y,size*6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,255,255,${0.9*bright})`; ctx.beginPath(); ctx.arc(head.x,head.y,size*0.9,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawShootingStars(){
  for(let i=shooters.length-1;i>=0;i--){
    drawShooter(shooters[i]);
    if(shooters[i].headStopped && (shooters[i].stopTimer>=shooters[i].lifeAfterStop || shooters[i].trail.length===0)) shooters.splice(i,1);
  }
  if(Math.random()<0.02 && shooters.length<3) spawnShooter();
}

function resetMoon(){
  moon.angle = Math.PI + R(0.02, 0.18);
}
function drawMoon(){
  moon.angle += moon.speed;
  const x = moon.cx + moon.rx * Math.cos(moon.angle);
  const y = moon.cy + moon.ry * Math.sin(moon.angle);
  if (x - moon.r > canvas.width + 40) { resetMoon(); }
  const haloR = moon.r * 4.6;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, 'rgba(255,255,255,0.40)');
  halo.addColorStop(0.35, 'rgba(200,220,255,0.22)');
  halo.addColorStop(1, 'rgba(180,200,255,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, haloR, 0, Math.PI*2); ctx.fill();
  if (moon.img) { const d = moon.r*2; ctx.drawImage(moon.img, x-moon.r, y-moon.r, d, d); }
  else { ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(x, y, moon.r, 0, Math.PI*2); ctx.fill(); }
}

(function(){
  const img=new Image();
  img.onload=()=>{ moon.img=img; };
  img.src='img/moon_full.png';
})();

function frame(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawNebulas(); drawStars(); drawShootingStars(); drawMoon();
  requestAnimationFrame(frame);
}

createStars(320); createNebulas(3,10);
loadMoonState();
requestAnimationFrame(frame);
setInterval(saveMoonState, 5000);
