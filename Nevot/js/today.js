
(function(){
    const START_HOUR = 7;
    const END_HOUR   = 20;
    const PX_PER_MIN = 1.2;
  
    const ICS_URL = 'https://raw.githubusercontent.com/TORCHIN-Maxence-24020376/EDT/main/edt_data/NEVOT.ics'
  
    const VIEW_MODE = "auto";
  
    
    function getTargetDate(){
      const now = new Date();
      const target = new Date();
      if (VIEW_MODE === "tomorrow"){
        target.setDate(target.getDate() + 1);
      } else if (VIEW_MODE === "auto"){
        if (now.getHours() >= 21) target.setDate(target.getDate() + 1);
      }
      target.setHours(0,0,0,0);
      return target;
    }
    function shouldUpdateAt(){
      const h = new Date().getHours();
      return h < 21 ? 21 : 24;
    }
  
    function scheduleNextUpdate(){
      const now = new Date();
      const targetHour = shouldUpdateAt();
      const next = new Date(now);
      next.setHours(targetHour, 0, 0, 0);
      if (targetHour === 24) next.setDate(now.getDate()+1);
      const delay = next - now;
      setTimeout(() => {
        loadAndRender();
        scheduleNextUpdate();
      }, Math.max(1000, delay));
    }
  
    // === ICS ===
    function icsTimeToDate(ics){
      const y = parseInt(ics.substring(0,4),10);
      const m = parseInt(ics.substring(4,6),10)-1;
      const d = parseInt(ics.substring(6,8),10);
      const H = parseInt(ics.substring(9,11),10);
      const M = parseInt(ics.substring(11,13),10);
      const S = parseInt(ics.substring(13,15)||"0",10);
      if (ics.endsWith("Z")){
        return new Date(Date.UTC(y,m,d,H,M,S));
      } else {
        return new Date(y, m, d, H, M, S);
      }
    }
  
    function parseICS(text){
      const lines = text.replace(/\r/g, "\n").split(/\n/);
      const out = [];
      let ev = null;
  
      // dépliage des lignes repliées
      for (let i=1; i<lines.length; i++){
        if (lines[i].startsWith(" ")){
          lines[i-1] += lines[i].slice(1);
          lines[i] = "";
        }
      }
  
      for (const raw of lines){
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("BEGIN:VEVENT")){
          ev = { extendedProps: { professeur:"Inconnu", salle: "", salleUrl:null } };
        } else if (line.startsWith("SUMMARY:")){
          ev.title = line.slice(8).trim();
        } else if (line.startsWith("DTSTART")){
          const v = line.split(":")[1];
          ev.start = icsTimeToDate(v);
        } else if (line.startsWith("DTEND")){
          const v = line.split(":")[1];
          ev.end = icsTimeToDate(v);
        } else if (line.startsWith("LOCATION:")){
          const rawLoc = line.slice(9).trim();
          const salleClean = rawLoc.replace(/\\,/g, ','); // "\," -> ","
          ev.extendedProps.salle = salleClean || "Salle inconnue";
          ev.extendedProps.salleUrl = salleClean ? `carte.html#${encodeURIComponent(salleClean)}` : null;
        } else if (line.startsWith("DESCRIPTION:")){
          const desc = line.slice(12).trim();
          const cleaned = desc
            .replace(/\\n/g, " ")
            .replace(/Groupe|Modifié le:|\(|\)|\//g, "")
            .replace(/\d+/g, "")
            .replace(/\s+/g, " ")
            .replace(/-/g, " ")
            .replace(/ère année|ème année|ère Année|ème Année/g, "")
            .replace(/:/g, "")
            .replace(/A an| an /g, " ")
            .replace(/G[A-Z] /g, "")
            .trim();
          ev.extendedProps.professeur = cleaned || "Inconnu";
        } else if (line.startsWith("END:VEVENT")){
          if (ev) out.push(ev);
          ev = null;
        }
      }
      return out;
    }
  
    // === Rendu ===
    function minutesSinceStart(date){
      return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
    }
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
    function pad2(n){ return (n<10?"0":"") + n; }
    function frTime(d){ return `${pad2(d.getHours())}h${pad2(d.getMinutes())}`; }
  
    function renderGrid(container){
      container.innerHTML = "";
      container.style.position = "relative";
      container.style.padding = "0";
  
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
  
    function placeEventCard(timeline, ev){
      const card = document.createElement("div");
      card.className = "cour";
  
      const topRow = document.createElement("div");
      const name = document.createElement("p"); name.className = "name"; name.textContent = ev.title || "Cours";
      const location = document.createElement("p"); location.className = "location"; location.textContent = ev.extendedProps?.salle || "Salle ?";
      topRow.appendChild(name); topRow.appendChild(location);
  
      const bottomRow = document.createElement("div");
      const prof = document.createElement("p"); prof.className = "prof"; prof.textContent = ev.extendedProps?.professeur || "Inconnu";
      const time = document.createElement("p"); time.className = "time"; time.textContent = `${frTime(ev.start)} - ${frTime(ev.end)}`;
      bottomRow.appendChild(prof); bottomRow.appendChild(time);
  
      card.appendChild(topRow);
      card.appendChild(bottomRow);
  
      card.style.position = "absolute";
      const startMin = minutesSinceStart(ev.start);
      const endMin = minutesSinceStart(ev.end);
  
      const top = clamp(startMin, 0, (END_HOUR-START_HOUR)*60) * PX_PER_MIN;
      const height = Math.max(32, (endMin - startMin) * PX_PER_MIN - 6);
  
      card.style.left = "10px";
      card.style.right = "10px";
      card.style.top = `${top}px`;
      card.style.height = `${height}px`;
      card.style.zIndex = 2;
  
      card.style.boxShadow = "0 6px 14px rgba(0,0,0,0.15)";
  
      timeline.appendChild(card);
    }
  
    function sameYMD(a,b){
      return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    }
  
    function updateNowLine(nowLine, containerDate){
      const now = new Date();
      const minutes = minutesSinceStart(now);
      const total = (END_HOUR-START_HOUR)*60;
      if (!sameYMD(now, containerDate) || minutes<0 || minutes>total){
        nowLine.style.display = "none";
        return;
      }
      nowLine.style.display = "block";
      nowLine.style.top = `${minutes*PX_PER_MIN}px`;
    }
  
    async function loadICS(){
      const resp = await fetch(ICS_URL);
      if (!resp.ok) throw new Error("Erreur de chargement de l'ICS");
      const text = await resp.text();
      return parseICS(text);
    }
  
    async function loadAndRender(){
      const targetDate = getTargetDate();
      const container = document.querySelector(".calendar-grid");
      if (!container) return;
  
      const {timeline, nowLine} = renderGrid(container);
  
      try{
        const events = await loadICS();
        const targetDate = getTargetDate();
        const todays = events.filter(e => sameYMD(e.start, targetDate));
        console.debug("EDT:", { total: events.length, matching: todays.length, targetDate });
        todays.sort((a,b)=>a.start - b.start);
        todays.forEach(ev => placeEventCard(timeline, ev));
  
        const now = new Date();
        if (sameYMD(now, targetDate)){
          const y = minutesSinceStart(now)*PX_PER_MIN - (container.clientHeight*0.35);
          container.scrollTo({ top: Math.max(0,y), behavior: "smooth"});
        } else if (todays[0]){
          const y = minutesSinceStart(todays[0].start)*PX_PER_MIN - 20;
          container.scrollTo({ top: Math.max(0,y) });
        }
  
        const tick = () => updateNowLine(nowLine, targetDate);
        tick();
        clearInterval(container._nowTimer);
        container._nowTimer = setInterval(tick, 60*1000);
  
      }catch(err){
        console.error("EDT –", err);
        const msg = document.createElement("p");
        msg.textContent = "Impossible de charger l’EDT.";
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
  })();
  