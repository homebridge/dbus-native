const assert = require('assert');

module.exports = Put;
function Put() {
  if (!(this instanceof Put)) return new Put();

  var words = [];
  var len = 0;

  this.put = function (buf) {
    words.push({ buffer: buf });
    len += buf.length;
    return this;
  };

  this.word8 = function (x) {
    words.push({ bytes: 1, value: x });
    len += 1;
    return this;
  };

  this.floatle = function (x) {
    words.push({ bytes: 'float', endian: 'little', value: x });
    len += 4;
    return this;
  };

  [8, 16, 24, 32, 64].forEach(
    function (bits) {
      this['word' + bits + 'be'] = function (x) {
        words.push({ endian: 'big', bytes: bits / 8, value: x });
        len += bits / 8;
        return this;
      };

      this['word' + bits + 'le'] = function (x) {
        words.push({ endian: 'little', bytes: bits / 8, value: x });
        len += bits / 8;
        return this;
      };
    }.bind(this)
  );

  this.pad = function (bytes) {
    assert(
      Number.isInteger(bytes),
      'pad(bytes) must be supplied with an integer!'
    );
    words.push({ endian: 'big', bytes: bytes, value: 0 });
    len += bytes;
    return this;
  };

  this.length = function () {
    return len;
  };

  this.buffer = function () {
    var buf = Buffer.alloc(len);
    var offset = 0;
    words.forEach(function (word) {
      if (word.buffer) {
        word.buffer.copy(buf, offset, 0);
        offset += word.buffer.length;
      } else if (word.bytes === 'float') {
        buf.writeFloatLE(word.value, offset);
        offset += 4;
      } else {
        var big = word.endian === 'big';
        var ix = big ? [(word.bytes - 1) * 8, -8] : [0, 8];

        for (var i = ix[0]; big ? i >= 0 : i < word.bytes * 8; i += ix[1]) {
          if (i >= 32) {
            buf[offset++] = Math.floor(word.value / Math.pow(2, i)) & 0xff;
          } else {
            buf[offset++] = (word.value >> i) & 0xff;
          }
        }
      }
    });
    return buf;
  };

  this.write = function (stream) {
    stream.write(this.buffer());
  };
}
