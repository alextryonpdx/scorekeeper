'use strict';

/* =========================================================================
   Gin Scorekeeper
   All data lives in localStorage. Nothing is ever sent over the network.
   ========================================================================= */

const STORAGE_KEY = 'ginScorekeeper.v1';

/** @typedef {{id:string,name:string,archived?:boolean}} Player */
/** @typedef {{id:string,timestamp:string,winnerId:string,points:number}} Round */
/** @typedef {{id:string,name:string,target:number|null,createdAt:string,updatedAt:string,players:Player[],rounds:Round[]}} Game */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() { return new Date().toISOString(); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, activeGameId: null, games: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.games) parsed.games = {};
    return parsed;
  } catch (e) {
    console.error('Failed to load state, starting fresh.', e);
    return { version: 1, activeGameId: null, games: {} };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getActiveGame() {
  return state.activeGameId ? state.games[state.activeGameId] : null;
}

function computeTotals(game) {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const p of game.players) totals[p.id] = 0;
  for (const r of game.rounds) {
    if (totals[r.winnerId] === undefined) totals[r.winnerId] = 0;
    totals[r.winnerId] += r.points;
  }
  return totals;
}

function activePlayers(game) {
  return game.players.filter(p => !p.archived);
}

function sortedByTotalDesc(game, totals) {
  return [...game.players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ------------------------------- Toast ---------------------------------- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ------------------------------- Modal ----------------------------------- */
const backdrop = document.getElementById('modal-backdrop');
const modalEl = document.getElementById('modal');

/*
 * iOS Safari doesn't shrink the layout viewport when the on-screen keyboard
 * opens — it just overlays it — so a `position: fixed; inset: 0` sheet ends
 * up sized as if the keyboard weren't there, and its lower buttons land
 * underneath it (untappable). We track the actual visible area via the
 * VisualViewport API and feed it in as CSS vars the backdrop sizes itself to.
 */
function syncViewportVars() {
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty('--vv-height', `${height}px`);
  document.documentElement.style.setProperty('--vv-top', `${top}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewportVars);
  window.visualViewport.addEventListener('scroll', syncViewportVars);
}
window.addEventListener('orientationchange', syncViewportVars);
syncViewportVars();

// Lock background scrolling while a modal is open, so the page can't drift
// out from under the fixed sheet when the keyboard shows and hides.
let lockedScrollY = 0;
function lockBodyScroll() {
  lockedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function unlockBodyScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, lockedScrollY);
}

function openModal(html, onMount) {
  modalEl.innerHTML = html;
  backdrop.hidden = false;
  lockBodyScroll();
  syncViewportVars();
  if (onMount) onMount(modalEl);
}
function closeModal() {
  backdrop.hidden = true;
  modalEl.innerHTML = '';
  unlockBodyScroll();
}
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

/* ============================== ROUTING ================================= */
const viewHome = document.getElementById('view-home');
const viewGame = document.getElementById('view-game');

function showHome() {
  state.activeGameId = null;
  saveState();
  viewGame.hidden = true;
  viewHome.hidden = false;
  renderHome();
}
function showGame(gameId) {
  state.activeGameId = gameId;
  saveState();
  viewHome.hidden = true;
  viewGame.hidden = false;
  renderGame();
}

/* ============================== HOME VIEW ================================ */
function renderHome() {
  const list = document.getElementById('game-list');
  const empty = document.getElementById('empty-state');
  const games = Object.values(state.games).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  if (games.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = games.map(g => {
    const totals = computeTotals(g);
    const withScores = g.players.map(p => ({ p, total: totals[p.id] || 0 }));
    withScores.sort((a, b) => b.total - a.total);
    const leader = withScores[0];
    const leaderHtml = leader
      ? `<div class="game-card-leader">Leading: <b>${escapeHtml(leader.p.name)}</b> — ${leader.total}${g.target ? ` / ${g.target}` : ''}</div>`
      : `<div class="game-card-leader muted">No players yet</div>`;
    return `
      <div class="game-card" data-id="${g.id}">
        <div class="game-card-top">
          <div class="game-card-name">${escapeHtml(g.name)}</div>
          <button class="text-btn card-delete" data-id="${g.id}" aria-label="Delete game">Delete</button>
        </div>
        <div class="game-card-meta">${g.players.length} player${g.players.length === 1 ? '' : 's'} · ${g.rounds.length} round${g.rounds.length === 1 ? '' : 's'}${g.target ? ` · target ${g.target}` : ''}</div>
        ${leaderHtml}
      </div>`;
  }).join('');

  list.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      showGame(card.dataset.id);
    });
  });
  list.querySelectorAll('.card-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteGame(btn.dataset.id);
    });
  });
}

function confirmDeleteGame(gameId) {
  const g = state.games[gameId];
  if (!g) return;
  openModal(`
    <h2>Delete "${escapeHtml(g.name)}"?</h2>
    <p class="muted">This removes all ${g.rounds.length} recorded round${g.rounds.length === 1 ? '' : 's'} for this game only. Your other games are untouched. This can't be undone here — back up first if you want a copy.</p>
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-danger" data-act="delete">Delete</button>
    </div>
  `, (m) => {
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="delete"]').onclick = () => {
      delete state.games[gameId];
      saveState();
      closeModal();
      toast('Game deleted');
      renderHome();
    };
  });
}

function newGameFlow() {
  openModal(`
    <h2>New game</h2>
    <label for="ng-name">Game name</label>
    <input type="text" id="ng-name" placeholder="e.g. Friday Night Gin" maxlength="60">
    <label for="ng-target">Target score (optional)</label>
    <input type="number" id="ng-target" placeholder="e.g. 100" min="1" inputmode="numeric">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-primary" data-act="create">Create game</button>
    </div>
  `, (m) => {
    const nameInput = m.querySelector('#ng-name');
    nameInput.focus();
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="create"]').onclick = () => {
      const existingCount = Object.keys(state.games).length;
      const name = nameInput.value.trim() || `Game ${existingCount + 1}`;
      const targetRaw = m.querySelector('#ng-target').value.trim();
      const target = targetRaw ? Math.max(1, parseInt(targetRaw, 10)) : null;
      const id = uid();
      /** @type {Game} */
      const game = { id, name, target, createdAt: nowIso(), updatedAt: nowIso(), players: [], rounds: [] };
      state.games[id] = game;
      saveState();
      closeModal();
      showGame(id);
    };
  });
}

document.getElementById('btn-new-game').addEventListener('click', newGameFlow);
document.getElementById('btn-back').addEventListener('click', showHome);

/* ============================== GAME VIEW ================================ */

function touchGame(game) { game.updatedAt = nowIso(); }

function renderGame() {
  const game = getActiveGame();
  if (!game) { showHome(); return; }

  document.getElementById('game-title').textContent = game.name;

  // Target chip
  const targetChip = document.getElementById('btn-target');
  if (game.target) {
    targetChip.textContent = `🎯 ${game.target}`;
    targetChip.classList.add('has-target');
  } else {
    targetChip.textContent = 'No target — tap to set';
    targetChip.classList.remove('has-target');
  }

  const totals = computeTotals(game);

  // Winner banner
  const banner = document.getElementById('winner-banner');
  if (game.target) {
    const over = game.players.filter(p => (totals[p.id] || 0) >= game.target);
    if (over.length) {
      const top = [...over].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
      const maxTotal = totals[top[0].id] || 0;
      const winners = top.filter(p => (totals[p.id] || 0) === maxTotal);
      const names = winners.map(p => escapeHtml(p.name)).join(' & ');
      banner.hidden = false;
      banner.innerHTML = `🏆 ${names} reached the target!<span>${maxTotal} / ${game.target} points</span>`;
    } else {
      banner.hidden = true;
    }
  } else {
    banner.hidden = true;
  }

  // Player chips
  const scroll = document.getElementById('players-scroll');
  const maxTotal = Math.max(0, ...game.players.map(p => totals[p.id] || 0));
  scroll.innerHTML = game.players.map(p => {
    const t = totals[p.id] || 0;
    const isLeader = game.players.length > 1 && t === maxTotal && t > 0;
    return `
      <div class="player-chip ${isLeader ? 'leader' : ''}" data-id="${p.id}">
        ${isLeader ? '<span class="p-crown">👑</span>' : ''}
        <div class="p-name">${escapeHtml(p.name)}${p.archived ? ' (removed)' : ''}</div>
        <div class="p-total">${t}</div>
      </div>`;
  }).join('');
  scroll.querySelectorAll('.player-chip').forEach(chip => {
    chip.addEventListener('click', () => playerOptionsFlow(chip.dataset.id));
  });

  // Record round button
  const recordBtn = document.getElementById('btn-new-round');
  recordBtn.disabled = activePlayers(game).length < 2;
  recordBtn.title = recordBtn.disabled ? 'Add at least two players first' : '';

  renderHistory(game, totals);
}

document.getElementById('game-title').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game) return;
  openModal(`
    <h2>Rename game</h2>
    <label for="rn-name">Game name</label>
    <input type="text" id="rn-name" value="${escapeAttr(game.name)}" maxlength="60">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-primary" data-act="save">Save</button>
    </div>
  `, (m) => {
    const input = m.querySelector('#rn-name');
    input.focus(); input.select();
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="save"]').onclick = () => {
      const v = input.value.trim();
      if (v) { game.name = v; touchGame(game); saveState(); }
      closeModal();
      renderGame();
    };
  });
});

document.getElementById('btn-target').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game) return;
  openModal(`
    <h2>Target score</h2>
    <p class="muted">First player to reach this total wins the game. Leave blank to play with no target.</p>
    <label for="tg-val">Target score</label>
    <input type="number" id="tg-val" placeholder="e.g. 100" min="1" inputmode="numeric" value="${game.target || ''}">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="clear">No target</button>
      <button class="btn-primary" data-act="save">Save</button>
    </div>
  `, (m) => {
    const input = m.querySelector('#tg-val');
    input.focus();
    m.querySelector('[data-act="clear"]').onclick = () => {
      game.target = null; touchGame(game); saveState(); closeModal(); renderGame();
    };
    m.querySelector('[data-act="save"]').onclick = () => {
      const v = input.value.trim();
      game.target = v ? Math.max(1, parseInt(v, 10)) : null;
      touchGame(game); saveState(); closeModal(); renderGame();
    };
  });
});

/* --------- Add / edit / remove players --------- */
document.getElementById('btn-add-player').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game) return;
  openModal(`
    <h2>Add player</h2>
    <label for="ap-name">Player name</label>
    <input type="text" id="ap-name" placeholder="Name" maxlength="30" autocomplete="off">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="done">Done</button>
      <button class="btn-primary" data-act="add">Add player</button>
    </div>
  `, (m) => {
    const input = m.querySelector('#ap-name');
    input.focus();
    const addPlayer = () => {
      const v = input.value.trim();
      if (!v) return;
      game.players.push({ id: uid(), name: v });
      touchGame(game); saveState(); renderGame();
      input.value = '';
      input.focus();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } });
    m.querySelector('[data-act="add"]').onclick = addPlayer;
    m.querySelector('[data-act="done"]').onclick = closeModal;
  });
});

function playerOptionsFlow(playerId) {
  const game = getActiveGame();
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;
  const hasRounds = game.rounds.some(r => r.winnerId === playerId);
  openModal(`
    <h2>${escapeHtml(player.name)}</h2>
    <label for="pe-name">Name</label>
    <input type="text" id="pe-name" value="${escapeAttr(player.name)}" maxlength="30">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-primary" data-act="save">Save name</button>
    </div>
    <div class="modal-actions">
      <button class="btn-danger" data-act="remove">${player.archived ? 'Remove permanently' : (hasRounds ? 'Remove from game' : 'Delete player')}</button>
      ${player.archived ? '<button class="btn-secondary" data-act="restore">Restore</button>' : ''}
    </div>
    ${hasRounds && !player.archived ? '<p class="muted" style="margin-top:10px">This player has rounds on the scoreboard, so they\'ll be kept in the history but marked as removed and hidden from new rounds.</p>' : ''}
  `, (m) => {
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="save"]').onclick = () => {
      const v = m.querySelector('#pe-name').value.trim();
      if (v) { player.name = v; touchGame(game); saveState(); }
      closeModal(); renderGame();
    };
    m.querySelector('[data-act="remove"]').onclick = () => {
      if (hasRounds) {
        player.archived = true;
      } else {
        game.players = game.players.filter(p => p.id !== playerId);
      }
      touchGame(game); saveState(); closeModal(); renderGame();
    };
    const restoreBtn = m.querySelector('[data-act="restore"]');
    if (restoreBtn) restoreBtn.onclick = () => {
      delete player.archived; touchGame(game); saveState(); closeModal(); renderGame();
    };
  });
}

/* --------- Record a round --------- */
document.getElementById('btn-new-round').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game) return;
  const players = activePlayers(game);
  let selectedId = null;

  const render = () => `
    <h2>Record a round</h2>
    <label>Who won this hand?</label>
    <div class="player-select-list">
      ${players.map(p => `<button data-id="${p.id}" class="${p.id === selectedId ? 'selected' : ''}">${escapeHtml(p.name)}</button>`).join('')}
    </div>
    <label for="rr-points">Points scored</label>
    <input type="number" id="rr-points" placeholder="e.g. 25" min="0" inputmode="numeric">
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-primary" data-act="save" disabled>Add round</button>
    </div>
  `;

  openModal(render(), (m) => {
    const pointsInput = m.querySelector('#rr-points');
    const saveBtn = m.querySelector('[data-act="save"]');
    const updateSaveState = () => {
      const pts = pointsInput.value.trim();
      saveBtn.disabled = !(selectedId && pts !== '' && Number(pts) >= 0);
    };
    m.querySelectorAll('.player-select-list button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedId = btn.dataset.id;
        m.querySelectorAll('.player-select-list button').forEach(b => b.classList.toggle('selected', b.dataset.id === selectedId));
        updateSaveState();
        pointsInput.focus();
      });
    });
    pointsInput.addEventListener('input', updateSaveState);
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    saveBtn.onclick = () => {
      const points = Math.max(0, parseInt(pointsInput.value, 10) || 0);
      game.rounds.push({ id: uid(), timestamp: nowIso(), winnerId: selectedId, points });
      touchGame(game); saveState(); closeModal(); renderGame();
      toast('Round recorded');
    };
  });
});

document.getElementById('btn-undo').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game || game.rounds.length === 0) return;
  const last = game.rounds[game.rounds.length - 1];
  const p = game.players.find(pl => pl.id === last.winnerId);
  openModal(`
    <h2>Undo last round?</h2>
    <p class="muted">This removes round #${game.rounds.length}: ${p ? escapeHtml(p.name) : 'Unknown'} scored ${last.points}.</p>
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-danger" data-act="undo">Undo it</button>
    </div>
  `, (m) => {
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="undo"]').onclick = () => {
      game.rounds.pop(); touchGame(game); saveState(); closeModal(); renderGame();
    };
  });
});

function deleteRound(roundId) {
  const game = getActiveGame();
  if (!game) return;
  const idx = game.rounds.findIndex(r => r.id === roundId);
  if (idx === -1) return;
  const r = game.rounds[idx];
  const p = game.players.find(pl => pl.id === r.winnerId);
  openModal(`
    <h2>Delete this round?</h2>
    <p class="muted">Round #${idx + 1}: ${p ? escapeHtml(p.name) : 'Unknown'} scored ${r.points}. Totals will be recalculated.</p>
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-danger" data-act="delete">Delete round</button>
    </div>
  `, (m) => {
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="delete"]').onclick = () => {
      game.rounds.splice(idx, 1); touchGame(game); saveState(); closeModal(); renderGame();
    };
  });
}

/* --------- History table --------- */
function renderHistory(game, totals) {
  const table = document.getElementById('history-table');
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  const tfoot = table.querySelector('tfoot tr');
  const emptyMsg = document.getElementById('history-empty');
  const undoBtn = document.getElementById('btn-undo');

  undoBtn.hidden = game.rounds.length === 0;

  thead.innerHTML = '<th class="rownum">#</th>' +
    game.players.map(p => `<th>${escapeHtml(p.name)}${p.archived ? ' <span class="muted">(removed)</span>' : ''}</th>`).join('') +
    '<th></th>';

  if (game.rounds.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.hidden = false;
  } else {
    emptyMsg.hidden = true;
    tbody.innerHTML = game.rounds.map((r, i) => {
      const cells = game.players.map(p => {
        const won = p.id === r.winnerId;
        return `<td class="${won ? 'winner-cell' : ''}">${won ? r.points : '–'}</td>`;
      }).join('');
      return `<tr>
        <td class="rownum" title="${formatDate(r.timestamp)}">${i + 1}</td>
        ${cells}
        <td class="round-actions"><button class="round-del" data-round-id="${r.id}" aria-label="Delete round">✕</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.round-del').forEach(btn => {
      btn.addEventListener('click', () => deleteRound(btn.dataset.roundId));
    });
  }

  tfoot.innerHTML = '<th>Total</th>' + game.players.map(p => `<th>${totals[p.id] || 0}</th>`).join('') + '<th></th>';
}

