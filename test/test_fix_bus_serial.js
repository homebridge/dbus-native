const bus = require('../lib/bus');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: signal emit advanced bus.serial twice (once inside the
// signalMsg construction, once in a trailing self.serial++). Each emitted
// signal burned an extra serial number.

function makeBus() {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };
  return { b: bus(conn, { direct: true }), conn: conn };
}

function signalIface() {
  return {
    name: 'com.example.Iface',
    methods: {},
    signals: { Pinged: ['s'] }
  };
}

describe('bus serial advances by 1 per signal emit', function () {
  it('a single signal advances serial by exactly 1', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    bb.b.exportInterface(obj, '/com/example', signalIface());
    var before = bb.b.serial;
    obj.emit('Pinged', 'hello');
    assert.equal(bb.b.serial - before, 1);
  });

  it('three signals advance serial by exactly 3 (regression: would be 6)', function () {
    var bb = makeBus();
    var obj = new EventEmitter();
    bb.b.exportInterface(obj, '/com/example', signalIface());
    var before = bb.b.serial;
    obj.emit('Pinged', 'a');
    obj.emit('Pinged', 'b');
    obj.emit('Pinged', 'c');
    assert.equal(bb.b.serial - before, 3);
  });
});
