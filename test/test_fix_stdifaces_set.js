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
    errors: [],
    sendError: function (msg, name, text) {
      this.errors.push({ name: name, text: text });
    }
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

  it('replies with InvalidArgs and does not throw when variant is malformed', function () {
    var malformed = [
      { body: ['com.example.Iface', 'MyProp'] }, // missing variant entirely
      { body: ['com.example.Iface', 'MyProp', null] },
      { body: ['com.example.Iface', 'MyProp', []] }, // empty variant
      { body: ['com.example.Iface', 'MyProp', [[{ type: 's', child: [] }]]] }, // variant missing value array
      { body: ['com.example.Iface', 'MyProp', [[{ type: 's', child: [] }], []]] } // empty value array
    ];
    malformed.forEach(function (partial) {
      var impl = { MyProp: 'untouched' };
      var b = makeBus(impl);
      var msg = {
        type: constants.messageType.methodCall,
        interface: 'org.freedesktop.DBus.Properties',
        member: 'Set',
        path: '/com/example',
        serial: 1,
        sender: ':1.0',
        body: partial.body
      };
      assert.doesNotThrow(function () {
        stdifaces(msg, b);
      });
      assert.equal(impl.MyProp, 'untouched');
      assert.equal(b.errors.length, 1);
      assert.equal(b.errors[0].name, 'org.freedesktop.DBus.Error.InvalidArgs');
    });
  });
});
