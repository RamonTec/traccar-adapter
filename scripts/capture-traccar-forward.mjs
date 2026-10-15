// Captures the raw JSON that Traccar forwards (positions and events) to build
// test fixtures. Usage: node scripts/capture-traccar-forward.mjs  (Ctrl+C to stop)
// Headers are never written to disk: they carry the webhook token.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const port = Number(process.env.CAPTURE_PORT ?? 3123);
const outDir = join(import.meta.dirname, '..', 'test/fixtures/traccar/captured');
mkdirSync(outDir, { recursive: true });

let count = 0;

createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (req.method === 'POST') {
      count += 1;
      let pretty = body;
      let kind = 'position';
      try {
        const json = JSON.parse(body);
        kind = json && typeof json === 'object' && 'event' in json ? 'event' : 'position';
        pretty = JSON.stringify(json, null, 2);
      } catch {
        kind = 'raw';
      }
      const file = join(outDir, `${count}-${kind}.json`);
      writeFileSync(file, `${pretty}\n`);
      console.log(`${req.method} ${req.url} → ${file}`);
    }
    res.writeHead(200).end();
  });
}).listen(port, () => console.log(`capturing Traccar forward on :${port}`));
