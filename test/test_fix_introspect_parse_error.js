const introspect = require('../lib/introspect');
const assert = require('assert');

// Regression: processXML threw "No root XML node" inside the xml2js parse
// callback. Throwing escaped past the caller's err-first callback
// contract and would surface as an uncaught exception. The fix uses
// `return callback(new Error(...))` like the surrounding code.

describe('introspect parse errors propagate via callback', function () {
  it('reports missing root <node> via callback (does not throw)', function (done) {
    var xml = '<other/>';
    introspect.processXML(null, xml, { name: '/' }, function (err) {
      try {
        assert.ok(err instanceof Error);
        assert.ok(/No root XML node/.test(err.message));
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('reports xml2js parse failure via callback for malformed XML', function (done) {
    var xml = '<unclosed>';
    introspect.processXML(null, xml, { name: '/' }, function (err) {
      try {
        assert.ok(err instanceof Error);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
