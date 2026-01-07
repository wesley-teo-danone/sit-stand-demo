const EPS_DEG = 0.5; // treat <0.5° as zero (tweak if needed)

function lmToPx(lm, canvas) {
  return { x: lm.x * canvas.width, y: lm.y * canvas.height };
}

// angle between two vectors (0..180)
function angleBetweenDeg(ax, ay, bx, by) {
  const ma = Math.hypot(ax, ay) || 1e-6;
  const mb = Math.hypot(bx, by) || 1e-6;
  const cos = (ax * bx + ay * by) / (ma * mb);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// short dotted vertical
function drawDottedVerticalRef(
  ctx,
  cx,
  cy,
  len = 70,
  color = 'rgba(255,255,255,0.9)'
) {
  const y0 = Math.max(0, cy - len); // cap at canvas top
  const y1 = cy;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 10]);
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx, y1);
  ctx.stroke();
  ctx.restore();
}

function drawArcFromVerticalUpDirected(
  ctx,
  cx,
  cy,
  tx,
  ty,
  radius = 34,
  color = '#7dd3fc',
  isLeft = false
) {
  // guard near-zero vector

  // const px = cx * ctx.canvas.width;
  // const py = cy * ctx.canvas.height;

  const m = Math.hypot(tx, ty);
  if (m < 1e-6) return;

  const start = -Math.PI / 2; // vertical UP angle
  // angle between vertical-UP and target (0..PI)
  const dot = (0 * tx + -1 * ty) / m; // = -ty / |v|
  const theta = Math.acos(Math.max(-1, Math.min(1, -ty / m)));

  // direction: left -> CCW (positive), right -> CW (negative)
  const dir = isLeft ? +1 : -1;
  const end = start + dir * theta;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end, /*anticlockwise=*/ dir < 0); // CW if dir<0
  ctx.stroke();
  ctx.restore();
}

// Signed angle from vertical-UP (0,-1) to vector (vx,vy), in degrees (-180..+180)
function signedAngleFromVerticalUpDeg(vx, vy) {
  return (Math.atan2(vx, -vy) * 180) / Math.PI; // atan2(cross, dot) with u=(0,-1)
}

function drawArcFromVerticalUpSigned(
  ctx,
  cx,
  cy,
  vx,
  vy,
  radius = 34,
  color = '#7dd3fc'
) {
  const m = Math.hypot(vx, vy);
  if (m < 1e-6) return;

  const start = -Math.PI / 2; // vertical UP in canvas
  const theta = Math.atan2(vx, -vy); // (-PI..PI) signed
  const end = start + theta;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  // Canvas angles increase clockwise (because +y is down), so:
  // - when theta > 0, draw clockwise (anticlockwise = false)
  // - when theta < 0, draw counter-clockwise (anticlockwise = true)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end, theta < 0);
  ctx.stroke();
  ctx.restore();
}

// Rounded-rect path
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  const p = new Path2D();
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}

function drawPillLabel(ctx, x, y, text, opt = {}) {
  const {
    fg = '#0ea5e9', // cyan for back, swap to amber for knee
    bg = 'rgba(17,24,39,0.78)', // slate-900 @ ~78%
    border = 'rgba(255,255,255,0.18)',
    shadow = 'rgba(0,0,0,0.35)',
    px = 13,
    py = 8,
    radius = 13,
    tail = 'up', // looks nice near arcs; try 'left' for side
    offset = { dx: 10, dy: -14 },
    minContrastOnBg = true
  } = opt;

  ctx.save();

  // Font & metrics
  ctx.font = '700 22px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = Math.ceil(ctx.measureText(text).width);
  const th = 24; // visual line height
  const w = tw + px * 2;
  const h = th + py * 2;

  // Decide placement (auto-flip if near edges)
  let bx = x + offset.dx;
  let by = y + offset.dy;

  const padEdge = 8;
  const cw = ctx.canvas.width,
    ch = ctx.canvas.height;

  // If off right edge, move left
  if (bx + w + padEdge > cw) bx = x - offset.dx - w;
  // If off left edge, push right
  if (bx < padEdge) bx = padEdge;
  // If off top, push down; if off bottom, push up
  if (by < padEdge) by = Math.min(y + Math.abs(offset.dy), ch - h - padEdge);
  if (by + h + padEdge > ch)
    by = Math.max(padEdge, y - Math.abs(offset.dy) - h);

  // Background gradient (subtle vertical sheen)
  const g = ctx.createLinearGradient(0, by, 0, by + h);
  g.addColorStop(0, bg);
  g.addColorStop(1, bg.replace('0.78', '0.88')); // slightly stronger at bottom if rgba(x,x,x,0.78)
  const pill = roundRectPath(ctx, bx, by, w, h, radius);

  // Shadow
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // Fill bg
  ctx.fillStyle = g;
  ctx.fill(pill);

  // Border
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.stroke(pill);

  if (tail) {
    const t = new Path2D();
    const tailSize = 8;
    if (tail === 'up') {
      const cx = Math.min(Math.max(x, bx + radius), bx + w - radius);
      t.moveTo(cx, by);
      t.lineTo(cx - tailSize, by - tailSize);
      t.lineTo(cx + tailSize, by - tailSize);
    } else if (tail === 'down') {
      const cx = Math.min(Math.max(x, bx + radius), bx + w - radius);
      t.moveTo(cx, by + h);
      t.lineTo(cx - tailSize, by + h + tailSize);
      t.lineTo(cx + tailSize, by + h + tailSize);
    } else if (tail === 'left') {
      const cy = Math.min(Math.max(y, by + radius), by + h - radius);
      t.moveTo(bx, cy);
      t.lineTo(bx - tailSize, cy - tailSize);
      t.lineTo(bx - tailSize, cy + tailSize);
    } else if (tail === 'right') {
      const cy = Math.min(Math.max(y, by + radius), by + h - radius);
      t.moveTo(bx + w, cy);
      t.lineTo(bx + w + tailSize, cy - tailSize);
      t.lineTo(bx + w + tailSize, cy + tailSize);
    }
    t.closePath();
    // draw tail with same fill & border
    ctx.fillStyle = g;
    ctx.fill(t);
    ctx.strokeStyle = border;
    ctx.stroke(t);
  }

  // Text (with subtle stroke for contrast)
  if (minContrastOnBg) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, bx + px, by + h / 2);
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, bx + px, by + h / 2);

  ctx.restore();
}

