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

/**
 * Browsers hide the phone's real address behind a random "….local" name until
 * the page has camera permission, and those names often fail to resolve
 * between devices — the handshake then completes but the connection never
 * forms. Both sides of ours use the camera anyway (to scan), so asking a
 * moment early gets literal IP addresses into the candidates. Failure is
 * fine: it just falls back to the .local names.
 */
export async function warmup() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch { return false; }
}

/**
 * The QR carries only what a data-channel connection actually needs — the ICE
 * credentials, the DTLS fingerprint and the host candidates — and the SDP is
 * rebuilt from a template on the other side. Browsers pad an offer to ~1.5KB;
 * this packs to ~250 bytes, and a smaller code means bigger QR modules, which
 * is the difference between a phone camera reading it or not.
 */
export function packSdp(sdp) {
  const grab = re => (String(sdp).match(re) || [])[1] || '';
  const fp = grab(/a=fingerprint:sha-256 ([0-9A-F:]+)/i).replace(/:/g, '');
  return {
    u: grab(/a=ice-ufrag:(\S+)/),
    w: grab(/a=ice-pwd:(\S+)/),
    f: fp,                                                    // hex, no colons
    a: /a=setup:actpass/.test(sdp) ? 1 : 0,                   // 1 = offer side
    c: [...String(sdp).matchAll(/a=candidate:\S+ 1 (?:udp|UDP) \d+ (\S+) (\d+) typ host/g)]
        .map(m => [m[1], +m[2]])
        .filter((v, i, arr) => arr.findIndex(x => x[0] === v[0] && x[1] === v[1]) === i)
        .slice(0, 5)
  };
}

export function buildSdp(j) {
  const fp = j.f.match(/.{2}/g).join(':').toUpperCase();
  const cands = j.c.map(([ip, port], i) =>
    `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${ip} ${port} typ host`);
  return [
    'v=0', 'o=- 1000000000000000001 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...cands,
    `a=ice-ufrag:${j.u}`, `a=ice-pwd:${j.w}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${j.a ? 'actpass' : 'active'}`,
    'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'
  ].join('\r\n') + '\r\n';
}

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
 * The handshake relay (optional, needs internet)
 *
 * The score itself always flows phone-to-phone. What can travel through here
 * is only the ~300-byte connection handshake, so that joining becomes: scan
 * one QR, scorer taps Accept. Everything published is AES-GCM encrypted with
 * a key that exists only inside the QR — the relay carries ciphertext on a
 * random unguessable topic and can read none of it. With no internet the
 * two-QR flow still works; this is a shortcut, not a dependency.
 * ------------------------------------------------------------------ */

const RELAY = 'https://ntfy.sh';
const rnd = n => crypto.getRandomValues(new Uint8Array(n));

async function seal(keyRaw, obj) {
  const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64u.enc(out);
}

async function unseal(keyRaw, str) {
  const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['decrypt']);
  const raw = b64u.dec(str);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}

function relaySub(topic, onMsg) {
  const ws = new WebSocket(`${RELAY.replace('https', 'wss')}/${topic}/ws`);
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === 'message' && m.message) onMsg(m.message);
    } catch { /* not for us */ }
  };
  return ws;
}

async function relayPub(topic, text) {
  const r = await fetch(`${RELAY}/${topic}`, { method: 'POST', body: text });
  if (!r.ok) throw new Error('relay refused the message');
}

/** Is the shortcut available right now? */
export async function relayCheck(ms = 3500) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    const r = await fetch(`${RELAY}/v1/health`, { signal: c.signal });
    return r.ok;
  } catch { return false; }
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
  closeRoom();
  clearInterval(host.ping);
  host.unsub?.();
  Object.assign(host, { matchId: null, peers: [], pending: null, unsub: null, ping: null });
}

export function closeRoom() {
  try { host.room?.ws?.close(); } catch { /* ignore */ }
  host.room = null;
}

/**
 * One-scan hosting: open a room on the relay and hand back a short code.
 * Each viewer that scans it sends a join request; `onRequest` gets
 * { accept, reject } and the scorer decides. One QR serves any number of
 * viewers because each brings its own connection offer.
 */
export async function hostRoom(matchId, { onRequest }) {
  startHosting(matchId);
  closeRoom();
  const topic = 'cs' + b64u.enc(rnd(10));
  const keyRaw = rnd(16);
  const seenIds = new Set();

  const ws = relaySub(topic, async sealed => {
    let msg;
    try { msg = await unseal(keyRaw, sealed); } catch { return; }   // not ours
    if (msg.t !== 'jo' || !msg.i || seenIds.has(msg.i)) return;
    seenIds.add(msg.i);
    onRequest({
      id: msg.i,
      accept: async () => {
        const pc = new RTCPeerConnection(RTC_CFG);
        const peer = { pc, dc: null };
        pc.ondatachannel = e => attachHostChannel(peer, e.channel);
        await pc.setRemoteDescription({ type: 'offer', sdp: buildSdp(msg.j) });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        await relayPub(topic, await seal(keyRaw, { t: 'ja', i: msg.i, j: packSdp(pc.localDescription.sdp) }));
      },
      reject: () => { /* silence is the rejection — the viewer times out */ }
    });
  });

  host.room = { topic, keyRaw, ws };
  return encodeBlob({ p: PROTO, t: 'room', r: topic, k: b64u.enc(keyRaw) });
}

