// Angle gate: only open when person is standing at an angle (not facing camera) 

const RAD2DEG = 180 / Math.PI;

// Compute torso yaw using world landmarks (meters).
// 0° ≈ facing camera; larger = more angled (one side closer).
function torsoYawDeg(world){
  const L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
  if (!world[L_SH] || !world[R_SH] || !world[L_HIP] || !world[R_HIP]) return null;

  const dxS = world[R_SH].x - world[L_SH].x;
  const dzS = world[R_SH].z - world[L_SH].z;
  const dxH = world[R_HIP].x - world[L_HIP].x;
  const dzH = world[R_HIP].z - world[L_HIP].z;

  const yawS = Math.atan2(Math.abs(dzS), Math.max(1e-6, Math.abs(dxS))) * RAD2DEG;
  const yawH = Math.atan2(Math.abs(dzH), Math.max(1e-6, Math.abs(dxH))) * RAD2DEG;

  // robust: average shoulders & hips
  return (yawS + yawH) * 0.5;
}

// Which side is closer
function closerSideByDepth(world){
  const L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
  const leftZ  = (world[L_SH].z + world[L_HIP].z) / 2;
  const rightZ = (world[R_SH].z + world[R_HIP].z) / 2;
  const diff = leftZ - rightZ; // negative => left closer (more negative z is nearer)
  return (diff < 0) ? 'LEFT' : 'RIGHT';
}

// Simple EMA smoother
function ema2(prev, next, alpha){ return (prev == null) ? next : (alpha * next + (1 - alpha) * prev); }

const AngleGate = {
  _yawDegSmoothed: null,
  _isOpen: false,
  _lastFlipMs: 0,

  // thresholds with hysteresis
  YAW_OPEN_DEG: 20,   // open when yaw >= 20°
  YAW_CLOSE_DEG: 15,  // close when yaw < 15°
  MIN_VIS: 0.3,       // require decent torso vis
  EMA_ALPHA: 0.3,     // smoothing for yaw
  MIN_DWELL_MS: 250,  // don't flap faster than this

  update(nowMs, pose, world){
    // visibility guard (shoulders + hips)
    const needIdx = [11,12,23,24];
    for (const i of needIdx){
      if (!pose[i] || pose[i].visibility == null || pose[i].visibility < this.MIN_VIS) {
        this._yawDegSmoothed = null;
        this._isOpen = false;
        return { gateOpen: false, yawDeg: null, side: null };
      }
    }

    const yaw = torsoYawDeg(world); // 0..~80+
    if (yaw == null || !isFinite(yaw)) {
      this._yawDegSmoothed = null;
      this._isOpen = false;
      return { gateOpen: false, yawDeg: null, side: null };
    }

    // smooth yaw
    this._yawDegSmoothed = ema2(this._yawDegSmoothed, yaw, this.EMA_ALPHA);

    // tiny stability: also require yaw not changing too fast
    const yawOk = this._yawDegSmoothed;

    // hysteresis
    const nowOpen  = this._isOpen;
    const wantOpen = nowOpen
      ? (yawOk >= this.YAW_CLOSE_DEG)   // stay open until it drops below close
      : (yawOk >= this.YAW_OPEN_DEG);   // only open if passes higher bar

    if (wantOpen !== nowOpen && (nowMs - this._lastFlipMs) >= this.MIN_DWELL_MS){
      this._isOpen = wantOpen;
      this._lastFlipMs = nowMs;
    }

    const side = closerSideByDepth(world); // 'LEFT' or 'RIGHT'
    return { gateOpen: this._isOpen, yawDeg: yawOk, side };
  }
};





