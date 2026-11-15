import fs from 'node:fs';
fs.copyFileSync('dist-single/index.html', 'JUGAR.html');
fs.rmSync('src/embedded-models.gen.js', { force: true });
console.log('JUGAR.html generado (' + (fs.statSync('JUGAR.html').size / 1e6).toFixed(1) + ' MB)');
