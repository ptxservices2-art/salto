// Salto — o servidor confirma fase, moeda, morte e bandeira.
// O navegador só desenha a fase atual e prevê o pulo.

const W = 960;
const H = 540;
const ZOOM = 1.5;
const PLAYER_W = 30;
const PLAYER_H = 40;

const TUNE = Object.freeze({
  gravity: 2200,
  jump: -720,
  speed: 280,
  accel: 3200,
  airAccel: 1900,
  friction: 2400,
  airFriction: 400,
  coyote: 0.12,
  jumpBuffer: 0.14,
  shortHop: 2.6,
  maxFall: 900,
});

const LOBBY = {
  name: "Lobby",
  w: 2200,
  spawn: { x: 980, y: 410 },
  goal: { x: -400, y: 0, w: 1, h: 1 },
  platforms: [
    { x: 0, y: 450, w: 2200, h: 220 },
    { x: 240, y: 390, w: 160, h: 28 },
    { x: 1680, y: 370, w: 180, h: 28 },
    { x: 1040, y: 320, w: 140, h: 24 },
  ],
};

let levelCount = 20;
let TOTAL_COINS = 0;

const gfx = Salto.Application.create({
  canvas: document.getElementById("game"),
  width: W,
  height: H,
  zoom: ZOOM,
}).graphics;
const canvas = gfx.canvas;
const ctx = gfx.ctx;

const keys = Salto.Input.held;
const player = {
  x: 0,
  y: 0,
  w: PLAYER_W,
  h: PLAYER_H,
  vx: 0,
  vy: 0,
  onGround: false,
  coyote: 0,
  jumpBuffer: 0,
  facing: 1,
  riding: null,
  walk: 0,
  land: 0,
};

const stars = Array.from({ length: 56 }, (_, i) => ({
  x: (i * 97) % W,
  y: (i * 53) % 210 + 8,
  r: (i % 3) * 0.45 + 0.55,
  ph: i * 1.7,
}));

const clouds = [
  { x: 80, y: 78, s: 1, speed: 14 },
  { x: 340, y: 120, s: 0.7, speed: 10 },
  { x: 620, y: 64, s: 1.15, speed: 18 },
  { x: 860, y: 140, s: 0.8, speed: 12 },
];

let state = "menu";
let level = null;
let levelIndex = 0;
let time = 0;
let elapsed = 0;
let lives = 3;
let bank = 0;
let intro = 0;
let particles = [];
let audioCtx = null;
let muted = false;
let jumpedOnce = false;
let profile = null;
let nextSync = 0;
let nextPose = 0;
let poseBusy = false;
let lobbyAnchorX = LOBBY.spawn.x;
let emoteUntil = 0;
let mates = [];
let matchBusy = false;
let sampleBusy = false;
let sampleQueued = false;
let nextSample = 0;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function placeCamera(snap) {
  const camera = Salto.Camera.main;
  if (!camera || state === "menu" || !level) return;
  const focus = cameraFocus();
  if (snap) {
    camera.transform.x = focus.x;
    camera.transform.y = focus.y;
    return;
  }
  const ease = 1 - Math.exp(-6 * Salto.Time.deltaTime);
  camera.transform.x += (focus.x - camera.transform.x) * ease;
  camera.transform.y += (focus.y - camera.transform.y) * ease;
}

function cameraFocus() {
  const viewW = W / ZOOM;
  const viewH = H / ZOOM;
  const ahead = player.facing * 110;
  const feet = player.y + player.h;
  return {
    x: clamp(player.x + player.w / 2 - viewW * 0.4 + ahead, 0, Math.max(0, level.w - viewW)),
    y: clamp(feet - viewH * 0.78, 0, 260),
  };
}

function hit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hitCoin(rect, coin) {
  const cx = clamp(coin.x, rect.x, rect.x + rect.w);
  const cy = clamp(coin.y, rect.y, rect.y + rect.h);
  const dx = coin.x - cx;
  const dy = coin.y - cy;
  return dx * dx + dy * dy <= coin.r * coin.r;
}

function pathRound(x, y, w, h, r) {
  gfx.roundRect(x, y, w, h, r);
}

function ensureAudio() {
  if (muted) return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (err) {
    return null;
  }
}

function tone(ctxAudio, freq, dur, type, when, vol) {
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain);
  gain.connect(ctxAudio.destination);
  osc.start(when);
  osc.stop(when + dur);
}

function sfx(kind) {
  const ctxAudio = ensureAudio();
  if (!ctxAudio) return;
  const t = ctxAudio.currentTime;
  if (kind === "jump") tone(ctxAudio, 520, 0.09, "sine", t, 0.05);
  if (kind === "coin") {
    tone(ctxAudio, 880, 0.08, "sine", t, 0.045);
    tone(ctxAudio, 1320, 0.12, "sine", t + 0.07, 0.045);
  }
  if (kind === "hurt") tone(ctxAudio, 150, 0.22, "triangle", t, 0.07);
  if (kind === "win") {
    [523, 659, 784, 1046].forEach((freq, i) => {
      tone(ctxAudio, freq, 0.18, "sine", t + i * 0.09, 0.045);
    });
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 50,
      life: 0.35 + Math.random() * 0.35,
      age: 0,
      color,
      size: 2 + Math.random() * 3,
    });
  }
  if (particles.length > 120) particles.splice(0, particles.length - 120);
}

