'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Formation Control Simulator
   Ports three controllers from aol_formation_controller.py to vanilla JS.
   Single canvas, fixed viewport — leader moves around the screen.
   Ghost circles show where each algorithm places the follower agents.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Config ─────────────────────────────────────────────────────────────── */
const SIM_N   = 4;        // number of agents
const SIM_DIM = 3;        // x, y, z
const SIM_DT  = 1 / 60;  // timestep (s)

/* World-to-canvas: world centre at canvas centre, SCALE px per metre */
const SCALE     = 175;    // px / m
const WORLD_CX  = 0.5;   // world x at canvas cx
const WORLD_CY  = 0.5;   // world y at canvas cy

const MIN_R = 10;         // circle radius at z=0
const MAX_R = 32;         // circle radius at z=1
const GHOST_A = 0.55;     // follower opacity

const KEY_SPD = 0.020;    // keyboard speed (m/frame)
const H_STEP  = 0.04;     // height step per keypress
const NOISE   = 0.55;     // follower start offset (m) — large enough to see convergence
const MAX_VEL = 6.0;      // velocity clamp

/* ═══════════════════════════════════════════════════════════════════════════
   ▼▼▼  ALGORITHM PARAMETERS — edit these to tune performance  ▼▼▼
   ═══════════════════════════════════════════════════════════════════════════ */
const ALGO_PARAMS = {
  fixed: {
    kp:  1.8,   // proportional gain — larger = faster convergence (try 0.5–3.0)
    wij: 0.5,   // fixed edge weight for every connected pair (try 0.1–1.0)
  },
  adaptive: {               // OExpGF — exponential Lyapunov adaptive weights
    kp:      1.8,           // proportional gain
    rho:     0.9,           // decay rate ∈ (0,1) — smaller = tighter exponential decay (try 0.1–0.95)
    eta:     2.0,           // weight learning rate — safe up to ~5 with the non-neg clamp (try 0.5–5.0)
    epsilon: 0.02,          // projection mix with prior — minimum weight floor (try 0.01–0.1)
  },
  gradient: {               // OGF — online gradient flow (unconstrained weights)
    kp:      1.8,           // proportional gain
    eta:     2.0,           // weight learning rate (try 0.01–5.0; large values = faster but noisier)
    epsilon: 0.02,          // mixing with adjComm prior — prevents weight collapse (try 0.01–0.1)
  },
};
/* ▲▲▲  end of tunable parameters  ▲▲▲
   ═══════════════════════════════════════════════════════════════════════════ */

/* Desired formation (square in XY plane, all at same height) */
const INIT_COORDS = [
  [0.0, 0.0, 0.50],   // agent 0 — leader
  [0.0, 1.0, 0.50],
  [1.0, 1.0, 0.50],
  [1.0, 0.0, 0.50],
];

const ALGO_COLORS = [
  [100, 149, 237],   // Fixed    — blue
  [ 70, 200, 110],   // Adaptive — green
  [255, 160,  50],   // Gradient — orange
];
const ALGO_NAMES = ['Fixed Weights', 'Adaptive Exp.', 'Gradient Flow'];

/* ── Math utilities ─────────────────────────────────────────────────────── */
function zeros(...dims) {
  if (dims.length === 1) return new Array(dims[0]).fill(0);
  return Array.from({ length: dims[0] }, () => zeros(...dims.slice(1)));
}

function ringAdj(n) {
  const A = zeros(n, n);
  for (let i = 0; i < n; i++) {
    A[i][(i - 1 + n) % n] = 1;
    A[i][(i + 1)     % n] = 1;
  }
  return A;
}

function computeDji(xk) {
  const dji = zeros(SIM_N, SIM_N, SIM_DIM);
  for (let i = 0; i < SIM_N; i++)
    for (let j = 0; j < SIM_N; j++)
      for (let d = 0; d < SIM_DIM; d++)
        dji[i][j][d] = xk[j][d] - xk[i][d];
  return dji;
}

function subDji(a, b) {
  const c = zeros(SIM_N, SIM_N, SIM_DIM);
  for (let i = 0; i < SIM_N; i++)
    for (let j = 0; j < SIM_N; j++)
      for (let d = 0; d < SIM_DIM; d++)
        c[i][j][d] = a[i][j][d] - b[i][j][d];
  return c;
}

