// The board's view, in a sandboxed frame inside Weave. It gets the state its fold made ({weave: 'view', state}) and
// asks Weave for actions ({weave: 'act', id, name, input}); Weave answers {weave: 'acted', id, error?}. It has no
// network and no access to anything else: Weave signs what the action proposes, as the member, if they may.
const $ = (id) => document.getElementById(id);
const el = (tag, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const columns = $('columns');
const add = $('add');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pending = new Map();
let next = 0;
let me = {}; // who is looking: {did}
let truth; // the state as Weave last sent it
let shown; // the state as it's drawn: truth, with my own move in it while Weave signs that
let mine; // that move: {post, column, before}
let drag; // the card being dragged and the slot open for it: {c, slot}
const flags = new Map(); // by card: who moved it and since when ({who, since}), said for a moment

function act(name, input) {
  const id = ++next;
  window.parent.postMessage({ weave: 'act', id, name, input }, '*');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const say = (error = '') => ($('status').textContent = error);
const show = (post) => window.parent.postMessage({ weave: 'open', post }, '*');

// ---------------------------------------------------------------- what a card shows

// What a card is about, read from the beginning of its title: "Flights: Frankfurt to Haikou" is about Flights. The
// words a holiday has get a picture and a color of their own; any other gets a color made from the word.
const ABOUT = [
  ['flight flights fly train ferry', '✈️', 205],
  ['visa passport passports papers', '🛂', 265],
  ['hotel stay room rooms house', '🏨', 325],
  ['pack packing bring', '🎒', 28],
  ['food eat dinner lunch market', '🍜', 8],
  ['beach swim surf sun', '🏖️', 185],
  ['dive diving snorkel snorkels boat', '🤿', 225],
  ['money budget pay pot', '💶', 150],
  ['car drive rent scooter', '🚗', 48],
  ['trip tour hike day', '🗺️', 95],
  ['insurance health doctor', '🩺', 345],
];
function about(title) {
  const named = /^([^:]{1,24}):\s+(\S.*)$/s.exec(title);
  const label = named ? named[1].trim() : title.trim().split(/\s+/)[0];
  const known = ABOUT.find(([words]) => label.toLowerCase().split(/\s+/).some((word) => words.split(' ').includes(word)));
  // Without a colon, only a word we know makes a label, and the title stays whole.
  if (!named && !known) return { title };
  return { label, icon: known?.[1] ?? '🏷️', hue: known?.[2] ?? hue(label), title: named ? named[2] : title };
}

/** A color (its hue) made from a name: the same name, the same color, on every member's board. */
const hue = (text) => [...String(text)].reduce((h, letter) => (h * 31 + letter.codePointAt(0)) % 360, 0);

/** A person as a round chip: their initials on their color (the frame gets no pictures of them). */
function chip(name) {
  const words = String(name).match(/[\p{L}\p{N}]+/gu) ?? ['?'];
  const c = el('span', 'chip', words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2));
  c.style.setProperty('--hue', hue(name));
  return c;
}
const called = (who) => (who.by === me.did ? 'You' : who.name);

/** How long ago, in words. The fold has no clock (every member folds the same state), so the view counts. */
function ago(time) {
  const s = (Date.now() - Date.parse(time)) / 1000;
  if (!(s >= 90)) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const when = (time) => Object.assign(el('time', '', ago(time)), { dateTime: time });
setInterval(() => document.querySelectorAll('time').forEach((t) => (t.textContent = ago(t.dateTime))), 30_000);

/** Whose a card is: who took it on (if I did: a button that lets it go), or a button to take it on. */
function whose(card) {
  const ask = (button, name) => {
    button.disabled = true;
    act(name, { post: card.id }).then(() => say(), (error) => {
      say(error);
      button.disabled = false;
    });
  };
  if (!card.taken) {
    if (card.column === shown.columns.at(-1).name) return ''; // done, by nobody in particular
    const take = el('button', 'take', 'I’ll do it');
    take.addEventListener('click', () => ask(take, 'take'));
    return take;
  }
  const own = card.taken.by === me.did;
  const taken = el(own ? 'button' : 'span', 'taken', own ? 'Yours ✕' : `${card.taken.name}’s`);
  taken.title = own ? 'You took it on: click to let it go' : `${card.taken.name} took it on ${ago(card.taken.time)}`;
  taken.prepend(chip(card.taken.name));
  if (own) taken.addEventListener('click', () => ask(taken, 'leave'));
  return taken;
}

/** A card: what it's about and whose it is, its title and the beginning of its text, who made it, its votes and chat, who moved it last. */
function cardFor(card) {
  const { label, icon, hue: color, title } = about(String(card.title));
  const c = el('article', 'card');
  c.dataset.id = card.id;
  c.tabIndex = 0;
  c.title = 'Drag it to move it; double-click to open it in Weave';

  const top = el('div', 'top');
  if (label) {
    const tag = top.appendChild(el('span', 'label', label));
    tag.prepend(el('span', 'icon', icon));
    tag.style.setProperty('--hue', color);
  }
  top.append(el('span', 'gap'), whose(card));
  if (top.children.length > 1) c.append(top);
  c.append(el('h3', '', title));
  if (card.text) c.append(el('p', 'text', card.text));

  const meta = el('div', 'meta');
  meta.append(chip(card.by), el('span', 'by', card.by), when(card.time), el('span', 'gap'));
  if (card.votes) meta.append(Object.assign(el('span', 'votes', `▲ ${card.votes}`), { title: 'Votes: ups minus downs' }));
  if (card.chats) meta.append(Object.assign(el('span', 'chats', `💬 ${card.chats}`), { title: 'Messages in its chat' }));
  c.append(meta);
  if (card.moved) c.appendChild(Object.assign(el('div', 'moved', `↪ ${called(card.moved)} moved it · `), { title: 'Who moved it last' })).append(when(card.moved.time));

  c.addEventListener('pointerdown', (e) => pick(e, c));
  c.addEventListener('dblclick', (e) => e.target.closest('button') || show(card.id));
  // Without a pointer: the arrow keys move it to the column next door, Enter opens it.
  c.addEventListener('keydown', (e) => {
    if (e.target !== c) return;
    const there = shown.columns[shown.columns.findIndex((column) => column.name === card.column) + { ArrowLeft: -1, ArrowRight: 1 }[e.key]];
    if (e.key === 'Enter') show(card.id);
    else if (there) act('move', { post: card.id, column: there.name }).then(() => say(), say);
  });
  return c;
}

// ---------------------------------------------------------------- drawing the board

/** The line at the top: how many cards are done, of all; a bar of the columns' shares; each column's count. */
function plan(state) {
  const total = state.columns.reduce((n, column) => n + column.cards.length, 0);
  $('done').textContent = total ? `${state.columns.at(-1).cards.length} of ${total} done` : 'Nothing planned yet';
  state.columns.forEach((column, i) => {
    ($('bar').children[i] ?? $('bar').appendChild(el('i'))).style.flexGrow = column.cards.length;
    ($('counts').children[i] ?? $('counts').appendChild(el('span'))).textContent = `${column.cards.length} ${column.name.toLowerCase()}`;
  });
}

/** The columns, made once: a head (name and count), the cards, and under the first one's cards the line to add one. */
function build(state) {
  columns.replaceChildren(
    ...state.columns.map((column) => {
      const section = el('section', 'column');
      section.dataset.name = column.name;
      const head = el('h2');
      head.append(el('i', 'dot'), column.name, el('span', 'n'));
      section.append(head, el('div', 'cards'));
      return section;
    }),
  );
  columns.firstChild.append(add);
  add.hidden = false;
}

/**
 * Draw the board as it is now, and show what changed since the last drawing as motion: a card that is somewhere
 * else travels there, a new one comes in, one that reached the last column gets a burst, one a friend moved says so.
 */
function render(dropped) {
  const state = mine ? moved(truth, mine) : truth;
  const from = places();
  const before = new Map((shown?.columns ?? []).flatMap((column) => column.cards).map((card) => [card.id, card]));
  const focus = document.activeElement?.dataset?.id;
  shown = state;
  plan(state);
  if (columns.children.length !== state.columns.length) build(state);
  const made = new Map();
  state.columns.forEach((column, i) => {
    columns.children[i].querySelector('.n').textContent = column.cards.length;
    columns.children[i].querySelector('.cards').replaceChildren(...column.cards.map((card) => made.set(card.id, cardFor(card)).get(card.id)));
  });
  made.get(focus)?.focus({ preventScroll: true });
  let entering = 0;
  for (const card of state.columns.flatMap((column) => column.cards)) {
    const c = made.get(card.id);
    const was = before.get(card.id);
    if (!was) {
      c.classList.add('enter');
      c.style.setProperty('--i', entering++);
      continue;
    }
    const ms = travel(c, from.get(card.id));
    if (card.id === dropped) c.classList.add('settle');
    if (card.column !== was.column && card.column === state.columns.at(-1).name) burst(c, ms);
    if (card.moved && card.moved.time !== was.moved?.time && card.moved.by !== me.did) flags.set(card.id, { who: card.moved, since: performance.now() });
    const said = flags.get(card.id);
    if (said && performance.now() - said.since < 3400) flag(c, said.who, performance.now() - said.since);
    if (card.taken && card.taken.by !== was.taken?.by) c.querySelector('.taken').classList.add('pop');
  }
}

/** The state with one card put somewhere else: my own move, drawn at once, before Weave has signed it. */
function moved(state, { post, column, before }) {
  const copy = structuredClone(state);
  const card = copy.columns.flatMap((c) => c.cards).find((c) => c.id === post);
  const to = copy.columns.find((c) => c.name === column);
  if (!card || !to) return state;
  for (const c of copy.columns) c.cards = c.cards.filter((other) => other !== card);
  const at = to.cards.findIndex((c) => c.id === before);
  to.cards.splice(at < 0 ? to.cards.length : at, 0, Object.assign(card, { column, moved: { by: me.did, time: new Date().toISOString() } }));
  return copy;
}

// ---------------------------------------------------------------- motion

/** Where every card is on the screen now. */
const places = () => new Map([...document.querySelectorAll('.card')].map((c) => [c.dataset.id, c.getBoundingClientRect()]));

/** A card that was somewhere else a moment ago travels to where it is now, instead of jumping. How long it takes. */
function travel(c, from) {
  c.flight?.cancel();
  const to = c.getBoundingClientRect();
  const dx = from ? from.left - to.left : 0;
  const dy = from ? from.top - to.top : 0;
  if (still || (!dx && !dy)) return 0;
  const far = Math.hypot(dx, dy) > 200; // from another column: over the other cards, and slower
  const ms = far ? 700 : 280;
  c.classList.add(far ? 'flying' : 'shifting');
  c.flight = c.animate({ translate: [`${dx}px ${dy}px`, '0px 0px'] }, { duration: ms, easing: far ? 'cubic-bezier(.45, .05, .2, 1)' : 'cubic-bezier(.2, .8, .2, 1)' });
  c.flight.onfinish = () => c.classList.remove('flying', 'shifting');
  return ms;
}

/** A small burst on a card that reached the last column, once it has arrived there (after `wait` ms). */
function burst(c, wait) {
  const b = el('span', 'burst');
  for (let i = 0; i < 16; i++) b.appendChild(el('i')).style.cssText = `--turn: ${i * 22.5 + 8}deg; --far: ${38 + (i % 3) * 22}px; --hue: ${(i * 47) % 360}`;
  c.append(b);
  c.classList.add('landed');
  c.style.setProperty('--wait', `${wait}ms`);
}

/** For a moment, who moved this card: a friend did it, somewhere else. It began `since` ms ago (the board may have been drawn anew since). */
function flag(c, who, since) {
  const f = el('span', 'flag', `${who.name} moved it`);
  f.prepend(chip(who.name));
  c.append(f);
  c.classList.add('touched');
  c.style.setProperty('--hue', hue(who.name));
  c.style.setProperty('--since', `-${since}ms`);
}

// ---------------------------------------------------------------- dragging

/** A press on a card: once the pointer moves, the card lifts and follows it, until it's let go. */
function pick(down, c) {
  if (down.button || down.target.closest('button')) return;
  // A finger has to rest on the card a moment first: a swipe scrolls the board.
  let held = down.pointerType !== 'touch';
  const hold = setTimeout(() => (held = true), 300);
  const move = (e) => {
    const far = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 6;
    if (!drag && far && !held) return end(e);
    if (!drag && far) lift(c);
    if (drag) follow(e, down);
  };
  const end = (e) => {
    clearTimeout(hold);
    for (const [type, listener] of listeners) c.removeEventListener(type, listener);
    if (drag) drop(e.type === 'pointerup');
  };
  const listeners = [['pointermove', move], ['pointerup', end], ['pointercancel', end]];
  for (const [type, listener] of listeners) c.addEventListener(type, listener);
  c.setPointerCapture(down.pointerId);
}
// While a card is dragged by a finger, the board doesn't scroll.
document.addEventListener('touchmove', (e) => drag && e.preventDefault(), { passive: false });

/** The card leaves its place (a slot of its size stays there) and floats above the board. */
function lift(c) {
  const r = c.getBoundingClientRect();
  const slot = el('div', 'slot');
  slot.style.height = `${r.height}px`;
  c.before(slot);
  Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  c.classList.add('dragging');
  drag = { c, slot };
}

/** The card that comes after this one in its column, the dragged one aside. */
const after = (node) => (node.nextElementSibling === drag.c ? drag.c.nextElementSibling : node.nextElementSibling);

/** The card follows the pointer; the slot opens in the column under it, before the first card the pointer is above. */
function follow(e, down) {
  const { c, slot } = drag;
  c.style.translate = `${e.clientX - down.clientX}px ${e.clientY - down.clientY}px`;
  const column = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList.contains('column'));
  for (const other of columns.children) other.classList.toggle('over', other === column);
  if (!column) return;
  const before = [...column.querySelectorAll('.card:not(.dragging)')].find((o) => e.clientY < o.getBoundingClientRect().top + o.offsetHeight / 2) ?? null;
  if (slot.closest('.column') === column && after(slot) === before) return;
  const from = places();
  column.querySelector('.cards').insertBefore(slot, before);
  for (const other of document.querySelectorAll('.card:not(.dragging)')) travel(other, from.get(other.dataset.id));
}

/** Let go: the card goes where the slot is (drawn at once, and asked of Weave), or back if the drag was called off. */
function drop(landed) {
  const { c, slot } = drag;
  const id = c.dataset.id;
  const move = { post: id, column: slot.closest('.column').dataset.name, before: after(slot)?.dataset.id ?? null };
  const home = shown.columns.find((column) => column.cards.some((card) => card.id === id));
  const follower = home.cards[home.cards.findIndex((card) => card.id === id) + 1]?.id ?? null;
  drag = undefined;
  for (const column of columns.children) column.classList.remove('over');
  if (landed && (move.column !== home.name || move.before !== follower)) {
    mine = move;
    act('move', move).then(() => say(), (error) => {
      say(error);
      if (mine === move) mine = undefined;
      if (!drag) render(); // back where it was
    });
  }
  render(id);
}

// ---------------------------------------------------------------- talking to Weave

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const m = event.data;
  if (m?.weave === 'view' && m.state?.columns) {
    me = m.me ?? {};
    truth = m.state;
    if (!pending.size) mine = undefined; // Weave has signed my move: it's in the state now
    if (!drag) render(); // a card in the hand stays there: the board is drawn anew when it's let go
  }
  if (m?.weave === 'acted' && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(m.error);
    else resolve();
  }
});

function addCard() {
  const title = $('title').value.trim();
  if (!title) return;
  act('add', { title }).then(() => {
    $('title').value = '';
    say();
  }, say);
}
$('add-card').addEventListener('click', addCard);
$('title').addEventListener('keydown', (e) => e.key === 'Enter' && addCard());
