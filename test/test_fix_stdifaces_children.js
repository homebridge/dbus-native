const stdifaces = require('../lib/stdifaces');
const constants = require('../lib/constants');
const assert = require('assert');

// Regression: the introspection handler iterated over exportedObjects
// with loop variable `path` but looked up bus.exportedObjects[msg.path]
// inside the loop, overwriting `nodes[msg.path]` every iteration. As a
// result, child sub-paths were never recorded in the introspection XML
// reply.

function makeBus(exportedObjects) {
  return {
    exportedObjects: exportedObjects,
    serial: 1,
    connection: {
      outbox: [],
      message: function (msg) {
        this.outbox.push(msg);
      }
    }
  };
}

function emptyIface(name) {
  return [{ name: name, methods: {}, signals: {}, properties: {} }, {}];
}

function introspectMsg(p) {
  return {
    type: constants.messageType.methodCall,
    interface: 'org.freedesktop.DBus.Introspectable',
    member: 'Introspect',
    path: p,
    serial: 7,
    sender: ':1.0'
  };
}

describe('stdifaces aggregates exported children', function () {
  it('lists all child sub-paths in introspection XML when both parent and children are exported', function () {
    var bus = makeBus({
      '/com/example': {
        'com.example.Parent': emptyIface('com.example.Parent')
      },
      '/com/example/alpha': {
        'com.example.Alpha': emptyIface('com.example.Alpha')
      },
      '/com/example/beta': {
        'com.example.Beta': emptyIface('com.example.Beta')
      },
      '/com/example/gamma': {
        'com.example.Gamma': emptyIface('com.example.Gamma')
      }
    });
    assert.equal(stdifaces(introspectMsg('/com/example'), bus), 1);
    var xml = bus.connection.outbox[0].body[0];
    assert.ok(/<node name="alpha"/.test(xml), 'alpha missing: ' + xml);
    assert.ok(/<node name="beta"/.test(xml), 'beta missing: ' + xml);
    assert.ok(/<node name="gamma"/.test(xml), 'gamma missing: ' + xml);
  });

  it('lists children even when parent path itself is not exported', function () {
    var bus = makeBus({
      '/com/example/one': { 'com.example.One': emptyIface('com.example.One') },
      '/com/example/two': { 'com.example.Two': emptyIface('com.example.Two') }
    });
    assert.equal(stdifaces(introspectMsg('/com/example'), bus), 1);
    var xml = bus.connection.outbox[0].body[0];
    assert.ok(/<node name="one"/.test(xml));
    assert.ok(/<node name="two"/.test(xml));
  });
});
