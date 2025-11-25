// js/game.js
import kaboom from "https://unpkg.com/kaboom@next/dist/kaboom.mjs";

/**
 * SkyMatch — full scaffolded match-3 game
 * - 20 levels
 * - time, lives, score, milestones, fireworks
 * - drop-in stacking spawn
 * - special glowing tiles
 * - in-browser sound & music synth (no external files needed)
 * - start menu, pause, restart, quit
 * - localStorage high score
 */

// --------- INIT ----------
const GAME_WRAP = document.getElementById("game-wrap");

const k = kaboom({
  global: true,
  parent: GAME_WRAP,
  width: Math.min(720, Math.floor(window.innerWidth * 0.95)),
  height: Math.min(1280, Math.floor(window.innerHeight * 0.78)),
  background: [0,0,0,0],
  crisp: true,
});

// constants
const COLS = 6;
const ROWS = 6;
const TILE = Math.floor(k.width * 0.12);
const GRID_X = (k.width - COLS * TILE) / 2;
const GRID_Y = (k.height - ROWS * TILE) / 2 + 10;
const ICONS = ["🍎","🍇","🍊","🍒","🍋","🍉","💎","⭐"]; // pool (will unlock)
const TOTAL_LEVELS = 20;

// DOM hooks
const domScore = document.getElementById("score");
const domTimer = document.getElementById("timer");
const domLives = document.getElementById("lives");
const domLevel = document.getElementById("level");
const banner = document.getElementById("banner-text");
const overlay = document.getElementById("overlay");
const menu = document.getElementById("menu");
const startBtn = document.getElementById("start-btn");
const howBtn = document.getElementById("how-btn");
const highscoreDom = document.getElementById("highscore");
const modeBtn = document.getElementById("mode-btn");
const btnRestart = document.getElementById("btn-restart");
const btnPause = document.getElementById("btn-pause");
const btnQuit = document.getElementById("btn-quit");

// state
let board = [];
let selected = null;
let score = 0;
let timer = 120;
let lives = 5;
let level = 1;
let paused = true;
let highScore = Number(localStorage.getItem("skymatch_high") || 0);
highscoreDom.textContent = highScore;

let unlockedIcons = 4; // more unlock as level increases
let specialProbability = 0.05;

// audio context + simple sound functions
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function playExplosion() {
  ensureAudio();
  try {
    const ctx = audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = 150 + Math.random() * 400;
    g.gain.value = 0.16;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.26);
    setTimeout(()=>{ o.stop(); }, 300);
  } catch(e){}
}
function playClick() {
  ensureAudio();
  try {
    const ctx = audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 700;
    g.gain.value = 0.06;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    setTimeout(()=>{ o.stop(); }, 120);
  } catch(e){}
}

// simple looping synth for background music (low CPU)
let musicInterval = null;
let musicOn = true;
function startMusic() {
  ensureAudio();
  if (!audioCtx || musicInterval) return;
  const ctx = audioCtx;
  const tempo = 100;
  musicInterval = setInterval(() => {
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "sine";
    o1.frequency.value = 110 + Math.random() * 60;
    g1.gain.value = 0.03;
    o1.connect(g1); g1.connect(ctx.destination);
    o1.start();
    g1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    setTimeout(()=>{ o1.stop(); }, 700);
  }, 600);
}
function stopMusic() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

// UI helpers
function updateUI() {
  domScore.textContent = score;
  domTimer.textContent = Math.max(0, Math.floor(timer));
  domLives.textContent = lives;
  domLevel.textContent = level;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("skymatch_high", highScore);
    highscoreDom.textContent = highScore;
  }
}

function bannerText(t) {
  banner.textContent = t;
  banner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)'}], { duration: 1100, iterations: 1 });
}

// particle helpers
function explodeAt(p, tint = rgb(255,180,60)) {
  for (let i=0;i<18;i++){
    add([
      pos(p.x, p.y),
      rect(6,6),
      tint,
      origin("center"),
      lifespan(0.5, { fade: 0.2 }),
      move(rand(-240,240), rand(-320, -40))
    ]);
  }
}
function fireworks() {
  for (let j=0;j<6;j++){
    const x = rand(0,k.width);
    const y = rand(0,k.height * 0.35);
    for (let i=0;i<28;i++){
      add([
        pos(x,y),
        rect(4,4),
        rgb(rand(0,255), rand(0,255), rand(0,255)),
        origin("center"),
        lifespan(1.2, { fade: 0.5 }),
        move(rand(-300,300), rand(-300, 300))
      ]);
    }
  }
}

