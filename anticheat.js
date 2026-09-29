// Validação da partida. Este arquivo não é servido ao navegador.
// O cliente desenha; daqui saem fase, moeda, morte e bandeira.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PLAYER_W = 30;
const PLAYER_H = 40;
const SPEED = 280;
const MAX_RISE = 150;
const MAX_FALL = 900;
const STRIKE_LIMIT = 6;

function loadLevels() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "levels.js"), "utf8"), sandbox);
  const levels = sandbox.window.LEVELS;
  if (!Array.isArray(levels) || !levels.length) {
    throw new Error("Fases inválidas.");
  }
  return levels;
}

const LEVELS = loadLevels();

function totalCoins() {
  return LEVELS.reduce((sum, level) => sum + level.coins.length, 0);
}

function publicLevel(index) {
  const level = LEVELS[index];
  if (!level) return null;
  return {
    name: level.name,
    w: level.w,
    spawn: { x: level.spawn.x, y: level.spawn.y },
    goal: { ...level.goal },
    platforms: level.platforms.map((platform) => ({ ...platform, motion: platform.motion ? { ...platform.motion } : null })),
    coins: level.coins.map((coin) => ({ x: coin.x, y: coin.y, r: coin.r })),
    spikes: level.spikes.map((spike) => ({ ...spike })),
  };
}

function openMatch(index) {
  const level = LEVELS[index];
  const now = Date.now();
  return {
    index,
    x: level.spawn.x,
    y: level.spawn.y,
    at: now,
    startedAt: now,
    groundedY: level.spawn.y,
    coins: [],
    lives: 3,
    strikes: 0,
  };
}

function overlaps(x, y, box) {
  return x < box.x + box.w && x + PLAYER_W > box.x && y < box.y + box.h && y + PLAYER_H > box.y;
}

function nearCoin(x, y, coin) {
  const cx = Math.min(x + PLAYER_W, Math.max(x, coin.x));
  const cy = Math.min(y + PLAYER_H, Math.max(y, coin.y));
  const dx = coin.x - cx;
  const dy = coin.y - cy;
  return dx * dx + dy * dy <= (coin.r + 8) * (coin.r + 8);
}

function pathHits(level, x0, y0, x1, y1, test) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    if (test(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}

function onGround(level, x, y) {
  const feet = y + PLAYER_H;
  for (const platform of level.platforms) {
    const top = platform.y;
    if (x + PLAYER_W > platform.x && x < platform.x + platform.w && feet >= top - 10 && feet <= top + 20) {
      return true;
    }
  }
  return false;
}

function moverSlack(level) {
  let extra = 0;
  for (const platform of level.platforms) {
    if (!platform.motion) continue;
    extra = Math.max(extra, Math.abs(platform.motion.range * platform.motion.speed));
  }
  return extra;
}

function review(match, x, y, now) {
  const level = LEVELS[match.index];
  const dt = Math.max(0, (now - match.at) / 1000);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail(match, level, "posição");
  }
  if (dt < 0.04) return { event: "ok", x: match.x, y: match.y };

  const dx = x - match.x;
  const rise = match.groundedY - y;
  const slack = moverSlack(level);
  const maxX = (SPEED + slack) * dt * 1.45 + 32;
  const maxDown = MAX_FALL * dt + 48;
  let reason = "";
  if (dt > 1.5 && Math.abs(dx) > (SPEED + slack) * dt + 80) reason = "teleporte";
  else if (dt <= 1.5 && Math.abs(dx) > maxX) reason = "velocidade";
  else if (rise > MAX_RISE + 24) reason = "pulo";
  else if (y - match.y > maxDown) reason = "queda";

  if (reason) return fail(match, level, reason);

  const touchedSpike = level.spikes.some((spike) => pathHits(level, match.x, match.y, x, y, (px, py) => overlaps(px, py, spike)));
  const fell = pathHits(level, match.x, match.y, x, y, (px, py) => py > 720);
  if (touchedSpike || fell) return die(match, level);

  const picked = [];
  level.coins.forEach((coin, index) => {
    if (match.coins.includes(index)) return;
    const crossed = pathHits(level, match.x, match.y, x, y, (px, py) => nearCoin(px, py, coin));
    if (crossed) picked.push(index);
  });

  const reached = pathHits(level, match.x, match.y, x, y, (px, py) => overlaps(px, py, level.goal));
  if (reached) {
    const minTime = Math.max(1.2, (level.goal.x - level.spawn.x) / (SPEED * 1.35));
    if ((now - match.startedAt) / 1000 < minTime) return fail(match, level, "tempo");
  }

  match.x = x;
  match.y = y;
  match.at = now;
  if (onGround(level, x, y)) match.groundedY = y;
  for (const index of picked) match.coins.push(index);

  if (reached) return { event: "clear", x, y, coinIndex: picked.at(-1) ?? -1, coinIndexes: picked };
  return { event: picked.length ? "coin" : "ok", x, y, coinIndex: picked.at(-1) ?? -1, coinIndexes: picked };
}

function fail(match, level, reason) {
  match.strikes += 1;
  match.at = Date.now();
  if (match.strikes >= STRIKE_LIMIT) {
    return { event: "kick", x: level.spawn.x, y: level.spawn.y, reason };
  }
  return { event: "snap", x: match.x, y: match.y, reason };
}

function die(match, level) {
  match.lives -= 1;
  match.x = level.spawn.x;
  match.y = level.spawn.y;
  match.groundedY = level.spawn.y;
  match.at = Date.now();
  if (match.lives <= 0) {
    match.lives = 3;
    match.coins = [];
    return { event: "retry", x: match.x, y: match.y, coinIndex: -1 };
  }
  return { event: "dead", x: match.x, y: match.y, coinIndex: -1 };
}

module.exports = {
  LEVELS,
  totalCoins: totalCoins(),
  levelCount: LEVELS.length,
  publicLevel,
  openMatch,
  review,
};
