// preload.js — safe bridge between renderer (UI) and main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getConnectionInfo: () => ipcRenderer.invoke('get-connection-info'),
  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  onTelemetry: (cb) => ipcRenderer.on('telemetry', (_e, data) => cb(data))
});
