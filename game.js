// Salto — platformer de três fases.
// Para criar outra fase, copie um item de LEVELS e ajuste os números.
// x cresce para a direita. y cresce para baixo. O chão fica em y = 450.
// O raposo tem 40px de altura: o spawn.y é o topo da plataforma menos 40.

const W = 960;
const H = 540;
const ZOOM = 2;
const PLAYER_W = 30;
const PLAYER_H = 40;

const TUNE = {
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
};

const LEVELS = [
  {
    name: "Primeiros passos",
    w: 2500,
    spawn: { x: 70, y: 410 },
    goal: { x: 2340, y: 380, w: 36, h: 70 },
    platforms: [
      { x: 0, y: 450, w: 520, h: 200 },
      { x: 640, y: 450, w: 300, h: 200 },
      { x: 1060, y: 410, w: 250, h: 220 },
      { x: 1430, y: 370, w: 240, h: 260 },
      { x: 1790, y: 420, w: 210, h: 220 },
      { x: 2120, y: 450, w: 380, h: 200 },
    ],
    coins: [
      { x: 260, y: 418, r: 12 },
      { x: 760, y: 418, r: 12 },
      { x: 1160, y: 378, r: 12 },
      { x: 1520, y: 278, r: 12 },
      { x: 1860, y: 388, r: 12 },
      { x: 2280, y: 418, r: 12 },
    ],
    spikes: [],
  },
  {
    name: "O vão",
    w: 2900,
    spawn: { x: 64, y: 410 },
    goal: { x: 2760, y: 280, w: 36, h: 70 },
    platforms: [
      { x: 0, y: 450, w: 420, h: 200 },
      { x: 540, y: 400, w: 170, h: 36 },
      { x: 850, y: 340, w: 160, h: 36 },
      { x: 1160, y: 400, w: 170, h: 36 },
      { x: 1465, y: 450, w: 380, h: 200 },
      { x: 1960, y: 400, w: 180, h: 36 },
      { x: 2260, y: 350, w: 170, h: 36 },
      { x: 2550, y: 350, w: 350, h: 200 },
    ],
    coins: [
      { x: 250, y: 400, r: 12 },
      { x: 920, y: 280, r: 12 },
      { x: 1660, y: 390, r: 12 },
      { x: 2040, y: 360, r: 12 },
      { x: 2340, y: 310, r: 12 },
      { x: 2720, y: 308, r: 12 },
    ],
    spikes: [],
  },
  {
    name: "Espinhos",
    w: 3000,
    spawn: { x: 64, y: 410 },
    goal: { x: 2860, y: 260, w: 36, h: 70 },
    platforms: [
      { x: 0, y: 450, w: 520, h: 200 },
      { x: 600, y: 450, w: 150, h: 32, motion: { axis: "x", range: 160, speed: 1.05 } },
      { x: 860, y: 450, w: 300, h: 200 },
      { x: 1260, y: 450, w: 620, h: 200 },
      { x: 2010, y: 390, w: 200, h: 40 },
      { x: 2340, y: 330, w: 180, h: 40 },
      { x: 2660, y: 330, w: 340, h: 200 },
    ],
    coins: [
      { x: 420, y: 370, r: 12 },
      { x: 700, y: 420, r: 12 },
      { x: 980, y: 418, r: 12 },
      { x: 1510, y: 370, r: 12 },
      { x: 2100, y: 350, r: 12 },
      { x: 2800, y: 290, r: 12 },
    ],
    spikes: [
      { x: 280, y: 432, w: 80, h: 18 },
      { x: 1420, y: 432, w: 100, h: 18 },
      { x: 1600, y: 432, w: 80, h: 18 },
    ],
  },
];

