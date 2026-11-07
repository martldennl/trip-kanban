// A Kanban board: a Weave client service in JavaScript, built into a WebAssembly component. A project's maintainers
// pin it to a board; every member's own Weave then shows the board through it. It's pure: Weave hands it the board's
// events (fold) and asks what an action means (act). It signs nothing itself: what it proposes, the member signs.

const COLUMNS = ['To do', 'Doing', 'Done'];

/** What can be done with the board: Weave reads this, for the renderer and for agents (weave_board_action). */
const ACTIONS = [
  { name: 'add', label: 'Add a card', input: { title: 'the card\'s title' } },
  { name: 'move', label: 'Move a card', input: { post: 'the card\'s id', column: COLUMNS.join(' | ') } },
];

/**
 * The board's state from its events, oldest first: posts become cards in the first column, kanban.move puts them in
 * another, edits change their title, deletions take them away.
 */
export function fold(board, items) {
  const cards = new Map();
  for (const item of JSON.parse(items)) {
    const body = item.body ?? {};
    if (item.kind === 'weave.post' || item.kind === 'weave.issue') {
      cards.set(item.id, { id: item.id, title: body.title ?? '(untitled)', by: item.authorName ?? item.author, time: item.time, column: COLUMNS[0] });
    } else if (item.kind === 'weave.post.edit' && cards.has(body.target) && typeof body.title === 'string') {
      cards.get(body.target).title = body.title;
    } else if (item.kind === 'weave.post.delete') {
      cards.delete(body.target);
    } else if (item.kind === 'kanban.move' && cards.has(body.target) && COLUMNS.includes(body.column)) {
      cards.get(body.target).column = body.column;
    }
  }
  const columns = COLUMNS.map((name) => ({ name, cards: [...cards.values()].filter((c) => c.column === name) }));
  return JSON.stringify({ board: JSON.parse(board), columns, actions: ACTIONS });
}

/** What an action proposes, as events for the member to sign; a throw is why not (Weave shows it). */
export function act(name, input, state, me) {
  const asked = JSON.parse(input) ?? {};
  const board = JSON.parse(state);
  if (name === 'add') {
    const title = String(asked.title ?? '').trim();
    if (!title) throw 'a card needs a title';
    return JSON.stringify([{ kind: 'weave.post', body: { title: title.slice(0, 200), text: '' } }]);
  }
  if (name === 'move') {
    const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === asked.post);
    if (!card) throw 'there is no such card on this board';
    if (!COLUMNS.includes(asked.column)) throw `the columns are ${COLUMNS.join(', ')}`;
    if (card.column === asked.column) return '[]';
    return JSON.stringify([{ kind: 'kanban.move', body: { target: card.id, column: asked.column } }]);
  }
  throw `no action "${name}"`;
}
