import { hudSetReps,hudSetTimer,hudSetFormBars } from "../ui/status_bar.js";
import { canvas } from "../utils/canvas.js";
import { showResultsModal,hideAngleHint } from "../ui/overlay.js";
import { cueShallow ,cueCrossArms,speakFinishCue} from "./gate.js";
import { hidePill,setPhaseLabel,showPill } from "../ui/phase.js";
import{telemOnPhase,telemStart,telemStop,exportSlideJSON,telemPoint,buildSlideJSONBlob ,telemSetResults } from "../utils/log.js";
import{startSessionRecording,stopSessionRecording,defaultFilenameBase,sanitizePart } from "../utils/session_recorder.js";
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { downloadBlob,zipNameFromExisting } from "../utils/zip.js";
import { initCoachSpeech ,timedCoachReset,timedCoachStart} from "./gate.js";
const SitStand = (() => {
  // --- UI bits (hook to your existing HUD/status bar) ---
  const $start     = () => document.getElementById('hudStart');
  const $countdown = () => document.getElementById('hudCountdown');
  const $countNum  = () => document.getElementById('hudCountNum');
  // If you used my status bar, this selects it; otherwise set to your HUD block that shows reps/form/timer
  const $statusBar = () => document.querySelector('.status-bar') || document.getElementById('hud');

  // Your existing HUD updaters (from your codebase)
  const setReps   = (n) => (typeof hudSetReps === 'function') && hudSetReps(n);
  const setBars   = (arr, idx=-1) => (typeof hudSetFormBars === 'function') && hudSetFormBars(arr, idx);
  const setTimerS = (s) => (typeof hudSetTimer === 'function') && hudSetTimer(s);

  // --- Session config & state --- 
  const COUNTDOWN_SEC = 3;


  const LEFT_SIDE  = new Set([11, 13, 15, 23, 25, 27, 29, 31]); // shoulder, elbow, wrist, hip, knee, ankle, heel, foot_index
  const RIGHT_SIDE = new Set([12, 14, 16, 24, 26, 28, 30, 32]);
  const FACE_MAX_INDEX = 10;
  const HAND_IDX = new Set([17, 18, 19, 20, 21, 22]); 


  const DEFAULT_SESSION_SEC = 30; // change this or expose via setSessionSeconds()
  let sessionDurationSec = DEFAULT_SESSION_SEC;

  let sessionStartMs = null;       // when session started (performance.now ms)
  let lastShownTimerSec = null; 

   

  let sessionActive = false;
  let countdownId = null;

  // Finite State Machine for rep phases
  // standing -> going_down -> seated -> going_up -> standing (+1 rep)
  let phase = 'standing';
  let lastPhase = 'standing';

  let lastHipY = null;
  let hipVelocityY = 0;
  
  // A small threshold to detect if movement has started or stopped
  const VELOCITY_THRESHOLD = 1.5; // Adjust

let armsOkThroughout = false; // must remain true from going_down start until standing
let _armsgateopen = false;


  // Phase thresholds (degrees). Adjust to taste.
const KNEE_STAND_MAX   = 150;  // >150 means standing
const KNEE_SEATED_MIN  = 90;  // 
//const KNEE_SEATED_MIN  = 60;  // 


// Angular velocity thresholds (deg/s)
const V_KNEE_FLEX_THR  = -50;  // flexing fast enough ⇒ going_down
const V_KNEE_EXT_THR   = 50; // extending fast enough ⇒ going_up
const V_ANG_STILL_THR  = 10;  // |knee flex vel| small ⇒ “still”

let partialReversalKneeAngle = null;
let partialReversalHipY = null;
let partialReversalKneeY = null;
let partialRep = false;

  // Per-rep metrics
  let repCounter = 0;
  let fullrepCount = 0;
  let partialrepCount = 0;
  let repHistory = [];  // array of 'good|ok|bad' for HUD bars
  let kneescore_arr = [];
  let backScore_arr = [];
  let depth_arr = [];
  let symmetry_arr = [];

  // Timing
  let tDownStart = null;
  let tDownEnd   = null; // seated reached
  let tUpStart   = null;

  // Quality metrics captured over rep
let maxHipBackDegForward = 0;   // most forward (positive) signed angle seen this rep
let minHipBackDegBackward = 0;  // most backward (negative) signed angle seen this rep
  let maxHipBackDegDuringRep = 0;
  let kneeAngleAtBottom = null;
  let bottomHipY = null;
  let bottomKneeY = null;

//Going down velocity is negative, going up is positive
const TOP_BAND = 0.75; // near standing
const BOTTOM_BAND = 0.50;


const V_DOWN_THR   = -0.25;  // frac/sec going down
const V_UP_THR     =  0.25;  // frac/sec going up  
const V_STILL_THR  =  0.50;  // |vel| below this counts as "still" was 0.1
const HOLD_MS      = 100;    // how long to be still at top/bottom4 was 150


let _hipFrac = 0;
let _hipVel  = 0;
let bodyH=0;
let anchVel = 0;
let _kneeflexAng3d =0;
let _knee_Vel3d = 0;

let _hipAnkFrac = 0;      // NEW: normalized hip–ankle depth
let _hipAnkVel  = 0;      // NEW: vel of normalized depth

let _kneescore = 0; //max score 30
let _backscore = 0; //max score 20
let _depth = 0; //max score 30
let _speed = 0; // max score 20


let repAttempted = false;    // true after we start going_down
let bottomReached = false;   // set true once seated
let downStartMs = null;      // when going_down began
const MAX_DOWN_MS = 4000;    // optional timeout for stalls


let topHoldSince   = null;
let bottomHoldSince= null;


const SCORE_THR_GOOD = 75;
const SCORE_THR_OK   = 50;


let _audioCtx = null;


const PHASE_LABELS = {
  standing:    'Standing',
  going_down:  'Going Down',
  going_up:    'Going up',   // note: lowercase “up” as requested
  seated:      'Seated'
};

const BASE_STYLE = {
  connector: 'rgba(246,246,246,0.60)',        // default grey
  connectorWidth: 4,              // ← add

  lmOuter:   '#e1e1e1',                       // outer ring
  lmInner:   '#f6f6f6',                       // core
  ghostAlpha: 0.40
};

const FLASH_STYLES = {
  good: { connector: 'rgba(16,185,129,1.00)', lmOuter: '#10B981', lmInner: '#34D399', ghostAlpha: 0.40 }, // green
  ok:   { connector: 'rgba(245,158,11,1.00)', lmOuter: '#F59E0B', lmInner: '#FBBF24', ghostAlpha: 0.40 }, // orange
  bad:  { connector: 'rgba(239,68,68,1.00)',  lmOuter: '#EF4444', lmInner: '#F87171', ghostAlpha: 0.40 }  // red
};

// Simple tiering
function scoreTier(total){
  if (total >= SCORE_THR_GOOD) return 'good';
  if (total >= SCORE_THR_OK)   return 'ok';
  return 'bad';
}

function ensureAudio(){
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
}

function notifyMiss(reason='shallow'){
  _flashTier = 'bad';                        // force red
  _flashUntilMs = performance.now() + 600;   // visible for 600ms
  playChime('bad');                          // short "down" tone
}

function playChime(tier='good'){
  ensureAudio();
  const ctx = _audioCtx;
  const osc = ctx.createOscillator();
  const gain= ctx.createGain();

  // per-tier pitch & envelope
  const cfg = {
    good: { f1: 880, f2: 1320, dur: 0.18 },   // bright 2-note up
    ok:   { f1: 660, f2:  660, dur: 0.14 },   // single soft
    bad:  { f1: 300, f2:  220, dur: 0.22 },   // down step
  }[tier];

  const t0 = ctx.currentTime;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(cfg.f1, t0);
  osc.frequency.linearRampToValueAtTime(cfg.f2, t0 + cfg.dur * 0.6);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + cfg.dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + cfg.dur);
}

// --- Flash controller ---
let _flashTier = null;
let _flashUntilMs = 0;

function notifyRepScore(total){
  _flashTier = scoreTier(total);
  _flashUntilMs = performance.now() + 600; // show for 600ms
  playChime(_flashTier);
}

// Exposed to drawing layer:
function getPoseStyle(nowMs){
  if (nowMs < _flashUntilMs && _flashTier) return FLASH_STYLES[_flashTier];
  return BASE_STYLE;
}




  function startSessionTimer(durationSec = sessionDurationSec){
    sessionDurationSec = Math.max(1, durationSec|0);
    
    sessionStartMs = performance.now();
    window.HUD_TOTAL_SECONDS = sessionDurationSec;   // <-- make ring use correct total

    lastShownTimerSec = null; // force HUD refresh
    sessionActive = true;
    setTimerS(sessionDurationSec); // show full time at start
  }

  function stopSessionTimer(){
    sessionStartMs = null;
    lastShownTimerSec = null;
    sessionActive = false;
  }

  function resetSessionState() {
  // timers / flags
  sessionActive = false;
  if (countdownId) { clearInterval(countdownId); countdownId = null; }
  sessionStartMs = null;
  lastShownTimerSec = null;

  // FSM & per-rep metrics
  phase = 'standing'; lastPhase = 'standing';
  tDownStart = tDownEnd = tUpStart = null;
  kneeAngleAtBottom = null;
  bottomHipY = bottomKneeY = null;
  maxHipBackDegDuringRep = 0;
  topHoldSince = bottomHoldSince = null;

  // live signals / scores
  _hipFrac = 0; _hipVel = 0;
  _kneescore = 0; _backscore = 0; _depth = 0; _speed = 0;
  lastHipY = null; hipVelocityY = 0;

  // velocity estimator
  Vel.lastT = Vel.lastF = null; Vel.raw = 0; Vel.smooth = 0;



  // counters & HUD
  repCounter = 0;
  repHistory.length = 0;
  kneescore_arr.length = 0;
  backScore_arr.length = 0; 
  depth_arr.length = 0; 
  symmetry_arr.length = 0;  
  fullrepCount = 0;
  partialrepCount = 0;

  setReps(0);
  setBars([], -1);

  // reset timer text/ring to full duration
  setTimerS(sessionDurationSec);
  clearOverlay(canvas);
  
}
function clearOverlay(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

  function updateTimer(nowMs){
    if (!sessionActive || sessionStartMs == null) return;

    const elapsedSec = (nowMs - sessionStartMs) / 1000;
    const remaining = Math.max(0, Math.ceil(sessionDurationSec - elapsedSec));
    console.debug('remaining', remaining);


    if (remaining !== lastShownTimerSec){
      setTimerS(remaining);
      lastShownTimerSec = remaining;
    }

    if (remaining <= 0){
      endSession('timeup');
    }
  }





 async function endSession(reason = 'timeup') {
  // 1) Stop timers / telemetry
  stopSessionTimer();
  telemStop(performance.now());
  const summary = buildResultsSummary();
  telemSetResults(summary);
  timedCoachReset();



  let jsonFile = null;
  try {
    jsonFile = buildSlideJSONBlob();
  } catch (e) {
    console.error('[endSession] buildSlideJSONBlob failed:', e);
  }

 
  let videoResult = null;
  try {
    videoResult = await stopSessionRecording(reason || 'timeup');
  } catch (e) {
    console.error('[endSession] stopSessionRecording failed:', e);
  }

  try {
    const zip = new JSZip();

    if (jsonFile?.blob && jsonFile?.name) {
      zip.file(jsonFile.name, jsonFile.blob);
    }

    if (videoResult?.blob && videoResult?.filename) {
      zip.file(videoResult.filename, videoResult.blob);
    }

    const zipName =
      (jsonFile?.name && zipNameFromExisting(jsonFile.name)) ||
      (videoResult?.filename && zipNameFromExisting(videoResult.filename)) ||
      `${defaultFilenameBase()}.zip`;

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    await downloadBlob(zipName, zipBlob);
  } catch (err) {
    console.error('[endSession] ZIP packaging failed:', err);
  }

  // 5) UI visibility (unchanged)
  $countdown()?.classList.add('hidden');
  $statusBar()?.classList.add('hidden');
  $start()?.classList.remove('hidden');


  showResultsModal(summary);
  hidePill();
  hideAngleHint();
  
}


function setArmsGateOpen(v) {
  _armsgateopen = !!v;
}


  // --- Results aggregation ---
function mean(arr){ return (!arr || arr.length === 0) ? 0 : arr.reduce((s,x)=>s+(x||0),0)/arr.length; }
function pctOfMax(avg, max){ return max > 0 ? (avg / max) * 100 : 0; }

function buildResultsSummary(){
  const reps = Math.max(
    kneescore_arr.length,
    backScore_arr.length,
    depth_arr.length,
    symmetry_arr.length
  );

  const fullrepcounter = fullrepCount;
  const partialRepcounter = partialrepCount;


  const kneeAvg = mean(kneescore_arr);        // out of 30
  const depthAvg = mean(depth_arr);           // out of 30
  const symAvg = mean(symmetry_arr);          // out of 20
  const backAvg = mean(backScore_arr);        // out of 20

  // As percents of max (what you asked to display)
  const kneePct = pctOfMax(kneeAvg, 30);
  const depthPct = pctOfMax(depthAvg, 30);
  const symPct   = pctOfMax(symAvg, 20);
  const backPct  = pctOfMax(backAvg, 20);

  // Overall (0..100) — either mean of totals or sum of per-metric means (equivalent)
  const overallAvg = kneeAvg + depthAvg + symAvg + backAvg;   // out of 100
  const overallPct = overallAvg; // already out of 100

  return {
    reps,
    fullrepcounter,
    partialRepcounter,
    knee: { avg: kneeAvg, pct: kneePct, max: 30 },
    depth:{ avg: depthAvg, pct: depthPct, max: 30 },
    symmetry: { avg: symAvg, pct: symPct, max: 20 },
    back: { avg: backAvg, pct: backPct, max: 20 },
    overall: { avg: overallAvg, pct: overallPct, max: 100 }
  };
}










function handlePostResultsReset(){
  resetSessionState();
}




function updatePhaseFromHip(nowMs, hipY, shoulderY, ankleY, kneeY, kneeFlex3D){
  // const denom = Math.max(20, Math.abs(kneeY - ankleY));
  // const f = clamp01((kneeY - hipY) / denom);  

  const denom = Math.max(0.02, Math.abs(kneeY - ankleY));
  const f = clamp01((kneeY - hipY) / denom);

  const vel = Vel.update(nowMs, f);

  // : knee flexion velocity (deg/s)
  const kVel = KneeVel.update(nowMs, kneeFlex3D);

  _hipFrac = f; _hipVel = vel;
  _kneeflexAng3d = kneeFlex3D; _knee_Vel3d = kVel; // (optional) expose for debug HUD

  if (phase === 'standing' && f >= TOP_BAND) {
    HipAnkCalib.update(hipY, ankleY);           
  }

  let hipAnkFrac = null;                        
  let hipAnkVel  = null;                       
  const scale = HipAnkCalib.get();              

  if (scale != null) {                          
    const dy = Math.abs(hipY - ankleY);         // image-space vertical distance
    hipAnkFrac = dy / scale;                    // dimensionless depth ~1 at calibrated standing
    hipAnkVel  = HipAnkVel.update(nowMs, hipAnkFrac);

    _hipAnkFrac = hipAnkFrac;
    _hipAnkVel  = hipAnkVel;
    anchVel     = hipAnkVel ?? 0;            
  }

  const prev = phase;

  // Holds (unchanged, keep using f-bands)
  if (f >= TOP_BAND && Math.abs(vel) < V_STILL_THR){
    topHoldSince = (topHoldSince ?? nowMs);
  } else topHoldSince = null;

  if (f <= BOTTOM_BAND && Math.abs(vel) < V_STILL_THR){
    bottomHoldSince = (bottomHoldSince ?? nowMs);
  } else bottomHoldSince = null;

  //  with added knee logic
  switch (phase) {
    case 'standing': {
      const kneeSuggestsDown =
        (kneeFlex3D != null && (kneeFlex3D < KNEE_STAND_MAX && kVel < V_KNEE_FLEX_THR));
      if ((vel < V_DOWN_THR && f < TOP_BAND) || kneeSuggestsDown){
        phase = 'going_down';
      }
      break;
    }

    case 'going_down': {
      const kneeAtBottom =  (kneeFlex3D != null && kneeFlex3D <= KNEE_SEATED_MIN && Math.abs(kVel) < V_ANG_STILL_THR);


      if ((f <= BOTTOM_BAND && Math.abs(vel) < V_STILL_THR && bottomHoldSince && (nowMs - bottomHoldSince) >= HOLD_MS)
          || kneeAtBottom) {
        phase = 'seated';
      }
      // Early reversal: strong knee extension indicates up
      else if (kVel >= V_KNEE_EXT_THR && kneeFlex3D != null){
        phase = 'going_up';
      }
      else if(kneeFlex3D>KNEE_STAND_MAX){
        phase = 'standing';
      }
      break;
    }

    case 'seated': {
      const kneeSuggestsUp =  (kneeFlex3D != null && (kVel >= V_KNEE_EXT_THR || kneeFlex3D > (KNEE_SEATED_MIN + 5)));


      if ((vel > V_UP_THR && f > BOTTOM_BAND) || kneeSuggestsUp){
        phase = 'going_up';
      }
      break;
    }

    case 'going_up': {
 const kneeAtTop =(kneeFlex3D != null && kneeFlex3D >= (KNEE_STAND_MAX-5));


      if ((f >= TOP_BAND  && Math.abs(vel) < V_STILL_THR && topHoldSince && (nowMs - topHoldSince) >= HOLD_MS)
          || kneeAtTop) {
        phase = 'standing';
      }
      break;
    }
  }

  lastPhase = prev;
  return { f, vel,kVel ,hipAnkVel};
}

  // Helpers
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);


function attachStart() {
  const btn = document.getElementById('sitStandStartBtn');
  if (!btn) return;

  const onStart = () => {
    if (sessionActive || countdownId) return;   
    try { ensureAudio(); } catch (_) {}
    initCoachSpeech();



    $start()?.classList.add('hidden');
//     runCountdown(COUNTDOWN_SEC).then(() => {
//       $statusBar()?.classList.remove('hidden');
//       startSessionTimer(sessionDurationSec);
//       showPill();
//       setPhaseLabel("");
//       telemStart(performance.now()); // record
//       telemOnPhase(performance.now(), phase);  // record initial phase span

//       //to record session

//       startSessionRecording({
//   videoEl: document.getElementById('webcam'),
//   includeMic: false                            
// });


//     });
      runCountdown(COUNTDOWN_SEC).then(() => {
        $statusBar()?.classList.remove('hidden');
        showPill();
        setPhaseLabel("");

        const startCore = () => {
          const now = performance.now();
          telemStart(now);
          telemOnPhase(now, phase);
          startSessionTimer(sessionDurationSec); // sets sessionActive at the REAL start
          timedCoachStart(now);

        };

        // If startSessionRecording is sync & light, just call then startCore():
        // startSessionRecording({ videoEl: ..., includeMic:false });
        // startCore();

        // Safer: if it's heavy or async, separate paint vs work:
        requestAnimationFrame(() => {
          startSessionRecording({
            videoEl: document.getElementById('webcam'),
            includeMic: false
          });
          startCore();
        });
      });

  };

  // remove once:true — keep the same handler for the whole page life
  btn.addEventListener('click', onStart);
}

  function runCountdown(sec=3){
    return new Promise((resolve) => {
      const wrap = $countdown(); const numEl = $countNum();
      if (!wrap || !numEl) return resolve();
      wrap.classList.remove('hidden');
      let t = Math.max(1, sec|0);
      numEl.textContent = t;
      countdownId = setInterval(() => {
        t--;
        if (t <= 0){
          clearInterval(countdownId); countdownId = null;
          numEl.textContent = 'Go!';
          // brief flash then hide
          setTimeout(() => { wrap.classList.add('hidden'); resolve(); }, 350);
        } else {
          numEl.textContent = t;
        }
      }, 1000);
    });
  }



// --- Smoothing helpers ---
function ema(prev, x, a) { return (prev == null) ? x : a*x + (1-a)*prev; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
// --- Hip-ankle calibration & velocity (mirror Python) ---
// Collects standing hip-ankle distances and locks a median scale.
const HipAnkCalib = {
  minSamples: 5,
  maxSamples: 40,
  samples: [],
  scale: null,   // locked median once ready

  update(hipY, ankY) {
    if (this.scale != null) return;   // already locked

    const d = Math.abs(hipY - ankY);
    if (!(d > 0)) return;

    this.samples.push(d);
    if (this.samples.length > this.maxSamples) this.samples.shift();

    if (this.samples.length >= this.minSamples) {
      const sorted = [...this.samples].sort((a, b) => a - b);
      this.scale = sorted[Math.floor(sorted.length / 2)];
    }
  },

  get() { return this.scale; }
};

// Velocity estimator for hip-ankle *fraction* (normalized depth)
const HipAnkVel = {
  lastT: null, lastF: null, raw: 0, smooth: 0,
  update(t, f) {
    if (this.lastT != null) {
      const dt = Math.max(0.01, (t - this.lastT) / 1000);
      this.raw = (f - this.lastF) / dt;
      this.smooth = ema(this.smooth, this.raw, 0.3); // same alpha as Vel
    }
    this.lastT = t;
    this.lastF = f;
    return this.smooth;
  },
  reset() {
    this.lastT = this.lastF = null;
    this.raw = this.smooth = 0;
  }
};




//Velocity estimator for hipFrac
const Vel = {
  lastT: null, lastF: null, raw: 0, smooth: 0,
  update(t, f){
    if (this.lastT != null){
      const dt = Math.max(0.01, (t - this.lastT)/1000); // seconds
      this.raw = (f - this.lastF) / dt;
      this.smooth = ema(this.smooth, this.raw, 0.3); // smooth velocity
    }
    this.lastT = t; this.lastF = f;
    return this.smooth;
  }
};

const KneeVel = {
  lastT: null, lastA: null, raw: 0, smooth: 0,
  update(t, angleDeg){
    if (angleDeg == null) return 0;
    if (this.lastT != null){
      const dt = Math.max(0.01, (t - this.lastT)/1000);
      this.raw = (angleDeg - this.lastA) / dt;      // deg/s
      this.smooth = ema(this.smooth, this.raw, 0.3);
    }
    this.lastT = t; this.lastA = angleDeg;
    return this.smooth;
  }
};

const Vel2 = {
  lastT: null, lastX: null, v: 0, smooth: 0,
  update(t, x){
    if (this.lastT != null){
      const dt = Math.max(0.01, (t - this.lastT)/1000);
      this.v = (x - this.lastX) / dt;
      // very light smoothing so it’s responsive
      this.smooth = ema(this.smooth,this.v,0.3);
    }
    this.lastT = t; this.lastX = x;
    return this.smooth;
  },
  reset(){ this.lastT = this.lastX = null; this.v = this.smooth = 0; }
};




function scoreKneeBand(angleDeg, upper = 90, falloffDeg = 20, curve = 1.8) {
  if (angleDeg == null) return 0;
  if (angleDeg <= upper) return 30;                 // full points up to 90°
  const t = (angleDeg - upper) / falloffDeg;        // 0 at 90°, 1 at (90+falloff)
  const faded = 30 * (1 - Math.pow(t, Math.max(1, curve)));
  return clamp(faded, 0, 30);                       // clip to [0,30]
}



  // Rewards low forward lean; penalizes backward lean.
// function scoreBackPostureSigned(maxFwdDeg, minBackDeg, cfg){
//   const C = Object.assign({
//     fwdFull: 5,   // full points if forward lean ≤ 5°
//     fwdZero: 20,   // 0 points by 20

//     backGrace: -5,  // no penalty down to -10°
//     backZero:  -30,  // maximum penalty by -30° 
//     maxPts:    20    // total points available for back 
//   }, cfg || {});

//   const fwdExcess = Math.max(0, maxFwdDeg - C.fwdFull);
//   const fwdSpan   = Math.max(1e-6, C.fwdZero - C.fwdFull); // avoid /0
//   const fwdScore  = clamp(C.maxPts * (1 - (fwdExcess / fwdSpan)), 0, C.maxPts);

//   let penalty = 0;
//   if (minBackDeg < C.backGrace){
//     const t = clamp((C.backGrace - minBackDeg) / (C.backGrace - C.backZero), 0, 1);
//     penalty = C.maxPts * t; // scale up to full 20-pt penalty at -30°
//   }

//   return clamp(fwdScore - penalty, 0, C.maxPts);
// }


// Backward-only scoring: -5° => 20 pts, -20° => 0 pts (linear in between).
function scoreBackPostureSigned(_maxFwdDeg, minBackDeg, cfg) {
  const C = Object.assign({
    backGrace: -5,   // full points if backward lean ≥ -5°
    backZero:  -20,  // 0 points by -20°
    maxPts:    20
  }, cfg || {});

  if (minBackDeg >= C.backGrace) return C.maxPts;   // at/above -5°
  if (minBackDeg <= C.backZero)  return 0;          // at/below -20°

  // Linear map from [-20 .. -5] → [0 .. maxPts]
  const t = (minBackDeg - C.backZero) / (C.backGrace - C.backZero); // 0..1
  return clamp(C.maxPts * t, 0, C.maxPts);
}

  

  
function scoreSymmetry(downMs, upMs) {
  if (!downMs || !upMs) return 0;
  const fast = Math.max(downMs, upMs);
  const slow = Math.min(downMs, upMs);
  const ratio = fast / slow; // ≥1

  // Full points up to 1.6, then decrease to 0 by 2.6
  if (ratio <= 1.6) return 20;
  const t = (ratio - 1.6) / (2.6 - 1.6); // normalize 1.6→0, 2.6→1
  return clamp(20 * (1 - t), 0, 20);
}



  
function scoreDepth(hipY, kneeY) {
  if (hipY == null || kneeY == null) return 0;

  // Ratio: hipY / kneeYf
  const ratio = Math.abs(hipY / kneeY);

  // Full points if hip is at or below knee (ratio >= 1)
  if (ratio >= 1) return 30;

  // Partial credit: ratio from 0.7 to 1.0 maps to 0–25
  const MIN_RATIO = 0.7; // adjust for tolerance
  if (ratio <= MIN_RATIO) return 0;

  const t = (ratio - MIN_RATIO) / (1 - MIN_RATIO);
  return clamp(30 * t, 0, 30);
}



    function getPhase(){
    return phase;                 // read-only view
  }
  function phaseToLabel(p) {
  return PHASE_LABELS[p] || (p ? String(p).replace(/_/g, ' ') : 'n/a');
}



    function getHipVelocityY() {
    return hipVelocityY;
  }
  function getHipFrac(){ return _hipFrac; }
  function getHipVel(){  return _hipVel;  }
  function getanchoredvel(){return anchVel;}
  function getkneescore(){  return _kneescore;  }
  function getbackscore(){return _backscore;}
  function getspeed(){return _speed;}
  function getdepth(){return _depth;}
  function getbodyheight(){return bodyH;}
  function getsessionActive(){return sessionActive;}
function getkvel(){return _knee_Vel3d;}
function getminbackangle(){return minHipBackDegBackward;}









function updateFrame({ now, hipBackDeg, hipY, kneeY, shoulderY, ankleY, kneeFlex3D }) {
  if (!sessionActive) return;

  const { f: hipFrac, vel: hipVel, kVel: kneeVel,hipAnkVel } =
    updatePhaseFromHip(now, hipY, shoulderY, ankleY, kneeY, kneeFlex3D);

  //telemPoint(now, kneeFlex3D, hipVel, phase, hipFrac, kneeVel, hipBackDeg, repCounter);
    telemPoint(now, kneeFlex3D, hipVel, phase, hipFrac, kneeVel, hipBackDeg, partialrepCount,fullrepCount,hipAnkVel,_armsgateopen);


  // track posture extremes
  if (hipBackDeg != null){
    if (hipBackDeg > maxHipBackDegForward) maxHipBackDegForward = hipBackDeg;
    if (hipBackDeg < minHipBackDegBackward) minHipBackDegBackward = hipBackDeg; // more negative
  }

  // Accumulate arms-gate state continuously while a rep is in progress

    if (repAttempted && (phase === 'going_down' || phase === 'seated' || phase === 'going_up')) {
    armsOkThroughout = armsOkThroughout && !!_armsgateopen;
  }

  if (lastPhase !== phase) {
    telemOnPhase(now, phase);

    // entering going_down 
    if (lastPhase === 'standing' && phase === 'going_down') {
      repAttempted = true;
      bottomReached = false;
      partialRep = false;

      tDownStart = now;
      // reset per-rep metrics
      kneeAngleAtBottom = null;
      bottomHipY = null;
      bottomKneeY = null;
      partialReversalKneeAngle = null;
      partialReversalHipY = null;
      partialReversalKneeY = null;

      maxHipBackDegDuringRep = 0;
      maxHipBackDegForward = 0;
      minHipBackDegBackward = 0;

      armsOkThroughout = !!_armsgateopen;
    }

    //  entering seated (full botto
    if (lastPhase === 'going_down' && phase === 'seated') {
      bottomReached = true;
      tDownEnd = now;

      kneeAngleAtBottom = kneeFlex3D;
      bottomHipY = hipY;
      bottomKneeY = kneeY;

      // posture debug
      // console.log('[AT SEATED]', { maxFwd:maxHipBackDegForward.toFixed(1), minBack:minHipBackDegBackward.toFixed(1) });
    }

    //early reversal 
    if (lastPhase === 'going_down' && phase === 'going_up' && repAttempted && !bottomReached) {
      // Snapshot the deepest point achieved
      partialRep = true;
      tDownEnd = now;            // we ended the down phase at reversal
      tUpStart = now;            // start up phase now
      partialReversalKneeAngle = kneeFlex3D;
      partialReversalHipY = hipY;
      partialReversalKneeY = kneeY;

     // notifyMiss('shallow');     // keep your shallow cue
      cueShallow(now);

  
    }

    // entering going_up after a full bottom
    if (lastPhase === 'seated' && phase === 'going_up') {
      tUpStart = now;
      // console.log('[GOING UP]', { maxFwd:maxHipBackDegForward.toFixed(1), minBack:minHipBackDegBackward.toFixed(1) });
    }

   
    // rep completion: going_up -> standing (count full or partial, BUT only if arms stayed crossed)
      if (lastPhase === 'going_up' && phase === 'standing' && repAttempted) {
        const isFull = bottomReached === true;



        
        const missArms    = !armsOkThroughout;
        const missShallow = !isFull;               // your logic counts partial, but we still chime

        if (missArms || missShallow) {
       notifyMiss(missArms ? 'arms_not_crossed' : 'shallow');  
  }


         if (missArms)    cueCrossArms(now);
          if (missShallow) cueShallow(now);

        speakFinishCue(now, missArms, missShallow);







        // If arms gate ever closed during the rep window, reject the rep
        if (!armsOkThroughout) {
         // notifyMiss('arms_not_crossed');
          cueCrossArms(now);

          // reset per-rep fields (same as after a counted rep)
          tDownStart = tDownEnd = tUpStart = null;
          kneeAngleAtBottom = null;
          bottomHipY = bottomKneeY = null;

          partialReversalKneeAngle = null;
          partialReversalHipY = null;
          partialReversalKneeY = null;
          partialRep = false;

          maxHipBackDegDuringRep = 0;
          maxHipBackDegForward = 0;
          minHipBackDegBackward = 0;

          repAttempted = false;
          bottomReached = false;
          armsOkThroughout = false;
          return; // do NOT score or count
        }

        // Arms ok → proceed to score and count (full OR partial, preserving your original logic)
        const downMs = (tDownStart && tDownEnd) ? (tDownEnd - tDownStart) : 0;
        const upMs   = (tUpStart) ? (now - tUpStart) : 0;

        // choose snapshots (full uses bottom; partial uses reversal snapshot or current)
        const snapKneeAngle = isFull ? kneeAngleAtBottom : (partialReversalKneeAngle ?? kneeFlex3D);
        const snapHipY      = isFull ? bottomHipY        : (partialReversalHipY     ?? hipY);
        const snapKneeY     = isFull ? bottomKneeY       : (partialReversalKneeY    ?? kneeY);

        const f1 = scoreKneeBand(snapKneeAngle);
        const f2 = scoreBackPostureSigned(maxHipBackDegForward, minHipBackDegBackward);
        const f3 = scoreSymmetry(downMs, upMs);
        const f4 = scoreDepth(snapHipY, snapKneeY);

        _kneescore = f1;
        _backscore = f2;
        _speed     = f3;
        _depth     = f4;

        const total = Math.round(f1 + f2 + f3 + f4);

        if (isFull) fullrepCount++;
        else       partialrepCount++;

        repCounter += 1;
        setReps(repCounter);

        kneescore_arr.push(f1);
        backScore_arr.push(f2);
        symmetry_arr.push(f3);
        depth_arr.push(f4);

        repHistory.push(total);
        if (repHistory.length > 10) repHistory.shift();
        setBars(repHistory, -1);

        notifyRepScore(total);

        // reset for next rep
        tDownStart = tDownEnd = tUpStart = null;
        kneeAngleAtBottom = null;
        bottomHipY = bottomKneeY = null;

        partialReversalKneeAngle = null;
        partialReversalHipY = null;
        partialReversalKneeY = null;
        partialRep = false;

        maxHipBackDegDuringRep = 0;
        maxHipBackDegForward = 0;
        minHipBackDegBackward = 0;

        repAttempted = false;
        bottomReached = false;
        armsOkThroughout = false;
      }


  }
}
 function init(){
    // Hide the real status bar at first; show Start slab
    $statusBar()?.classList.add('hidden');
    $countdown()?.classList.add('hidden');
    $start()?.classList.remove('hidden');
    attachStart();
  }

  return { init, updateFrame ,getPhase,getHipVelocityY,getHipFrac,getHipVel,getbackscore,getkneescore,getspeed,getdepth,getbodyheight,Vel,getsessionActive,updateTimer,getPoseStyle,getkvel,getminbackangle,phaseToLabel,handlePostResultsReset,setArmsGateOpen,LEFT_SIDE,RIGHT_SIDE,FACE_MAX_INDEX,HAND_IDX};
})();





export const { init, updateFrame,getPhase,getHipVelocityY,getHipFrac,getHipVel,getbackscore,getkneescore,getspeed,getdepth ,getbodyheight,Vel,getsessionActive,updateTimer,getPoseStyle,getkvel,getminbackangle,phaseToLabel,handlePostResultsReset,setArmsGateOpen,LEFT_SIDE,RIGHT_SIDE,FACE_MAX_INDEX,HAND_IDX} = SitStand;



 


    