const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../game');
const dest = path.resolve(__dirname, 'www');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('game/index.html not found at', src);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied game/ -> mobile-apk/www');
