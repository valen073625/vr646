/**
 * handTracker.js — MediaPipe Hands wrapper
 * Runs inference on the front camera feed, calls back with
 * per-hand landmark arrays every frame.
 */
import { GestureTracker } from './handGestures.js';

export class HandTracker extends EventTarget {
  constructor() {
    super();
    this.left  = new GestureTracker('Left');
    this.right = new GestureTracker('Right');
    this._hands = null;
    this._camera = null;
    this._active = false;
    this._lastResults = null;
  }

  async init(videoEl) {
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands not loaded');
    }

    this._hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
    });

    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,          // 0=lite 1=full — use 1 for accurate gestures
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });

    this._hands.onResults((results) => this._onResults(results));

    // Use MediaPipe Camera utils for the render loop
    this._camera = new Camera(videoEl, {
      onFrame: async () => {
        if (this._active) await this._hands.send({ image: videoEl });
      },
      width: 320,
      height: 240,
      facingMode: 'user',
    });

    this._active = true;
    await this._camera.start();
    this.dispatchEvent(new Event('ready'));
  }

  _onResults(results) {
    this._lastResults = results;

    // Reset both trackers — will be populated by what MP returns
    let leftLm  = null;
    let rightLm = null;

    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness?.[i]?.label; // 'Left'|'Right' (MP mirrors for selfie)
        // MediaPipe returns mirrored labels for user-facing camera
        // 'Right' in MP = user's LEFT hand and vice versa; we correct this:
        if (handedness === 'Right') {
          leftLm = lm;  // MP Right = your left in front-cam mirror
        } else if (handedness === 'Left') {
          rightLm = lm;
        }
      }
    }

    const leftGesture  = this.left.update(leftLm);
    const rightGesture = this.right.update(rightLm);

    this.dispatchEvent(new CustomEvent('frame', {
      detail: {
        left:  { gesture: leftGesture,  tracker: this.left },
        right: { gesture: rightGesture, tracker: this.right },
      }
    }));
  }

  stop() {
    this._active = false;
    this._camera?.stop();
  }
}
