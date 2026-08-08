/**
 * Report an error that arrived on a reply callback.
 *
 * Reply callbacks run from the connection's 'message' listener, so throwing from
 * one escapes as an uncaughtException and takes the host process down - and it
 * does so even when the caller wrapped its call in try/catch or await, because a
 * throw out of an emit() has already left the caller's stack.
 *
 * Consumers listen on the connection for 'error', so route it there when someone
 * is listening and warn otherwise. Emitting unconditionally would be no better
 * than throwing: Node rethrows an unhandled 'error' event.
 *
 * @param {EventEmitter} connection - the dbus connection
 * @param {object|Error} err - the error from the reply callback
 */
module.exports = function reportReplyError(connection, err) {
  var error =
    err instanceof Error
      ? err
      : new Error((err.name || 'Error') + ': ' + (err.message || err));

  if (connection && connection.listenerCount('error') > 0) {
    connection.emit('error', error);
  } else {
    console.warn('dbus-native: ' + error.message);
  }
};
