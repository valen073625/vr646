/**
 * Copies game/ into www/ so Capacitor can package it as APK.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'game');
const dest = path.join(__dirname, 'www');

function copyRecursive(from, to) {
  if (!fs.existsSync(from)) {
    console.error('Source not found:', from);
    process.exit(1);
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
copyRecursive(src, dest);
console.log('Prepared www/ from game/');