function placeMover(platform) {
  if (!platform.motion) return;
  const wave = Math.sin(time * platform.motion.speed);
  if (platform.motion.axis === "x") platform.x = platform.baseX + wave * platform.motion.range;
  else platform.y = platform.baseY + wave * platform.motion.range;
  platform.dx = 0;
  platform.dy = 0;
}

function adoptLevel(data) {
  const src = data.level;
  levelIndex = data.levelIndex;
  level = {
    name: src.name,
    w: src.w,
    spawn: src.spawn,
    goal: { ...src.goal },
    platforms: src.platforms.map((platform) => ({
      ...platform,
      dx: 0,
      dy: 0,
      baseX: platform.x,
      baseY: platform.y,
      motion: platform.motion ? { ...platform.motion } : null,
    })),
    coins: src.coins.map((coin) => ({ ...coin, taken: false })),
    spikes: src.spikes.map((spike) => ({ ...spike })),
  };
  level.platforms.forEach(placeMover);
  player.x = src.spawn.x;
  player.y = src.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.riding = null;
  player.land = 0;
  player.facing = 1;
  lives = data.lives;
  bank = data.coins;
  elapsed = data.elapsed;
  intro = 1.8;
  particles = [];
  const camera = Salto.Camera.main;
  if (camera) {
    camera.zoom = ZOOM;
    camera.shake = 0;
  }
  placeCamera(true);
  state = "playing";
  if (profile) {
    profile.level = data.levelIndex;
    profile.coins = data.coins;
    profile.elapsed = data.elapsed;
    profile.completed = Boolean(data.completed);
  }
  applyBodyState();
  renderPresence();
  keys.clear();
  nextSample = 0;
}

async function requestMatch(replay) {
  if (!profile || matchBusy) return;
  matchBusy = true;
  try {
    const response = await fetch("/api/match/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(replay ? { replay: true } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.level) return;
    adoptLevel(data);
  } catch (err) {
    /* a partida só abre com o servidor no ar */
  } finally {
    matchBusy = false;
  }
}

function enterLobby() {
  level = {
    name: LOBBY.name,
    w: LOBBY.w,
    spawn: { ...LOBBY.spawn },
    goal: { ...LOBBY.goal },
    platforms: LOBBY.platforms.map((platform) => ({
      ...platform,
      dx: 0,
      dy: 0,
      baseX: platform.x,
      baseY: platform.y,
      motion: null,
    })),
    coins: [],
    spikes: [],
  };
  player.x = lobbyAnchorX;
  player.y = LOBBY.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.riding = null;
  player.land = 0;
  const camera = Salto.Camera.main;
  if (camera) camera.zoom = ZOOM;
  placeCamera(true);
  keys.clear();
  state = "lobby";
  applyBodyState();
  renderPresence();
}

function leaveMatch() {
  if (!profile || state === "lobby" || state === "menu") return;
  fetch("/api/match/leave", { method: "POST" }).catch(() => {}).finally(() => enterLobby());
}

function startGame() {
  if (!profile) return;
  requestMatch(Boolean(profile.completed));
}

function continueGame() {
  if (!profile || panelsOpen() || state === "lobby") return;
  if (state === "cleared" || state === "gameover") {
    requestMatch(false);
    return;
  }
  if (state === "victory") showSave();
}

function hurtJuice() {
  sfx("hurt");
  const camera = Salto.Camera.main;
  if (camera) camera.shake = 14;
  burst(player.x + player.w / 2, player.y + player.h / 2, "#ffb4a2", 14);
}

function markCoins(indexes) {
  if (!level || !Array.isArray(indexes)) return;
  for (const index of indexes) {
    const coin = level.coins[index];
    if (!coin || coin.taken) continue;
    coin.taken = true;
    burst(coin.x, coin.y, "#f2c14e", 10);
    sfx("coin");
  }
}

function applyVerdict(data) {
  if (!profile || !data) return;
  if (typeof data.lives === "number") lives = data.lives;
  if (typeof data.coins === "number") {
    bank = data.coins;
    profile.coins = data.coins;
  }
  if (data.event === "clear") {
    if (typeof data.elapsed === "number") {
      elapsed = data.elapsed;
      profile.elapsed = data.elapsed;
    }
    if (typeof data.level === "number") profile.level = data.level;
    profile.completed = Boolean(data.completed);
    markCoins(data.coinIndexes);
    burst(level.goal.x + 16, level.goal.y + 20, "#f2c14e", 18);
    sfx("win");
    if (profile.completed) {
      state = "victory";
      showSave();
    } else {
      state = "cleared";
      applyBodyState();
    }
    renderPresence();
    return;
  }
  if (data.event === "kick") {
    enterLobby();
    return;
  }
  if (data.event === "snap") {
    player.x = data.x;
    player.y = data.y;
    player.vx = 0;
    player.vy = 0;
    return;
  }
  if (data.event === "coin") {
    markCoins(data.coinIndexes);
    return;
  }
  if (data.event === "dead") {
    hurtJuice();
    player.x = data.x;
    player.y = data.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.riding = null;
    placeCamera(true);
    return;
  }
  if (data.event === "retry") {
    hurtJuice();
    if (level) level.coins.forEach((coin) => { coin.taken = false; });
    player.x = data.x;
    player.y = data.y;
    player.vx = 0;
    player.vy = 0;
    state = "gameover";
    applyBodyState();
  }
}

function reportSample(force) {
  if (state !== "playing" || !level) return;
  const now = performance.now();
  if (!force && now < nextSample) return;
  if (sampleBusy) {
    if (force) sampleQueued = true;
    return;
  }
  sampleBusy = true;
  nextSample = now + 80;
  fetch("/api/match/sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: player.x, y: player.y }),
  }).then(async (response) => {
    if (response.status === 409) {
      requestMatch(false);
      return null;
    }
    return response.ok ? response.json() : null;
  }).then((data) => {
    if (data) applyVerdict(data);
  }).catch(() => {}).finally(() => {
    sampleBusy = false;
    if (sampleQueued && state === "playing") {
      sampleQueued = false;
      reportSample(true);
    }
  });
}

