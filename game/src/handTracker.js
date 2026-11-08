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
    this._active = false;
    this._lastResults = null;
    this._timer = 0;
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
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results) => this._onResults(results));

    this._active = true;
    await this._hands.send({ image: videoEl });
    this._loop(videoEl);
    this.dispatchEvent(new Event('ready'));
  }

  _loop(videoEl) {
    if (!this._active) return;
    this._timer = requestAnimationFrame(async () => {
      if (!this._active) return;
      try {
        if (videoEl.readyState >= 2) await this._hands.send({ image: videoEl });
      } catch (err) {
        console.warn('Hand frame failed:', err);
      }
      this._loop(videoEl);
    });
  }

  _onResults(results) {
    this._lastResults = results;

    let leftLm  = null;
    let rightLm = null;

    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness?.[i]?.label;
        if (handedness === 'Right') {
          leftLm = lm;
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
    if (this._timer) cancelAnimationFrame(this._timer);
  }
}
