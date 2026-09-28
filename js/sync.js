/* Какаториум — синхронизация без переписки кодами.
   Два способа:
   1) «Свой сервер» — GET/PUT JSON на свой адрес (в репозитории есть tools/server.py).
      Если сайт открыт с этого же сервера, способ включается сам — ничего вводить не нужно.
   2) «GitHub Gist» — общий gist работает как база: читается без токена, записывается по токену.
   Данные сливаются по id; удаления передаются через «надгробия» (Store.tombstones). */
(function (global) {
  'use strict';

  var CFG_KEY = 'kakatorium:sync';
  var DEVICE_KEY = 'kakatorium:device';
  var GIST_FILE = 'kakatorium.json';
  var GIST_API = 'https://api.github.com/gists';
  var DEFAULTS = { driver: 'off', url: '', token: '', gistId: '', interval: 60, lastSync: 0, error: '', syncedAt: 0, autoDisabled: false };

  var listeners = [];
  var remoteHandlers = [];
  var timer = null;
  var busy = null; // промис текущей синхронизации

  /* ---------- конфиг ---------- */
  function loadConfig() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
    try {
      var raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      Object.keys(DEFAULTS).forEach(function (k) {
        if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
      });
    } catch (e) {}
    if (!out.deviceId) out.deviceId = deviceId();
    return out;
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function deviceId() {
    var id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
      id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  }

  function patch(p) {
    var cfg = loadConfig();
    Object.keys(p || {}).forEach(function (k) { cfg[k] = p[k]; });
    cfg.deviceId = deviceId();
    saveConfig(cfg);
    emit();
    return cfg;
  }

  /* ---------- устройство ---------- */
  function deviceLabel() {
    var name = (navigator.userAgent.match(/(?:iPhone|iPad|Android|Mac OS X|Windows)/) || ['Устройство'])[0];
    return name.replace('Mac OS X', 'Mac').slice(0, 20);
  }

  function deviceInfo(cfg) {
    return { id: cfg.deviceId || deviceId(), label: deviceLabel(), who: lastAuthor() };
  }

  // кто последним добавлял записи на этом устройстве — для подписи в списке устройств
  function lastAuthor() {
    var list = Store.load().entries;
    return list.length ? list[0].by : '';
  }

  /* ---------- сеть ---------- */
  function request(url, opts) {
    var cfg = loadConfig();
    var headers = { 'Content-Type': 'application/json' };
    if (cfg.driver === 'gist') {
      headers.Accept = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    // значение HTTP-заголовка обязано быть ASCII — иначе fetch падает на кириллице
    if (opts && opts.tokenHeader && cfg.token) headers['X-Kakatorium-Token'] = encodeURIComponent(cfg.token);

    return fetch(url, {
      method: (opts && opts.method) || 'GET',
      headers: headers,
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error(translateError(res.status, cfg.driver));
      return res.status === 204 ? null : res.json();
    });
  }

  function translateError(status, driver) {
    if (status === 401 || status === 403) {
      return driver === 'gist'
        ? 'GitHub отклонил токен (нужны права на Gist). Проверьте токен.'
        : 'Сервер не принял ключ доступа. Проверьте поле «ключ».';
    }
    if (status === 404) return driver === 'gist' ? 'Gist не найден. Проверьте ID.' : 'Не нашли данные по адресу (404).';
    if (status === 409) return 'Конфликт версий — попробуйте синхронизировать ещё раз.';
    if (status >= 500) return 'Сервер ответил ошибкой ' + status + '.';
    return 'Сервер ответил ' + status + '.';
  }

  function gistUrl(cfg) {
    if (!cfg.gistId) return Promise.reject(new Error('Не указан ID gist'));
    return Promise.resolve(GIST_API + '/' + encodeURIComponent(cfg.gistId));
  }

  function readRemote() {
    var cfg = loadConfig();
    if (cfg.driver === 'gist') {
      return gistUrl(cfg).then(function (url) {
        return request(url).then(function (data) {
          var file = data && data.files && (data.files[GIST_FILE] || data.files['kakatorium.json']);
          if (!file || !file.content) return { entries: [], tombstones: {} };
          try { return JSON.parse(file.content); }
          catch (e) { throw new Error('В gist лежит не JSON Какаториума'); }
        });
      });
    }
    if (cfg.driver === 'server') {
      if (!cfg.url) return Promise.reject(new Error('Не указан адрес сервера'));
      return request(cfg.url, { tokenHeader: true });
    }
    return Promise.reject(new Error('Синхронизация выключена'));
  }

  function writeRemote(payload) {
    var cfg = loadConfig();
    if (cfg.driver === 'gist') {
      if (!cfg.token) return Promise.reject(new Error('Для записи в gist нужен токен'));
      return gistUrl(cfg).then(function (url) {
        var files = {};
        files[GIST_FILE] = { content: JSON.stringify(payload) };
        return request(url, { method: 'PATCH', body: { description: 'Какаториум — общая база Димы и Алёны', files: files } });
      });
    }
    if (cfg.driver === 'server') {
      if (!cfg.url) return Promise.reject(new Error('Не указан адрес сервера'));
      return request(cfg.url, { method: 'PUT', body: payload, tokenHeader: true });
    }
    return Promise.reject(new Error('Синхронизация выключена'));
  }

  /* «Свой сервер» умеем и создавать, если сервер наш (endpoint /api/init не обязателен) */
  function testConnection() {
    return readRemote().then(function (data) {
      var n = data && Array.isArray(data.entries) ? data.entries.length : 0;
      return { ok: true, count: n };
    });
  }

  /* Создаём общий gist и сразу подключаемся к нему */
  function createGist() {
    var cfg = loadConfig();
    if (!cfg.token) return Promise.reject(new Error('Сначала введите токен GitHub'));
    var files = {};
    files[GIST_FILE] = { content: JSON.stringify(Store.payload()) };
    return request(GIST_API, {
      method: 'POST',
      body: { description: 'Какаториум — общая база Димы и Алёны', public: false, files: files }
    }).then(function (data) {
      if (!data || !data.id) throw new Error('GitHub не вернул ID gist');
      patch({ driver: 'gist', gistId: data.id, error: '', syncedAt: Date.now(), lastSync: Date.now() });
      return { gistId: data.id, url: data.html_url || '' };
    });
  }

  /* ---------- главный цикл ---------- */
  function sync(opts) {
    var cfg = loadConfig();
    if (cfg.driver === 'off') return Promise.resolve({ skipped: true });
    if (busy) return busy;

    var silent = opts && opts.silent;
    busy = readRemote()
      .then(function (remote) {
        var res = Store.applyPayload(remote, { silent: true });
        Store.markDevice(deviceInfo(cfg));
        var local = Store.payload();
        var db = Store.load();
        var needPush = db.updatedAt > (cfg.syncedAt || 0);
        if (!needPush) return { pulled: res, pushed: false };

        return writeRemote(local).then(function () {
          patch({ syncedAt: Date.now(), lastSync: Date.now(), error: '' });
          return { pulled: res, pushed: true };
        });
      })
      .then(function (result) {
        patch({ lastSync: Date.now(), error: '' });
        var pulled = result && result.pulled;
        if (pulled && (pulled.added || pulled.removed)) {
          remoteHandlers.forEach(function (fn) {
            try { fn(pulled); } catch (e) {}
          });
        }
        if (!silent) emit();
        busy = null;
        return result;
      })
      .catch(function (err) {
        patch({ error: String(err && err.message ? err.message : err) });
        busy = null;
        if (opts && opts.throwErrors) throw err;
        return { error: String(err && err.message ? err.message : err) };
      });

    return busy;
  }

  /* после локального изменения — сразу толкаем на сервер */
  function pushSoon() {
    if (loadConfig().driver === 'off') return;
    sync({ silent: true });
  }

  /* ---------- авто-обновление ---------- */
  function start() {
    stop();
    var cfg = loadConfig();
    var sec = parseInt(cfg.interval, 10);
    if (cfg.driver === 'off' || !sec) return;
    sync({ silent: true });
    timer = setInterval(function () {
      if (document.hidden) return;
      sync({ silent: true });
    }, Math.max(15, sec) * 1000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function attachLifecycle() {
    window.addEventListener('focus', function () {
      if (loadConfig().driver !== 'off') sync({ silent: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && loadConfig().driver !== 'off') sync({ silent: true });
    });
    window.addEventListener('online', function () { if (loadConfig().driver !== 'off') sync({ silent: true }); });
  }

  function onRemote(fn) { remoteHandlers.push(fn); }

  function onEvent(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(status()); } catch (e) {} }); }

  /* ---------- статус для интерфейса ---------- */
  function status() {
    var cfg = loadConfig();
    var db = Store.load();
    return {
      driver: cfg.driver,
      url: cfg.url,
      gistId: cfg.gistId,
      hasToken: !!cfg.token,
      interval: cfg.interval,
      lastSync: cfg.lastSync,
      error: cfg.error,
      pending: db.updatedAt > (cfg.syncedAt || 0),
      count: db.entries.length,
      devices: db.devices,
      enabled: cfg.driver !== 'off',
      // авто-режим: страница уже отдаётся нашим сервером
      sameOrigin: isLocalHttp()
    };
  }

  function isLocalHttp() {
    return typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  }

  /* Проверяем, не отд ли эту страницу наш сервер с /api/data */
  function detectLocalServer() {
    if (!isLocalHttp() || location.hostname === '') return Promise.resolve(false);
    var cfg = loadConfig();
    // человек явно выбрал «Выключено» или gist — навязывать своё не будем
    if (cfg.autoDisabled || cfg.driver === 'gist') return Promise.resolve(false);
    var guess = location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/data';
    return fetch(guess, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (data) {
          if (!data || !Array.isArray(data.entries)) return false;
          if (cfg.driver !== 'server' || cfg.url !== guess) patch({ driver: 'server', url: guess, error: '' });
          return true;
        });
      })
      .catch(function () { return false; });
  }

  global.Sync = {
    CFG_KEY: CFG_KEY,
    config: loadConfig,
    patch: patch,
    status: status,
    sync: sync,
    pushSoon: pushSoon,
    test: testConnection,
    start: start,
    stop: stop,
    attachLifecycle: attachLifecycle,
    onRemote: onRemote,
    onEvent: onEvent,
    detectLocalServer: detectLocalServer,
    deviceLabel: deviceLabel,
    DEFAULTS: DEFAULTS
  };
})(window);
