// ═══════════════════════════════════════════════════════
//  MusicPOO — Frontend JS  (com auth + banco de dados)
// ═══════════════════════════════════════════════════════

// ── API Deezer ────────────────────────────────────────
const DEEZER = {
  BASE: 'https://api.deezer.com',
  PROXY: 'https://corsproxy.io/?',
  async get(path) {
    try {
      const r = await fetch(this.BASE + path, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return r.json();
    } catch (_) {}
    const r = await fetch(this.PROXY + encodeURIComponent(this.BASE + path), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('API indisponível');
    return r.json();
  }
};

// ── API Backend ───────────────────────────────────────
const API = {
  async call(method, path, body) {
    const opts = { method, credentials: 'include', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch('/api' + path, opts);
    return r.json();
  },
  get:    (p)    => API.call('GET',    p),
  post:   (p, b) => API.call('POST',   p, b),
  delete: (p)    => API.call('DELETE', p),
};

// ── Estado ────────────────────────────────────────────
const state = {
  playlist: [], index: -1, playing: false, seeking: false,
  currentPlaylistId: null, playlists: []
};

// ── Refs DOM ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const audio       = $('audio');
const btnPlay     = $('btn-play');
const btnPrev     = $('btn-prev');
const btnNext     = $('btn-next');
const progFill    = $('prog-fill');
const progThumb   = $('prog-thumb');
const progTrack   = $('prog-track');
const volRange    = $('volume');
const volFill     = $('vol-fill');
const tCur        = $('t-cur');
const tTot        = $('t-tot');
const nowTitle    = $('now-title');
const nowArtist   = $('now-artist');
const playerCover = $('player-cover');
const coverGlow   = $('cover-glow');
const trackList   = $('track-list');
const searchInput = $('search-input');
const btnSearch   = $('btn-search');
const gridLabel   = $('grid-label');
const gridCount   = $('grid-count');
const plList      = $('pl-list');
const modalAdd    = $('modal-add');
const modalPlList = $('modal-pl-list');

// ── Utilitários ───────────────────────────────────────
const fmt = s => { s = Math.floor(+s||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const COLORS = ['#818cf8','#6ee7b7','#f472b6','#fb923c','#38bdf8'];
const pickColor = i => COLORS[i % COLORS.length];

// ── Auth ──────────────────────────────────────────────
function showAuthErr(id, msg) { $(id).textContent = msg; }

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // CORRIGIDO: Uso de setProperty com !important para evitar colapsos visuais
    if (tab.dataset.form === 'login') {
      $('form-login').style.setProperty('display', 'block', 'important');
      $('form-register').style.setProperty('display', 'none', 'important');
    } else {
      $('form-login').style.setProperty('display', 'none', 'important');
      $('form-register').style.setProperty('display', 'block', 'important');
    }
  });
});

$('btn-login').addEventListener('click', async () => {
  showAuthErr('l-err', '');
  const email = $('l-email').value.trim();
  const pass  = $('l-pass').value.trim();
  const data  = await API.post('/login', { email, password: pass });
  if (data.error) { showAuthErr('l-err', data.error); return; }
  onLogin(data.username);
});

$('btn-register').addEventListener('click', async () => {
  showAuthErr('r-err', '');
  const username = $('r-user').value.trim();
  const email    = $('r-email').value.trim();
  const pass     = $('r-pass').value.trim();
  const data     = await API.post('/register', { username, email, password: pass });
  if (data.error) { showAuthErr('r-err', data.error); return; }
  onLogin(data.username);
});

// Enter nos inputs de auth
['l-email','l-pass'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key==='Enter') $('btn-login').click(); }));
['r-user','r-email','r-pass'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key==='Enter') $('btn-register').click(); }));

$('btn-logout').addEventListener('click', async () => {
  await API.post('/logout');
  // CORRIGIDO: Esconde a interface principal e devolve o container de login de forma segura
  $('app').style.setProperty('display', 'none', 'important');
  $('auth-screen').style.setProperty('display', 'flex', 'important');
  location.reload();
});

async function checkAuth() {
  const data = await API.get('/me');
  if (data.authenticated) onLogin(data.username);
}

function onLogin(username) {
  // CORRIGIDO: Garante ocultação total da autenticação e força o container '.layout' do app a agir como flexbox puro
  $('auth-screen').style.setProperty('display', 'none', 'important');
  $('app').style.setProperty('display', 'flex', 'important');
  
  $('user-name').textContent = username;
  $('user-avatar').textContent = username[0].toUpperCase();
  loadPlaylists();
  buscar();
}

// ── Playlists ─────────────────────────────────────────
async function loadPlaylists() {
  const pls = await API.get('/playlists');
  state.playlists = pls;
  renderPlaylists(pls);
}

