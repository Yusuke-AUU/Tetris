/* ===================================================
   NEON TETRIS - script.js  v2 (Chain Animation)
   フェーズ制連鎖アニメーション対応版
   =================================================== */

// ─────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const CELL = (() => {
  const maxH = window.innerHeight - 180;
  const maxW = window.innerWidth - 280;
  const byH = Math.floor(maxH / ROWS);
  const byW = Math.floor(maxW / COLS);
  return Math.max(24, Math.min(36, byH, byW));
})();

const CANVAS_W = COLS * CELL;
const CANVAS_H = ROWS * CELL;

const COLORS = [
  null,
  '#00e5ff', // I  cyan
  '#ffe000', // O  yellow
  '#bf5fff', // T  purple
  '#ff2d78', // S  pink
  '#00ff99', // Z  green
  '#ff8800', // L  orange
  '#4488ff', // J  blue
];

const GLOWS = [
  null,
  'rgba(0,229,255,0.6)',
  'rgba(255,224,0,0.6)',
  'rgba(191,95,255,0.6)',
  'rgba(255,45,120,0.6)',
  'rgba(0,255,153,0.6)',
  'rgba(255,136,0,0.6)',
  'rgba(68,136,255,0.6)',
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                   // T
  [[0,4,4],[4,4,0],[0,0,0]],                   // S
  [[5,5,0],[0,5,5],[0,0,0]],                   // Z
  [[6,0,0],[6,6,6],[0,0,0]],                   // L
  [[0,0,7],[7,7,7],[0,0,0]],                   // J
];

const SPEEDS      = [800,680,560,450,360,270,200,150,110,80,60];
const SCORE_TABLE = {1:100, 2:300, 3:700, 4:1500};
const COMBO_BONUS = [0,50,100,200,400,700,1100];

// ─────────────────────────────────────────────────────
//  PHASE CONSTANTS
// ─────────────────────────────────────────────────────
const PHASE = {
  PLAY:       'PLAY',
  LINE_FLASH: 'LINE_FLASH',
  DROP_ANIM:  'DROP_ANIM',
  CHECK:      'CHECK',
};

const FLASH_DURATION  = 420;  // ms
const DROP_DURATION   = 300;  // ms
const FLASH_INTERVAL  = 80;   // ms ごとに点滅トグル

// ─────────────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────────────
const bgCanvas   = document.getElementById('bgCanvas');
const bgCtx      = bgCanvas.getContext('2d');
const gameCanvas = document.getElementById('gameCanvas');
const ctx        = gameCanvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx    = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('holdCanvas');
const holdCtx    = holdCanvas.getContext('2d');

const scoreEl     = document.getElementById('score');
const levelEl     = document.getElementById('level');
const linesEl     = document.getElementById('lines');
const comboEl     = document.getElementById('combo');
const speedBar    = document.getElementById('speedBar');
const popText     = document.getElementById('popText');
const flashEl     = document.getElementById('flashEl');
const overlay     = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');

const startScreen    = document.getElementById('startScreen');
const gameScreen     = document.getElementById('gameScreen');
const pauseScreen    = document.getElementById('pauseScreen');
const gameoverScreen = document.getElementById('gameoverScreen');
const rankingScreen  = document.getElementById('rankingScreen');

// ─────────────────────────────────────────────────────
//  BUTTON EVENTS
// ─────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('rankingBtnStart').addEventListener('click', showRanking);
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('quitBtn').addEventListener('click', () => { cancelAnimationFrame(rafId); showScreen(startScreen); });
document.getElementById('saveScoreBtn').addEventListener('click', saveScore);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('backBtn').addEventListener('click', () => showScreen(startScreen));

document.getElementById('leftBtn').addEventListener('click',   () => move(-1));
document.getElementById('rightBtn').addEventListener('click',  () => move(1));
document.getElementById('downBtn').addEventListener('click',   () => softDrop());
document.getElementById('rotateBtn').addEventListener('click', () => rotate(1));
document.getElementById('dropBtn').addEventListener('click',   () => hardDrop());
document.getElementById('holdBtn').addEventListener('click',   () => holdPiece());

// ─────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────
let board, current, nextIdx, hold, canHold;
let score, level, lines, combo;
let isRunning, isPaused, gameOver;
let lastTime, dropCounter, dropInterval;
let rafId;
let flashTimeout;

