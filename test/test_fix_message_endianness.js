const DBusBuffer = require('../lib/dbus-buffer');
const Buffer = require('safe-buffer').Buffer;
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Regression: unmarshalMessages and the standalone unmarshall always used
// readUInt32LE for the message header, ignoring the endianness flag in
// header[0] ('l' = LE, 'B' = BE). DBusBuffer also unconditionally read
// LE for all multi-byte fields. The fix threads a `littleEndian` option
// through so BE peers parse correctly.

describe('dbus-buffer honors littleEndian option', function () {
  it('reads 32-bit unsigned big-endian when littleEndian: false', function () {
    var buf = Buffer.from([0x00, 0x00, 0x00, 0x42]);
    var dbuf = new DBusBuffer(buf, undefined, { littleEndian: false });
    assert.equal(dbuf.readInt32(), 0x42);
  });

  it('reads 32-bit unsigned little-endian by default', function () {
    var buf = Buffer.from([0x42, 0x00, 0x00, 0x00]);
    var dbuf = new DBusBuffer(buf, undefined, {});
    assert.equal(dbuf.readInt32(), 0x42);
  });

  it('reads 16-bit signed big-endian when littleEndian: false', function () {
    var buf = Buffer.from([0xff, 0x80]);
    var dbuf = new DBusBuffer(buf, undefined, { littleEndian: false });
    assert.equal(dbuf.readSInt16(), -128);
  });

  it('reads 16-bit signed little-endian by default', function () {
    var buf = Buffer.from([0x80, 0xff]);
    var dbuf = new DBusBuffer(buf, undefined, {});
    assert.equal(dbuf.readSInt16(), -128);
  });
});

describe('message.js wires endianness flag from header byte 0', function () {
  // A behavioural test of the streaming parser would require hand-building
  // a complete BE-encoded D-Bus frame; we lock in the wiring with a source
  // check instead.
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'message.js'),
    'utf8'
  );

  it('sets le from header[0] === constants.endianness.le', function () {
    assert.ok(/header\[0\]\s*===\s*constants\.endianness\.le/.test(src));
  });

  it('passes the resolved littleEndian flag into DBusBuffer', function () {
    assert.ok(/littleEndian:\s*le/.test(src));
  });
});
