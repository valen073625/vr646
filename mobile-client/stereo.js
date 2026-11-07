// stereo.js — renders a side-by-side stereo view with per-eye barrel
// distortion (to pre-cancel a cardboard/VR lens's pincushion effect) and a
// speed-based comfort vignette.
//
// IMPORTANT SCOPE NOTE: this renders a local 3D placeholder scene so you can
// see/verify the optics, head tracking, and vignette pipeline end-to-end.
// Piping in the *actual* SteamVR game frame (instead of this placeholder)
// requires a video transport from the PC to the phone (e.g. WebRTC with a
// GPU H.264/H.265 encoder capturing the SteamVR mirror window). That is a
// separate, substantial subsystem — see README.md "Video streaming" section
// for how to wire an existing low-latency game-streaming pipeline (e.g. the
// Sunshine/Moonlight or a WebRTC getDisplayMedia capture) into the
// `VideoTextureSource` hook left below.

const Stereo = (() => {
  let renderer, scene, camL, camR, roomGroup;
  let composeScene, composeCamera, planeL, planeR, renderTargetL, renderTargetR;
  let width = 0, height = 0;
  let ipdMeters = 0.063;
  let currentSpeed = 0; // 0..1, drives the vignette

  const distortionVertex = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  // Barrel (positive) pre-distortion: pushes pixels outward so that the
  // lens's pincushion distortion cancels it out, plus a radial vignette
  // whose strength increases with locomotion speed (comfort vignette).
  const distortionFragment = `
    precision highp float;
    uniform sampler2D uTex;
    uniform float uStrength;   // barrel strength
    uniform float uVignette;   // 0..1 comfort vignette amount
    varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0; // -1..1, centered
      float r2 = dot(c, c);
      vec2 distorted = c * (1.0 + uStrength * r2);
      vec2 uv = (distorted + 1.0) * 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      vec3 color = texture2D(uTex, uv).rgb;
      float vignette = smoothstep(0.9, 0.35, r2 * uVignette + (1.0 - uVignette) * 0.0);
      // Base lens-matching vignette is always present a little (soft black edge);
      // the comfort component (uVignette) tightens the visible circle on top.
      float edge = smoothstep(1.0, 0.6, length(c));
      color *= mix(1.0, edge, 0.15 + 0.7 * uVignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resize();
    window.addEventListener('resize', resize);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10131a);
    buildPlaceholderRoom();

    camL = new THREE.PerspectiveCamera(90, 1, 0.01, 100);
    camR = new THREE.PerspectiveCamera(90, 1, 0.01, 100);

    renderTargetL = new THREE.WebGLRenderTarget(1024, 1024);
    renderTargetR = new THREE.WebGLRenderTarget(1024, 1024);

    composeScene = new THREE.Scene();
    composeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = () => new THREE.ShaderMaterial({
      vertexShader: distortionVertex,
      fragmentShader: distortionFragment,
      uniforms: { uTex: { value: null }, uStrength: { value: 0.22 }, uVignette: { value: 0 } }
    });
    const geoL = new THREE.PlaneGeometry(1, 2).translate(-0.5, 0, 0);
    const geoR = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    planeL = new THREE.Mesh(geoL, mat());
    planeR = new THREE.Mesh(geoR, mat());
    planeL.material.uniforms.uTex.value = renderTargetL.texture;
    planeR.material.uniforms.uTex.value = renderTargetR.texture;
    composeScene.add(planeL, planeR);
  }

  function buildPlaceholderRoom() {
    roomGroup = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3a })
    );
    floor.rotation.x = -Math.PI / 2;
    roomGroup.add(floor);

    const grid = new THREE.GridHelper(40, 40, 0x4a5064, 0x333844);
    roomGroup.add(grid);

    for (let i = 0; i < 12; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1 + Math.random() * 2, 1),
        new THREE.MeshStandardMaterial({ color: 0x4f8cff })
      );
      const angle = (i / 12) * Math.PI * 2;
      box.position.set(Math.cos(angle) * 6, box.geometry.parameters.height / 2, Math.sin(angle) * 6);
      roomGroup.add(box);
    }

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.1);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 10, 4);
    roomGroup.add(hemi, dir);

    scene.add(roomGroup);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer && renderer.setSize(width, height, false);
  }

  function setIpd(mm) { ipdMeters = mm / 1000; }
  function setSpeed(s) { currentSpeed = Math.min(1, Math.max(0, s)); }

  // Head position for 6DoF-ish presence; this build is 3DoF (rotation only)
  // per the spec, so position stays at the origin — kept here so a future
  // positional-tracking source (e.g. ARKit/ARCore world tracking) can be
  // dropped in without touching the render path.
  const headPos = new THREE.Vector3(0, 1.6, 0);

  function render(quat) {
    if (!renderer) return;
    const q = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w);

    camL.position.copy(headPos).add(new THREE.Vector3(-ipdMeters / 2, 0, 0).applyQuaternion(q));
    camR.position.copy(headPos).add(new THREE.Vector3(ipdMeters / 2, 0, 0).applyQuaternion(q));
    camL.quaternion.copy(q);
    camR.quaternion.copy(q);
    camL.aspect = camR.aspect = (width / 2) / height;
    camL.updateProjectionMatrix();
    camR.updateProjectionMatrix();

    renderer.setRenderTarget(renderTargetL);
    renderer.render(scene, camL);
    renderer.setRenderTarget(renderTargetR);
    renderer.render(scene, camR);

    planeL.material.uniforms.uVignette.value = currentSpeed;
    planeR.material.uniforms.uVignette.value = currentSpeed;

    renderer.setRenderTarget(null);
    renderer.setScissorTest(true);

    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width / 2, height);
    renderer.render(composeScene, composeCamera);

    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(width / 2, 0, width / 2, height);
    renderer.render(composeScene, composeCamera);

    renderer.setScissorTest(false);
  }

  // Hook: call VideoTextureSource.attach(videoElementOrMediaStream) once a
  // WebRTC video track from the PC is available, then set useExternalVideo
  // true to replace the placeholder room with the streamed frame instead.
  const VideoTextureSource = {
    texture: null,
    attach(videoEl) {
      this.texture = new THREE.VideoTexture(videoEl);
      // Swap scene.background or map it onto a screen-filling quad as desired.
    }
  };

  return { init, render, setIpd, setSpeed, VideoTextureSource };
})();
