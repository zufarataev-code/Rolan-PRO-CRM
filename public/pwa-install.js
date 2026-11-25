/*
 * Rolan PRO: install the CRM on a phone as an app.
 *
 * One script for both surfaces: the new interface (app/layout.tsx) and the
 * working CRM page /legacy-crm, which is served as its own HTML file and never
 * runs the Next.js layout. Before this file the working CRM page had no install
 * entry on a phone at all: its «Установить» button is hidden on narrow screens,
 * and the one-time dialog of the new interface never ran there.
 *
 * - registers the single service worker /sw.js (push handlers live there too);
 * - keeps Chrome's install prompt for the moment a person taps «Установить»;
 * - on a phone that has not installed the CRM, shows a small card with the right
 *   steps for that phone and browser; «Не сейчас» hides it for three days;
 * - window.RolanProInstall.open() opens the same steps from any menu.
 *
 * Nothing here reads or stores CRM data.
 */
(function () {
  "use strict";

  if (window.RolanProInstall) return;

  var DISMISSED_AT = "rolanpro:pwa-install-dismissed-at";
  var HIDE_FOR_MS = 3 * 24 * 60 * 60 * 1000;
  // Staff screens only: a client opening a proposal link must never see this.
  var STAFF_PATHS = /^\/(login|crm|legacy-crm|field|notifications|team|mail|change-password)(\/|$)/;

  var deferredPrompt = null;
  var root = null;

  function ua() {
    return navigator.userAgent || "";
  }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (error) {
      // Old browsers: fall through to the iPhone flag.
    }
    return navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /android/i.test(ua());
  }

  function isPhone() {
    if (isIos() || isAndroid()) return true;
    try {
      return window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches;
    } catch (error) {
      return false;
    }
  }

  // Links opened from Telegram, WhatsApp, Instagram or Facebook open inside
  // that app's own viewer, which cannot add anything to the home screen.
  function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|Telegram|WhatsApp|Line\/|MicroMessenger|Snapchat|; wv\)/i.test(ua());
  }

  function isIosSafari() {
    return isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//i.test(ua()) && !isInAppBrowser();
  }

  function isTopWindow() {
    try {
      return window.self === window.top;
    } catch (error) {
      return false;
    }
  }

  function recentlyDismissed() {
    try {
      var at = Number(window.localStorage.getItem(DISMISSED_AT) || 0);
      return at > 0 && Date.now() - at < HIDE_FOR_MS;
    } catch (error) {
      return false;
    }
  }

  function rememberDismissed() {
    try {
      window.localStorage.setItem(DISMISSED_AT, String(Date.now()));
    } catch (error) {
      // Private mode: the card simply shows again next time.
    }
  }

  function el(tag, style, text) {
    var node = document.createElement(tag);
    if (style) node.setAttribute("style", style);
    if (text) node.textContent = text;
    return node;
  }

  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  var BTN_PRIMARY =
    "min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#16a34a;color:#fff;font:700 15px " + FONT + ";";
  var BTN_GHOST =
    "min-height:44px;padding:0 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font:600 15px " + FONT + ";";

  function close() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function dismiss() {
    rememberDismissed();
    close();
  }

  /** The steps for this phone and browser, as short numbered lines. */
  function steps() {
    if (isIos()) {
      if (isInAppBrowser()) {
        return {
          lead: "Эта ссылка открыта внутри другого приложения. Установить CRM отсюда нельзя.",
          lines: ["Нажмите «Скопировать ссылку».", "Откройте Safari и вставьте ссылку.", "В Safari: «Поделиться» → «На экран Домой» → «Добавить»."],
          copy: true,
        };
      }
      if (!isIosSafari()) {
        return {
          lead: "На iPhone CRM ставится из Safari.",
          lines: ["Нажмите «Скопировать ссылку» и откройте её в Safari.", "В Safari: «Поделиться» (квадрат со стрелкой) → «На экран Домой» → «Добавить»."],
          copy: true,
        };
      }
      return {
        lead: "Три касания, и CRM будет на экране как приложение.",
        lines: ["Внизу экрана нажмите «Поделиться» (квадрат со стрелкой вверх).", "Прокрутите вниз и выберите «На экран Домой».", "Нажмите «Добавить»."],
        copy: false,
      };
    }
    if (isInAppBrowser()) {
      return {
        lead: "Эта ссылка открыта внутри другого приложения. Установить CRM отсюда нельзя.",
        lines: ["Нажмите ⋮ в углу и выберите «Открыть в браузере» (Chrome).", "Или скопируйте ссылку и вставьте её в Chrome."],
        copy: true,
      };
    }
    return {
      lead: "Установка через меню браузера.",
      lines: ["Нажмите ⋮ в правом верхнем углу Chrome.", "Выберите «Установить приложение» или «Добавить на главный экран».", "Подтвердите «Установить»."],
      copy: false,
    };
  }

  function copyLink(button) {
    var link = location.origin + "/login";
    var done = function () {
      button.textContent = "Ссылка скопирована";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, function () {
        window.prompt("Скопируйте ссылку:", link);
      });
    } else {
      window.prompt("Скопируйте ссылку:", link);
    }
  }

  function card(content) {
    close();
    root = el(
      "div",
      "position:fixed;left:12px;right:12px;bottom:calc(112px + env(safe-area-inset-bottom, 0px));z-index:2147483640;" +
        "display:flex;justify-content:center;pointer-events:none;",
    );
    root.setAttribute("data-rolanpro-install", "");
    var box = el(
      "section",
      "pointer-events:auto;width:min(440px,100%);box-sizing:border-box;border-radius:16px;background:#fff;color:#0f172a;" +
        "padding:16px;box-shadow:0 18px 50px rgba(15,23,42,.30);border:1px solid #e2e8f0;font:15px/1.45 " + FONT + ";",
    );
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Установка Rolan PRO");
    content(box);
    root.appendChild(box);
    document.body.appendChild(root);
  }

  function header(box, title) {
    var row = el("div", "display:flex;align-items:center;gap:12px;");
    var icon = el("img", "width:44px;height:44px;border-radius:10px;flex:none;");
    icon.src = "/icon-192.png";
    icon.alt = "";
    row.appendChild(icon);
    row.appendChild(el("div", "font-weight:800;font-size:17px;", title));
    box.appendChild(row);
  }

  function showSteps() {
    var plan = steps();
    card(function (box) {
      header(box, "Установить Rolan PRO");
      box.appendChild(el("p", "margin:10px 0 6px;color:#475569;", plan.lead));
      var list = el("ol", "margin:0;padding-left:22px;");
      plan.lines.forEach(function (line) {
        list.appendChild(el("li", "margin:4px 0;", line));
      });
      box.appendChild(list);
      var actions = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;");
      if (plan.copy) {
        var copy = el("button", BTN_PRIMARY, "Скопировать ссылку");
        copy.type = "button";
        copy.onclick = function () {
          copyLink(copy);
        };
        actions.appendChild(copy);
      }
      var ok = el("button", BTN_GHOST, "Понятно");
      ok.type = "button";
      ok.onclick = dismiss;
      actions.appendChild(ok);
      box.appendChild(actions);
    });
  }

  function open() {
    if (isStandalone()) {
      card(function (box) {
        header(box, "CRM уже установлена");
        box.appendChild(el("p", "margin:10px 0 0;color:#475569;", "Вы работаете в приложении Rolan PRO."));
        var ok = el("button", BTN_GHOST + "margin-top:12px;", "Понятно");
        ok.type = "button";
        ok.onclick = close;
        box.appendChild(ok);
      });
      return;
    }
    if (deferredPrompt) {
      var prompt = deferredPrompt;
      deferredPrompt = null;
      close();
      prompt.prompt();
      prompt.userChoice
        .then(function (choice) {
          if (!choice || choice.outcome !== "accepted") rememberDismissed();
        })
        .catch(function () {});
      return;
    }
    showSteps();
  }

  function offer() {
    card(function (box) {
      header(box, "Rolan PRO на экран телефона");
      box.appendChild(
        el("p", "margin:8px 0 0;color:#475569;", "Откроется без браузера, как приложение. Так приходят и уведомления о новых заказах."),
      );
      var actions = el("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;");
      var yes = el("button", BTN_PRIMARY, "Установить");
      yes.type = "button";
      yes.onclick = open;
      var later = el("button", BTN_GHOST, "Не сейчас");
      later.type = "button";
      later.onclick = dismiss;
      actions.appendChild(yes);
      actions.appendChild(later);
      box.appendChild(actions);
    });
  }

  function shouldOffer() {
    // The sign-in screen has its own «Установить на телефон» link, so the card
    // never covers the «Войти» button.
    if (/^\/login(\/|$)/.test(location.pathname)) return false;
    return isTopWindow() && isPhone() && !isStandalone() && STAFF_PATHS.test(location.pathname) && !recentlyDismissed();
  }

  function start() {
    if (shouldOffer() && !root) offer();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
      return null;
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    close();
  });

  window.RolanProInstall = {
    open: open,
    isInstalled: isStandalone,
    canOffer: function () {
      return !isStandalone();
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