let phase          = PHASE.PLAY;
let phaseTimer     = 0;
let flashingRows   = [];
let flashOn        = true;
let flashToggleTimer = 0;
let animCells      = [];   // {x, colorIdx, fromY, toY, curY}
let animProgress   = 0;
let particles      = [];

// ─────────────────────────────────────────────────────
//  BACKGROUND STARS
// ─────────────────────────────────────────────────────
const stars = [];
function initBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  stars.length = 0;
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: Math.random() * bgCanvas.width,
      y: Math.random() * bgCanvas.height,
      r: Math.random() * 1.2 + 0.3,
      speed: Math.random() * 0.3 + 0.05,
      alpha: Math.random(),
    });
  }
}
function animateBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  for (const s of stars) {
    s.alpha += (Math.random() - 0.5) * 0.03;
    s.alpha = Math.max(0.1, Math.min(1, s.alpha));
    s.y += s.speed;
    if (s.y > bgCanvas.height) { s.y = 0; s.x = Math.random() * bgCanvas.width; }
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(0,229,255,${s.alpha})`;
    bgCtx.fill();
  }
  requestAnimationFrame(animateBg);
}
initBg(); animateBg();
window.addEventListener('resize', initBg);

// ─────────────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────────────
function spawnParticles(row, colorIdx, count = 24) {
  const color = COLORS[colorIdx] || '#00e5ff';
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * CANVAS_W,
      y: (row + 0.5) * CELL,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 1.5) * 5,
      life: 1,
      decay: Math.random() * 0.035 + 0.02,
      r: Math.random() * 3 + 1,
      color,
    });
  }
}
function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= p.decay;
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ─────────────────────────────────────────────────────
//  SCREEN
// ─────────────────────────────────────────────────────
function showScreen(screen) {
  [startScreen, gameScreen, pauseScreen, gameoverScreen, rankingScreen]
    .forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ─────────────────────────────────────────────────────
//  PIECE HELPERS
// ─────────────────────────────────────────────────────
function randomPieceIdx() { return Math.floor(Math.random() * 7) + 1; }

function makePiece(idx) {
  return {
    matrix: PIECES[idx].map(r => [...r]),
    colorIdx: idx,
    x: Math.floor(COLS / 2) - Math.ceil(PIECES[idx][0].length / 2),
    y: 0,
  };
}

function rotateMatrix(m) {
  const n = m.length;
  return m[0].map((_, x) => m.map((_, y) => m[n - 1 - y][x]));
}

function collision(piece, brd, ox = 0, oy = 0) {
  for (let y = 0; y < piece.matrix.length; y++)
    for (let x = 0; x < piece.matrix[y].length; x++) {
      if (!piece.matrix[y][x]) continue;
      const nx = piece.x + x + ox;
      const ny = piece.y + y + oy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && brd[ny][nx]) return true;
    }
  return false;
}

const KICKS = [[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1]];

function rotate(dir = 1) {
  if (!current || isPaused || gameOver || phase !== PHASE.PLAY) return;
  const times = dir === 1 ? 1 : 3;
  let mat = current.matrix;
  for (let i = 0; i < times; i++) mat = rotateMatrix(mat);
  const prev = current.matrix;
  current.matrix = mat;
  for (const [kx, ky] of KICKS) {
    current.x += kx; current.y += ky;
    if (!collision(current, board)) return;
    current.x -= kx; current.y -= ky;
  }
  current.matrix = prev;
}

// ─────────────────────────────────────────────────────
//  MOVEMENT
// ─────────────────────────────────────────────────────
function move(dx) {
  if (!current || isPaused || gameOver || phase !== PHASE.PLAY) return;
  if (!collision(current, board, dx, 0)) current.x += dx;
}

function softDrop() {
  if (!current || isPaused || gameOver || phase !== PHASE.PLAY) return;
  if (!collision(current, board, 0, 1)) { current.y++; score += 1; updateHUD(); }
  else lock();
}

function hardDrop() {
  if (!current || isPaused || gameOver || phase !== PHASE.PLAY) return;
  let dropped = 0;
  while (!collision(current, board, 0, 1)) { current.y++; dropped++; }
  score += dropped * 2;
  updateHUD();
  lock();
}

function holdPiece() {
  if (!canHold || !current || isPaused || gameOver || phase !== PHASE.PLAY) return;
  canHold = false;
  const savedIdx = current.colorIdx;
  if (hold) { current = makePiece(hold); hold = savedIdx; }
  else { hold = savedIdx; spawnNext(); }
  drawMini(holdCtx, hold);
}

// ─────────────────────────────────────────────────────
//  LOCK
// ─────────────────────────────────────────────────────
function lock() {
  for (let y = 0; y < current.matrix.length; y++)
    for (let x = 0; x < current.matrix[y].length; x++) {
      if (!current.matrix[y][x]) continue;
      const ny = current.y + y;
      if (ny < 0) { triggerGameOver(); return; }
      board[ny][current.x + x] = current.matrix[y][x];
    }
  current = null;
  checkAndStartFlash();
}

// ─────────────────────────────────────────────────────
//  CHECK → FLASH PHASE
// ─────────────────────────────────────────────────────
function checkAndStartFlash() {
  flashingRows = [];
  for (let y = 0; y < ROWS; y++) {
    if (board[y].every(v => v !== 0)) flashingRows.push(y);
  }
  if (flashingRows.length === 0) {
    phase = PHASE.PLAY;
    spawnNext();
    canHold = true;
    return;
  }
  phase            = PHASE.LINE_FLASH;
  phaseTimer       = 0;
  flashOn          = true;
  flashToggleTimer = 0;
}

// ─────────────────────────────────────────────────────
//  FLASH PHASE UPDATE
// ─────────────────────────────────────────────────────
function updateFlash(dt) {
  phaseTimer       += dt;
  flashToggleTimer += dt;
  if (flashToggleTimer >= FLASH_INTERVAL) {
    flashToggleTimer -= FLASH_INTERVAL;
    flashOn = !flashOn;
  }
  if (phaseTimer >= FLASH_DURATION) {
    commitLinesClear();
  }
}

// ─────────────────────────────────────────────────────
//  COMMIT CLEAR → BUILD ANIM
// ─────────────────────────────────────────────────────
function commitLinesClear() {
  const cleared = flashingRows.length;

  // パーティクル
  flashingRows.forEach(row => {
    const sample = board[row].find(v => v !== 0) || 1;
    spawnParticles(row, sample, 28);
  });

  doFlash(cleared);

  // スコア
  combo++;
  const base       = SCORE_TABLE[cleared] || 1500;
  const comboBonus = COMBO_BONUS[Math.min(combo, COMBO_BONUS.length - 1)];
  score  += (base + comboBonus) * level;
  lines  += cleared;
  level   = Math.min(10, Math.floor(lines / 10) + 1);
  dropInterval = SPEEDS[level - 1];
  comboEl.textContent = combo;
  updateHUD();
  updateSpeedBar();

  let msg = '';
  if (cleared === 4) msg = 'TETRIS!!';
  else if (cleared === 3) msg = 'TRIPLE!';
  else if (cleared === 2) msg = 'DOUBLE!';
  if (combo > 1) msg = `COMBO ×${combo}` + (msg ? `\n${msg}` : '');
  if (msg) showPop(msg);

  // ── アニメデータ構築 ──────────────────────────────
  // 消去後のボードを計算
  const flashSet = new Set(flashingRows);
  const newBoard  = board.filter((_, i) => !flashSet.has(i));
  while (newBoard.length < ROWS) newBoard.unshift(new Array(COLS).fill(0));

  // 各セルの落下量 = そのセルより下にある消去行の数
  animCells = [];
  for (let y = 0; y < ROWS; y++) {
    if (flashSet.has(y)) continue;
    for (let x = 0; x < COLS; x++) {
      const colorIdx = board[y][x];
      if (!colorIdx) continue;
      const fallenBy = [...flashingRows].filter(r => r > y).length;
      if (fallenBy === 0) continue;   // 落下しないセルはアニメ不要
      animCells.push({ x, colorIdx, fromY: y, toY: y + fallenBy, curY: y });
    }
  }

  board = newBoard;

  phase         = PHASE.DROP_ANIM;
  phaseTimer    = 0;
  animProgress  = 0;
}

// ─────────────────────────────────────────────────────
//  DROP ANIM UPDATE
// ─────────────────────────────────────────────────────
function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1)       return n1*t*t;
  if (t < 2/d1)       { t -= 1.5/d1;  return n1*t*t + 0.75; }
  if (t < 2.5/d1)     { t -= 2.25/d1; return n1*t*t + 0.9375; }
                        t -= 2.625/d1; return n1*t*t + 0.984375;
}
function easeOutQuad(t) { return 1 - (1-t)*(1-t); }

function updateDropAnim(dt) {
  phaseTimer   += dt;
  animProgress  = Math.min(1, phaseTimer / DROP_DURATION);
  const t       = easeOutBounce(animProgress);

  for (const cell of animCells) {
    cell.curY = cell.fromY + (cell.toY - cell.fromY) * t;
  }

  if (animProgress >= 1) {
    animCells = [];
    phase     = PHASE.CHECK;
    phaseTimer = 0;
  }
}

// ─────────────────────────────────────────────────────
//  CHECK PHASE
// ─────────────────────────────────────────────────────
function updateCheck() {
  // ボードに新たなフルラインがあるか（連鎖）
  checkAndStartFlash();
}

// ─────────────────────────────────────────────────────
//  DRAW CELL
// ─────────────────────────────────────────────────────
function drawCell(c, x, y, colorIdx, size = CELL, ox = 0, oy = 0) {
  const px    = ox + x * size;
  const py    = oy + y * size;
  const color = COLORS[colorIdx];
  const glow  = GLOWS[colorIdx];
  const pad   = size * 0.06;

  c.shadowColor = glow;
  c.shadowBlur  = size * 0.6;
  c.fillStyle   = color;
  c.fillRect(px + pad, py + pad, size - pad*2, size - pad*2);

  c.shadowBlur  = 0;
  c.fillStyle   = 'rgba(255,255,255,0.18)';
  c.fillRect(px + pad, py + pad, size - pad*2, size * 0.3);

  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth   = 0.5;
  c.strokeRect(px + pad + 0.5, py + pad + 0.5, size - pad*2 - 1, size - pad*2 - 1);
}

// ─────────────────────────────────────────────────────
//  DRAW BOARD
// ─────────────────────────────────────────────────────
function drawGhost() {
  if (!current || phase !== PHASE.PLAY) return;
  let gy = current.y;
  while (!collision({ ...current, y: gy + 1 }, board)) gy++;
  ctx.globalAlpha = 0.18;
  current.matrix.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    ctx.fillStyle = COLORS[v];
    ctx.fillRect((current.x+x)*CELL+2, (gy+y)*CELL+2, CELL-4, CELL-4);
  }));
  ctx.globalAlpha = 1;
}

function drawBoard() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid lines
  ctx.strokeStyle = 'rgba(0,229,255,0.04)';
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, CANVAS_H); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(CANVAS_W, y*CELL); ctx.stroke();
  }

  // ── FLASH PHASE ──────────────────────────────────
  if (phase === PHASE.LINE_FLASH) {
    const flashSet = new Set(flashingRows);
    board.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      if (flashSet.has(y)) {
        if (flashOn) {
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur  = CELL * 0.8;
          ctx.fillStyle   = '#ffffff';
          const pad = CELL * 0.06;
          ctx.fillRect(x*CELL+pad, y*CELL+pad, CELL-pad*2, CELL-pad*2);
          ctx.shadowBlur = 0;
        } else {
          drawCell(ctx, x, y, v);
        }
      } else {
        drawCell(ctx, x, y, v);
      }
    }));
    updateParticles(); drawParticles();
    return;
  }

  // ── DROP ANIM PHASE ───────────────────────────────
  if (phase === PHASE.DROP_ANIM) {
    // アニメ中セルの「到着先(toY)」をキーにしたセット
    const animToSet = new Set(animCells.map(c => `${c.x},${c.toY}`));

    // 静止セル（落下しないもの）を描画
    board.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      // このセルがアニメ中セルの到着先なら、アニメ側で描くのでスキップ
      if (animToSet.has(`${x},${y}`)) return;
      drawCell(ctx, x, y, v);
    }));

    // アニメ中セルを浮動小数点Yで描画
    for (const cell of animCells) {
      const px    = cell.x * CELL;
      const py    = cell.curY * CELL;
      const pad   = CELL * 0.06;
      const color = COLORS[cell.colorIdx];
      const glow  = GLOWS[cell.colorIdx];

      ctx.shadowColor = glow;
      ctx.shadowBlur  = CELL * 0.6;
      ctx.fillStyle   = color;
      ctx.fillRect(px+pad, py+pad, CELL-pad*2, CELL-pad*2);

      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,255,0.18)';
      ctx.fillRect(px+pad, py+pad, CELL-pad*2, CELL*0.3);

      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(px+pad+0.5, py+pad+0.5, CELL-pad*2-1, CELL-pad*2-1);
    }

    updateParticles(); drawParticles();
    return;
  }

  // ── PLAY / CHECK PHASE ────────────────────────────
  board.forEach((row, y) => row.forEach((v, x) => {
    if (v) drawCell(ctx, x, y, v);
  }));
  drawGhost();
  if (current) {
    current.matrix.forEach((row, y) => row.forEach((v, x) => {
      if (v) drawCell(ctx, current.x+x, current.y+y, v);
    }));
  }
  updateParticles(); drawParticles();
}

// ─────────────────────────────────────────────────────
//  MINI CANVAS (NEXT / HOLD)
// ─────────────────────────────────────────────────────
function drawMini(ctx2, idx) {
  const cw = ctx2.canvas.width, ch = ctx2.canvas.height;
  ctx2.clearRect(0, 0, cw, ch);
  if (!idx) return;
  const mat = PIECES[idx];
  const cs  = Math.min(cw, ch) / (mat.length + 1);
  const ox  = (cw - mat[0].length * cs) / 2;
  const oy  = (ch - mat.length    * cs) / 2;
  mat.forEach((row, y) => row.forEach((v, x) => { if (v) drawCell(ctx2, x, y, v, cs, ox, oy); }));
}

// ─────────────────────────────────────────────────────
//  FLASH EFFECT (board overlay)
// ─────────────────────────────────────────────────────
function doFlash(clearedCount) {
  const colors = [
    'rgba(0,229,255,0.35)',
    'rgba(255,224,0,0.45)',
    'rgba(255,45,120,0.5)',
    'rgba(191,95,255,0.6)',
  ];
  flashEl.style.background  = colors[Math.min(clearedCount - 1, 3)];
  flashEl.style.opacity     = '1';
  flashEl.style.transition  = 'none';
  clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => {
    flashEl.style.transition = 'opacity 0.3s ease';
    flashEl.style.opacity    = '0';
  }, 80);
}

// ─────────────────────────────────────────────────────
//  HUD
// ─────────────────────────────────────────────────────
function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  levelEl.textContent = level;
  linesEl.textContent = lines;
}
function updateSpeedBar() {
  const pct = Math.round(((level - 1) / 10) * 100);
  speedBar.style.width = `${Math.max(10, pct)}%`;
}

// ─────────────────────────────────────────────────────
//  POP TEXT
// ─────────────────────────────────────────────────────
let popTimer;
function showPop(msg) {
  popText.textContent = msg;
  popText.classList.remove('animate');
  void popText.offsetWidth;
  popText.classList.add('animate');
  clearTimeout(popTimer);
  popTimer = setTimeout(() => popText.classList.remove('animate'), 950);
}

// ─────────────────────────────────────────────────────
//  SPAWN NEXT
// ─────────────────────────────────────────────────────
function spawnNext() {
  if (nextIdx === undefined) nextIdx = randomPieceIdx();
  current  = makePiece(nextIdx);
  nextIdx  = randomPieceIdx();
  drawMini(nextCtx, nextIdx);
  if (collision(current, board)) { triggerGameOver(); }
}

// ─────────────────────────────────────────────────────
//  GAME OVER
// ─────────────────────────────────────────────────────
function triggerGameOver() {
  gameOver = true; isRunning = false;
  cancelAnimationFrame(rafId);
  document.getElementById('finalScore').textContent = score.toLocaleString();
  const ranking = getRanking();
  const rank    = ranking.findIndex(r => score > r.score);
  let msg = '';
  if (ranking.length < 5 || rank !== -1) {
    const pos = rank === -1 ? ranking.length + 1 : rank + 1;
    msg = `🏆 ${pos}位にランクイン！`;
    document.getElementById('nameWrap').style.display = 'flex';
  } else {
    document.getElementById('nameWrap').style.display = 'none';
    msg = 'TOP5に届かず…再挑戦！';
  }
  document.getElementById('rankMessage').textContent = msg;
  showScreen(gameoverScreen);
}

// ─────────────────────────────────────────────────────
//  RANKING
// ─────────────────────────────────────────────────────
function getRanking() {
  try { return JSON.parse(localStorage.getItem('neonTetrisRanking') || '[]'); } catch { return []; }
}
function saveRanking(data) { localStorage.setItem('neonTetrisRanking', JSON.stringify(data)); }

function saveScore() {
  const name    = (document.getElementById('playerName').value.trim() || 'PLAYER').toUpperCase();
  const ranking = getRanking();
  ranking.push({ name, score });
  ranking.sort((a, b) => b.score - a.score);
  const trimmed = ranking.slice(0, 5);
  saveRanking(trimmed);
  document.getElementById('nameWrap').style.display = 'none';
  showRankingList(trimmed);
}

function showRanking() { showRankingList(getRanking()); showScreen(rankingScreen); }

function showRankingList(data) {
  const list = document.getElementById('rankingList');
  list.innerHTML = '';
  if (!data.length) {
    list.innerHTML = '<li style="color:var(--text-dim);font-family:var(--font-head);font-size:.8rem;letter-spacing:.1em;justify-content:center">NO DATA YET</li>';
    return;
  }
  const medals = ['rank-1','rank-2','rank-3','rank-other','rank-other'];
  data.slice(0, 5).forEach((entry, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-num ${medals[i]}">${i+1}</span>
      <span class="rank-name">${entry.name}</span>
      <span class="rank-score">${entry.score.toLocaleString()}</span>`;
    list.appendChild(li);
  });
}

