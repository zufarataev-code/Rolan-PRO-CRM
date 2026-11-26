/*
 * RolanPRO phone pushes, shared by the old CRM page and the new interface.
 * window.RolanPush.status() → one of:
 *   "unavailable"  the server has no push keys yet
 *   "unsupported"  this browser cannot receive pushes
 *   "ios_install"  iPhone/iPad in Safari: add the CRM to the home screen first
 *   "denied"       the employee blocked notifications for the CRM
 *   "on" | "off"   this device receives pushes / does not yet
 * enable() must be called straight from a tap: browsers only ask then.
 */
(function () {
  if (window.RolanPush) return;

  var configPromise = null;

  function isIos() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }

  function supported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch("/api/v1/push", { cache: "no-store", credentials: "same-origin" })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (json) { return (json && json.data) || { enabled: false, public_key: null }; })
        .catch(function () { configPromise = null; return { enabled: false, public_key: null }; });
    }
    return configPromise;
  }

  function keyBytes(base64Url) {
    var base64 = (base64Url + "===".slice((base64Url.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function registration() {
    return navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function () {
      return navigator.serviceWorker.ready;
    });
  }

  function currentSubscription() {
    return registration().then(function (reg) { return reg.pushManager.getSubscription(); });
  }

  function send(method, body) {
    return fetch("/api/v1/push/subscriptions", {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      if (!response.ok) throw new Error("push_save_failed_" + response.status);
      return response.json();
    });
  }

  function status() {
    return loadConfig().then(function (config) {
      if (!config.enabled || !config.public_key) return "unavailable";
      if (!supported()) return isIos() && !isStandalone() ? "ios_install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      if (Notification.permission !== "granted") return "off";
      return currentSubscription().then(function (subscription) {
        if (!subscription) return "off";
        // Keep the server's copy fresh: the browser may have rotated it.
        send("POST", { subscription: subscription.toJSON() }).catch(function () {});
        return "on";
      });
    }).catch(function () { return "unsupported"; });
  }

  function enable() {
    if (!supported()) return Promise.resolve(isIos() && !isStandalone() ? "ios_install" : "unsupported");
    // Ask first, inside the tap, before anything that waits on the network.
    var permission = Notification.permission === "granted" ? Promise.resolve("granted") : Notification.requestPermission();
    return Promise.resolve(permission).then(function (answer) {
      if (answer !== "granted") return answer === "denied" ? "denied" : "off";
      return loadConfig().then(function (config) {
        if (!config.enabled || !config.public_key) return "unavailable";
        return registration().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (existing) {
            return existing || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.public_key) });
          });
        }).then(function (subscription) {
          return send("POST", { subscription: subscription.toJSON() }).then(function () { return "on"; });
        });
      });
    });
  }

  function disable() {
    if (!supported()) return Promise.resolve("off");
    return currentSubscription().then(function (subscription) {
      if (!subscription) return "off";
      var endpoint = subscription.endpoint;
      return subscription.unsubscribe().catch(function () { return false; }).then(function () {
        return send("DELETE", { endpoint: endpoint }).catch(function () { return null; });
      }).then(function () { return "off"; });
    });
  }

  function test() {
    return fetch("/api/v1/push/test", { method: "POST", credentials: "same-origin" }).then(function (response) {
      if (!response.ok) return false;
      return response.json().then(function (json) {
        return Boolean(json && json.data && json.data.sent > 0);
      });
    }).catch(function () { return false; });
  }

  window.RolanPush = { status: status, enable: enable, disable: disable, test: test };
})();
