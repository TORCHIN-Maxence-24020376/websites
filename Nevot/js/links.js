(() => {
  const DATA_URL = "js/links.json";
  const LOGO_BASE = "img/";
  const FALLBACK_LOGO = "icon.svg";

  let ALL = [];
  let query = "";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(init);

  async function init() {
    const container = document.querySelector(".ressources-selector");
    const searchInput = document.getElementById("resource-search");

    if (!container) {
      console.warn("[small_links] .ressources-selector introuvable");
      return;
    }

    try {
      const data = await fetchJSON(DATA_URL);
      ALL = normalize(data);
      render(ALL, container);

      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          query = (e.target.value || "").toLowerCase().trim();
          render(filterLinks(ALL, query), container);
        });
      }
    } catch (e) {
      console.error(e);
      container.innerHTML = `<p>Impossible de charger les ressources.</p>`;
    }
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    return r.json();
  }

  function normalize(arr) {
    return (Array.isArray(arr) ? arr : []).map((it) => ({
      title: String(it.title ?? "").trim(),
      link: String(it.link ?? "").trim(),
      tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
      logo: String(it.logo ?? "").trim(),
      description_small: String(it.description_small ?? "").trim(),
      description_long: String(it.description_long ?? "").trim(),
    }));
  }

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function filterLinks(arr, q) {
  if (!q) return arr;
  const qlc = stripAccents(q).toLowerCase();

  return arr.filter((it) => {
    const title = stripAccents(it.title).toLowerCase();
    const tags  = it.tags.map(t => stripAccents(String(t)).toLowerCase());

    return title.includes(qlc) || tags.some(t => t.includes(qlc));
  });
}


  function render(list, container) {
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = `<p>Aucun résultat.</p>`;
      return;
    }
  
    // 🔎 tri alphabétique A → Z avant affichage
    list.sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
  
    const frag = document.createDocumentFragment();
    for (const it of list) frag.appendChild(makeCard(it));
    container.appendChild(frag);
  }
  

  function makeCard(it) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = it.link || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.title = it.description_small || it.title || "";
  
    const img = document.createElement("img");
    img.src = (it.logo ? LOGO_BASE + it.logo : LOGO_BASE + FALLBACK_LOGO);
    img.alt = it.title || "logo";
    img.loading = "lazy";
    img.onerror = () => (img.src = LOGO_BASE + FALLBACK_LOGO);
  
    const div = document.createElement("div");
  
    const pName = document.createElement("p");
    pName.className = "name";
    pName.textContent = it.title || "Sans titre";
  
    const pDesc = document.createElement("p");
    pDesc.className = "desc";
    pDesc.textContent = it.description_long || "";
  
    div.appendChild(pName);
    div.appendChild(pDesc);
  
    a.appendChild(img);
    a.appendChild(div);
  
    return a;
  }
  
})();
