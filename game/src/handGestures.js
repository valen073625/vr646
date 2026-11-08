/**
 * handGestures.js — MediaPipe Hands → gesture classification
 *
 * Landmark indices (MediaPipe Hand):
 *   0 WRIST
 *   1-4  THUMB  (1=CMC 2=MCP 3=IP 4=TIP)
 *   5-8  INDEX  (5=MCP 6=PIP 7=DIP 8=TIP)
 *   9-12 MIDDLE (9=MCP 10=PIP 11=DIP 12=TIP)
 *   13-16 RING  (13=MCP 14=PIP 15=DIP 16=TIP)
 *   17-20 PINKY (17=MCP 18=PIP 19=DIP 20=TIP)
 */

export const GESTURE = {
  NONE:        'none',
  OPEN:        'open',        // all fingers extended → soltar
  FIST:        'fist',        // all curled → agarrar / golpear
  POINT:       'point',       // índice extendido solo → apuntar
  VICTORY:     'victory',     // índice + medio → caminar
  THUMBS_UP:   'thumbsup',    // pulgar arriba → interactuar / lanzar
  THUMBS_DOWN: 'thumbsdown',
  SHAKA:       'shaka',       // pulgar + meñique → recalibrar
  GUN:         'gun',         // índice + pulgar extendidos → "disparar"
};

// dist between two 3D landmarks (normalized coords)
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// Is a finger extended? compares tip vs pip vs mcp y (image space: smaller y = higher)
function isExtended(lm, tip, pip, mcp) {
  // tip closer to wrist than pip → curled
  const tipToWrist = dist(lm[tip], lm[0]);
  const pipToWrist = dist(lm[pip], lm[0]);
  return tipToWrist > pipToWrist * 0.9;
}

function isThumbExtended(lm) {
  // compare thumb tip x-distance to index MCP
  return dist(lm[4], lm[5]) > dist(lm[3], lm[5]) * 0.85;
}

export function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return GESTURE.NONE;
  const lm = landmarks;

  const thumb  = isThumbExtended(lm);
  const index  = isExtended(lm, 8, 6, 5);
  const middle = isExtended(lm, 12, 10, 9);
  const ring   = isExtended(lm, 16, 14, 13);
  const pinky  = isExtended(lm, 20, 18, 17);

  const extCount = [index, middle, ring, pinky].filter(Boolean).length;

  // FIST — all curled
  if (!thumb && !index && !middle && !ring && !pinky) return GESTURE.FIST;

  // OPEN — all extended
  if (thumb && index && middle && ring && pinky) return GESTURE.OPEN;

  // SHAKA — thumb + pinky, rest curled
  if (thumb && !index && !middle && !ring && pinky) return GESTURE.SHAKA;

  // THUMBS UP — only thumb extended, palm roughly facing camera,
  //             thumb tip above wrist (y axis in image is inverted)
  if (thumb && extCount === 0) {
    const thumbUp = lm[4].y < lm[0].y; // tip higher than wrist in image
    return thumbUp ? GESTURE.THUMBS_UP : GESTURE.THUMBS_DOWN;
  }

  // VICTORY / WALK — index + middle
  if (!thumb && index && middle && !ring && !pinky) return GESTURE.VICTORY;

  // POINT — index only
  if (!thumb && index && !middle && !ring && !pinky) return GESTURE.POINT;

  // GUN — thumb + index
  if (thumb && index && !middle && !ring && !pinky) return GESTURE.GUN;

  return GESTURE.NONE;
}

/**
 * Returns a 3D direction vector for the "pointing" direction
 * based on wrist → index_tip vector, in normalized image space.
 */
export function getPointDirection(landmarks) {
  if (!landmarks) return { x: 0, y: 0, z: -1 };
  const wrist = landmarks[0];
  const tip   = landmarks[8];
  const dx = tip.x - wrist.x;
  const dy = tip.y - wrist.y;
  const dz = tip.z - wrist.z;
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
  return { x: dx/len, y: -dy/len, z: dz/len };
}

/**
 * Estimate palm center (average of base landmarks)
 */
export function getPalmCenter(landmarks) {
  if (!landmarks) return { x: 0.5, y: 0.5, z: 0 };
  const bases = [0, 5, 9, 13, 17];
  let sx = 0, sy = 0, sz = 0;
  for (const i of bases) { sx += landmarks[i].x; sy += landmarks[i].y; sz += landmarks[i].z; }
  return { x: sx/5, y: sy/5, z: sz/5 };
}

/**
 * Smooth gesture state machine — avoids flickering
 */
export class GestureTracker {
  constructor(handedness) {
    this.hand = handedness; // 'Left' | 'Right'
    this.current = GESTURE.NONE;
    this.candidate = GESTURE.NONE;
    this.candidateCount = 0;
    this.CONFIRM_FRAMES = 3;

    this.palmCenter = { x: 0.5, y: 0.5, z: 0 };
    this.pointDir   = { x: 0, y: 0, z: -1 };
    this.landmarks  = null;
  }

  update(landmarks) {
    this.landmarks = landmarks;
    if (landmarks) {
      this.palmCenter = getPalmCenter(landmarks);
      this.pointDir   = getPointDirection(landmarks);
    }

    const raw = classifyGesture(landmarks);

    if (raw === this.candidate) {
      this.candidateCount++;
      if (this.candidateCount >= this.CONFIRM_FRAMES) {
        this.current = raw;
      }
    } else {
      this.candidate = raw;
      this.candidateCount = 1;
    }

    return this.current;
  }

  is(gesture) { return this.current === gesture; }
}
