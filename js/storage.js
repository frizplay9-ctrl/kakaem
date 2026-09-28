/* Какаториум — хранилище данных (localStorage, без бэкенда) */
(function (global) {
  'use strict';

  var KEY = 'kakatorium:v2';

  var PEOPLE = {
    dima: { id: 'dima', name: 'Дима', gen: 'Димы', short: 'Д', emoji: '💩', hex: '#C77437', varName: '--dima' },
    alena: { id: 'alena', name: 'Алёна', gen: 'Алёны', short: 'А', emoji: '🌸', hex: '#C0446F', varName: '--alena' }
  };

  // Бристольская шкала формы кала
  var BRISTOL = [
    { type: 1, name: 'Орешки', desc: 'Твёрдые комочки, как орехи', emoji: '🪨' },
    { type: 2, name: 'Плотный', desc: 'Комковатая колбаска', emoji: '🌵' },
    { type: 3, name: 'Трещинки', desc: 'Колбаска с трещинами', emoji: '🥖' },
    { type: 4, name: 'Идеал', desc: 'Гладкая мягкая колбаска', emoji: '🍫' },
    { type: 5, name: 'Мягкий', desc: 'Мягкие кусочки с краями', emoji: '🍌' },
    { type: 6, name: 'Рыхлый', desc: 'Пухлые лохмотья, кашеобразный', emoji: '🫧' },
    { type: 7, name: 'Хаос', desc: 'Жидкий, без твёрдых частиц', emoji: '🌊' }
  ];

  function blank() {
    return { version: 3, createdAt: new Date().toISOString(), updatedAt: Date.now(), entries: [], tombstones: {}, devices: {} };
  }

  function readRaw() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function writeRaw(value) {
    try { global.localStorage.setItem(KEY, value); return true; } catch (e) { return false; }
  }

  function normalize(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var raw = entry.ts != null ? entry.ts : entry.date;
    var ts = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Date.parse(raw) : NaN);
    if (typeof ts !== 'number' || !isFinite(ts)) return null;
    var by = PEOPLE[entry.by] ? entry.by : 'dima';
    var type = parseInt(entry.type, 10);
    if (!(type >= 1 && type <= 7)) type = 4;
    var duration = parseInt(entry.duration, 10);
    if (!(duration >= 0 && duration < 600)) duration = null;
    return {
      id: String(entry.id || uid()),
      by: by,
      ts: ts,
      type: type,
      duration: duration,
      note: String(entry.note || '').slice(0, 140),
      demo: !!entry.demo
    };
  }

  /* надгробие удалённой записи: id → когда удалили. Нужно, чтобы удалённое
     не «воскресало» при слиянии с другим устройством */
  function cleanTombstones(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (id) {
      var t = typeof raw[id] === 'number' ? raw[id] : Date.parse(raw[id]);
      if (typeof t === 'number' && isFinite(t)) out[String(id)] = t;
    });
    return out;
  }

  function cleanDevices(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (id) {
      var d = raw[id];
      if (!d || typeof d !== 'object') return;
      out[String(id)] = {
        label: String(d.label || '').slice(0, 40) || 'Устройство',
        seen: typeof d.seen === 'number' ? d.seen : 0,
        count: typeof d.count === 'number' ? d.count : 0,
        who: d.who === 'alena' ? 'alena' : d.who === 'dima' ? 'dima' : ''
      };
    });
    return out;
  }

  /* оставляем только свежие надгробия, чтобы база не росла бесконечно */
  function pruneTombstones(tombstones, keepMs) {
    var cut = Date.now() - (keepMs || 400 * 86400000);
    var keys = Object.keys(tombstones).filter(function (id) { return tombstones[id] >= cut; });
    if (keys.length <= 3000) return tombstones;
    keys.sort(function (a, b) { return tombstones[b] - tombstones[a]; });
    var out = {};
    keys.slice(0, 3000).forEach(function (id) { out[id] = tombstones[id]; });
    return out;
  }

  function migrate(data) {
    var seen = {};
    var entries = [];
    var tombstones = cleanTombstones(data.tombstones);
    (data.entries || []).forEach(function (raw) {
      var e = normalize(raw);
      if (!e || seen[e.id]) return;
      seen[e.id] = true;
      // запись, удалённая на другом устройстве, не должна возвращаться
      if (tombstones[e.id] && tombstones[e.id] >= e.ts) return;
      entries.push(e);
    });
    entries.sort(function (a, b) { return b.ts - a.ts; });
    return {
      version: 3,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
      entries: entries,
      tombstones: tombstones,
      devices: cleanDevices(data.devices)
    };
  }

  function load() {
    var raw = readRaw();
    if (!raw) return blank();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) return blank();
      return migrate(parsed);
    } catch (e) {
      return blank();
    }
  }

  function save(db) {
    db.entries.sort(function (a, b) { return b.ts - a.ts; });
    return writeRaw(JSON.stringify(db));
  }

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function add(entry) {
    var db = load();
    var clean = normalize(entry);
    if (!clean) return null;
    clean.id = uid();
    db.entries.unshift(clean);
    db.updatedAt = Date.now();
    save(db);
    return clean;
  }

  function remove(id) {
    var db = load();
    var before = db.entries.length;
    db.entries = db.entries.filter(function (e) { return e.id !== id; });
    if (db.entries.length === before) return false;
    db.tombstones[id] = Date.now();
    db.updatedAt = Date.now();
    save(db);
    return true;
  }

  /* Слияние по id — для импорта и для синхронизации между устройствами.
     Приходят записи + надгробия; побеждает удаление, если оно новее записи. */
  function merge(incoming, opts) {
    var replace = opts && opts.replace;
    var silent = opts && opts.silent;
    var db = replace ? blank() : load();
    var incomingTomb = cleanTombstones(opts && opts.tombstones);
    var index = {};
    db.entries.forEach(function (e) { index[e.id] = e; });
    Object.keys(db.tombstones).forEach(function (id) {
      if (!incomingTomb[id] || incomingTomb[id] < db.tombstones[id]) incomingTomb[id] = db.tombstones[id];
    });

    var added = 0, updated = 0;
    (incoming || []).forEach(function (raw) {
      var e = normalize(raw);
      if (!e) return;
      if (incomingTomb[e.id] && incomingTomb[e.id] >= e.ts) return;
      if (index[e.id]) { updated++; return; }
      index[e.id] = e;
      db.entries.push(e);
      added++;
    });

    var removed = 0;
    db.entries = db.entries.filter(function (e) {
      if (incomingTomb[e.id] && incomingTomb[e.id] >= e.ts) { removed++; return false; }
      return true;
    });

    db.tombstones = pruneTombstones(incomingTomb);
    if (opts && opts.devices) db.devices = cleanDevices(opts.devices);
    if (!silent) db.updatedAt = Date.now();
    save(db);
    return { added: added, skipped: updated, removed: removed };
  }

  /* Полная очистка превращается в волну удалений, чтобы второй человек
     тоже всё потерял, а не «подарил» записи обратно при синхронизации */
  function clearAll() {
    var db = load();
    var now = Date.now();
    var tombstones = cleanTombstones(db.tombstones);
    db.entries.forEach(function (e) { tombstones[e.id] = now; });
    writeRaw(JSON.stringify({
      version: 3, createdAt: db.createdAt, updatedAt: now,
      entries: [], tombstones: tombstones, devices: db.devices
    }));
  }

  function clearDemo() {
    var db = load();
    var now = Date.now();
    db.entries.forEach(function (e) { if (e.demo) db.tombstones[e.id] = now; });
    db.entries = db.entries.filter(function (e) { return !e.demo; });
    db.updatedAt = now;
    save(db);
  }

  /* Снимок для отправки на сервер */
  function payload() {
    var db = load();
    return {
      version: 3,
      updatedAt: db.updatedAt,
      entries: db.entries,
      tombstones: db.tombstones,
      devices: db.devices
    };
  }

  /* Применение снимка от сервера: возвращает, сколько реально пришло нового */
  function applyPayload(data, opts) {
    if (!data || typeof data !== 'object') throw new Error('Пустой ответ сервера');
    var entries = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(entries)) throw new Error('Неверный формат данных');
    return merge(entries, {
      tombstones: (data && data.tombstones) || {},
      devices: (data && data.devices) || null,
      silent: opts && opts.silent
    });
  }

  function markDevice(device) {
    var db = load();
    if (!device || !device.id) return;
    db.devices = cleanDevices(db.devices);
    db.devices[device.id] = {
      label: device.label || 'Устройство',
      seen: Date.now(),
      count: db.entries.length,
      who: device.who || ''
    };
    save(db);
  }

  /* ---------- Код синхронизации (base64, unicode-safe) ---------- */
  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromBase64(b64) {
    var bin = atob(b64.replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encodeCode(entries) {
    var db = load();
    return toBase64(JSON.stringify({ v: 3, e: entries || db.entries, t: db.tombstones })).replace(/=+$/, '');
  }

  function decodeCode(code) {
    var tail = '='.repeat((4 - (code.length % 4)) % 4);
    var payload = JSON.parse(fromBase64(code + tail));
    if (!payload || !Array.isArray(payload.e)) throw new Error('Неверный формат кода');
    return { entries: payload.e, tombstones: payload.t || {} };
  }

  /* ---------- Демо-данные для быстрой оценки статистики ---------- */
  function demoEntries() {
    var out = [];
    var now = new Date();
    var todayMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30).getTime();
    var day = 86400000;

    function plan(person, perDay, seedShift) {
      for (var d = 400; d >= 0; d--) {
        var rnd = pseudo(d + seedShift);
        var skip = rnd > perDay ? 0.42 : 0.08;
        if (rnd * 1.35 < skip) continue;
        var count = 1 + (rnd > 0.86 ? 1 : 0);
        for (var k = 0; k < count; k++) {
          var hour = person === 'dima' ? 7 + Math.floor(pseudo(d * 3 + k + seedShift) * 3)
                                       : 8 + Math.floor(pseudo(d * 5 + k + seedShift) * 6);
          var ts = todayMorning - d * day + (hour - 9) * 3600000 + Math.floor(pseudo(d + k * 7) * 3000000);
          if (ts > Date.now()) continue;
          var typeRoll = pseudo(d * 11 + k + seedShift);
          out.push({
            id: 'demo-' + person + '-' + d + '-' + k,
            by: person,
            ts: ts,
            type: typeRoll > 0.86 ? 6 : typeRoll > 0.72 ? 2 : typeRoll > 0.2 ? 4 : 3,
            duration: 2 + Math.floor(pseudo(d * 13 + k) * 22),
            note: k === 0 && d % 17 === 0 ? 'После кофе ☕' : '',
            demo: true
          });
        }
      }
    }

    function pseudo(n) {
      var x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    }

    plan('dima', 0.72, 3);
    plan('alena', 0.61, 91);

    // сегодняшние записи, чтобы карточки «Сегодня» сразу были наполнены
    var stamp = Date.now();
    function todayEntry(person, minutesAgo, type, duration, note) {
      out.push({
        id: 'demo-' + person + '-today-' + minutesAgo, by: person, ts: stamp - minutesAgo * 60000,
        type: type, duration: duration, note: note, demo: true
      });
    }
    todayEntry('dima', 265, 4, 9, '');
    todayEntry('dima', 22, 3, 14, 'После кофе ☕');
    todayEntry('alena', 140, 4, 7, '');

    return out;
  }

  global.Store = {
    KEY: KEY,
    PEOPLE: PEOPLE,
    BRISTOL: BRISTOL,
    load: load,
    save: save,
    add: add,
    remove: remove,
    merge: merge,
    payload: payload,
    applyPayload: applyPayload,
    markDevice: markDevice,
    clearAll: clearAll,
    clearDemo: clearDemo,
    encodeCode: encodeCode,
    decodeCode: decodeCode,
    demoEntries: demoEntries,
    uid: uid
  };
})(window);
