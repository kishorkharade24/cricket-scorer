/* One command for phone testing: serves the folder and opens an ngrok tunnel,
 * then prints the HTTPS URL to open on the phone.
 *
 *   npm run dev
 *
 * Needs ngrok installed and logged in once (`ngrok config add-authtoken …`).
 * Ctrl-C stops both.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const PORT = process.env.PORT || 4173;
const kids = [];
const stop = () => { kids.forEach(k => { try { k.kill('SIGTERM'); } catch {} }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function run(cmd, args, name) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  p.on('error', e => console.error(`[${name}] ${e.message}`));
  kids.push(p);
  return p;
}

/** Fail with a sentence, not a stack trace, when the port is taken. */
function portFree(port) {
  return new Promise(resolve => {
    const s = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => s.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

if (!await portFree(PORT)) {
  console.error(`\nPort ${PORT} is already in use — something is serving there already.`);
  console.error(`Either open http://localhost:${PORT} and use that, or free the port:`);
  console.error(`  fuser -k ${PORT}/tcp        # linux`);
  console.error(`  lsof -ti:${PORT} | xargs kill   # macOS`);
  console.error(`Or pick another:  PORT=4174 npm run dev\n`);
  process.exit(1);
}

/* Prefer http-server if it is installed; fall back to Python's, which is
 * everywhere. -c-1 turns off HTTP caching so you are not fighting both the
 * browser cache and the service worker while testing. */
const hasHttpServer = spawnSync('http-server', ['--version'], { stdio: 'ignore' }).status === 0;
console.log(`Serving this folder on http://localhost:${PORT}  (${hasHttpServer ? 'http-server' : 'python http.server'})`);
if (hasHttpServer) {
  run('http-server', ['-p', String(PORT), '-a', '127.0.0.1', '-c-1', '--silent', '.'], 'server');
} else {
  run('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], 'server');
}

await new Promise(r => setTimeout(r, 800));
console.log('Opening an ngrok tunnel…');
const ng = run('ngrok', ['http', String(PORT), '--log=stdout'], 'ngrok');
ng.stdout.on('data', d => { if (/err|error/i.test(String(d))) process.stdout.write(String(d)); });

// ngrok publishes the public URL on its own local API
let url = null;
for (let i = 0; i < 40 && !url; i++) {
  await new Promise(r => setTimeout(r, 500));
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    const j = await res.json();
    url = (j.tunnels || []).map(t => t.public_url).find(u => u.startsWith('https')) || null;
  } catch { /* not up yet */ }
}

if (!url) {
  console.error('\nngrok did not start. Check it is installed and authenticated:');
  console.error('  ngrok config add-authtoken <your token from dashboard.ngrok.com>');
  stop();
}

// A scannable code beats typing an ngrok hostname on a phone keyboard.
let qr = '';
try {
  const r = spawnSync('qrencode', ['-t', 'UTF8', '-m', '2', url], { encoding: 'utf8' });
  if (r.status === 0) qr = r.stdout;
} catch { /* qrencode not installed — the URL below is enough */ }

const line = '─'.repeat(url.length + 4);
console.log(`
Open this on your phone:

  ┌${line}┐
  │  ${url}  │
  └${line}┘
${qr ? '\nOr scan:\n' + qr : '\n(install qrencode for a scannable code: sudo apt install qrencode)\n'}

On a free ngrok URL the first page is a warning screen — tap "Visit Site" once
and the app loads normally from then on.

Then: Chrome menu → Install app,  or  Safari → Share → Add to Home Screen.

ngrok's own request log: http://localhost:4040
Ctrl-C stops both the server and the tunnel.
`);
