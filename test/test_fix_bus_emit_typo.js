const bus = require('../lib/bus');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: typo "undefined signa" -> "undefined signal".

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return bus(conn, { direct: true });
}

describe('bus emit-undefined-signal error message', function () {
  it('throws an Error mentioning "signal" when emit is called with no name', function () {
    var b = makeBus();
    var obj = new EventEmitter();
    var iface = { name: 'com.example.Iface', methods: {}, signals: {} };
    b.exportInterface(obj, '/com/example', iface);
    assert.throws(function () {
      obj.emit();
    }, /\bsignal\b/);
  });

  it('regression: error message must not be the truncated "signa"', function () {
    var b = makeBus();
    var obj = new EventEmitter();
    var iface = { name: 'com.example.Iface', methods: {}, signals: {} };
    b.exportInterface(obj, '/com/example', iface);
    try {
      obj.emit();
      assert.fail('expected throw');
    } catch (e) {
      assert.ok(
        /signal$/.test(e.message),
        'expected message to end with "signal", got: ' + e.message
      );
    }
  });
});