function normalizeRowsByMax(M) {
  const out = zeros(SIM_N, SIM_N);
  for (let i = 0; i < SIM_N; i++) {
    let mx = 0;
    for (let j = 0; j < SIM_N; j++) mx = Math.max(mx, Math.abs(M[i][j]));
    if (mx === 0) mx = 1;
    for (let j = 0; j < SIM_N; j++) out[i][j] = M[i][j] / mx;
  }
  return out;
}

function shapeError(djiCurr, djiOg) {
  let sum = 0, cnt = 0;
  for (let i = 0; i < SIM_N; i++)
    for (let j = 0; j < SIM_N; j++)
      for (let d = 0; d < SIM_DIM; d++) {
        const e = djiCurr[i][j][d] - djiOg[i][j][d];
        sum += e * e; cnt++;
      }
  return Math.sqrt(sum / cnt);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ── Controller: Fixed Weights ──────────────────────────────────────────── */
class FixedWeights {
  constructor(coords, kp = ALGO_PARAMS.fixed.kp, wij = ALGO_PARAMS.fixed.wij) {
    this.kp    = kp;
    this.adj   = ringAdj(SIM_N);
    this.wij   = this.adj.map(r => r.map(v => v * wij));
    this.djiOg = computeDji(coords);
  }
  update(xk) {
    const djiCurr = computeDji(xk);
    const err = subDji(djiCurr, this.djiOg);
    const vk  = zeros(SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let d = 0; d < SIM_DIM; d++) {
        let v = 0;
        for (let j = 0; j < SIM_N; j++)
          v += this.adj[i][j] * this.wij[i][j] * err[i][j][d];
        vk[i][d] = clamp(this.kp * v, -MAX_VEL, MAX_VEL);
      }
    return {
      xkp:    xk.map((xi, i) => xi.map((x, d) => x + SIM_DT * vk[i][d])),
      errMag: shapeError(djiCurr, this.djiOg),
    };
  }
}

/* ── Controller: Adaptive Weights (Exponential / Lyapunov) ─────────────── */
class AdaptiveWeights {
  constructor(coords,
              kp      = ALGO_PARAMS.adaptive.kp,
              rho     = ALGO_PARAMS.adaptive.rho,
              eta     = ALGO_PARAMS.adaptive.eta,
              epsilon = ALGO_PARAMS.adaptive.epsilon) {
    this.kp = kp; this.rho = rho; this.eta = eta; this.epsilon = epsilon;
    this.logRho  = Math.log(rho);
    this.adj     = ringAdj(SIM_N);
    this.adjComm = this.adj.map(r => r.map(v => v * 0.5));
    this.djiOg   = computeDji(coords);
    this.wPred   = this.adj.map(r => r.slice());
    this.w       = this.adjComm.map(r => r.slice());
    this.delXw   = zeros(SIM_N, SIM_N, SIM_DIM);
    this.l       = zeros(SIM_N, SIM_N);
  }
  update(xk) {
    const djiCurr = computeDji(xk);
    const err     = subDji(djiCurr, this.djiOg);

    const gradE = zeros(SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let d = 0; d < SIM_DIM; d++) {
        let g = 0;
        for (let j = 0; j < SIM_N; j++) g += this.adj[i][j] * err[i][j][d];
        gradE[i][d] = -g;
      }

    /* delXw is ∂x/∂w — leaky integrator (decay 0.99/frame ≈ 1.7 s time constant)
       prevents unbounded growth under continuous leader motion */
    const DELXW_DECAY = 0.99;
    const delXwPlus = zeros(SIM_N, SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        for (let d = 0; d < SIM_DIM; d++)
          delXwPlus[i][j][d] = this.delXw[i][j][d] * DELXW_DECAY
                                + SIM_DT * this.kp * err[i][j][d];

    const delEw = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        for (let d = 0; d < SIM_DIM; d++)
          delEw[i][j] += gradE[i][d] * this.delXw[i][j][d];

    const lPlus = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        lPlus[i][j] = this.l[i][j] + SIM_DT * (this.logRho * this.l[i][j] + delEw[i][j]);

    /* OExpGF enforces non-negative weights — clamp before normalisation.
       Without this clamp, wPredRaw can flip sign when delEw is large,
       making normaliseRowsByMax mix positive/negative values → rowSum ≈ 0
       → effective weight collapses to epsilon*adjComm → agent freezes. */
    const wPredRaw = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        wPredRaw[i][j] = Math.max(0,
          this.wPred[i][j]
          - this.eta * this.wPred[i][j] * SIM_DT * (this.logRho * this.l[i][j] + delEw[i][j]));
    const wPredNorm = normalizeRowsByMax(wPredRaw);

    const wNew = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++) {
      let rowSum = 0;
      for (let j = 0; j < SIM_N; j++) rowSum += this.adjComm[i][j] * wPredNorm[i][j];
      if (rowSum === 0) rowSum = 1;
      for (let j = 0; j < SIM_N; j++)
        wNew[i][j] = (1 - this.epsilon) * (this.adjComm[i][j] * wPredNorm[i][j] / rowSum)
                     + this.epsilon * this.adjComm[i][j];
    }

    const vk = zeros(SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let d = 0; d < SIM_DIM; d++) {
        let v = 0;
        for (let j = 0; j < SIM_N; j++) v += this.adj[i][j] * wNew[i][j] * err[i][j][d];
        vk[i][d] = clamp(this.kp * v, -MAX_VEL, MAX_VEL);
      }

    this.delXw = delXwPlus;
    this.l     = lPlus;
    this.wPred = wPredNorm;
    this.w     = wNew;

    return {
      xkp:    xk.map((xi, i) => xi.map((x, d) => x + SIM_DT * vk[i][d])),
      errMag: shapeError(djiCurr, this.djiOg),
    };
  }
}

/* ── Controller: Online Gradient Flow ───────────────────────────────────── */
class OnlineGradientFlow {
  constructor(coords,
              kp      = ALGO_PARAMS.gradient.kp,
              eta     = ALGO_PARAMS.gradient.eta,
              epsilon = ALGO_PARAMS.gradient.epsilon) {
    this.kp = kp; this.eta = eta; this.epsilon = epsilon;
    this.adj     = ringAdj(SIM_N);
    this.adjComm = this.adj.map(r => r.map(v => v * 0.5));
    this.djiOg   = computeDji(coords);
    this.wPred   = this.adjComm.map(r => r.slice());
    this.w       = this.adjComm.map(r => r.slice());
    this.delXw   = zeros(SIM_N, SIM_N, SIM_DIM);
  }
  update(xk) {
    const djiCurr = computeDji(xk);
    const err     = subDji(djiCurr, this.djiOg);

    const gradE = zeros(SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let d = 0; d < SIM_DIM; d++) {
        let g = 0;
        for (let j = 0; j < SIM_N; j++) g += this.adj[i][j] * err[i][j][d];
        gradE[i][d] = -g;
      }

    const delEw = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        for (let d = 0; d < SIM_DIM; d++)
          delEw[i][j] += this.delXw[i][j][d] * gradE[i][d];

    /* OGF weights are unconstrained — clamp to a sane range so large delEw
       (from unbounded delXw) can't drive wPred to extreme negative values
       which would invert the control direction and freeze agents. */
    const wPredNew = zeros(SIM_N, SIM_N);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        wPredNew[i][j] = clamp(
          this.wPred[i][j] - this.eta * SIM_DT * delEw[i][j] * this.adj[i][j],
          -2, 4
        );

    const wNew = wPredNew.map((row, i) =>
      row.map((v, j) => (1 - this.epsilon) * v + this.epsilon * this.adjComm[i][j])
    );

    /* Same leaky integrator as adaptive — prevents delXw growing without
       bound under continuous leader motion */
    const DELXW_DECAY = 0.99;
    const delXwPlus = zeros(SIM_N, SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let j = 0; j < SIM_N; j++)
        for (let d = 0; d < SIM_DIM; d++)
          delXwPlus[i][j][d] = this.delXw[i][j][d] * DELXW_DECAY
            + SIM_DT * this.kp * err[i][j][d] * this.adj[i][j];

    const vk = zeros(SIM_N, SIM_DIM);
    for (let i = 0; i < SIM_N; i++)
      for (let d = 0; d < SIM_DIM; d++) {
        let v = 0;
        for (let j = 0; j < SIM_N; j++) v += this.adj[i][j] * wNew[i][j] * err[i][j][d];
        vk[i][d] = clamp(this.kp * v, -MAX_VEL, MAX_VEL);
      }

    this.delXw = delXwPlus;
    this.wPred = wPredNew;
    this.w     = wNew;

    return {
      xkp:    xk.map((xi, i) => xi.map((x, d) => x + SIM_DT * vk[i][d])),
      errMag: shapeError(djiCurr, this.djiOg),
    };
  }
}

/* ── Parameter panel ────────────────────────────────────────────────────── */
const PARAM_DEFS = [
  { color: '#6495ED', name: 'Fixed Weights', idx: 0, src: ALGO_PARAMS.fixed,
    rows: [
      { key: 'kp',  label: 'k<sub>p</sub>', min: 0.2, max: 4.0,  step: 0.1   },
      { key: 'wij', label: 'w<sub>ij</sub>', min: 0.05, max: 1.5, step: 0.05  },
    ]
  },
  { color: '#50C878', name: 'OExpGF', idx: 1, src: ALGO_PARAMS.adaptive,
    rows: [
      { key: 'kp',      label: 'k<sub>p</sub>', min: 0.2,   max: 4.0,  step: 0.1   },
      { key: 'rho',     label: '&rho;',          min: 0.05,  max: 0.99, step: 0.01  },
      { key: 'eta',     label: '&eta;',          min: 0.1,   max: 5.0,  step: 0.1   },
      { key: 'epsilon', label: '&epsilon;',      min: 0.005, max: 0.1,  step: 0.005 },
    ]
  },
  { color: '#FFA500', name: 'OGF', idx: 2, src: ALGO_PARAMS.gradient,
    rows: [
      { key: 'kp',      label: 'k<sub>p</sub>', min: 0.2,   max: 4.0,  step: 0.1   },
      { key: 'eta',     label: '&eta;',          min: 0.01,  max: 5.0,  step: 0.05  },
      { key: 'epsilon', label: '&epsilon;',      min: 0.005, max: 0.1,  step: 0.005 },
    ]
  },
];

function reinitCtrl(idx) {
  if (!algos[idx]) return;
  const state = algos[idx].state;   // keep current agent positions
  if (idx === 0) algos[idx].ctrl = new FixedWeights(INIT_COORDS);
  else if (idx === 1) algos[idx].ctrl = new AdaptiveWeights(INIT_COORDS);
  else           algos[idx].ctrl = new OnlineGradientFlow(INIT_COORDS);
  algos[idx].state = state;
}

function buildParamPanel() {
  const panel = document.getElementById('paramPanel');
  if (!panel) return;

  panel.innerHTML = PARAM_DEFS.map(g => `
<div class="param-group">
<div class="param-group-title">
<span class="algo-dot" style="background:${g.color};width:8px;height:8px;"></span>${g.name}
</div>
${g.rows.map(r => `
<div class="param-row">
<span class="param-label">${r.label}</span>
<input type="range" id="sl-${g.idx}-${r.key}"
  min="${r.min}" max="${r.max}" step="${r.step}" value="${g.src[r.key]}">
<span class="param-val" id="sl-${g.idx}-${r.key}-v">${g.src[r.key].toFixed(2)}</span>
</div>`).join('')}
</div>`).join('');

  PARAM_DEFS.forEach(g => {
    g.rows.forEach(r => {
      const sl  = document.getElementById(`sl-${g.idx}-${r.key}`);
      const val = document.getElementById(`sl-${g.idx}-${r.key}-v`);
      if (!sl) return;
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        g.src[r.key] = v;
        val.textContent = v.toFixed(2);
        reinitCtrl(g.idx);
      });
    });
  });
}

