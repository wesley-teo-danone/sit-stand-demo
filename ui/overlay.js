import { handlePostResultsReset } from '../core/sitstand.js';
import { lmToPx } from './angles.js';
function upgradeRingToSvg(ringId, startHex, endHex) {
  const host = document.getElementById(ringId);
  if (!host || host.dataset.svgReady === '1') return;

  // Unique IDs so multiple rings don't clash
  const uid = ringId;
  const gradId = `grad_${uid}`;
  const filtId = `glow_${uid}`;

  host.innerHTML =
    `
    <svg viewBox="0 0 40 40" class="rs-ring-svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${startHex}" />
          <stop offset="100%" stop-color="${endHex}" />
        </linearGradient>

        <!-- Softer than your HUD: smaller blur + gentler boost -->
        <filter id="${filtId}" x="-200%" y="-200%" width="500%" height="500%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b1"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="b2"/>
          <feComponentTransfer in="b2" result="boost">
            <feFuncA type="table" tableValues="0 0.45 0.85 1"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="b1"/>
            <feMergeNode in="boost"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- faint track -->
      <circle class="track" cx="20" cy="20" r="16" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="6" />

      <!-- halo underlay (thicker) -->
      <circle class="progress-halo" cx="20" cy="20" r="16"
        fill="none" stroke="url(#${gradId})" stroke-width="8" stroke-linecap="round"
        filter="url(#${filtId})" opacity="0.28"
        pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" />

      <!-- glow layer -->
      <circle class="progress-glow" cx="20" cy="20" r="16"
        fill="none" stroke="url(#${gradId})" stroke-width="6" stroke-linecap="round"
        filter="url(#${filtId})" opacity="0.35"
        pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" />

      <!-- crisp foreground stroke -->
      <circle class="progress" cx="20" cy="20" r="16"
        fill="none" stroke="url(#${gradId})" stroke-width="6" stroke-linecap="round"
        pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" />
    </svg>
  ` + host.innerHTML; // keep your .rs-ring-inner label on top

  host.dataset.svgReady = '1';
}

// Smoothly set progress (0–100)
function setSvgRingProgress(ringId, pct, animate = true) {
  const host = document.getElementById(ringId);
  if (!host) return;
  const svg = host.querySelector('svg');
  if (!svg) return;

  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  const targets = svg.querySelectorAll(
    '.progress, .progress-glow, .progress-halo'
  );

  // animate via CSS transition on stroke-dashoffset
  targets.forEach((el) => {
    if (animate) {
      el.style.transition = 'stroke-dashoffset 360ms cubic-bezier(.2,.8,.2,1)';
    } else {
      el.style.transition = 'none';
    }
    el.style.strokeDashoffset = String(100 - val);
  });
}

export function drawDownArrow(
  ctx,
  x,
  y,
  {
    shaft = 90, // total length from start (y) down to the tip
    head = 24, // head size
    width = 6 // shaft thickness
  } = {}
) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = 'rgba(0,0,0,0.50)';
  ctx.shadowBlur = 12;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ef4444';
  ctx.fillStyle = '#ef4444';
  ctx.lineWidth = width;

  // Keep head proportion reasonable relative to shaft
  const headH = Math.min(head, shaft * 0.6); // head can't exceed 60% of total
  const shaftEndY = y + Math.max(0, shaft - headH); // bottom of the shaft (above head)
  const tipY = shaftEndY + headH; // tip is the lowest point

  // --- Shaft: strictly from y downward ---
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, shaftEndY);
  ctx.stroke();

  // --- Head: triangle pointing down, fully below y ---
  ctx.beginPath();
  ctx.moveTo(x - headH * 0.5, shaftEndY); // left base
  ctx.lineTo(x + headH * 0.5, shaftEndY); // right base
  ctx.lineTo(x, tipY); // tip (down)
  ctx.closePath();
  ctx.fill();

  // Crisp outline
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.stroke();

  ctx.restore();
}

