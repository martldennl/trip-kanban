// A Kanban board: a Weave client service in JavaScript, built into a WebAssembly component. A project's maintainers
// pin it to a board; every member's own Weave then shows the board through it. It's pure: Weave hands it the board's
// events (fold) and asks what an action means (act). It signs nothing itself: what it proposes, the member signs.

const COLUMNS = ['To do', 'Doing', 'Done'];

/** What can be done with the board: Weave reads this, for the renderer and for agents (weave_board_action). */
const ACTIONS = [
  { name: 'add', label: 'Add a card', input: { title: 'the card\'s title' } },
  { name: 'move', label: 'Move a card', input: { post: 'the card\'s id', column: COLUMNS.join(' | '), before: 'the id of the card there it goes before (left out: to the end)' } },
  { name: 'take', label: 'Take a card on', input: { post: 'the card\'s id' } },
  { name: 'leave', label: 'Let a card go', input: { post: 'the card\'s id' } },
];

/** The beginning of a post's text, on one line: what a card shows of it. */
const excerpt = (text) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 200) : '');

/**
 * The board's state from its events, oldest first: posts become cards in the first column, kanban.move puts them in
 * another (and in their place there), kanban.take and kanban.leave say who does them, edits change their title and
 * text, votes and chat messages are counted, deletions take them away.
 */
export function fold(board, items) {
  const cards = new Map(); // by id, in the order they were made
  const nth = new Map(); // the how-manyth card each one is
  const lists = new Map(COLUMNS.map((name) => [name, []])); // each column's cards, in their order
  const votes = new Map(); // per card: each person's latest vote
  const who = (item) => ({ by: item.author, name: item.authorName ?? item.author, time: item.time });
  const lift = (card) => lists.get(card.column).splice(lists.get(card.column).indexOf(card), 1);
  // Before the card it names, or at the end (before: null). A move that says no place at all (as they were before
  // cards had an order) puts it where the order the cards were made in has it.
  const put = (card, column, before) => {
    const list = lists.get(column);
    const at = list.findIndex((c) => (before === undefined ? nth.get(c.id) > nth.get(card.id) : c.id === before));
    list.splice(at < 0 ? list.length : at, 0, card);
    card.column = column;
  };
  for (const item of JSON.parse(items)) {
    const body = item.body ?? {};
    const card = cards.get(body.target ?? body.post);
    if (item.kind === 'weave.post' || item.kind === 'weave.issue') {
      const made = { id: item.id, title: body.title ?? '(untitled)', by: item.authorName ?? item.author, time: item.time, column: COLUMNS[0], author: item.author, text: excerpt(body.text), votes: 0, chats: 0 };
      cards.set(item.id, made);
      nth.set(item.id, nth.size);
      put(made, COLUMNS[0]);
    } else if (!card) {
      continue; // about a card that isn't there (any more)
    } else if (item.kind === 'weave.post.edit' && item.author === card.author) {
      // Only its author's edits count, as in Weave.
      if (typeof body.title === 'string' && body.title.trim()) card.title = body.title.trim();
      if (typeof body.text === 'string') card.text = excerpt(body.text);
    } else if (item.kind === 'weave.post.delete' && item.author === card.author) {
      // Its author's deletion (what a maintainer deleted, Weave no longer hands over at all).
      lift(card);
      cards.delete(card.id);
    } else if (item.kind === 'weave.upvote' && [1, 0, -1].includes(body.value)) {
      votes.set(card.id, (votes.get(card.id) ?? new Map()).set(item.author, body.value));
    } else if (item.kind === 'weave.msg') {
      card.chats += 1;
    } else if (item.kind === 'kanban.move' && COLUMNS.includes(body.column)) {
      lift(card);
      put(card, body.column, body.before);
      card.moved = who(item);
    } else if (item.kind === 'kanban.take') {
      card.taken = who(item);
    } else if (item.kind === 'kanban.leave' && card.taken?.by === item.author) {
      delete card.taken; // only who took it on lets it go
    }
  }
  // Ups minus downs, each person's latest vote counting: as Weave counts them.
  for (const card of cards.values()) card.votes = [...(votes.get(card.id)?.values() ?? [])].reduce((sum, v) => sum + v, 0);
  const columns = COLUMNS.map((name) => ({ name, cards: lists.get(name) }));
  return JSON.stringify({ board: JSON.parse(board), columns, actions: ACTIONS });
}

/** What an action proposes, as events for the member to sign; a throw is why not (Weave shows it). */
export function act(name, input, state, me) {
  const asked = JSON.parse(input) ?? {};
  const board = JSON.parse(state);
  const my = JSON.parse(me) ?? {};
  if (name === 'add') {
    const title = String(asked.title ?? '').trim();
    if (!title) throw 'a card needs a title';
    return JSON.stringify([{ kind: 'weave.post', body: { title: title.slice(0, 200), text: '' } }]);
  }
  if (!['move', 'take', 'leave'].includes(name)) throw `no action "${name}"`;
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === asked.post);
  if (!card) throw 'there is no such card on this board';
  if (name === 'move') {
    const column = board.columns.find((c) => c.name === asked.column);
    if (!column) throw `the columns are ${COLUMNS.join(', ')}`;
    const before = asked.before ?? null;
    if (before !== null && (before === card.id || !column.cards.some((c) => c.id === before))) throw `"before" has to be another card in ${column.name}`;
    // Nothing to sign when it's there already.
    const next = column.cards[column.cards.indexOf(card) + 1]?.id ?? null;
    if (card.column === column.name && next === before) return '[]';
    return JSON.stringify([{ kind: 'kanban.move', body: { target: card.id, column: column.name, before } }]);
  }
  if (name === 'take') {
    if (card.taken && card.taken.by === my.did) throw 'you took this card on already';
    return JSON.stringify([{ kind: 'kanban.take', body: { target: card.id } }]);
  }
  if (!card.taken) throw 'nobody took this card on';
  if (card.taken.by !== my.did) throw `${card.taken.name} took this card on: only they let it go`;
  return JSON.stringify([{ kind: 'kanban.leave', body: { target: card.id } }]);
}
