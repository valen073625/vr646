// renderer.js — UI logic. Runs in the sandboxed renderer; only talks to the
// main process through the `window.api` bridge exposed by preload.js.

const el = (id) => document.getElementById(id);

async function init() {
  const settings = await window.api.getSettings();
  const conn = await window.api.getConnectionInfo();

  el('wsAddress').textContent = `ws://${conn.ip}:${conn.wsPort}`;
  el('httpAddress').textContent = conn.httpUrl;
  el('qr').src = conn.qrDataUrl;

  bindSlider('sensitivity', settings.sensitivity, (v) => update({ sensitivity: v }), (v) => v.toFixed(2));
  bindSlider('smoothing', settings.smoothing, (v) => update({ smoothing: v }), (v) => v.toFixed(2));
  bindSlider('deadzone', settings.deadzoneDeg, (v) => update({ deadzoneDeg: v }), (v) => `${v.toFixed(2)}°`);
  bindSlider('ipd', settings.ipdMm, (v) => update({ ipdMm: v }), (v) => `${v.toFixed(1)} mm`);
  bindSlider('maxSpeed', settings.movement.maxSpeed, (v) => update({ movement: { maxSpeed: v } }), (v) => v.toFixed(2));

  el('invertPitch').checked = settings.invertPitch;
  el('invertPitch').addEventListener('change', (e) => update({ invertPitch: e.target.checked }));

  el('gazeSteering').checked = settings.movement.gazeSteering;
  el('gazeSteering').addEventListener('change', (e) => update({ movement: { gazeSteering: e.target.checked } }));

  el('movementMode').value = settings.movement.mode;
  el('movementMode').addEventListener('change', (e) => update({ movement: { mode: e.target.value } }));
}

function bindSlider(id, initial, onChange, fmt) {
  const input = el(id);
  const label = el(id + 'Val');
  input.value = initial;
  label.textContent = fmt(initial);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    label.textContent = fmt(v);
    onChange(v);
  });
}

async function update(partial) {
  await window.api.updateSettings(partial);
}

window.api.onStatus((status) => {
  const pill = el('statusPill');
  if (status.connected) {
    pill.textContent = `Phone connected (${status.phone.ip})`;
    pill.className = 'pill connected';
  } else {
    pill.textContent = 'Waiting for phone…';
    pill.className = 'pill disconnected';
  }
  el('walkDot').className = 'dot ' + (status.walking ? 'on' : 'off');
});

window.api.onTelemetry((t) => {
  el('telemetry').textContent =
    `quat  w:${t.quat.w.toFixed(3)} x:${t.quat.x.toFixed(3)} y:${t.quat.y.toFixed(3)} z:${t.quat.z.toFixed(3)}\n` +
    `Δangle this sample: ${t.delta.toFixed(2)}°\n` +
    `walking: ${t.walking}`;
});

init();
