const stdifaces = require('../lib/stdifaces');
const constants = require('../lib/constants');
const assert = require('assert');

// Regression: the Set branch of org.freedesktop.DBus.Properties hard-coded
// `impl[propertyName] = 1234` and ignored the variant the caller sent.
// The fix extracts the value from msg.body[2] = [parsedSignatureTree, [value]].

function makeBus(impl) {
  return {
    serial: 1,
    exportedObjects: {
      '/com/example': {
        'com.example.Iface': [
          { name: 'com.example.Iface', properties: { MyProp: 's' } },
          impl
        ]
      }
    },
    connection: {
      outbox: [],
      message: function (m) {
        this.outbox.push(m);
      }
    },
    sendError: function () {}
  };
}

function setMsg(value) {
  return {
    type: constants.messageType.methodCall,
    interface: 'org.freedesktop.DBus.Properties',
    member: 'Set',
    path: '/com/example',
    serial: 1,
    sender: ':1.0',
    body: ['com.example.Iface', 'MyProp', [[{ type: 's', child: [] }], [value]]]
  };
}

describe('stdifaces Properties.Set writes caller-supplied value', function () {
  it('assigns the variant value to the impl property', function () {
    var impl = { MyProp: 'initial' };
    stdifaces(setMsg('newvalue'), makeBus(impl));
    assert.equal(impl.MyProp, 'newvalue');
  });

  it('does not write the regression sentinel 1234', function () {
    var impl = { MyProp: 'initial' };
    stdifaces(setMsg('hello-world'), makeBus(impl));
    assert.notStrictEqual(impl.MyProp, 1234);
    assert.equal(impl.MyProp, 'hello-world');
  });
});
