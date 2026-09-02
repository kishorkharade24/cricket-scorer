/* live.js — the live scoreboard: one phone scores, nearby phones watch.
 *
 * Peer-to-peer over WebRTC with no server anywhere. The one thing WebRTC
 * cannot do alone is the introduction: each side must hand the other a small
 * connection code. Here that code travels as a QR (or copy-paste), so nothing
 * ever leaves the ground:
 *
 *      scorer: "Add a viewer"  ->  shows code A
 *      viewer: scans A         ->  shows reply code B
 *      scorer: scans B         ->  connected
 *
 * No STUN, no TURN, no ICE servers at all — candidates are the phones' own
 * local addresses, which is exactly right for two phones on the same WiFi or
 * one phone's hotspot. It also means it deliberately cannot work across the
 * internet.
 *
 * The protocol is deliberately dumb: on every change the host sends the whole
 * match (plus the team and player records it references), and the viewer
 * recomputes the scorecard with the same engine. At one delivery every twenty
 * seconds, a few KB per ball is nothing, and there is no diff protocol to get
 * out of sync.
 */

import * as store from './store.js';

export const PROTO = 'cslive1';

/* ------------------------------------------------------------------ *
 * Connection codes: JSON -> deflate -> base64url, prefixed "CSL1."
 * ------------------------------------------------------------------ */

const b64u = {
  enc: bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
};

async function pipe(bytes, Stream, kind) {
  const out = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeBlob(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    return 'CSL1.d.' + b64u.enc(await pipe(raw, CompressionStream, 'deflate-raw'));
  }
  return 'CSL1.r.' + b64u.enc(raw);
}

export async function decodeBlob(str) {
  const m = String(str || '').trim().match(/^CSL1\.([dr])\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('That is not a Cricket Scorer code.');
  let raw = b64u.dec(m[2]);
  if (m[1] === 'd') raw = await pipe(raw, DecompressionStream, 'deflate-raw');
  return JSON.parse(new TextDecoder().decode(raw));
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

const RTC_CFG = { iceServers: [] };   // local network only, on purpose

function gathered(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => { pc.removeEventListener('icegatheringstatechange', done); res(); };
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
    setTimeout(res, 2500);            // local candidates arrive almost at once
  });
}

/* ------------------------------------------------------------------ *
 * Hosting (the scorer's side)
 * ------------------------------------------------------------------ */

export const host = {
  matchId: null,
  peers: [],            // { pc, dc, alive }
  pending: null,        // the peer we have shown a code for, awaiting the reply
  unsub: null,
  onChange: null,       // UI callback: fn() when the peer count moves
  ping: null
};

export function hosting() { return !!host.matchId; }
export function viewerCount() { return host.peers.filter(p => p.dc?.readyState === 'open').length; }

/** The whole story a viewer needs to render the match on its own. */
export function bundle(matchId) {
  const m = store.match(matchId);
  if (!m) return null;
  const teams = m.teams.map(id => store.team(id)).filter(Boolean);
  const ids = new Set(Object.values(m.xi || {}).flat());
  m.teams.forEach(tid => (store.team(tid)?.players || []).forEach(id => ids.add(id)));
  const players = [...ids].map(id => store.player(id)).filter(Boolean);
  return { proto: PROTO, t: 'match', match: m, teams, players, sentAt: Date.now() };
}

function pushToAll() {
  const b = bundle(host.matchId);
  if (!b) return;
  const msg = JSON.stringify(b);
  host.peers.forEach(p => { if (p.dc?.readyState === 'open') { try { p.dc.send(msg); } catch { /* dying */ } } });
}

export function startHosting(matchId) {
  if (host.matchId === matchId) return;
  stopHosting();
  host.matchId = matchId;
  host.unsub = store.onChange(() => pushToAll());
  host.ping = setInterval(() => {
    host.peers.forEach(p => { if (p.dc?.readyState === 'open') { try { p.dc.send('{"t":"ping"}'); } catch { /* ignore */ } } });
    // shed peers whose channel has closed under us
    const before = host.peers.length;
    host.peers = host.peers.filter(p => p.dc && p.dc.readyState !== 'closed');
    if (host.peers.length !== before) host.onChange?.();
  }, 4000);
}