//to check if a person is still using anklegate
const AnkleGate = (() => {
  const VIS_THR    = 0.40;  // ankle must be visible
  const PX_VEL_THR = 17.5;   // px/frame; tune for strictness
  const HOLD_MS    = 200;   // must hold still this long
  const EMA_ALPHA  = 0.35;  // velocity smoothing

  let prevAnkle = null, prevTime = null, emaVel = 0, okSince = 0, lastOk = false;

  const ankleIdxFromSide = (allowedSet) => (allowedSet?.has(23) ? 31 : 32); // left?31:32

  function update(now, pose, allowedSet, canvasHeightPx=1080){
    if (!pose || !allowedSet?.size) {
      prevAnkle = null; prevTime = null; lastOk = false; okSince = 0;
      return { gateOpen:false, heldMs:0, emaVelPx:Infinity };
    }
    const idx = ankleIdxFromSide(allowedSet);
    const a = pose[idx];
    if (!a || (a.visibility ?? 0) < VIS_THR) {
      prevAnkle = null; prevTime = null; lastOk = false; okSince = 0;
      return { gateOpen:false, heldMs:0, emaVelPx:Infinity };
    }

    const dt = prevTime ? (now - prevTime) : 0;
    let velNorm = 0;
    if (prevAnkle && dt > 0) {
      velNorm = Math.hypot(a.x - prevAnkle.x, a.y - prevAnkle.y); // normalized/frame
    }
    emaVel = (1-EMA_ALPHA)*emaVel + EMA_ALPHA*velNorm;
    //console.log('ankle vel:', (emaVel*canvasHeightPx).toFixed(1), 'px/frame');
    const thrNorm = PX_VEL_THR / Math.max(1, canvasHeightPx);
    const instantOk = (emaVel <= thrNorm);

    if (instantOk) { if (!lastOk) okSince = now; lastOk = true; }
    else { lastOk = false; okSince = 0; }

    const heldMs = lastOk ? (now - okSince) : 0;
    const gateOpen = lastOk && (heldMs >= HOLD_MS);
    

    prevAnkle = a; prevTime = now;
    return { gateOpen, heldMs, emaVelPx: emaVel * canvasHeightPx };
  }

  return { update };
})();





// --- Shallow rep cue state ---
const ShallowCue = {
  activeUntil: 0,
  lastSpokenAt: 0,
  want: false,
  hip: { x: 0, y: 0 },  // live anchor (updated per frame when visible)
};

// Trigger request; the actual activation happens in predict() when we know hipPx
export function cueShallow(nowMs) {
  ShallowCue.want = true;
  ShallowCue.requestedAt = nowMs;
}
export function shallowCueIsActive(nowMs) {
  return nowMs < ShallowCue.activeUntil;
}
export function shallowCueGet() { return ShallowCue; }
export function shallowCueSetAnchor(x, y) { ShallowCue.hip.x = x; ShallowCue.hip.y = y; }
export function shallowCueMaybeActivate(nowMs) {
  if (!ShallowCue.want) return false;
  ShallowCue.want = false;
  ShallowCue.activeUntil = nowMs + 1200; // show for 1.2s
  try { if (navigator?.vibrate) navigator.vibrate(40); } catch(e){}
  return true;
}
// export function shallowCueMaybeSpeak(nowMs) {
//   const COOLDOWN = 1600;
//   if (nowMs - ShallowCue.lastSpokenAt < COOLDOWN) return;
//   if (!('speechSynthesis' in window)) return;

//   // Speak politely once


//   if (!speechSynthesis.speaking) {
//     const u = new SpeechSynthesisUtterance('Go lower');
//     u.rate = 1.0; u.pitch = 0.9; u.volume = 1.0;
//     try { speechSynthesis.speak(u); } catch(e){}
//     ShallowCue.lastSpokenAt = nowMs;
//   }
// }
export function shallowCueMaybeSpeak(nowMs) {
  const LOCAL_COOLDOWN = 1600; // keep its own mild cooldown if you like

  if (nowMs - ShallowCue.lastSpokenAt < LOCAL_COOLDOWN) return;
  if (!('speechSynthesis' in window)) return;

  // Global 4s gate for form cues
  if (!CoachSpeech.canEnqueueFormCue(nowMs)) return;

  CoachSpeech.enqueue(nowMs, 'Go lower', {
    priority: 3,
    maxDelayMs: 2000,
    tag: 'shallow'
  });

  ShallowCue.lastSpokenAt = nowMs;
  CoachSpeech.markFormCue(nowMs);
}




// --- Cross-arms cue state (mirrors ShallowCue) ---
const CrossArmsCue = {
  activeUntil: 0,
  lastSpokenAt: 0,
  want: false,
  elbow: { x: 0, y: 0 },   // live anchor (updated per frame when elbows visible)
};

