const auth = require('../lib/handshake');
const { Duplex } = require('stream');
const assert = require('assert');

// Regression: tryAuth checked `!methods.empty` (always truthy: arrays have
// no `.empty` property) so the rejection branch never executed. Auth
// failures surfaced as a generic "No authentication methods left to try"
// instead of the actual server REJECTED line.

function makeStream() {
  return new Duplex({
    read: function () {},
    write: function (chunk, enc, cb) {
      cb();
    }
  });
}

describe('handshake surfaces auth rejection reason', function () {
  it('passes an Error instance to the callback when all methods rejected', function (done) {
    var stream = makeStream();
    auth(stream, { authMethods: ['EXTERNAL'] }, function (err) {
      try {
        assert.ok(err instanceof Error, 'expected Error, got ' + typeof err);
        done();
      } catch (e) {
        done(e);
      }
    });
    setImmediate(function () {
      stream.push('REJECTED EXTERNAL\r\n');
    });
  });

  it('Error message contains the server REJECTED line text', function (done) {
    var stream = makeStream();
    auth(stream, { authMethods: ['EXTERNAL'] }, function (err) {
      try {
        assert.ok(err instanceof Error);
        assert.ok(
          /REJECTED/.test(err.message),
          'expected REJECTED in message, got: ' + err.message
        );
        done();
      } catch (e) {
        done(e);
      }
    });
    setImmediate(function () {
      stream.push('REJECTED EXTERNAL DBUS_COOKIE_SHA1\r\n');
    });
  });
});
