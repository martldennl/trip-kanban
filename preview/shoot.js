// Photographs of the preview, into preview/out/: the board dark and light, wide and narrow, four moments of the
// scene (and all four on one sheet), and a card in the hand. It starts the preview's server and a headless Chrome
// (through the videos' tools/cdp.js) and stops both again.
//
//   node preview/shoot.js
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.js';

const { launch } = createRequire(import.meta.url)(process.env.CDP ?? '../../tools/cdp.js');
const file = (name) => fileURLToPath(new URL(`out/${name}.png`, import.meta.url));
const page = (query = '') => `http://127.0.0.1:8841/preview/${query}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(fileURLToPath(new URL('out/', import.meta.url)), { recursive: true });

const server = await serve();
const b = await launch({ width: 1130, height: 1010, port: 9451 });
b.on((m) => m.method === 'Runtime.exceptionThrown' && console.log('error in the page:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
const scheme = (value) => b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
const mouse = (type, x, y) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
/** Where a card is on the page (the frame unsandboxed, so it can be asked). */
const card = (title) => b.eval(`(() => { const f = document.getElementById('lens'), o = f.getBoundingClientRect(); const c = [...f.contentDocument.querySelectorAll('.card')].find((c) => c.textContent.includes(${JSON.stringify(title)})); const r = c.getBoundingClientRect(); return { x: o.left + r.left + r.width / 2, y: o.top + r.top + r.height / 2, top: o.top + r.top, bottom: o.top + r.bottom }; })()`);

try {
  // The board as it stands: dark and light, at the app's size, and narrow as on a phone.
  for (const theme of ['dark', 'light']) {
    await scheme(theme);
    await b.size(1130, 1010);
    await b.goto(page(`?theme=${theme}`), 1500);
    await b.shot(file(`${theme}-wide`));
    await b.size(470, 1700);
    await b.goto(page(`?theme=${theme}&w=390&h=1560`), 1500);
    await b.shot(file(`${theme}-narrow`));
  }

  // Four moments of the scene: a friend's card on its way, arrived (and another friend took one on), a card on
  // its way to Done, and landed there.
  await scheme('dark');
  await b.size(1130, 1010);
  await b.goto(page('?theme=dark'), 1500);
  await b.eval('scene[0]()');
  await wait(330);
  await b.shot(file('scene-1'));
  await wait(700);
  await b.eval('scene[1]()');
  await wait(450);
  await b.shot(file('scene-2'));
  await wait(2600);
  await b.eval('scene[2]()');
  await wait(330);
  await b.shot(file('scene-3'));
  await wait(560);
  await b.shot(file('scene-4'));
  await wait(3000);
  await b.shot(file('scene-after'));
  await b.size(2260, 2020);
  await b.goto(page('sheet.html'), 800);
  await b.shot(file('scene-sheet'));

  // A card in the hand: lifted over the next column with a slot open for it, and let go.
  await b.size(1130, 1010);
  await b.goto(page('?theme=dark&sandbox=0'), 1500);
  const from = await card('check the passports');
  const to = await card('pick one of the three');
  await mouse('mousePressed', from.x, from.y);
  for (let i = 1; i <= 12; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.top - 6 - from.y) * i) / 12);
  await wait(450);
  await b.shot(file('drag-1-lifted'));
  await mouse('mouseReleased', to.x, to.top - 6);
  await wait(120);
  await b.shot(file('drag-2-let-go'));
  await wait(900);
  await b.shot(file('drag-3-settled'));
} finally {
  b.close();
  server.closeAllConnections();
  server.close();
}
