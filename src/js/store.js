/* store.js — the whole database. localStorage only, no network, ever. */

import { uid, toast } from './util.js';

const KEY = 'cricket-scorer.db.v1';
const SCHEMA = 1;

/** Shape of an empty database. */
function empty() {
  return {
    schema: SCHEMA,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    teams: [],        // { id, name, short, accent, players:[playerId], createdAt }
    players: [],      // { id, name, teamId, role, batStyle, bowlStyle }
    matches: [],      // see engine.js newMatch()
    tournaments: [],  // { id, name, format, teamIds, overs, ..., fixtures:[matchId|placeholder] }
    settings: {
      theme: 'dark',
      defaultOvers: 20,
      defaultPlayers: 11,
      celebrate: true,
      haptics: true,
      confirmBall: false,
      keepAwake: true
    }
  };
}

let db = null;
let saveTimer = null;
const listeners = new Set();
const externalListeners = new Set();

/* ---------- load / save ---------- */

export function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? migrate(JSON.parse(raw)) : empty();
  } catch (err) {
    console.warn('[store] could not read saved data, starting fresh', err);
    db = empty();
  }
  return db;
}

export function data() { return db || load(); }

function migrate(d) {
  if (!d || typeof d !== 'object') return empty();
  const base = empty();
  // Fill in anything a newer version added.
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  for (const k of ['teams', 'players', 'matches', 'tournaments']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  out.schema = SCHEMA;
  return out;
}

/** Persist. Debounced so rapid scoring taps do not thrash localStorage. */
export function save(immediate = false) {
  if (!db) return;
  db.updatedAt = Date.now();
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
        toast('Storage full — export a backup and delete old matches', 'error', 5000);
      } else {
        toast('Could not save to this device', 'error');
      }
      console.error('[store] save failed', err);
    }
    listeners.forEach(fn => fn(db));
  };
  clearTimeout(saveTimer);
  if (immediate) write(); else saveTimer = setTimeout(write, 220);
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Fires when *another tab* writes to the database. Without this, scoring the
 * same match in two tabs lets the older one overwrite the newer one on its next
 * save, and balls quietly disappear. Here we take the other tab's copy as the
 * truth and tell the UI to redraw.
 */
export function onExternalChange(fn) {
  externalListeners.add(fn);
  return () => externalListeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      db = migrate(JSON.parse(e.newValue));
      clearTimeout(saveTimer);          // never write our stale copy over theirs
      externalListeners.forEach(fn => fn(db));
    } catch (err) {
      console.warn('[store] could not read the update from another tab', err);
    }
  });
}

/* ---------- teams & players ---------- */

export function teams() { return data().teams; }
export function team(id) { return data().teams.find(t => t.id === id) || null; }

export function addTeam({ name, short, accent }) {
  const t = {
    id: uid('tm'),
    name: name.trim(),
    short: (short || name).trim().slice(0, 4).toUpperCase(),
    accent: accent || 'emerald',
    players: [],
    createdAt: Date.now()
  };
  data().teams.push(t);
  save();
  return t;
}

export function updateTeam(id, patch) {
  const t = team(id); if (!t) return null;
  Object.assign(t, patch);
  save();
  return t;
}

export function deleteTeam(id) {
  const d = data();
  d.teams = d.teams.filter(t => t.id !== id);
  d.players = d.players.filter(p => p.teamId !== id);
  save();
}

export function players(teamId) {
  const d = data();
  if (!teamId) return d.players;
  const t = team(teamId);
  if (!t) return [];
  // Preserve the squad order stored on the team.
  return t.players.map(pid => d.players.find(p => p.id === pid)).filter(Boolean);
}

export function player(id) { return data().players.find(p => p.id === id) || null; }

export function playerName(id) { return player(id)?.name || 'Unknown'; }

export function addPlayer(teamId, { name, role = 'Batter', batStyle = 'RHB', bowlStyle = '' }) {
  const t = team(teamId); if (!t) return null;
  const p = { id: uid('pl'), teamId, name: name.trim(), role, batStyle, bowlStyle };
  data().players.push(p);
  t.players.push(p.id);
  save();
  return p;
}

export function updatePlayer(id, patch) {
  const p = player(id); if (!p) return null;
  Object.assign(p, patch);
  save();
  return p;
}

export function deletePlayer(id) {
  const d = data();
  const p = player(id);
  d.players = d.players.filter(x => x.id !== id);
  if (p) { const t = team(p.teamId); if (t) t.players = t.players.filter(x => x !== id); }
  save();
}

/* ---------- matches ---------- */

export function matches() { return data().matches; }
export function match(id) { return data().matches.find(m => m.id === id) || null; }

export function addMatch(m) { data().matches.push(m); save(true); return m; }

export function deleteMatch(id) {
  const d = data();
  d.matches = d.matches.filter(m => m.id !== id);
  // Detach from any tournament fixture that pointed at it.
  d.tournaments.forEach(t => t.fixtures?.forEach(f => { if (f.matchId === id) f.matchId = null; }));
  save(true);
}

/* ---------- tournaments ---------- */

export function tournaments() { return data().tournaments; }
export function tournament(id) { return data().tournaments.find(t => t.id === id) || null; }

export function addTournament(t) { data().tournaments.push(t); save(true); return t; }

export function deleteTournament(id, alsoMatches = false) {
  const d = data();
  const t = tournament(id);
  if (t && alsoMatches) {
    const ids = new Set((t.fixtures || []).map(f => f.matchId).filter(Boolean));
    d.matches = d.matches.filter(m => !ids.has(m.id));
  } else {
    d.matches.forEach(m => { if (m.tournamentId === id) m.tournamentId = null; });
  }
  d.tournaments = d.tournaments.filter(x => x.id !== id);
  save(true);
}

/* ---------- backup ---------- */

export function exportJSON() { return JSON.stringify(data(), null, 2); }

export function importJSON(text, mode = 'replace') {
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.teams)) {
    throw new Error('That file is not a Cricket Scorer backup.');
  }
  if (mode === 'replace') {
    db = migrate(incoming);
  } else {
    const d = data();
    const seen = k => new Set(d[k].map(x => x.id));
    for (const k of ['teams', 'players', 'matches', 'tournaments']) {
      const have = seen(k);
      (incoming[k] || []).forEach(x => { if (!have.has(x.id)) d[k].push(x); });
    }
  }
  save(true);
  return db;
}

export function resetAll() {
  db = empty();
  save(true);
}

export function storageUsed() {
  try { return new Blob([localStorage.getItem(KEY) || '']).size; } catch { return 0; }
}

export function settings() { return data().settings; }

export function setSetting(k, v) { data().settings[k] = v; save(); }
