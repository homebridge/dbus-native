const introspect = require('../lib/introspect');
const assert = require('assert');

// Regression: processXML used `Object.assign(obj, {})` which writes into
// its first argument, so `subObj === obj`. The subsequent `subObj.name +=
// '/' + child` permanently mutated the caller's DBusObject path.

describe('introspect clones obj before sub-path recursion', function () {
  var savedIntrospectBus;
  beforeEach(function () {
    savedIntrospectBus = introspect.introspectBus;
  });
  afterEach(function () {
    introspect.introspectBus = savedIntrospectBus;
  });

  it('does not mutate caller-supplied obj.name', function (done) {
    introspect.introspectBus = function (subObj, cb) {
      cb(null, {}, []);
    };
    var obj = { name: '/com/example' };
    var xml = '<node><node name="child"/></node>';
    introspect.processXML(null, xml, obj, function () {
      try {
        assert.equal(obj.name, '/com/example', 'caller obj.name was mutated');
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('recurses with the child path appended on the cloned object', function (done) {
    var capturedName;
    introspect.introspectBus = function (subObj, cb) {
      capturedName = subObj.name;
      cb(null, {}, []);
    };
    var obj = { name: '/com/example' };
    var xml = '<node><node name="child"/></node>';
    introspect.processXML(null, xml, obj, function () {
      try {
        assert.equal(capturedName, '/com/example/child');
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