function updateMovers() {
  for (const platform of level.platforms) {
    if (!platform.motion) {
      platform.dx = 0;
      platform.dy = 0;
      continue;
    }
    const prevX = platform.x;
    const prevY = platform.y;
    const wave = Math.sin(time * platform.motion.speed);
    if (platform.motion.axis === "x") platform.x = platform.baseX + wave * platform.motion.range;
    else platform.y = platform.baseY + wave * platform.motion.range;
    platform.dx = platform.x - prevX;
    platform.dy = platform.y - prevY;
  }
}

function updatePlay(dt) {
  const left = keys.has("ArrowLeft") || keys.has("KeyA") || keys.has("left");
  const right = keys.has("ArrowRight") || keys.has("KeyD") || keys.has("right");
  const jumpHeld = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || keys.has("jump");
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  const wasOnGround = player.onGround;

  if (jumpHeld) player.jumpBuffer = TUNE.jumpBuffer;
  else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

  if (dir !== 0) {
    player.facing = dir;
    const accel = (player.onGround ? TUNE.accel : TUNE.airAccel) * dt;
    player.vx = clamp(player.vx + dir * accel, -TUNE.speed, TUNE.speed);
  } else {
    const friction = (player.onGround ? TUNE.friction : TUNE.airFriction) * dt;
    if (Math.abs(player.vx) <= friction) player.vx = 0;
    else player.vx -= Math.sign(player.vx) * friction;
  }
  player.vx = clamp(player.vx, -TUNE.speed, TUNE.speed);

  updateMovers();

  const prevX = player.x;
  const prevY = player.y;
  const carried = player.riding;
  if (player.riding) {
    player.x += player.riding.dx;
    player.y += player.riding.dy;
  }

  let jumped = false;
  if (player.jumpBuffer > 0 && (player.onGround || player.coyote > 0)) {
    player.vy = TUNE.jump;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.riding = null;
    player.land = 0;
    jumped = true;
    jumpedOnce = true;
    sfx("jump");
  }

  const gravityScale = !jumpHeld && player.vy < 0 ? TUNE.shortHop : 1;
  player.vy = Math.min(TUNE.maxFall, player.vy + TUNE.gravity * gravityScale * dt);

  player.x += player.vx * dt;
  for (const platform of level.platforms) {
    if (player.y + player.h <= platform.y + 4) continue;
    if (!hit(player, platform)) continue;
    if (prevX + player.w <= platform.x + 0.5) {
      player.x = platform.x - player.w;
      player.vx = Math.min(0, player.vx);
    } else if (prevX >= platform.x + platform.w - 0.5) {
      player.x = platform.x + platform.w;
      player.vx = Math.max(0, player.vx);
    }
  }

  player.y += player.vy * dt;
  player.onGround = false;
  const mid = player.x + player.w / 2;
  const landings = [];
  for (const platform of level.platforms) {
    if (!hit(player, platform)) continue;
    if (player.vy >= 0 && prevY + player.h <= platform.y + 4) {
      landings.push(platform);
    } else if (player.vy < 0 && prevY >= platform.y + platform.h - 4) {
      player.y = platform.y + platform.h;
      player.vy = 20;
    }
  }

  let support = null;
  if (landings.length) {
    landings.sort((a, b) => a.y - b.y);
    const surface = landings.filter((platform) => platform.y <= landings[0].y + 4);
    player.y = surface[0].y - player.h;
    player.vy = 0;
    player.onGround = true;
    const contains = (platform) => mid >= platform.x && mid <= platform.x + platform.w;
    const underFeet = surface.filter(contains);
    const pool = underFeet.length ? underFeet : surface;
    const stick = !jumped && carried && pool.includes(carried) ? carried : null;
    if (stick) support = stick;
    else {
      const grounded = pool.filter((platform) => !platform.motion);
      const pickFrom = grounded.length ? grounded : pool;
      support = pickFrom.reduce((best, platform) => {
        const dist = Math.abs(mid - (platform.x + platform.w / 2));
        const bestDist = Math.abs(mid - (best.x + best.w / 2));
        return dist < bestDist ? platform : best;
      });
    }
  }
  player.riding = support;

  if (player.onGround) player.coyote = TUNE.coyote;
  else player.coyote -= dt;

  if (player.onGround && !wasOnGround) player.land = 0.1;
  if (player.land > 0) player.land -= dt;
  if (player.onGround && Math.abs(player.vx) > 30) player.walk += dt * 14;

  if (player.onGround && Math.abs(player.vx) > 80 && Math.random() < dt * 18) {
    burst(player.x + player.w / 2, player.y + player.h, "#c4a574", 1);
  }

  if (state === "lobby") {
    player.x = clamp(player.x, 8, level.w - player.w - 8);
    lobbyAnchorX = player.x;
    if (player.y > 720) {
      player.x = LOBBY.spawn.x;
      player.y = LOBBY.spawn.y;
      player.vx = 0;
      player.vy = 0;
      lobbyAnchorX = player.x;
    }
    return;
  }

  if (player.y > 720 || level.spikes.some((spike) => hit(player, spike)) || hit(player, level.goal)) {
    reportSample(true);
    return;
  }

  reportSample(false);
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.age += dt;
    particle.vy += 420 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
  particles = particles.filter((particle) => particle.age < particle.life);
}

