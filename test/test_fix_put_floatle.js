const Put = require('../lib/put');
const Buffer = require('safe-buffer').Buffer;
const assert = require('assert');

// Regression: hand-rolled IEEE 754 encoding combined sign/exponent with
// `&` instead of `|`, hard-coded the lower 16 bits of the mantissa to 0,
// and advanced offset by an extra 4 bytes. It also called console.dir/
// console.log on every invocation.

describe('put.floatle encodes IEEE 754 little-endian floats', function () {
  it('matches Buffer.writeFloatLE for 1.5', function () {
    var buf = Put().floatle(1.5).buffer();
    var ref = Buffer.alloc(4);
    ref.writeFloatLE(1.5, 0);
    assert.deepEqual(Array.from(buf), Array.from(ref));
  });

  it('advances offset by exactly 4 bytes (regression: was 8)', function () {
    // a sentinel byte placed after the float must land at offset 4
    var buf = Put().floatle(0).word8(0xab).buffer();
    assert.equal(buf.length, 5);
    assert.equal(buf[4], 0xab);
  });

  it('round-trips a range of float values via writeFloatLE/readFloatLE', function () {
    var values = [0, 1, -1, 1.5, -2.71828, 3.14159, 1e10, -1e-10];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var buf = Put().floatle(v).buffer();
      var decoded = buf.readFloatLE(0);
      if (v === 0) {
        assert.equal(decoded, 0);
      } else {
        var rel = Math.abs(decoded - v) / Math.max(Math.abs(v), 1);
        assert.ok(
          rel < 1e-6,
          'round-trip mismatch for ' + v + ': got ' + decoded
        );
      }
    }
  });
});
