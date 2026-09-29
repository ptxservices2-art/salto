// Servidor local do Salto.
// A sessão (apelido e país) fica em data/sessions.json enquanto a pessoa está jogando.
// A conta de verdade, criada no fim das 20 fases, fica em data/accounts.json.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const guard = require("./anticheat");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const SESSIONS_FILE = path.join(DATA, "sessions.json");
const ACCOUNTS_FILE = path.join(DATA, "accounts.json");
const SECRET_FILE = path.join(DATA, "seal.key");
const PORT = Number(process.env.PORT) || 8787;
const ONLINE_MS = 12000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const COUNTRIES = [
  "Brasil",
  "Portugal",
  "Angola",
  "Moçambique",
  "Cabo Verde",
  "Guiné-Bissau",
  "São Tomé e Príncipe",
  "Timor-Leste",
  "Argentina",
  "Chile",
  "Uruguai",
  "Paraguai",
  "Bolívia",
  "Peru",
  "Colômbia",
  "México",
  "Estados Unidos",
  "Canadá",
  "Espanha",
  "França",
  "Itália",
  "Alemanha",
  "Reino Unido",
  "Japão",
  "Outro",
];

const PUBLIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/game.js", "game.js"],
  ["/style.css", "style.css"],
]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function readStore(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeStore(file, data) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

let writeChain = Promise.resolve();
function withStore(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => {}, () => {});
  return run;
}