// Hi-DPI safe chevron stack; nothing renders above y
export function drawDownChevrons(
  ctx,
  x,
  y,
  { count = 3, gap = 14, size = 22, width = 6, alpha = 0.95 } = {}
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.50)';
  ctx.shadowBlur = 10;

  for (let i = 0; i < count; i++) {
    const yy = y + i * (size + gap);
    const half = size * 0.6;
    const top = yy;
    const mid = yy + size * 0.5; // ensures all geometry is ≥ y
    const bot = yy + size;

    ctx.globalAlpha = alpha * (1 - i * 0.15); // subtle fade down
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = width;

    ctx.beginPath();
    // "V" shape chevron pointing down
    ctx.moveTo(x - half, top);
    ctx.lineTo(x, bot);
    ctx.lineTo(x + half, top);
    ctx.stroke();

    // crisp outline
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // restore glow for next chevron
    ctx.shadowBlur = 10;
  }
  ctx.restore();
}

export function drawSmallPill_go_down(ctx, x, y, text, opts = {}) {
  const fg = opts.fg || '#ef4444'; // bright red text
  const bg = opts.bg || 'rgba(2,6,23,0.92)'; // darker slate bg
  const border = opts.border || 'rgba(239,68,68,0.55)'; // soft red border
  const shadow = opts.shadow ?? true;

  ctx.save();

  // Pill sizing
  ctx.font = `${opts.weight || '600'} ${opts.size || 28}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const padX = opts.padX || 14;
  const padY = opts.padY || 10;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + padX * 2);
  const h = Math.ceil((opts.height || 40) + (padY - 10));
  const r = opts.radius || 18;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);

  // Soft shadow to lift off video
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }

  // Background pill
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.arcTo(left + w, top, left + w, top + h, r);
  ctx.arcTo(left + w, top + h, left, top + h, r);
  ctx.arcTo(left, top + h, left, top, r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text: outline then fill for maximum contrast
  ctx.shadowBlur = 0; // don’t blur the text outline
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // 1) black outline to make red readable on bright pixels
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.lineWidth = 3;
  ctx.strokeText(text, left + padX, y);

  // 2) red fill
  ctx.fillStyle = fg;
  ctx.fillText(text, left + padX, y);

  ctx.restore();
}

function showResultsModal(summary) {
  const event = new CustomEvent('show-results', { detail: summary });
  window.dispatchEvent(event);
  // const overlay = document.getElementById('results-overlay');
  // overlay?.classList.remove('hidden');
  // overlay?.setAttribute('aria-hidden', 'false');

  // // Build SVG rings once (keeps your IDs)
  // upgradeRingToSvg('rs-knee-ring', '#22d3ee', '#06b6d4'); // cyan → teal
  // upgradeRingToSvg('rs-depth-ring', '#fbbf24', '#f59e0b'); // amber range
  // upgradeRingToSvg('rs-sym-ring', '#34d399', '#10b981'); // green range
  // upgradeRingToSvg('rs-back-ring', '#a78bfa', '#8b5cf6'); // violet range

  // // Set % with smooth dash animation
  // setSvgRingProgress('rs-knee-ring', summary.knee.pct, true);
  // setSvgRingProgress('rs-depth-ring', summary.depth.pct, true);
  // setSvgRingProgress('rs-sym-ring', summary.symmetry.pct, true);
  // setSvgRingProgress('rs-back-ring', summary.back.pct, true);

  // // Update the numeric labels inside the inner disc
  // const setPctText = (id, v) => {
  //   const el = document.getElementById(id);
  //   if (el)
  //     el.textContent = `${Math.round(Math.max(0, Math.min(100, v || 0)))}%`;
  // };
  // setPctText('rs-knee-pct', summary.knee.pct);
  // setPctText('rs-depth-pct', summary.depth.pct);
  // setPctText('rs-sym-pct', summary.symmetry.pct);
  // setPctText('rs-back-pct', summary.back.pct);

  // // Footer stats
  // document.getElementById('rs-reps-n').textContent = `${summary.reps ?? 0}`;
  // document.getElementById('rs-overall').textContent =
  //   `${Math.round(summary.overall?.avg ?? 0)}`;

  // // Close behavior (same as earlier)
  // const btn = document.getElementById('rs-close-btn');
  // const onClose = () => {
  //   overlay?.classList.add('hidden');
  //   overlay?.setAttribute('aria-hidden', 'true');
  //   btn?.removeEventListener('click', onClose);
  //   handlePostResultsReset();
  // };
  // btn?.addEventListener('click', onClose, { once: true });
  // overlay.addEventListener(
  //   'click',
  //   (e) => {
  //     if (e.target === overlay) onClose();
  //   },
  //   { once: true }
  // );
}

// --- util: lerp + clamp ---
export function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// --- DOTTED horizontal line toward "back" side ---

// --- Two-headed vertical arrow (between yTop and yBot) ---
export function drawDoubleHeadedVArrow(
  ctx,
  x,
  yTop,
  yBot,
  {
    shaftWidth = 6,
    headSize = 16,
    color = '#22d3ee', // cyan-400 vibe
    glow = 'rgba(0,0,0,0.50)',
    alpha = 1
  } = {}
) {
  if (yBot < yTop) [yTop, yBot] = [yBot, yTop];
  const y1 = yTop + headSize + 2;
  const y2 = yBot - headSize - 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = shaftWidth;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();

  // Top head (triangle pointing up)
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x - headSize * 0.55, yTop + headSize);
  ctx.lineTo(x + headSize * 0.55, yTop + headSize);
  ctx.closePath();
  ctx.fill();

  // Bottom head (triangle pointing down)
  ctx.beginPath();
  ctx.moveTo(x, yBot);
  ctx.lineTo(x - headSize * 0.55, yBot - headSize);
  ctx.lineTo(x + headSize * 0.55, yBot - headSize);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawDottedHLineToX(
  ctx,
  x0,
  y,
  x1,
  {
    dash = 10,
    gap = 10,
    color = 'rgba(255,255,255,0.88)',
    glow = 'rgba(0,0,0,0.45)',
    width = 4,
    alpha = 1
  } = {}
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash([dash, gap]);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

// Convert a few pose lms to canvas px (re-uses your lmToPx)
export function lmTripletToPx(pose, a, b, c, canvas) {
  const A = pose[a],
    B = pose[b],
    C = pose[c];
  if (!A || !B || !C) return null;
  return [lmToPx(A, canvas), lmToPx(B, canvas), lmToPx(C, canvas)];
}

/**
 * Draw a soft glow along a polyline path (A→B→C).
 * Uses stacked strokes + additive blend to get a halo.
 */
export function drawGlowPath(
  ctx,
  pts,
  {
    width = 18, // core shaft width
    layers = 4, // stacked strokes
    alpha = 0.9, // overall opacity
    color = 'rgb(34,197,94)', // base (green 500). We’ll pass red/green.
    blur = 24, // shadow blur
    feather = 0.5 // how much each outer layer expands
  } = {}
) {
  if (!pts || pts.length < 2) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // additive glow
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1 || 1); // 0..1
    const w = width * (1 + feather * t); // wider outward
    const a = alpha * (1 - t * 0.75); // fade outward

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * (1 + 0.5 * t);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Convenience: draw glow from shoulder→elbow→wrist for one side.
 * Skips if any of those landmarks are low-visibility.
 */
export function drawArmGlow(
  ctx,
  pose,
  side /* 'L'|'R' */,
  canvas,
  {
    color = 'rgba(34,197,94,0.5)',
    alpha = 0.5,
    pulse = 1.0,
    visThr = 0.35
  } = {}
) {
  const L_SH = 11,
    R_SH = 12,
    L_EL = 13,
    R_EL = 14,
    L_WR = 15,
    R_WR = 16;
  const idx = side === 'L' ? [L_SH, L_EL, L_WR] : [R_SH, R_EL, R_WR];

  // Visibility check
  for (const i of idx) {
    const lm = pose[i];
    if (!lm || lm.visibility == null || lm.visibility < visThr) return;
  }

  const pts = lmTripletToPx(pose, idx[0], idx[1], idx[2], canvas);
  if (!pts) return;

  drawGlowPath(ctx, pts, {
    width: 18,
    layers: 5,
    alpha: Math.max(0, Math.min(1, alpha * pulse)),
    color,
    blur: 28,
    feather: 0.55
  });
}

const floatingMessageEl = document.getElementById('floatingMessage');
let angleHintOn = false;

export function showAngleHint() {
  if (!floatingMessageEl || angleHintOn) return;

  floatingMessageEl.textContent =
    'Please Turn Body Slightly and Keep it in Full Frame';

  floatingMessageEl.classList.add('angle-visible');
  angleHintOn = true;
}

export function hideAngleHint() {
  if (!floatingMessageEl || !angleHintOn) return;
  floatingMessageEl.classList.remove('angle-visible');
  angleHintOn = false;
}

export { upgradeRingToSvg, setSvgRingProgress, showResultsModal };
