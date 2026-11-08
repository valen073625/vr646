/**
 * stereoRenderer.js — Side-by-side stereo with barrel distortion for cardboard
 * Renders the scene twice (left/right eye with IPD offset) into render targets,
 * then composites with barrel distortion shader.
 */
import * as THREE from 'three';

const BARREL_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BARREL_FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 center;        // 0.5,0.5 for full screen, eye-adjusted for stereo
uniform float barrel;       // distortion strength 0-1
uniform float chrAb;        // chromatic aberration
uniform float vignette;     // vignette strength 0-1

varying vec2 vUv;

vec2 distort(vec2 uv, vec2 c, float k) {
  vec2 d = uv - c;
  float r2 = dot(d, d);
  return c + d * (1.0 + k * r2 + k * 0.5 * r2 * r2);
}

void main() {
  vec2 c = center;
  float k = barrel * 0.5;

  // Sample with barrel distortion + chromatic aberration
  vec2 uvR = distort(vUv, c, k * (1.0 + chrAb));
  vec2 uvG = distort(vUv, c, k);
  vec2 uvB = distort(vUv, c, k * (1.0 - chrAb));

  float r = texture2D(tDiffuse, uvR).r;
  float g = texture2D(tDiffuse, uvG).g;
  float b = texture2D(tDiffuse, uvB).b;
  float a = texture2D(tDiffuse, uvG).a;

  // Vignette
  vec2 vd = vUv - c;
  float vig = 1.0 - smoothstep(0.3, 0.9, length(vd) * vignette);

  gl_FragColor = vec4(vec3(r,g,b) * vig, a);
}
`;

export class StereoRenderer {
  constructor(renderer, ipd = 0.064) {
    this._renderer = renderer;
    this.ipd       = ipd;
    this.barrel    = 0.3;
    this.chrAb     = 0.015;
    this.vignette  = 1.8;

    this._rt = [
      new THREE.WebGLRenderTarget(1, 1, { samples: 2 }),
      new THREE.WebGLRenderTarget(1, 1, { samples: 2 }),
    ];

    // Full-screen quad for compositing
    this._scene  = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

    // Left eye quad (left half)
    this._matL = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this._rt[0].texture },
        center:   { value: new THREE.Vector2(0.5, 0.5) },
        barrel:   { value: this.barrel },
        chrAb:    { value: this.chrAb  },
        vignette: { value: this.vignette },
      },
      vertexShader:   BARREL_VERT,
      fragmentShader: BARREL_FRAG,
    });
    this._matR = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this._rt[1].texture },
        center:   { value: new THREE.Vector2(0.5, 0.5) },
        barrel:   { value: this.barrel },
        chrAb:    { value: this.chrAb  },
        vignette: { value: this.vignette },
      },
      vertexShader:   BARREL_VERT,
      fragmentShader: BARREL_FRAG,
    });

    const planeL = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), this._matL);
    planeL.position.x = -0.5;
    const planeR = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), this._matR);
    planeR.position.x =  0.5;

    this._scene.add(planeL, planeR);

    // Scissor line (black divider)
    const div = new THREE.Mesh(
      new THREE.PlaneGeometry(0.004, 2),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this._scene.add(div);

    this._camL = null;
    this._camR = null;
  }

  setSize(w, h) {
    const half = Math.floor(w / 2);
    this._rt[0].setSize(half, h);
    this._rt[1].setSize(half, h);
  }

  setSettings({ ipd, barrel, vignette }) {
    if (ipd    !== undefined) this.ipd      = ipd;
    if (barrel !== undefined) this.barrel   = barrel;
    if (vignette !== undefined) this.vignette = vignette;
    for (const mat of [this._matL, this._matR]) {
      mat.uniforms.barrel.value   = this.barrel;
      mat.uniforms.vignette.value = this.vignette;
    }
  }

  render(scene, camera) {
    const r = this._renderer;

    // Create per-eye cameras from head camera
    if (!this._camL) {
      this._camL = camera.clone();
      this._camR = camera.clone();
    }
    this._camL.copy(camera);
    this._camR.copy(camera);
    this._camL.aspect = this._rt[0].width / this._rt[0].height;
    this._camR.aspect = this._rt[1].width / this._rt[1].height;
    this._camL.updateProjectionMatrix();
    this._camR.updateProjectionMatrix();

    // IPD offset along camera's local X axis
    const camRight = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .normalize();

    this._camL.position.copy(camera.position).addScaledVector(camRight, -this.ipd/2);
    this._camR.position.copy(camera.position).addScaledVector(camRight,  this.ipd/2);
    this._camL.quaternion.copy(camera.quaternion);
    this._camR.quaternion.copy(camera.quaternion);
    this._camL.updateMatrixWorld();
    this._camR.updateMatrixWorld();

    // Render both eyes
    r.setRenderTarget(this._rt[0]);
    r.render(scene, this._camL);

    r.setRenderTarget(this._rt[1]);
    r.render(scene, this._camR);

    // Composite to screen
    r.setRenderTarget(null);
    r.render(this._scene, this._camera);
  }
}
