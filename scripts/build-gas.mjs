// 打包 Apps Script：server/gas/main.ts → gas/Code.js；並複製前端單檔 dist/index.html → gas/index.html
import { build } from 'esbuild';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

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

const exportsList = ['doGet', 'api', 'setupSpreadsheet', 'healthCheck'];
const wrappers = exportsList
  .map((n) => `function ${n}() { return SPHub.${n}.apply(null, arguments); }`)
  .join('\n');
const code = readFileSync('gas/Code.js', 'utf8');
writeFileSync('gas/Code.js', `// 自動產生，請勿直接編輯（來源：server/）\n${code}\n${wrappers}\n`);

if (existsSync('dist/index.html')) {
  copyFileSync('dist/index.html', 'gas/index.html');
  console.log('✓ gas/index.html');
} else {
  console.warn('⚠ 找不到 dist/index.html，請先執行 npm run build:web');
}
console.log('✓ gas/Code.js');