function loadSecret() {
  fs.mkdirSync(DATA, { recursive: true });
  try {
    return fs.readFileSync(SECRET_FILE);
  } catch (err) {
    const secret = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

const SEAL_SECRET = loadSecret();
const matches = new Map();

function progressPayload(session) {
  return JSON.stringify({
    level: session.level || 0,
    coins: session.coins || 0,
    elapsed: Math.round((session.elapsed || 0) * 1000) / 1000,
    completed: Boolean(session.completed),
    strikes: session.strikes || 0,
  });
}

function signSession(session) {
  session.seal = crypto.createHmac("sha256", SEAL_SECRET).update(progressPayload(session)).digest("hex");
}

function verifySession(session) {
  const expected = crypto.createHmac("sha256", SEAL_SECRET).update(progressPayload(session)).digest("hex");
  if (!session.seal) {
    signSession(session);
    return "migrate";
  }
  const left = Buffer.from(String(session.seal));
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    session.level = 0;
    session.coins = 0;
    session.elapsed = 0;
    session.completed = false;
    session.strikes = 0;
    signSession(session);
    return "reset";
  }
  return "ok";
}

function loadSessions() {
  const data = readStore(SESSIONS_FILE, { sessions: [] });
  if (!Array.isArray(data.sessions)) data.sessions = [];
  let dirty = false;
  for (const session of data.sessions) {
    if (verifySession(session) !== "ok") dirty = true;
  }
  if (dirty) saveSessions(data);
  return data;
}

function saveSessions(data) {
  for (const session of data.sessions) signSession(session);
  writeStore(SESSIONS_FILE, data);
}

function loadAccounts() {
  const data = readStore(ACCOUNTS_FILE, { accounts: [] });
  if (!Array.isArray(data.accounts)) data.accounts = [];
  return data;
}

function pruneSessions(data) {
  const cutoff = Date.now() - SESSION_TTL_MS;
  data.sessions = data.sessions.filter((session) => session.updatedAt >= cutoff);
}

function publicSession(session) {
  return {
    nick: session.nick,
    country: session.country,
    level: session.level,
    coins: session.coins,
    elapsed: session.elapsed,
    lives: session.lives,
    completed: session.completed,
    saved: Boolean(session.accountUsername),
    accountUsername: session.accountUsername || null,
  };
}

function sampleBody(session, match, verdict) {
  return {
    ok: true,
    event: verdict.event,
    reason: verdict.reason || "",
    x: verdict.x,
    y: verdict.y,
    lives: match ? match.lives : session.lives,
    coins: session.coins,
    pending: match ? match.coins.length : 0,
    level: session.level,
    completed: Boolean(session.completed),
    elapsed: session.elapsed,
    strikes: match ? match.strikes : session.strikes || 0,
    coinIndex: verdict.coinIndex == null ? -1 : verdict.coinIndex,
    coinIndexes: Array.isArray(verdict.coinIndexes) ? verdict.coinIndexes : [],
  };
}

function publicPlayer(session) {
  return {
    nick: session.nick,
    country: session.country,
    level: session.level,
    completed: session.completed,
    x: Number.isFinite(session.lobbyX) ? session.lobbyX : 980,
    y: Number.isFinite(session.lobbyY) ? session.lobbyY : 410,
    facing: session.facing === -1 ? -1 : 1,
    emote: Boolean(session.emote),
    inMatch: Boolean(session.inMatch),
  };
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(Object.assign(new Error("Corpo grande demais."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(Object.assign(new Error("JSON inválido."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function sessionCookie(id) {
  return `salto=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

function clearCookie() {
  return "salto=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function cleanNick(value) {
  const nick = String(value || "").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N} ]{2,16}$/u.test(nick)) return null;
  return nick;
}

function cleanCountry(value) {
  const country = String(value || "").trim();
  return COUNTRIES.includes(country) ? country : null;
}

function cleanUsername(value) {
  const username = String(value || "").trim();
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) return null;
  return username;
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 32);
  return { salt: salt.toString("hex"), passwordHash: hash.toString("hex") };
}

function passwordMatches(password, account) {
  const hash = crypto.scryptSync(password, Buffer.from(account.salt, "hex"), 32);
  const expected = Buffer.from(account.passwordHash, "hex");
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

function findSession(data, id) {
  return data.sessions.find((session) => session.id === id) || null;
}

function numberIn(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function handleApi(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.salto || "";

  if (req.method === "GET" && url.pathname === "/api/meta") {
    send(res, 200, { countries: COUNTRIES, levels: guard.levelCount, totalCoins: guard.totalCoins });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session") {
    const body = await readBody(req);
    const nick = cleanNick(body.nick);
    const country = cleanCountry(body.country);
    if (!nick || !country) {
      send(res, 400, { error: "Use um apelido de 2 a 16 letras e escolha um país." });
      return;
    }
    const created = await withStore(() => {
      const data = loadSessions();
      pruneSessions(data);
      const taken = data.sessions.some((session) => {
        const online = Date.now() - session.updatedAt < ONLINE_MS;
        return online && session.id !== sessionId && session.nick.toLowerCase() === nick.toLowerCase();
      });
      if (taken) return { error: "Esse apelido já está em uso nesta sessão.", status: 409 };
      let session = findSession(data, sessionId);
      if (!session) {
        session = {
          id: crypto.randomBytes(18).toString("hex"),
          nick,
          country,
          level: 0,
          coins: 0,
          elapsed: 0,
          lives: 3,
          completed: false,
          strikes: 0,
          accountUsername: null,
          lobbyX: 980,
          lobbyY: 410,
          facing: 1,
          emote: false,
          inMatch: false,
          updatedAt: Date.now(),
        };
        data.sessions.push(session);
      } else {
        session.nick = nick;
        session.country = country;
        session.updatedAt = Date.now();
      }
      saveSessions(data);
      return { session };
    });
    if (created.error) {
      send(res, created.status, { error: created.error });
      return;
    }
    send(res, 200, publicSession(created.session), { "Set-Cookie": sessionCookie(created.session.id) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const data = loadSessions();
    const session = findSession(data, sessionId);
    if (!session) {
      send(res, 401, { error: "Sem sessão." });
      return;
    }
    session.updatedAt = Date.now();
    await withStore(() => saveSessions(data));
    send(res, 200, publicSession(session));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/progress") {
    await readBody(req);
    const updated = await withStore(() => {
      const data = loadSessions();
      const session = findSession(data, sessionId);
      if (!session) return null;
      session.updatedAt = Date.now();
      saveSessions(data);
      return session;
    });
    if (!updated) {
      send(res, 401, { error: "Sem sessão." });
      return;
    }
    send(res, 200, publicSession(updated));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/lobby") {
    const body = await readBody(req);
    const result = await withStore(() => {
      const data = loadSessions();
      const session = findSession(data, sessionId);
      if (!session) return null;
      const now = Date.now();
      const nextX = numberIn(body.x, session.lobbyX ?? 980, 0, 2400);
      const nextY = numberIn(body.y, session.lobbyY ?? 410, 0, 900);
      const prevX = session.lobbyX ?? nextX;
      const prevY = session.lobbyY ?? nextY;
      const dt = session.lobbyAt ? (now - session.lobbyAt) / 1000 : 2;
      const legal = dt >= 2
        || (Math.abs(nextX - prevX) <= 400 * dt + 30 && Math.abs(nextY - prevY) <= 700 * dt + 40);
      if (legal) {
        session.lobbyX = nextX;
        session.lobbyY = nextY;
      }
      session.lobbyAt = now;
      session.facing = body.facing < 0 ? -1 : 1;
      session.emote = Boolean(body.emote);
      if (matches.has(session.id)) session.inMatch = true;
      session.updatedAt = now;
      saveSessions(data);
      const players = data.sessions
        .filter((item) => now - item.updatedAt < ONLINE_MS)
        .map((item) => ({
          ...publicPlayer(item),
          self: item.id === sessionId,
        }));
      return { players };
    });
    if (!result) {
      send(res, 401, { error: "Sem sessão." });
      return;
    }
    send(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/online") {
    const data = loadSessions();
    const now = Date.now();
    const players = data.sessions
      .filter((session) => now - session.updatedAt < ONLINE_MS)
      .map((session) => ({
        ...publicPlayer(session),
        self: session.id === sessionId,
      }));
    send(res, 200, { players });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    await withStore(() => {
      const data = loadSessions();
      data.sessions = data.sessions.filter((session) => session.id !== sessionId);
      saveSessions(data);
    });
    send(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/account") {
    const body = await readBody(req);
    const username = cleanUsername(body.username);
    const password = String(body.password || "");
    if (!username || password.length < 6 || password.length > 72) {
      send(res, 400, { error: "Usuário de 3 a 20 caracteres e senha com pelo menos 6." });
      return;
    }
    const result = await withStore(() => {
      const sessions = loadSessions();
      const session = findSession(sessions, sessionId);
      if (!session) return { status: 401, error: "Sem sessão." };
      if (!session.completed) return { status: 403, error: "Conclua as 20 fases para salvar." };
      const accounts = loadAccounts();
      const key = username.toLowerCase();
      const existing = accounts.accounts.find((account) => account.usernameKey === key);
      if (existing && !passwordMatches(password, existing)) {
        return { status: 401, error: "Senha incorreta para essa conta." };
      }
      const record = {
        username,
        usernameKey: key, 
        nick: session.nick,
        country: session.country,
        coins: session.coins,
        elapsed: session.elapsed,
        levels: 20,
        savedAt: new Date().toISOString(),
      };
      if (existing) {
        Object.assign(existing, record);
      } else {
        const hashed = hashPassword(password);
        accounts.accounts.push({ ...record, ...hashed });
      }
      session.accountUsername = username;
      session.updatedAt = Date.now();
      writeStore(ACCOUNTS_FILE, accounts);
      saveSessions(sessions);
      return { status: 200, account: record };
    });
    send(res, result.status, result.error ? { error: result.error } : { saved: true, account: result.account });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match/start") {
    const body = await readBody(req);
    const result = await withStore(() => {
      const data = loadSessions();
      const session = findSession(data, sessionId);
      if (!session) return { status: 401, error: "Sem sessão." };
      if (body.replay && session.completed) {
        session.level = 0;
        session.coins = 0;
        session.elapsed = 0;
        session.completed = false;
        session.strikes = 0;
      }
      const index = Math.round(numberIn(session.level, 0, 0, guard.levelCount - 1));
      session.level = index;
      const match = guard.openMatch(index);
      matches.set(session.id, match);
      session.inMatch = true;
      session.lives = match.lives;
      session.updatedAt = Date.now();
      saveSessions(data);
      return {
        status: 200,
        payload: {
          level: guard.publicLevel(index),
          levelIndex: index,
          lives: match.lives,
          coins: session.coins,
          elapsed: session.elapsed,
          completed: Boolean(session.completed),
        },
      };
    });
    send(res, result.status, result.error ? { error: result.error } : result.payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match/sample") {
    const body = await readBody(req);
    const now = Date.now();
    const result = await withStore(() => {
      const data = loadSessions();
      const session = findSession(data, sessionId);
      if (!session) return { status: 401, error: "Sem sessão." };
      const match = matches.get(session.id);
      if (!match) return { status: 409, error: "Sem partida." };
      const verdict = guard.review(match, Number(body.x), Number(body.y), now);
      session.lives = match.lives;
      session.strikes = match.strikes;
      session.updatedAt = now;
      if (verdict.event === "kick") {
        session.inMatch = false;
        matches.delete(session.id);
        saveSessions(data);
        return { status: 200, payload: sampleBody(session, null, verdict) };
      }
      if (verdict.event === "clear") {
        session.coins += match.coins.length;
        session.elapsed = Math.round((session.elapsed + (now - match.startedAt) / 1000) * 1000) / 1000;
        if (match.index >= guard.levelCount - 1) {
          session.completed = true;
          session.level = match.index;
        } else {
          session.level = match.index + 1;
        }
        session.strikes = 0;
        session.lives = match.lives;
        matches.delete(session.id);
        saveSessions(data);
        return { status: 200, payload: sampleBody(session, null, verdict) };
      }
      if (verdict.event !== "ok" && verdict.event !== "coin") saveSessions(data);
      return { status: 200, payload: sampleBody(session, match, verdict) };
    });
    send(res, result.status, result.error ? { error: result.error } : result.payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match/leave") {
    await readBody(req);
    const result = await withStore(() => {
      const data = loadSessions();
      const session = findSession(data, sessionId);
      if (!session) return null;
      matches.delete(session.id);
      session.inMatch = false;
      session.updatedAt = Date.now();
      saveSessions(data);
      return session;
    });
    if (!result) {
      send(res, 401, { error: "Sem sessão." });
      return;
    }
    send(res, 200, publicSession(result));
    return;
  }

  send(res, 404, { error: "Não encontrado." });
}

function serveFile(res, fileName) {
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Não encontrado.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(fileName)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((err) => {
      if (res.headersSent) return;
      send(res, err.status || 500, { error: err.status ? err.message : "Erro no servidor." });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Método não permitido.");
    return;
  }
  const engineScript = url.pathname.match(/^\/engine\/([A-Za-z0-9_-]+\.js)$/);
  if (engineScript) {
    serveFile(res, path.join("engine", engineScript[1]));
    return;
  }
  const fileName = PUBLIC_FILES.get(url.pathname);
  if (!fileName) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Não encontrado.");
    return;
  }
  serveFile(res, fileName);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Salto no ar: http://127.0.0.1:${PORT}`);
});
