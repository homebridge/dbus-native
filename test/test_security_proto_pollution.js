const bus = require('../lib/bus');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Hardening: bus.exportedObjects and the per-path entry map are created
// with Object.create(null) so a malicious or accidental iface.name like
// "__proto__" or "constructor" cannot reach Object.prototype, and remote
// peers cannot probe inherited properties via msg.path / msg.interface.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

describe('bus.exportedObjects resists prototype pollution', function () {
  it('exportedObjects has a null prototype', function () {
    var bb = makeBus();
    assert.strictEqual(Object.getPrototypeOf(bb.b.exportedObjects), null);
  });

  it('per-path entry map has a null prototype after exportInterface', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    bb.b.exportInterface(obj, '/x', {
      name: 'com.example.Iface',
      methods: {},
      signals: {},
      properties: {}
    });
    assert.strictEqual(Object.getPrototypeOf(bb.b.exportedObjects['/x']), null);
  });

  it('an interface named "__proto__" does not pollute Object.prototype', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    var sentinel = { polluted: true };
    bb.b.exportInterface(obj, '/x', {
      name: '__proto__',
      methods: {},
      signals: {},
      properties: {}
    });
    var probe = {};
    assert.strictEqual(
      probe.polluted,
      undefined,
      'Object.prototype must not have a polluted property'
    );
    assert.notStrictEqual(Object.prototype.constructor, sentinel);
  });
});
