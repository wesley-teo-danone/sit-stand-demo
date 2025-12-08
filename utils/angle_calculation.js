// 3D knee flexion (deg) from world landmarks ===
function vec(a, b){ return {x: b.x - a.x, y: b.y - a.y, z: b.z - a.z}; }
function dot(u,v){ return u.x*v.x + u.y*v.y + u.z*v.z; }
function norm(u){ return Math.hypot(u.x, u.y, u.z); }
function angleBetweenDeg3D(u,v){
  const d = dot(u,v), n = norm(u)*norm(v);
  if (n < 1e-8) return 0;
  const c = Math.max(-1, Math.min(1, d/n));
  return Math.acos(c) * 180/Math.PI;
}
function kneeFlexDeg3D(world, isLeft){
  const HIP   = isLeft ? 23 : 24;
  const KNEE  = isLeft ? 25 : 26;
  const ANKLE = isLeft ? 27 : 28;
  const hip = world[HIP], knee = world[KNEE], ankle = world[ANKLE];
  if (!hip || !knee || !ankle) return null;
  const thigh = vec(knee, hip);     // knee->hip
  const shank = vec(knee, ankle);   // knee->ankle
  return angleBetweenDeg3D(thigh, shank); 
}

//angle between vertical dotted and (knee to hip)
function thighToUpDeg3D(world, isLeft){
  const HIP  = isLeft ? 23 : 24;
  const KNEE = isLeft ? 25 : 26;
  const hip  = world[HIP], knee = world[KNEE];
  if (!hip || !knee) return null;

  const thigh = vec(knee, hip);           // knee -> hip
  const UP    = { x: 0, y: -1, z: 0 };    // Y-down "up" direction

  return angleBetweenDeg3D(thigh, UP);
}
export { kneeFlexDeg3D, thighToUpDeg3D };