/* Smoke-тест без браузера: запускает приложение на минимальной заглушке DOM.
   Запуск (macOS):  jsc tools/smoke.js
   Проверяет, что все вкладки и расчёты отрабатывают без ошибок. */

var files = ['js/storage.js', 'js/charts.js', 'js/sync.js', 'js/app.js'];

/* ---------- заглушки браузерных API ---------- */
var LS = {};
var localStorageStub = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : null; },
  setItem: function (k, v) { LS[k] = String(v); },
  removeItem: function (k) { delete LS[k]; }
};

if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = function () {};
  globalThis.TextEncoder.prototype.encode = function (str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  };
}
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = function () {};
  globalThis.TextDecoder.prototype.decode = function (b) {
    var s = '', i = 0;
    while (i < b.length) {
      var x = b[i++];
      if (x < 0x80) s += String.fromCharCode(x);
      else if (x < 0xe0) s += String.fromCharCode(((x & 31) << 6) | (b[i++] & 63));
      else s += String.fromCharCode(((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    }
    return s;
  };
}
if (typeof btoa === 'undefined') {
  var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  globalThis.btoa = function (bin) {
    var out = '', i;
    for (i = 0; i < bin.length; i += 3) {
      var c1 = bin.charCodeAt(i), c2 = bin.charCodeAt(i + 1), c3 = bin.charCodeAt(i + 2);
      out += CH[c1 >> 2] + CH[((c1 & 3) << 4) | (c2 >> 4)];
      out += isNaN(c2) ? '=' : CH[((c2 & 15) << 2) | (c3 >> 6)];
      out += isNaN(c3) ? '=' : CH[c3 & 63];
    }
    return out;
  };
  globalThis.atob = function (b64) {
    var bin = '', i, c = 0, bits = 0;
    b64 = b64.replace(/[^A-Za-z0-9+/]/g, '');
    for (i = 0; i < b64.length; i++) {
      c = (c << 6) | CH.indexOf(b64[i]); bits += 6;
      if (bits >= 8) { bits -= 8; bin += String.fromCharCode((c >> bits) & 255); }
    }
    return bin;
  };
}

function ClassList() { this.set = {}; }
ClassList.prototype.add = function (c) { this.set[c] = true; };
ClassList.prototype.remove = function (c) { delete this.set[c]; };
ClassList.prototype.toggle = function (c, on) { if (on) this.add(c); else delete this.set[c]; };
ClassList.prototype.contains = function (c) { return !!this.set[c]; };

function El(id) {
  this.id = id;
  this._html = '';
  this.textContent = '';
  this.value = '';
  this.clientWidth = 900;
  this.offsetWidth = 900;
  this.dataset = {};
  this.classList = new ClassList();
  this.style = { setProperty: function () {} };
}
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); }
});
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this['_attr_' + k] = v; };
El.prototype.getAttribute = function (k) { return this['_attr_' + k]; };
El.prototype.querySelector = function (sel) { return getEl(this.id + ' ' + sel); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.closest = function () { return null; };
El.prototype.focus = function () {};
El.prototype.select = function () {};
El.prototype.click = function () {};
Object.defineProperty(El.prototype, 'parentNode', { get: function () { return getEl(this.id + ' .parent'); } });

var elements = {};
function getEl(sel) {
  if (!elements[sel]) elements[sel] = new El(sel);
  return elements[sel];
}

function tabStub(name) { var e = getEl('.tab#' + name); e.dataset.tab = name; return e; }
function dataStub(sel, key, values) {
  return values.map(function (v) { var e = getEl(sel + '#' + v); e.dataset[key] = v; return e; });
}

var dom = {
  documentElement: getEl('html'),
  addEventListener: function (name, fn) { dom['_' + name] = fn; },
  querySelector: function (sel) { return getEl(sel); },
  querySelectorAll: function (sel) {
    if (sel === '.tab') return ['today', 'stats', 'compare', 'history', 'data'].map(tabStub);
    if (sel === '.panel') return ['today', 'stats', 'compare', 'history', 'data'].map(function (n) { return getEl('#tab-' + n); });
    if (sel === '[data-period-seg] button') return dataStub('[data-period-seg] button', 'period', ['day', 'week', 'month', 'year']);
    if (sel === '#heatSeg button') return dataStub('#heatSeg button', 'heat', ['all', 'dima', 'alena']);
    if (sel === '#historySeg button') return dataStub('#historySeg button', 'filter', ['all', 'dima', 'alena']);
    if (sel === '#whoSwitch .who-btn') return dataStub('#whoSwitch .who-btn', 'who', ['dima', 'alena']);
    if (sel === '#formWho .chip') return dataStub('#formWho .chip', 'who', ['dima', 'alena']);
    if (sel === '#formType .chip') return dataStub('#formType .chip', 'type', ['1', '2', '3', '4', '5', '6', '7']);
    if (sel === '#quickAdd [data-quick]') return dataStub('#quickAdd [data-quick]', 'quick', ['dima', 'alena']);
    if (sel === '.step-btn') return [getEl('.step-btn#minus'), getEl('.step-btn#plus')];
    return [];
  }
};
dom.documentElement.dataset.theme = 'light';

globalThis.window = {
  localStorage: localStorageStub,
  matchMedia: function () { return { matches: false }; },
  addEventListener: function () {},
  scrollTo: function () {},
  innerWidth: 1200,
  confirm: function () { return true; },
  setTimeout: function (fn) { return 0; },
  clearTimeout: function () {}
};
globalThis.setTimeout = function () { return 0; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 0; };
globalThis.clearInterval = function () {};

/* ---------- фейковый сервер: повторяет семантику tools/server.py ---------- */
var fakeServer = {
  db: { version: 3, createdAt: new Date().toISOString(), updatedAt: 1, entries: [], tombstones: {}, devices: {} },
  writes: 0, reads: 0, token: ''
};
function serverMerge(incoming) {
  var tomb = fakeServer.db.tombstones;
  Object.keys(incoming.tombstones || {}).forEach(function (id) {
    if ((tomb[id] || 0) < incoming.tombstones[id]) tomb[id] = incoming.tombstones[id];
  });
  var index = {};
  fakeServer.db.entries.forEach(function (e) { index[e.id] = e; });
  (incoming.entries || []).forEach(function (e) {
    if (!e || !e.id) return;
    if (tomb[e.id] && tomb[e.id] >= e.ts) return;
    if (!index[e.id]) index[e.id] = e;
  });
  fakeServer.db.entries = Object.keys(index).map(function (k) { return index[k]; })
    .filter(function (e) { return !(tomb[e.id] && tomb[e.id] >= e.ts); });
  Object.assign(fakeServer.db.devices, incoming.devices || {});
  fakeServer.db.updatedAt = Date.now();
}
globalThis.fetch = function (url, opts) {
  var method = (opts && opts.method) || 'GET';
  if (typeof url !== 'string' || url.indexOf('fake-server') !== 0) {
    return Promise.reject(new Error('запрешенный адрес ' + url));
  }
  if (opts && opts.token === 'bad') return Promise.resolve({ ok: false, status: 401, json: function () { return Promise.resolve({}); } });
  if (method === 'GET') {
    fakeServer.reads++;
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(fakeServer.db); } });
  }
  fakeServer.writes++;
  serverMerge(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(fakeServer.db); } });
};
globalThis.localStorage = localStorageStub;
globalThis.document = dom;
globalThis.navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari', clipboard: null };

