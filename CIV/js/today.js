(function(){
  const START_HOUR = 7;
  const END_HOUR   = 20;
  const PX_PER_MIN = 1.2;
  const VIEW_MODE  = "auto";

  // --- où lire le groupe choisi
  const LS_KEYS = ["edt.group", "selectedGroup"]; // compat
  const ICS_BASE = "ics/";
  const icsUrlFor = g => `${ICS_BASE}PSI_${g}.ics`;

  let _lastFocused = null; // focus retour après modale

  function getCurrentGroup(){
    for (const k of LS_KEYS){
      const v = localStorage.getItem(k);
      if (v) return v;
    }
    return null;
  }

  function getTargetDate(){
    const now = new Date();
    const target = new Date();
    if (VIEW_MODE === "tomorrow") target.setDate(target.getDate() + 1);
    else if (VIEW_MODE === "auto" && now.getHours() >= 21) target.setDate(target.getDate() + 1);
    target.setHours(0,0,0,0);
    return target;
  }

  function shouldUpdateAt(){ return new Date().getHours() < 21 ? 21 : 24; }
  function scheduleNextUpdate(){
    const now = new Date();
    const targetHour = shouldUpdateAt();
    const next = new Date(now);
    next.setHours(targetHour, 0, 0, 0);
    if (targetHour === 24) next.setDate(now.getDate()+1);
    const delay = next - now;
    setTimeout(() => { loadAndRender(); scheduleNextUpdate(); }, Math.max(1000, delay));
  }

  // === ICS ===
  function icsTimeToDate(ics){
    const y=+ics.substring(0,4), m=+ics.substring(4,6)-1, d=+ics.substring(6,8);
    const H=+ics.substring(9,11), M=+ics.substring(11,13), S=+(ics.substring(13,15)||"0");
    return ics.endsWith("Z") ? new Date(Date.UTC(y,m,d,H,M,S)) : new Date(y,m,d,H,M,S);
  }
  function parseICS(text){
    const lines = text.replace(/\r/g, "\n").split(/\n/);
    const out = []; let ev = null;
    for (let i=1; i<lines.length; i++){ if (lines[i].startsWith(" ")){ lines[i-1]+=lines[i].slice(1); lines[i] = ""; } }
    for (const raw of lines){
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith("BEGIN:VEVENT")) ev = { extendedProps:{ professeur:"Inconnu", salle:"", salleUrl:null } };
      else if (line.startsWith("SUMMARY:")) ev.title = line.slice(8).trim();
      else if (line.startsWith("DTSTART"))  ev.start = icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("DTEND"))    ev.end   = icsTimeToDate(line.split(":")[1]);
      else if (line.startsWith("LOCATION:")){
        const salleClean=line.slice(9).trim().replace(/\\,/g,',');
        ev.extendedProps.salle = salleClean || "Salle inconnue";
        ev.extendedProps.salleUrl = salleClean ? `carte.html#${encodeURIComponent(salleClean)}` : null;
      } else if (line.startsWith("DESCRIPTION:")){
        const cleaned=line.slice(12).trim()
          .replace(/\\n/g," ").replace(/Groupe|Modifié le:|\(|\)|\//g,"")
        ev.extendedProps.professeur = cleaned || "Inconnu";
      } else if (line.startsWith("END:VEVENT")){ if (ev) out.push(ev); ev=null; }
    }
    return out;
  }

  // === Rendu (jour) ===
  function minutesSinceStart(d){ return (d.getHours()-START_HOUR)*60 + d.getMinutes(); }
  const clamp=(v,min,max)=>Math.max(min, Math.min(max, v));
  const pad2=n=>(n<10?"0":"")+n;
  const frTime=d=>`${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
  const sameYMD=(a,b)=>a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  const frDayLabel=d=>d.toLocaleDateString('fr-FR',{weekday:"long", day:"2-digit", month:"long"});

  function renderGrid(container, group){
    container.innerHTML = "";
    container.style.position = "relative";
    container.style.padding = "0";

    // header compact
    const hdr=document.createElement("div");
    hdr.style.display="flex"; hdr.style.justifyContent="space-between"; hdr.style.alignItems="center";
    hdr.style.marginBottom="6px";
    const left=document.createElement("div");
    left.textContent=new Date().toLocaleDateString('fr-FR',{weekday:"long", day:"2-digit", month:"short"}).replace(/^\w/, c=>c.toUpperCase());
    left.style.fontWeight="600";
    const right=document.createElement("div");
    right.style.opacity="0.8"; right.style.fontSize="0.9rem";
    right.textContent = group ? `Groupe ${group}` : "";
    hdr.append(left,right);
    container.appendChild(hdr);

    const timeline = document.createElement("div");
    timeline.setAttribute("data-role", "timeline");
    timeline.style.position = "relative";
    const totalMinutes = (END_HOUR-START_HOUR)*60;
    timeline.style.height = `${Math.max(480, totalMinutes*PX_PER_MIN)}px`;

    for (let h=START_HOUR; h<=END_HOUR; h++){
      const top = (h-START_HOUR)*60*PX_PER_MIN;
      const row = document.createElement("div");
      row.style.position = "absolute";
      row.style.left = 0; row.style.right = 0; row.style.top = `${top}px`;
      row.style.borderTop = "1px solid var(--glass-border)";
      row.style.opacity = "0.6";

      const label = document.createElement("span");
      label.textContent = `${pad2(h)}:00`;
      label.style.position = "absolute";
      label.style.left = "10px";
      label.style.top = "-10px";
      label.style.fontSize = "12px";
      label.style.color = "var(--less-important-text)";

      row.appendChild(label);
      timeline.appendChild(row);
    }

    const nowLine = document.createElement("div");
    nowLine.id = "now-line";
    nowLine.style.position = "absolute";
    nowLine.style.left = 0; nowLine.style.right = 0;
    nowLine.style.height = "2px";
    nowLine.style.background = "#e74c3c";
    nowLine.style.boxShadow = "0 0 6px rgba(231,76,60,0.8)";
    nowLine.style.zIndex = 5;
    timeline.appendChild(nowLine);

    container.appendChild(timeline);
    return { timeline, nowLine };
  }

  // === Modale ===========================================================
  function ensureModal(){
    if (document.getElementById('edt-modal')) return;
    const root=document.createElement('div');
    root.id='edt-modal';
    root.innerHTML = `
      <div class="backdrop" data-close="1" aria-hidden="true"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="edt-modal-title">
        <button class="close" aria-label="Fermer">×</button>
        <h3 id="edt-modal-title" class="title"></h3>
        <div class="meta"></div>
      </div>`;
    document.body.appendChild(root);

    // styles inline pour centrage + overlay
    Object.assign(root.style,{position:"fixed",inset:"0",display:"none",alignItems:"center",justifyContent:"center",zIndex:"1000"});
    const backdrop=root.querySelector('.backdrop');
    Object.assign(backdrop.style,{position:"absolute",inset:"0",background:"rgba(0,0,0,0.4)"});
    const dialog=root.querySelector('.dialog');
    Object.assign(dialog.style,{
      position:"relative",
      width:"min(600px, 90vw)",
      maxHeight:"min(80vh, 800px)",
      color:"inherit",
      borderRadius:"12px",
      padding:"16px",
      overflow:"auto",
      boxShadow:"0 12px 40px rgba(0,0,0,.25)"
    });
    const close=root.querySelector('.close');
    Object.assign(close.style,{position:"absolute",top:"8px",right:"10px",fontSize:"20px",background:"transparent",border:"none",cursor:"pointer",color:"inherit"});

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
      <div>${frDayLabel(ev.start)} — ${frTime(ev.start)}–${frTime(ev.end)}</div>
      <div>${ev.extendedProps?.professeur || 'Inconnu'}</div>
      <div>${salleHTML}</div>`;

    const salleBtn = root.querySelector('#edt-modal-salle-link');
    if (salleBtn) {
      salleBtn.style.cursor = "pointer";
      salleBtn.addEventListener('click', () => {
        if (ev.extendedProps?.salleUrl) {
          if (typeof window.afficheSalle === 'function') window.afficheSalle(ev.extendedProps.salleUrl);
          else window.location.href = ev.extendedProps.salleUrl;
        }
        closeModal();
      }, { once:true });
    }

    root.style.display = "flex"; // centrée via flexbox
    document.documentElement.style.overflow = 'hidden';
    root.querySelector('.close').focus();
  }
  function closeModal(){
    const root=document.getElementById('edt-modal');
    if (root) root.style.display="none";
    document.documentElement.style.overflow = '';
    if (_lastFocused) { try{ _lastFocused.focus(); } catch{} }
  }

  // === Cartes cours + click => modale ==================================
  function placeEventCard(timeline, ev){
    const card = document.createElement("div");
    card.className = "cour";

    const topRow = document.createElement("div");
    const name = document.createElement("p"); name.className = "name"; name.textContent = ev.title || "Cours";
    const location = document.createElement("p"); location.className = "location"; location.textContent = ev.extendedProps?.salle || "Salle ?";
    if (ev.extendedProps?.salleUrl) {
      location.style.cursor = 'pointer';
      location.title = 'Ouvrir sur la carte des prises';
      location.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (typeof window.afficheSalle === 'function') window.afficheSalle(ev.extendedProps.salleUrl);
        else window.location.href = ev.extendedProps.salleUrl;
      });
    }
    topRow.appendChild(name); topRow.appendChild(location);

    const bottomRow = document.createElement("div");
    const prof = document.createElement("p"); prof.className = "prof"; prof.textContent = ev.extendedProps?.professeur || "Inconnu";
    const time = document.createElement("p"); time.className = "time"; time.textContent = `${frTime(ev.start)} - ${frTime(ev.end)}`;
    bottomRow.appendChild(prof); bottomRow.appendChild(time);

    card.appendChild(topRow);
    card.appendChild(bottomRow);

    // positionnement
    card.style.position = "absolute";
    const startMin = minutesSinceStart(ev.start);
    const endMin = minutesSinceStart(ev.end);
    const top = clamp(startMin, 0, (END_HOUR-START_HOUR)*60) * PX_PER_MIN;
    const height = Math.max(32, (endMin - startMin) * PX_PER_MIN - 6);
    Object.assign(card.style,{left:"0",right:"0",top:`${top}px`,height:`${height}px`,zIndex:2,boxShadow:"0 6px 14px rgba(0,0,0,0.15)"});

    // ouverture modale
    card.style.cursor = "pointer";
    card.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); openCourseModal(ev); });

    timeline.appendChild(card);
  }

  async function loadICS(group){
    const resp = await fetch(icsUrlFor(group));
    if (!resp.ok) throw new Error(`Erreur de chargement de l'ICS (${group})`);
    return parseICS(await resp.text());
  }

  async function loadAndRender(){
    const group = getCurrentGroup();
    const container = document.querySelector(".calendar-grid");
    if (!container) return;

    if (!group){
      container.innerHTML = "";
      const msg = document.createElement("p");
      msg.textContent = "Choisis d’abord ton groupe sur la page de planning (aucun groupe trouvé).";
      msg.style.padding = "1rem";
      container.appendChild(msg);
      return;
    }

    const targetDate = getTargetDate();
    const {timeline, nowLine} = renderGrid(container, group);

    try{
      const events = await loadICS(group);
      const todays = events.filter(e => sameYMD(e.start, targetDate));
      todays.sort((a,b)=>a.start - b.start);
      todays.forEach(ev => placeEventCard(timeline, ev));

      const now = new Date();
      if (sameYMD(now, targetDate) && todays.length){
        const y = minutesSinceStart(now)*PX_PER_MIN - (container.clientHeight*0.35);
        container.scrollTo({ top: Math.max(0,y), behavior: "smooth"});
      } else if (todays[0]){
        const y = minutesSinceStart(todays[0].start)*PX_PER_MIN - 20;
        container.scrollTo({ top: Math.max(0,y) });
      }

      const tick = () => {
        const minutes = minutesSinceStart(new Date());
        const total = (END_HOUR-START_HOUR)*60;
        if (!sameYMD(new Date(), targetDate) || minutes<0 || minutes>total){
          nowLine.style.display = "none";
        } else {
          nowLine.style.display = "block";
          nowLine.style.top = `${minutes*PX_PER_MIN}px`;
        }
      };
      tick();
      clearInterval(container._nowTimer);
      container._nowTimer = setInterval(tick, 60*1000);

    }catch(err){
      console.error("EDT –", err);
      container.innerHTML = "";
      const msg = document.createElement("p");
      msg.textContent = `Impossible de charger l’EDT du groupe ${group}.`;
      msg.style.padding = "1rem";
      container.appendChild(msg);
    }
  }

  window.initEDTGrid = function(){
    loadAndRender();
    scheduleNextUpdate();
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    const host = document.querySelector(".calendar-grid");
    if (host) window.initEDTGrid();
  });

  // Escape ferme la modale si ouverte
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){
      const root=document.getElementById('edt-modal');
      if (root && root.style.display==="flex"){ e.preventDefault(); closeModal(); }
    }
  });
})();
