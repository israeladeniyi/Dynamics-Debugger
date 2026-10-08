// Bundles the TypeScript entry points with esbuild and copies static files
// (manifest, HTML, CSS, icons) into dist/, which is the folder loaded into Edge.
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const options = {
  entryPoints: {
    'background/service-worker': 'src/background/service-worker.ts',
    'sidepanel/sidepanel': 'src/sidepanel/sidepanel.ts',
  },
  outdir,
  bundle: true,
  format: 'esm',
  target: 'chrome114',
  sourcemap: true,
  logLevel: 'info',
};

async function copyStatic() {
  await cp('public', outdir, { recursive: true });
  await mkdir(`${outdir}/sidepanel`, { recursive: true });
  await cp('src/sidepanel/sidepanel.html', `${outdir}/sidepanel/sidepanel.html`);
  await cp('src/sidepanel/sidepanel.css', `${outdir}/sidepanel/sidepanel.css`);
}

await rm(outdir, { recursive: true, force: true });

if (watch) {
  const ctx = await context(options);
  await copyStatic();
  await ctx.watch();
  console.log('Watching for changes. Static files are copied once; re-run after editing HTML/CSS/manifest.');
} else {
  await build(options);
  await copyStatic();
}
