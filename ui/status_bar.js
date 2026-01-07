export function hudSetTimer(seconds) {
  // Update ring + numeric text
  setCountdown(seconds, window.HUD_TOTAL_SECONDS || 20);
}

export function hudSetReps(n) {
  setRepsCount(n);
}

export function hudSetFormBars(arr, activeIndex = -1) {
  const wrap = document.getElementById('formBars');
  if (!wrap) return;

  const bars = Array.from(wrap.children); // assumes 5 bars
  const tail = (arr || []).slice(-5);
  const pad = Math.max(0, 5 - tail.length);
  const data = Array(pad).fill(null).concat(tail);

  bars.forEach((b, i) => {
    const v = data[i]; // numeric score or null
    b.className = 'bar';

    if (v == null) {
      // empty slot
      b.style.height = '4px';
      return;
    }

    // >75 = good, >50 = ok (warn), else bad
    const cls = v >= 75 ? 'good' : v > 50 ? 'warn' : 'bad';
    b.classList.add(cls);

    const h = v >= 75 ? 22 : v > 50 ? 15 : 8;
    b.style.height = h + 'px';

    b.setAttribute('data-score', String(Math.round(v)));
    b.title = `Score: ${Math.round(v)}`;
  });

  // Show the EXACT form score (last rep's true numeric total)
  const scoreEl = document.getElementById('formScore');
  if (scoreEl) {
    const last = tail.length ? tail[tail.length - 1] : null;
    scoreEl.textContent = last == null ? '–' : String(Math.round(last));
  }

  if (activeIndex !== null && activeIndex !== undefined) {
    // support -1 to mean "last bar"
    const idx = activeIndex === -1 ? bars.length - 1 : activeIndex;
    if (idx >= 0 && idx < bars.length) {
      bars[idx].classList.add('active');
    }
  }
}

function bumpReps() {
  const el = document.getElementById('repsNum');
  el.classList.remove('bump'); // restart animation
  void el.offsetWidth;
  el.classList.add('bump');
}

// === New status bar helpers ===
function setRepsCount(n) {
  const el = document.getElementById('repsNum');
  if (el) el.textContent = Math.max(0, Number(n) | 0);
  bumpReps();
}

function setCountdown(remainingSec, totalSec) {
  const total = Math.max(1, Number(totalSec) || window.HUD_TOTAL_SECONDS || 20);
  const remain = Math.max(0, Math.min(total, Number(remainingSec) || 0));

  // progress 0..1 (0 = empty, 1 = full time left)
  const pLeft = remain / total;
  const frac = 1 - pLeft; // same as your original

  // cache circumference once (reads r from #ringProgress)
  if (setCountdown._circ === undefined) {
    const progEl = document.getElementById('ringProgress');
    const r = Number(progEl?.getAttribute('r')) || 16;
    setCountdown._circ = 2 * Math.PI * r;
  }
  const C = setCountdown._circ;

  // Optional: ease for a slightly smoother feel
  // function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
  // const eased = easeOutCubic(frac);
  const offset = C * frac; // or C * eased

  const ids = ['ringProgress', 'ringProgressGlow', 'ringProgressHalo']; // <- include halo
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.strokeDasharray = `${C}`;
    el.style.strokeDashoffset = `${offset}`;
  }

  const txt = document.getElementById('ringText');
  if (txt) txt.textContent = String(Math.ceil(remain));
}