/* ── Predefined paths (world metres) ────────────────────────────────────── */
function makeFigureEight(n = 280) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * 2 * Math.PI;
    pts.push([0.5 + 0.6 * Math.sin(t), 0.5 + 0.6 * Math.sin(t) * Math.cos(t), 0.50]);
  }
  return pts;
}
function makeSpiral(n = 360) {
  // Outward leg: inner radius → outer over 2 full turns
  const half = [];
  for (let k = 0; k < n; k++) {
    const frac = k / (n - 1);
    const t = frac * 4 * Math.PI;
    const r = 0.08 + 0.82 * frac;
    half.push([0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t), 0.20 + 0.55 * frac]);
  }
  // Append reversed leg so the loop winds back in instead of snapping
  return [...half, ...[...half].reverse()];
}
function makeOctagon(n = 160) {
  const sides = 8, R = 0.58, sa = (2 * Math.PI) / sides;
  return Array.from({ length: n }, (_, k) => {
    const t      = (k / n) * 2 * Math.PI;
    const sector = Math.floor(t / sa);
    const local  = t - sector * sa;
    const r      = R * Math.cos(sa / 2) / Math.cos(local - sa / 2);
    return [0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t), 0.50];
  });
}

/* ── Simulation state ───────────────────────────────────────────────────── */
let canvas, ctx, canvasW, canvasH;

