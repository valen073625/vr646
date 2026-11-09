/**
 * stereo.js — Side-by-side stereo + barrel distortion for cardboard
 */
import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 center;
uniform float barrel;
uniform float vignette;
varying vec2 vUv;

vec2 distort(vec2 uv, vec2 c, float k) {
  vec2 d = uv - c;
  float r2 = dot(d, d);
  return c + d * (1.0 + k * r2);
}

void main() {
  vec2 uv = distort(vUv, center, barrel * 0.45);
  vec4 col = texture2D(tDiffuse, uv);
  float vig = 1.0 - smoothstep(0.35, 0.95, length(vUv - center) * vignette);
  gl_FragColor = vec4(col.rgb * vig, col.a);
}`;

export class StereoRenderer {
  constructor(renderer, ipd = 0.064) {
    this.renderer = renderer;
    this.ipd = ipd;
    this.barrel = 0.28;
    this.vignette = 1.6;

    this.rt = [
      new THREE.WebGLRenderTarget(1, 1, { samples: 0 }),
      new THREE.WebGLRenderTarget(1, 1, { samples: 0 }),
    ];

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.matL = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt[0].texture },
        center: { value: new THREE.Vector2(0.5, 0.5) },
        barrel: { value: this.barrel },
        vignette: { value: this.vignette },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.matR = this.matL.clone();
    this.matR.uniforms.tDiffuse.value = this.rt[1].texture;

    const left = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), this.matL);
    left.position.x = -0.5;
    const right = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), this.matR);
    right.position.x = 0.5;
    this.scene.add(left, right);

    this.camL = null;
    this.camR = null;
  }

  setSize(w, h) {
    const half = Math.max(1, Math.floor(w / 2));
    this.rt[0].setSize(half, h);
    this.rt[1].setSize(half, h);
  }

  render(scene, camera) {
    if (!this.camL) {
      this.camL = camera.clone();
      this.camR = camera.clone();
    }
    this.camL.copy(camera);
    this.camR.copy(camera);
    this.camL.aspect = this.rt[0].width / this.rt[0].height;
    this.camR.aspect = this.rt[1].width / this.rt[1].height;
    this.camL.updateProjectionMatrix();
    this.camR.updateProjectionMatrix();

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.camL.position.copy(camera.position).addScaledVector(right, -this.ipd / 2);
    this.camR.position.copy(camera.position).addScaledVector(right, this.ipd / 2);
    this.camL.quaternion.copy(camera.quaternion);
    this.camR.quaternion.copy(camera.quaternion);
    this.camL.updateMatrixWorld();
    this.camR.updateMatrixWorld();

    const r = this.renderer;
    r.setRenderTarget(this.rt[0]);
    r.render(scene, this.camL);
    r.setRenderTarget(this.rt[1]);
    r.render(scene, this.camR);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
