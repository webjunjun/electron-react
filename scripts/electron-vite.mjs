// Cross-platform launcher for electron-vite.
//
// Some environments (e.g. certain IDE terminals) export ELECTRON_RUN_AS_NODE=1,
// which forces the Electron binary to run as plain Node — then `require('electron')`
// returns a path string instead of the API and the main process crashes at
// `app.whenReady()`. Electron treats the var as "set" even when empty, so it must be
// fully removed (cross-env can only set, not unset). We delete it here, then run
// electron-vite's bin with whatever subcommand/args were passed (dev, preview, …).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

delete process.env.ELECTRON_RUN_AS_NODE;

// Resolve electron-vite's CLI entry relative to this script (…/scripts/ → project
// root → node_modules). Run it with this Node binary directly — no shell, so no
// arg-escaping / deprecation concerns, and no depend­ence on cwd.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