/* Leader in world coordinates */
let leader = { wx: 0.0, wy: 0.0, wz: 0.5 };

/* Each algo: { ctrl, state, errMag } */
let algos = [];

const PATHS = {};
let currentPath = 'none';
let pathT = 0;
let simPaused = false;
const keys = {};

/* Drag */
let dragging = false, dragStart = null, leaderAtDrag = null;

/* ── Coordinate helpers (fixed viewport) ────────────────────────────────── */
function w2c(wx, wy) {
  return [
    canvasW / 2 + (wx - WORLD_CX) * SCALE,
    canvasH / 2 - (wy - WORLD_CY) * SCALE,
  ];
}
function c2w(cx, cy) {
  return [
    WORLD_CX + (cx - canvasW / 2) / SCALE,
    WORLD_CY - (cy - canvasH / 2) / SCALE,
  ];
}
function radZ(wz) { return MIN_R + (MAX_R - MIN_R) * clamp(wz, 0, 1); }

/* ── Init / reset ───────────────────────────────────────────────────────── */
function noisyFollowers(coords) {
  return coords.map((pt, i) =>
    i === 0 ? pt.slice() : pt.map(v => v + (Math.random() * 2 - 1) * NOISE)
  );
}

function deepCopy(arr) {
  return arr.map(r => r.slice());
}

