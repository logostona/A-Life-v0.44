/**
 * Polyfill for `window.storage`, the key/value API available inside Claude
 * artifacts. Outside that runtime (a normal browser / installed PWA) this
 * API does not exist, so life-sim.jsx's saveGame/loadGame/wipeGame would
 * silently fail every time and progress would never persist.
 *
 * This shim reproduces the same async shape using localStorage, namespaced
 * so it won't collide with anything else on the page.
 */
(function () {
  if (window.storage) return; // already provided by the host runtime, don't override

  var NS = "lifesim_storage:";

  function k(key, shared) {
    return NS + (shared ? "shared:" : "local:") + key;
  }

  window.storage = {
    get: function (key, shared) {
      return Promise.resolve().then(function () {
        var raw = localStorage.getItem(k(key, shared));
        if (raw === null) return null;
        return { key: key, value: raw, shared: !!shared };
      });
    },
    set: function (key, value, shared) {
      return Promise.resolve().then(function () {
        localStorage.setItem(k(key, shared), value);
        return { key: key, value: value, shared: !!shared };
      });
    },
    delete: function (key, shared) {
      return Promise.resolve().then(function () {
        var existed = localStorage.getItem(k(key, shared)) !== null;
        localStorage.removeItem(k(key, shared));
        return { key: key, deleted: existed, shared: !!shared };
      });
    },
    list: function (prefix, shared) {
      return Promise.resolve().then(function () {
        var full = NS + (shared ? "shared:" : "local:") + (prefix || "");
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
          var lk = localStorage.key(i);
          if (lk && lk.indexOf(full) === 0) {
            keys.push(lk.slice((NS + (shared ? "shared:" : "local:")).length));
          }
        }
        return { keys: keys, prefix: prefix, shared: !!shared };
      });
    },
  };
})();
