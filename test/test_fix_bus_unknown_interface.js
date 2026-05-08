const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: a method call against an existing exported path with an
// unknown interface logged to stderr and fell through to UnknownService.
// The spec-correct reply is UnknownInterface.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function realIface() {
  return {
    name: 'com.example.Real',
    methods: { Foo: ['', '', [], []] },
    signals: {},
    properties: {}
  };
}

describe('bus replies UnknownInterface when interface is missing on exported object', function () {
  it('replies with the spec-correct error name', function () {
    var bb = makeBus();
    bb.b.exportInterface({}, '/com/example', realIface());
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', {
      type: constants.messageType.methodCall,
      path: '/com/example',
      interface: 'com.example.Missing',
      member: 'Whatever',
      serial: 99,
      sender: ':1.0'
    });
    assert.equal(bb.conn.outbox.length, 1);
    var reply = bb.conn.outbox[0];
    assert.equal(reply.type, constants.messageType.error);
    assert.equal(
      reply.errorName,
      'org.freedesktop.DBus.Error.UnknownInterface'
    );
  });

  it('error text mentions the unknown interface and the object path', function () {
    var bb = makeBus();
    bb.b.exportInterface({}, '/com/example', realIface());
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', {
      type: constants.messageType.methodCall,
      path: '/com/example',
      interface: 'com.example.Missing',
      member: 'X',
      serial: 100,
      sender: ':1.0'
    });
    var reply = bb.conn.outbox[0];
    assert.ok(/com\.example\.Missing/.test(reply.body[0]));
    assert.ok(/\/com\/example/.test(reply.body[0]));
  });
});
