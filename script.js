import { PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';

import {
  lmToPx,
  drawDottedVerticalRef,
  drawArcFromVerticalUpDirected,
  signedAngleFromVerticalUpDeg,
  drawArcFromVerticalUpSigned,
  drawPillLabel,
  drawPillLabelPhase,
  drawPillLabelFade,
} from './ui/angles.js';
import { setPhaseLabel } from './ui/phase.js';
import {
  init as sitStandInit,
  updateFrame as sitStandUpdateFrame,
  getPhase,
  phaseToLabel,
  getHipVelocityY,
  getHipVel,
  getHipFrac,
  getkneescore,
  getbackscore,
  getdepth,
  getspeed,
  getbodyheight,
  Vel,
  getsessionActive,
  updateTimer,
  getPoseStyle,
  getkvel,
  getminbackangle,
  LEFT_SIDE,
  RIGHT_SIDE,
  FACE_MAX_INDEX,
  HAND_IDX,
} from './core/sitstand.js';
import {
  AnkleGate,
  AngleGate,
  shallowCueSetAnchor,
  shallowCueGet,
  shallowCueIsActive,
  shallowCueMaybeActivate,
  shallowCueMaybeSpeak,
  ArmsCrossGate,
  crossArmsCueGet,
  crossArmsCueIsActive,
  crossArmsCueSetAnchor,
  crossArmsCueMaybeActivate,
} from './core/gate.js';
import {
  drawDownChevrons,
  drawSmallPill_go_down,
  lerp,
  drawDottedHLineToX,
  drawDoubleHeadedVArrow,
} from './ui/overlay.js';
import { kneeFlexDeg3D, thighToUpDeg3D } from './utils/angle_calculation.js';
import { adjustCanvasSize, drawingUtils, canvas, ctx } from './utils/canvas.js';
import { init_models, poseLandmarker } from './utils/models.js';
import { startCamera, video } from './utils/camera.js';
import { getFacingSide, filterConnectionsForSide } from './core/pose.js';
import { showAngleHint, hideAngleHint } from './ui/overlay.js';
import { setArmsGateOpen } from './core/sitstand.js';
import { timedCoachTick, CoachSpeech } from './core/gate.js';
const isIpad =
  navigator.userAgent.includes('iPad') ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
// Check if the user is on a mobile device
const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
if (!isMobile && !isIpad) {
  // Show the desktop overlay and do not initialize the app further.
  document.getElementById('desktopOverlay').style.display = 'none';
} else {
  // Hide the overlay and initialize the app.
  document.getElementById('desktopOverlay').style.display = 'none';
}

const PULSE_PERIOD_MS = 800; // one full pulse every 0.8 s
let lastVideoTime = -1;

async function boot() {
  // 2) Init models + camera
  try {
    await init_models();
    sitStandInit();
    await startCamera();

    adjustCanvasSize();
    // if (statusEl) statusEl.textContent = 'Ready';

    if (typeof predict === 'function') {
      predict._hfAlpha = 0;
      predict._arrowBackSign = null;
    }
  } catch (error) {
    console.error('Failed to initialize the application:', error);
    alert(
      'There was an error starting the application. Please refresh and try again.',
    );
  }

  // 3) Listeners
  window.addEventListener('resize', adjustCanvasSize);
  window.addEventListener('orientationchange', () => {
    setTimeout(adjustCanvasSize, 300);
  });
}

window.addEventListener('DOMContentLoaded', boot);

window.addEventListener('resize', adjustCanvasSize);
window.addEventListener('orientationchange', () => {
  setTimeout(adjustCanvasSize, 300);
});

async function predict() {
  const now = performance.now();
  const pulsePhase = (now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  const pulseFactor = 0.5 + 0.5 * Math.sin(pulsePhase * 2 * Math.PI);
  const style = getPoseStyle(now);

  if (getsessionActive()) {
    timedCoachTick(now);

    updateTimer(now);
  }

  CoachSpeech.tick(now);

  if (video.currentTime !== lastVideoTime && getsessionActive()) {
    lastVideoTime = video.currentTime;

    const poseResults = poseLandmarker.detectForVideo(video, now);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (poseResults.landmarks?.length && poseResults.worldLandmarks?.length) {
      const pose = poseResults.landmarks[0];
      const world = poseResults.worldLandmarks[0];

      const ang = AngleGate.update(now, pose, world);

      ctx.fillStyle = '#ffd166';
      ctx.font = '32px system-ui, sans-serif';
      //  ctx.fillText(`yaw: ${ang.yawDeg != null ? ang.yawDeg.toFixed(1) : 'n/a'}°`, 540, 1500);
      //ctx.fillText(`angle gate: ${ang.gateOpen ? 'OPEN' : 'closed'}`, 540, 1550);
      // ctx.fillText(`crossarm gate: ${armscross.gateOpen ? 'OPEN' : 'closed'}`, 540, 1550);
      // ctx.fillText(`crossarm reason: ${armscross.reason || 'n/a'}`, 540, 1650);

      if (!ang.gateOpen) {
        // Show center hint and skip the rest of the STS logic until they rotate.
        showAngleHint(ang);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(predict);
        return;
      } else {
        // Angle is good, hide the hint if it was visible.
        hideAngleHint();
      }

      let lowConfidenceCount = 0;
      for (let i = 11; i < pose.length; i++) {
        if (HAND_IDX.has(i)) continue;
        if (pose[i].visibility < 0.4) lowConfidenceCount++;
      }

      if (lowConfidenceCount <= 6) {
        let sideSet = getFacingSide(pose, world);

        if (!sideSet) {
          const countVisible = (indicesSet) => {
            let c = 0;
            indicesSet.forEach((i) => {
              const lm = pose[i];
              if (lm && lm.visibility >= 0.4) c++;
            });
            return c;
          };
          sideSet =
            countVisible(LEFT_SIDE) >= countVisible(RIGHT_SIDE)
              ? LEFT_SIDE
              : RIGHT_SIDE;
        }

        // --- tiny stabilizer
        const STABLE_N = 4; // frames to confirm new side
        if (predict._lockedSide && predict._lockedSide !== sideSet) {
          predict._sideStreak = (predict._sideStreak || 0) + 1;
          if (predict._sideStreak >= STABLE_N) {
            predict._lockedSide = sideSet;
            predict._sideStreak = 0;
          }
        } else if (!predict._lockedSide) {
          predict._lockedSide = sideSet;
          predict._sideStreak = 0;
        } else {
          predict._sideStreak = 0;
        }
        const allowedSet = predict._lockedSide || sideSet;
        const gate = AnkleGate.update(now, pose, allowedSet, canvas.height);
        if (!gate.gateOpen) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          requestAnimationFrame(predict);
          return;
        }

        //start arms cross
        const armscross = ArmsCrossGate.update(now, pose, world, allowedSet);
        setArmsGateOpen(!!armscross.gateOpen);
        const L_EL = 13,
          R_EL = 14;
        if (pose[L_EL] && pose[R_EL]) {
          const lEl = lmToPx(pose[L_EL], canvas);
          const rEl = lmToPx(pose[R_EL], canvas);
          const midX = (lEl.x + rEl.x) * 0.5;
          const midY = (lEl.y + rEl.y) * 0.5; // midpoint between elbows
          crossArmsCueSetAnchor(midX, midY);
        }
        crossArmsCueMaybeActivate(now);

        const filteredConnections = filterConnectionsForSide(
          PoseLandmarker.POSE_CONNECTIONS,
          allowedSet,
        );

        drawingUtils.drawConnectors(pose, filteredConnections, {
          color: 'rgba(0,0,0,0.90)',
          lineWidth: (style.connectorWidth || 4) + 2,
        });

        // drawingUtils.drawConnectors(pose, filteredConnections, { color: 'rgba(246,246,246,0.6)', lineWidth: 4 });
        drawingUtils.drawConnectors(pose, filteredConnections, {
          color: style.connector,
          lineWidth: 4,
        });

        pose.forEach((lm, index) => {
          if (index <= FACE_MAX_INDEX || HAND_IDX.has(index)) return;
          if (!allowedSet.has(index)) return;

          const isLow = lm.visibility < 0.4;
          if (!isLow) {
            //  drawingUtils.drawLandmarks([lm], { color: '#e1e1e1', radius: 8 });
            //drawingUtils.drawLandmarks([lm], { color: '#f6f6f6', radius: 6 });

            drawingUtils.drawLandmarks([lm], {
              color: 'rgba(0,0,0,0.90)',
              radius: 8,
            });
            drawingUtils.drawLandmarks([lm], {
              color: style.lmInner,
              radius: 6,
            });
          } else {
            // pulsing red for low-confidence points on the chosen side
            const baseR = 13,
              ampR = 7;
            const radius = baseR + ampR * pulseFactor;
            const alpha = 0.4 + 0.6 * pulseFactor;
            const redFill = `rgba(244, 67, 54, ${alpha.toFixed(3)})`;
            drawingUtils.drawLandmarks([lm], {
              color: 'black',
              radius: radius + 2,
            });
            drawingUtils.drawLandmarks([lm], { color: redFill, radius });
          }
        });

        // === ANGLE OVERLAY (side that is currently drawn) ===
        const isLeft = allowedSet.has(23);
        const SHOULDER = isLeft ? 11 : 12;
        const HIP = isLeft ? 23 : 24;
        const KNEE = isLeft ? 25 : 26;
        const ANKLE = isLeft ? 27 : 28;

        if (pose[SHOULDER] && pose[HIP] && pose[KNEE] && pose[ANKLE]) {
          const knee_N = pose[KNEE];
          const hip_N = pose[HIP];
          const ankle_N = pose[ANKLE];

          const shPx = lmToPx(pose[SHOULDER], canvas);
          const hipPx = lmToPx(pose[HIP], canvas);

          shallowCueSetAnchor(hipPx.x, hipPx.y);
          if (shallowCueMaybeActivate(now)) {
            //   shallowCueMaybeSpeak(now);
          }
          const kneePx = lmToPx(pose[KNEE], canvas);

          const kneeFlex3D = kneeFlexDeg3D(world, isLeft); //

          const oppKneeFlex3D = thighToUpDeg3D(world, isLeft);

          const hipVecX = shPx.x - hipPx.x;
          const hipVecY = shPx.y - hipPx.y;

          const sideParity = isLeft ? -1 : +1; // left side => flip; right side => keep

          // Signed angle: positive = arc on right of vertical line, negative = left
          const hipBackDegSigned =
            signedAngleFromVerticalUpDeg(hipVecX, hipVecY) * sideParity;

          //original

          const thighVX = hipPx.x - kneePx.x;
          const thighVY = hipPx.y - kneePx.y;

          //debug
          const phaseLabel = phaseToLabel(getPhase());

          setPhaseLabel(phaseLabel, 'left'); // or 'center' for stage demos

          sitStandUpdateFrame({
            now,

            // hipBackDeg,
            hipBackDeg: hipBackDegSigned,

            hipY: hip_N.y,
            kneeY: knee_N.y,
            //ankleY:anklePx?.y,
            shoulderY: shPx?.y,
            ankleY: ankle_N.y,
            kneeFlex3D,
          });

          //doubleheaded hipfrac arrow

          const ARROW_DIR_FOR_LEFT = -1; // screen-left when left side is active
          const ARROW_DIR_FOR_RIGHT = 1; // screen-right when right side is active

          const frontSign = isLeft ? ARROW_DIR_FOR_LEFT : ARROW_DIR_FOR_RIGHT;
          const backSign = -frontSign;

          // Still read hipFrac for the label value (unchanged)
          const hipFrac =
            typeof getHipFrac === 'function'
              ? getHipFrac()
              : (window._hipFrac ?? null);

          // NEW: use phase to decide visibility
          const phaseNow =
            typeof getPhase === 'function'
              ? getPhase()
              : (window.phase ?? null);
          const showByPhase =
            phaseNow === 'going_down' || phaseNow === 'seated';

          // keep the same fade/pulse behavior
          const targetA = showByPhase ? 1 : 0;
          const pulse =
            0.88 + 0.12 * Math.sin(((now % 1200) / 1200) * 2 * Math.PI);
          predict._hfAlpha = lerp(predict._hfAlpha, targetA, 0.15);
          const A = predict._hfAlpha * pulse;

          if (A > 0.02) {
            // Compute arrowX first (and keep it on-canvas)
            const desiredArrowX = hipPx.x + backSign * (170 + 18);
            const margin = 8;
            const arrowX = Math.max(
              margin,
              Math.min(canvas.width - margin, desiredArrowX),
            );

            // Dotted horizontals should reach exactly to the arrow
            drawDottedHLineToX(ctx, hipPx.x, hipPx.y, arrowX, { alpha: A });
            drawDottedHLineToX(ctx, kneePx.x, kneePx.y, arrowX, { alpha: A });

            // Vertical two-headed arrow
            drawDoubleHeadedVArrow(ctx, arrowX, hipPx.y, kneePx.y, {
              alpha: A,
            });

            const labelSideSign = -backSign;

            const midY = (hipPx.y + kneePx.y) * 0.5;
            const labelText =
              hipFrac != null && Number.isFinite(hipFrac)
                ? `${hipFrac.toFixed(2)}`
                : `Hip Depth Ratio`;

            const sideLR = labelSideSign > 0 ? 'right' : 'left'; // same intent as before

            drawPillLabelFade(ctx, arrowX, midY, labelText, {
              fg: '#22d3ee',
              bg: 'rgba(2,6,23,0.88)',
              border: 'rgba(255,255,255,0.18)',

              anchorX: arrowX,
              sideLR, // 'left' or 'right' of the arro
              gap: 12, // visual spacing between arrow and pill

              // Tail points back to the arrow automatically
              // tail: (sideLR === 'right' ? 'left' : 'right'),

              // keep your existing style bits
              offset: { dx: 0, dy: 0 }, // not used when anchorX/sideLR present
              size: 26,
              weight: '700',
              radius: 18,
              alpha: A,
            });
          }

          //end of double headed arrow

          drawDottedVerticalRef(
            ctx,
            hipPx.x,
            hipPx.y,
            70,
            'rgba(255,255,255,0.9)',
          );
          drawArcFromVerticalUpSigned(
            ctx,
            hipPx.x,
            hipPx.y,
            hipVecX,
            hipVecY,
            36,
            '#7dd3fc',
          );

          drawPillLabel(
            ctx,
            hipPx.x,
            hipPx.y,
            `${hipBackDegSigned.toFixed(0)}°`,
            {
              fg: '#22d3ee',
              bg: 'rgba(2,6,23,0.78)',
              border: 'rgba(255,255,255,0.18)',
              tail: 'up',
              offset: { dx: 14, dy: -18 },
            },
          );

          // --- KNEE ANGLE (flexion): between thigh and shank; 0° straight, ~90° squat ---

          drawDottedVerticalRef(
            ctx,
            kneePx.x,
            kneePx.y,
            70,
            'rgba(255,255,255,0.9)',
          );

          drawArcFromVerticalUpDirected(
            ctx,
            kneePx.x,
            kneePx.y,
            thighVX,
            thighVY,
            36,
            '#fbbf24',
            isLeft,
          );

          drawPillLabel(
            ctx,
            kneePx.x,
            kneePx.y,
            `${oppKneeFlex3D.toFixed(0)}°`,
            {
              fg: '#fbbf24', // amber-400
              bg: 'rgba(2,6,23,0.78)',
              border: 'rgba(255,255,255,0.18)',
              tail: 'up',
              offset: { dx: 14, dy: -18 },
            },
          );

          if (shallowCueIsActive(now)) {
            const { hip } = shallowCueGet();
            const bob = 6 * Math.sin(((now % 800) / 800) * 2 * Math.PI);
            drawDownChevrons(ctx, hip.x, hip.y + 20 + bob, {
              count: 7,
              gap: 14,
              size: 28,
              width: 6,
              alpha: 0.95,
            });

            drawSmallPill_go_down(ctx, hip.x, hip.y - 40 + bob, 'Lower Hips', {
              fg: '#ff3b30',
              bg: 'rgba(2,6,23,0.92)',
              border: 'rgba(255,59,48,0.55)',
              size: 28,
              weight: '700',
              radius: 18,
            });
          }

          if (crossArmsCueIsActive(now)) {
            const { elbow } = crossArmsCueGet();

            // pill (uses your existing pill style util)
            const bob = 6 * Math.sin(((now % 800) / 800) * 2 * Math.PI);

            drawSmallPill_go_down(
              ctx,
              elbow.x - 15,
              elbow.y + 25 + bob,
              'Cross your Arms',
              {
                fg: '#ff3b30',
                bg: 'rgba(2,6,23,0.92)',
                border: 'rgba(255,59,48,0.55)',
                size: 28,
                weight: '700',
                radius: 18,
              },
            );
          }
        }
      }
    }
  }

  requestAnimationFrame(predict);
}

export { predict };
