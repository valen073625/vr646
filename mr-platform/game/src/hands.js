/**
 * hands.js — MediaPipe hand tracking wrapper
 */
export class HandTracker {
  constructor() {
    this.hands = null;
    this.camera = null;
    this.ready = false;
    this.listeners = {};
    this.lastLeft = null;
    this.lastRight = null;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  async init(videoElement) {
    if (typeof Hands === 'undefined') {
      console.warn('MediaPipe Hands not loaded');
      return false;
    }

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results) => this._onResults(results));

    if (typeof Camera !== 'undefined') {
      this.camera = new Camera(videoElement, {
        onFrame: async () => {
          if (this.hands) await this.hands.send({ image: videoElement });
        },
        width: 320,
        height: 240,
      });
      await this.camera.start();
    } else {
      // Fallback: manual frame loop
      const loop = async () => {
        if (this.hands && videoElement.readyState >= 2) {
          await this.hands.send({ image: videoElement });
        }
        requestAnimationFrame(loop);
      };
      loop();
    }

    this.ready = true;
    return true;
  }

  _onResults(results) {
    let left = null;
    let right = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const label = results.multiHandedness[i].label; // "Left" or "Right"
        const gesture = this._classify(landmarks);
        const data = { landmarks, gesture, label };

        // MediaPipe "Left" is the person's left hand (appears on right side of selfie view)
        if (label === 'Left') right = data;
        else left = data;
      }
    }

    this.lastLeft = left;
    this.lastRight = right;
    this.emit('frame', { left, right });
  }

  _classify(landmarks) {
    // Simple gesture classifier
    const tip = (i) => landmarks[i];
    const pip = (i) => landmarks[i - 2];

    const extended = (tipIdx, pipIdx) => tip(tipIdx).y < pip(pipIdx).y - 0.02;

    const index = extended(8, 6);
    const middle = extended(12, 10);
    const ring = extended(16, 14);
    const pinky = extended(20, 18);
    const thumb = landmarks[4].x < landmarks[3].x; // rough

    const count = [index, middle, ring, pinky].filter(Boolean).length;

    if (count === 0) return 'FIST';
    if (count === 4) return 'OPEN';
    if (index && middle && !ring && !pinky) return 'VICTORY';
    if (index && !middle && !ring && !pinky) return 'POINT';
    if (thumb && !index && !middle) return 'THUMBS';
    return 'OTHER';
  }
}