function update(dt) {
  time += dt;
  if (intro > 0) intro -= dt;
  updateParticles(dt);
  if (state === "playing" || state === "lobby") {
    if (state === "playing") elapsed += dt;
    updatePlay(dt);
  }
  if (state === "lobby") {
    for (const mate of mates) {
      if (mate.drawX == null) mate.drawX = mate.x;
      if (mate.drawY == null) mate.drawY = mate.y;
      const moved = Math.abs(mate.x - mate.drawX) > 0.6;
      mate.drawX += (mate.x - mate.drawX) * 0.28;
      mate.drawY += (mate.y - mate.drawY) * 0.28;
      if (moved) mate.walk = (mate.walk || 0) + dt * 14;
    }
  }
  if (state !== "menu" && level) placeCamera(false);
}

function text(str, x, y, size, color, align = "center", weight = 700) {
  gfx.text(str, x, y, size, color, align, weight);
}

function textShadow(str, x, y, size, color, align = "center") {
  gfx.textShadow(str, x, y, size, color, align);
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#14182e");
  sky.addColorStop(0.45, "#3d5a80");
  sky.addColorStop(0.72, "#ee9b6a");
  sky.addColorStop(0.8, "#7d4e3a");
  sky.addColorStop(1, "#1a1014");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffe8a3";
  ctx.beginPath();
  ctx.arc(W - 150, 118, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 232, 163, 0.18)";
  ctx.beginPath();
  ctx.arc(W - 150, 118, 58, 0, Math.PI * 2);
  ctx.fill();

  for (const star of stars) {
    ctx.globalAlpha = 0.35 + Math.sin(time * 2 + star.ph) * 0.25;
    ctx.fillStyle = "#fff6e8";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const cloud of clouds) {
    const x = ((cloud.x + time * cloud.speed) % (W + 220)) - 110;
    if (state === "menu" && x > 250 && x < 710) continue;
    drawCloud(x, cloud.y, cloud.s);
  }

  drawHills("#2e3d66", 28, 292, 0.15, 0.008);
  drawHills("#243f45", 22, 338, 0.32, 0.012);
}

