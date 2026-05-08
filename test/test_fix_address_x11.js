const addressX11 = require('../lib/address-x11');
const assert = require('assert');

// Regression: lib/address-x11.js had `const x11 = require('x11')` at the
// top level but `x11` is not in the package's dependencies. Importing the
// module always threw "Cannot find module 'x11'". The fix lazy-loads x11
// and surfaces a clear, actionable error if it's not installed.

describe('address-x11 lazy-loads the optional x11 peer', function () {
  it('module loads at require time without throwing', function () {
    // If require threw, this test file would never have been loaded.
    assert.equal(typeof addressX11, 'function');
  });

  it('callback receives a clear "install x11" Error when x11 is not installed', function (done) {
    addressX11(function (err) {
      try {
        assert.ok(err instanceof Error, 'expected Error, got: ' + err);
        assert.ok(
          /x11/i.test(err.message),
          'message should mention x11: ' + err.message
        );
        assert.ok(
          /npm install/i.test(err.message),
          'message should suggest npm install: ' + err.message
        );
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
