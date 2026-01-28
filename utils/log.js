// Slide Telemetry: time-series for 2 charts
const Telemetry = {
  t0: null,
  points: [], // [{t, knee, hipVel, phase}]
  spans: [], // [{start, end, phase}]
  marks: [], // discrete events (e.g., rep completed)
  results: null,
};
let _span = null;

export function telemSetResults(summary) {
  if (!summary) {
    Telemetry.results = null;
    return;
  }

  const to2 = (x) => +(x ?? 0).toFixed(2);
  Telemetry.results = {
    total_reps: summary.reps | 0,
    full_reps: summary.fullrepcounter | 0,
    partial_reps: summary.partialRepcounter | 0,
    depth_score: to2(summary.depth?.pct), // 0..100 pct
    knee_score: to2(summary.knee?.pct), // 0..100 pct
    back_score: to2(summary.back?.pct), // 0..100 pct
    symmetry_score: to2(summary.symmetry?.pct), // 0..100 pct
    overall_score: to2(summary.overall?.pct), // 0..100 (already percent)
  };
}

export function telemStart(nowMs) {
  Telemetry.t0 = nowMs;
  Telemetry.points.length = 0;
  Telemetry.spans.length = 0;
  Telemetry.marks.length = 0;

  _span = null;
}
export function telemOnPhase(nowMs, phase) {
  const t = (nowMs - (Telemetry.t0 || nowMs)) / 1000;
  if (_span) {
    _span.end = t;
    Telemetry.spans.push(_span);
  }
  _span = { start: t, end: t, phase };
}

export function telemPoint(
  nowMs,
  kneeFlex3D,
  hipVel,
  phase,
  hipFrac = null,
  kVel = null,
  hipBackDeg = null,
  partialReps = null,
  fullReps = null,
  hipVelAnk = null,
  armsGate = null,
) {
  const t = (nowMs - (Telemetry.t0 || nowMs)) / 1000;

  Telemetry.points.push({
    t: +t.toFixed(3),
    knee: kneeFlex3D == null ? null : +kneeFlex3D.toFixed(2), // deg
    hipVel: hipVel == null ? null : +hipVel.toFixed(3), // frac/s
    hipFrac: hipFrac == null ? null : +hipFrac.toFixed(3), // 0..1
    kVel: kVel == null ? null : +kVel.toFixed(2), // deg/s
    backDeg: hipBackDeg == null ? null : +hipBackDeg.toFixed(2), // deg (signed if you use signed)
    partialReps: partialReps == null ? null : partialReps | 0, // running count
    fullReps: fullReps == null ? null : fullReps | 0, // running count
    phase,
    hipVelAnk: hipVelAnk == null ? 0 : +hipVelAnk.toFixed(3),
    armsGate: armsGate == null ? null : !!armsGate,
  });

  if (_span) {
    // keep span timing if you're tracking current phase interval
    const tSec = +t.toFixed(3);
    _span.end = tSec;
  }
}
export function telemStop(nowMs) {
  const t = (nowMs - (Telemetry.t0 || nowMs)) / 1000;
  if (_span) {
    _span.end = t;
    Telemetry.spans.push(_span);
    _span = null;
  }
}
