(async () => {
  const includes = document.querySelectorAll("[data-include]");
  await Promise.all([...includes].map(async el => {
    const url = el.getAttribute("data-include");
    const res = await fetch(url, { cache: "no-cache" });
    el.innerHTML = await res.text();
  }));

  // Définition du titre de page
  let path = window.location.pathname;
  let page = path.split("/").pop() || "index";
  page = page.split(".")[0];

  const titles = {
    "index": "Accueil",
    "edt": "Emploi du Temps",
    "ressources": "Ressources"
  };
  const finalTitle = titles[page] || page.charAt(0).toUpperCase() + page.slice(1);

  const h1 = document.getElementById("title");
  if (h1) h1.textContent = finalTitle;
})();

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("date");
  if (!el) return;

  const now = new Date();

  // format "PC" : Mardi 7 juillet
  const pcFmt = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(now);

  // format "téléphone" : 18/07/2025
  const phoneFmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(now);

  // détection largeur écran
  const isPhone = window.matchMedia("(max-width: 768px)").matches;

  el.textContent = isPhone ? phoneFmt : pcFmt;
});
