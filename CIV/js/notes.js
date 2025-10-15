(() => {
  const GRID = document.getElementById('note-grid');
  const ADD_BTN = GRID.querySelector('.ajout');
  const SEARCH = document.getElementById('note-search');
  const LS_KEY = 'notes_local_v1';
  let editingCard = null; // bloque les toggles pendant l'édition
  let initialNotes = [];  // snapshot trié uniquement au chargement (et enrichi quand on ajoute des notes)

  // --------- Utils stockage local ----------
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveLocal(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  // --------- Sanitize HTML pour notes.json (sécurité basique) ----------
  function sanitizeHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    tmp.querySelectorAll('script,style').forEach(el => el.remove());
    tmp.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || '');
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^javascript:/i.test(val)) el.removeAttribute(attr.name);
      });
    });
    return tmp.innerHTML;
  }

  // --------- getText util (pour recherche sur HTML) ----------
  function getTextFromHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return tmp.textContent || tmp.innerText || '';
  }

  // --------- Identifiant stable pour le tri/ordre ----------
  const noteKey = (n) => n.id || `${n.Titre}_${n.timestamp}`;

  // --------- Charger notes.json (read-only) ----------
  async function loadRemote() {
    try {
      const res = await fetch('js/notes.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map(n => ({
        Titre: n.Titre ?? 'Sans titre',
        Content: n.Content ?? '',
        importance: Number.isFinite(n.importance) ? n.importance : 1,
        editable: !!n.editable,
        timestamp: Number(n.timestamp) || Date.now(),
        _source: 'remote'
      }));
    } catch (e) {
      console.warn('notes.json introuvable ou invalide:', e);
      return [];
    }
  }

  // --------- Tri initial : importance desc puis timestamp desc ----------
  function sortNotes(a, b) {
    if ((b.importance|0) !== (a.importance|0)) return (b.importance|0) - (a.importance|0);
    return (b.timestamp|0) - (a.timestamp|0);
  }

  // --------- Recherche (insensible casse/accents) ----------
  let searchQuery = '';
  const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matchesSearch = (note) => {
    if (!searchQuery) return true;
    const q = norm(searchQuery);
    const contentText = note._source === 'remote' ? getTextFromHTML(note.Content) : (note.Content || '');
    return norm(note.Titre).includes(q) || norm(contentText).includes(q);
  };
  const debounce = (fn, wait = 150) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };

  // --------- Rendu ----------
  function render(all) {
    [...GRID.querySelectorAll('.note')].forEach(n => n.remove());
    const anchor = ADD_BTN;

    for (const note of all) {
      const card = document.createElement('div');
      card.className = 'note';
      card.dataset.id = note.id ?? '';
      card.dataset.source = note._source;
      card.dataset.editable = note.editable ? '1' : '0';

      // --- Header ---
      const head = document.createElement('div');
      head.className = 'note-head';

      const h4 = document.createElement('h4');
      h4.textContent = note.Titre;

      // --- Actions row (collapse + delete) ---
      const actionsRow = document.createElement('div');
      actionsRow.className = 'row';

      const collapseBtn = document.createElement('button');
      collapseBtn.setAttribute('title', 'Replier');
      collapseBtn.className = 'collapse';
      collapseBtn.innerHTML = `<img src="img/collapse.svg" alt="Replier">`;

      const delBtn = document.createElement('button');
      delBtn.setAttribute('title', 'Supprimer');
      delBtn.innerHTML = `<img src="img/delete.svg" alt="Supprimer">`;
      if (!note.editable) {
        delBtn.disabled = true;
        delBtn.style.opacity = .5;
        delBtn.style.cursor = 'not-allowed';
      }

      actionsRow.appendChild(collapseBtn);
      actionsRow.appendChild(delBtn);

      head.appendChild(h4);
      head.appendChild(actionsRow);

      // --- Body ---
      const body = document.createElement('p');
      body.className = 'note-content';

      if (note._source === 'remote') {
        body.innerHTML = sanitizeHTML(note.Content);
        body.style.whiteSpace = 'normal';
      } else {
        body.textContent = note.Content;
        body.style.whiteSpace = 'pre-wrap';
      }

      card.appendChild(head);
      card.appendChild(body);

      // Ouvrir uniquement (ne ferme pas les autres)
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (editingCard) return;
        if (!card.classList.contains('open')) {
          card.classList.add('open');
        }
      });

      // Fermer uniquement via le bouton collapse
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editingCard) return;
        card.classList.remove('open');
      });

      // Double-clic pour éditer (seulement locales/éditables)
      card.addEventListener('dblclick', (e) => {
        if (card.dataset.editable !== '1') return;
        if (e.target.closest('button')) return;
        e.stopPropagation();

        h4.contentEditable = 'true';
        body.contentEditable = 'true';
        card.classList.add('editing');
        editingCard = card;

        const blockEnterInTitle = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); body.focus(); } };
        h4.addEventListener('keydown', blockEnterInTitle);

        const finish = () => {
          h4.contentEditable = 'false';
          body.contentEditable = 'false';
          card.classList.remove('editing');
          editingCard = null;

          const locals = loadLocal();
          const idx = locals.findIndex(n => n.id === note.id);
          if (idx >= 0) {
            const newTitle = h4.innerText.replace(/\n+/g, ' ').trim() || 'Sans titre';
            locals[idx].Titre = newTitle;
            locals[idx].Content = body.innerText;
            saveLocal(locals);
            refresh();
          }

          h4.removeEventListener('keydown', blockEnterInTitle);
          h4.removeEventListener('blur', finish);
          body.removeEventListener('blur', finish);
        };

        h4.addEventListener('blur', finish);
        body.addEventListener('blur', finish);

        if (e.target === h4 || h4.contains(e.target)) {
          const range = document.createRange();
          range.selectNodeContents(h4);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          h4.focus();
        } else {
          body.focus();
        }
      });

      // Supprimer
      delBtn.addEventListener('click', () => {
        if (card.dataset.editable !== '1') return;
        const ok = confirm(`Supprimer la note « ${h4.textContent} » ?`);
        if (!ok) return;
        const locals = loadLocal();
        const idx = locals.findIndex(n => n.id === note.id);
        if (idx >= 0) {
          locals.splice(idx, 1);
          saveLocal(locals);
          // retire aussi de l'ordre initial pour la cohérence
          initialNotes = initialNotes.filter(n => noteKey(n) !== noteKey(note));
          refresh();
        }
      });

      GRID.insertBefore(card, anchor);
    }
  }

  // --------- Fusion + refresh ----------
  let remoteCache = [];
  function refresh() {
    const locals = loadLocal().map(n => ({ ...n, _source: 'local' }));
    const base = [...remoteCache, ...locals];
    const byKey = new Map(base.map(n => [noteKey(n), n]));
    // Reconstruit la liste dans l'ordre de initialNotes et inclut les nouvelles ids ajoutées dedans
    const ordered = initialNotes.map(n => byKey.get(noteKey(n))).filter(Boolean);
    const filtered = ordered.filter(matchesSearch);
    render(filtered);
  }

  // --------- Ajouter une note (affichage immédiat) ----------
  function addNote() {
    const locals = loadLocal();
    const newNote = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      Titre: 'Nouvelle note',
      Content: '',
      importance: 1,
      editable: true,
      timestamp: Date.now(),
      _source: 'local'
    };
    locals.unshift({ ...newNote });
    saveLocal(locals);
    // Ajoute la note dans l'ordre initial SANS re-trier
    initialNotes.unshift({ ...newNote });
    refresh(); // apparition en temps réel
  }

  // --------- Init ----------
  ADD_BTN.addEventListener('click', addNote);

  if (SEARCH) {
    SEARCH.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value || '';
      refresh();
    }, 150));
  }

  (async () => {
    remoteCache = await loadRemote();
    remoteCache = remoteCache.map(n => ({ ...n, editable: !!n.editable }));
    const locals = loadLocal().map(n => ({ ...n, _source: 'local' }));
    initialNotes = [...remoteCache, ...locals].sort(sortNotes);
    render(initialNotes);
  })();
})();
