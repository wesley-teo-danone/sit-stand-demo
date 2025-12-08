import { LEFT_SIDE,RIGHT_SIDE ,FACE_MAX_INDEX,HAND_IDX} from "./sitstand.js";

export function getFacingSide(pose, world) {
  // Need shoulders & hips with usable visibility
  const needIdx = [11, 12, 23, 24];
  for (const idx of needIdx) {
    if (!pose[idx] || pose[idx].visibility == null) return null;
    if (pose[idx].visibility < 0.2) return null; // too uncertain
  }

  // Average shoulder+hip depth per side
  const leftZ  = (world[11].z + world[23].z) / 2;
  const rightZ = (world[12].z + world[24].z) / 2;

  // More negative z is closer to camera
  const diff = leftZ - rightZ; // negative left closer
  const THRESH = 0.03;         // meters; small buffer to avoid jitter

  if (diff < -THRESH) return LEFT_SIDE;
  if (diff >  THRESH) return RIGHT_SIDE;
  return null; // too close to call; caller may fallback
}

export function filterConnectionsForSide(allConns, allowedSet) {
  return allConns.filter(conn => {
    // skip face & hands
    if (conn.start <= FACE_MAX_INDEX || conn.end <= FACE_MAX_INDEX) return false;
    if (HAND_IDX.has(conn.start) || HAND_IDX.has(conn.end)) return false;
    // keep only if both landmarks are on the allowed side
    return allowedSet.has(conn.start) && allowedSet.has(conn.end);
  });
}
