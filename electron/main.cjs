// Desktop shell. Forces the discrete GPU and serves the game from a private local port
// (ES modules do not load from file://).
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// —— GPU: always pick the high-performance adapter (NVIDIA/AMD discrete), never the integrated one ——
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
if (process.platform === 'win32') app.commandLine.appendSwitch('use-angle', 'd3d11');
// Uncapped frame pacing is left to the game setting; vsync stays on by default.

const root = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    // Fixed port keeps the localStorage origin (and therefore saves) stable between launches.
    server.on('error', () => server.listen(0, '127.0.0.1'));
    server.on('listening', () => resolve(server.address().port));
    server.listen(47631, '127.0.0.1');
  });
}

app.whenReady().then(async () => {
  const port = await startServer();
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    backgroundColor: '#0b0d0c', show: false, autoHideMenuBar: true,
    title: 'Тихая долина',
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.loadURL(`http://127.0.0.1:${port}/`);

  // Self-check: `npm run gpu-check` prints which GPU the game got, then exits.
  if (process.env.TD_GPU_CHECK) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const info = await win.webContents.executeJavaScript('JSON.stringify({ gpu: window.__game && window.__game.view.gpuName, fps: window.__game && window.__game.fps, phase: window.__game && window.__game.phase })');
        console.log('TD_GPU_CHECK ' + info);
      } catch (e) { console.log('TD_GPU_CHECK failed ' + e.message); }
      app.quit();
    }, 9000));
  }
});

app.on('window-all-closed', () => app.quit());
