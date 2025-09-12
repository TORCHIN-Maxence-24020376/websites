// === today.js — 3 EDT + navigation jour par jour ===
(() => {
  // --- URLs ICS à configurer en haut ---
  const EDT1 = 'https://raw.githubusercontent.com/TORCHIN-Maxence-24020376/EDT/main/edt_data/2GA1-2.ics';   // A
  const EDT2 = 'https://raw.githubusercontent.com/TORCHIN-Maxence-24020376/EDT/main/edt_data/2GB-1.ics';  // B
  const EDT3 = 'https://raw.githubusercontent.com/TORCHIN-Maxence-24020376/EDT/main/edt_data/1G2B.ics';  // Antoine
  const EDT4 = 'https://raw.githubusercontent.com/TORCHIN-Maxence-24020376/EDT/main/edt_data/2GA1-1.ics';   // Maxence

  // --- Affichage temps ---
  const START_HOUR = 7;
  const END_HOUR   = 20;
  const PX_PER_MIN = 1.2;
  const VIEW_MODE  = "auto"; // "today" | "tomorrow" | "auto"
  let dayOffset = 0;         // ←→ change le jour couramment affiché

  // --- mini cache ICS par URL ---
  const ICS_CACHE = new Map();

  // Utils dates/format
  const pad2 = n => (n<10?'0':'')+n;
  const frTime = d => `${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
  const sameYMD = (a,b)=> a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  function minutesSinceStart(date){ return (date.getHours()-START_HOUR)*60 + date.getMinutes(); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

  function baseTargetDate(){
    const now = new Date();
    const target = new Date();
    if (VIEW_MODE === "tomorrow") target.setDate(target.getDate()+1);
    else if (VIEW_MODE === "auto" && now.getHours() >= 21) target.setDate(target.getDate()+1);
    target.setHours(0,0,0,0);
    return target;
  }
  function currentTargetDate(){
    const d = baseTargetDate();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }

  // --- ICS parsing ---
  function icsTimeToDate(ics){
    const y=+ics.slice(0,4), m=+ics.slice(4,6)-1, d=+ics.slice(6,8);
    const H=+ics.slice(9,11), M=+ics.slice(11,13), S=+(ics.slice(13,15)||"0");
    return ics.endsWith("Z") ? new Date(Date.UTC(y,m,d,H,M,S)) : new Date(y,m,d,H,M,S);
  }
  function parseICS(text){
    const lines = text.replace(/\r/g,"\n").split(/\n/);
    const out = []; let ev=null;
    // dépliage
    for (let i=1;i<lines.length;i++){ if (lines[i].startsWith(" ")) { lines[i-1]+=lines[i].slice(1); lines[i]=""; } }
    for (const raw of lines){
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith("BEGIN:VEVENT")) ev={ extendedProps:{ professeur:"Inconnu", salle:"", salleUrl:null } };
      else if (line.startsWith("SUMMARY:")) ev.title=line.slice(8).trim();
      else if (line.startsWith("DTSTART")) ev.start=icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("DTEND")) ev.end=icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("LOCATION:")){
        const salleClean=line.slice(9).trim().replace(/\\,/g,',');
        ev.extendedProps.salle=salleClean||"Salle inconnue";
        ev.extendedProps.salleUrl=salleClean?`carte.html#${encodeURIComponent(salleClean)}`:null;
      } else if (line.startsWith("DESCRIPTION:")){
        const desc=line.slice(12).trim();
        const cleaned=desc.replace(/\\n/g," ").replace(/Groupe|Modifié le:|\(|\)|\//g,"").replace(/\d+/g,"").replace(/\s+/g," ")
                          .replace(/-/g," ").replace(/ère année|ème année|ère Année|ème Année/g,"").replace(/:/g,"")
                          .replace(/A an| an /g," ").replace(/G[A-Z] /g,"").trim();
        ev.extendedProps.professeur=cleaned||"Inconnu";
      } else if (line.startsWith("END:VEVENT")){ if (ev) out.push(ev); ev=null; }
    }
    return out;
  }
  async function loadICS(url){
    if (ICS_CACHE.has(url)) return ICS_CACHE.get(url);
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`ICS load error: ${url}`);
    const events = parseICS(await resp.text());
    ICS_CACHE.set(url, events);
    return events;
  }

  // --- rendu d’une colonne/day simple (timeline verticale) ---
  function renderTimeline(container){
    container.innerHTML = "";
    container.style.position = "relative";
    container.style.padding = "0";

    const timeline = document.createElement("div");
    timeline.style.position = "relative";
    const totalMinutes = (END_HOUR-START_HOUR)*60;
    timeline.style.height = `${Math.max(480, totalMinutes*PX_PER_MIN)}px`;
    timeline.style.borderTop = "1px solid var(--glass-border)";
    timeline.style.borderRight = "1px solid var(--glass-border)";
    timeline.style.borderRadius = "12px";
    timeline.style.overflow = "hidden";

    for (let h=START_HOUR; h<=END_HOUR; h++){
      const top = (h-START_HOUR)*60*PX_PER_MIN;
      const row = document.createElement("div");
      Object.assign(row.style,{position:"absolute",left:0,right:0,top:`${top}px`,borderTop:"1px dashed var(--glass-border)",opacity:"0.6"});
      const label = document.createElement("span");
      Object.assign(label.style,{position:"absolute",left:"8px",top:"-10px",fontSize:"11px",color:"var(--less-important-text)"});
      label.textContent = `${pad2(h)}:00`;
      row.appendChild(label);
      timeline.appendChild(row);
    }

    const nowLine = document.createElement("div");
    Object.assign(nowLine.style,{position:"absolute",left:0,right:0,height:"2px",background:"#e74c3c",boxShadow:"0 0 6px rgba(231,76,60,0.8)",zIndex:5});
    timeline.appendChild(nowLine);

    container.appendChild(timeline);
    return { timeline, nowLine };
  }

  function placeEventCard(timeline, ev){
    const card = document.createElement("div");
    card.className = "cour";

    const topRow = document.createElement("div");
    const name = document.createElement("p"); name.className="name"; name.textContent = ev.title || "Cours";
    const location = document.createElement("p"); location.className="location"; location.textContent = ev.extendedProps?.salle || "Salle ?";
    topRow.append(name, location);

    const bottomRow = document.createElement("div");
    const prof = document.createElement("p"); prof.className="prof"; prof.textContent = ev.extendedProps?.professeur || "Inconnu";
    const time = document.createElement("p"); time.className="time"; time.textContent = `${frTime(ev.start)} - ${frTime(ev.end)}`;
    bottomRow.append(prof, time);

    card.append(topRow, bottomRow);

    card.style.position="absolute";
    const startMin = minutesSinceStart(ev.start);
    const endMin   = minutesSinceStart(ev.end);
    const top = clamp(startMin,0,(END_HOUR-START_HOUR)*60) * PX_PER_MIN;
    const height = Math.max(32, (endMin - startMin) * PX_PER_MIN - 6);
    Object.assign(card.style,{left:"8px",right:"8px",top:`${top}px`,height:`${height}px`,boxShadow:"0 6px 14px rgba(0,0,0,0.15)",zIndex:2});
    timeline.appendChild(card);
  }

  function updateNowLine(nowLine, forDate){
    const now = new Date();
    const minutes = minutesSinceStart(now);
    const total = (END_HOUR-START_HOUR)*60;
    if (!sameYMD(now, forDate) || minutes<0 || minutes>total){ nowLine.style.display="none"; return; }
    nowLine.style.display="block";
    nowLine.style.top = `${minutes*PX_PER_MIN}px`;
  }

  // --- bar de navigation (global, au-dessus des 3 grilles) ---
  function ensureGlobalNav(){
    if (document.querySelector('.edt-nav')) return;
    const main = document.querySelector('main') || document.body;
  
    const bar = document.createElement('div');
    bar.className = 'edt-nav';
    Object.assign(bar.style,{
      display:'flex', gap:'0.5rem', alignItems:'center', margin:'0 0 0.75rem 0'
    });
  
    const mkBtn = (iconPath, label, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      Object.assign(btn.style,{
        padding:"6px 10px",
        borderRadius:"10px",
        border:"1px solid var(--glass-border)",
        background:"var(--glass-bg-dark)",
        cursor:"pointer",
        display:"inline-flex",
        alignItems:"center",
        justifyContent:"center"
      });
      const img = document.createElement("img");
      img.src = iconPath;
      img.alt = label;
      img.width = 20; img.height = 20;
      img.style.display = "block";
      btn.appendChild(img);
  
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        onClick();
      });
      return btn;
    };
  
    const prev  = mkBtn("img/prev.svg",  "Jour précédent", ()=>{ dayOffset--; renderAll(); });
    const today = mkBtn("img/today.svg", "Aujourd’hui",    ()=>{ dayOffset=0;  renderAll(); });
    const next  = mkBtn("img/next.svg",  "Jour suivant",   ()=>{ dayOffset++; renderAll(); });
  
    bar.append(prev, today, next);
    main.prepend(bar);
  }
  

  function setDateTitles(date){
    const optsLong = { weekday:'long', day:'2-digit', month:'long' };
    const nice = date.toLocaleDateString('fr-FR', optsLong);
    const topTitle = document.getElementById('edt-date-title');
    if (topTitle) topTitle.textContent = nice.charAt(0).toUpperCase()+nice.slice(1);

    // met à jour chaque <article> : h3 + p (même si l’id "date" est dupliqué)
    document.querySelectorAll('article').forEach(art=>{
      const p = art.querySelector('.row p');
      if (p){
        const opts = { weekday:'short', day:'2-digit', month:'short' };
        p.textContent = date.toLocaleDateString('fr-FR', opts);
      }
    });
  }

  // --- rendu d’un conteneur + ICS pour un jour donné ---
  async function renderOne(containerSelector, icsUrl, date){
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const { timeline, nowLine } = renderTimeline(container);

    try{
      const events = await loadICS(icsUrl);
      const todays = events.filter(e => sameYMD(e.start, date)).sort((a,b)=>a.start-b.start);
      todays.forEach(ev => placeEventCard(timeline, ev));

      // scroll auto vers "maintenant" ou premier cours
      const now = new Date();
      if (sameYMD(now, date)){
        const y = minutesSinceStart(now)*PX_PER_MIN - (container.clientHeight*0.35);
        container.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } else if (todays[0]){
        const y = minutesSinceStart(todays[0].start)*PX_PER_MIN - 20;
        container.scrollTo({ top: Math.max(0, y) });
      }

      // now line
      const tick = () => updateNowLine(nowLine, date);
      tick();
      clearInterval(container._nowTimer);
      container._nowTimer = setInterval(tick, 60*1000);
    } catch(err){
      console.error(err);
      const msg = document.createElement('p');
      msg.textContent = 'Impossible de charger l’EDT.';
      msg.style.padding = '1rem';
      container.appendChild(msg);
    }
  }

  // --- rendu global des 3 EDT pour le jour courant ---
  async function renderAll(){
    const d = currentTargetDate();
    setDateTitles(d);
    await Promise.all([
      renderOne('#calendar-grid-A', EDT1, d),
      renderOne('#calendar-grid-B', EDT2, d),
      renderOne('#calendar-grid',   EDT3, d),
      renderOne('#calendar-grid-max',   EDT4, d),
    ]);
  }

  // --- auto-refresh à 21h (ou minuit) pour basculer le jour si VIEW_MODE=auto
  function shouldUpdateAt(){ const h=new Date().getHours(); return h<21?21:24; }
  function scheduleNextUpdate(){
    const now=new Date(); const targetHour=shouldUpdateAt(); const next=new Date(now);
    next.setHours(targetHour,0,0,0); if (targetHour===24) next.setDate(now.getDate()+1);
    const delay=next-now;
    setTimeout(()=>{ renderAll(); scheduleNextUpdate(); }, Math.max(1000,delay));
  }

  // --- init ---
  function init(){
    ensureGlobalNav();
    renderAll();
    scheduleNextUpdate();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    init();
  });

  // Raccourcis clavier globaux
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowLeft'){ e.preventDefault(); dayOffset--; renderAll(); }
    if (e.key === 'ArrowRight'){ e.preventDefault(); dayOffset++; renderAll(); }
    if (e.key.toLowerCase() === 't'){ e.preventDefault(); dayOffset=0; renderAll(); }
  });
})();
