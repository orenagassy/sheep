/* game-framework.js — shared infrastructure for all sheeps.online games */
window.GameFramework = (function () {

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function signInAnonymously(apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' }
      );
      if (!res.ok) return null;
      return (await res.json()).idToken;
    } catch (_) { return null; }
  }

  function authUrl(url, token) {
    return token ? `${url}?auth=${token}` : url;
  }

  // ── Config ────────────────────────────────────────────────────────────────
  async function loadConfig(dbUrl) {
    try {
      const res = await fetch(`${dbUrl}/config.json`);
      if (!res.ok) throw new Error(res.status);
      return Object.freeze(await res.json());
    } catch (_) { return null; }
  }

  // ── Sync indicator ────────────────────────────────────────────────────────
  function setSyncStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'sync-indicator' + (kind ? ' ' + kind : '');
  }

  // ── Leaderboard helpers ───────────────────────────────────────────────────
  function sanitizeLeaderboard(data, max) {
    if (!Array.isArray(data)) return [];
    return data.filter(e =>
      e && typeof e.name === 'string' &&
      /^[A-Z0-9 ]{1,10}$/.test(e.name) &&
      Number.isFinite(e.score) && e.score >= 0
    ).slice(0, max || 5);
  }

  function extractScores(data, max) {
    if (!data) return [];
    const arr = data.scores ?? (Array.isArray(data) ? data : []);
    return sanitizeLeaderboard(arr, max);
  }

  function loadLocalLeaderboard(key, max) {
    try { return sanitizeLeaderboard(JSON.parse(localStorage.getItem(key)), max); }
    catch (_) { return []; }
  }

  function saveLocalLeaderboard(key, lb) {
    try { localStorage.setItem(key, JSON.stringify(lb)); } catch (_) {}
  }

  function renderLeaderboard(listEl, titleEl, lb, title) {
    if (titleEl) titleEl.textContent = title || 'Top 5';
    if (!listEl) return;
    if (!lb || !lb.length) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">No scores yet — be the first!</div>';
      return;
    }
    listEl.innerHTML = '';
    lb.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      const left = document.createElement('div');
      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = ['🥇', '🥈', '🥉'][idx] || String(idx + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = entry.name;
      left.appendChild(rank); left.appendChild(name);
      const sc = document.createElement('span');
      sc.className = 'lb-score'; sc.textContent = entry.score;
      row.appendChild(left); row.appendChild(sc);
      listEl.appendChild(row);
    });
  }

  function isNewBest(lb, score, max) {
    if (lb.length < (max || 5)) return score > 0;
    return score > lb[lb.length - 1].score;
  }

  async function fetchLeaderboard(opts) {
    const { dbUrl, localKey, max, syncEl } = opts;
    setSyncStatus(syncEl, 'Syncing...', 'syncing');
    try {
      const res = await fetch(`${dbUrl}/leaderboard.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const lb = extractScores(await res.json(), max);
      setSyncStatus(syncEl, 'Synced', '');
      return lb.length ? lb : loadLocalLeaderboard(localKey, max);
    } catch (e) {
      setSyncStatus(syncEl, 'Offline', 'error');
      return loadLocalLeaderboard(localKey, max);
    }
  }

  async function pushLeaderboard(opts) {
    const { dbUrl, localKey, max, lb, token, syncEl } = opts;
    setSyncStatus(syncEl, 'Saving...', 'syncing');
    try {
      const latestRes = await fetch(`${dbUrl}/leaderboard.json`);
      let server = latestRes.ok ? extractScores(await latestRes.json(), max) : [];
      const seen = new Set();
      const merged = [];
      for (const e of [...server, ...lb]) {
        const k = e.name + '|' + e.score + '|' + (e.date || '');
        if (!seen.has(k)) { seen.add(k); merged.push(e); }
      }
      merged.sort((a, b) => b.score - a.score);
      const trimmed = merged.slice(0, max || 5);
      const putRes = await fetch(authUrl(`${dbUrl}/leaderboard.json`, token), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: trimmed })
      });
      if (!putRes.ok) throw new Error('HTTP ' + putRes.status);
      saveLocalLeaderboard(localKey, trimmed);
      setSyncStatus(syncEl, 'Synced', '');
      return trimmed;
    } catch (e) {
      setSyncStatus(syncEl, 'Save failed', 'error');
      saveLocalLeaderboard(localKey, lb);
      return lb;
    }
  }

  // ── Group / Friends ───────────────────────────────────────────────────────
  function generateGroupId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function getGroupUrl(id) {
    return location.href.split('?')[0] + '?g=' + id;
  }

  async function createGroupInFirebase(dbUrl, id, token) {
    const now = Date.now();
    const res = await fetch(authUrl(`${dbUrl}/groups/${id}.json`, token), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: { created: now, lastActive: now }, normal: { scores: [] }, sport: { scores: [] } })
    });
    if (!res.ok) throw new Error('createGroup HTTP ' + res.status);
  }

  async function fetchGroupLeaderboard(opts) {
    const { dbUrl, groupId, sportMode, max, syncEl } = opts;
    setSyncStatus(syncEl, 'Syncing...', 'syncing');
    const sub = sportMode ? 'sport' : 'normal';
    try {
      const res = await fetch(`${dbUrl}/groups/${groupId}/${sub}.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const lb = extractScores(await res.json(), max);
      setSyncStatus(syncEl, 'Synced', '');
      return lb;
    } catch (e) {
      setSyncStatus(syncEl, 'Offline', 'error');
      return [];
    }
  }

  async function pushGroupLeaderboard(opts) {
    const { dbUrl, groupId, sportMode, max, lb, token, syncEl } = opts;
    setSyncStatus(syncEl, 'Saving...', 'syncing');
    const sub = sportMode ? 'sport' : 'normal';
    const path = `${dbUrl}/groups/${groupId}/${sub}.json`;
    try {
      const latestRes = await fetch(path);
      let server = latestRes.ok ? extractScores(await latestRes.json(), max) : [];
      const seen = new Set();
      const merged = [];
      for (const e of [...server, ...lb]) {
        const k = e.name + '|' + e.score + '|' + (e.date || '');
        if (!seen.has(k)) { seen.add(k); merged.push(e); }
      }
      merged.sort((a, b) => b.score - a.score);
      const trimmed = merged.slice(0, max || 5);
      const putRes = await fetch(authUrl(path, token), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: trimmed })
      });
      if (!putRes.ok) throw new Error('HTTP ' + putRes.status);
      setSyncStatus(syncEl, 'Synced', '');
      return trimmed;
    } catch (e) {
      setSyncStatus(syncEl, 'Save failed', 'error');
      return lb;
    }
  }

  async function checkGroupExpiry(dbUrl, groupId, ttlMs, token, onExpired) {
    try {
      const res = await fetch(`${dbUrl}/groups/${groupId}/meta.json`);
      if (!res.ok) { if (onExpired) onExpired(); return false; }
      const meta = await res.json();
      if (!meta) { if (onExpired) onExpired(); return false; }
      if (Date.now() - meta.lastActive > ttlMs) {
        fetch(authUrl(`${dbUrl}/groups/${groupId}.json`, token), { method: 'DELETE' }).catch(() => {});
        if (onExpired) onExpired();
        return false;
      }
      fetch(authUrl(`${dbUrl}/groups/${groupId}/meta.json`, token), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastActive: Date.now() })
      }).catch(() => {});
      return true;
    } catch (_) { return true; }
  }

  function showFriendsCopyToast(msg) {
    let toast = document.getElementById('friends-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'friends-toast';
      toast.className = 'friends-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function openFriendsDialog(opts) {
    const { dbUrl, groupId: existingId, groupMode, token, storageKey, ttlMs, gameTitle, shareText } = opts;
    const TTL = ttlMs || 864000000;
    const SKEY = storageKey || 'game:group';

    let groupId;
    if (groupMode && existingId) {
      groupId = existingId;
    } else {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(SKEY)); } catch (_) {}
      if (stored && (Date.now() - stored.created) < TTL) {
        groupId = stored.id;
      } else {
        groupId = generateGroupId();
        localStorage.setItem(SKEY, JSON.stringify({ id: groupId, created: Date.now() }));
        try {
          await createGroupInFirebase(dbUrl, groupId, token);
        } catch (e) {
          showFriendsCopyToast('Could not create group — check your connection.');
          localStorage.removeItem(SKEY);
          return;
        }
      }
    }

    const url = getGroupUrl(groupId);
    const share = shareText || `Come play ${gameTitle || 'this game'} with me! 🐑`;

    const linkInput = document.getElementById('friends-link-input');
    if (linkInput) linkInput.value = url;
    const playBtn = document.getElementById('friends-play-btn');
    if (playBtn) playBtn.onclick = () => { location.href = url; };

    const twBtn = document.getElementById('friends-share-twitter');
    if (twBtn) twBtn.onclick = function () {
      if (this.dataset.clicked) return;
      this.dataset.clicked = '1';
      setTimeout(() => delete this.dataset.clicked, 2000);
      window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(share) + '&url=' + encodeURIComponent(url));
    };

    const nativeShare = (platform) => () => {
      if (navigator.share) {
        navigator.share({ title: gameTitle, text: share, url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).catch(() => {});
        showFriendsCopyToast('Link copied — paste it in your ' + platform + '!');
      }
    };
    const igBtn = document.getElementById('friends-share-ig');
    if (igBtn) igBtn.onclick = nativeShare('Instagram story');
    const ttBtn = document.getElementById('friends-share-tiktok');
    if (ttBtn) ttBtn.onclick = nativeShare('TikTok bio');
    const cpBtn = document.getElementById('friends-share-copy');
    if (cpBtn) cpBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => showFriendsCopyToast('Link copied!')).catch(() => {});
    };

    const overlay = document.getElementById('friends-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  function loadStats(key, defaults) {
    try { return Object.assign({}, defaults || {}, JSON.parse(localStorage.getItem(key))); }
    catch (_) { return Object.assign({}, defaults || {}); }
  }

  function saveStats(key, stats) {
    try { localStorage.setItem(key, JSON.stringify(stats)); } catch (_) {}
  }

  // ── Achievements ──────────────────────────────────────────────────────────
  let _toastQueue = [], _toastBusy = false;

  function showAchievementToast(a) {
    _toastQueue.push(a);
    if (!_toastBusy) _drain();
  }

  function _drain() {
    if (!_toastQueue.length) { _toastBusy = false; return; }
    _toastBusy = true;
    const a = _toastQueue.shift();
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.innerHTML = '<span style="font-size:20px">' + a.icon + '</span>' +
      '<div><div class="ach-label">Achievement: ' + a.label + '</div>' +
      '<div class="ach-desc">' + a.desc + '</div></div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.remove(); _drain(); }, 450);
    }, 3000);
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  let _audioCtx = null;

  function getAudioContext() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    return _audioCtx;
  }

  function tone(ctx, freq, type, vol, start, dur) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start); osc.stop(start + dur);
    } catch (_) {}
  }

  return {
    signInAnonymously, authUrl, loadConfig, setSyncStatus,
    sanitizeLeaderboard, extractScores, loadLocalLeaderboard, saveLocalLeaderboard,
    renderLeaderboard, isNewBest, fetchLeaderboard, pushLeaderboard,
    generateGroupId, getGroupUrl, createGroupInFirebase,
    fetchGroupLeaderboard, pushGroupLeaderboard, checkGroupExpiry,
    openFriendsDialog, showFriendsCopyToast,
    loadStats, saveStats, showAchievementToast,
    getAudioContext, tone
  };
})();