function initAlgos() {
  leader = { wx: INIT_COORDS[0][0], wy: INIT_COORDS[0][1], wz: INIT_COORDS[0][2] };
  /* All algorithms start from the SAME noisy initial state — fair comparison */
  const sharedInit = noisyFollowers(INIT_COORDS);
  algos = [
    { ctrl: new FixedWeights(INIT_COORDS),       state: deepCopy(sharedInit), errMag: 0 },
    { ctrl: new AdaptiveWeights(INIT_COORDS),     state: deepCopy(sharedInit), errMag: 0 },
    { ctrl: new OnlineGradientFlow(INIT_COORDS),  state: deepCopy(sharedInit), errMag: 0 },
  ];
  pathT = 0;
  simPaused = false;
}

/* ── Draw ───────────────────────────────────────────────────────────────── */
function draw() {
  const W = canvasW, H = canvasH;
  ctx.clearRect(0, 0, W, H);

  /* Background */
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(0, 0, W, H);

  /* Grid */
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const gs = SCALE * 0.5;
  const ox = ((W / 2 - WORLD_CX * SCALE) % gs + gs) % gs;
  const oy = ((H / 2 + WORLD_CY * SCALE) % gs + gs) % gs;
  for (let x = ox; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = oy; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  /* Desired formation ghost (dim dotted circles at correct relative positions) */
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  for (let i = 1; i < SIM_N; i++) {
    const tx = leader.wx + INIT_COORDS[i][0] - INIT_COORDS[0][0];
    const ty = leader.wy + INIT_COORDS[i][1] - INIT_COORDS[0][1];
    const [cx, cy] = w2c(tx, ty);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, radZ(INIT_COORDS[i][2]), 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.restore();

  /* Ring edges (dashed) — followers only, per algorithm */
  const adj = algos[0].ctrl.adj;
  for (let a = 0; a < algos.length; a++) {
    const [r, g, b] = ALGO_COLORS[a];
    const st = algos[a].state;
    ctx.save();
    ctx.globalAlpha = GHOST_A * 0.4;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 4]);
    for (let i = 1; i < SIM_N; i++)
      for (let j = i + 1; j < SIM_N; j++) {
        if (!adj[i][j]) continue;
        const [ax, ay] = w2c(st[i][0], st[i][1]);
        const [bx, by] = w2c(st[j][0], st[j][1]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    /* leader → neighbours */
    const [lx, ly] = w2c(leader.wx, leader.wy);
    ctx.setLineDash([2, 6]);
    ctx.globalAlpha = GHOST_A * 0.25;
    for (let j = 0; j < SIM_N; j++) {
      if (!adj[0][j]) continue;
      const [fx, fy] = w2c(st[j][0], st[j][1]);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.restore();
  }

  /* Follower ghost circles — agents 1..N-1 */
  for (let a = 0; a < algos.length; a++) {
    const [r, g, b] = ALGO_COLORS[a];
    const st = algos[a].state;
    for (let i = 1; i < SIM_N; i++) {
      const [cx, cy] = w2c(st[i][0], st[i][1]);
      const rad = radZ(st[i][2]);
      ctx.save();
      ctx.globalAlpha = GHOST_A;
      ctx.fillStyle   = `rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.fill();
      ctx.globalAlpha = Math.min(1, GHOST_A + 0.2);
      ctx.strokeStyle = `rgb(${Math.min(255,r+50)},${Math.min(255,g+50)},${Math.min(255,b+50)})`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.stroke();
      /* agent index */
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = '#fff';
      ctx.font        = `bold ${Math.round(rad * 0.72)}px monospace`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i, cx, cy);
      ctx.restore();
    }
  }

  /* Leader — solid white, drawn last (on top) */
  const [lx, ly] = w2c(leader.wx, leader.wy);
  const lr = radZ(leader.wz);
  ctx.save();
  /* glow */
  const grad = ctx.createRadialGradient(lx, ly, lr * 0.5, lx, ly, lr + 8);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(lx, ly, lr + 8, 0, 2 * Math.PI); ctx.fill();
  /* fill */
  ctx.fillStyle = '#d8d8d8';
  ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 2 * Math.PI); ctx.fill();
  /* border */
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 2 * Math.PI); ctx.stroke();
  /* label */
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.round(lr * 0.7)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('0', lx, ly);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace'; ctx.textBaseline = 'top';
  ctx.fillText('LEADER', lx, ly + lr + 4);
  ctx.restore();

  /* Legend bottom-left */
  const pad = 12, lh = 21;
  const legX = pad, legY = H - pad - algos.length * lh - 8;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(legX - 4, legY - 6, 230, algos.length * lh + 12, 4);
  else ctx.rect(legX - 4, legY - 6, 230, algos.length * lh + 12);
  ctx.fill();
  algos.forEach(({ errMag }, a) => {
    const [r, g, b] = ALGO_COLORS[a];
    const ty = legY + a * lh + 8;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.arc(legX + 7, ty, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ccc';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${ALGO_NAMES[a]}  err=${errMag.toFixed(3)}`, legX + 19, ty);
  });
  ctx.restore();

  /* HUD top bar */
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#8ed6fb';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pLabel = currentPath === 'none' ? 'manual' : currentPath;
  const pStr   = simPaused ? '  [PAUSED]' : '';
  ctx.fillText(
    `path: ${pLabel}${pStr}   |   leader (${leader.wx.toFixed(2)}, ${leader.wy.toFixed(2)})   |   h: ${leader.wz.toFixed(2)}`,
    W / 2, 15
  );
  ctx.restore();
}

/* ── Update ─────────────────────────────────────────────────────────────── */
function updateLeader() {
  if (currentPath !== 'none' && !simPaused) {
    const pt = PATHS[currentPath][Math.floor(pathT) % PATHS[currentPath].length];
    leader.wx = pt[0]; leader.wy = pt[1]; leader.wz = pt[2];
    pathT += 0.45;
  } else if (currentPath === 'none') {
    if (keys['ArrowLeft'])  leader.wx -= KEY_SPD;
    if (keys['ArrowRight']) leader.wx += KEY_SPD;
    if (keys['ArrowUp'])    leader.wy += KEY_SPD;
    if (keys['ArrowDown'])  leader.wy -= KEY_SPD;
    if (keys['q'] || keys['Q']) leader.wz = clamp(leader.wz + H_STEP, 0, 1);
    if (keys['w'] || keys['W']) leader.wz = clamp(leader.wz - H_STEP, 0, 1);
  }
}

function updateAlgos() {
  const lp = [leader.wx, leader.wy, leader.wz];
  for (const algo of algos) {
    algo.state[0] = lp.slice();
    const { xkp, errMag } = algo.ctrl.update(algo.state);
    algo.state    = xkp;
    algo.state[0] = lp.slice();
    algo.errMag   = errMag;
  }
}

function tick() {
  updateLeader();
  updateAlgos();
  draw();
  requestAnimationFrame(tick);
}

/* ── Canvas helpers ─────────────────────────────────────────────────────── */
function getCanvasXY(e, isTouch) {
  const rect = canvas.getBoundingClientRect();
  const src  = isTouch ? e.touches[0] : e;
  const scX  = canvas.width  / rect.width;
  const scY  = canvas.height / rect.height;
  return [(src.clientX - rect.left) * scX, (src.clientY - rect.top) * scY];
}

/* ── Main init ──────────────────────────────────────────────────────────── */
function init() {
  canvas = document.getElementById('formationCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  function sizeCanvas() {
    const parent = canvas.parentElement;
    const w = parent ? Math.min(700, Math.max(300, parent.getBoundingClientRect().width - 4)) : 700;
    canvas.width  = canvasW = w;
    canvas.height = canvasH = Math.round(w * 0.75);
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  PATHS.figure8 = makeFigureEight();
  PATHS.spiral  = makeSpiral();
  PATHS.octagon = makeOctagon();

  initAlgos();
  buildParamPanel();

  /* Keyboard */
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    /* Prevent arrow-key scroll when sim canvas is in viewport */
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      const rect = canvas.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) e.preventDefault();
    }
    if (e.key === ' ')                { simPaused = !simPaused; }
    if (e.key === 'r' || e.key === 'R') initAlgos();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  /* Mouse drag */
  canvas.addEventListener('mousedown', e => {
    const [mx, my] = getCanvasXY(e, false);
    const [lx, ly] = w2c(leader.wx, leader.wy);
    if (Math.hypot(mx - lx, my - ly) < radZ(leader.wz) + 12) {
      dragging = true; dragStart = [mx, my]; leaderAtDrag = [leader.wx, leader.wy];
    }
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const [mx, my] = getCanvasXY(e, false);
    const [wx, wy] = c2w(mx, my);
    const [ox, oy] = c2w(dragStart[0], dragStart[1]);
    leader.wx = leaderAtDrag[0] + (wx - ox);
    leader.wy = leaderAtDrag[1] + (wy - oy);
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  /* Touch drag */
  canvas.addEventListener('touchstart', e => {
    const [mx, my] = getCanvasXY(e, true);
    const [lx, ly] = w2c(leader.wx, leader.wy);
    if (Math.hypot(mx - lx, my - ly) < radZ(leader.wz) + 18) {
      dragging = true; dragStart = [mx, my]; leaderAtDrag = [leader.wx, leader.wy];
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (!dragging) return;
    const [mx, my] = getCanvasXY(e, true);
    const [wx, wy] = c2w(mx, my);
    const [ox, oy] = c2w(dragStart[0], dragStart[1]);
    leader.wx = leaderAtDrag[0] + (wx - ox);
    leader.wy = leaderAtDrag[1] + (wy - oy);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { dragging = false; });

  /* Controls */
  const pathSel  = document.getElementById('pathSelect');
  const resetBtn = document.getElementById('resetBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  if (pathSel)  pathSel.addEventListener('change',  e => { currentPath = e.target.value; pathT = 0; simPaused = false; });
  if (resetBtn) resetBtn.addEventListener('click',   () => { initAlgos(); });
  if (pauseBtn) pauseBtn.addEventListener('click',   () => { simPaused = !simPaused; });

  requestAnimationFrame(tick);
}

/* Fire init once DOM is ready (handles both early and late script execution) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
