const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: a handler returning undefined produced body=[undefined],
// which threw inside marshall and never replied. The fix only attaches
// signature/body when the iface declares a return signature AND the
// handler returned a defined non-null value.

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

describe('bus handles void method returns', function () {
  it('replies without body when handler returns undefined and signature is empty', function (done) {
    var bb = makeBus();
    bb.b.exportInterface(
      {
        Foo: function () {
          /* returns undefined */
        }
      },
      '/x',
      {
        name: 'com.example.Iface',
        methods: { Foo: ['', '', [], []] },
        signals: {},
        properties: {}
      }
    );
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', methodCall('Foo'));
    setImmediate(function () {
      try {
        assert.equal(bb.conn.outbox.length, 1);
        var reply = bb.conn.outbox[0];
        assert.equal(reply.type, constants.messageType.methodReturn);
        assert.strictEqual(reply.body, undefined);
        assert.strictEqual(reply.signature, undefined);
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('omits body when iface declares no return signature even if handler returned a value', function (done) {
    var bb = makeBus();
    bb.b.exportInterface(
      {
        Foo: function () {
          return 'ignored';
        }
      },
      '/x',
      {
        name: 'com.example.Iface',
        methods: { Foo: ['', '', [], []] },
        signals: {},
        properties: {}
      }
    );
    bb.conn.outbox.length = 0;
    bb.conn.emit('message', methodCall('Foo'));
    setImmediate(function () {
      try {
        var reply = bb.conn.outbox[0];
        assert.strictEqual(reply.body, undefined);
        assert.strictEqual(reply.signature, undefined);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
