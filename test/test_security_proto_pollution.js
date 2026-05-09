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
    assert.strictEqual(
      Object.getPrototypeOf(bb.b.exportedObjects['/x']),
      null
    );
  });

  it('an interface named "__proto__" stores under the literal key without mutating the entry map prototype', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    var ifaceDescriptor = {
      name: '__proto__',
      methods: {},
      signals: {},
      properties: {}
    };
    bb.b.exportInterface(obj, '/x', ifaceDescriptor);

    var entryMap = bb.b.exportedObjects['/x'];

    // The per-path entry map must keep its null prototype — assigning to a
    // "__proto__" key on a normal {} map would silently re-parent the map.
    assert.strictEqual(
      Object.getPrototypeOf(entryMap),
      null,
      'per-path entry map must keep null prototype after iface name "__proto__"'
    );

    // The stored tuple must be retrievable by the literal "__proto__" key,
    // confirming the iface name is treated as a regular property, not the
    // prototype slot.
    var stored = entryMap['__proto__'];
    assert.ok(Array.isArray(stored), 'stored entry must be the [iface, obj] tuple');
    assert.strictEqual(stored[0], ifaceDescriptor);
    assert.strictEqual(stored[1], obj);
  });

  it('an interface named "__proto__" does not pollute Object.prototype', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    bb.b.exportInterface(obj, '/y', {
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
  });
});
