/**
 * passthrough.js — Real world camera background
 */
import * as THREE from 'three';

export class Passthrough {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    this._video = null;
    this._texture = null;
    this._mesh = null;
    this._stream = null;
  }

  async init() {
    if (!navigator.mediaDevices?.getUserMedia) return false;

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    try {
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      try {
        this._stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e) {
        console.warn('Passthrough failed', e);
        return false;
      }
    }

    this._video = document.createElement('video');
    this._video.srcObject = this._stream;
    this._video.setAttribute('playsinline', '');
    this._video.muted = true;
    this._video.autoplay = true;
    await this._video.play();

    this._texture = new THREE.VideoTexture(this._video);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;

    const geo = new THREE.PlaneGeometry(30, 30);
    const mat = new THREE.MeshBasicMaterial({
      map: this._texture,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.renderOrder = -1000;
    this._mesh.frustumCulled = false;
    this.scene.add(this._mesh);
    this.enabled = true;
    return true;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this._mesh) this._mesh.visible = this.enabled;
  }

  update(camera) {
    if (!this.enabled || !this._mesh || !camera) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this._mesh.position.copy(camera.position).addScaledVector(dir, 14);
    this._mesh.quaternion.copy(camera.quaternion);
  }

  dispose() {
    this._stream?.getTracks().forEach(t => t.stop());
    this._texture?.dispose();
    if (this._mesh) {
      this.scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
    }
  }
}
