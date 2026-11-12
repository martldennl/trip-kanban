// Weave's part, played for the lens, to look at it without Weave: it keeps a board's events, folds them with the real
// fold, sends the frame {weave: 'view'}, and answers its {weave: 'act'} by running the real act, checking what it
// proposes against the contract (weave.app.json), "signing" it as Mara and folding again.
//
//   ?play=1        a short scene plays by itself: a friend moves a card, another takes one on, one lands in Done
//   ?theme=light   light instead of dark        ?w=390&h=844   the frame's size (1050 × 900 as in the app)
//   ?sandbox=0     the frame unsandboxed, to look into it from outside (never how Weave shows it)
import { act, fold } from '../src/board.js';

const params = new URLSearchParams(location.search);
const frame = document.getElementById('lens');
const manifest = await (await fetch('../weave.app.json')).json();
const board = { name: 'todos', title: 'To-dos' };
const people = { mara: 'Mara', jonas: 'Jonas', aylin: 'Aylin', tobi: 'Tobi' };
const did = (who) => `did:key:${who}`;
const ME = 'mara';

// ---------------------------------------------------------------- the board's events

const items = [];
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** An event as the fold gets it, signed by one of the four, some time ago. Its id. */
function sign(who, kind, body, ago = 0) {
  items.push({ id: `e${String(items.length + 1).padStart(3, '0')}`, kind, body, author: did(who), authorName: people[who], time: new Date(Date.now() - ago).toISOString() });
  return items.at(-1).id;
}
const post = (who, title, text, ago) => sign(who, 'weave.post', { title, text, board: board.name }, ago);
const votes = (target, ago, ...who) => who.forEach((w, i) => sign(w, 'weave.upvote', { target, value: 1 }, ago - i * MIN));
const chat = (target, ago, ...lines) => lines.forEach(([who, text], i) => sign(who, 'weave.msg', { post: target, text }, ago - i * 4 * MIN));

const flights = post('jonas', 'Flights: Frankfurt to Haikou', 'Via Guangzhou, about 15 hours. The fare holds until Friday.', 6 * DAY);
const visa = post('aylin', 'Visa: check the passports', 'They have to be valid for six months after we land.', 6 * DAY - HOUR);
const hotel = post('mara', 'Hotel: pick one of the three', 'Two on the beach in Sanya, one in the old town of Haikou.', 5 * DAY);
const snorkels = post('tobi', 'Pack the snorkels', '', 5 * DAY - 2 * HOUR);
const money = post('mara', 'Money: one pot for the four of us', 'Everyone pays in 300 €, we settle up at home.', 4 * DAY);
const market = post('aylin', 'Food: the night market in Haikou', 'On the first evening, straight from the airport?', 3 * DAY);
const insurance = post('aylin', 'Insurance: health cover abroad', '', 3 * DAY - 3 * HOUR);
const beach = post('tobi', 'Beach: a day at Yalong Bay', 'Boards to rent right on the sand.', 2 * DAY);
const car = post('jonas', 'Car: rent one for the east coast', '', 26 * HOUR);

votes(flights, 5 * DAY, 'aylin', 'mara', 'tobi');
chat(flights, 4 * DAY, ['aylin', 'The 21st or the 22nd?'], ['jonas', 'The 21st is 80 € less.'], ['tobi', 'The 21st then.'], ['mara', 'Fine by me.'], ['jonas', 'I\'ll book tonight.']);
votes(hotel, 4 * DAY, 'jonas', 'aylin', 'tobi', 'mara');
chat(hotel, 2 * DAY, ['tobi', 'The one with the pool.'], ['aylin', 'The old town one has the roof terrace.'], ['jonas', 'Pool.'], ['mara', 'Roof terrace…'], ['tobi', 'Vote!'], ['aylin', 'Voted.'], ['mara', 'Two each. Of course.']);
votes(market, 2 * DAY, 'tobi', 'jonas', 'mara');
chat(market, DAY, ['tobi', 'Coconut rice!'], ['mara', 'And the grilled fish.']);
votes(snorkels, 3 * DAY, 'mara');
votes(beach, DAY, 'aylin', 'mara');
chat(beach, 20 * HOUR, ['jonas', 'Is that the one with the long bay?']);
chat(visa, 5 * DAY, ['aylin', 'Mine runs out in March: too close.'], ['mara', 'Mine is fine.']);
chat(insurance, 2 * DAY, ['aylin', 'The card covers it if we pay the flights with it.'], ['jonas', 'I will then.'], ['aylin', 'Done, I have it in writing.']);

