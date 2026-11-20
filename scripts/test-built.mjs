import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = await new Promise((resolvePort, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const selected = socket.address().port;
    socket.close((error) => error ? reject(error) : resolvePort(selected));
  });
});
const address = `http://127.0.0.1:${port}/`;
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (chunk) => { log += chunk; });
server.stderr.on('data', (chunk) => { log += chunk; });

try {
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error(`Preview did not start.\n${log}`)), 20_000);
    const finish = (error) => { clearTimeout(timer); error ? reject(error) : ready(); };
    server.once('error', finish);
    server.once('exit', (code) => finish(new Error(`Preview exited (${code}).\n${log}`)));
    server.stdout.on('data', () => { if (/Local:\s+http:\/\//.test(log)) finish(); });
  });
  console.log(`Testing the built app at ${address}`);
  for (const script of ['browser-workflows.mjs', 'browser-edge.mjs', 'browser-storage.mjs', 'browser-compat.mjs']) {
    await new Promise((done, reject) => {
      const child = spawn(process.execPath, [resolve(root, 'tests', script)], {
        cwd: root, stdio: 'inherit', env: { ...process.env, KOBO_TEST_URL: address },
      });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? done() : reject(new Error(`${script} failed (${code}).`)));
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