// grid + tile functions
function posFor(ix,iy) {
  return vec2(GRID_X + ix * TILE + TILE/2, GRID_Y + iy * TILE + TILE/2);
}
function makeTile(ix,iy,emoji,special=false) {
  // spawn above and drop to target for stacking look
  const spawnX = GRID_X + ix * TILE + TILE/2;
  const spawnY = GRID_Y - rand(90, 360);
  const target = posFor(ix,iy);
  const base = add([
    pos(spawnX, spawnY),
    area(),
    origin("center"),
    {
      ix, iy, emoji, special
    }
  ]);
  // bg square
  const bg = add([
    pos(0,0),
    origin("center"),
    rect(TILE - 8, TILE - 8),
    color(240,240,255),
    parent(base)
  ]);
  // outline
  const outline = add([ pos(0,0), origin("center"), rect(TILE - 3, TILE - 3), outline(4, rgb(0,0,0,0)), parent(base) ]);
  // emoji text
  const t = add([ pos(0,0), origin("center"), text(emoji, { size: TILE * 0.6 }), parent(base) ]);
  base.bg = bg; base.textObj = t; base.outlineObj = outline;
  if (special) {
    const gl = add([ pos(0,0), origin("center"), rect(TILE+6,TILE+6), color(255,240,180), opacity(0.06), parent(base) ]);
    tween(gl, { opacity: 0.18 }, 0.9, easings.easeInOutSine, true);
  }
  wait(iy * 0.06, () => {
    base.moveTo(target, 220 + iy * 28);
  });
  return base;
}

function pickIconForLevel() {
  // unlock more icons gradually
  const count = Math.min(ICONS.length, 3 + Math.floor(level/3));
  return ICONS[Math.floor(Math.random()*count)];
}

function generateBoard() {
  // destroy any existing
  for (let r of board) for (let c of r) if (c) destroy(c);
  board = [];
  for (let y=0;y<ROWS;y++){
    board[y] = [];
    for (let x=0;x<COLS;x++){
      const isSpecial = Math.random() < (specialProbability + level*0.002);
      const emoji = pickIconForLevel();
      const tile = makeTile(x,y,emoji,isSpecial);
      board[y][x] = tile;
    }
  }
  // remove accidental pre-existing matches after spawn (ensure variety)
  wait(0.8, () => {
    let groups = findMatches();
    if (groups.length > 0) {
      // replace matched tiles with new ones
      for (const g of groups) {
        for (const t of g) {
          const nx = t.ix, ny = t.iy;
          destroy(t);
          const tile = makeTile(nx, ny, pickIconForLevel(), Math.random() < 0.03);
          board[ny][nx] = tile;
        }
      }
    }
  });
}

// find matches horizontally and vertically
function findMatches() {
  const groups = [];
  // horizontal
  for (let y=0;y<ROWS;y++){
    let run = [board[y][0]];
    for (let x=1;x<COLS;x++){
      const prev = run[0];
      const cur = board[y][x];
      if (prev && cur && prev.textObj.text === cur.textObj.text) {
        run.push(cur);
      } else {
        if (run.length >=3) groups.push([...run]);
        run = [cur];
      }
    }
    if (run.length >=3) groups.push([...run]);
  }
  // vertical
  for (let x=0;x<COLS;x++){
    let run = [board[0][x]];
    for (let y=1;y<ROWS;y++){
      const prev = run[0];
      const cur = board[y][x];
      if (prev && cur && prev.textObj.text === cur.textObj.text) {
        run.push(cur);
      } else {
        if (run.length >=3) groups.push([...run]);
        run = [cur];
      }
    }
    if (run.length >=3) groups.push([...run]);
  }
  // de-dupe groups by id string
  const seen = new Set();
  const unique = [];
  for (const g of groups) {
    const ids = g.map(t=>`${t.ix},${t.iy}`).sort().join("|");
    if (!seen.has(ids)) { seen.add(ids); unique.push(g); }
  }
  return unique;
}

// swap two tiles (grid + visual)
function swapTiles(a,b,animate=true) {
  const ax=a.ix, ay=a.iy, bx=b.ix, by=b.iy;
  board[ay][ax] = b; board[by][bx] = a;
  a.ix = bx; a.iy = by; b.ix = ax; b.iy = ay;
  const at = posFor(a.ix,a.iy), bt = posFor(b.ix,b.iy);
  if (animate) {
    a.moveTo(at,160); b.moveTo(bt,160);
  } else {
    a.pos = at; b.pos = bt;
  }
}

// collapse columns and spawn new tiles from top
function collapseBoard() {
  for (let x=0;x<COLS;x++){
    let write = ROWS-1;
    for (let y=ROWS-1;y>=0;y--){
      if (board[y][x]) {
        if (write !== y) {
          const t = board[y][x];
          board[write][x] = t;
          t.iy = write;
          t.moveTo(posFor(write? x: x, t.iy), 160);
          board[y][x] = null;
        }
        write--;
      }
    }
    // fill remaining
    for (let fy = write; fy >=0; fy--) {
      const isSpecial = Math.random() < (specialProbability + level*0.002);
      const tile = makeTile(x, fy, pickIconForLevel(), isSpecial);
      board[fy][x] = tile;
    }
  }
  // chain detection after collapse
  wait(0.42, () => {
    const next = findMatches();
    if (next.length > 0) {
      removeMatches(next);
    }
  });
}

// remove matched groups
function removeMatches(groups) {
  let removed = 0;
  for (const g of groups) {
    for (const t of g) {
      removed++;
      explodeAt(t.pos, rgb(255,200,120));
      playExplosion();
      destroy(t);
      board[t.iy][t.ix] = null;
    }
  }
  // scoring
  const gained = removed * 50 + (removed >=5 ? 200 : 0);
  score += gained;
  if (removed >= 5) fireworks();
  updateUI();
  // collapse after removal
  wait(0.18, () => collapseBoard());
}

