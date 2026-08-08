const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: a refused Hello threw from inside the connection's 'message'
// listener, so it escaped as an uncaughtException and took the host process
// down. It did so even when the caller had an 'error' listener on the
// connection, because a throw out of emit() cannot be caught by the caller's
// await - which is exactly how HAP-NodeJS probes whether Avahi is usable.
// A system bus that refuses Hello (AccessDenied on a locked-down machine) has
// to be reportable, not fatal.

function makeBus(attachErrorListener) {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  var seen = [];
  if (attachErrorListener) {
    conn.on('error', function (err) {
      seen.push(err);
    });
  }
  // no `direct` option, so the bus really does send Hello
  return { b: bus(conn, {}), conn: conn, seen: seen };
}

function refuseHello(bb) {
  var helloSerial = bb.conn.outbox[bb.conn.outbox.length - 1].serial;
  bb.conn.emit('message', {
    type: constants.messageType.error,
    replySerial: helloSerial,
    errorName: 'org.freedesktop.DBus.Error.AccessDenied',
    body: ['Rejected send message']
  });
}

describe('bus reports a refused Hello instead of throwing', function () {
  it('sends Hello on a non-direct connection', function () {
    var bb = makeBus(true);
    assert.equal(bb.conn.outbox.length, 1);
    assert.equal(bb.conn.outbox[0].member, 'Hello');
  });

  it('emits connection error rather than throwing when a listener is present', function () {
    var bb = makeBus(true);

    assert.doesNotThrow(function () {
      refuseHello(bb);
    });

    assert.equal(bb.seen.length, 1);
    assert.ok(bb.seen[0] instanceof Error);
    assert.ok(bb.seen[0].message.includes('AccessDenied'));
    assert.ok(bb.seen[0].message.includes('Rejected send message'));
    assert.equal(bb.b.name, undefined, 'the bus never got a unique name');
  });

  it('warns rather than throwing when no listener is present', function () {
    var bb = makeBus(false);
    var warnings = [];
    var originalWarn = console.warn;
    console.warn = function (message) {
      warnings.push(message);
    };

    try {
      assert.doesNotThrow(function () {
        refuseHello(bb);
      });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('AccessDenied'));
  });

  it('still records the unique name when Hello succeeds', function () {
    var bb = makeBus(true);
    var helloSerial = bb.conn.outbox[bb.conn.outbox.length - 1].serial;

    bb.conn.emit('message', {
      type: constants.messageType.methodReturn,
      replySerial: helloSerial,
      body: [':1.42']
    });

    assert.equal(bb.b.name, ':1.42');
    assert.equal(bb.seen.length, 0);
  });
});

describe('a bus whose Hello was refused refuses to be used', function () {
  it('fails a later invoke with the reason it never joined the bus', function (done) {
    var bb = makeBus(true);
    refuseHello(bb);

    // Surviving the refusal is not the same as pretending it did not happen:
    // self.name is undefined, the bus was never admitted, and every call made
    // on it would otherwise fail somewhere further on with an error about that
    // call rather than about the refusal that actually caused it.
    var sentBefore = bb.conn.outbox.length;

    bb.b.invoke({ member: 'GetVersionString' }, function (err) {
      assert.ok(err, 'the call fails');
      assert.ok(
        err.message.includes('never completed Hello'),
        'and names the refusal: ' + err.message
      );
      assert.ok(
        err.message.includes('AccessDenied'),
        'carrying the original reason: ' + err.message
      );
      // nothing was put on the wire for a bus that cannot use it
      assert.equal(bb.conn.outbox.length, sentBefore);
      done();
    });
  });

  it('leaves a bus that completed Hello working normally', function (done) {
    var bb = makeBus(true);
    var helloSerial = bb.conn.outbox[bb.conn.outbox.length - 1].serial;
    bb.conn.emit('message', {
      type: constants.messageType.methodReturn,
      replySerial: helloSerial,
      body: [':1.42']
    });

    assert.equal(bb.b.name, ':1.42');
    assert.equal(bb.b.helloError, undefined);

    var sentBefore = bb.conn.outbox.length;
    bb.b.invoke({ member: 'GetVersionString' }, function () {});

    // the call went out rather than being refused
    assert.equal(bb.conn.outbox.length, sentBefore + 1);
    done();
  });
});