export function cueCrossArms(nowMs) {
  CrossArmsCue.want = true;
  CrossArmsCue.requestedAt = nowMs;
}
export function crossArmsCueIsActive(nowMs) {
  return nowMs < CrossArmsCue.activeUntil;
}
export function crossArmsCueGet() { return CrossArmsCue; }
export function crossArmsCueSetAnchor(x, y) { CrossArmsCue.elbow.x = x; CrossArmsCue.elbow.y = y; }
export function crossArmsCueMaybeActivate(nowMs) {
  if (!CrossArmsCue.want) return false;
  CrossArmsCue.want = false;
  CrossArmsCue.activeUntil = nowMs + 1000; // show ~1.0s at finish
  try { if (navigator?.vibrate) navigator.vibrate(40); } catch(e){}
  return true;
}
// export function crossArmsCueMaybeSpeak(nowMs) {
//   const COOLDOWN = 1600;
//   if (nowMs - CrossArmsCue.lastSpokenAt < COOLDOWN) return;
//   if (!('speechSynthesis' in window)) return;
//   if (!speechSynthesis.speaking) {
//     const u = new SpeechSynthesisUtterance('Cross your arms');
//     u.rate = 1.0; u.pitch = 0.95; u.volume = 1.0;
//     try { speechSynthesis.speak(u); } catch(e){}
//     CrossArmsCue.lastSpokenAt = nowMs;
//   }
// }

export function crossArmsCueMaybeSpeak(nowMs) {
  const LOCAL_COOLDOWN = 1600;

  if (nowMs - CrossArmsCue.lastSpokenAt < LOCAL_COOLDOWN) return;
  if (!('speechSynthesis' in window)) return;

  // Shared 4s spacing with shallow cue
  if (!CoachSpeech.canEnqueueFormCue(nowMs)) return;

  CoachSpeech.enqueue(nowMs, 'Cross your arms', {
    priority: 3,
    maxDelayMs: 2000,
    tag: 'cross_arms'
  });

  CrossArmsCue.lastSpokenAt = nowMs;
  CoachSpeech.markFormCue(nowMs);
}






const ArmsCrossGate = (() => {
  const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;

  // Visibility / smoothing
  const VIS_THR   = 0.10;
  const HOLD_MS   = 3;    // needs to hold crossed pose this long (tune)
  const EMA_ALPHA = 0.35;  // smoothing for angle (tune 0.2–0.5)

  // Angle thresholds (degrees)
  // Gate opens when elbow angle is small (arm bent/crossed),
  // closes when angle is large (arm extended). Hysteresis via two thresholds.
  const OPEN_DEG  = 135;    // angle <= OPEN_DEG -> want OPEN (crossed) 75 seems ok
  const CLOSE_DEG = 155;    // angle >= CLOSE_DEG -> want CLOSE (extended)95 seems ok

  let emaAngle = null;
  let lastOk   = false, okSince = 0;

  const hasVis = (pt) => pt && pt.visibility != null && pt.visibility >= VIS_THR;

  // Decide side from your allowedSet: contains left hip (23) => 'L', else 'R'
  function sideFromAllowedSet(allowedSet) {
    return allowedSet && allowedSet.has(23) ? 'L' : 'R';
  }

  function elbowAngleDeg(pose, SH, EL, WR) {
    const sh = pose[SH], el = pose[EL], wr = pose[WR];
    // vectors from elbow
    const v1x = sh.x - el.x, v1y = sh.y - el.y;
    const v2x = wr.x - el.x, v2y = wr.y - el.y;
    const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
    if (n1 <= 1e-6 || n2 <= 1e-6) return null;
    let cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
    // clamp for safety
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * (180 / Math.PI); // 0..180
  }

  function update(nowMs, pose, _world = null, allowedSet = null) {
    const side   = sideFromAllowedSet(allowedSet); // 'L' or 'R'
    const isLeft = (side === 'L');

    // Same-side indices
    const SH = isLeft ? L_SH : R_SH;
    const EL = isLeft ? L_EL : R_EL;
    const WR = isLeft ? L_WR : R_WR;

    // Minimal visibility: only what we use on this side
    if (!pose[SH] || !hasVis(pose[SH]) ||
        !pose[EL] || !hasVis(pose[EL]) ||
        !pose[WR] || !hasVis(pose[WR])) {
      emaAngle = null; lastOk = false; okSince = 0;
      return { gateOpen:false, heldMs:0, angleDeg:null, reason:'low_visibility_side', side: isLeft ? 'left' : 'right' };
    }

    // Raw elbow angle (degrees)
    const rawDeg = elbowAngleDeg(pose, SH, EL, WR);
    if (rawDeg == null || !Number.isFinite(rawDeg)) {
      emaAngle = null; lastOk = false; okSince = 0;
      return { gateOpen:false, heldMs:0, angleDeg:null, reason:'bad_angle', side: isLeft ? 'left' : 'right' };
    }

    // Smooth
    emaAngle = (emaAngle == null) ? rawDeg : (EMA_ALPHA * rawDeg + (1 - EMA_ALPHA) * emaAngle);

    // Hysteresis decision:
    // - If clearly "crossed" (small angle), tendency to OPEN
    // - If clearly "extended" (large angle), tendency to CLOSE
    // - Otherwise keep previous state (reduces flicker)
    const wantsOpen  = (emaAngle <= OPEN_DEG);
    const wantsClose = (emaAngle >= CLOSE_DEG);

    let instantOpen  = false;
    let instantClose = false;

    if (wantsOpen)  instantOpen = true;
    if (wantsClose) instantClose = true;

    if (instantOpen) {
      if (!lastOk) okSince = nowMs;
      lastOk = true;
    } else if (instantClose) {
      lastOk = false; okSince = 0;
    }
    const heldMs   = lastOk ? (nowMs - okSince) : 0;
    const gateOpen = lastOk && (heldMs >= HOLD_MS);

    let reason = 'ok';
    if (!gateOpen) {
      if (wantsClose) reason = 'arm_extended';
      else if (!wantsOpen) reason = 'ambiguous';
      else reason = 'holding';
    }

    return {
      gateOpen,
      heldMs,
      angleDeg: +emaAngle.toFixed(1),
      reason,
      side: isLeft ? 'left' : 'right'
    };
  }

  return { update };
})();





