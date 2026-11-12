// The preview's own little server: it hands out this folder's files (the lens and the preview), nothing else, so the
// preview page can import src/board.js (a browser doesn't import modules from file://).
//
//   node preview/serve.js        → http://127.0.0.1:8841/preview/            (Ctrl+C stops it)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

/** Start it; the server (close() stops it). */
export function serve(port = 8841) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    try {
      if (!file.startsWith(ROOT) || file.includes(`${sep}node_modules${sep}`)) throw new Error('not here');
      const bytes = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(bytes);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log('http://127.0.0.1:8841/preview/   (add ?play=1 for a scene, ?theme=light, ?w=390&h=844)');
}
