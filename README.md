# A Weave client service in JavaScript: a Kanban

A board shown its own way. A project's maintainers pin this service to a board; every member's own Weave then fetches it and shows the board through it: the posts as cards in three columns (To do, Doing, Done), moved and put in order by dragging, taken on by whoever does them, with a line on top that says where the plan stands. It's built into a WebAssembly component that Weave runs itself, with no key, no network and no files: it only turns the board's events into a state, and an action into events for the member to sign.

```
npm install
npm run build              # → board.wasm
```

## How it fits together

- `src/board.js` is the logic. Weave calls it (`wit/service.wit`, the `board` world):

| | |
| --- | --- |
| `fold(board, items)` | the board (`{name, title}`) and its events, oldest first: its posts, their edits, deletions and votes, the messages in their chats, and the events of this service's own kinds about them. Returns the state, as JSON: whatever the view needs, plus `actions: [{name, label, input?}]` |
| `act(name, input, state, me)` | what an action means: events for the member to sign, as JSON `[{kind, body}]`. Throw a string to say why not |

  `fold` must be pure: every member folds the same events into the same board. It has no clock either: it keeps the times the events carry, and the view says how long ago that was.

- `site/` is the view: plain HTML, CSS and JavaScript, shown in a sandboxed frame in Weave (no network, no forms, no access to anything else). It talks only to Weave, by `postMessage`:

| | |
| --- | --- |
| `{weave: 'view', state, actions, board, me}` | from Weave, whenever the board changes (`me`: `{did}`) |
| `{weave: 'act', id, name, input}` | to Weave: do an action |
| `{weave: 'acted', id, error?}` | from Weave: how it went |
| `{weave: 'open', post}` | to Weave: open a post |

- `weave.app.json` says where its parts are, and its contract: the kinds its actions may propose (`client.writes`). Weave checks every proposed event against it, and that it's about this board, before the member signs it with their own rights. Of Weave's own kinds, only posts and what members do with posts are allowed; kinds of its own (`kanban.move`, `kanban.take`, `kanban.leave`) are about a post in the board (`target`), or belong to the board.

Agents see the same thing: `weave_board_view` gives them the state and actions, `weave_board_action` does one, signed as the agent.

## The state, and what a card shows

`fold` returns `{board, columns: [{name, cards}], actions}`; each column's cards are in their order. A card holds only what the events say:

| | |
| --- | --- |
| `id`, `title`, `text` | the post, with its author's edits (`text`: the beginning of it, on one line). The view reads what the card is about from the beginning of the title: "Flights: Frankfurt to Haikou" gets the label Flights |
| `by`, `author`, `time` | who made it (name and id), and when |
| `column` | where it is: To do until a `kanban.move` says otherwise |
| `votes` | `weave.upvote`: ups minus downs, each person's latest vote counting, as Weave counts them |
| `chats` | how many `weave.msg` its chat has. A message taken down later still counts: Weave doesn't hand the lens that |
| `moved` | who moved it last and when (`{by, name, time}`), if anyone did |
| `taken` | who took it on and when (`{by, name, time}`), until they let it go or someone else takes it |

## What one can do

| action | input | proposes |
| --- | --- | --- |
| `add` | `{title}` | `weave.post` `{title, text: ''}`: a new card in To do |
| `move` | `{post, column, before?}` | `kanban.move` `{target, column, before}`: into that column, before the card `before` names (a card there), or to the end (`before: null`). Nothing when it's there already |
| `take` | `{post}` | `kanban.take` `{target}`: "I'll do it". Whoever signs it has the card |
| `leave` | `{post}` | `kanban.leave` `{target}`: let it go. Only who has it can |

`act` refuses what makes no sense (no such card, no such column, a `before` that isn't another card of that column, letting go what isn't yours). `fold` takes what comes: a `kanban.move` without `before` (as they were before cards had an order) puts the card where the order the cards were made in has it, so such a board folds as it always did; a `before` that isn't in the column means the end; a `kanban.leave` by someone who doesn't have the card, and edits and deletions by someone who didn't write the post, count for nothing.

In the view: drag a card to another column or to another place in its own (with a finger: rest on it a moment first); the arrow keys move a focused card to the column next door; "I'll do it" takes a card on, "Yours ✕" lets it go; double-click (or Enter) opens the post in Weave. A card you drop is drawn in its new place at once, while Weave signs the move; if Weave refuses, it goes back and the reason shows under the board. When the board changes from elsewhere, cards travel to their new places, one that reached Done gets a small burst, and one a friend moved says for a moment who.

## Looking at it without Weave

`preview/` is not part of the lens (it isn't released): a page that shows `site/` in a frame of the app's size and plays Weave's part with the real `fold` and `act`, sample events and four friends (you are Mara). What an action proposes is checked against `weave.app.json` as Weave does.

```
node preview/serve.js      # → http://127.0.0.1:8841/preview/   (?play=1: a scene plays; ?theme=light; ?w=390&h=844)
node preview/shoot.js      # photographs into preview/out/ (needs ../tools/cdp.js and Chrome)
```

## Releasing it and showing a board with it

Release an archive with `board.wasm` and `site/` on GitHub (`tar -czf kanban.tar.gz board.wasm site`, then `weave app release v1.0 --asset wasm=kanban.tar.gz -p <project>`), or an image for `wasi/wasm` with `weave.app.json` in its `dev.weave.service` label (`weave service release <image:tag> -p <project>`). Then a maintainer of a project pins it to a board:

```
weave board lens tasks -p <project> --artifact <project>          # suggested: each member chooses
weave board lens tasks -p <project> --artifact <project> --require # every member's Weave shows it
weave board lens tasks -p <project> --from <catalog>/<app>        # one a catalog lists
weave board view tasks -p <project>                               # the state, as your node folds it
weave board act tasks move -p <project> --input '{"post": "…", "column": "Done"}'
weave board act tasks move -p <project> --input '{"post": "…", "column": "Doing", "before": "…"}'
weave board act tasks take -p <project> --input '{"post": "…"}'
```

A board pinned to an earlier release keeps that release's contract: `kanban.take` and `kanban.leave` are only signed once the board is pinned to a release that names them.