const CoachSpeech = {
  queue: [],
  speakingNow: false,
  lastSpokenAt: 0,
  COOLDOWN_MS: 2000, // 


  quietWindows: [],  // [{start,end}]
  addQuietWindow(startAbsMs, endAbsMs) {
    if (!Number.isFinite(startAbsMs) || !Number.isFinite(endAbsMs)) return;
    if (endAbsMs <= startAbsMs) return;
    this.quietWindows.push({ start: startAbsMs, end: endAbsMs });
  },
  _pruneQuietWindows(now) {
    // drop windows that are fully in the past (add tiny slack)
    this.quietWindows = this.quietWindows.filter(w => w.end > (now - 50));
  },
  _inQuietWindow(now) {
    this._pruneQuietWindows(now);
    return this.quietWindows.some(w => now >= w.start && now <= w.end);
  },
  // --- NEW: guard to block form cues briefly after timed lines ---
  blockFormUntil: 0,                 // ms (performance.now base)
  protectFormFor(ms, now) {          // call after a timed line
    this.blockFormUntil = Math.max(this.blockFormUntil, (now || performance.now()) + ms);
  },

  // NEW: can other things enqueue right now?
  canEnqueueFormCue(now) {
    if (this._inQuietWindow(now)) return false;

    if (now < this.blockFormUntil) return false;    // hard guard around timed lines
    return (now - this.lastSpokenAt) >= this.FORM_CUE_MIN_GAP;
  },

  lastFormCueAt: 0,
  FORM_CUE_MIN_GAP: 2000,

  markFormCue(now) {
    this.lastFormCueAt = now;
  },

  // --- NEW: hard, immediate timed speak (preempts everything) ---
  speakTimedNow(now, text) {
    if (!('speechSynthesis' in window) || !text) return;

    try { speechSynthesis.cancel(); } catch(e) {}
    this.queue.length = 0;          // clear backlog
    this.speakingNow = false;       // reset state machine

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 0.95; u.volume = 1.0;

    // after this timed line, set guard & record lastSpokenAt
    u.onend = () => {
      this.speakingNow = false;
      this.lastSpokenAt = performance.now();
    };
    u.onerror = () => {
      this.speakingNow = false;
      this.lastSpokenAt = performance.now();
    };

    this.speakingNow = true;
    try { speechSynthesis.speak(u); } catch (e) { this.speakingNow = false; }

    // block form cues for 1.5s so they can't “immediately” follow over it
    this.protectFormFor(1500, now);
  },

  // --- existing queue-based API remains the same ---
  enqueue(now, text, { priority = 1, maxDelayMs = 900, tag = 'generic' } = {}) {
    if (!('speechSynthesis' in window) || !text) return;
    this.queue.push({ text, priority, requestedAt: now, maxDelayMs, tag });
  },

  tick(now) {
    if (!('speechSynthesis' in window)) return;
    if (this.speakingNow) return;
    if (now - this.lastSpokenAt < this.COOLDOWN_MS) return;
    if (!this.queue.length) return;

    if (this._inQuietWindow(now)) return;


    this.queue = this.queue.filter(item => (now - item.requestedAt) <= item.maxDelayMs);
    if (!this.queue.length) return;

    this.queue.sort((a, b) => b.priority - a.priority || a.requestedAt - b.requestedAt);
    const item = this.queue.shift();
    if (!item) return;

    const u = new SpeechSynthesisUtterance(item.text);
    u.rate = 1.0; u.pitch = 0.95; u.volume = 1.0;

    this.speakingNow = true;
    u.onend = () => { this.speakingNow = false; this.lastSpokenAt = performance.now(); };
    u.onerror = () => { this.speakingNow = false; this.lastSpokenAt = performance.now(); };

    try { speechSynthesis.speak(u); } catch (e) { this.speakingNow = false; }
  },

  speakOnce(now, text, opts = {}) { this.enqueue(now, text, opts); }
};


