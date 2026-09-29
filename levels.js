// Fases do Salto. As três primeiras são desenhadas à mão.
// Da 4 à 20, o gerador monta um caminho que cabe num pulo segurado.

(function (root) {
  const FLOOR = 450;
  const NAMES = [
    "Primeiros passos",
    "O vão",
    "Espinhos",
    "A trilha",
    "Degraus",
    "Ponte",
    "O atalho",
    "Nuvem baixa",
    "Pedras soltas",
    "Cuidado",
    "O vai e vem",
    "Subida",
    "Espinhos altos",
    "A fenda",
    "Ritmo",
    "Plataforma viva",
    "Quase lá",
    "Noite longa",
    "Último vão",
    "A bandeira",
  ];

  const HAND = [
    {
      name: NAMES[0],
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
      name: NAMES[1],
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
      name: NAMES[2],
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

  function rng(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function maxGapForRise(rise) {
    if (rise <= 0) return 125;
    if (rise <= 30) return 110;
    if (rise <= 45) return 98;
    return 88;
  }

  function groundHeight(top) {
    return top >= FLOOR - 1 ? 200 : 40;
  }

  function makeLevel(index) {
    const rand = rng(4000 + index * 131);
    const difficulty = (index - 3) / 16;
    const steps = 5 + Math.floor(difficulty * 4);
    const maxRise = 18 + Math.floor(difficulty * 32);
    const useMover = index >= 5 && index % 4 === 1;
    const platforms = [{ x: 0, y: FLOOR, w: 480, h: 200 }];
    const coins = [{ x: 220, y: FLOOR - 32, r: 12 }];
    const spikes = [];
    let cursor = 480;
    let top = FLOOR;

    function pushPlatform(platform) {
      platforms.push(platform);
      cursor = platform.x + platform.w;
      top = platform.y;
    }

    function addCoin(platform, high) {
      coins.push({
        x: Math.round(platform.x + platform.w * 0.55),
        y: platform.y - (high ? 76 : 32),
        r: 12,
      });
    }

    for (let step = 0; step < steps; step += 1) {
      const last = step === steps - 1;
      if (useMover && step === 2) {
        const mover = {
          x: cursor + 80,
          y: FLOOR,
          w: 150,
          h: 32,
          motion: { axis: "x", range: 150, speed: 0.85 + difficulty * 0.25 },
        };
        const right = {
          x: cursor + 330,
          y: FLOOR,
          w: 280,
          h: 200,
        };
        platforms.push(mover);
        pushPlatform(right);
        coins.push({ x: mover.x + 70, y: FLOOR - 32, r: 12 });
        addCoin(right, false);
        continue;
      }

      let rise = 0;
      if (!last && !(useMover && step < 2)) {
        const roll = rand();
        if (roll > 0.55) rise = 16 + Math.floor(rand() * maxRise);
        else if (roll < 0.22 && top < FLOOR) rise = -Math.min(36, FLOOR - top);
      }
      if (top - rise < 310) rise = top - 310;
      if (top - rise > FLOOR) rise = top - FLOOR;

      const gapCap = maxGapForRise(rise);
      const gap = Math.round(78 + rand() * (gapCap - 78));
      const nextTop = top - rise;
      let width = last
        ? 400
        : nextTop >= FLOOR - 1
          ? 300 + Math.floor(rand() * 230)
          : 160 + Math.floor(rand() * 50);
      if (difficulty > 0.35 && step === 1 && nextTop >= FLOOR - 1 && !last) width = Math.max(width, 450);
      const platform = {
        x: cursor + gap,
        y: nextTop,
        w: width,
        h: groundHeight(nextTop),
      };
      pushPlatform(platform);
      addCoin(platform, !last && width > 360 && rand() > 0.62);

      const canSpike = difficulty > 0.1 && !last && platform.h >= 200 && platform.w >= 420;
      if (canSpike) {
        const spikeW = 64;
        const room = platform.w - 190 - spikeW - 150;
        const spikeX = platform.x + 190 + Math.floor(rand() * Math.max(1, room));
        spikes.push({ x: spikeX, y: platform.y - 18, w: spikeW, h: 18 });
      }
    }

    const finale = platforms[platforms.length - 1];
    return {
      name: NAMES[index],
      w: finale.x + finale.w,
      spawn: { x: 64, y: FLOOR - 40 },
      goal: { x: finale.x + finale.w - 130, y: finale.y - 70, w: 36, h: 70 },
      platforms,
      coins,
      spikes,
    };
  }

  const generated = [];
  for (let index = 3; index < NAMES.length; index += 1) generated.push(makeLevel(index));

  root.LEVELS = HAND.concat(generated);
})(typeof window !== "undefined" ? window : globalThis);
