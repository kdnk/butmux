import { chmod } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'dist/cli.js';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire } from "node:module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  outfile,
});

// Keep the CLI executable on Unix-like systems without relying on shell utilities.
await chmod(outfile, 0o755);
