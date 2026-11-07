# A Weave client service in JavaScript: a Kanban

A board shown its own way. A project's maintainers pin this service to a board; every member's own Weave then fetches it and shows the board through it: the posts as cards in columns, moved by drag and drop. It's built into a WebAssembly component that Weave runs itself, with no key, no network and no files: it only turns the board's events into a state, and an action into events for the member to sign.

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

  `fold` must be pure: every member folds the same events into the same board.

- `site/` is the view: plain HTML, CSS and JavaScript, shown in a sandboxed frame in Weave (no network, no access to anything else). It talks only to Weave, by `postMessage`:

| | |
| --- | --- |
| `{weave: 'view', state, actions, board, me}` | from Weave, whenever the board changes |
| `{weave: 'act', id, name, input}` | to Weave: do an action |
| `{weave: 'acted', id, error?}` | from Weave: how it went |
| `{weave: 'open', post}` | to Weave: open a post |

- `weave.app.json` says where its parts are, and its contract: the kinds its actions may propose (`client.writes`). Weave checks every proposed event against it, and that it's about this board, before the member signs it with their own rights. Of Weave's own kinds, only posts and what members do with posts are allowed; kinds of its own (like `kanban.move`) are about a post in the board (`target`), or belong to the board.

Agents see the same thing: `weave_board_view` gives them the state and actions, `weave_board_action` does one, signed as the agent.

## Releasing it and showing a board with it

Release an archive with `board.wasm` and `site/` on GitHub (`weave app release v1.0 --asset wasm=kanban.tar.gz -p <project>`), or an image for `wasi/wasm` with `weave.app.json` in its `dev.weave.service` label (`weave service release <image:tag> -p <project>`). Then a maintainer of a project pins it to a board:

```
weave board lens tasks -p <project> --artifact <project>          # suggested: each member chooses
weave board lens tasks -p <project> --artifact <project> --require # every member's Weave shows it
weave board lens tasks -p <project> --from <catalog>/<app>        # one a catalog lists
weave board view tasks -p <project>                               # the state, as your node folds it
weave board act tasks move -p <project> --input '{"post": "…", "column": "Done"}'
```