/* ---------- загрузка приложения ---------- */
/* Запускать из корня проекта:  cd kakaem.ru && jsc tools/smoke.js
   (в shell-сборке jsc нет scriptArgs, поэтому пути пробуем относительно cwd) */
var DUMP = false; // true — распечатать сгенерированную разметку
var prefixes = ['', 'tools/'];
function loadFile(f) {
  for (var i = 0; i < prefixes.length; i++) {
    var src = readFile(prefixes[i] + f);
    if (typeof src === 'string') {
      // sourceURL даёт номера строк в стеке
      (0, eval)(src + '\n//# sourceURL=' + f);
      // в браузере window и globalThis — один объект; здесь синхронизируем
      Object.keys(window).forEach(function (k) { if (typeof globalThis[k] === 'undefined') globalThis[k] = window[k]; });
      return;
    }
  }
  throw new Error('НЕ НАЙДЕН ФАЙЛ ' + f + ' — запускайте из корня проекта: cd kakaem.ru && jsc tools/smoke.js');
}
files.forEach(loadFile);


function check(label, fn) {
  try {
    fn();
    print('  ok   ' + label);
    return true;
  } catch (e) {
    ok = false;
    print('  FAIL ' + label + ' → ' + (e && (e.message || e)));
    if (e && e.stack) print(String(e.stack).split('\n').slice(0, 6).map(function (l) { return '       ' + l; }).join('\n'));
    return false;
  }
}