function drawPillLabelPhase(ctx, text, opt = {}) {
  const {
    // Placement
    align = 'top-left', // 'top-left' | 'top-center'
    margin = 12, // px from top edge
    // Sizing & typography
    scale = 1.0,
    fontSize = 22,
    lineHeight = 24,
    weight = '700',
    px = 16, // horizontal padding
    py = 10, // vertical padding
    radius = 16,
    // Visual theme (single theme)
    fg = '#e2f6ff', // text
    bg = 'rgba(15, 23, 42, 0.62)', // slate-900 @ ~62% for nice glass look
    border = 'rgba(255,255,255,0.16)',
    shadow = 'rgba(0,0,0,0.35)',
    // Extras
    showDot = true, // small status dot before text
    dotColor = '#38bdf8', // cyan-400
    minContrastStroke = true // dark outline behind text/dot
  } = opt;

  // Local helpers (inline to keep single-function requirement)
  const rr = (x, y, w, h, r) => {
    const p = new Path2D();
    const rr_ = Math.min(r, h / 2, w / 2);
    p.moveTo(x + rr_, y);
    p.arcTo(x + w, y, x + w, y + h, rr_);
    p.arcTo(x + w, y + h, x, y + h, rr_);
    p.arcTo(x, y + h, x, y, rr_);
    p.arcTo(x, y, x + w, y, rr_);
    p.closePath();
    return p;
  };

  const DPR = window.devicePixelRatio || 1;
  const s = scale;

  const PADX = px * s;
  const PADY = py * s;
  const R = radius * s;
  const FS = fontSize * s;
  const LH = lineHeight * s;
  const dotGap = showDot ? 10 * s : 0;
  const dotSize = showDot ? 8 * s : 0;

  ctx.save();
  ctx.font = `${weight} ${FS}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Measure once
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const w = textWidth + PADX * 2 + (showDot ? dotSize + dotGap : 0);
  const h = LH + PADY * 2;

  // Anchor
  const cw = ctx.canvas.width;
  const top = Math.round(margin * DPR);
  const left =
    align === 'top-center'
      ? Math.round((cw - w) / 2)
      : Math.round(margin * DPR);

  // Lift shadow
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 10 * s;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3 * s;

  // Background: soft vertical gradient (glassy)
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0.0, bg);
  g.addColorStop(0.55, bg);
  g.addColorStop(
    1.0,
    bg.replace(/rgba?\(([^,]+,){3}\s*([0-9.]+)\)/, (m, _g, a) =>
      m.replace(a, Math.min(1, (parseFloat(a) || 0.62) + 0.08))
    )
  );

  const pill = rr(left, top, w, h, R);
  ctx.fillStyle = g;
  ctx.fill(pill);

  // Border
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1 * s;
  ctx.strokeStyle = border;
  ctx.stroke(pill);

  // Inner top sheen (subtle highlight)
  const sheenH = Math.max(1, Math.round(h * 0.32));
  ctx.save();
  ctx.clip(pill);
  const gg = ctx.createLinearGradient(0, top, 0, top + sheenH);
  gg.addColorStop(0, 'rgba(255,255,255,0.12)');
  gg.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = gg;
  ctx.fillRect(left + R, top + 1, w - 2 * R, sheenH);
  ctx.restore();

  // Content
  let tx = left + PADX;
  const ty = top + h / 2;

  // Optional contrast stroke (protects legibility on busy video)
  if (minContrastStroke) {
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    if (showDot) {
      ctx.beginPath();
      ctx.arc(tx + dotSize / 2, ty, dotSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeText(text, tx + (showDot ? dotSize + dotGap : 0), ty);
  }

  // Dot
  if (showDot) {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(tx + dotSize / 2, ty, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();
    tx += dotSize + dotGap;
  }

  // Text
  ctx.fillStyle = fg;
  ctx.fillText(text, tx, ty);

  ctx.restore();

  // optional: return bounding box
  return { x: left, y: top, w, h };
}

function drawPillLabelFade(ctx, x, y, text, opt = {}) {
  const {
    fg = '#0ea5e9',
    bg = 'rgba(17,24,39,0.78)',
    border = 'rgba(255,255,255,0.18)',
    shadow = 'rgba(0,0,0,0.35)',
    px = 13,
    py = 8,
    radius = 13,

    tail = null,

    anchorX = null,
    sideLR = null,
    gap = 12,

    offset = { dx: 10, dy: -14 },

    minContrastOnBg = true,
    alpha = 1
  } = opt;

  ctx.save();

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;

  // Font & metrics
  ctx.font = '700 22px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = Math.ceil(ctx.measureText(text).width);
  const th = 24;
  const w = tw + px * 2;
  const h = th + py * 2;

  // Compute base box (bx, by)
  const cw = ctx.canvas.width,
    ch = ctx.canvas.height;
  const padEdge = 8;

  let bx, by;

  if (anchorX != null && (sideLR === 'left' || sideLR === 'right')) {
    if (sideLR === 'right') {
      bx = anchorX + gap;
      bx = Math.min(bx, Math.max(anchorX + gap, cw - w - padEdge));
    } else {
      bx = anchorX - gap - w;
      bx = Math.max(bx, padEdge);
      if (bx + w > anchorX - gap) bx = anchorX - gap - w;
      if (bx < padEdge) bx = padEdge; // final safety clamp
    }
    by = y - h / 2;
    if (by < padEdge) by = padEdge;
    if (by + h + padEdge > ch) by = Math.max(padEdge, ch - h - padEdge);
  } else {
    bx = x + offset.dx;
    by = y + offset.dy;
    if (bx + w + padEdge > cw) bx = x - offset.dx - w;
    if (bx < padEdge) bx = padEdge;
    if (by < padEdge) by = Math.min(y + Math.abs(offset.dy), ch - h - padEdge);
    if (by + h + padEdge > ch)
      by = Math.max(padEdge, y - Math.abs(offset.dy) - h);
  }

  // Background gradient and pill path
  const g = ctx.createLinearGradient(0, by, 0, by + h);
  g.addColorStop(0, bg);
  g.addColorStop(1, bg.replace('0.78', '0.88'));
  const pill = roundRectPath(ctx, bx, by, w, h, radius);

  // Shadow
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // Fill & border
  ctx.fillStyle = g;
  ctx.fill(pill);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.stroke(pill);

  let tailDir = tail;
  if (!tailDir && (sideLR === 'left' || sideLR === 'right')) {
    tailDir = sideLR === 'right' ? 'left' : 'right';
  }
  if (tailDir) {
    const t = new Path2D();
    const tailSize = 8;
    if (tailDir === 'up') {
      const cx = Math.min(Math.max(x, bx + radius), bx + w - radius);
      t.moveTo(cx, by);
      t.lineTo(cx - tailSize, by - tailSize);
      t.lineTo(cx + tailSize, by - tailSize);
    } else if (tailDir === 'down') {
      const cx = Math.min(Math.max(x, bx + radius), bx + w - radius);
      t.moveTo(cx, by + h);
      t.lineTo(cx - tailSize, by + h + tailSize);
      t.lineTo(cx + tailSize, by + h + tailSize);
    } else if (tailDir === 'left') {
      const cy = Math.min(Math.max(y, by + radius), by + h - radius);
      t.moveTo(bx, cy);
      t.lineTo(bx - tailSize, cy - tailSize);
      t.lineTo(bx - tailSize, cy + tailSize);
    } else if (tailDir === 'right') {
      const cy = Math.min(Math.max(y, by + radius), by + h - radius);
      t.moveTo(bx + w, cy);
      t.lineTo(bx + w + tailSize, cy - tailSize);
      t.lineTo(bx + w + tailSize, cy + tailSize);
    }
    t.closePath();
    ctx.fillStyle = g;
    ctx.fill(t);
    ctx.strokeStyle = border;
    ctx.stroke(t);
  }

  // Text
  if (minContrastOnBg) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, bx + px, by + h / 2);
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, bx + px, by + h / 2);

  ctx.globalAlpha = prevAlpha;
  ctx.restore();
}

export {
  lmToPx,
  angleBetweenDeg,
  drawDottedVerticalRef,
  EPS_DEG,
  drawArcFromVerticalUpDirected,
  signedAngleFromVerticalUpDeg,
  drawArcFromVerticalUpSigned,
  drawPillLabel,
  drawPillLabelPhase,
  drawPillLabelFade
};
