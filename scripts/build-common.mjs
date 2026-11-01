import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
await build({ entryPoints: ['scripts/common-elements.js'], bundle: true, alias: { 'graph-embedded-renderer': './vendor/graph-embedded-renderer/src/index.ts', textip: './vendor/textip/src/index.ts' }, format: 'iife', target: 'es2022', outfile: 'common/assets/js/common-elements.js' });
const styles = await Promise.all(['graph-embedded-renderer', 'textip'].map(name => readFile(`vendor/${name}/src/style.css`, 'utf8')));
await writeFile('common/assets/css/common-elements.css', styles.join('\n'));