/* --------- Game options menu (⋮) --------- */
document.getElementById('btn-game-menu').addEventListener('click', () => {
  const game = getActiveGame();
  if (!game) return;
  openModal(`
    <h2>Game options</h2>
    <div class="menu-list">
      <button data-act="rename">Rename game</button>
      <button data-act="target">Set target score</button>
      <button data-act="backup">Backup &amp; restore<span class="menu-sub">Applies to all your games</span></button>
      <button data-act="delete" class="danger">Delete this game</button>
    </div>
  `, (m) => {
    m.querySelector('[data-act="rename"]').onclick = () => { closeModal(); document.getElementById('game-title').click(); };
    m.querySelector('[data-act="target"]').onclick = () => { closeModal(); document.getElementById('btn-target').click(); };
    m.querySelector('[data-act="backup"]').onclick = () => { closeModal(); backupMenuFlow(); };
    m.querySelector('[data-act="delete"]').onclick = () => { closeModal(); confirmDeleteGame(game.id); };
  });
});

/* ============================ BACKUP / RESTORE =========================== */

function appUrl() {
  // Resolves to the directory the app is running from, so this works
  // whether it's served from a repo root, a subpath, or localhost.
  return new URL('.', window.location.href).href;
}

function buildBackupText() {
  const payload = { ...state, exportedAt: nowIso(), app: 'gin-scorekeeper', formatVersion: 1 };
  const json = JSON.stringify(payload, null, 2);
  const gameCount = Object.keys(state.games).length;
  return `GIN SCOREKEEPER BACKUP
Exported ${new Date().toLocaleString()}
Contains ${gameCount} game${gameCount === 1 ? '' : 's'}.

Open the app: ${appUrl()}

To restore: open that link, tap the backup icon, choose "Restore from backup", and paste this entire note back in.

${json}`;
}

