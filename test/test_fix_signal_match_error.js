const introspect = require('../lib/introspect');
const constants = require('../lib/constants');
const EventEmitter = require('events').EventEmitter;
const assert = require('assert');

// Regression: a refused AddMatch/RemoveMatch threw from inside the reply
// callback, which runs from the connection's 'message' listener, so it escaped
// as an uncaughtException and took the host process down. A caller cannot catch
// it - HAP-NodeJS wraps its .on("StateChanged", ...) in try/catch precisely to
// survive a machine where the dbus match cannot be installed (HAP-NodeJS#993),
// and the throw defeated that guard entirely.

const INTROSPECTION =
  '<node>' +
  '<interface name="org.freedesktop.Avahi.Server">' +
  '<method name="GetVersionString"><arg direction="out" type="s"/></method>' +
  '</interface>' +
  '</node>';

function makeStack(attachErrorListener) {
  var conn = new EventEmitter();
  conn.outbox = [];
  conn.message = function (msg) {
    conn.outbox.push(msg);
  };

  var seen = [];
  if (attachErrorListener) {
    conn.on('error', function (err) {
      seen.push(err);
    });
  }

  // A minimal bus stand-in: introspect only needs invoke, addMatch/removeMatch,
  // mangle, signals and connection. Using the real bus here would also fire
  // Hello, which is a separate path with its own test.
  var bus = {
    connection: conn,
    signals: new EventEmitter(),
    serial: 1,
    matchError: null,
    invoke: function (msg, callback) {
      conn.outbox.push(msg);
      callback(null, INTROSPECTION);
    },
    mangle: function (path, iface, member) {
      return JSON.stringify({ path: path, interface: iface, member: member });
    },
    addMatch: function (match, callback) {
      callback(bus.matchError);
    },
    removeMatch: function (match, callback) {
      callback(bus.matchError);
    }
  };

  var obj = { name: '/', service: { name: 'org.freedesktop.Avahi', bus: bus } };
  return { bus: bus, conn: conn, obj: obj, seen: seen };
}

function getInterface(stack, callback) {
  introspect.processXML(null, INTROSPECTION, stack.obj, function (err, proxy) {
    assert.ifError(err);
    callback(proxy['org.freedesktop.Avahi.Server']);
  });
}

describe('signal subscription reports a refused match instead of throwing', function () {
  it('reports the AddMatch failure on the connection', function (done) {
    var stack = makeStack(true);
    stack.bus.matchError = {
      name: 'org.freedesktop.DBus.Error.AccessDenied',
      message: 'match rule refused'
    };

    getInterface(stack, function (iface) {
      assert.doesNotThrow(function () {
        iface.on('StateChanged', function () {
          assert.fail('the handler must not be registered when AddMatch failed');
        });
      });

      assert.equal(stack.seen.length, 1);
      assert.ok(stack.seen[0].message.includes('AccessDenied'));

      // no handler registered, so a signal arriving anyway is a no-op
      var name = stack.bus.mangle(
        '/',
        'org.freedesktop.Avahi.Server',
        'StateChanged'
      );
      assert.equal(stack.bus.signals.listenerCount(name), 0);
      done();
    });
  });

  it('warns about the AddMatch failure when nothing listens', function (done) {
    var stack = makeStack(false);
    stack.bus.matchError = { name: 'x.Failed', message: 'nope' };

    getInterface(stack, function (iface) {
      var warnings = [];
      var originalWarn = console.warn;
      console.warn = function (message) {
        warnings.push(message);
      };

      try {
        assert.doesNotThrow(function () {
          iface.on('StateChanged', function () {});
        });
      } finally {
        console.warn = originalWarn;
      }

      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes('nope'));
      done();
    });
  });

  it('reports a RemoveMatch failure on teardown instead of throwing', function (done) {
    var stack = makeStack(true);

    getInterface(stack, function (iface) {
      var handler = function () {};

      stack.bus.matchError = null;
      iface.on('StateChanged', handler);
      var name = stack.bus.mangle(
        '/',
        'org.freedesktop.Avahi.Server',
        'StateChanged'
      );
      assert.equal(stack.bus.signals.listenerCount(name), 1, 'precondition');

      // avahi-daemon has gone away by the time we tear down
      stack.bus.matchError = { name: 'x.Failed', message: 'bus gone' };
      assert.doesNotThrow(function () {
        iface.off('StateChanged', handler);
      });

      assert.equal(stack.seen.length, 1);
      assert.ok(stack.seen[0].message.includes('bus gone'));
      done();
    });
  });

  it('still registers the handler when the match is accepted', function (done) {
    var stack = makeStack(true);
    stack.bus.matchError = null;

    getInterface(stack, function (iface) {
      var calls = [];
      iface.on('StateChanged', function (state) {
        calls.push(state);
      });

      var name = stack.bus.mangle(
        '/',
        'org.freedesktop.Avahi.Server',
        'StateChanged'
      );
      stack.bus.signals.emit(name, [constants.messageType.signal]);

      assert.equal(calls.length, 1);
      assert.equal(stack.seen.length, 0);
      done();
    });
  });
});

describe('unsubscribing after a refused match does not ask dbus to undo it', function () {
  it('sends no RemoveMatch when AddMatch was refused', function (done) {
    var stack = makeStack(true);
    stack.bus.matchError = {
      name: 'org.freedesktop.DBus.Error.AccessDenied',
      message: 'match rule refused'
    };

    var removeMatchCalls = [];
    stack.bus.removeMatch = function (match, callback) {
      removeMatchCalls.push(match);
      callback(stack.bus.matchError);
    };

    getInterface(stack, function (iface) {
      var callback = function () {};

      // AddMatch is refused, so nothing is registered
      iface.on('StateChanged', callback);

      // The teardown path a caller runs anyway. Before the guard this sent a
      // RemoveMatch for a rule that was never installed, and dbus answered
      // MatchRuleNotFound - a second error caused entirely by the first.
      assert.doesNotThrow(function () {
        iface.off('StateChanged', callback);
      });

      assert.deepEqual(removeMatchCalls, []);
      done();
    });
  });

  it('sends no RemoveMatch for a callback that was never added', function (done) {
    var stack = makeStack(true);

    var removeMatchCalls = [];
    stack.bus.removeMatch = function (match, callback) {
      removeMatchCalls.push(match);
      callback(null);
    };

    getInterface(stack, function (iface) {
      iface.off('StateChanged', function () {});

      assert.deepEqual(removeMatchCalls, []);
      // and the unknown callback did not get a wrapper made for it on the way past
      assert.equal(iface.$callbacks.length, 0);
      assert.equal(iface.$sigHandlers.length, 0);
      done();
    });
  });

  it('still withdraws the match when the listener was registered', function (done) {
    var stack = makeStack(true);

    var removeMatchCalls = [];
    stack.bus.removeMatch = function (match, callback) {
      removeMatchCalls.push(match);
      callback(null);
    };

    getInterface(stack, function (iface) {
      var callback = function () {};

      iface.on('StateChanged', callback);
      iface.off('StateChanged', callback);

      assert.equal(removeMatchCalls.length, 1);
      done();
    });
  });
});