const isIpad = (navigator.userAgent.includes("iPad")) ||
               (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
const isIphone = /iPhone/i.test(navigator.userAgent);
let speechReady = false;

const isIOS = isIpad || isIphone;






const TimedCoach = {
  startMs: null,
  cues: [
    { t: 5000,  text: 'Great start! Keep going',              fired: false },
    { t: 15000, text: 'Halfway there, keep up the pace',      fired: false },
    { t: 25000, text: 'Almost done',                          fired: false },
  ],
  

  start(nowMs) {
    this.startMs = nowMs;
    this.cues.forEach(c => { c.fired = false; });

    const HALF = 1500;
    for (const c of this.cues) {
      const cueAbs = this.startMs + c.t;          // absolute time of cue
      CoachSpeech.addQuietWindow(cueAbs - HALF, cueAbs + HALF);
    }
  },

  reset() {
    this.startMs = null;
    this.cues.forEach(c => { c.fired = false; });
  },

update(nowMs /*, canSpeakCb not needed for timed hard-fire */) {
    if (this.startMs == null) return;
    const elapsed = nowMs - this.startMs;

    for (const cue of this.cues) {
      if (!cue.fired && elapsed >= cue.t) {
        // HARD FIRE: preempt anything currently speaking and speak now
        CoachSpeech.speakTimedNow(nowMs, cue.text);
        cue.fired = true;
      }
    }
  }



};

export function timedCoachStart(nowMs) {
  TimedCoach.start(nowMs);
}

export function timedCoachReset() {
  TimedCoach.reset();
}

export function timedCoachTick(nowMs) {
  // Adapt this depending on whether you're using CoachSpeech or SpeechBus.
  TimedCoach.update(nowMs, () => CoachSpeech.canSpeak
    ? CoachSpeech.canSpeak(nowMs)
    : true
  );
}





export function initCoachSpeech() {
  if (!('speechSynthesis' in window)) return;
  if (speechReady) return;

  // tiny silent utterance just to unlock on iOS
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  u.rate = 1.0;
  u.onend = () => { speechReady = true; };
  try { window.speechSynthesis.speak(u); } catch (e) {
    // if this fails, we just won't mark ready
  }
}




export function speakFinishCue(now, missArms, missShallow) {
  if (!missArms && !missShallow) return;

  let phrase;
  if (missArms && missShallow) phrase = 'Cross arms and go lower';
  else if (missArms)           phrase = 'Cross arms';
  else                         phrase = 'Go lower';

  CoachSpeech.speakOnce(now, phrase);
}

export{AnkleGate,AngleGate,ArmsCrossGate,CoachSpeech};