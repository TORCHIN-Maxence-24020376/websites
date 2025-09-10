(() => {
  const DATA_URL = "websites.json";
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
    const container = document.querySelector(".website-selector");
    const searchInput = document.getElementById("website-search");

    if (!container) {
      console.warn(".website-selector introuvable");
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

  // Adapte aux clés FR du JSON
  function normalize(arr) {
    return (Array.isArray(arr) ? arr : []).map((it) => ({
      nom: String(it.nom ?? "").trim(),
      lien: String(it.lien ?? "").trim(),
      logo: String(it.logo ?? "").trim(),
      alt: String(it.alt ?? "").trim(),
      title: String(it.title ?? "").trim(),
    }));
  }

  function stripAccents(s) {
    try {
      return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    } catch {
      return s;
    }
  }

  // Recherche sur nom + title + alt
  function filterLinks(arr, q) {
    if (!q) return arr;
    const qlc = stripAccents(q).toLowerCase();
    return arr.filter((it) => {
      const nom   = stripAccents(it.nom).toLowerCase();
      const tit   = stripAccents(it.title).toLowerCase();
      const alt   = stripAccents(it.alt).toLowerCase();
      return nom.includes(qlc) || tit.includes(qlc) || alt.includes(qlc);
    });
  }

  function render(list, container) {
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = `<p>Aucun résultat.</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const it of list) frag.appendChild(makeCard(it));
    container.appendChild(frag);
  }

  // Génère EXACTEMENT l’output demandé
  function makeCard(it) {
    const a = document.createElement("a");
    a.href = it.lien || "#";
    if (it.title) a.title = it.title;

    const img = document.createElement("img");
    img.src = it.logo || FALLBACK_LOGO;
    img.alt = it.alt || it.nom || "logo";
    img.loading = "lazy";
    img.onerror = () => (img.src = FALLBACK_LOGO);

    const h3 = document.createElement("h3");
    h3.textContent = it.nom || "Sans nom";

    a.appendChild(img);
    a.appendChild(h3);

    return a;
  }
})();

// Shrink du logo au scroll (smooth via CSS .logo)
window.addEventListener("scroll", () => {
  const logo = document.querySelector(".logo");
  if (!logo) return;
  if (window.scrollY > 50) {
    logo.classList.add("shrink");
  } else {
    logo.classList.remove("shrink");
  }
});
