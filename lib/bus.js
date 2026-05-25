const EventEmitter = require('events').EventEmitter;
const constants = require('./constants');
const stdDbusIfaces = require('./stdifaces');
const introspect = require('./introspect').introspectBus;

module.exports = function bus(conn, opts) {
  if (!(this instanceof bus)) {
    return new bus(conn, opts);
  }
  if (!opts) opts = {};

  var self = this;
  this.connection = conn;
  this.serial = 1;
  this.cookies = {}; // TODO: rename to methodReturnHandlers
  this.methodCallHandlers = {};
  this.signals = new EventEmitter();
  this.exportedObjects = Object.create(null);

  this.invoke = function (msg, callback) {
    if (!msg.type) msg.type = constants.messageType.methodCall;
    msg.serial = self.serial++;
    this.cookies[msg.serial] = callback;
    self.connection.message(msg);
  };

  this.invokeDbus = function (msg, callback) {
    if (!msg.path) msg.path = '/org/freedesktop/DBus';
    if (!msg.destination) msg.destination = 'org.freedesktop.DBus';
    if (!msg['interface']) msg['interface'] = 'org.freedesktop.DBus';
    self.invoke(msg, callback);
  };

  this.mangle = function (path, iface, member) {
    var obj = {};
    if (typeof path === 'object') {
      // handle one argumant case mangle(msg)
      obj.path = path.path;
      obj['interface'] = path['interface'];
      obj.member = path.member;
    } else {
      obj.path = path;
      obj['interface'] = iface;
      obj.member = member;
    }
    return JSON.stringify(obj);
  };

  this.sendSignal = function (path, iface, name, signature, args) {
    var signalMsg = {
      type: constants.messageType.signal,
      serial: self.serial++,
      interface: iface,
      path: path,
      member: name
    };
    if (signature) {
      signalMsg.signature = signature;
      signalMsg.body = args;
    }
    self.connection.message(signalMsg);
  };

  // Warning: errorName must respect the same rules as interface names (must contain a dot)
  this.sendError = function (msg, errorName, errorText) {
    var reply = {
      type: constants.messageType.error,
      serial: self.serial++,
      replySerial: msg.serial,
      destination: msg.sender,
      errorName: errorName,
      signature: 's',
      body: [errorText]
    };
    this.connection.message(reply);
  };

  this.sendReply = function (msg, signature, body) {
    var reply = {
      type: constants.messageType.methodReturn,
      serial: self.serial++,
      replySerial: msg.serial,
      destination: msg.sender,
      signature: signature,
      body: body
    };
    this.connection.message(reply);
  };

  // route reply/error
  this.connection.on('message', function (msg) {
    function invoke(impl, func, resultSignature) {
      Promise.resolve()
        .then(function () {
          return func.apply(impl, (msg.body || []).concat(msg));
        })
        .then(
          function (methodReturnResult) {
            // a returned Error instance is treated as a DBus error reply
            // (matches examples/return-types.js documented usage)
            if (methodReturnResult instanceof Error) {
              return self.sendError(
                msg,
                methodReturnResult.dbusName ||
                  'org.freedesktop.DBus.Error.Failed',
                methodReturnResult.message || ''
              );
            }
            var methodReturnReply = {
              type: constants.messageType.methodReturn,
              serial: self.serial++,
              destination: msg.sender,
              replySerial: msg.serial
            };
            if (
              resultSignature &&
              methodReturnResult !== undefined &&
              methodReturnResult !== null
            ) {
              methodReturnReply.signature = resultSignature;
              methodReturnReply.body = [methodReturnResult];
            }
            try {
              self.connection.message(methodReturnReply);
            } catch (e) {
              self.sendError(
                msg,
                e.dbusName || 'org.freedesktop.DBus.Error.Failed',
                e.message || ''
              );
            }
          },
          function (e) {
            self.sendError(
              msg,
              e.dbusName || 'org.freedesktop.DBus.Error.Failed',
              e.message || ''
            );
          }
        );
    }

    var handler;
    if (
      msg.type === constants.messageType.methodReturn ||
      msg.type === constants.messageType.error
    ) {
      handler = self.cookies[msg.replySerial];
      if (handler) {
        delete self.cookies[msg.replySerial];
        var props = {
          connection: self.connection,
          bus: self,
          message: msg,
          signature: msg.signature
        };
        var args = msg.body || [];
        if (msg.type === constants.messageType.methodReturn) {
          args = [null].concat(args); // first argument - no errors, null
          handler.apply(props, args); // body as array of arguments
        } else {
          // err.message is conventionally a string; full body is exposed via err.body
          handler.call(props, {
            name: msg.errorName,
            message: typeof args[0] === 'string' ? args[0] : '',
            body: args
          });
        }
      }
    } else if (msg.type === constants.messageType.signal) {
      self.signals.emit(self.mangle(msg), msg.body, msg.signature);
    } else {
      // methodCall

      if (stdDbusIfaces(msg, self)) return;

      // exported interfaces handlers
      var obj, iface, impl;
      if ((obj = self.exportedObjects[msg.path])) {
        if ((iface = obj[msg['interface']])) {
          // now we are ready to serve msg.member
          impl = iface[1];
          var func = impl[msg.member];
          if (!func) {
            self.sendError(
              msg,
              'org.freedesktop.DBus.Error.UnknownMethod',
              `Method "${msg.member}" on interface "${msg.interface}" doesn't exist`
            );
            return;
          }
          // TODO safety check here
          var resultSignature = iface[0].methods[msg.member][1];
          invoke(impl, func, resultSignature);
          return;
        } else {
          self.sendError(
            msg,
            'org.freedesktop.DBus.Error.UnknownInterface',
            `Interface "${msg['interface']}" on object "${msg.path}" doesn't exist`
          );
          return;
        }
      }
      // setMethodCall handlers
      handler = self.methodCallHandlers[self.mangle(msg)];
      if (handler) {
        invoke(null, handler[0], handler[1]);
      } else {
        self.sendError(
          msg,
          'org.freedesktop.DBus.Error.UnknownService',
          'Uh oh oh'
        );
      }
    }
  });

  this.setMethodCallHandler = function (objectPath, iface, member, handler) {
    var key = self.mangle(objectPath, iface, member);
    self.methodCallHandlers[key] = handler;
  };

  this.exportInterface = function (obj, path, iface) {
    var entry;
    if (!self.exportedObjects[path]) {
      entry = self.exportedObjects[path] = Object.create(null);
    } else {
      entry = self.exportedObjects[path];
    }
    entry[iface.name] = [iface, obj];

    // monkey-patch obj.emit() so emitted events are also sent as DBus signals.
    // Multiple exportInterface calls on the same `obj` share a single wrapper;
    // we accumulate (iface, path) pairs on an internal list so the wrapper
    // dispatches the signal to every registered interface that declares it.
    if (typeof obj.emit === 'function') {
      if (!obj.__dbusInterfaces) {
        obj.__dbusInterfaces = [];
        var oldEmit = obj.emit;
        obj.emit = function () {
          var args = Array.prototype.slice.apply(arguments);
          var signalName = args[0];
          if (!signalName) throw new Error('Trying to emit undefined signal');

          for (var i = 0; i < obj.__dbusInterfaces.length; i++) {
            var entry = obj.__dbusInterfaces[i];
            var entryIface = entry.iface;
            if (entryIface.signals && entryIface.signals[signalName]) {
              var signal = entryIface.signals[signalName];
              var signalMsg = {
                type: constants.messageType.signal,
                serial: self.serial++,
                interface: entryIface.name,
                path: entry.path,
                member: signalName
              };
              if (signal[0]) {
                signalMsg.signature = signal[0];
                signalMsg.body = args.slice(1);
              }
              self.connection.message(signalMsg);
            }
          }
          // note that local emit is likely to be called before signal arrives
          // to remote subscriber
          oldEmit.apply(obj, args);
        };
      }
      // Replace any existing entry with the same (iface.name, path) pair so
      // that re-exporting an object with an updated iface descriptor doesn't
      // dispatch duplicate signals from a stale entry.
      var existingIdx = -1;
      for (var j = 0; j < obj.__dbusInterfaces.length; j++) {
        var registered = obj.__dbusInterfaces[j];
        if (registered.path === path && registered.iface.name === iface.name) {
          existingIdx = j;
          break;
        }
      }
      if (existingIdx >= 0) {
        obj.__dbusInterfaces[existingIdx] = { iface: iface, path: path };
      } else {
        obj.__dbusInterfaces.push({ iface: iface, path: path });
      }
    }
    // TODO: emit ObjectManager's InterfaceAdded
  };

  // register name
  if (opts.direct !== true) {
    this.invokeDbus({ member: 'Hello' }, function (err, name) {
      if (err)
        throw new Error((err.name || 'Error') + ': ' + (err.message || err));
      self.name = name;
    });
  } else {
    self.name = null;
  }

  function DBusObject(name, service) {
    this.name = name;
    this.service = service;
    this.as = function (name) {
      return this.proxy[name];
    };
  }

  function DBusService(name, bus) {
    this.name = name;
    this.bus = bus;
    this.getObject = function (name, callback) {
      if (name === undefined)
        return callback(new Error('Object name is null or undefined'));
      var obj = new DBusObject(name, this);
      introspect(obj, function (err, ifaces, nodes) {
        if (err) return callback(err);
        obj.proxy = ifaces;
        obj.nodes = nodes;
        callback(null, obj);
      });
    };

    this.getInterface = function (objName, ifaceName, callback) {
      this.getObject(objName, function (err, obj) {
        if (err) return callback(err);
        callback(null, obj.as(ifaceName));
      });
    };
  }

  this.getService = function (name) {
    return new DBusService(name, this);
  };

  this.getObject = function (path, name, callback) {
    var service = this.getService(path);
    return service.getObject(name, callback);
  };

  this.getInterface = function (path, objname, name, callback) {
    return this.getObject(path, objname, function (err, obj) {
      if (err) return callback(err);
      callback(null, obj.as(name));
    });
  };

  // TODO: refactor

  // bus meta functions
  this.addMatch = function (match, callback) {
    this.invokeDbus(
      { member: 'AddMatch', signature: 's', body: [match] },
      callback
    );
  };

  this.removeMatch = function (match, callback) {
    this.invokeDbus(
      { member: 'RemoveMatch', signature: 's', body: [match] },
      callback
    );
  };

  this.getId = function (callback) {
    this.invokeDbus({ member: 'GetId' }, callback);
  };

  this.requestName = function (name, flags, callback) {
    this.invokeDbus(
      { member: 'RequestName', signature: 'su', body: [name, flags] },
      function (err, name) {
        if (callback) callback(err, name);
      }
    );
  };

  this.releaseName = function (name, callback) {
    this.invokeDbus(
      { member: 'ReleaseName', signature: 's', body: [name] },
      callback
    );
  };

  this.listNames = function (callback) {
    this.invokeDbus({ member: 'ListNames' }, callback);
  };

  this.listActivatableNames = function (callback) {
    this.invokeDbus({ member: 'ListActivatableNames' }, callback);
  };

  this.updateActivationEnvironment = function (env, callback) {
    this.invokeDbus(
      {
        member: 'UpdateActivationEnvironment',
        signature: 'a{ss}',
        body: [env]
      },
      callback
    );
  };

  this.startServiceByName = function (name, flags, callback) {
    this.invokeDbus(
      { member: 'StartServiceByName', signature: 'su', body: [name, flags] },
      callback
    );
  };

  this.getConnectionUnixUser = function (name, callback) {
    this.invokeDbus(
      { member: 'GetConnectionUnixUser', signature: 's', body: [name] },
      callback
    );
  };

  this.getConnectionUnixProcessId = function (name, callback) {
    this.invokeDbus(
      { member: 'GetConnectionUnixProcessID', signature: 's', body: [name] },
      callback
    );
  };

  this.getNameOwner = function (name, callback) {
    this.invokeDbus(
      { member: 'GetNameOwner', signature: 's', body: [name] },
      callback
    );
  };

  this.nameHasOwner = function (name, callback) {
    this.invokeDbus(
      { member: 'NameHasOwner', signature: 's', body: [name] },
      callback
    );
  };
};
