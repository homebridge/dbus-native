const bus = require('../lib/bus');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: each exportInterface call wrapped obj.emit again, so
// re-exporting the same object on a second path/interface produced a
// chain of nested wrappers. A single emit then walked every wrapper,
// duplicating local listeners and burning extra serial numbers. The fix
// uses an __dbusInterfaces accumulator and only wraps once.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function pingedIface() {
  return {
    name: 'com.example.Iface',
    methods: {},
    signals: { Pinged: ['s'] }
  };
}

describe('bus exportInterface wraps obj.emit only once across re-exports', function () {
  it('the second exportInterface reuses the first wrapper (identity check)', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    var beforeAny = obj.emit;
    bb.b.exportInterface(obj, '/p/a', pingedIface());
    var afterFirst = obj.emit;
    bb.b.exportInterface(obj, '/p/b', pingedIface());
    var afterSecond = obj.emit;
    assert.notStrictEqual(
      afterFirst,
      beforeAny,
      'first export should wrap emit'
    );
    assert.strictEqual(
      afterSecond,
      afterFirst,
      'second export must not re-wrap'
    );
  });

  it('emitting a signal dispatches once per registered (iface, path) pair', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    bb.b.exportInterface(obj, '/p/a', pingedIface());
    bb.b.exportInterface(obj, '/p/b', pingedIface());
    bb.conn.outbox.length = 0;
    obj.emit('Pinged', 'hello');
    var paths = bb.conn.outbox
      .filter(function (m) {
        return m.member === 'Pinged';
      })
      .map(function (m) {
        return m.path;
      })
      .sort();
    assert.deepEqual(paths, ['/p/a', '/p/b']);
  });

  it('local emit listeners fire exactly once after multiple re-exports (regression: duplicated)', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    var seen = 0;
    obj.on('Pinged', function () {
      seen++;
    });
    bb.b.exportInterface(obj, '/p/a', pingedIface());
    bb.b.exportInterface(obj, '/p/b', pingedIface());
    obj.emit('Pinged', 'x');
    assert.equal(seen, 1);
  });
});