// ─────────────────────────────────────────────────────
//  PAUSE
// ─────────────────────────────────────────────────────
function togglePause() {
  if (gameOver || !isRunning) return;
  isPaused = !isPaused;
  if (isPaused) {
    showScreen(pauseScreen);
    gameScreen.classList.add('active');
    overlay.classList.remove('hidden');
    overlayText.textContent = 'PAUSED';
  } else {
    pauseScreen.classList.remove('active');
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  }
}

// ─────────────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────────────
function loop(timestamp) {
  if (isPaused || gameOver) return;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  switch (phase) {
    case PHASE.PLAY:
      dropCounter += dt;
      if (dropCounter >= dropInterval) {
        dropCounter = 0;
        if (current && !collision(current, board, 0, 1)) current.y++;
        else if (current) lock();
      }
      break;
    case PHASE.LINE_FLASH:
      updateFlash(dt);
      break;
    case PHASE.DROP_ANIM:
      updateDropAnim(dt);
      break;
    case PHASE.CHECK:
      updateCheck();
      break;
  }

  drawBoard();
  rafId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────────────
//  START GAME
// ─────────────────────────────────────────────────────
function startGame() {
  cancelAnimationFrame(rafId);

  board        = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  score        = 0; level = 1; lines = 0; combo = 0;
  dropInterval = SPEEDS[0]; dropCounter = 0;
  isRunning    = true; isPaused = false; gameOver = false;
  hold         = null; canHold = true; nextIdx = undefined;
  particles    = []; animCells = [];
  phase        = PHASE.PLAY; phaseTimer = 0;
  flashingRows = []; animProgress = 0;

  gameCanvas.width  = CANVAS_W;
  gameCanvas.height = CANVAS_H;

  updateHUD(); updateSpeedBar();
  comboEl.textContent = 0;
  overlay.classList.add('hidden');
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);

  spawnNext();
  showScreen(gameScreen);
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────────────
//  KEYBOARD
// ─────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  switch (e.code) {
    case 'ArrowLeft':  e.preventDefault(); move(-1);    break;
    case 'ArrowRight': e.preventDefault(); move(1);     break;
    case 'ArrowDown':  e.preventDefault(); softDrop();  break;
    case 'ArrowUp':    e.preventDefault(); rotate(1);   break;
    case 'KeyZ':       rotate(-1);                      break;
    case 'Space':      e.preventDefault(); hardDrop();  break;
    case 'KeyC':       holdPiece();                     break;
    case 'Escape':     togglePause();                   break;
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ─────────────────────────────────────────────────────
//  TOUCH
// ─────────────────────────────────────────────────────
let touchStart = null, touchLastX = null, touchMoveAccum = 0;

gameCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  touchStart      = { x: t.clientX, y: t.clientY, time: Date.now() };
  touchLastX      = t.clientX;
  touchMoveAccum  = 0;
}, { passive: false });

gameCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!touchStart || isPaused || gameOver) return;
  const t  = e.touches[0];
  const dx = t.clientX - touchLastX;
  touchMoveAccum += dx;
  if (Math.abs(touchMoveAccum) > CELL) {
    move(touchMoveAccum > 0 ? 1 : -1);
    touchMoveAccum = 0;
  }
  touchLastX = t.clientX;
}, { passive: false });

gameCanvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touchStart || isPaused || gameOver) return;
  const dt = Date.now() - touchStart.time;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dy) > 60 && dy > 0) hardDrop();
  else if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && dt < 250) rotate(1);
  touchStart = null;
}, { passive: false });

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
showScreen(startScreen);
