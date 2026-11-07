// orientation.js — turns raw DeviceOrientation events into a stable,
// right-handed quaternion, with local smoothing/deadzone/recentering.
// This mirrors the filtering logic in the PC app's main.js so the phone's
// own preview (if any) and the data sent over the wire agree.

const Orientation = (() => {
  let enabled = false;
  let screenOrientationDeg = 0;

  // Raw reading this frame, device reading before recenter offset is applied.
  let rawQuat = { w: 1, x: 0, y: 0, z: 0 };
  // Smoothed quaternion actually sent to the PC.
  let smoothedQuat = { w: 1, x: 0, y: 0, z: 0 };
  // Yaw-only correction applied on "recenter" so forward = wherever you were
  // facing at that moment.
  let recenterOffset = { w: 1, x: 0, y: 0, z: 0 };

  let settings = { sensitivity: 1, smoothing: 0.35, deadzoneDeg: 0.3, invertPitch: false };

  const DEG2RAD = Math.PI / 180;

  function eulerToQuat(alpha, beta, gamma) {
    // Standard W3C DeviceOrientation -> quaternion conversion
    // (equivalent to the approach used by three.js DeviceOrientationControls).
    const a = alpha * DEG2RAD, b = beta * DEG2RAD, g = gamma * DEG2RAD;
    const cy = Math.cos(a / 2), sy = Math.sin(a / 2);
    const cb = Math.cos(b / 2), sb = Math.sin(b / 2);
    const cg = Math.cos(g / 2), sg = Math.sin(g / 2);

    // Intrinsic Z-X'-Y'' (alpha, beta, gamma) composition.
    let w = cy * cb * cg - sy * sb * sg;
    let x = cy * sb * cg - sy * cb * sg;
    let y = cy * cb * sg + sy * sb * cg;
    let z = sy * cb * cg + cy * sb * sg;

    // Align device frame (Z out of screen) with a forward-is-"-Z", Y-up
    // camera convention, and factor in the current screen rotation
    // (portrait/landscape) so tilting the phone physically always maps to
    // the expected head motion regardless of lock state.
    const screenAdjust = screenOrientationDeg * DEG2RAD;
    const cs = Math.cos(-screenAdjust / 2), ss = Math.sin(-screenAdjust / 2);
    // Rotate about device Z by -screenOrientation, then swap axes -90° about X
    // to convert from "world" (ENU-ish) to a typical forward-facing camera.
    const q1 = normalize({ w, x, y, z });
    const q2 = multiply(q1, { w: cs, x: 0, y: 0, z: ss });
    const worldFix = { w: Math.SQRT1_2, x: -Math.SQRT1_2, y: 0, z: 0 }; // -90° about X
    return multiply(worldFix, q2);
  }

  function multiply(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    };
  }
  function conjugate(q) { return { w: q.w, x: -q.x, y: -q.y, z: -q.z }; }
  function normalize(q) {
    const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1;
    return { w: q.w / len, x: q.x / len, y: q.y / len, z: q.z / len };
  }
  function angleBetween(a, b) {
    let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    dot = Math.min(1, Math.max(-1, Math.abs(dot)));
    return 2 * Math.acos(dot) * (180 / Math.PI);
  }
  function slerp(a, b, t) {
    let { w: aw, x: ax, y: ay, z: az } = a;
    let { w: bw, x: bx, y: by, z: bz } = b;
    let dot = aw * bw + ax * bx + ay * by + az * bz;
    if (dot < 0) { bw = -bw; bx = -bx; by = -by; bz = -bz; dot = -dot; }
    if (dot > 0.9995) {
      return normalize({ w: aw + t * (bw - aw), x: ax + t * (bx - ax), y: ay + t * (by - ay), z: az + t * (bz - az) });
    }
    const theta0 = Math.acos(dot), theta = theta0 * t, s0d = Math.sin(theta0);
    const s0 = Math.cos(theta) - dot * Math.sin(theta) / s0d;
    const s1 = Math.sin(theta) / s0d;
    return { w: s0 * aw + s1 * bw, x: s0 * ax + s1 * bx, y: s0 * ay + s1 * by, z: s0 * az + s1 * bz };
  }

  function onScreenOrientationChange() {
    screenOrientationDeg = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  }

  function onDeviceOrientation(e) {
    if (e.alpha === null) return; // sensor not ready yet
    let q = eulerToQuat(e.alpha, settings.invertPitch ? -e.beta : e.beta, e.gamma);
    // Apply sensitivity by scaling the rotation *delta* from identity-forward,
    // not the raw angles (keeps small head nods proportionally gentle while
    // still allowing a full look-around at sensitivity 1.0).
    rawQuat = applySensitivity(q, settings.sensitivity);
    rawQuat = multiply(recenterOffset, rawQuat);

    const delta = angleBetween(rawQuat, smoothedQuat);
    if (delta >= settings.deadzoneDeg) {
      const t = Math.min(1, Math.max(0.01, 1 - settings.smoothing));
      smoothedQuat = slerp(smoothedQuat, rawQuat, t);
    }
  }

  function applySensitivity(q, sens) {
    if (Math.abs(sens - 1) < 1e-3) return q;
    // Decompose into axis+angle, scale angle, recompose.
    const angle = 2 * Math.acos(Math.min(1, Math.max(-1, q.w)));
    if (angle < 1e-6) return q;
    const s = Math.sin(angle / 2);
    const axis = { x: q.x / s, y: q.y / s, z: q.z / s };
    const newAngle = angle * sens;
    const ns = Math.sin(newAngle / 2);
    return normalize({ w: Math.cos(newAngle / 2), x: axis.x * ns, y: axis.y * ns, z: axis.z * ns });
  }

  async function enable() {
    if (enabled) return true;
    onScreenOrientationChange();
    window.addEventListener('orientationchange', onScreenOrientationChange);

    // iOS 13+ requires an explicit permission prompt triggered by a tap.
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') return false;
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    enabled = true;
    return true;
  }

  function recenter() {
    // Cancel out current yaw so "forward" becomes wherever the phone is
    // currently pointing. We only zero yaw (world Y axis), not pitch/roll,
    // so recentering doesn't tilt the horizon.
    const yawOnly = extractYaw(rawQuat);
    recenterOffset = conjugate(yawOnly);
    smoothedQuat = { w: 1, x: 0, y: 0, z: 0 };
  }

  function extractYaw(q) {
    // Project the quaternion onto the Y axis only.
    const siny = 2 * (q.w * q.y + q.z * q.x);
    const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
    const yaw = Math.atan2(siny, cosy);
    return { w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 };
  }

  function updateSettings(partial) { settings = { ...settings, ...partial }; }
  function getQuat() { return smoothedQuat; }
  function getForwardXZ() {
    const q = smoothedQuat;
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const len = Math.hypot(fx, fz) || 1;
    return { x: fx / len, z: fz / len };
  }

  return { enable, recenter, updateSettings, getQuat, getForwardXZ };
})();
