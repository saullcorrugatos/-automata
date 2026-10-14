// Servidor do placar TikTok LIVE para OBS.
// Sem dependências externas: usa apenas módulos nativos do Node (>= 18).
//
//   http://localhost:3000/overlay  -> Browser Source do OBS
//   http://localhost:3000/control  -> painel de controle (abra no navegador)
//   GET  /api/state                -> estado atual em JSON
//   POST /api/action               -> { "type": "...", ... } (ver applyAction)
//   GET  /api/<tipo>?team=blue&n=5 -> atalho para integrações (TikFinity, Streamer.bot...)
//   GET  /events                   -> Server-Sent Events com o estado em tempo real

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'state.json');

const DEFAULT_STATE = {
  scores: { blue: 44, red: 28 },
  votes: { blue: 22, red: 13 },
  names: { blue: 'TIME AZUL', red: 'TIME VERMELHO' },
  minutes: 5,
  seconds: 339,
  running: false,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...clone(DEFAULT_STATE), ...saved, running: false };
  } catch {
    return clone(DEFAULT_STATE);
  }
}

let state = loadState();
let timerInterval = null;
const clients = new Set();

let saveTimeout = null;
function saveState() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {});
  }, 300);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function publish(extra) {
  broadcast('state', state);
  if (extra) broadcast(extra.event, extra.data);
  saveState();
}

function startTimer() {
  if (timerInterval) return;
  state.running = true;
  timerInterval = setInterval(() => {
    if (state.seconds > 0) {
      state.seconds--;
      publish();
    } else {
      pauseTimer();
      publish();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.running = false;
}

const isTeam = (t) => t === 'blue' || t === 'red';
const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

// Aplica uma ação ao estado. Retorna mensagem de erro ou null.
function applyAction(a) {
  let extra = null;
  switch (a.type) {
    case 'score': {
      if (!isTeam(a.team)) return 'team inválido (use blue ou red)';
      state.scores[a.team] = Math.max(0, state.scores[a.team] + toInt(a.n, 1));
      extra = { event: 'flash', data: { team: a.team } };
      break;
    }
    case 'vote': {
      if (!isTeam(a.team)) return 'team inválido (use blue ou red)';
      state.votes[a.team] = Math.max(0, state.votes[a.team] + toInt(a.n, 1));
      extra = { event: 'vote', data: { team: a.team } };
      break;
    }
    case 'name': {
      if (!isTeam(a.team)) return 'team inválido (use blue ou red)';
      state.names[a.team] = String(a.value ?? '').slice(0, 40);
      break;
    }
    case 'start':
      startTimer();
      break;
    case 'pause':
      pauseTimer();
      break;
    case 'resetTimer': {
      pauseTimer();
      const minutes = Math.min(99, Math.max(1, toInt(a.minutes, state.minutes)));
      state.minutes = minutes;
      state.seconds = minutes * 60;
      break;
    }
    case 'resetScores':
      state.scores = { blue: 0, red: 0 };
      break;
    case 'resetVotes':
      state.votes = { blue: 0, red: 0 };
      break;
    case 'resetAll':
      pauseTimer();
      state = clone(DEFAULT_STATE);
      break;
    default:
      return `ação desconhecida: ${a.type}`;
  }
  publish(extra);
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, pathname) {
  const routes = { '/': '/overlay.html', '/overlay': '/overlay.html', '/control': '/control.html' };
  const rel = routes[pathname] || pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/state') return sendJson(res, 200, state);

  if (pathname === '/api/action' && req.method === 'POST') {
    try {
      const action = JSON.parse((await readBody(req)) || '{}');
      const error = applyAction(action);
      return error ? sendJson(res, 400, { error }) : sendJson(res, 200, state);
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido' });
    }
  }

  // Atalho GET: /api/vote?team=blue  /api/score?team=red&n=5  /api/start ...
  if (pathname.startsWith('/api/')) {
    const action = { type: pathname.slice(5), ...Object.fromEntries(url.searchParams) };
    const error = applyAction(action);
    return error ? sendJson(res, 400, { error }) : sendJson(res, 200, state);
  }

  serveStatic(res, pathname);
});

// Mantém conexões SSE vivas através de proxies.
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000);

server.listen(PORT, HOST, () => {
  console.log(`Placar rodando na porta ${PORT}`);
  console.log(`  Overlay (OBS):     http://localhost:${PORT}/overlay`);
  console.log(`  Painel de controle: http://localhost:${PORT}/control`);
});
