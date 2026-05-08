const bus = require('../lib/bus');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: error replies surfaced as { name, message: <body-array> }, so
// `err.message.includes(...)` would crash callers expecting a string. The
// fix exposes err.message as a string (first body element if string, else
// '') and the original array as err.body.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function lastSerial(conn) {
  return conn.outbox[conn.outbox.length - 1].serial;
}

describe('bus error reply normalises err.message and err.body', function () {
  it('exposes err.message as the first string body element and err.body as the full array', function (done) {
    var bb = makeBus();
    bb.b.invoke(
      {
        destination: 'com.test',
        path: '/x',
        interface: 'com.test',
        member: 'Foo'
      },
      function (err) {
        try {
          assert.equal(err.name, 'com.test.Failed');
          assert.equal(typeof err.message, 'string');
          assert.equal(err.message, 'Boom');
          assert.deepEqual(err.body, ['Boom']);
          done();
        } catch (e) {
          done(e);
        }
      }
    );
    bb.conn.emit('message', {
      type: constants.messageType.error,
      replySerial: lastSerial(bb.conn),
      errorName: 'com.test.Failed',
      body: ['Boom']
    });
  });

  it('falls back to empty string when first body element is not a string', function (done) {
    var bb = makeBus();
    bb.b.invoke(
      { destination: 'x', path: '/x', interface: 'x', member: 'Foo' },
      function (err) {
        try {
          assert.equal(err.message, '');
          assert.deepEqual(err.body, [42]);
          done();
        } catch (e) {
          done(e);
        }
      }
    );
    bb.conn.emit('message', {
      type: constants.messageType.error,
      replySerial: lastSerial(bb.conn),
      errorName: 'x',
      body: [42]
    });
  });
});