function drawCloud(x, y, scale) {
  ctx.fillStyle = "rgba(255, 246, 232, 0.82)";
  ctx.beginPath();
  ctx.ellipse(x, y, 34 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 24 * scale, y + 6 * scale, 26 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 22 * scale, y + 6 * scale, 22 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHills(color, amplitude, base, parallax, freq) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const offset = gfx.camera.x * parallax;
  for (let x = 0; x <= W; x += 10) {
    const y = base
      + Math.sin((x + offset) * freq) * amplitude
      + Math.sin((x + offset) * freq * 2.3 + 1) * amplitude * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawPlatform(platform) {
  const { x, y, w, h } = platform;
  if (platform.motion) {
    ctx.fillStyle = "#c47b32";
    pathRound(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = "#f2c14e";
    for (let stripe = 8; stripe < w - 8; stripe += 18) {
      ctx.fillRect(x + stripe, y + 7, 8, h - 14);
    }
    return;
  }

  if (h > 80) {
    ctx.fillStyle = "#6b4634";
    pathRound(x, y + 12, w, h - 12, 8);
    ctx.fill();
    ctx.fillStyle = "#7dce6a";
    pathRound(x, y, w, 18, 8);
    ctx.fill();
    ctx.fillStyle = "#5eaa4e";
    ctx.fillRect(x, y + 12, w, 8);
    ctx.strokeStyle = "#3f8f3a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let blade = x + 8; blade < x + w - 6; blade += 14) {
      const height = 5 + ((blade * 17) % 6);
      ctx.beginPath();
      ctx.moveTo(blade, y + 4);
      ctx.lineTo(blade + 2, y - height);
      ctx.stroke();
    }
    return;
  }

  ctx.fillStyle = "#6d788a";
  pathRound(x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = "#aeb8c8";
  pathRound(x + 4, y + 4, w - 8, 8, 4);
  ctx.fill();
}

function drawSpikes(spike) {
  ctx.fillStyle = "#d4513a";
  const count = Math.max(1, Math.floor(spike.w / 14));
  for (let i = 0; i < count; i += 1) {
    const x = spike.x + i * 14;
    ctx.beginPath();
    ctx.moveTo(x + 1, spike.y + spike.h);
    ctx.lineTo(x + 7, spike.y);
    ctx.lineTo(x + 13, spike.y + spike.h);
    ctx.fill();
  }
}

function drawCoin(coin, index) {
  if (coin.taken) return;
  const squash = 0.35 + Math.abs(Math.sin(time * 4 + index)) * 0.65;
  const bob = Math.sin(time * 3 + index) * 3;
  ctx.save();
  ctx.translate(coin.x, coin.y + bob);
  ctx.scale(squash, 1);
  ctx.fillStyle = "#e0a52e";
  ctx.beginPath();
  ctx.arc(0, 0, coin.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(0, 0, coin.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(-2, -3, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFlag(goal) {
  ctx.fillStyle = "#f4f1de";
  ctx.fillRect(goal.x + 6, goal.y, 4, goal.h);
  ctx.fillStyle = "#e76f51";
  const wave = Math.sin(time * 6) * 4;
  ctx.beginPath();
  ctx.moveTo(goal.x + 10, goal.y + 6);
  ctx.quadraticCurveTo(goal.x + 28, goal.y + 14 + wave, goal.x + 38, goal.y + 12);
  ctx.lineTo(goal.x + 34, goal.y + 24);
  ctx.quadraticCurveTo(goal.x + 22, goal.y + 22 + wave, goal.x + 10, goal.y + 28);
  ctx.fill();
  ctx.fillStyle = "#c9a227";
  ctx.beginPath();
  ctx.arc(goal.x + 8, goal.y + goal.h, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawFox(x, y, pose) {
  const facing = pose.facing ?? 1;
  const walk = pose.walk ?? 0;
  const vy = pose.vy ?? 0;
  const onGround = pose.onGround ?? true;
  const land = pose.land ?? 0;
  let sx = 1;
  let sy = 1;
  if (!onGround) {
    const stretch = clamp(vy / 900, -1, 1);
    sy = 1 - stretch * 0.15;
    sx = 1 + stretch * 0.1;
  }
  if (land > 0) {
    const squash = land / 0.1;
    sy *= 1 - 0.18 * squash;
    sx *= 1 + 0.14 * squash;
  }

  ctx.save();
  ctx.translate(x + PLAYER_W / 2, y + PLAYER_H / 2);
  ctx.scale(facing * sx, sy);

  ctx.fillStyle = "#e8873a";
  ctx.beginPath();
  ctx.ellipse(-16, 6, 8, 5, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6e8";
  ctx.beginPath();
  ctx.ellipse(-22, 3, 3.5, 3, -0.7, 0, Math.PI * 2);
  ctx.fill();

  const swing = onGround ? Math.sin(walk) * 0.55 : 0.25;
  const drawLeg = (lx, angle) => {
    ctx.save();
    ctx.translate(lx, 10);
    ctx.rotate(angle);
    ctx.fillStyle = "#c46a28";
    pathRound(-3, 0, 6, 11, 3);
    ctx.fill();
    ctx.restore();
  };
  drawLeg(-6, swing);
  drawLeg(5, -swing);

  ctx.fillStyle = "#e8873a";
  ctx.beginPath();
  ctx.ellipse(0, 6, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6d7a8";
  ctx.beginPath();
  ctx.ellipse(3, 9, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d64b4b";
  ctx.beginPath();
  ctx.ellipse(6, 2, 8, 3.4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8873a";
  ctx.beginPath();
  ctx.arc(8, -4, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(1, -10);
  ctx.lineTo(5, -22);
  ctx.lineTo(11, -8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -12);
  ctx.lineTo(16, -23);
  ctx.lineTo(18, -8);
  ctx.fill();
  ctx.fillStyle = "#f0a07a";
  ctx.beginPath();
  ctx.moveTo(4, -12);
  ctx.lineTo(6, -18);
  ctx.lineTo(9, -11);
  ctx.fill();

  ctx.fillStyle = "#fff6e8";
  ctx.beginPath();
  ctx.ellipse(15, -1, 6, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3d2914";
  ctx.beginPath();
  ctx.arc(18, -2, 1.6, 0, Math.PI * 2);
  ctx.fill();

  const blink = Math.sin(time * 1.7) > 0.97;
  ctx.fillStyle = "#2b2118";
  if (blink) {
    ctx.fillRect(10, -6, 5, 1.4);
  } else {
    ctx.beginPath();
    ctx.ellipse(12, -6, 1.7, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(12.5, -6.6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHeart(x, y, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-10, -6, -2, -12, 0, -6);
  ctx.bezierCurveTo(2, -12, 10, -6, 0, 3);
  ctx.fillStyle = filled ? "#e85d4c" : "rgba(255,255,255,0.28)";
  ctx.fill();
  ctx.restore();
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function visibleFrame() {
  return gfx.visibleFrame();
}

function drawHud() {
  const frame = visibleFrame();
  const barX = frame.left + 16;
  const barY = frame.top + 14;
  const barW = Math.max(280, frame.right - frame.left - 32);
  ctx.fillStyle = "rgba(10, 12, 24, 0.38)";
  pathRound(barX, barY, barW, 46, 14);
  ctx.fill();

  for (let i = 0; i < 3; i += 1) drawHeart(barX + 24 + i * 28, barY + 23, i < lives);

  text(level.name, barX + barW / 2, barY + 23, 18, "#fff6e8");

  const got = level.coins.filter((coin) => coin.taken).length;
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(barX + barW - 102, barY + 23, 8, 0, Math.PI * 2);
  ctx.fill();
  text(`${got}/${level.coins.length}`, barX + barW - 84, barY + 23, 18, "#fff6e8", "left");

  if (levelIndex === 0 && elapsed < 8 && state === "playing") {
    textShadow("Setas ou A/D · segure espaço para pular mais alto", (frame.left + frame.right) / 2, frame.bottom - 64, 16, "#fff6e8");
  }

  if (intro > 0 && state === "playing") {
    ctx.globalAlpha = Math.min(1, intro / 0.45);
    textShadow(level.name, (frame.left + frame.right) / 2, frame.top + 112, 34, "#fff6e8");
    textShadow(`Fase ${levelIndex + 1} de ${levelCount}`, (frame.left + frame.right) / 2, frame.top + 150, 16, "#ffe8c8");
    ctx.globalAlpha = 1;
  }
}

function drawCard(title, lines, hint) {
  ctx.fillStyle = "rgba(8, 10, 20, 0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 248, 235, 0.96)";
  pathRound(W / 2 - 270, H / 2 - 150, 540, 300, 22);
  ctx.fill();
  text(title, W / 2, H / 2 - 86, 36, "#2b2118");
  lines.forEach((line, index) => {
    text(line, W / 2, H / 2 - 24 + index * 32, 20, "#5c4a3a", "center", 600);
  });
  const pulse = 0.72 + Math.sin(time * 3) * 0.28;
  ctx.globalAlpha = pulse;
  text(hint, W / 2, H / 2 + 96, 16, "#9a3412");
  ctx.globalAlpha = 1;
}

function drawWorld() {
  gfx.screen(drawSky);
  gfx.world(() => {
  for (const platform of level.platforms) drawPlatform(platform);
  for (const spike of level.spikes) drawSpikes(spike);
  level.coins.forEach(drawCoin);
  drawFlag(level.goal);
  if (levelIndex === 0 && !jumpedOnce && state === "playing") {
    textShadow("espaço", player.x + player.w / 2, player.y - 16, 11, "#fff6e8");
  }
  if (levelIndex === 1 && player.x < 980) {
    textShadow("segure espaço", 760, 310, 12, "#fff6e8");
  }
  if (levelIndex === 2 && player.x < 520) {
    textShadow("pule", 330, 400, 12, "#fff6e8");
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  const air = player.onGround ? 1 : 0.55;
  ctx.ellipse(player.x + player.w / 2, player.y + player.h + 2, 12 * air, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  drawFox(player.x, player.y, player);

  for (const particle of particles) {
    ctx.globalAlpha = 1 - particle.age / particle.life;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
  });

  gfx.screen(() => {
  if (gfx.camera.shake > 2) {
    ctx.fillStyle = `rgba(180, 32, 40, ${gfx.camera.shake / 48})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawHud();

  if (state === "cleared") {
    const got = level.coins.filter((coin) => coin.taken).length;
    drawCard("Fase concluída", [
      "A bandeira desta fase é sua.",
      `Moedas: ${got}/${level.coins.length}`,
    ], "Enter ou clique para continuar");
  } else if (state === "gameover") {
    drawCard("Sem vidas", [
      "O raposo não chegou na bandeira.",
      "A fase recomeça com 3 vidas.",
    ], "Enter ou clique para tentar de novo");
  }
  });
}

function drawName(x, y, name, sub, waving) {
  if (waving) textShadow("oi!", x + PLAYER_W / 2, y - 46, 12, "#f2c14e");
  textShadow(name, x + PLAYER_W / 2, y - 30, 11, "#fff6e8");
  if (sub) textShadow(sub, x + PLAYER_W / 2, y - 16, 8, "#ffe8c8");
}

function drawLobby() {
  gfx.screen(drawSky);
  gfx.world(() => {
  for (const platform of level.platforms) drawPlatform(platform);

  ctx.fillStyle = "#6b4423";
  ctx.fillRect(616, 392, 8, 58);
  ctx.fillStyle = "#c4a574";
  pathRound(572, 322, 96, 68, 8);
  ctx.fill();
  text("SALTO", 620, 346, 13, "#3d2914");
  text("20 fases", 620, 366, 8, "#5c4a3a", "center", 600);

  const nearSign = Math.abs(player.x + player.w / 2 - 620) < 90;
  if (nearSign) {
    textShadow("A bandeira de cada fase abre a próxima.", 620, 300, 8, "#fff6e8");
  }

  const flame = 6 + Math.sin(time * 10) * 2;
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(1388, 438, 28, 8);
  ctx.fillStyle = "#e07a3d";
  ctx.beginPath();
  ctx.arc(1402, 434, flame, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(1402, 430, flame * 0.55, 0, Math.PI * 2);
  ctx.fill();

  drawFlag({ x: 1880, y: 300, w: 36, h: 70 });
  textShadow("praça", 1888, 286, 10, "#fff6e8");

  const drawActor = (x, y, pose, name, sub, waving) => {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(x + PLAYER_W / 2, y + PLAYER_H + 2, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFox(x, y, pose);
    drawName(x, y, name, sub, waving);
  };

  for (const mate of mates) {
    drawActor(
      mate.drawX ?? mate.x,
      mate.drawY ?? mate.y,
      {
        facing: mate.facing || 1,
        walk: mate.walk || 0,
        vy: 0,
        onGround: (mate.drawY ?? mate.y) > 360,
        land: 0,
      },
      mate.nick,
      mate.country,
      mate.emote
    );
  }

  drawActor(
    player.x,
    player.y,
    player,
    profile ? profile.nick : "",
    profile ? profile.country : "",
    performance.now() < emoteUntil
  );
  });
}

function drawMenu() {
  drawSky();
  drawPlatform({ x: 160, y: 400, w: 640, h: 180 });
  drawCoin({ x: 470, y: 348, r: 12, taken: false }, 1);
  drawCoin({ x: 530, y: 332, r: 12, taken: false }, 2);
  drawFlag({ x: 700, y: 330, w: 36, h: 70 });
  const idle = Math.sin(time * 2) * 0.15;
  drawFox(250, 360, { facing: 1, walk: time * 2, vy: 0, onGround: true, land: idle > 0.1 ? 0 : 0 });

  textShadow("Salto", W / 2, 86, 68, "#fff6e8");
  textShadow(profile ? `${profile.nick} · ${profile.country}` : "Vinte fases até a última bandeira.", W / 2, 148, 22, "#fff6e8");
  const progressLine = !profile
    ? "Entre com apelido e país para começar."
    : profile.completed
      ? "As 20 fases estão concluídas."
      : profile.level > 0
        ? `Continuar na fase ${profile.level + 1} de ${levelCount}.`
        : `Fase 1 de ${levelCount}.`;
  textShadow(progressLine, W / 2, 182, 18, "#ffe8c8");
  textShadow("Setas ou A/D · Espaço pula · segure para ir mais alto", W / 2, 214, 16, "#ffe8c8");

  const pulse = 0.45 + Math.sin(time * 3) * 0.55;
  ctx.globalAlpha = 0.35 + pulse * 0.65;
  const startLine = !profile
    ? ""
    : profile.completed
      ? "Enter para jogar de novo"
      : profile.level > 0
        ? "Enter para continuar"
        : "Enter ou clique para jogar";
  if (startLine) textShadow(startLine, W / 2, 292, 20, "#fff6e8");
  ctx.globalAlpha = 1;
}

function draw() {
  if (state === "menu") gfx.screen(drawMenu);
  else if (state === "lobby") drawLobby();
  else drawWorld();
}

function holdButton(button, code) {
  const down = (event) => {
    event.preventDefault();
    Salto.Input.setHeld(code, true);
  };
  const up = (event) => {
    event.preventDefault();
    Salto.Input.setHeld(code, false);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

window.addEventListener("blur", () => {
  Salto.Input.clear();
});

canvas.addEventListener("pointerdown", () => {
  if (panelsOpen()) return;
  if (state === "cleared" || state === "gameover") continueGame();
});

holdButton(document.getElementById("btn-left"), "left");
holdButton(document.getElementById("btn-right"), "right");
holdButton(document.getElementById("btn-jump"), "jump");

function panelsOpen() {
  const gate = document.getElementById("gate");
  const save = document.getElementById("save");
  return Boolean((gate && !gate.hidden) || (save && !save.hidden));
}

function applyBodyState() {
  const gate = document.getElementById("gate");
  const save = document.getElementById("save");
  if (!profile || (gate && !gate.hidden)) {
    document.body.dataset.state = "gate";
    return;
  }
  if (save && !save.hidden) {
    document.body.dataset.state = "save";
    return;
  }
  document.body.dataset.state = state;
}

function renderPresence() {
  if (!profile) return;
  const phase = profile.completed ? `${levelCount} fases concluídas` : `Fase ${profile.level + 1} de ${levelCount}`;
  document.getElementById("lobby-nick").textContent = profile.nick;
  document.getElementById("lobby-meta").textContent = profile.country;
  document.getElementById("lobby-phase").textContent = `${phase} · ${profile.coins || 0} moedas`;
  const play = document.getElementById("play-btn");
  if (profile.completed) play.textContent = "JOGAR DE NOVO";
  else if (profile.level > 0) play.textContent = "CONTINUAR";
  else play.textContent = "JOGAR";
  const saveBtn = document.getElementById("open-save");
  if (saveBtn) saveBtn.hidden = !(profile.completed && !profile.saved);
}

function renderSquad(people) {
  const list = document.getElementById("squad-list");
  if (!list) return;
  list.replaceChildren();
  if (!people.length) {
    const item = document.createElement("li");
    item.textContent = "Só você por aqui.";
    list.appendChild(item);
    return;
  }
  for (const person of people) {
    const item = document.createElement("li");
    item.textContent = `${person.nick} · ${person.country}`;
    const detail = document.createElement("small");
    if (person.inMatch) detail.textContent = `Em partida · fase ${person.level + 1}`;
    else if (person.completed) detail.textContent = "Concluiu as fases";
    else detail.textContent = "No lobby";
    item.appendChild(detail);
    list.appendChild(item);
  }
}

function inMatchNow() {
  return state === "playing" || state === "cleared" || state === "gameover" || state === "victory";
}

function pushPose() {
  if (!profile || poseBusy) return;
  poseBusy = true;
  fetch("/api/lobby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x: state === "lobby" ? player.x : lobbyAnchorX,
      y: state === "lobby" ? player.y : LOBBY.spawn.y,
      facing: player.facing,
      emote: performance.now() < emoteUntil,
      inMatch: inMatchNow(),
    }),
  }).then((response) => (response.ok ? response.json() : null)).then((data) => {
    if (!data) return;
    const self = data.players.find((person) => person.self);
    if (self && state === "lobby" && Math.hypot(self.x - player.x, self.y - player.y) > 80) {
      player.x = self.x;
      player.y = self.y;
      player.vx = 0;
      player.vy = 0;
      lobbyAnchorX = player.x;
    }
    const others = data.players.filter((person) => !person.self);
    const walking = others.filter((person) => !person.inMatch);
    for (const person of walking) {
      const prev = mates.find((mate) => mate.nick === person.nick && mate.country === person.country);
      person.drawX = prev ? prev.drawX : person.x;
      person.drawY = prev ? prev.drawY : person.y;
      person.walk = prev ? prev.walk : 0;
    }
    mates = walking;
    renderSquad(others);
  }).catch(() => {}).finally(() => {
    poseBusy = false;
  });
}

async function refreshOnline() {
  if (!profile) return;
  try {
    const response = await fetch("/api/online");
    if (!response.ok) return;
    const data = await response.json();
    renderSquad(data.players.filter((person) => !person.self));
  } catch (err) {
    /* o servidor local pode estar fora do ar */
  }
}

function syncProgress() {
  if (!profile) return Promise.resolve();
  return fetch("/api/session/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then((response) => (response.ok ? response.json() : null)).then((data) => {
    if (!data) return;
    profile.saved = data.saved;
    profile.accountUsername = data.accountUsername;
    profile.level = data.level;
    profile.coins = data.coins;
    profile.elapsed = data.elapsed;
    profile.completed = Boolean(data.completed);
    if (state === "lobby") {
      bank = data.coins;
      elapsed = data.elapsed;
    }
    renderPresence();
  }).catch(() => {});
}

function showSave() {
  const save = document.getElementById("save");
  document.getElementById("save-stats").textContent = `Moedas: ${bank} de ${TOTAL_COINS}. Tempo: ${formatTime(elapsed)}.`;
  document.getElementById("save-error").textContent = "";
  const done = document.getElementById("save-done");
  done.hidden = !(profile && profile.saved);
  if (profile && profile.saved) done.textContent = `Já existe um recorde na conta ${profile.accountUsername}. A senha atualiza esse resultado.`;
  save.hidden = false;
  applyBodyState();
  renderPresence();
}

function closeSave() {
  document.getElementById("save").hidden = true;
  enterLobby();
}

async function bootSession() {
  const gate = document.getElementById("gate");
  const error = document.getElementById("gate-error");
  const select = document.querySelector("#gate-form select");
  try {
    const metaResponse = await fetch("/api/meta");
    if (!metaResponse.ok) throw new Error("sem servidor");
    const meta = await metaResponse.json();
    levelCount = meta.levels || levelCount;
    TOTAL_COINS = meta.totalCoins || 0;
    select.innerHTML = meta.countries.map((country) => `<option value="${country}">${country}</option>`).join("");
    const response = await fetch("/api/session");
    if (response.ok) {
      profile = await response.json();
      gate.hidden = true;
      enterLobby();
      refreshOnline();
    }
  } catch (err) {
    error.textContent = "Inicie o servidor local com: node server.js";
  }
  applyBodyState();
}

document.getElementById("gate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("gate-error");
  error.textContent = "";
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nick: event.target.nick.value,
      country: event.target.country.value,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.textContent = data.error || "Não foi possível entrar.";
    return;
  }
  profile = data;
  document.getElementById("gate").hidden = true;
  enterLobby();
  refreshOnline();
});

document.getElementById("save-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("save-error");
  error.textContent = "";
  const response = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: event.target.username.value,
      password: event.target.password.value,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.textContent = data.error || "Não salvou.";
    return;
  }
  profile.saved = true;
  profile.accountUsername = data.account.username;
  const done = document.getElementById("save-done");
  done.hidden = false;
  done.textContent = "Progresso salvo neste computador.";
  renderPresence();
});

document.getElementById("save-skip").addEventListener("click", closeSave);
document.getElementById("open-save").addEventListener("click", showSave);
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  profile = null;
  mates = [];
  state = "menu";
  document.getElementById("save").hidden = true;
  document.getElementById("gate").hidden = false;
  applyBodyState();
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  document.exitFullscreen().catch(() => {});
}

function syncFullscreenLabel() {
  const label = document.fullscreenElement ? "Janela" : "Tela cheia";
  for (const id of ["fullscreen", "fullscreen-match"]) {
    const button = document.getElementById(id);
    if (button) button.textContent = label;
  }
}

document.getElementById("fullscreen").addEventListener("click", toggleFullscreen);
document.getElementById("fullscreen-match").addEventListener("click", toggleFullscreen);
document.getElementById("play-btn").addEventListener("click", () => {
  document.getElementById("play-btn").blur();
  startGame();
});
document.getElementById("back-lobby").addEventListener("click", leaveMatch);
document.addEventListener("fullscreenchange", () => {
  syncFullscreenLabel();
  gfx.resize();
});

setInterval(refreshOnline, 4000);

class GameDirector extends Salto.Behaviour {
  update() {
    update(Salto.Time.deltaTime);
    const now = performance.now();
    if (profile && document.getElementById("gate").hidden && now > nextPose) {
      nextPose = now + 150;
      pushPose();
    }
    if (profile && now > nextSync) {
      nextSync = now + 4000;
      syncProgress();
    }
    if ((Salto.Input.getKeyDown("Enter") || Salto.Input.getKeyDown("Space")) && (state === "cleared" || state === "gameover" || state === "victory")) {
      continueGame();
    }
    if (Salto.Input.getKeyDown("KeyE") && state === "lobby") emoteUntil = performance.now() + 1600;
    if (Salto.Input.getKeyDown("KeyF")) toggleFullscreen();
    if (Salto.Input.getKeyDown("KeyR") && state === "playing") requestMatch(false);
    if (Salto.Input.getKeyDown("KeyM")) muted = !muted;
  }

  onRender() {
    draw();
  }
}

Salto.Input.gate = (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return false;
  return !panelsOpen();
};

const scene = new Salto.Scene("Salto");
const director = new Salto.GameObject("Diretor");
director.tag = "Director";
director.addComponent(GameDirector);
scene.add(director);

const cameraObject = new Salto.GameObject("Câmera");
cameraObject.tag = "MainCamera";
const mainCamera = cameraObject.addComponent(Salto.Camera);
mainCamera.zoom = ZOOM;
scene.add(cameraObject);
Salto.Scene.active = scene;
for (const component of scene.behaviours()) Salto._syncComponent(component);

bootSession();
Salto.Application.run();