export function stopHosting() {
  host.peers.forEach(p => { try { p.dc?.close(); p.pc?.close(); } catch { /* ignore */ } });
  try { host.pending?.pc?.close(); } catch { /* ignore */ }
  clearInterval(host.ping);
  host.unsub?.();
  Object.assign(host, { matchId: null, peers: [], pending: null, unsub: null, ping: null });
}

/** Step 1: make the code the viewer scans. */
export async function hostOffer(matchId) {
  startHosting(matchId);
  try { host.pending?.pc?.close(); } catch { /* ignore */ }

  const pc = new RTCPeerConnection(RTC_CFG);
  const dc = pc.createDataChannel('score', { ordered: true });
  const peer = { pc, dc };

  dc.onopen = () => {
    host.peers.push(peer);
    if (host.pending === peer) host.pending = null;
    try { dc.send(JSON.stringify(bundle(host.matchId))); } catch { /* ignore */ }
    host.onChange?.();
  };
  dc.onclose = () => {
    host.peers = host.peers.filter(p => p !== peer);
    host.onChange?.();
  };

  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  host.pending = peer;
  return encodeBlob({ p: PROTO, t: 'offer', sdp: pc.localDescription.sdp });
}

/** Step 2: feed in the viewer's reply. Resolves once the channel opens. */
export async function hostAccept(replyCode) {
  const msg = await decodeBlob(replyCode);
  if (msg.p !== PROTO || msg.t !== 'answer') throw new Error('That code is not a viewer reply.');
  const peer = host.pending;
  if (!peer) throw new Error('Create a viewer code first.');
  await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
  await new Promise((res, rej) => {
    if (peer.dc.readyState === 'open') return res();
    const t = setTimeout(() => rej(new Error('The phones could not reach each other. Same WiFi (or the scorer’s hotspot), then try again.')), 15000);
    peer.dc.addEventListener('open', () => { clearTimeout(t); res(); });
  });
}

/* ------------------------------------------------------------------ *
 * Watching (the viewer's side)
 * ------------------------------------------------------------------ */

export const viewer = {
  pc: null, dc: null,
  lastBundle: null,
  lastSeen: 0,
  onUpdate: null,       // fn(bundle)
  onState: null         // fn('connecting'|'open'|'closed')
};

/** Scan the scorer's code, get back the reply code to show them. */
export async function viewerJoin(offerCode) {
  const msg = await decodeBlob(offerCode);
  if (msg.p !== PROTO || msg.t !== 'offer') throw new Error('That code is not a scorer’s viewer code.');
  viewerLeave();

  const pc = new RTCPeerConnection(RTC_CFG);
  viewer.pc = pc;
  pc.ondatachannel = e => {
    const dc = viewer.dc = e.channel;
    dc.onopen = () => { viewer.lastSeen = Date.now(); viewer.onState?.('open'); };
    dc.onclose = () => viewer.onState?.('closed');
    dc.onmessage = ev => {
      viewer.lastSeen = Date.now();
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.t === 'ping') { try { dc.send('{"t":"pong"}'); } catch { /* ignore */ } return; }
      if (data.t === 'match' && data.proto === PROTO) {
        viewer.lastBundle = data;
        viewer.onUpdate?.(data);
      }
    };
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) viewer.onState?.('closed');
  };

  await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  viewer.onState?.('connecting');
  return encodeBlob({ p: PROTO, t: 'answer', sdp: pc.localDescription.sdp });
}

export function viewerLeave() {
  try { viewer.dc?.close(); viewer.pc?.close(); } catch { /* ignore */ }
  Object.assign(viewer, { pc: null, dc: null });
}
