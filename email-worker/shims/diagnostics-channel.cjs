'use strict';

// Shim minimo de 'node:diagnostics_channel' (so existe a partir do Node 16+).
// O worker roda em Node 14, e o pino (dependencia do imapflow) usa essa API
// so para instrumentacao opcional - aqui ela vira no-op.

function channel() {
  return {
    hasSubscribers: false,
    publish() {},
    subscribe() {},
    unsubscribe() {},
    bindStore() {},
    unbindStore() {},
    runStores(_ctx, fn, thisArg, ...args) {
      return fn.apply(thisArg, args);
    }
  };
}

function tracingChannel(name) {
  const sync = (fn, _ctx, thisArg, ...args) => fn.apply(thisArg, args);
  return {
    start: channel(),
    end: channel(),
    asyncStart: channel(),
    asyncEnd: channel(),
    error: channel(),
    hasSubscribers: false,
    traceSync: sync,
    tracePromise: sync,
    traceCallback: sync
  };
}

class Channel {
  get hasSubscribers() { return false; }
  publish() {}
  subscribe() {}
  unsubscribe() {}
}

module.exports = { channel, tracingChannel, Channel };
