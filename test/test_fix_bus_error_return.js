const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: examples/return-types.js documents `return new Error(...)`
// as the way to send a DBus error from a service handler, but the bus
// treated any return value (including Error) as success and tried to
// marshall it as the declared return type. The fix detects Error
// instances on the success path and routes them through sendError.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function fooMsg() {
  return {
    type: constants.messageType.methodCall,
    path: '/x',
    interface: 'com.example.Iface',
    member: 'Foo',
    serial: 1,
    sender: ':1.0',
    body: []
  };
}

function ifaceWithFoo() {
  return {
    name: 'com.example.Iface',
    methods: { Foo: ['', 's', [], ['out']] },
    signals: {},
    properties: {}
  };
}

describe('bus treats returned Error as a DBus error reply', function () {
  it('routes a returned plain Error through sendError', function (done) {
    var bb = makeBus();
    bb.b.exportInterface(
      {
        Foo: function () {
          return new Error('boom');
        }
      },
      '/x',
      ifaceWithFoo()
    );
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', fooMsg());
    setImmediate(function () {
      try {
        assert.equal(bb.conn.outbox.length, 1);
        var reply = bb.conn.outbox[0];
        assert.equal(reply.type, constants.messageType.error);
        assert.equal(reply.errorName, 'org.freedesktop.DBus.Error.Failed');
        assert.equal(reply.body[0], 'boom');
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('uses err.dbusName as the errorName when set on the returned Error', function (done) {
    var bb = makeBus();
    bb.b.exportInterface(
      {
        Foo: function () {
          var e = new Error('nope');
          e.dbusName = 'com.example.MyError';
          return e;
        }
      },
      '/x',
      ifaceWithFoo()
    );
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', fooMsg());
    setImmediate(function () {
      try {
        var reply = bb.conn.outbox[0];
        assert.equal(reply.type, constants.messageType.error);
        assert.equal(reply.errorName, 'com.example.MyError');
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