/**
 * The viewer's side of a room code: send our offer through the relay, wait
 * for the scorer to accept. The connection itself is still phone-to-phone.
 */
export async function viewerJoinRoom(code, { onStatus } = {}) {
  const msg = await decodeBlob(code);
  if (msg.p !== PROTO || msg.t !== 'room') throw new Error('That is not a room code.');
  viewerLeave();

  const keyRaw = b64u.dec(msg.k);
  const pc = new RTCPeerConnection(RTC_CFG);
  viewer.pc = pc;
  attachViewerChannel(pc.createDataChannel('score', { ordered: true }));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') viewer.onState?.('failed');
    else if (['disconnected', 'closed'].includes(pc.connectionState)) viewer.onState?.('closed');
  };

  const myId = b64u.enc(rnd(6));
  const ws = relaySub(msg.r, async sealed => {
    let m;
    try { m = await unseal(keyRaw, sealed); } catch { return; }
    if (m.t !== 'ja' || m.i !== myId) return;
    ws.close();
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: buildSdp(m.j) });
      onStatus?.('accepted');
    } catch (err) { console.error('[live]', err); viewer.onState?.('failed'); }
  });
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('Could not reach the join service — ask the scorer to switch to offline mode.'));
    setTimeout(() => rej(new Error('Could not reach the join service — ask the scorer to switch to offline mode.')), 6000);
  });

  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  await relayPub(msg.r, await seal(keyRaw, { t: 'jo', i: myId, j: packSdp(pc.localDescription.sdp) }));
  onStatus?.('waiting-accept');
  return true;
}

function attachHostChannel(peer, dc) {
  peer.dc = dc;
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
}

/** Step 1: make the code the viewer scans. */
export async function hostOffer(matchId) {
  startHosting(matchId);
  try { host.pending?.pc?.close(); } catch { /* ignore */ }

  const pc = new RTCPeerConnection(RTC_CFG);
  const dc = pc.createDataChannel('score', { ordered: true });
  const peer = { pc, dc };
  attachHostChannel(peer, dc);

  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  host.pending = peer;
  return encodeBlob({ p: PROTO, t: 'offer', j: packSdp(pc.localDescription.sdp) });
}

/** Step 2: feed in the viewer's reply. Resolves once the channel opens. */
export async function hostAccept(replyCode) {
  const msg = await decodeBlob(replyCode);
  if (msg.p !== PROTO || msg.t !== 'answer') throw new Error('That code is not a viewer reply.');
  const peer = host.pending;
  if (!peer) throw new Error('Create a viewer code first.');
  await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.j ? buildSdp(msg.j) : msg.sdp });
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

function attachViewerChannel(dc) {
  viewer.dc = dc;
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
}

/** Scan the scorer's code, get back the reply code to show them. */
export async function viewerJoin(offerCode) {
  const msg = await decodeBlob(offerCode);
  if (msg.p !== PROTO || msg.t !== 'offer') throw new Error('That code is not a scorer’s viewer code.');
  viewerLeave();

  const pc = new RTCPeerConnection(RTC_CFG);
  viewer.pc = pc;
  pc.ondatachannel = e => attachViewerChannel(e.channel);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') viewer.onState?.('failed');
    else if (['disconnected', 'closed'].includes(pc.connectionState)) viewer.onState?.('closed');
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') viewer.onState?.('failed');
  };

  await pc.setRemoteDescription({ type: 'offer', sdp: msg.j ? buildSdp(msg.j) : msg.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  viewer.onState?.('connecting');
  return encodeBlob({ p: PROTO, t: 'answer', j: packSdp(pc.localDescription.sdp) });
}

/** What addresses each side put on the table — the first thing to look at
 *  when the codes worked but no connection formed. */
export function candidateSummary() {
  const parse = sdp => [...String(sdp || '').matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) \d+ typ host/gi)]
    .map(m => m[1])
    .map(ip => ip.endsWith('.local') ? 'hidden (.local)' : ip);
  return {
    mine: parse(viewer.pc?.localDescription?.sdp),
    theirs: parse(viewer.pc?.remoteDescription?.sdp)
  };
}

export function viewerLeave() {
  try { viewer.dc?.close(); viewer.pc?.close(); } catch { /* ignore */ }
  Object.assign(viewer, { pc: null, dc: null });
}