function extractJsonPayload(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No backup data found in that text.');
  const jsonStr = text.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.games !== 'object') {
    throw new Error('That doesn\'t look like a Gin Scorekeeper backup.');
  }
  return parsed;
}

async function shareOrCopy(text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Gin Scorekeeper Backup', text, url: appUrl() });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // fall through to clipboard on share failure
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}

function backupMenuFlow() {
  openModal(`
    <h2>Backup &amp; restore</h2>
    <p class="muted">Your data lives only on this device's browser. Share a backup to Notes, Messages, Mail, or anywhere else — then restore it here (or on another phone) any time.</p>
    <div class="menu-list">
      <button data-act="share">Share backup…</button>
      <button data-act="copy">Copy backup to clipboard</button>
      <button data-act="restore">Restore from backup</button>
    </div>
  `, (m) => {
    m.querySelector('[data-act="share"]').onclick = async () => {
      const result = await shareOrCopy(buildBackupText());
      if (result === 'shared') { closeModal(); toast('Backup shared'); }
      else if (result === 'copied') { closeModal(); toast('Sharing unavailable — copied to clipboard instead'); }
      else if (result === 'cancelled') { /* no-op, keep modal open */ }
      else toast('Could not share or copy — try again');
    };
    m.querySelector('[data-act="copy"]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(buildBackupText());
        closeModal();
        toast('Backup copied to clipboard');
      } catch (e) {
        restoreCopyFallback(buildBackupText());
      }
    };
    m.querySelector('[data-act="restore"]').onclick = () => { restoreFlow(); };
  });
}