// check adjacency
function isAdjacent(a,b) {
  return Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy) === 1;
}

// input handling (click/tap on canvas)
k.onClick(() => {
  if (paused) return;
  const m = k.mousePos();
  // find tile under mouse
  let hit = null;
  for (let y=0;y<ROWS;y++){
    for (let x=0;x<COLS;x++){
      const t = board[y][x];
      if (!t) continue;
      if (m.distTo(t.pos) < TILE*0.5) { hit = t; break; }
    }
    if (hit) break;
  }
  if (!hit) return;
  // selection logic
  if (!selected) {
    selected = hit;
    if (selected.outlineObj) { selected.outlineObj.color = rgb(255,255,255); selected.outlineObj.outline = 6; }
    playClick();
    return;
  }
  if (selected === hit) {
    if (selected.outlineObj) { selected.outlineObj.color = rgb(0,0,0,0); selected.outlineObj.outline = 0; }
    selected = null;
    return;
  }
  if (isAdjacent(selected, hit)) {
    swapTiles(selected, hit, true);
    // after swap, check for matches
    wait(0.26, () => {
      const groups = findMatches();
      if (groups.length > 0) {
        removeMatches(groups);
        // check for level progression condition
        maybeAdvanceLevel();
      } else {
        // swap back
        wait(0.18, () => {
          swapTiles(selected, hit, true);
        });
      }
    });
  } else {
    // not adjacent - change selection
    if (selected.outlineObj) { selected.outlineObj.color = rgb(0,0,0,0); selected.outlineObj.outline = 0; }
    selected = hit;
    if (selected.outlineObj) { selected.outlineObj.color = rgb(255,255,255); selected.outlineObj.outline = 6; }
  }
  playClick();
}

// core game loop / timer
k.loop(1, () => {
  if (!paused) {
    timer -= 1;
    if (timer <= 0) {
      lives--;
      bannerText("Time ran out! -1 life");
      timer = 30; // penalty reset
      if (lives <= 0) {
        gameOver();
      }
    }
    updateUI();
  }
});

// level progression rules
function maybeAdvanceLevel() {
  // simple rule: reach score target to progress
  const target = 1000 + (level-1) * 600; // increases per level
  if (score >= target && level < TOTAL_LEVELS) {
    level++;
    bannerText(`Level ${level} reached!`);
    fireworks();
    timer = Math.max(30, 120 - level * 2);
    unlockedIcons = Math.min(ICONS.length, 3 + Math.floor(level/3));
    specialProbability = Math.min(0.18, specialProbability + 0.01);
    updateUI();
    // small speed up (optional)
  } else if (level >= TOTAL_LEVELS && score >= (1000 + (TOTAL_LEVELS-1)*600)) {
    bannerText("You beat all levels! Congratulations!");
    fireworks();
    paused = true;
  }
}

// start / restart / menu behavior
function startGame() {
  // reset state
  score = 0; timer = 120; lives = 5; level = 1; paused = false;
  unlockedIcons = 4; specialProbability = 0.05;
  updateUI();
  // hide overlay
  overlay.style.display = "none";
  // cleanup and generate
  for (let r of board) for (let c of r) if (c) destroy(c);
  board = [];
  generateBoard();
  bannerText("Good luck!");
  if (musicOn) startMusic();
}
function restartGame() {
  startGame();
}
function quitGame() {
  paused = true;
  overlay.style.display = "flex";
  bannerText("Quit to menu");
  stopMusic();
}

// game over
function gameOver() {
  paused = true;
  bannerText("Game Over! Tap Restart to play again.");
  fireworks();
  overlay.style.display = "flex";
  stopMusic();
}

// controls
startBtn.addEventListener("click", () => { overlay.style.display="none"; startGame(); });
howBtn.addEventListener("click", () => {
  alert("Match 3 or more icons. Tap tiles to select and swap with adjacent tiles. Clear tiles to score and fill the board. Reach targets to progress levels. Good luck!");
});
btnRestart.addEventListener("click", () => { restartGame(); });
btnPause.addEventListener("click", () => {
  paused = !paused;
  btnPause.querySelector(".control-label")?.setAttribute('data', paused ? "Resume" : "Pause");
  bannerText(paused ? "Paused" : "Resumed");
  if (!paused && musicOn) startMusic();
  if (paused) stopMusic();
});
btnQuit.addEventListener("click", () => { quitGame(); });

// mode toggle
modeBtn.addEventListener("click", () => {
  if (document.body.classList.contains("dark")) {
    document.body.classList.remove("dark");
    modeBtn.textContent = "🌙";
  } else {
    document.body.classList.add("dark");
    modeBtn.textContent = "☀️";
  }
});

// init
function init() {
  k.layers(["bg","obj","ui"], "obj");
  updateUI();
  // initial blank board
  generateBoard();
  paused = true;
  overlay.style.display = "flex";
  bannerText("Welcome to SkyMatch!");
}
init();
updateUI();
