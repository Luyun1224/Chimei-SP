// 打包 Apps Script：server/gas/main.ts → gas/Code.js 與 apps-script/Code.gs（前端由 GitHub Pages 提供，不需 index.html）
import { build } from 'esbuild';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

await build({
  entryPoints: ['server/gas/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'SPHub',
  target: 'es2019',
  outfile: 'gas/Code.js',
  charset: 'utf8',
  legalComments: 'none',
});

const exportsList = ['doGet', 'doPost', 'api', 'setupSpreadsheet', 'healthCheck', 'showAccessCode', 'rotateAccessCode'];
const wrappers = exportsList
  .map((n) => `function ${n}() { return SPHub.${n}.apply(null, arguments); }`)
  .join('\n');
const code = readFileSync('gas/Code.js', 'utf8');
writeFileSync('gas/Code.js', `// 自動產生，請勿直接編輯（來源：server/）\n${code}\n${wrappers}\n`);

copyFileSync('gas/Code.js', 'apps-script/Code.gs');
copyFileSync('gas/appsscript.json', 'apps-script/appsscript.json');
console.log('✓ gas/Code.js → apps-script/Code.gs');