sign('jonas', 'kanban.take', { target: flights }, 5 * DAY);
sign('jonas', 'kanban.move', { target: flights, column: 'Doing' }, 2 * DAY); // an older move: no place in it
sign('mara', 'kanban.move', { target: money, column: 'Doing', before: null }, 3 * DAY);
sign('mara', 'kanban.take', { target: money }, 3 * DAY);
sign('mara', 'kanban.move', { target: money, column: 'Done', before: null }, 28 * HOUR);
sign('aylin', 'kanban.take', { target: insurance }, 2 * DAY);
sign('aylin', 'kanban.move', { target: insurance, column: 'Done', before: null }, 3 * HOUR);
sign('mara', 'kanban.take', { target: hotel }, 6 * HOUR);
sign('mara', 'kanban.move', { target: hotel, column: 'Doing', before: null }, 5 * HOUR);
sign('tobi', 'kanban.move', { target: market, column: 'To do', before: snorkels }, 40 * MIN);

// ---------------------------------------------------------------- Weave's part

/** The state: the events, oldest first as Weave hands them over, folded. */
const folded = () => fold(JSON.stringify(board), JSON.stringify([...items].sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))));

/** Send the frame the view, as whenever the board changes. */
function view() {
  const state = JSON.parse(folded());
  frame.contentWindow.postMessage({ weave: 'view', state, actions: state.actions, board, me: { did: did(ME) } }, '*');
}

/** An action, by one of the four: what the lens proposes is checked against its contract, as Weave does, and signed. */
function action(who, name, input) {
  let proposed;
  try {
    proposed = JSON.parse(act(name, JSON.stringify(input ?? null), folded(), JSON.stringify({ did: did(who), name: people[who] })));
  } catch (error) {
    throw new Error(`${manifest.name} won't: ${error instanceof Error ? error.message : error}`);
  }
  const posts = new Set(items.filter((item) => item.kind === 'weave.post').map((item) => item.id));
  for (const { kind, body } of proposed) {
    if (!manifest.client.writes.includes(kind)) throw new Error(`${manifest.name} may not propose ${kind} (its contract: ${manifest.client.writes.join(', ')})`);
    const about = body.post ?? body.target;
    if (about !== undefined && !posts.has(about)) throw new Error(`${manifest.name} proposed a ${kind} about something not in ${board.title}`);
  }
  for (const { kind, body } of proposed) sign(who, kind, body.post ?? body.target ? body : { ...body, board: board.name });
}

const note = (text) => {
  const n = document.getElementById('note');
  n.textContent = text;
  n.classList.add('on');
  setTimeout(() => n.classList.remove('on'), 2500);
};

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const m = event.data;
  // A moment passes while Weave signs: the lens has to look right in the meantime.
  if (m?.weave === 'act') {
    setTimeout(() => {
      try {
        action(ME, m.name, m.input);
        frame.contentWindow.postMessage({ weave: 'acted', id: m.id }, '*');
        view();
      } catch (error) {
        frame.contentWindow.postMessage({ weave: 'acted', id: m.id, error: error.message }, '*');
        note(error.message);
      }
    }, 150);
  }
  if (m?.weave === 'open') note(`Weave would open “${items.find((item) => item.id === m.post)?.body.title}”`);
});

// ---------------------------------------------------------------- the scene

/** What the friends do, one step after the other: ?play=1 plays them; window.scene[i]() does one. */
window.scene = [
  () => action('aylin', 'move', { post: visa, column: 'Doing' }),
  () => action('tobi', 'take', { post: snorkels }),
  () => action('jonas', 'move', { post: flights, column: 'Done', before: money }),
].map((step) => () => view(step()));
// To look at and try from the console: what was signed, and the contract (take a kind out of it: Weave refuses it).
window.items = items;
window.contract = manifest.client.writes;

document.documentElement.classList.toggle('light', params.get('theme') === 'light');
frame.style.colorScheme = params.get('theme') === 'light' ? 'light' : 'dark';
frame.width = params.get('w') ?? 1050;
frame.height = params.get('h') ?? 900;
if (params.get('sandbox') === '0') frame.removeAttribute('sandbox');
frame.addEventListener('load', () => {
  view();
  if (params.get('play')) window.scene.forEach((step, i) => setTimeout(step, 1800 + i * 2800));
});
frame.src = '../site/index.html';
