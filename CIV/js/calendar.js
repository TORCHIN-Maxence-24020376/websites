(function () {
  // === Réglages =========================================================
  const START_HOUR = 7;
  const END_HOUR   = 21;
  const PX_PER_MIN = 1;
  const VIEW_MODE  = "auto";
  const HOURS_RAIL_W = 64;
  const VERSION = "2.3";

  document.getElementById("version").textContent = "V" + VERSION; // Affichage de la version


  // Groupes & storage
  const GROUPS = Array.from({length:16}, (_,i)=>`G${i+1}`);
  const LS_KEY = "edt.group";
  const ICS_BASE = "ics/";                 // <-- dossiers locaux
  const icsUrlFor = g => `${ICS_BASE}PSI_${g}.ics`;

  // === État =============================================================
  let weekOffset = 0;
  let CURRENT_GROUP = null;
  const EVENTS_CACHE = new Map();
  let _lastFocused = null;

  // === Utils dates ======================================================
  function getTargetDate() {
    const now = new Date();
    const target = new Date();
    if (VIEW_MODE === "tomorrow") target.setDate(target.getDate() + 1);
    else if (VIEW_MODE === "auto" && now.getHours() >= 21) target.setDate(target.getDate() + 1);
    target.setHours(0,0,0,0);
    return target;
  }
  function getMonday(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function sameYMD(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  const pad2=n=>(n<10?"0":"")+n;
  const frTime=d=>`${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
  const frDayLabel=d=>d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long'});
  const minutesSinceStart=d=>(d.getHours()-START_HOUR)*60 + d.getMinutes();
  const clamp=(v,min,max)=>Math.max(min, Math.min(max,v));
  const timelineHeightPx=()=>Math.max(480,(END_HOUR-START_HOUR)*60*PX_PER_MIN);

  // === Maj quotidienne ==================================================
  function shouldUpdateAt(){ return new Date().getHours() < 21 ? 21 : 24; }
  function scheduleNextUpdate(){
    const now=new Date(); const targetHour=shouldUpdateAt(); const next=new Date(now);
    next.setHours(targetHour,0,0,0); if (targetHour===24) next.setDate(now.getDate()+1);
    const delay=next-now;
    setTimeout(()=>{ loadAndRender(); scheduleNextUpdate(); }, Math.max(1000,delay));
  }

  // === ICS ============================================================== 
  function icsTimeToDate(ics){
    const y=+ics.slice(0,4), m=+ics.slice(4,6)-1, d=+ics.slice(6,8);
    const H=+ics.slice(9,11), M=+ics.slice(11,13), S=+(ics.slice(13,15)||"0");
    return ics.endsWith("Z") ? new Date(Date.UTC(y,m,d,H,M,S)) : new Date(y,m,d,H,M,S);
  }
  function parseICS(text){
    const lines = text.replace(/\r/g,"\n").split(/\n/);
    for (let i=1;i<lines.length;i++){ if (lines[i].startsWith(" ")) { lines[i-1]+=lines[i].slice(1); lines[i]=""; } }
    const out=[]; let ev=null;
    for (const raw of lines){
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith("BEGIN:VEVENT")) ev={ extendedProps:{ professeur:"Inconnu", salle:"", salleUrl:null } };
      else if (line.startsWith("SUMMARY:")) ev.title=line.slice(8).trim();
      else if (line.startsWith("DTSTART")) ev.start=icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("DTEND"))   ev.end  =icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("LOCATION:")){
        const salleClean=line.slice(9).trim().replace(/\\,/g,',');
        ev.extendedProps.salle=salleClean||"Salle inconnue";
        ev.extendedProps.salleUrl=salleClean?`carte.html#${encodeURIComponent(salleClean)}`:null;
      } else if (line.startsWith("DESCRIPTION:")){
        const cleaned=line.slice(12).trim()
        ev.extendedProps.professeur=cleaned||"Inconnu";
      } else if (line.startsWith("END:VEVENT")){ if (ev) out.push(ev); ev=null; }
    }
    return out;
  }
  async function loadICS(group){
    if (EVENTS_CACHE.has(group)) return EVENTS_CACHE.get(group);
    const url = icsUrlFor(group);                // <-- LOCAL
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Erreur de chargement ICS (${resp.status})`);
    const events = parseICS(await resp.text());
    EVENTS_CACHE.set(group, events);
    return events;
  }

  // === Header + sélecteur de groupe ====================================
  function makeHeader(container, weekStart, weekEnd, group) {
    const hdr = document.createElement("div");
    Object.assign(hdr.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"0.5rem",margin:"0 0 0.5rem 0"});

    const left = document.createElement("div");
    left.style.display="flex"; left.style.gap="0.5rem";
    const mkBtn=(src,label,cb)=>{ const b=document.createElement("button");
      Object.assign(b.style,{padding:"6px 10px",borderRadius:"10px",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"});
      b.title=label; const img=document.createElement("img"); img.src=src; img.alt=label; img.width=20; img.height=20; b.appendChild(img);
      b.addEventListener("click",(e)=>{e.preventDefault();e.stopPropagation();cb();}); return b; };
    left.append(
      mkBtn("img/prev.svg","Semaine précédente",()=>{ weekOffset--; loadAndRender(); }),
      mkBtn("img/today.svg","Aujourd’hui",       ()=>{ weekOffset=0;  loadAndRender(); }),
      mkBtn("img/next.svg","Semaine suivante",   ()=>{ weekOffset++; loadAndRender(); }),
    );

    const mid = document.createElement("div");
    mid.style.fontWeight="600"; mid.style.opacity="0.9";
    const opts = { weekday:"short", day:"2-digit", month:"short" };
    mid.textContent = `${weekStart.toLocaleDateString('fr-FR', opts)} → ${weekEnd.toLocaleDateString('fr-FR', opts)} • Groupe ${group}`;

    const right = document.createElement("div");
    right.style.display="flex"; right.style.gap="0.5rem"; right.style.alignItems="center";
    const lab=document.createElement("label"); lab.textContent="Groupe"; lab.style.opacity="0.8"; lab.style.fontSize="0.9rem";
    const sel=document.createElement("select");
    Object.assign(sel.style,{padding:"6px 10px",borderRadius:"10px",border:"1px solid var(--glass-border)",background:"rgba(8, 99, 210, 0.4)",color:"inherit",cursor:"pointer"});
    GROUPS.forEach(g=>{ const o=document.createElement("option"); o.value=g; o.textContent=g; if (g===group) o.selected=true; sel.appendChild(o); });
    sel.addEventListener("change", ()=>{
      const g = sel.value;
      CURRENT_GROUP = g;
      localStorage.setItem(LS_KEY, g);
      weekOffset = 0;
      loadAndRender();
    });

    right.append(lab, sel);
    hdr.append(left, mid, right);
    container.appendChild(hdr);
  }

  // === Grille (rail heures / overlay / colonnes) =======================
  function renderTimeRail(container, hPx){
    const railWrap=document.createElement("div");
    Object.assign(railWrap.style,{flex:`0 0 ${HOURS_RAIL_W}px`,position:"relative",height:`${hPx}px`,boxSizing:"border-box",overflow:"hidden",zIndex:3});
    for (let h=START_HOUR; h<END_HOUR; h++){
      const top=(h-START_HOUR)*60*PX_PER_MIN;
      const tick=document.createElement("div"); Object.assign(tick.style,{position:"absolute",left:0,right:0,top:`${top}px`});
      const dash=document.createElement("div"); Object.assign(dash.style,{position:"absolute",right:"8px",width:"10px",height:"1px"});
      const label=document.createElement("div"); Object.assign(label.style,{position:"absolute",left:"8px",top:"-10px",fontSize:"11px",userSelect:"none",fontVariantNumeric:"tabular-nums"});
      label.textContent=`${pad2(h)}:00`; tick.append(dash,label); railWrap.appendChild(tick);
    }
    container.appendChild(railWrap);
  }
  function renderHourOverlay(scrollWrap,hPx){
    const overlay=document.createElement("div");
    Object.assign(overlay.style,{position:"absolute",left:0,right:0,top:0,height:`${hPx}px`,pointerEvents:"none",zIndex:1});
    for (let h=START_HOUR; h< END_HOUR*1.6; h++){
      const top=(h-START_HOUR)*30*PX_PER_MIN;
      const row=document.createElement("div"); Object.assign(row.style,{position:"absolute",left:0,right:0,top:`${top}px`,borderTop:"1px dashed gray",opacity:"0.6"});
      overlay.appendChild(row);
    }
    scrollWrap.appendChild(overlay);
  }
  function renderNowLine(timelineEl){
    if (!timelineEl) return;
    const nowLine=document.createElement("div");
    Object.assign(nowLine.style,{position:"absolute",left:0,right:0,height:"2px",background:"#e74c3c",boxShadow:"0 0 6px rgba(231,76,60,0.8)",zIndex:20,display:"none",pointerEvents:"none"});
    timelineEl.appendChild(nowLine);
    function tick(){
      const now=new Date(); const minutes=minutesSinceStart(now); const total=(END_HOUR-START_HOUR)*60;
      if (minutes<0 || minutes>total){ nowLine.style.display="none"; return; }
      nowLine.style.display="block"; nowLine.style.top=`${minutes*PX_PER_MIN}px`;
    }
    tick(); clearInterval(timelineEl._nowTimer); timelineEl._nowTimer=setInterval(tick,60*1000);
  }
  function renderDayColumn(daysArea,hPx){
    const col=document.createElement("div"); col.className="day-col";
    Object.assign(col.style,{flex:"1 1 0",position:"relative",scrollSnapAlign:"start",zIndex:3,overflow:"hidden"});
    const timeline=document.createElement("div");
    Object.assign(timeline.style,{position:"relative",height:`${hPx}px`,borderLeft:"1px solid gray",borderRight:"1px solid gray",overflow:"hidden"});
    col.appendChild(timeline); daysArea.appendChild(col); return {col,timeline};
  }

  // === Modale (centrée) ================================================
  function ensureModal(){
    if (document.getElementById('edt-modal')) return;
    const root=document.createElement('div'); root.id='edt-modal';
    root.innerHTML=`
      <div class="backdrop" data-close="1" aria-hidden="true"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="edt-modal-title">
        <button class="close" aria-label="Fermer">×</button>
        <h3 id="edt-modal-title" class="title"></h3>
        <div class="meta"></div>
      </div>`;
    document.body.appendChild(root);

    // --- styles inline pour centrage / overlay
    Object.assign(root.style,{position:"fixed",inset:"0",display:"none",alignItems:"center",justifyContent:"center",zIndex:"1000"});
    const backdrop=root.querySelector('.backdrop');
    Object.assign(backdrop.style,{position:"absolute",inset:"0",background:"rgba(0,0,0,0.4)"});
    const dialog=root.querySelector('.dialog');
    Object.assign(dialog.style,{
      position:"relative",
      maxWidth:"min(600px, 90vw)",
      maxHeight:"min(80vh, 800px)",
      width:"min(600px, 90vw)",
      color:"inherit",
      borderRadius:"12px",
      padding:"16px",
      overflow:"auto",
      boxShadow:"0 12px 40px rgba(0,0,0,.25)"
    });
    const close=root.querySelector('.close');
    Object.assign(close.style,{position:"absolute",top:"8px",right:"10px",fontSize:"20px",lineHeight:"1",background:"transparent",border:"none",cursor:"pointer",color:"inherit"});

    root.addEventListener('click',(e)=>{ if (e.target.dataset.close) closeModal(); });
    close.addEventListener('click', closeModal);
  }
  function openCourseModal(ev){
    ensureModal();
    _lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root=document.getElementById('edt-modal');
    const titleEl=root.querySelector('#edt-modal-title');
    const metaEl=root.querySelector('.meta');

    titleEl.textContent = ev.title || 'Cours';
    const salleLabel = ev.extendedProps?.salle || 'Salle ?';
    const salleHTML  = `<button type="button" class="salle-link" id="edt-modal-salle-link">${salleLabel}</button>`;
    metaEl.innerHTML = `
      <div>${frDayLabel(ev.start)} - ${frTime(ev.start)}–${frTime(ev.end)}</div>
      <div>${ev.extendedProps?.professeur || 'Inconnu'}</div>
      <div>${salleHTML}</div>`;

    root.style.display = "flex";                 // centrage via flexbox
    document.documentElement.style.overflow = 'hidden';
    root.querySelector('.close').focus();
  }
  function closeModal(){
    const root=document.getElementById('edt-modal');
    if (root) root.style.display="none";
    document.documentElement.style.overflow = '';
    if (_lastFocused) { try{ _lastFocused.focus(); } catch{} }
  }

  // === Cartes cours =====================================================
  function placeEventCard(timeline, ev){
    const card=document.createElement("div"); card.className="cour";
    const topRow=document.createElement("div");
    const name=document.createElement("p"); name.className="name"; name.textContent=ev.title||"Cours";
    const location=document.createElement("p"); location.className="location"; location.textContent=ev.extendedProps?.salle||"Salle ?";
    topRow.append(name,location);

    const bottomRow=document.createElement("div");
    const prof=document.createElement("p"); prof.className="prof"; prof.textContent=ev.extendedProps?.professeur||"Inconnu";
    const time=document.createElement("p"); time.className="time"; time.textContent=`${frTime(ev.start)} - ${frTime(ev.end)}`;
    bottomRow.append(prof,time);

    card.append(topRow,bottomRow);

    // placement
    card.style.position="absolute";
    const startMin=minutesSinceStart(ev.start);
    const endMin=minutesSinceStart(ev.end);
    const top=clamp(startMin,0,(END_HOUR-START_HOUR)*60)*PX_PER_MIN;
    const height=Math.max(32,(endMin-startMin)*PX_PER_MIN-6);
    Object.assign(card.style,{top:`${top}px`,height:`${height}px`,boxShadow:"0 6px 14px rgba(0,0,0,0.15)",zIndex:2});
    card.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); openCourseModal(ev); });

    timeline.appendChild(card);
  }

  // === Entête des jours ================================================
  function renderDaysHeader(host, monday, showSat, showSun){
    const headerRow=document.createElement('div'); headerRow.className='edt-days-header';
    const spacer=document.createElement('div'); spacer.className='hours-spacer'; headerRow.appendChild(spacer);
    const labelsWrap=document.createElement('div'); labelsWrap.className='days-labels'; headerRow.appendChild(labelsWrap);
    for (let i=0;i<7;i++){
      if ((i===5 && !showSat) || (i===6 && !showSun)) continue;
      const d=addDays(monday,i);
      const cell=document.createElement('div'); cell.className='day-label';
      const wd=d.toLocaleDateString('fr-FR',{weekday:'long'});
      const wdCap=wd.charAt(0).toUpperCase()+wd.slice(1);
      const dateStr=d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
      cell.innerHTML=`<span>${wdCap}</span><span class="date">${dateStr}</span>`;
      labelsWrap.appendChild(cell);
    }
    host.appendChild(headerRow);
  }

  // === Rendu principal ==================================================
  async function loadAndRender(){
    const host=document.querySelector(".calendar-grid");
    if (!host || !CURRENT_GROUP) return;

    host.innerHTML="";
    Object.assign(host.style,{display:"flex",flexDirection:"column"});

    const base=getTargetDate();
    const monday0=getMonday(base);
    const monday=addDays(monday0, weekOffset*7);
    const sunday=addDays(monday,6);

    makeHeader(host, monday, sunday, CURRENT_GROUP);

    // charger events
    let events;
    try { events = await loadICS(CURRENT_GROUP); }
    catch(e){ const p=document.createElement("p"); p.textContent="Impossible de charger l’EDT."; p.style.padding="1rem"; host.appendChild(p); return; }

    const nextMonday=addDays(monday,7);
    const weekEvents=events.filter(e=> e.start>=monday && e.start<nextMonday);
    const byDay=Array.from({length:7},()=>[]);
    for (const ev of weekEvents){ const idx=(ev.start.getDay()+6)%7; byDay[idx].push(ev); }
    byDay.forEach(list=>list.sort((a,b)=>a.start-b.start));
    const showSat=byDay[5].length>0, showSun=byDay[6].length>0;

    // entêtes jours + grille
    renderDaysHeader(host, monday, showSat, showSun);

    const row=document.createElement("div"); Object.assign(row.style,{display:"flex",alignItems:"flex-start"}); host.appendChild(row);
    const hPx=timelineHeightPx();

    const scrollWrap=document.createElement("div");
    Object.assign(scrollWrap.style,{position:"relative",display:"flex",alignItems:"flex-start",height:`${hPx}px`,overflowY:"auto",overflowX:"hidden",width:"100%"});
    row.appendChild(scrollWrap);

    renderTimeRail(scrollWrap,hPx);

    const daysArea=document.createElement("div");
    Object.assign(daysArea.style,{position:"relative",flex:"1 1 auto",display:"flex",alignItems:"flex-start",overflowX:"auto",overflowY:"hidden",height:`${hPx}px`});
    scrollWrap.appendChild(daysArea);

    renderHourOverlay(scrollWrap,hPx);

    const columns=[];
    for (let i=0;i<7;i++){
      if ((i===5 && !showSat) || (i===6 && !showSun)) continue;
      const {timeline} = renderDayColumn(daysArea,hPx);
      byDay[i].forEach(ev=>placeEventCard(timeline,ev));
      columns.push({timeline,idx:i});
    }

    // ligne "maintenant" sur jour courant
    const today=new Date(); const isCurrentWeek=getMonday(today).getTime()===monday.getTime();
    if (isCurrentWeek){
      const todayIdx=(today.getDay()+6)%7;
      const todayCol=columns.find(c=>c.idx===todayIdx);
      if (todayCol) renderNowLine(todayCol.timeline);
    }

    // auto-scroll vertical
    if (isCurrentWeek && columns.length){
      const y=minutesSinceStart(new Date())*PX_PER_MIN - 120;
      scrollWrap.scrollTo({ top: Math.max(0,y), behavior:"smooth" });
    } else if (columns.length){
      const idxFirst=byDay.findIndex(d=>d.length>0);
      if (idxFirst>=0){
        const firstEv=byDay[idxFirst][0]; if (firstEv){
          const y=minutesSinceStart(firstEv.start)*PX_PER_MIN - 20;
          scrollWrap.scrollTo({ top: Math.max(0,y) });
        }
      }
    }

    // résumé 2 semaines (inchangé)
    const twoWeeksEvents = events.filter(e => e.start >= monday && e.start < addDays(monday,14));
    scanWeeks(twoWeeksEvents, monday);
  }

  // === Résumés (inchangé) ===============================================
  function scanWeeks(allEvents, monday){
    const blocks=[
      { label:'Cette semaine', base:new Date(monday), el:document.getElementById('summary-this-week') },
      { label:'Semaine prochaine', base:addDays(new Date(monday),7), el:document.getElementById('summary-next-week') }
    ];
    blocks.forEach(b=>{
      const cont=b.el; if (!cont) return;
      cont.innerHTML=''; const h3=document.createElement('h3'); h3.textContent=b.label; cont.appendChild(h3);
      const feries=new Set(); let hasVac=false; const empties=[]; const exams=[];
      for (let i=0;i<7;i++){
        const day=addDays(b.base,i); const dow=day.getDay(); if (dow===0||dow===6) continue;
        const label=day.toLocaleDateString('fr-FR',{day:'numeric',month:'long'});
        const dEv=allEvents.filter(e=>sameYMD(e.start,day));
        if (!dEv.length) empties.push(label);
        else dEv.forEach(e=>{
          const t=e.title||''; if (/Vacances/i.test(t)) hasVac=true;
          else if (/Ferié|Férié/i.test(t)) feries.add(label);
          else if (/Examen|Soutenance|Evaluation|évaluation|contrôle|partiel|test/i.test(t)) exams.push(`${label} → ${t}`);
        });
      }
      if (!feries.size && !hasVac && !empties.length && !exams.length){ cont.appendChild(document.createElement('p')).textContent='Rien à signaler'; return; }
      if (feries.size) cont.appendChild(document.createElement('p')).textContent=`Jours fériés : ${[...feries].join(', ')}`;
      if (hasVac)      cont.appendChild(document.createElement('p')).textContent='Vacances en approche';
      if (empties.length) cont.appendChild(document.createElement('p')).textContent=`Jours vides : ${empties.join(', ')}`;
      if (exams.length)   cont.appendChild(document.createElement('p')).textContent=`Examens : ${exams.join(', ')}`;
    });
  }

  // === Init & raccourcis ================================================
  window.initEDTGrid = function(){
    CURRENT_GROUP = localStorage.getItem(LS_KEY) || "G1";
    loadAndRender();
    scheduleNextUpdate();
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    if (document.querySelector('.calendar-grid')) window.initEDTGrid();
  });

  window.addEventListener('keydown',(e)=>{
    if (e.key === 'Escape'){
      const m=document.getElementById('edt-modal');
      if (m && m.style.display==="flex"){ e.preventDefault(); closeModal(); return; }
    }
    if (e.key === 'ArrowLeft'){ e.preventDefault(); weekOffset--; loadAndRender(); }
    if (e.key === 'ArrowRight'){ e.preventDefault(); weekOffset++; loadAndRender(); }
    if (e.key.toLowerCase() === 't'){ e.preventDefault(); weekOffset=0; loadAndRender(); }
  });
})();