function renderPlaylists(pls) {
  plList.innerHTML = pls.map(p => `
    <div class="pl-item${state.currentPlaylistId===p.id?' active':''}" data-id="${p.id}">
      <span class="pl-item-icon">${p.nome==='Favoritos'?'♥':'🎵'}</span>
      <span class="pl-item-name">${p.nome}</span>
      <span class="pl-item-count">${p.total||0}</span>
      ${p.nome!=='Favoritos' ? `<button class="pl-del" data-del="${p.id}" title="Remover">✕</button>` : ''}
    </div>`).join('');

  plList.querySelectorAll('.pl-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.pl-del')) return;
      openPlaylist(+el.dataset.id, el.querySelector('.pl-item-name').textContent);
    });
  });

  plList.querySelectorAll('.pl-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remover playlist?')) return;
      await API.delete('/playlists/' + btn.dataset.del);
      if (state.currentPlaylistId === +btn.dataset.del) {
        state.currentPlaylistId = null;
        $('tab-pl').style.setProperty('display', 'none', 'important');
        buscar();
      }
      loadPlaylists();
    });
  });
}

$('btn-new-pl').addEventListener('click', async () => {
  const nome = prompt('Nome da nova playlist:');
  if (!nome || !nome.trim()) return;
  await API.post('/playlists', { nome: nome.trim() });
  loadPlaylists();
});

async function openPlaylist(id, nome) {
  state.currentPlaylistId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tabPl = $('tab-pl');
  $('tab-pl-name').textContent = nome;
  tabPl.style.setProperty('display', 'block', 'important');
  tabPl.classList.add('active');
  gridLabel.textContent = nome;
  gridCount.textContent = '';
  showSkeletons(5);

  const tracks = await API.get(`/playlists/${id}/tracks`);
  state.playlist = tracks.map(r => ({
    id: r.track_id, titulo: r.titulo, artista: r.artista,
    album: r.album, duracao: r.duracao, preview_url: r.preview_url, capa: r.capa
  }));
  state.index = -1;
  renderTracks(state.playlist, true);
  renderPlaylists(state.playlists);
}

// ── Modal add to playlist ─────────────────────────────
let pendingTrack = null;

function openModalAdd(track) {
  pendingTrack = track;
  modalPlList.innerHTML = state.playlists.map(p => `
    <button class="modal-pl-btn" data-plid="${p.id}">${p.nome==='Favoritos'?'♥ ':''} ${p.nome}</button>
  `).join('');
  modalPlList.querySelectorAll('.modal-pl-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await API.post(`/playlists/${btn.dataset.plid}/tracks`, pendingTrack);
      modalAdd.style.setProperty('display', 'none', 'important');
      if (r.error) { alert(r.error); return; }
      loadPlaylists();
    });
  });
  modalAdd.style.setProperty('display', 'flex', 'important');
}

$('modal-close').addEventListener('click', () => { modalAdd.style.setProperty('display', 'none', 'important'); });
modalAdd.addEventListener('click', e => { if(e.target===modalAdd) modalAdd.style.setProperty('display', 'none', 'important'); });

// ── Skeleton ──────────────────────────────────────────
function showSkeletons(n=15) {
  trackList.innerHTML = Array.from({length:n},(_,i)=>`
    <div class="skeleton-row" style="animation-delay:${i*40}ms">
      <div class="sk sk-num"></div><div class="sk sk-cover"></div>
      <div><div class="sk sk-title"></div><div class="sk sk-sub"></div></div>
      <div class="sk sk-alb"></div><div class="sk sk-dur"></div>
    </div>`).join('');
}

// ── Render faixas ─────────────────────────────────────
function renderTracks(tracks, isPlaylist=false) {
  if (!tracks.length) {
    trackList.innerHTML = '<p class="msg-empty">Nenhum resultado encontrado.</p>';
    return;
  }
  gridCount.textContent = `${tracks.length} faixas`;
  trackList.innerHTML = tracks.map((t,i) => `
    <div class="track-row ${i===state.index?'active':''}" data-i="${i}">
      <div class="t-num">${i+1}</div>
      <div class="t-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <img class="t-cover" src="${t.capa||''}" alt="${t.titulo}"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E'"/>
      <div class="t-meta">
        <div class="t-title">${t.titulo}</div>
        <div class="t-artist">${t.artista}</div>
      </div>
      <div class="t-album">${t.album}</div>
      <div class="t-dur">${fmt(t.duracao)}</div>
      <button class="t-add" data-i="${i}" title="Adicionar à playlist">＋</button>
    </div>`).join('');

  trackList.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.t-add')) return;
      play(+row.dataset.i);
    });
  });
  trackList.querySelectorAll('.t-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openModalAdd(state.playlist[+btn.dataset.i]);
    });
  });
}

