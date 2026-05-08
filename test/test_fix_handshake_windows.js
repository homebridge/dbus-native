const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Regression: the Windows-platform regex in lib/handshake.js used /$win/
// (end-of-string anchor before "win") so it could never match. Windows
// users always fell through to HOME, breaking DBUS_COOKIE_SHA1 cookie
// file lookup on Windows.

const handshakeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'handshake.js'),
  'utf8'
);

describe('handshake Windows platform regex', function () {
  it('uses /^win/ start anchor (regression: /$win/ never matched)', function () {
    assert.ok(
      /process\.platform\.match\(\/\^win\/\)/.test(handshakeSrc),
      'expected getUserHome to use /^win/ start anchor'
    );
    assert.ok(
      !/process\.platform\.match\(\/\$win\/\)/.test(handshakeSrc),
      'regression: /$win/ end anchor must not reappear'
    );
  });

  it('regex selects USERPROFILE on win32 and HOME elsewhere', function () {
    var pick = function (p) {
      return p.match(/^win/) ? 'USERPROFILE' : 'HOME';
    };
    assert.equal(pick('win32'), 'USERPROFILE');
    assert.equal(pick('linux'), 'HOME');
    assert.equal(pick('darwin'), 'HOME');
    assert.equal(pick('freebsd'), 'HOME');
  });
});