print('Какаториум · smoke-тест');
var ok = true;

check('старт приложения (DOMContentLoaded)', function () {
  if (!dom._DOMContentLoaded) throw new Error('обработчик не зарегистрирован');
  dom._DOMContentLoaded();
});

var K = window.Kakatorium;
if (!K) { print('  FAIL нет window.Kakatorium'); ok = false; }

if (K) {
  check('пустое состояние: сегодня', function () { K.render.today(); });
  check('пустое состояние: статистика', function () { K.render.stats(); });
  check('пустое состояние: сравнение', function () { K.render.compare(); });
  check('пустое состояние: история', function () { K.render.history(); });

  check('загрузка демо-данных', function () {
    var res = Store.merge(Store.demoEntries());
    if (res.added < 100) throw new Error('слишком мало демо-записей: ' + res.added);
  });

  ['today', 'stats', 'compare', 'history', 'data'].forEach(function (tab) {
    check('рендер вкладки «' + tab + '» с данными', function () {
      K.state.tab = tab;
      K.render[tab]();
      if (tab === 'data' && getEl('#codeOut').value.length < 10) {
        throw new Error('код синхронизации не сгенерирован');
      }
    });
  });

  ['day', 'week', 'month', 'year'].forEach(function (period) {
    ['stats', 'compare'].forEach(function (tab) {
      check('период «' + period + '» во вкладке «' + tab + '»', function () {
        K.state.period = period;
        K.render[tab]();
      });
    });
  });

  ['all', 'dima', 'alena'].forEach(function (h) {
    check('календарь: ' + h, function () { K.state.heat = h; K.state.period = 'year'; K.render.stats(); });
  });

  check('в разметке нет NaN / undefined', function () {
    K.state.period = 'week';
    K.state.heat = 'all';
    K.render.stats();
    K.render.compare();
    K.render.today();
    K.render.history();
    var ids = ['#kpis', '#facts', '#duel', '#versus', '#regularity', '#sync', '#historyList',
      '#todayDima', '#todayAlena', '#heroFacts', '#bristolChart', '#heroDate', '#statsRangeNote'];
    ids.forEach(function (sel) {
      var html = getEl(sel).innerHTML + ' ' + getEl(sel).textContent;
      if (/NaN|undefined|\[object Object\]/.test(html)) {
        throw new Error(sel + ' содержит мусор: ' + html.replace(/\s+/g, ' ').slice(0, 120));
      }
    });
  });

  check('графики отрисованы (svg в разметке)', function () {
    var html = getEl('#chartMain').innerHTML;
    if (html.indexOf('<svg') !== 0) throw new Error('#chartMain пустой: ' + html.slice(0, 40));
    if (getEl('#chartCum').innerHTML.indexOf('<svg') !== 0) throw new Error('#chartCum пустой');
    if (getEl('#heatChart').innerHTML.indexOf('<svg') !== 0) throw new Error('#heatChart пустой');
  });

  check('логика периодов: год ≥ месяц ≥ неделя ≥ день', function () {
    function totalOf(period) {
      K.state.period = period;
      K.render.stats();
      var m = getEl('#kpis').innerHTML.match(/kpi-value">(\d+)/);
      if (!m) throw new Error('не удалось прочитать KPI для ' + period);
      return parseInt(m[1], 10);
    }
    var y = totalOf('year'), mo = totalOf('month'), w = totalOf('week'), d = totalOf('day');
    print('       всего: год=' + y + ', месяц=' + mo + ', неделя=' + w + ', сегодня=' + d);
    if (!(y >= mo && mo >= w && w >= d)) throw new Error('несогласованные периоды: ' + [y, mo, w, d].join(' ≥ '));
    if (y < 100) throw new Error('слишком мало данных после демо: ' + y);
    K.state.period = 'week';
  });

  check('структура вывода корректна', function () {
    K.state.period = 'week';
    K.render.compare();
    var versus = getEl('#versus').innerHTML;
    if (versus.indexOf('ratio-wrap') < 0) throw new Error('нет контейнера пропорции');
    if (getEl('#versus .ratio-wrap').innerHTML.indexOf('class="ratio"') < 0) throw new Error('полоса пропорции не отрисована');
    if (versus.indexOf('vsp-note') < 0) throw new Error('подпись под пропорцией затёрта');
    if ((versus.match(/class="vsp"/g) || []).length !== 2) throw new Error('ожидается два профиля');

    K.render.stats();
    var facts = (getEl('#facts').innerHTML.match(/class="fact"/g) || []).length;
    if (facts < 5) throw new Error('слишком мало фактов: ' + facts);
    var bristol = (getEl('#bristolChart').innerHTML.match(/class="brow"/g) || []).length;
    if (bristol !== 7) throw new Error('шкала Бристоль неполная: ' + bristol);
    if ((getEl('#kpis').innerHTML.match(/class="kpi"/g) || []).length !== 6) throw new Error('KPI отрисованы не все');

    K.render.history();
    var dels = (getEl('#historyList').innerHTML.match(/data-del="/g) || []).length;
    if (dels < 1) throw new Error('в истории нет кнопок удаления');
    if (dels > 400) throw new Error('история не ограничена пайджинацией: ' + dels);
  });

  check('коды синхронизации: экспорт → импорт', function () {
    var all = Store.load().entries;
    var code = Store.encodeCode(all);
    var back = Store.decodeCode(code);
    if (back.entries.length !== all.length) throw new Error('потеряны записи: ' + back.entries.length + ' из ' + all.length);
    var res = Store.merge(back.entries, { tombstones: back.tombstones });
    if (res.added !== 0) throw new Error('повторный импорт добавил дубли: ' + res.added);
  });

  check('удаление записи', function () {
    var e = Store.add({ by: 'dima', ts: Date.now(), type: 4, duration: 5, note: 'тест' });
    var before = Store.load().entries.length;
    Store.remove(e.id);
    if (Store.load().entries.length !== before - 1) throw new Error('запись не удалилась');
  });

  check('очистка демо-записей', function () {
    Store.clearDemo();
    if (Store.load().entries.length !== 0) throw new Error('остались записи после очистки демо');
  });

  check('синхронизация: по умолчанию выключена', function () {
    var st = Sync.status();
    if (st.enabled) throw new Error('синхронизация unexpectedly включена');
  });

  check('синхронизация: вкладка «Данные» рендерится', function () {
    K.state.tab = 'data';
    K.render.data();
    var body = getEl('#syncBody').innerHTML;
    if (body.indexOf('drv-note') < 0) throw new Error('нет подсказки по способу синхронизации');
    if (!getEl('#syncState').innerHTML) throw new Error('пустой блок статуса');
    if (!getEl('#syncPill .sync-pill-text').textContent) throw new Error('индикатор в шапке пустой');
  });
}

/* ручной просмотр сгенерированной разметки: включите DUMP = true выше */
if (DUMP && K) {
  Store.merge(Store.demoEntries());
  K.state.period = 'week';
  K.state.heat = 'all';
  K.render.stats();
  K.render.compare();
  K.render.today();
  K.render.history();
  print('--- #kpis ---\n' + getEl('#kpis').innerHTML.replace(/></g, '>\n<'));
  print('\n--- #versus ---\n' + getEl('#versus').innerHTML.replace(/></g, '>\n<').slice(0, 1400));
  print('\n--- #syncBody ---\n' + getEl('#syncBody').innerHTML.slice(0, 600));
}

/* ---------- проверка синхронизации (асинхронная) ---------- */
var asyncTests = [];
if (K) {
  function aCheck(label, fn) {
    asyncTests.push(function () {
      return fn().then(function () { print('  ok   ' + label); },
        function (e) { ok = false; print('  FAIL ' + label + ' → ' + (e && (e.message || e))); });
    });
  }

  aCheck('синхронизация: подключение к своему серверу', function () {
    Sync.patch({ driver: 'server', url: 'fake-server://home/api/data', token: '', syncedAt: 0, lastSync: 0, error: '' });
    return Sync.test().then(function (res) {
      if (!res.ok) throw new Error('проверка связи не прошла');
      if (res.count !== 0) throw new Error('на пустом сервере ожидалось 0 записей');
    });
  });

  aCheck('синхронизация: локальные записи уходят на сервер', function () {
    Store.clearAll();
    Store.add({ by: 'dima', ts: Date.now(), type: 4, duration: 6, note: 'до синка' });
    Store.add({ by: 'alena', ts: Date.now() - 3600000, type: 3, duration: 9, note: '' });
    var writesBefore = fakeServer.writes;
    return Sync.sync({ throwErrors: true }).then(function (res) {
      if (!res.pushed) throw new Error('ничего не отправили');
      if (fakeServer.writes <= writesBefore) throw new Error('записей на сервере не прибавилось');
      if (fakeServer.db.entries.length !== 2) throw new Error('на сервере ' + fakeServer.db.entries.length + ' вместо 2');
    });
  });

  aCheck('синхронизация: записи напарника приходят к нам', function () {
    fakeServer.db.entries.push({ id: 'from-alena', by: 'alena', ts: Date.now() - 7200000, type: 4, duration: 5, note: 'от Алёны', demo: false });
    fakeServer.db.updatedAt = Date.now();
    return Sync.sync({ throwErrors: true }).then(function (res) {
      if (!res.pulled || res.pulled.added !== 1) throw new Error('пришло ' + JSON.stringify(res.pulled));
      var found = Store.load().entries.filter(function (e) { return e.id === 'from-alena'; });
      if (found.length !== 1) throw new Error('запись напарника не появилась в локальной базе');
    });
  });

  aCheck('синхронизация: повторный синк не создаёт дублей и лишних отправок', function () {
    var writesBefore = fakeServer.writes;
    return Sync.sync({ throwErrors: true }).then(function (res) {
      if (res.pushed) throw new Error('отправили лишнее — изменений не было');
      if (fakeServer.writes !== writesBefore) throw new Error('бесполезная запись на сервер');
      var ids = Store.load().entries.map(function (e) { return e.id; });
      if (ids.length !== new Set(ids).size) throw new Error('появились дубликаты id');
    });
  });

  aCheck('синхронизация: удаление не «воскресает»', function () {
    Store.remove('from-alena');
    return Sync.sync({ throwErrors: true })
      .then(function () { return Sync.sync({ throwErrors: true }); })
      .then(function () {
        if (Store.load().entries.filter(function (e) { return e.id === 'from-alena'; }).length) {
          throw new Error('удалённая запись вернулась локально');
        }
        if (fakeServer.db.entries.filter(function (e) { return e.id === 'from-alena'; }).length) {
          throw new Error('удалённая запись осталась на сервере');
        }
      });
  });

  aCheck('синхронизация: удаление напарника доходит до нас', function () {
    var mine = Store.load().entries[0];
    fakeServer.db.tombstones[mine.id] = Date.now() + 1000;
    fakeServer.db.entries = fakeServer.db.entries.filter(function (e) { return e.id !== mine.id; });
    return Sync.sync({ throwErrors: true }).then(function (res) {
      if (!res.pulled || res.pulled.removed < 1) throw new Error('удаление не применилось: ' + JSON.stringify(res.pulled));
      if (Store.load().entries.filter(function (e) { return e.id === mine.id; }).length) {
        throw new Error('запись напарника-удаль вернулась');
      }
    });
  });

  aCheck('синхронизация: статус «ждёт отправки»', function () {
    Store.add({ by: 'dima', ts: Date.now(), type: 4, duration: 3, note: 'в очереди' });
    if (!Sync.status().pending) throw new Error('не показали, что есть несинхронизированное');
    return Sync.sync({ throwErrors: true }).then(function () {
      if (Sync.status().pending) throw new Error('после синка всё ещё «ждёт отправки»');
    });
  });

  aCheck('синхронизация: ошибка связи не роняет интерфейс', function () {
    Sync.patch({ url: 'http://localhost:1/api/data' });
    return Sync.sync().then(function (res) {
      if (!res.error) throw new Error('ожидали ошибку, получили ' + JSON.stringify(res));
      if (!Sync.status().error) throw new Error('ошибка не отражена в статусе');
      K.state.tab = 'data';
      K.render.data();
      if (getEl('#syncState').innerHTML.indexOf('sync-error') < 0) throw new Error('ошибка не показана в интерфейсе');
      if (getEl('#syncPill').dataset.state !== 'error') throw new Error('индикатор не показал ошибку');
      Sync.patch({ url: 'fake-server://home/api/data', error: '' });
      return Sync.sync({ throwErrors: true }).then(function () {
        if (Sync.status().error) throw new Error('ошибка не исчезла после восстановления');
      });
    });
  });

  aCheck('синхронизация: gist-драйвер читает и пишет', function () {
    // GitHub отвечает файлом kakatorium.json — подменяем fetch на время теста
    var realFetch = globalThis.fetch;
    var stored = null;
    globalThis.fetch = function (url, opts) {
      if (String(url).indexOf('api.github.com') < 0) return Promise.reject(new Error('ожидание github url'));
      var method = (opts && opts.method) || 'GET';
      if (method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: function () {
          return Promise.resolve({ files: { 'kakatorium.json': { content: JSON.stringify(stored || { entries: [], tombstones: {} }) } } });
        } });
      }
      stored = JSON.parse(JSON.parse(opts.body).files['kakatorium.json'].content);
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ id: 'gist123' }); } });
    };
    Sync.patch({ driver: 'gist', gistId: 'gist123', token: 'tok', syncedAt: 0, error: '' });
    return Sync.sync({ throwErrors: true }).then(function (res) {
      if (!res.pushed) throw new Error('в gist ничего не записали');
      if (!stored || !Array.isArray(stored.entries)) throw new Error('в gist легла не база');
      globalThis.fetch = realFetch;
      Sync.patch({ driver: 'off', token: '', gistId: '' });
    }, function (e) { globalThis.fetch = realFetch; throw e; });
  });
}

function finish() {
  print(ok ? 'ИТОГ: все проверки пройдены \u2705' : 'ИТОГ: есть падения \u274c');
  if (!ok) throw new Error('smoke failed');
}

if (!asyncTests.length) finish();
else asyncTests.reduce(function (chain, t) { return chain.then(t); }, Promise.resolve()).then(finish, function (e) {
  ok = false;
  print('  FAIL нежданная ошибка теста → ' + (e && (e.message || e)));
  finish();
});