const TOTAL_COINS = LEVELS.reduce((sum, level) => sum + level.coins.length, 0);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const keys = new Set();
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
let cam = 0;
let camY = 180;
let time = 0;
let elapsed = 0;
let lives = 3;
let bank = 0;
let intro = 0;
let shake = 0;
let particles = [];
let audioCtx = null;
let muted = false;
let jumpedOnce = false;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function cameraFocus() {
  const viewW = W / ZOOM;
  return {
    x: clamp(player.x + player.w / 2 - viewW / 2, 0, Math.max(0, level.w - viewW)),
    y: clamp(player.y - 155, 70, 250),
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
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
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

function startLevel(index) {
  levelIndex = index;
  const src = LEVELS[index];
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
  intro = 1.8;
  shake = 0;
  particles = [];
  const focus = cameraFocus();
  cam = focus.x;
  camY = focus.y;
  state = "playing";
  document.body.dataset.state = state;
  keys.clear();
}

function startGame() {
  bank = 0;
  lives = 3;
  elapsed = 0;
  jumpedOnce = false;
  startLevel(0);
}

function respawn() {
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.riding = null;
  player.coyote = 0;
  const focus = cameraFocus();
  cam = focus.x;
  camY = focus.y;
}

function die() {
  sfx("hurt");
  shake = 14;
  burst(player.x + player.w / 2, player.y + player.h / 2, "#ffb4a2", 14);
  lives -= 1;
  if (lives <= 0) {
    state = "gameover";
    document.body.dataset.state = state;
    return;
  }
  respawn();
}

function reachGoal() {
  const got = level.coins.filter((coin) => coin.taken).length;
  burst(level.goal.x + 16, level.goal.y + 20, "#f2c14e", 18);
  sfx("win");
  if (levelIndex >= LEVELS.length - 1) {
    bank += got;
    state = "victory";
  } else {
    state = "cleared";
  }
  document.body.dataset.state = state;
}

function continueGame() {
  if (state === "menu") {
    startGame();
    return;
  }
  if (state === "cleared") {
    bank += level.coins.filter((coin) => coin.taken).length;
    startLevel(levelIndex + 1);
    return;
  }
  if (state === "gameover") {
    lives = 3;
    startLevel(levelIndex);
    return;
  }
  if (state === "victory") {
    state = "menu";
    document.body.dataset.state = state;
  }
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

  if (player.y > 720) {
    die();
    return;
  }

  for (const spike of level.spikes) {
    if (hit(player, spike)) {
      die();
      return;
    }
  }

  for (const coin of level.coins) {
    if (coin.taken) continue;
    if (!hitCoin(player, coin)) continue;
    coin.taken = true;
    burst(coin.x, coin.y, "#f2c14e", 10);
    sfx("coin");
  }

  if (hit(player, level.goal)) reachGoal();
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
  if (shake > 0) shake = Math.max(0, shake - dt * 28);
  if (intro > 0) intro -= dt;
  updateParticles(dt);
  if (state === "playing") {
    elapsed += dt;
    updatePlay(dt);
  }
  if (state !== "menu" && level) {
    const target = cameraFocus();
    const ease = 1 - Math.exp(-6 * dt);
    cam += (target.x - cam) * ease;
    camY += (target.y - camY) * ease;
  }
}

function text(str, x, y, size, color, align = "center", weight = 700) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}

function textShadow(str, x, y, size, color, align = "center") {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  text(str, x, y, size, color, align);
  ctx.restore();
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
  const offset = cam * parallax;
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

function drawHud() {
  ctx.fillStyle = "rgba(10, 12, 24, 0.38)";
  pathRound(16, 14, W - 32, 46, 14);
  ctx.fill();

  for (let i = 0; i < 3; i += 1) drawHeart(40 + i * 28, 37, i < lives);

  text(level.name, W / 2, 37, 18, "#fff6e8");

  const got = level.coins.filter((coin) => coin.taken).length;
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(W - 118, 37, 8, 0, Math.PI * 2);
  ctx.fill();
  text(`${got}/${level.coins.length}`, W - 78, 37, 18, "#fff6e8", "left");

  if (levelIndex === 0 && elapsed < 8 && state === "playing") {
    textShadow("Setas ou A/D · segure espaço para pular mais alto", W / 2, H - 28, 16, "#fff6e8");
  }


  if (intro > 0 && state === "playing") {
    ctx.globalAlpha = Math.min(1, intro / 0.45);
    textShadow(level.name, W / 2, 112, 34, "#fff6e8");
    textShadow(`Fase ${levelIndex + 1} de ${LEVELS.length}`, W / 2, 150, 16, "#ffe8c8");
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
  drawSky();
  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-Math.round(cam), -Math.round(camY));

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
  ctx.restore();

  if (shake > 2) {
    ctx.fillStyle = `rgba(180, 32, 40, ${shake / 48})`;
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
  } else if (state === "victory") {
    const perfect = bank === TOTAL_COINS ? "Todas as moedas." : "Dá para pegar mais moedas.";
    drawCard("Bandeira alcançada", [
      `Moedas: ${bank} de ${TOTAL_COINS}`,
      `Tempo: ${formatTime(elapsed)}`,
      perfect,
    ], "Enter ou clique para voltar ao início");
  }
}

function drawMenu() {
  drawSky();
  drawPlatform({ x: 160, y: 400, w: 640, h: 180 });
  drawCoin({ x: 470, y: 348, r: 12, taken: false }, 1);
  drawCoin({ x: 530, y: 332, r: 12, taken: false }, 2);
  drawFlag({ x: 700, y: 330, w: 36, h: 70 });
  const idle = Math.sin(time * 2) * 0.15;
  drawFox(250, 360, { facing: 1, walk: time * 2, vy: 0, onGround: true, land: idle > 0.1 ? 0 : 0 });

  textShadow("Salto", W / 2, 92, 72, "#fff6e8");
  textShadow("Leve o raposo até a bandeira.", W / 2, 158, 22, "#fff6e8");
  textShadow("Setas ou A/D para mover · Espaço para pular", W / 2, 198, 16, "#ffe8c8");
  textShadow("Segure espaço para pular mais alto · R reinicia · M silencia", W / 2, 224, 16, "#ffe8c8");

  const pulse = 0.45 + Math.sin(time * 3) * 0.55;
  ctx.globalAlpha = 0.35 + pulse * 0.65;
  textShadow("Enter ou clique para jogar", W / 2, 300, 20, "#fff6e8");
  ctx.globalAlpha = 1;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function beginFrame() {
  const dpr = canvas.width / W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
}

function draw() {
  beginFrame();
  const jx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const jy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.translate(jx, jy);
  if (state === "menu") drawMenu();
  else drawWorld();
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function holdButton(button, code) {
  const down = (event) => {
    event.preventDefault();
    keys.add(code);
  };
  const up = (event) => {
    event.preventDefault();
    keys.delete(code);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "Enter" || event.code === "Space") {
    if (state !== "playing") {
      if (event.code === "Space" && state === "playing") return;
      continueGame();
      return;
    }
  }
  if (event.code === "KeyR" && state === "playing") startLevel(levelIndex);
  if (event.code === "KeyM") muted = !muted;
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

canvas.addEventListener("pointerdown", () => {
  if (state !== "playing") continueGame();
});

holdButton(document.getElementById("btn-left"), "left");
holdButton(document.getElementById("btn-right"), "right");
holdButton(document.getElementById("btn-jump"), "jump");

document.body.dataset.state = state;
resize();
window.addEventListener("resize", resize);
requestAnimationFrame(frame);
