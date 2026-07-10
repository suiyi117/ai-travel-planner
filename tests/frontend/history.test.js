const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/history.js');

const { createHistory, push, undo, redo } = window.AeroTravelHistory;

test('history restores drafts and clears redo after a new edit', () => {
  const original = { revision: 0, nested: { name: 'original' } };
  let history = createHistory(original, 2);
  original.nested.name = 'mutated outside history';
  assert.equal(history.present.nested.name, 'original');

  history = push(history, { revision: 1 });
  history = push(history, { revision: 2 });
  history = undo(history);
  assert.equal(history.present.revision, 3);
  history = redo(history);
  assert.equal(history.present.revision, 4);
  history = undo(history);
  assert.equal(history.present.revision, 5);
  history = push(history, { revision: 6 });
  assert.equal(history.future.length, 0);
  assert.equal(history.past.length <= 2, true);
});

test('empty undo and redo are immutable no-ops', () => {
  const history = createHistory({ revision: 0 }, 2);
  assert.equal(undo(history), history);
  assert.equal(redo(history), history);
});
