const introspect = require('../lib/introspect');
const fs = require('fs');
const path = require('path');

// Introspection test cases
var testCases = [
  { desc: 'Basic Example', file: 'example' },
  { desc: 'Interface with sub-nodes', file: 'with-subnodes' }
];

describe('given introspect xml', function () {
  testCases.forEach(function (curTest) {
    it('should correctly process ' + curTest.desc, function () {
      return testXml(curTest.file);
    });
  });
});

const dummyObj = {};
function testXml(fname) {
  var fpath = path.join(__dirname, 'fixtures', 'introspection', fname);
  return new Promise((resolve, reject) => {
    // get expected data from json file
    fs.readFile(fpath + '.json', 'utf8', function (err, data) {
      if (err) reject(err);
      var test_obj = JSON.parse(data);
      // get introspect xml from xml file
      fs.readFile(fpath + '.xml', function (err, xml_data) {
        if (err) reject(err);
        else {
          introspect.processXML(
            err,
            xml_data,
            dummyObj,
            function (err, proxy, nodes) {
              if (err) reject(err);
              else {
                checkIntrospection(test_obj, proxy, nodes);
                resolve();
              }
            }
          );
        }
      });
    });
  });
}

function checkIntrospection(test_obj, proxy, nodes) {
  if (test_obj.nodes) {
    if (!Array.isArray(nodes))
      throw new Error('Expected nodes array, got ' + typeof nodes);
    if (nodes.length !== test_obj.nodes.length)
      throw new Error(
        'Expected ' +
          test_obj.nodes.length +
          ' sub-nodes, got ' +
          nodes.length +
          ' (' +
          JSON.stringify(nodes) +
          ')'
      );
    for (var n = 0; n < test_obj.nodes.length; ++n) {
      if (nodes.indexOf(test_obj.nodes[n]) === -1)
        throw new Error('Missing sub-node: ' + test_obj.nodes[n]);
    }
  }
  for (var i = 0; i < test_obj.interfaces.length; ++i) {
    var testInterface = test_obj.interfaces[i];
    if (proxy[testInterface.name] === undefined)
      throw new Error(
        'Failed to introspect interface name ' + testInterface.name
      );
    for (var m = 0; m < testInterface.methods.length; ++m) {
      var methodName = testInterface.methods[m].name;
      var curMethod = proxy[testInterface.name].$methods[methodName];
      if (curMethod === undefined)
        throw new Error(
          'Failed to introspect method name ' +
            methodName +
            ' of ' +
            testInterface.name
        );
      if (curMethod !== testInterface.methods[m].signature)
        throw new Error(
          'Failed to introspect method args of ' +
            methodName +
            ' of ' +
            testInterface.name
        );
    }
    for (var p = 0; p < testInterface.properties.length; ++p) {
      var propName = testInterface.properties[p].name;
      var curProp = proxy[testInterface.name].$properties[propName];
      if (curProp === undefined)
        throw new Error(
          'Failed to introspect property name ' +
            propName +
            ' of ' +
            testInterface.name
        );
      if (curProp.type !== testInterface.properties[p].type)
        throw new Error(
          'Failed to introspect property type of ' +
            propName +
            ' of ' +
            testInterface.name
        );
    }
  }
}
