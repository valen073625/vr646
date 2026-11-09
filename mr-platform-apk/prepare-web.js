const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../mr-platform/www');
const dest = path.resolve(__dirname, 'www');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('mr-platform/www/index.html not found at', src);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied mr-platform/www -> mr-platform-apk/www');