// ── Play ──────────────────────────────────────────────
function play(index) {
  const t = state.playlist[index];
  if (!t) return;
  if (!t.preview_url) { alert('Prévia não disponível.'); return; }
  state.index = index;
  nowTitle.textContent  = t.titulo;
  nowArtist.textContent = t.artista;
  if (t.capa) {
    playerCover.src = t.capa;
    coverGlow.style.background = `radial-gradient(circle, ${pickColor(index)} 0%, transparent 70%)`;
  }
  audio.src = t.preview_url;
  audio.volume = volRange.value / 100;
  audio.play();
  setPlaying(true);
  trackList.querySelectorAll('.track-row').forEach((row,i) => row.classList.toggle('active', i===index));
  // Salvar no backend
  API.post('/recentes', t);
}

function setPlaying(val) {
  state.playing = val;
  document.body.classList.toggle('playing', val);
  btnPlay.querySelector('.ico-play').style.setProperty('display', val ? 'none' : 'block', 'important');
  btnPlay.querySelector('.ico-pause').style.setProperty('display', val ? 'block' : 'none', 'important');
}

// ── Controles ─────────────────────────────────────────
btnPlay.addEventListener('click', () => {
  if (state.index < 0) return;
  state.playing ? (audio.pause(), setPlaying(false)) : (audio.play(), setPlaying(true));
});
btnPrev.addEventListener('click', () => {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (state.index > 0) play(state.index - 1);
});
btnNext.addEventListener('click', () => {
  if (state.index < state.playlist.length - 1) play(state.index + 1);
});
audio.addEventListener('ended', () => {
  if (state.index < state.playlist.length - 1) play(state.index + 1);
  else setPlaying(false);
});

// ── Progresso ─────────────────────────────────────────
audio.addEventListener('timeupdate', () => {
  if (state.seeking || !audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progFill.style.width = pct + '%';
  progThumb.style.left = pct + '%';
  tCur.textContent = fmt(audio.currentTime);
  tTot.textContent = fmt(audio.duration);
});
progTrack.addEventListener('click', e => {
  if (!audio.duration) return;
  const rect = progTrack.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width)) * audio.duration;
});

// ── Volume ────────────────────────────────────────────
volRange.addEventListener('input', () => {
  audio.volume = volRange.value / 100;
  volFill.style.width = volRange.value + '%';
});

// ── REQUISIÇÃO DE MÚSICAS ONLINE (INTEGRADA COMO BUSCAR) ──
async function buscar(query = '') {
  const termo = query.trim() || "pop hits 2026";
  gridLabel.textContent = termo === "pop hits 2026" ? "Top Charts Global" : `Resultados para "${termo}"`;
  gridCount.textContent = '';
  showSkeletons(10);

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=30`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro na requisição');
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      state.playlist = data.results.map(track => ({
        id: track.trackId,
        titulo: track.trackName,
        artista: track.artistName,
        album: track.collectionName || "Single",
        duracao: Math.floor(track.trackTimeMillis / 1000),
        capa: track.artworkUrl100.replace("100x100bb.jpg", "300x300bb.jpg"),
        preview_url: track.previewUrl
      }));
      state.index = -1;
      renderTracks(state.playlist);
    } else {
      gridLabel.textContent = "Nenhum resultado encontrado.";
      trackList.innerHTML = '<p class="msg-empty">Nenhum resultado encontrado.</p>';
    }
  } catch (err) {
    gridLabel.textContent = "Erro ao carregar músicas online.";
    trackList.innerHTML = '<p class="msg-empty">Erro de conexão ao catálogo.</p>';
    console.error("Erro na API do iTunes:", err);
  }
}

// ── Tabs ──────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    if (tab.dataset.tab === 'playlist') return; // controlado por openPlaylist
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('tab-pl').style.setProperty('display', 'none', 'important');
    state.currentPlaylistId = null;
    renderPlaylists(state.playlists);

    if (tab.dataset.tab === 'recent') {
      gridLabel.textContent = 'Tocadas recentemente';
      gridCount.textContent = '';
      showSkeletons(5);
      const rows = await API.get('/recentes');
      state.playlist = rows.map(r => ({
        id: r.track_id, titulo: r.titulo, artista: r.artista,
        album: r.album, duracao: r.duracao, preview_url: r.preview_url, capa: r.capa
      }));
      state.index = -1;
      if (!state.playlist.length)
        trackList.innerHTML = '<p class="msg-empty">Nenhuma música tocada ainda.</p>';
      else
        renderTracks(state.playlist);
    } else {
      searchInput.value = '';
      buscar();
    }
  });
});

// ── Busca eventos ─────────────────────────────────────
btnSearch.addEventListener('click', () => {
  const q = searchInput.value.trim();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="chart"]').classList.add('active');
  buscar(q);
});
searchInput.addEventListener('keydown', e => { if(e.key==='Enter') btnSearch.click(); });
let debounceTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) return;
  debounceTimer = setTimeout(() => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-tab="chart"]').classList.add('active');
    buscar(q);
  }, 450);
});

// ── Init ──────────────────────────────────────────────
checkAuth();