/**
 * launcher.js — Home / app selector floating in MR space
 */
import * as THREE from 'three';

const APPS = [
  {
    id: 'home',
    title: 'Inicio',
    color: 0x00e5ff,
    description: 'Volver al launcher',
  },
  {
    id: 'empty',
    title: 'Espacio vacío',
    color: 0x44ff88,
    description: 'Solo passthrough + manos',
  },
  {
    id: 'demo-panel',
    title: 'Panel demo',
    color: 0xff66aa,
    description: 'Objetos flotantes de prueba',
  },
];

export class Launcher {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.panels = [];
    this.selected = 0;
    this.visible = true;
    this._build();
  }

  _build() {
    // Title
    const titleCanvas = document.createElement('canvas');
    titleCanvas.width = 512;
    titleCanvas.height = 128;
    const ctx = titleCanvas.getContext('2d');
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MR PLATFORM', 256, 70);
    ctx.font = '22px monospace';
    ctx.fillStyle = '#88ffff';
    ctx.fillText('Apuntá con la mano para elegir', 256, 110);

    const titleTex = new THREE.CanvasTexture(titleCanvas);
    const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, transparent: true });
    const titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), titleMat);
    titleMesh.position.set(0, 1.4, -2.2);
    this.group.add(titleMesh);

    APPS.forEach((app, i) => {
      const panel = this._makePanel(app, i);
      this.panels.push(panel);
      this.group.add(panel);
    });
  }

  _makePanel(app, index) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const draw = (highlight) => {
      ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = highlight ? '#003344' : '#001822';
      ctx.strokeStyle = highlight ? '#00e5ff' : '#005566';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.roundRect(16, 16, 480, 224, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = highlight ? '#00e5ff' : '#88ccdd';
      ctx.font = 'bold 42px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(app.title, 256, 100);

      ctx.fillStyle = '#aacccc';
      ctx.font = '24px monospace';
      ctx.fillText(app.description, 256, 160);
    };

    draw(false);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), mat);
    mesh.position.set((index - 1) * 1.3, 0.6, -2.0);
    mesh.userData = { app, canvas, ctx, draw, tex, index };
    return mesh;
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
  }

  updateSelection(index) {
    this.selected = Math.max(0, Math.min(this.panels.length - 1, index));
    this.panels.forEach((p, i) => {
      const highlight = i === this.selected;
      p.userData.draw(highlight);
      p.userData.tex.needsUpdate = true;
      p.scale.setScalar(highlight ? 1.12 : 1.0);
    });
  }

  /** Ray from camera / hand → select panel */
  pick(origin, direction) {
    if (!this.visible) return null;
    const ray = new THREE.Raycaster(origin, direction.normalize());
    const hits = ray.intersectObjects(this.panels);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.index;
      this.updateSelection(idx);
      return this.panels[idx].userData.app;
    }
    return null;
  }

  getSelectedApp() {
    return APPS[this.selected];
  }

  /** Keep launcher in front of the user */
  follow(camera) {
    if (!this.visible) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const target = camera.position.clone().addScaledVector(dir, 2.2);
    target.y = camera.position.y - 0.15;
    this.group.position.lerp(target, 0.08);
    this.group.quaternion.slerp(camera.quaternion, 0.08);
  }
}
