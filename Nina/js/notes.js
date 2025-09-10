(() => {
    const GRID = document.getElementById('note-grid');
    const ADD_BTN = GRID.querySelector('.ajout');
    const SEARCH = document.getElementById('note-search');
    const LS_KEY = 'notes_local_v1';
    let editingCard = null;
    let initialNotes = [];
  
    function loadLocal() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
      catch { return []; }
    }
    function saveLocal(arr) {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    }
  
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
  
    function getTextFromHTML(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = String(html || '');
      return tmp.textContent || tmp.innerText || '';
    }
  
    const noteKey = (n) => n.id || `${n.Titre}_${n.timestamp}`;
  
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
  
    function sortNotes(a, b) {
      if ((b.importance|0) !== (a.importance|0)) return (b.importance|0) - (a.importance|0);
      return (b.timestamp|0) - (a.timestamp|0);
    }
  
    let searchQuery = '';
    const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matchesSearch = (note) => {
      if (!searchQuery) return true;
      const q = norm(searchQuery);
      const contentText = note._source === 'remote' ? getTextFromHTML(note.Content) : (note.Content || '');
      return norm(note.Titre).includes(q) || norm(contentText).includes(q);
    };
    const debounce = (fn, wait = 150) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };
  
    function render(all) {
      [...GRID.querySelectorAll('.note')].forEach(n => n.remove());
      const anchor = ADD_BTN;
  
      for (const note of all) {
        const card = document.createElement('div');
        card.className = 'note';
        card.dataset.id = note.id ?? '';
        card.dataset.source = note._source;
        card.dataset.editable = note.editable ? '1' : '0';
  
        const head = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.textContent = note.Titre;
  
        const delBtn = document.createElement('button');
        delBtn.setAttribute('title', 'Supprimer');
        delBtn.innerHTML = `<img src="img/delete.svg" alt="Supprimer">`;
        if (!note.editable) {
          delBtn.disabled = true;
          delBtn.style.opacity = .5;
          delBtn.style.cursor = 'not-allowed';
        }
  
        head.appendChild(h4);
        head.appendChild(delBtn);
  
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
  
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (editingCard) return;
          const isOpen = card.classList.contains('open');
          if (!isOpen) {
            document.querySelectorAll('#note-grid .note.open').forEach(n => { if (n !== card) n.classList.remove('open'); });
            card.classList.add('open');
          }
        });
  
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
  
        delBtn.addEventListener('click', () => {
          if (card.dataset.editable !== '1') return;
          const ok = confirm(`Supprimer la note « ${h4.textContent} » ?`);
          if (!ok) return;
          const locals = loadLocal();
          const idx = locals.findIndex(n => n.id === note.id);
          if (idx >= 0) {
            locals.splice(idx, 1);
            saveLocal(locals);
            initialNotes = initialNotes.filter(n => noteKey(n) !== noteKey(note));
            refresh();
          }
        });
  
        GRID.insertBefore(card, anchor);
      }
    }
  
    let remoteCache = [];
    function refresh() {
      const locals = loadLocal().map(n => ({ ...n, _source: 'local' }));
      const base = [...remoteCache, ...locals];
      const byKey = new Map(base.map(n => [noteKey(n), n]));
      const ordered = initialNotes.map(n => byKey.get(noteKey(n))).filter(Boolean);
      const filtered = ordered.filter(matchesSearch);
      render(filtered);
    }
  
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
      initialNotes.unshift({ ...newNote });
      refresh();
    }
  
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
  