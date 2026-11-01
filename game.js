(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.querySelector("#score"),
    highScore: document.querySelector("#high-score"),
    wave: document.querySelector("#wave"),
    lives: document.querySelector("#lives"),
    overlay: document.querySelector("#overlay"),
    kicker: document.querySelector("#overlay-kicker"),
    title: document.querySelector("#overlay-title"),
    description: document.querySelector("#overlay-description"),
    start: document.querySelector("#start-button"),
    startLabel: document.querySelector("#start-label"),
    hint: document.querySelector("#overlay-hint"),
    pause: document.querySelector("#pause-button"),
    sound: document.querySelector("#sound-button"),
    soundState: document.querySelector("#sound-state"),
    announcement: document.querySelector("#announcement"),
  };
  const W = canvas.width;
  const H = canvas.height;
  const PLAYER_Y = 564;
  const STORAGE_KEY = "space-invaders-high-score-v1";
  const COLORS = ["#d4ff77", "#c7b7ff", "#c7b7ff", "#ffad80", "#ffad80"];
  const SPRITES = [
    ["001000100", "000101000", "001111100", "011011110", "111111111", "101111101", "101000101", "000110000"],
    ["001000100", "000101000", "001111100", "011011110", "111111111", "001111100", "010000010", "100000001"],
    ["000111000", "011111110", "111011011", "111111111", "001111100", "011010110", "110000011", "011000110"],
  ];
  const SHIELD_SHAPE = ["0011111111100", "0111111111110", "1111111111111", "1111111111111", "1111000001111", "1110000000111"];
  const state = {
    mode: "ready", score: 0, best: readBest(), wave: 1, lives: 3,
    player: { x: W / 2, cooldown: 0, invulnerable: 0 },
    enemies: [], bullets: [], shields: [], particles: [],
    direction: 1, formationSpeed: 32, shootTimer: 1, waveTimer: 0,
    ufo: null, ufoTimer: 15, time: 0, sound: false,
  };
  const held = { left: false, right: false, fire: false };
  const stars = Array.from({ length: 72 }, (_, i) => ({
    x: (i * 137 + 43) % W,
    y: (i * 83 + 29) % (H - 38),
    size: i % 11 === 0 ? 2 : 1,
    phase: i * 1.13,
  }));
  let audioContext = null;
  let lastFrame = 0;

  function readBest() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 999999) : 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try { localStorage.setItem(STORAGE_KEY, String(state.best)); } catch { /* o jogo continua sem armazenamento */ }
  }

  function tone(frequency, duration, type = "square", volume = 0.025) {
    if (!state.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch { /* dispositivos sem áudio continuam jogáveis */ }
  }

  function announce(text) { ui.announcement.textContent = text; }
  function pad(value, length) { return String(Math.floor(value)).padStart(length, "0"); }
  function updateHud() {
    ui.score.textContent = pad(state.score, 6);
    ui.highScore.textContent = pad(state.best, 6);
    ui.wave.textContent = pad(state.wave, 2);
    ui.lives.textContent = state.lives > 0 ? Array(state.lives).fill("♥").join(" ") : "—";
    ui.lives.setAttribute("aria-label", `${state.lives} ${state.lives === 1 ? "vida" : "vidas"}`);
  }

  function setOverlay(kicker, title, accent, description, button, hint) {
    ui.kicker.textContent = kicker;
    ui.title.replaceChildren(document.createTextNode(title), document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = accent;
    ui.title.append(span);
    ui.description.textContent = description;
    ui.startLabel.textContent = button;
    ui.hint.textContent = hint;
    ui.overlay.hidden = false;
  }

  function resetInputs() {
    held.left = held.right = held.fire = false;
    document.querySelectorAll("[data-control]").forEach((button) => button.classList.remove("is-pressed"));
  }

  function makeShields() {
    const blocks = [];
    for (const center of [180, 380, 580, 780]) {
      SHIELD_SHAPE.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell === "1") blocks.push({ x: center - 52 + x * 8, y: 466 + y * 8, w: 8, h: 8, health: 2 });
      }));
    }
    return blocks;
  }

  function makeWave() {
    state.enemies = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 9; col++) {
        state.enemies.push({ x: 170 + col * 65, y: 95 + row * 45, w: 36, h: 30, row, points: row === 0 ? 30 : row < 3 ? 20 : 10 });
      }
    }
    state.bullets = [];
    state.direction = 1;
    state.formationSpeed = Math.min(110, 32 + (state.wave - 1) * 9);
    state.shootTimer = 1.2;
    state.ufoTimer = 14;
    state.ufo = null;
    state.player.x = W / 2;
    state.player.cooldown = 0;
    state.player.invulnerable = 1.3;
    state.shields = makeShields();
    updateHud();
    announce(`Onda ${state.wave}. ${state.lives} vidas.`);
  }

  function startGame() {
    resetInputs();
    state.score = 0;
    state.wave = 1;
    state.lives = 3;
    state.particles = [];
    state.mode = "playing";
    ui.overlay.hidden = true;
    ui.pause.disabled = false;
    ui.pause.setAttribute("aria-label", "Pausar jogo");
    ui.pause.title = "Pausar jogo";
    ui.pause.textContent = "Ⅱ";
    makeWave();
    tone(420, 0.11, "square");
  }

  function pauseGame() {
    if (state.mode !== "playing" && state.mode !== "wave") return;
    state.resumeMode = state.mode;
    state.mode = "paused";
    resetInputs();
    setOverlay("PAUSA NA MISSÃO", "JOGO", "PAUSADO.", "Respire fundo. A galáxia espera por você.", "CONTINUAR", "PRESSIONE P PARA CONTINUAR");
    ui.pause.setAttribute("aria-label", "Continuar jogo");
    ui.pause.title = "Continuar jogo";
    ui.pause.textContent = "▶";
    announce("Jogo pausado.");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = state.resumeMode || "playing";
    ui.overlay.hidden = true;
    ui.pause.setAttribute("aria-label", "Pausar jogo");
    ui.pause.title = "Pausar jogo";
    ui.pause.textContent = "Ⅱ";
    announce("Jogo retomado.");
  }

  function endGame() {
    if (state.mode === "over") return;
    state.mode = "over";
    state.lives = Math.max(0, state.lives);
    resetInputs();
    updateHud();
    ui.pause.disabled = true;
    setOverlay("FIM DA MISSÃO", "FIM DE", "JOGO.", `Você fez ${state.score} pontos. Pronto para tentar de novo?`, "JOGAR NOVAMENTE", "PRESSIONE ENTER PARA RECOMEÇAR");
    announce(`Fim de jogo. ${state.score} pontos.`);
    tone(125, 0.4, "sawtooth", 0.03);
  }

  function addScore(amount) {
    state.score = Math.min(999999, state.score + amount);
    if (state.score > state.best) { state.best = state.score; saveBest(); }
    updateHud();
  }

  function particles(x, y, color, count = 9) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 95;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .25 + Math.random() * .35, color });
    }
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function firePlayer() {
    if (state.player.cooldown > 0) return;
    state.bullets.push({ x: state.player.x - 2, y: PLAYER_Y - 21, w: 4, h: 16, vy: -600, owner: "player" });
    state.player.cooldown = .28;
    tone(580, .07, "square", .015);
  }

  function fireEnemy() {
    if (!state.enemies.length) return;
    const eligible = state.enemies.filter((enemy) => !state.enemies.some((other) => Math.abs(other.x - enemy.x) < 5 && other.y > enemy.y));
    const enemy = eligible[Math.floor(Math.random() * eligible.length)];
    if (enemy) state.bullets.push({ x: enemy.x + enemy.w / 2 - 3, y: enemy.y + enemy.h, w: 6, h: 14, vy: Math.min(310, 175 + state.wave * 15), owner: "enemy" });
  }

  function update(dt) {
    state.time += dt;
    state.particles = state.particles.filter((p) => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0;
    });
    if (state.mode === "wave") {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) { makeWave(); state.mode = "playing"; }
      return;
    }
    if (state.mode !== "playing") return;
    const p = state.player;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.x = Math.max(30, Math.min(W - 30, p.x + ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * 360 * dt));
    if (held.fire) firePlayer();

    const speed = state.formationSpeed * (1 + (45 - state.enemies.length) / 30);
    const move = state.direction * speed * dt;
    if (state.enemies.some((enemy) => enemy.x + move < 22 || enemy.x + enemy.w + move > W - 22)) {
      state.direction *= -1;
      state.enemies.forEach((enemy) => { enemy.y += 18; });
    } else {
      state.enemies.forEach((enemy) => { enemy.x += move; });
    }
    if (state.enemies.some((enemy) => enemy.y + enemy.h >= PLAYER_Y - 25)) { endGame(); return; }
    state.shootTimer -= dt;
    if (state.shootTimer <= 0) {
      fireEnemy();
      state.shootTimer = Math.max(.35, 1.2 - state.wave * .05 - (45 - state.enemies.length) * .009) * (.75 + Math.random() * .5);
    }
    if (state.ufo) {
      state.ufo.x += state.ufo.vx * dt;
      if (state.ufo.x < -90 || state.ufo.x > W + 90) state.ufo = null;
    } else {
      state.ufoTimer -= dt;
      if (state.ufoTimer <= 0) {
        const left = Math.random() > .5;
        state.ufo = { x: left ? -60 : W + 60, y: 45, w: 54, h: 22, vx: left ? 115 : -115 };
        state.ufoTimer = 18 + Math.random() * 9;
      }
    }

    for (const bullet of state.bullets) {
      const previousY = bullet.y;
      bullet.y += bullet.vy * dt;
      const swept = { x: bullet.x, y: Math.min(previousY, bullet.y), w: bullet.w, h: bullet.h + Math.abs(bullet.y - previousY) };
      const block = state.shields.find((shield) => shield.health > 0 && overlap(swept, shield));
      if (block) { block.health--; bullet.dead = true; particles(bullet.x, bullet.y, "#8fcfab", 3); continue; }
      if (bullet.owner === "player") {
        const enemy = state.enemies.find((target) => !target.dead && overlap(swept, target));
        if (enemy) {
          enemy.dead = true; bullet.dead = true;
          addScore(enemy.points); particles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, COLORS[enemy.row]); tone(240, .08, "square", .02);
        } else if (state.ufo && overlap(swept, state.ufo)) {
          addScore(100); particles(state.ufo.x + 27, state.ufo.y + 11, "#ff895e", 14); state.ufo = null; bullet.dead = true; tone(760, .16, "triangle");
        }
      } else if (p.invulnerable <= 0 && overlap(swept, { x: p.x - 22, y: PLAYER_Y - 18, w: 44, h: 22 })) {
        bullet.dead = true; state.lives--; p.invulnerable = 2; particles(p.x, PLAYER_Y, "#d5ff75", 18); tone(145, .22, "sawtooth", .025); updateHud();
        announce(`${state.lives} ${state.lives === 1 ? "vida restante" : "vidas restantes"}.`);
        if (state.lives <= 0) { endGame(); break; }
      }
    }
    state.bullets = state.bullets.filter((bullet) => !bullet.dead && bullet.y > -30 && bullet.y < H + 30);
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    if (!state.enemies.length && state.mode === "playing") {
      state.mode = "wave"; state.wave++; state.waveTimer = 2.2; state.bullets = []; announce(`Onda concluída. Prepare-se para a onda ${state.wave}.`); tone(700, .18, "triangle");
    }
  }

  function pixels(sprite, x, y, size, color) {
    ctx.fillStyle = color;
    sprite.forEach((row, rowIndex) => [...row].forEach((pixel, colIndex) => {
      if (pixel === "1") ctx.fillRect(Math.round(x + colIndex * size), Math.round(y + rowIndex * size), size, size);
    }));
  }

  function draw() {
    ctx.fillStyle = "#080c19"; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * .52, 40, W / 2, H * .52, W * .65);
    glow.addColorStop(0, "#1b1b36"); glow.addColorStop(1, "#080c19"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    for (const star of stars) {
      ctx.fillStyle = `rgba(211,221,255,${.2 + .28 * (1 + Math.sin(state.time * .8 + star.phase)) / 2})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.strokeStyle = "#b0a3ff18"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = "#e2ff9b"; ctx.fillRect(24, 598, W - 48, 2);
    ctx.fillStyle = "#7d8f75"; ctx.font = "12px monospace"; ctx.fillText("DEFENDA A TERRA", 25, 622); ctx.textAlign = "right"; ctx.fillText("PLAYER 01", W - 25, 622); ctx.textAlign = "left";
    state.shields.forEach((block) => { if (block.health > 0) { ctx.fillStyle = block.health === 2 ? "#b4efad" : "#578f76"; ctx.fillRect(block.x, block.y, block.w - 1, block.h - 1); } });
    state.enemies.forEach((enemy) => pixels(SPRITES[enemy.row === 0 ? 0 : enemy.row < 3 ? 1 : 2], enemy.x, enemy.y, 4, COLORS[enemy.row]));
    if (state.ufo) {
      ctx.fillStyle = "#ff895e"; ctx.fillRect(state.ufo.x + 12, state.ufo.y, 30, 5); ctx.fillRect(state.ufo.x + 6, state.ufo.y + 5, 42, 5); ctx.fillRect(state.ufo.x, state.ufo.y + 10, 54, 7); ctx.fillRect(state.ufo.x + 9, state.ufo.y + 17, 36, 4);
    }
    if (state.mode !== "ready" && (state.player.invulnerable <= 0 || Math.floor(state.time * 10) % 2 === 0)) {
      pixels(["00000100000", "00001110000", "00111111100", "11111111111", "11111111111", "11111111111"], state.player.x - 22, PLAYER_Y - 20, 4, "#d5ff75");
    }
    state.bullets.forEach((bullet) => { ctx.fillStyle = bullet.owner === "player" ? "#e8ffa8" : "#ff927a"; ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h); });
    state.particles.forEach((p) => { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); }); ctx.globalAlpha = 1;
    if (state.mode === "wave") {
      ctx.fillStyle = "#080c19cc"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#d5ff75"; ctx.textAlign = "center"; ctx.font = "bold 18px monospace"; ctx.fillText("ONDA CONCLUÍDA", W / 2, H / 2 - 15);
      ctx.fillStyle = "#f6f3ee"; ctx.font = "bold 40px sans-serif"; ctx.fillText(`PRÓXIMA ONDA: ${pad(state.wave, 2)}`, W / 2, H / 2 + 35); ctx.textAlign = "left";
    }
  }

  function frame(timestamp) {
    const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .035) : 0;
    lastFrame = timestamp; update(dt); draw(); requestAnimationFrame(frame);
  }

  ui.start.addEventListener("click", () => state.mode === "paused" ? resumeGame() : startGame());
  ui.pause.addEventListener("click", () => state.mode === "paused" ? resumeGame() : pauseGame());
  ui.sound.addEventListener("click", () => {
    state.sound = !state.sound;
    ui.soundState.textContent = state.sound ? "ON" : "OFF";
    ui.sound.setAttribute("aria-pressed", String(state.sound));
    ui.sound.setAttribute("aria-label", state.sound ? "Desativar som" : "Ativar som");
    ui.sound.title = state.sound ? "Desativar som" : "Ativar som";
    if (state.sound) tone(520, .1, "triangle");
  });

  const controlForKey = (key) => ({ ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", " ": "fire" })[key];
  window.addEventListener("keydown", (event) => {
    const control = controlForKey(event.key);
    if (control && (state.mode === "playing" || state.mode === "wave")) { event.preventDefault(); held[control] = true; }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && !event.repeat) {
      if (state.mode === "paused") resumeGame(); else pauseGame();
    }
    if (event.key === "Enter" && !event.repeat && event.target.tagName !== "BUTTON" && ["ready", "over", "paused"].includes(state.mode)) {
      event.preventDefault(); state.mode === "paused" ? resumeGame() : startGame();
    }
  });
  window.addEventListener("keyup", (event) => { const control = controlForKey(event.key); if (control) held[control] = false; });
  document.querySelectorAll("[data-control]").forEach((button) => {
    const control = button.dataset.control;
    const release = () => { held[control] = false; button.classList.remove("is-pressed"); };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (state.mode !== "playing" && state.mode !== "wave") return;
      button.setPointerCapture(event.pointerId); held[control] = true; button.classList.add("is-pressed");
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", () => { if (state.mode === "playing" || state.mode === "wave") pauseGame(); });
  updateHud();
  requestAnimationFrame(frame);
})();