function restoreCopyFallback(text) {
  openModal(`
    <h2>Copy backup</h2>
    <p class="muted">Your browser blocked automatic clipboard access. Select all the text below and copy it manually.</p>
    <textarea id="rc-text" readonly>${escapeHtml(text)}</textarea>
    <div class="modal-actions">
      <button class="btn-primary" data-act="close">Close</button>
    </div>
  `, (m) => {
    const ta = m.querySelector('#rc-text');
    ta.focus(); ta.select();
    m.querySelector('[data-act="close"]').onclick = closeModal;
  });
}

function restoreFlow() {
  openModal(`
    <h2>Restore from backup</h2>
    <p class="muted">Paste a backup below (from Notes, Messages, etc). Choose how to apply it:</p>
    <label for="rf-text">Backup text</label>
    <textarea id="rf-text" placeholder="Paste your backup here…"></textarea>
    <label>How to restore</label>
    <div class="radio-row">
      <label><input type="radio" name="rf-mode" value="merge" checked><span>Merge<br><small>Keep other games</small></span></label>
      <label><input type="radio" name="rf-mode" value="replace"><span>Replace all<br><small>Erase current data</small></span></label>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" data-act="cancel">Cancel</button>
      <button class="btn-primary" data-act="restore">Restore</button>
    </div>
  `, (m) => {
    const ta = m.querySelector('#rf-text');
    ta.focus();
    m.querySelector('[data-act="cancel"]').onclick = closeModal;
    m.querySelector('[data-act="restore"]').onclick = () => {
      const mode = m.querySelector('input[name="rf-mode"]:checked').value;
      let parsed;
      try {
        parsed = extractJsonPayload(ta.value);
      } catch (e) {
        toast(e.message || 'Could not read that backup');
        return;
      }
      const incomingCount = Object.keys(parsed.games).length;
      if (mode === 'replace') {
        state = { version: 1, activeGameId: null, games: parsed.games };
      } else {
        state.games = { ...state.games, ...parsed.games };
      }
      saveState();
      closeModal();
      toast(`Restored ${incomingCount} game${incomingCount === 1 ? '' : 's'} (${mode === 'replace' ? 'replaced all' : 'merged'})`);
      showHome();
    };
  });
}

document.getElementById('btn-backup-menu').addEventListener('click', backupMenuFlow);

/* ============================== HELPERS =================================== */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

/* ============================== INIT ======================================= */
function init() {
  if (state.activeGameId && state.games[state.activeGameId]) {
    showGame(state.activeGameId);
  } else {
    showHome();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
