const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: a handler for a method whose return signature declares more
// than one top-level type could only ever return a single value, because the
// result was always wrapped as body=[result]. This made it impossible to 
// replicate the behavior of certain D-Bus methods, such as
// org.freedesktop.systemd1.Manager.EnableUnitFiles, whose signature 'ba(sss)'
// carries two return values. The fix inspects the return signature: when it
// has multiple top-level types (arrays, structs and dicts counting as a single
// type each) and the handler returns an array of the matching length, the array
// is used directly as the reply body so each element maps to one return value.
// Everything else keeps the old wrapping.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function methodCall(member) {
  return {
    type: constants.messageType.methodCall,
    path: '/x',
    interface: 'com.example.Iface',
    member: member,
    serial: 1,
    sender: ':1.0',
    body: []
  };
}

function exportMethod(bb, signature, handler) {
  bb.b.exportInterface({ Foo: handler }, '/x', {
    name: 'com.example.Iface',
    methods: { Foo: ['', signature, [], []] },
    signals: {},
    properties: {}
  });
}

function callAndReply(bb, done, check) {
  bb.conn.outbox.length = 0;
  bb.conn.emit('message', methodCall('Foo'));
  setImmediate(function () {
    try {
      var reply = bb.conn.outbox[0];
      assert.equal(reply.type, constants.messageType.methodReturn);
      check(reply);
      done();
    } catch (e) {
      done(e);
    }
  });
}

describe('bus packs multiple method return values', function () {
  it('uses the array directly when the signature has multiple top-level types', function (done) {
    var bb = makeBus();
    exportMethod(bb, 'ss', function () {
      return ['a', 'b'];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'ss');
      assert.deepEqual(reply.body, ['a', 'b']);
    });
  });

  it('wraps a single non-array return value', function (done) {
    var bb = makeBus();
    exportMethod(bb, 's', function () {
      return 'hello';
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 's');
      assert.deepEqual(reply.body, ['hello']);
    });
  });

  it('wraps a single array return value declared as one array type', function (done) {
    var bb = makeBus();
    exportMethod(bb, 'as', function () {
      return ['a', 'b'];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'as');
      assert.deepEqual(reply.body, [['a', 'b']]);
    });
  });

  it('treats a single struct as one top-level type and wraps it', function (done) {
    var bb = makeBus();
    exportMethod(bb, '(ii)', function () {
      return [1, 2];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, '(ii)');
      assert.deepEqual(reply.body, [[1, 2]]);
    });
  });

  it('uses the array directly for a struct plus a scalar return', function (done) {
    var bb = makeBus();
    exportMethod(bb, '(ss)i', function () {
      return [['x', 'y'], 5];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, '(ss)i');
      assert.deepEqual(reply.body, [['x', 'y'], 5]);
    });
  });

  it('treats a single dict as one top-level type and wraps it', function (done) {
    var bb = makeBus();
    exportMethod(bb, 'a{ss}', function () {
      return [['k', 'v']];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'a{ss}');
      assert.deepEqual(reply.body, [[['k', 'v']]]);
    });
  });

  it('wraps the array when its length does not match the number of return types', function (done) {
    var bb = makeBus();
    exportMethod(bb, 'ss', function () {
      return ['a'];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'ss');
      assert.deepEqual(reply.body, [['a']]);
    });
  });

  it('splits a boolean and an array-of-structs return', function (done) {
    var bb = makeBus();
    var items = [
      [
        'type',
        '/path/to/first',
        '/path/to/second'
      ]
    ];
    exportMethod(bb, 'ba(sss)', function () {
      return [true, items];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'ba(sss)');
      assert.deepEqual(reply.body, [true, items]);
    });
  });

  it('splits a scalar and an array return with a trailing array type', function (done) {
    var bb = makeBus();
    exportMethod(bb, 'ias', function () {
      return [2, ['one', 'two']];
    });
    callAndReply(bb, done, function (reply) {
      assert.equal(reply.signature, 'ias');
      assert.deepEqual(reply.body, [2, ['one', 'two']]);
    });
  });
});
