'use strict';

// Small event-driven IndexedDB fixture. Writes live in a transaction-local copy
// until oncomplete; request errors and explicit abort discard every write.
// No user storage, network, or files are read by this fixture.
const copy = value => value === undefined ? undefined : structuredClone(value);
function indexedFixture(initial = {}, options = {}) {
  const stores = new Map([
    ['state', new Map(Object.entries(initial.state || {}).map(([key, value]) => [key, copy(value)]))],
    ['clips', new Map(Object.entries(initial.clips || {}).map(([key, value]) => [key, copy(value)]))]
  ]);
  const events = [], transactions = [];
  let writes = 0;
  const error = name => Object.assign(new Error('PRIVATE_SYNTHETIC_IDB_DETAIL'), { name });
  const database = {
    objectStoreNames: { contains: name => stores.has(name) },
    transaction(names, mode = 'readonly') {
      const scope = typeof names === 'string' ? [names] : [...names];
      if (scope.some(name => !stores.has(name))) throw error('NotFoundError');
      const id = transactions.length;
      const tx = {
        id, mode, scope, error: null, aborted: false, completed: false,
        abort() {
          if (tx.completed) throw error('InvalidStateError');
          if (tx.aborted) return;
          tx.aborted = true; events.push({ tx: id, op: 'abort', mode, scope });
          setImmediate(() => tx.onabort?.({ target: tx }));
        },
        objectStore(name) {
          if (!scope.includes(name)) throw error('NotFoundError');
          events.push({ tx: id, op: 'store', store: name, mode });
          const stage = staged.get(name);
          const request = (op, key, value) => {
            if (tx.aborted || tx.completed) throw error('TransactionInactiveError');
            if ((op === 'add' || op === 'put' || op === 'delete') && mode !== 'readwrite') throw error('ReadOnlyError');
            events.push({ tx: id, op, store: name, key, mode });
            let writeNumber = 0;
            if (op === 'add' || op === 'put' || op === 'delete') {
              writes++;
              writeNumber = writes;
              if (options.throwWrite === writes) throw error('QuotaExceededError');
            }
            const q = { result: undefined, error: null };
            queue.push(() => {
              if (tx.aborted || tx.completed) return;
              try {
                if (options.failRead && options.failRead({ tx: id, key, op, mode })) throw error('UnknownError');
                if (writeNumber && options.failWrite === writeNumber) throw error('QuotaExceededError');
                if (op === 'get') q.result = copy(stage.get(key));
                else if (op === 'getAllKeys') q.result = [...stage.keys()];
                else if (op === 'count') q.result = stage.size;
                else if (op === 'delete') stage.delete(key);
                else {
                  if (op === 'add' && stage.has(key)) throw error('ConstraintError');
                  stage.set(key, copy(value)); q.result = key;
                }
                if (options.transformRead && op === 'get') q.result = options.transformRead({ tx: id, key, mode, value: q.result });
                q.onsuccess?.({ target: q });
                options.afterRequest?.({ tx, key, op, mode, q });
              } catch (failure) {
                q.error = failure; tx.error = failure;
                q.onerror?.({ target: q, preventDefault() {} });
                tx.onerror?.({ target: q });
                if (!tx.aborted) tx.abort();
              }
            });
            schedule();
            return q;
          };
          return {
            get: key => request('get', key),
            getAllKeys: () => request('getAllKeys'),
            count: () => request('count'),
            add: (value, key) => request('add', key, value),
            put: (value, key) => request('put', key, value),
            delete: key => request('delete', key),
            openCursor() {
              if (tx.aborted || tx.completed) throw error('TransactionInactiveError');
              events.push({ tx: id, op: 'cursor', store: name, mode });
              const q = { result: undefined, error: null }, rows = [...stage], next = () => {
                queue.push(() => {
                  if (tx.aborted || tx.completed) return;
                  const row = rows.shift();
                  q.result = row ? { key: row[0], value: copy(row[1]), continue: next } : null;
                  q.onsuccess?.({ target: q });
                });
                schedule();
              };
              next(); return q;
            }
          };
        }
      };
      const staged = new Map(scope.map(name => [name, new Map([...stores.get(name)].map(([key, value]) => [key, copy(value)]))]));
      const queue = [];
      let scheduled = false;
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        setImmediate(() => {
          scheduled = false;
          if (tx.aborted || tx.completed) return;
          while (queue.length && !tx.aborted) queue.shift()();
          if (tx.aborted) return;
          if (queue.length) { schedule(); return; }
          tx.completed = true;
          if (mode === 'readwrite') for (const name of scope) stores.set(name, staged.get(name));
          events.push({ tx: id, op: 'complete', mode, scope });
          tx.oncomplete?.({ target: tx });
        });
      }
      transactions.push(tx);
      events.push({ tx: id, op: 'transaction', mode, scope });
      schedule();
      return tx;
    }
  };
  return {
    database, stores, events, transactions,
    record: (key, store = 'state') => copy(stores.get(store).get(key)),
    snapshot: () => copy(Object.fromEntries([...stores].map(([name, map]) => [name, [...map]]))),
    replace: (key, value, store = 'state') => stores.get(store).set(key, copy(value)),
    writeCount: () => writes
  };
}
module.exports = { indexedFixture, copy };
