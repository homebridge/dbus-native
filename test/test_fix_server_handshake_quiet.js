const serverHandshake = require('../lib/server-handshake');
const { Duplex } = require('stream');
const assert = require('assert');

// Regression: the server handshake printed the client hello and
// post-OK BEGIN line on every connection, polluting host application logs.

function makeStream() {
  return new Duplex({
    read: function () {},
    write: function (chunk, enc, cb) {
      cb();
    }
  });
}

function driveLines(stream, lines, idx) {
  if (idx === undefined) idx = 0;
  if (idx >= lines.length) return;
  setImmediate(function () {
    stream.push(lines[idx]);
    driveLines(stream, lines, idx + 1);
  });
}

describe('server handshake is silent', function () {
  it('does not call console.log during a complete handshake (regression)', function (done) {
    var original = console.log;
    var logCount = 0;
    console.log = function () {
      logCount++;
    };
    var stream = makeStream();
    serverHandshake(stream, {}, function () {
      console.log = original;
      try {
        assert.equal(
          logCount,
          0,
          'expected zero console.log calls during handshake'
        );
        done();
      } catch (e) {
        done(e);
      }
    });
    driveLines(stream, [
      'AUTH EXTERNAL 31303030\r\n',
      'AUTH DBUS_COOKIE_SHA1 31303030\r\n',
      'DATA aabbcc\r\n',
      'BEGIN\r\n'
    ]);
  });

  it('completes successfully (callback invoked with null) and silently', function (done) {
    var original = console.log;
    console.log = function () {};
    var stream = makeStream();
    serverHandshake(stream, {}, function (err) {
      console.log = original;
      try {
        assert.strictEqual(err, null);
        done();
      } catch (e) {
        done(e);
      }
    });
    driveLines(stream, [
      'AUTH EXTERNAL 31303030\r\n',
      'AUTH DBUS_COOKIE_SHA1 31303030\r\n',
      'DATA aabbcc\r\n',
      'BEGIN\r\n'
    ]);
  });
});
