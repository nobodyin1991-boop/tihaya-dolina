// Launches the desktop build for a few seconds and prints which GPU the game is rendering on.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, ['.'], { env: { ...process.env, TD_GPU_CHECK: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.on('data', d => { const line = String(d).split('\n').find(l => l.startsWith('TD_GPU_CHECK')); if (line) console.log(line); });
child.on('exit', code => process.exit(code ?? 0));
