// gesture.js — uses MediaPipe Hands (runs fully on-device in the browser,
// no frames ever leave the phone) to detect a held "thumbs up" and turn it
// into a walk-forward signal, with tap-to-toggle auto-walk support.

const Gesture = (() => {
  let hands, camera, videoEl, overlayCtx;
  let onWalkChange = () => {};
  let isThumbsUp = false;
  let holdStart = 0;
  let autoWalkLatched = false;
  const HOLD_TO_CONFIRM_MS = 150; // small debounce so a flicker doesn't toggle it

  // Landmark indices (MediaPipe Hands topology).
  const WRIST = 0, THUMB_CMC = 1, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4;
  const INDEX_MCP = 5, INDEX_TIP = 8;
  const MIDDLE_MCP = 9, MIDDLE_TIP = 12;
  const RING_MCP = 13, RING_TIP = 16;
  const PINKY_MCP = 17, PINKY_TIP = 20;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  // A "thumbs up": thumb tip is far from the wrist and clearly above (in
  // image space, lower y = higher on screen) the other four knuckles, while
  // the other four fingertips are curled in close to their own MCP joints.
  function classifyThumbsUp(landmarks) {
    const wrist = landmarks[WRIST];
    const thumbExtension = dist(landmarks[THUMB_TIP], wrist);
    const palmSize = dist(landmarks[INDEX_MCP], landmarks[PINKY_MCP]) || 0.001;

    const fingersCurled = [
      [INDEX_TIP, INDEX_MCP],
      [MIDDLE_TIP, MIDDLE_MCP],
      [RING_TIP, RING_MCP],
      [PINKY_TIP, PINKY_MCP]
    ].every(([tip, mcp]) => dist(landmarks[tip], wrist) < dist(landmarks[mcp], wrist) * 1.15);

    const thumbIsUp = landmarks[THUMB_TIP].y < landmarks[THUMB_IP].y &&
                       landmarks[THUMB_IP].y < landmarks[THUMB_MCP].y;

    const thumbExtended = thumbExtension / palmSize > 1.1;

    return fingersCurled && thumbIsUp && thumbExtended;
  }

  function onResults(results) {
    let detected = false;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      detected = results.multiHandLandmarks.some(classifyThumbsUp);
    }

    const now = performance.now();
    if (detected !== isThumbsUp) {
      if (holdStart === 0) holdStart = now;
      if (now - holdStart >= HOLD_TO_CONFIRM_MS) {
        isThumbsUp = detected;
        holdStart = 0;
        updateWalking();
      }
    } else {
      holdStart = 0;
    }
  }

  function updateWalking() {
    // In "hold" mode, walking = thumbs-up currently held.
    // In "auto-walk/toggle" mode, a thumbs-up *press* flips a latch so the
    // user doesn't have to hold the pose for the whole walk.
    if (App.settings.autoWalk) {
      if (isThumbsUp) autoWalkLatched = !autoWalkLatched;
      onWalkChange(autoWalkLatched);
    } else {
      onWalkChange(isThumbsUp);
    }
  }

  async function init({ video, overlay, onWalk }) {
    videoEl = video;
    overlayCtx = overlay.getContext('2d');
    onWalkChange = onWalk;

    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, // lite model: lower latency, good enough for this gesture
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 240 },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play();

    camera = new Camera(videoEl, {
      onFrame: async () => { await hands.send({ image: videoEl }); },
      width: 320,
      height: 240
    });
    camera.start();
  }

  function toggleAutoWalkManually() {
    autoWalkLatched = !autoWalkLatched;
    onWalkChange(autoWalkLatched);
  }

  return { init, toggleAutoWalkManually, get walking() { return App.settings.autoWalk ? autoWalkLatched : isThumbsUp; } };
})();
