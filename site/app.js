// The board's view, in a sandboxed frame inside Weave. It gets the state its fold made ({weave: 'view', state}) and
// asks Weave for actions ({weave: 'act', id, name, input}); Weave answers {weave: 'acted', id, error?}. It has no
// network and no access to anything else: Weave signs what the action proposes, as the member, if they may.
const $ = (id) => document.getElementById(id);
const pending = new Map();
let next = 0;

function act(name, input) {
  const id = ++next;
  window.parent.postMessage({ weave: 'act', id, name, input }, '*');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function render(state) {
  $('columns').replaceChildren(
    ...state.columns.map((column) => {
      const el = document.createElement('section');
      el.className = 'column';
      const h = document.createElement('h2');
      h.textContent = `${column.name} · ${column.cards.length}`;
      el.append(h);
      for (const card of column.cards) {
        const c = document.createElement('div');
        c.className = 'card';
        c.draggable = true;
        c.title = 'Drag to another column; double-click to open it in Weave';
        const t = document.createElement('div');
        t.textContent = card.title;
        const by = document.createElement('div');
        by.className = 'by';
        by.textContent = card.by;
        c.append(t, by);
        c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.id));
        c.addEventListener('dblclick', () => window.parent.postMessage({ weave: 'open', post: card.id }, '*'));
        el.append(c);
      }
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('over');
        const post = e.dataTransfer.getData('text/plain');
        if (post) act('move', { post, column: column.name }).catch((error) => ($('status').textContent = error));
      });
      return el;
    }),
  );
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const m = event.data;
  if (m?.weave === 'view' && m.state) render(m.state);
  if (m?.weave === 'acted' && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(m.error);
    else resolve();
  }
});

function add() {
  const title = $('title').value.trim();
  if (!title) return;
  act('add', { title }).then(
    () => ($('title').value = ''),
    (error) => ($('status').textContent = error),
  );
}
$('add-card').addEventListener('click', add);
$('title').addEventListener('keydown', (e) => e.key === 'Enter' && add());
