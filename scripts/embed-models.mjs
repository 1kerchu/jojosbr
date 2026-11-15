// Genera src/embedded-models.gen.js con el manifest y los .glb en base64 para la versión de un solo archivo
import fs from 'node:fs';
const dir = 'public/models/';
const manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json', 'utf8'));
const files = new Set(['Horse.glb']);
for (const c of Object.values(manifest.characters || {})) { files.add(c.file); if (c.stand) files.add(c.stand); }
let out = 'export default {\n  manifest: ' + JSON.stringify(manifest) + ',\n  files: {\n';
for (const f of files) out += `    ${JSON.stringify(f)}: "${fs.readFileSync(dir + f).toString('base64')}",\n`;
out += '  }\n};\n';
fs.writeFileSync('src/embedded-models.gen.js', out);
console.log('Modelos incrustados:', [...files].join(', '), (out.length / 1e6).toFixed(1) + ' MB');
