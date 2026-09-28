/* Какаториум — логика интерфейса и статистики */
(function () {
  'use strict';

  var P = Store.PEOPLE;
  var IDS = ['dima', 'alena'];
  var DAY = 86400000;
  var THEME_KEY = 'kakatorium:theme';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- даты ---------------- */
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = new Date(d.getFullYear(), d.getMonth() + n, 1); return x; }
  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function betweenDays(a, b) { return Math.round((sod(b) - sod(a)) / DAY); }
  function mondayOf(d) { return addDays(sod(d), -((d.getDay() + 6) % 7)); }

  var fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
  var fmtDayShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  var fmtWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
  var fmtMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
  var fmtMonthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
  var fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  var fmtFull = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  function plural(n, forms) {
    var k = Math.abs(Math.floor(n)) % 100, k1 = k % 10;
    if (k > 10 && k < 20) return forms[2];
    if (k1 > 1 && k1 < 5) return forms[1];
    if (k1 === 1) return forms[0];
    return forms[2];
  }
  function noun(n, one, few, many) { return n + ' ' + plural(n, [one, few, many]); }

  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return 'только что';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' ' + plural(m, ['минуту', 'минуты', 'минут']) + ' назад';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' ч ' + (m % 60) + ' мин назад';
    var d = Math.floor(h / 24);
    if (d < 31) return d + ' ' + plural(d, ['день', 'дня', 'дней']) + ' назад';
    var mo = Math.floor(d / 30);
    if (mo < 12) return mo + ' ' + plural(mo, ['месяц', 'месяца', 'месяцев']) + ' назад';
    var y = Math.floor(mo / 12);
    return y + ' ' + plural(y, ['год', 'года', 'лет']) + ' назад';
  }

  /* ---------------- состояние ---------------- */
  var state = {
    person: 'dima',
    period: 'week',
    tab: 'today',
    heat: 'all',
    filter: 'all',
    formType: 4,
    historyLimit: 120
  };

  var db = Store.load();
  function reload() { db = Store.load(); }

  /* ---------------- период ---------------- */
  function periodInfo(key) {
    var today = sod(new Date());
    if (key === 'day') {
      return { key: 'day', from: today, days: 1, bucket: 'hour', name: 'сегодня',
        chartTitle: 'Сегодня по часам', chartNote: 'Каждый столбик — один час дня' };
    }
    if (key === 'week') {
      return { key: 'week', from: addDays(today, -6), days: 7, bucket: 'day', name: 'последние 7 дней',
        chartTitle: 'Неделя по дням', chartNote: 'Столбики — походы за сутки, цвета — кто это был' };
    }
    if (key === 'month') {
      return { key: 'month', from: addDays(today, -29), days: 30, bucket: 'day', name: 'последние 30 дней',
        chartTitle: 'Месяц по дням', chartNote: '30 дней назад — сегодня' };
    }
    var from = addMonths(today, -11);
    return { key: 'year', from: from, days: betweenDays(from, today) + 1, bucket: 'month', name: 'последние 12 месяцев',
      chartTitle: 'Год по месяцам', chartNote: 'Столбик — календарный месяц' };
  }

  function bucketKey(mode, date) {
    if (mode === 'hour') return String(date.getHours());
    if (mode === 'day') return dayKey(date);
    return date.getFullYear() + '-' + date.getMonth();
  }

  function buildBuckets(info) {
    var out = [], i;
    if (info.bucket === 'hour') {
      for (i = 0; i < 24; i++) {
        var h = new Date(); h.setHours(i, 0, 0, 0);
        out.push({ key: String(i), label: String(i).padStart(2, '0'), title: String(i).padStart(2, '0') + ':00 — ' + String(i).padStart(2, '0') + ':59', start: h });
      }
      return out;
    }
    if (info.bucket === 'day') {
      for (i = 0; i < info.days; i++) {
        var d = addDays(info.from, i);
        out.push({ key: dayKey(d), label: fmtDayShort.format(d), title: fmtFull.format(d) + ' · ' + fmtWeekday.format(d), start: d });
      }
      return out;
    }
    var m = new Date(info.from);
    var now = new Date();
    while (m <= now) {
      out.push({
        key: m.getFullYear() + '-' + m.getMonth(),
        label: fmtMonthShort.format(m).replace('.', ''),
        title: fmtMonth.format(m) + ' ' + m.getFullYear(),
        start: new Date(m)
      });
      m = addMonths(m, 1);
    }
    return out;
  }

  /* ---------------- вычисления ---------------- */
  function inRange(e, info) {
    var to = sod(new Date()).getTime() + DAY;
    return e.ts >= info.from.getTime() && e.ts < to;
  }

  function personStats(id, info) {
    var all = db.entries.filter(function (e) { return e.by === id; });
    var list = all.filter(function (e) { return inRange(e, info); });
    var buckets = buildBuckets(info);
    var index = {};
    buckets.forEach(function (b, i) { index[b.key] = i; });
    var values = buckets.map(function () { return 0; });
    var hours = new Array(24).fill(0);
    var types = new Array(8).fill(0);
    var byDay = {};
    var durSum = 0, durN = 0, night = 0, ideal = 0, longest = null;

    list.forEach(function (e) {
      var d = new Date(e.ts);
      var bi = index[bucketKey(info.bucket, d)];
      if (bi !== undefined) values[bi]++;
      hours[d.getHours()]++;
      types[e.type]++;
      var k = dayKey(d);
      byDay[k] = (byDay[k] || 0) + 1;
      if (d.getHours() < 6) night++;
      if (e.type === 3 || e.type === 4) ideal++;
      if (e.duration != null) { durSum += e.duration; durN++; if (!longest || e.duration > longest.duration) longest = e; }
    });

    var maxDay = { count: 0, ts: null };
    Object.keys(byDay).forEach(function (k) {
      if (byDay[k] > maxDay.count) { maxDay = { count: byDay[k], ts: new Date(k + 'T12:00:00').getTime() }; }
    });

    var ts = list.map(function (e) { return e.ts; }).sort(function (a, b) { return a - b; });
    var gap = null;
    if (ts.length > 1) {
      var g = 0;
      for (var i = 1; i < ts.length; i++) g += ts[i] - ts[i - 1];
      gap = g / (ts.length - 1) / 3600000;
    }

    var activeDays = Object.keys(byDay).length;
    var allByDay = {};
    all.forEach(function (e) { var k = dayKey(new Date(e.ts)); allByDay[k] = (allByDay[k] || 0) + 1; });
    var bestStreak = streakSet(allByDay);
    var bestStreakPeriod = streakSet(byDay);
    var currentStreak = currentStreakOf(allByDay);

    var earliest = null;
    list.forEach(function (e) { var h = new Date(e.ts).getHours() * 60 + new Date(e.ts).getMinutes(); if (earliest === null || h < earliest) earliest = h; });

    return {
      id: id, list: list, total: list.length, values: values, hours: hours, types: types,
      avg: list.length / info.days, activeDays: activeDays,
      regularity: info.days ? activeDays / info.days : 0,
      maxDay: maxDay, gap: gap, night: night, ideal: ideal,
      idealPct: list.length ? ideal / list.length : 0,
      durAvg: durN ? durSum / durN : null, durN: durN, longest: longest,
      bestStreak: bestStreak, bestStreakPeriod: bestStreakPeriod,
      currentStreak: currentStreak, earliest: earliest,
      allCount: all.length
    };
  }

  /* самая длинная серия подряд по карте {день: количество} */
  function streakSet(set) {
    var best = 0, cur = 0, prev = null;
    Object.keys(set).sort().forEach(function (k) {
      var d = new Date(k + 'T12:00:00');
      if (prev && betweenDays(prev, d) === 1) cur++; else cur = 1;
      if (cur > best) best = cur;
      prev = d;
    });
    return best;
  }

  function currentStreakOf(byDay) {
    var d = sod(new Date());
    if (!byDay[dayKey(d)]) d = addDays(d, -1);
    if (!byDay[dayKey(d)]) return 0;
    var n = 0;
    while (byDay[dayKey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------------- отрисовка: общее ---------------- */
  function legendFor(el, ids) {
    if (!el) return;
    el.innerHTML = ids.map(function (id) {
      return '<span><i style="background:var(' + P[id].varName + ')"></i>' + P[id].name + '</span>';
    }).join('') + '<span style="opacity:.7">Наведите на столбик — покажем подробности</span>';
  }

  function seriesOf(stats, key) {
    return IDS.map(function (id) {
      return { name: P[id].name, color: 'var(' + P[id].varName + ')', values: stats[id][key] };
    });
  }

  /* ---------------- СЕГОДНЯ ---------------- */
  function renderToday() {
    var today = sod(new Date());
    $('#heroDate').textContent = fmtFull.format(new Date()) + ' · ' + fmtWeekday.format(new Date());

    var entries = db.entries;
    var todayMap = { dima: [], alena: [] };
    entries.forEach(function (e) {
      if (sod(new Date(e.ts)).getTime() === today.getTime()) (todayMap[e.by] || (todayMap[e.by] = [])).push(e);
    });

    var week = personStats('dima', periodInfo('week')), weekA = personStats('alena', periodInfo('week'));
    var first = entries.length ? entries[entries.length - 1].ts : null;
    var days = entries.length ? Math.max(1, betweenDays(new Date(first), new Date()) + 1) : 0;

    $('#heroFacts').innerHTML = [
      pill('💩', 'сегодня оба', todayMap.dima.length + todayMap.alena.length, pluralWord(todayMap.dima.length + todayMap.alena.length)),
      pill('📅', 'за неделю', week.total + weekA.total, pluralWord(week.total + weekA.total)),
      pill('⏳', 'вам с нами', days, plural(days, ['день', 'дня', 'дней'])),
      pill('🗂', 'всего записей', entries.length, pluralWord(entries.length))
    ].join('');

    IDS.forEach(function (id) {
      var host = $(id === 'dima' ? '#todayDima' : '#todayAlena');
      var list = todayMap[id] || [];
      var st = personStats(id, periodInfo('week'));
      var last = entries.filter(function (e) { return e.by === id; })[0];
      var goal = 1;
      var ok = list.length >= goal;
      var typeNames = {};
      list.forEach(function (e) { typeNames[e.type] = (typeNames[e.type] || 0) + 1; });
      var mins = list.reduce(function (s, e) { return s + (e.duration || 0); }, 0);

      host.style.setProperty('--pc', 'var(' + P[id].varName + ')');
      host.innerHTML =
        '<div class="pd-head">' +
          '<span class="pd-avatar">' + P[id].emoji + '</span>' +
          '<span class="pd-name">' + P[id].name + '</span>' +
          '<span class="pd-state ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'регулярно 👍' : 'пока тишина') + '</span>' +
        '</div>' +
        '<div class="pd-count"><span class="pd-num">' + list.length + '</span>' +
          '<span class="pd-unit">' + pluralWord(list.length) + ' сегодня</span></div>' +
        '<div class="pd-bar"><i style="width:' + Math.min(100, (list.length / goal) * 100) + '%"></i></div>' +
        '<div class="pd-meta">' +
          '<span>Последний: <b>' + (last ? ago(last.ts) : '—') + '</b></span>' +
          '<span>Серия: <b>' + st.currentStreak + ' ' + plural(st.currentStreak, ['день', 'дня', 'дней']) + '</b></span>' +
          '<span>За неделю: <b>' + st.total + '</b></span>' +
          (mins ? '<span>В туалете сегодня: <b>' + mins + ' мин</b></span>' : '') +
          (list.length ? '<span>Форма: <b>' + Object.keys(typeNames).map(function (t) {
            var b = Store.BRISTOL[t - 1]; return b.emoji + ' ×' + typeNames[t];
          }).join(' ') + '</b></span>' : '') +
        '</div>';
    });

    // пульс 14 дней
    var info14 = { key: 'spark', from: addDays(sod(new Date()), -13), days: 14, bucket: 'day' };
    var b14 = buildBuckets(info14);
    var st14 = { dima: personStats('dima', info14), alena: personStats('alena', info14) };
    Charts.bars($('#chartSpark'), {
      labels: b14.map(function (b) { return b.label; }),
      tipTitles: b14.map(function (b) { return b.title; }),
      series: seriesOf(st14, 'values'),
      height: 190, maxBar: 22, maxLabels: 14
    });
    legendFor($('#legendSpark'), IDS);
  }

  function pluralWord(n) { return plural(n, ['поход', 'похода', 'походов']); }
  function pill(icon, label, value, unit) {
    return '<span class="fact-pill">' + icon + ' <span>' + label + '</span> <b>' + value + '</b> <span style="opacity:.6">' + unit + '</span></span>';
  }

  /* ---------------- СТАТИСТИКА ---------------- */
  function renderStats() {
    var info = periodInfo(state.period);
    var st = { dima: personStats('dima', info), alena: personStats('alena', info) };
    var total = st.dima.total + st.alena.total;

    $('#statsRangeNote').textContent = info.name + ': ' + fmtDay.format(info.from) + ' — ' + fmtDay.format(new Date()) +
      ' · всего ' + total + ' ' + pluralWord(total);

    var both = { types: {} };
    IDS.forEach(function (id) { both.types[id] = st[id].types; });

    var gaps = IDS.map(function (id) { return st[id].gap; }).filter(function (v) { return v != null; });
    var avgGap = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null;
    var durs = IDS.map(function (id) { return st[id].durAvg; }).filter(function (v) { return v != null; });
    var avgDur = durs.length ? durs.reduce(function (a, b) { return a + b; }, 0) / durs.length : null;
    var recSource = st.dima.maxDay.count >= st.alena.maxDay.count ? st.dima.maxDay : st.alena.maxDay;
    var recDay = { c: recSource.count, id: recSource.count ? (st.dima.maxDay.count >= st.alena.maxDay.count ? 'dima' : 'alena') : null, ts: recSource.ts };

    var kpis = [
      { l: 'Всего походов', v: total, s: 'Дима ' + st.dima.total + ' · Алёна ' + st.alena.total },
      { l: 'В среднем в день', v: num(round(total / info.days, 1)), s: 'на двоих, за ' + info.days + ' дн.' },
      { l: 'Рекорд дня', v: recDay.c || 0, s: recDay.c ? P[recDay.id].name + ', ' + fmtDayShort.format(new Date(recDay.ts)) : 'нет данных' },
      { l: 'Дней с походом', v: countActiveDays(info), s: 'из ' + info.days + ' в периоде' },
      { l: 'Средний интервал', v: avgGap == null ? '—' : num(round(avgGap, 1)), unit: avgGap == null ? '' : 'ч', s: 'между походами' },
      { l: 'В среднем в туалете', v: avgDur == null ? '—' : num(round(avgDur, 0)), unit: avgDur == null ? '' : 'мин', s: 'одна сессия' }
    ];
    $('#kpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><span class="kpi-label">' + k.l + '</span>' +
        '<span class="kpi-value">' + k.v + (k.unit ? '<small>' + k.unit + '</small>' : '') + '</span>' +
        '<span class="kpi-sub">' + k.s + '</span></div>';
    }).join('');

    $('#mainChartTitle').textContent = info.chartTitle;
    $('#mainChartNote').textContent = info.chartNote + ' · ' + info.name;
    var buckets = buildBuckets(info);
    Charts.bars($('#chartMain'), {
      labels: buckets.map(function (b) { return b.label; }),
      tipTitles: buckets.map(function (b) { return b.title; }),
      series: seriesOf(st, 'values'),
      height: 280, maxBar: info.bucket === 'month' ? 34 : info.days > 10 ? 16 : 26,
      maxLabels: info.bucket === 'month' ? 12 : 14
    });
    legendFor($('#legendMain'), IDS);

    renderBristol(both.types);
    renderHours();
    renderHeat(info);
    renderFacts(info, st, total);
  }

  function round(v, d) {
    var m = Math.pow(10, d || 0);
    return Math.round(v * m) / m;
  }
  // запятая как разделитель — так привычнее в русском тексте
  function num(v) { return String(v).replace('.', ','); }

  function countActiveDays(info) {
    var set = {};
    db.entries.forEach(function (e) { if (inRange(e, info)) set[dayKey(new Date(e.ts))] = 1; });
    return Object.keys(set).length;
  }

  function renderBristol(types) {
    var max = 0;
    Store.BRISTOL.forEach(function (b, i) {
      IDS.forEach(function (id) { if (types[id][i + 1] > max) max = types[id][i + 1]; });
    });
    $('#bristolChart').innerHTML = Store.BRISTOL.map(function (b, i) {
      var row = '<div class="brow"><span class="brow-label"><span class="b-emoji">' + b.emoji + '</span>' +
        (i + 1) + ' · ' + b.name + '</span><span class="brow-bars">';
      IDS.forEach(function (id, k) {
        var v = types[id][i + 1] || 0;
        row += '<span class="btrack ' + (k ? 'b' : 'a') + '" title="' + P[id].name + ': ' + v + '"><i style="width:' +
          (max ? Math.max(v ? 3 : 0, (v / max) * 100) : 0) + '%"></i><b>' + v + '</b></span>';
      });
      return row + '</span></div>';
    }).join('');
  }

  function renderHours() {
    var info90 = { key: 'h', from: addDays(sod(new Date()), -89), days: 90, bucket: 'day' };
    var st = { dima: personStats('dima', info90), alena: personStats('alena', info90) };
    var labels = [], tips = [];
    for (var i = 0; i < 24; i++) { labels.push(String(i).padStart(2, '0')); tips.push(i + ':00 — ' + i + ':59'); }
    Charts.bars($('#chartHours'), {
      labels: labels, tipTitles: tips, series: seriesOf(st, 'hours'),
      height: 250, maxBar: 14, maxLabels: 12
    });
    legendFor($('#legendHours'), IDS);
    $('#chartHours').parentNode.querySelector('.card-note').textContent =
      'За последние 90 дней · видно ваши «часы пик»';
  }

  function renderHeat(info) {
    var start, end = sod(new Date()), title, note;
    if (info.key === 'year') {
      start = addDays(end, -364); title = 'Календарь года'; note = '365 дней: чем насыщеннее цвет, тем больше было походов';
    } else if (info.key === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      title = 'Календарь месяца'; note = fmtMonth.format(end) + ' ' + end.getFullYear();
    } else {
      start = addDays(mondayOf(end), -49); title = 'Последние 8 недель'; note = 'Недели по понедельникам, строки — дни недели';
    }

    var counts = { dima: {}, alena: {}, all: {} };
    db.entries.forEach(function (e) {
      var k = dayKey(new Date(e.ts));
      counts[e.by][k] = (counts[e.by][k] || 0) + 1;
      counts.all[k] = (counts.all[k] || 0) + 1;
    });

    var use = counts[state.heat] || counts.all;
    var cells = [];
    var cur = mondayOf(start);
    var firstReal = betweenDays(cur, start);
    for (var i = 0; i < firstReal; i++) cells.push({ empty: true });
    var guard = 0;
    while (cur <= end && guard++ < 400) {
      var k = dayKey(cur);
      var c = use[k] || 0;
      cells.push({
        count: c, empty: false, month: cur.getMonth(),
        monthName: fmtMonthShort.format(cur).replace('.', ''),
        label: fmtFull.format(cur) + ' · ' + c + ' ' + pluralWord(c)
      });
      cur = addDays(cur, 1);
    }
    while (cells.length % 7) cells.push({ empty: true });

    $('#heatTitle').textContent = title;
    $('#heatNote').textContent = note;
    var color = state.heat === 'all' ? 'var(--accent)' : 'var(' + P[state.heat].varName + ')';
    $('#heatCard').style.setProperty('--heat', color);
    Charts.heat($('#heatChart'), { cells: cells, color: color, cell: window.innerWidth < 620 ? 12 : 15 });
  }

  function renderFacts(info, st, total) {
    var facts = [];
    var a = st.dima, b = st.alena;

    if (total === 0) {
      $('#facts').innerHTML = fact('🌱', 'Пока пусто', 'Добавьте первый поход во вкладке «Сегодня» — факты появятся автоматически.');
      return;
    }

    var champ = a.total === b.total ? null : (a.total > b.total ? a : b);
    var loser = champ === a ? b : a;
    if (champ) {
      var diff = loser.total ? Math.round((champ.total / loser.total - 1) * 100) : null;
      facts.push(fact('🏆', 'Чемпион периода',
        '<b>' + P[champ.id].name + '</b> — ' + champ.total + ' ' + pluralWord(champ.total) +
        (diff != null ? ', это на <b>' + diff + '%</b> больше, чем у ' + P[loser.id].gen : ' — без конкуренции')));
    } else {
      facts.push(fact('🤝', 'Ничья', 'У обоих ровно по <b>' + a.total + '</b> ' + pluralWord(a.total) + ' за ' + info.name + '.'));
    }

    var best = a.bestStreak >= b.bestStreak ? a : b;
    if (best.bestStreak > 1) {
      facts.push(fact('🔥', 'Лучшая серия за всё время', '<b>' + P[best.id].name + '</b> — <b>' + best.bestStreak + '</b> ' +
        plural(best.bestStreak, ['день', 'дня', 'дней']) + ' подряд без пропусков' +
        (best.currentStreak > 1 ? ', текущая серия — ' + best.currentStreak : '')));
    }

    var nightWho = a.night === b.night ? null : (a.night > b.night ? a : b);
    if (a.night + b.night > 0) {
      facts.push(fact('🌙', 'Ночные вылазки (00:00–06:00)',
        nightWho ? '<b>' + P[nightWho.id].name + '</b> встаёт чаще: ' + a.night + ' против ' + b.night :
        'Паритет: по <b>' + a.night + '</b> ночному походу у каждого'));
    }

    var longest = null;
    IDS.forEach(function (id) { var s = st[id]; if (s.longest && (!longest || s.longest.duration > longest.duration)) longest = s.longest; });
    if (longest) {
      facts.push(fact('⏱️', 'Самая долгая сессия', '<b>' + P[longest.by].name + '</b> — <b>' + longest.duration + '</b> ' +
        plural(longest.duration, ['минута', 'минуты', 'минут']) + ' ' + fmtDayShort.format(new Date(longest.ts))));
    }

    var idealWho = a.idealPct >= b.idealPct ? a : b;
    facts.push(fact('🍫', 'Идеальная форма (тип 3–4)',
      '<b>' + Math.round(a.idealPct * 100) + '%</b> у ' + P.dima.gen + ' против <b>' + Math.round(b.idealPct * 100) + '%</b> у ' + P.alena.gen +
      ' — лидирует ' + P[idealWho.id].name));

    var dayOfWeek = topWeekday(info);
    if (dayOfWeek) {
      facts.push(fact('📅', 'Любимый день недели', '<b>' + P[dayOfWeek.id].name + '</b> чаще всего ходит в <b>' + dayOfWeek.day + '</b>'));
    }

    var syncDays = bothDays(info);
    facts.push(fact('👯', 'Синхронность', 'В <b>' + syncDays + '</b> ' + plural(syncDays, ['день', 'дня', 'дней']) +
      ' из ' + info.days + ' сходили оба — это ' + Math.round(syncDays / info.days * 100) + '% периода'));

    var rec = a.maxDay.count >= b.maxDay.count ? { id: 'dima', m: a.maxDay } : { id: 'alena', m: b.maxDay };
    if (rec.m.count) {
      facts.push(fact('⚡', 'Рекорд одного дня', '<b>' + rec.m.count + '</b> ' + pluralWord(rec.m.count) + ' — ' +
        P[rec.id].name + ', ' + fmtDayShort.format(new Date(rec.m.ts))));
    }

    $('#facts').innerHTML = facts.join('');
  }

  function fact(ico, head, body) {
    return '<li class="fact"><span class="fact-ico">' + ico + '</span><span class="fact-body">' +
      '<span class="fact-k">' + head + '</span>' + body + '</span></li>';
  }

  function topWeekday(info) {
    var res = null;
    IDS.forEach(function (id) {
      var w = new Array(7).fill(0);
      db.entries.forEach(function (e) {
        if (e.by !== id || !inRange(e, info)) return;
        w[(new Date(e.ts).getDay() + 6) % 7]++;
      });
      var max = 0, idx = 0;
      w.forEach(function (v, i) { if (v > max) { max = v; idx = i; } });
      if (max > 0 && (!res || max > res.count)) {
        res = { id: id, count: max, day: new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(new Date(2024, 0, 1 + idx * 1)) };
      }
    });
    return res;
  }

  function bothDays(info) {
    var m = { dima: {}, alena: {} };
    db.entries.forEach(function (e) { if (inRange(e, info)) m[e.by][dayKey(new Date(e.ts))] = 1; });
    return Object.keys(m.dima).filter(function (k) { return m.alena[k]; }).length;
  }

  /* ---------------- СРАВНЕНИЕ ---------------- */
  function renderCompare() {
    var info = periodInfo(state.period);
    var st = { dima: personStats('dima', info), alena: personStats('alena', info) };
    var a = st.dima, b = st.alena;
    var total = a.total + b.total;
    var crown = total === 0 ? null : (a.total === b.total ? null : (a.total > b.total ? 'dima' : 'alena'));

    function side(id) {
      var s = st[id];
      return '<div class="vsp" style="--pc:var(' + P[id].varName + ')">' +
        '<span class="vsp-avatar">' + P[id].emoji + '</span>' +
        '<span class="vsp-name">' + P[id].name + '</span>' +
        '<span class="vsp-num">' + s.total + '</span>' +
        '<span class="vsp-unit">' + pluralWord(s.total) + ' · ' + num(round(s.avg, 1)) + ' в день</span>' +
        '</div>';
    }

    $('#versus').innerHTML = side('dima') +
      '<div class="vsp-mid">' +
        '<span class="vsp-vs">против</span>' +
        (crown ? '<span class="vsp-crown">👑 ' + P[crown].name + ' впереди</span>' :
          (total ? '<span class="vsp-crown">🤝 ничья</span>' : '<span class="vsp-crown">пока пусто</span>')) +
      '</div>' + side('alena') +
      '<div class="vsp-bottom">' +
        '<div class="ratio-wrap"></div>' +
        '<p class="card-note vsp-note">' + info.name + ': ' + fmtDay.format(info.from) + ' — ' + fmtDay.format(new Date()) +
        ' · всего ' + total + ' ' + pluralWord(total) + '</p>' +
      '</div>';
    Charts.ratio($('#versus').querySelector('.ratio-wrap'), {
      a: a.total, b: b.total, aLabel: 'Дима ' + a.total, bLabel: 'Алёна ' + b.total
    });

    function cmp(label, av, bv, fmt, higherWins) {
      var an = typeof av === 'number', bn = typeof bv === 'number';
      var better = higherWins === false ? function (x, y) { return x < y; } : function (x, y) { return x > y; };
      var eq = an && bn && av === bv;
      var aw = an && bn && !eq && better(av, bv);
      var bw = an && bn && !eq && better(bv, av);
      return '<div class="duel-row' + (aw ? ' loser-right' : bw ? ' loser-left' : '') + '">' +
        '<span class="duel-val left' + (aw ? ' win' : '') + '">' + fmt(av) + '</span>' +
        '<span class="duel-mid">' + label + '</span>' +
        '<span class="duel-val right' + (bw ? ' win' : '') + '">' + fmt(bv) + '</span>' +
        '</div>';
    }
    var n0 = function (v) { return v; };
    var dash = function (v) { return v == null ? '—' : fmtHM(v); };
    $('#duelNote').textContent = 'Сравниваем ' + info.name + '. Корона — у того, кто впереди по полезному показателю';
    $('#duel').innerHTML =
      cmp('Всего походов', a.total, b.total, n0) +
      cmp('В среднем в день', a.avg, b.avg, function (v) { return num(round(v, 2)); }) +
      cmp('Дней с походом', a.activeDays, b.activeDays, n0) +
      cmp('Рекорд за день', a.maxDay.count, b.maxDay.count, n0) +
      cmp('Лучшая серия в периоде', a.bestStreakPeriod, b.bestStreakPeriod, function (v) { return v + ' дн.'; }) +
      cmp('Идеальная форма', Math.round(a.idealPct * 100), Math.round(b.idealPct * 100), function (v) { return v + '%'; }) +
      cmp('Средняя сессия', a.durAvg, b.durAvg, function (v) { return v == null ? '—' : num(round(v, 0)) + ' мин'; }, false) +
      cmp('Ночных походов', a.night, b.night, n0, false) +
      cmp('Самый ранний поход', a.earliest, b.earliest, dash, false);

    // регулярность
    var maxReg = Math.max(a.regularity, b.regularity, 0.001);
    $('#regularity').innerHTML = IDS.map(function (id, k) {
      var s = st[id], pct = Math.round(s.regularity * 100);
      return '<div class="brow"><span class="brow-label"><span class="b-emoji">' + P[id].emoji + '</span>' + P[id].name +
        '</span><span class="brow-bars">' +
        '<span class="btrack ' + (k ? 'b' : 'a') + '"><i style="width:' + Math.round(s.regularity / maxReg * 100) + '%"></i><b>' + pct + '%</b></span>' +
        '</span></div>' +
        '<p class="card-note" style="margin:-.35rem 0 .2rem">' + s.activeDays + ' ' + plural(s.activeDays, ['день', 'дня', 'дней']) +
        ' из ' + info.days + ' · текущая серия ' + s.currentStreak + ' ' + plural(s.currentStreak, ['день', 'дня', 'дней']) +
        ' · средний интервал ' + (s.gap == null ? '—' : num(round(s.gap, 1)) + ' ч') + '</p>';
    }).join('');

    // накопительная
    var buckets = buildBuckets(info);
    var cum = IDS.map(function (id) {
      var run = 0;
      return { name: P[id].name, color: 'var(' + P[id].varName + ')',
        values: st[id].values.map(function (v) { run += v; return run; }) };
    });
    Charts.lines($('#chartCum'), {
      labels: buckets.map(function (b) { return b.label; }),
      tipTitles: buckets.map(function (b) { return b.title; }),
      series: cum, height: 240
    });
    legendFor($('#legendCum'), IDS);

    // синхронность
    var byDay = { dima: {}, alena: {} };
    db.entries.forEach(function (e) { if (inRange(e, info)) {
      var k = dayKey(new Date(e.ts));
      byDay[e.by][k] = (byDay[e.by][k] || 0) + 1;
    } });
    var shared = Object.keys(byDay.dima).filter(function (k) { return byDay.alena[k]; })
      .map(function (k) { return { k: k, d: byDay.dima[k], a: byDay.alena[k] }; })
      .sort(function (x, y) { return (y.d + y.a) - (x.d + x.a); });
    var wins = { dima: 0, alena: 0, draw: 0 };
    shared.forEach(function (s) { if (s.d > s.a) wins.dima++; else if (s.a > s.d) wins.alena++; else wins.draw++; });

    $('#sync').innerHTML = [
      tile('👯', 'Дни вдвоём', shared.length, plural(shared.length, ['день', 'дня', 'дней']) + ' из ' + info.days),
      tile('💪', 'Дни, где больше был Дима', wins.dima, plural(wins.dima, ['день', 'дня', 'дней'])),
      tile('🌸', 'Дни, где больше была Алёна', wins.alena, plural(wins.alena, ['день', 'дня', 'дней'])),
      tile('⚖️', 'Полное равенство', wins.draw, plural(wins.draw, ['день', 'дня', 'дней']))
    ].join('') + (shared.length ?
      '<p class="card-note" style="grid-column:1/-1;margin-top:.4rem">Топ совместных дней: ' +
      shared.slice(0, 4).map(function (s) {
        return '<b>' + fmtDayShort.format(new Date(s.k + 'T12:00:00')) + '</b> (Дима ' + s.d + ', Алёна ' + s.a + ')';
      }).join(' · ') + '</p>' : '');
  }

  function tile(ico, label, value, unit) {
    return '<div class="kpi"><span class="kpi-label">' + ico + ' ' + label + '</span>' +
      '<span class="kpi-value">' + value + '</span><span class="kpi-sub">' + unit + '</span></div>';
  }
  function fmtHM(mins) { return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); }

  /* ---------------- ИСТОРИЯ ---------------- */
  function renderHistory() {
    var list = db.entries.filter(function (e) { return state.filter === 'all' || e.by === state.filter; });
    $('#historyNote').textContent = list.length ? 'Всего ' + list.length + ' ' + pluralWord(list.length) +
      ' · удалите запись крестиком' : 'Записей пока нет';

    if (!list.length) {
      $('#historyList').innerHTML = '<div class="empty"><span class="empty-emoji">🚽</span>Пусто. Отметьте первый поход во вкладке «Сегодня».</div>';
      return;
    }

    var slice = list.slice(0, state.historyLimit);
    var html = '', lastDay = null;
    slice.forEach(function (e) {
      var d = new Date(e.ts);
      var k = dayKey(d);
      var b = Store.BRISTOL[e.type - 1];
      var item = '<div class="hitem">' +
        '<span class="hitem-time">' + fmtTime.format(d) + '</span>' +
        '<span class="hitem-person" style="background:var(' + P[e.by].varName + ')" title="' + P[e.by].name + '"></span>' +
        '<span class="hitem-type">' + b.emoji + ' ' + b.name + '</span>' +
        (e.duration != null ? '<span class="hitem-meta">' + e.duration + ' мин</span>' : '') +
        (e.note ? '<span class="hitem-note">' + esc(e.note) + '</span>' : '') +
        (e.demo ? '<span class="hitem-meta">демо</span>' : '') +
        '<span class="hitem-spacer"></span>' +
        '<button class="hitem-del" type="button" data-del="' + e.id + '" title="Удалить">✕</button></div>';
      if (k !== lastDay) {
        if (lastDay !== null) html += '</div></div>';
        html += '<div class="hday"><div class="hday-date">' + fmtDay.format(d) + '<span>' + fmtWeekday.format(d) + '</span></div><div class="hitems">';
        lastDay = k;
      }
      html += item;
    });
    html += '</div></div>';
    if (list.length > slice.length) {
      html += '<button class="btn" type="button" id="btnMore">Показать ещё ' + Math.min(120, list.length - slice.length) + '</button>';
    }
    $('#historyList').innerHTML = html;
    var more = $('#btnMore');
    if (more) more.addEventListener('click', function () { state.historyLimit += 120; renderHistory(); });
  }

  /* ---------------- ДАННЫЕ ---------------- */
  function renderData() {
    // Код — тяжёлая строка, генерируем её только когда вкладка действительно открыта
    if (state.tab !== 'data') return;
    $('#codeOut').value = db.entries.length ? Store.encodeCode(db.entries) : '';
    $('#codeOut').placeholder = db.entries.length ? 'Код готов — копируйте и отправляйте второму человеку' : 'Пока нечего экспортировать';
    renderSync();
  }

  /* ---------------- СИНХРОНИЗАЦИЯ ---------------- */
  var DRIVER_NOTES = {
    server:
      '<p class="drv-note"><b>Самый простой способ — один из вас запускает сервер у себя.</b><br>' +
      '1) В папке проекта: <code>python3 tools/server.py</code><br>' +
      '2) В терминале появится адрес вида <b>http://192.168.1.10:8080</b> — откройте его на обоих устройствах ' +
      '(нужна одна сеть Wi-Fi). Страница по такому адресу подключается к общей базе <b>сама</b>, ничего вводить не нужно.<br>' +
      '3) Записи хранятся в файле <b>data/kakatorium.json</b> — его можно копировать как резервную копию.<br>' +
      'Если хочется защиту от чужих — запускайте с ключом: <code>python3 tools/server.py --token мой-ключ</code> ' +
      'и впишите тот же ключ ниже.</p>',
    gist:
      '<p class="drv-note"><b>Общий Gist — если сервер держать негде</b> (вы в разных местах, и никто не хочет держать ноутбук включённым).<br>' +
      '1) Токен: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a> → ' +
      'отметить <b>gist</b> → Generate token.<br>' +
      '2) Вставить токен и нажать «Создать общий gist и подключить» — файл создастся автоматически.<br>' +
      '3) Второй человек вводит <b>тот же ID</b> и <b>свой</b> токен. Всё, база общая.<br>' +
      'Gist приватный, но это всё-таки GitHub: если тема для вас слишком личная — выбирайте свой сервер.</p>',
    off:
      '<p class="drv-note">Синхронизация выключена: записи живут только в этом браузере. ' +
      'Выберите <b>«Свой сервер»</b> — самый простой и приватный вариант, — или <b>«GitHub Gist»</b>. ' +
      'Внизу осталась передача кодом: она работает вообще без интернета.</p>'
  };

  function driverBody(cfg) {
    if (cfg.driver === 'off') return '<div class="drv">' + DRIVER_NOTES.off + '</div>';
    // токен намеренно не показываем: он уже сохранён, а в поле — только замена
    var tokenHint = cfg.token ? 'сохранён ✓ — введите новый, чтобы заменить' : 'пока не задан';
    var html = '<div class="drv">' + DRIVER_NOTES[cfg.driver] + '<div class="drv-grid">';
    if (cfg.driver === 'server') {
      html += field('Адрес общей базы', '<input class="input" id="syncUrl" type="url" placeholder="http://192.168.1.10:8080/api/data" value="' + esc(cfg.url || '') + '">') +
        field('Ключ доступа', '<input class="input" id="syncToken" type="password" autocomplete="off" placeholder="' + tokenHint + '" value="">');
    } else {
      html += field('ID общего gist', '<input class="input" id="syncGist" type="text" placeholder="например 9f1c0d…aaf2" value="' + esc(cfg.gistId || '') + '">') +
        field('Токен GitHub (право gist)', '<input class="input" id="syncToken" type="password" autocomplete="off" placeholder="' + tokenHint + '" value="">');
    }
    html += '</div>';
    if (window.Sync && Sync.status().sameOrigin && cfg.driver !== 'server') {
      html += '<p class="drv-note">🔎 Эта страница уже отдаётся нашим сервером — ' +
        '<a href="#" data-use-origin>подключить её же адрес</a> и ничего не заполнять.</p>';
    }
    if (cfg.driver === 'gist') {
      html += '<div class="data-actions"><button class="btn btn-primary" type="button" id="btnGistCreate">✨ Создать общий gist и подключить</button>' +
        (cfg.gistId ? '<span class="sync-badge">ID: ' + esc(cfg.gistId) + '</span>' : '') + '</div>';
    }
    return html + '</div>';
  }

  function field(label, control) {
    return '<div class="field"><span class="field-label">' + label + '</span>' + control + '</div>';
  }

  function syncStateHtml(st) {
    var out = [];
    if (!st.enabled) {
      out.push('<span class="sync-badge">🔒 Только этот браузер</span>');
    } else if (st.error) {
      out.push('<span class="sync-badge bad">⚠️ ' + esc(st.error) + '</span>');
    } else if (st.lastSync) {
      out.push('<span class="sync-badge ok">🔗 ' + (st.driver === 'gist' ? 'Gist' : 'Сервер') + ' подключён · обновлено ' + ago(st.lastSync) + '</span>');
    } else {
      out.push('<span class="sync-badge warn">🔗 Подключено, ещё не синхронизировали</span>');
    }
    if (st.enabled && st.pending) out.push('<span class="sync-badge warn">⏳ Ждёт отправки</span>');
    if (st.enabled) {
      out.push('<span class="sync-badge" title="Общее хранилище">' +
        (st.driver === 'gist' ? '📄 gist ' + esc(st.gistId || '—') : '🌐 ' + esc(st.url || '—')) + '</span>');
    }
    out.push('<span class="sync-badge">🗂 ' + noun(st.count, 'запись', 'записи', 'записей') + ' в базе</span>');
    if (st.error) out.push('<span class="sync-error">' + esc(st.error) + '</span>');
    return out.join('');
  }

  function renderSync() {
    if (!window.Sync) return;
    var cfg = Sync.config();
    var st = Sync.status();
    $$('#driverSeg button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.driver === cfg.driver); });
    $('#syncNote').textContent = cfg.driver === 'off'
      ? 'Сейчас каждый видит только свои записи. Включите синхронизацию — и статистика станет общей.'
      : 'Записи сами уходят на общий источник и подтягиваются оттуда. Ничего копировать не нужно.';
    $('#syncState').innerHTML = syncStateHtml(st);
    $('#syncBody').innerHTML = driverBody(cfg);
    $('#syncInterval').value = String(cfg.interval || 60);
    $('#syncAuto').checked = cfg.interval > 0;

    var devices = Object.keys(st.devices || {});
    $('#syncDevices').innerHTML = devices.length
      ? '<span class="device-chip"><span class="dot"></span>Заходили: ' + devices.map(function (id) {
          var d = st.devices[id];
          return '<b>' + esc(d.label) + '</b>' + (d.seen ? ' · ' + ago(d.seen) : '');
        }).join(' · ') + '</span>'
      : '';
    bindSyncFields(cfg);
  }

  function bindSyncFields(cfg) {
    var url = $('#syncUrl'), gist = $('#syncGist'), token = $('#syncToken');
    [['change', url, 'url'], ['change', gist, 'gistId'], ['change', token, 'token']].forEach(function (row) {
      var el = $(row[1]);
      if (!el) return;
      el.addEventListener(row[0], function () {
        var p = {};
        p[row[2]] = el.value.trim();
        if (row[2] === 'token' && !p.token) return; // пустое поле не затирает сохранённый токен
        Sync.patch(p);
        afterConfigChange();
      });
    });

    var useOrigin = $('[data-use-origin]');
    if (useOrigin) useOrigin.addEventListener('click', function (ev) {
      ev.preventDefault();
      Sync.patch({ driver: 'server', url: location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/data' });
      afterConfigChange('Адрес этого сервера подключён');
    });

    var create = $('#btnGistCreate');
    if (create) create.addEventListener('click', function () {
      setBusy(true);
      Sync.createGist().then(function (res) {
        setBusy(false);
        toast('Gist создан: ' + res.gistId + ' — передайте ID второму человеку');
        afterConfigChange();
      }, function (err) {
        setBusy(false);
        toast('Не вышло: ' + err.message);
        renderSync();
      });
    });
  }

  function setBusy(on) {
    var pill = $('#syncPill');
    pill.dataset.state = on ? 'busy' : pill.dataset.state;
    $('#btnSyncNow').disabled = !!on;
  }

  function afterConfigChange(msg) {
    renderSync();
    renderPill();
    Sync.stop();
    Sync.start();
    if (msg) toast(msg);
  }

  function renderPill() {
    if (!window.Sync) return;
    var st = Sync.status();
    var pill = $('#syncPill');
    var text = $('.sync-pill-text', pill);
    var state = 'off';
    if (st.error) state = 'error';
    else if (st.pending && st.enabled) state = 'pending';
    else if (st.enabled && st.lastSync) state = 'on';
    pill.dataset.state = state;
    text.textContent = !st.enabled ? 'локально'
      : st.error ? 'нет связи'
      : st.pending ? 'жду отправки'
      : st.lastSync ? 'синхр. ' + ago(st.lastSync) : 'подключено';
    pill.title = st.enabled
      ? (st.driver === 'gist' ? 'Gist ' + st.gistId : st.url) + (st.error ? ' · ' + st.error : '')
      : 'Синхронизация выключена — настройте во вкладке «Данные»';
  }

  /* ---------------- рендер текущего таба ---------------- */
  var renderers = { today: renderToday, stats: renderStats, compare: renderCompare, history: renderHistory, data: renderData };
  function renderCurrent() {
    reload();
    (renderers[state.tab] || renderToday)();
  }

  /* ---------------- форма ---------------- */
  function buildForm() {
    $('#whoSwitch').innerHTML = IDS.map(function (id) {
      return '<button class="who-btn' + (id === state.person ? ' is-active' : '') + '" type="button" data-who="' + id + '" title="' + P[id].name + '">' +
        '<span class="dot"></span><span class="who-emoji">' + P[id].emoji + '</span>' +
        '<span class="name">' + P[id].name + '</span></button>';
    }).join('');
    $$('#whoSwitch .who-btn').forEach(function (b) {
      b.addEventListener('click', function () { setPerson(b.dataset.who); });
    });

    $('#formWho').innerHTML = IDS.map(function (id) {
      return '<button class="chip' + (id === state.person ? ' is-active' : '') + '" type="button" data-who="' + id + '">' +
        P[id].emoji + ' ' + P[id].name + '</button>';
    }).join('');
    $$('#formWho .chip').forEach(function (b) {
      b.addEventListener('click', function () { setPerson(b.dataset.who); });
    });

    $('#formType').innerHTML = Store.BRISTOL.map(function (b, i) {
      return '<button class="chip chip-bristol' + (i + 1 === state.formType ? ' is-active' : '') + '" type="button" data-type="' + (i + 1) + '" title="' + b.desc + '">' +
        '<span class="b-emoji">' + b.emoji + '</span><span class="b-num">тип ' + (i + 1) + '</span></button>';
    }).join('');
    $$('#formType .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.formType = parseInt(b.dataset.type, 10);
        $$('#formType .chip').forEach(function (c) { c.classList.toggle('is-active', c === b); });
        $('#typeHint').textContent = Store.BRISTOL[state.formType - 1].name.toLowerCase();
      });
    });

    $('#quickAdd').innerHTML = IDS.map(function (id) {
      return '<button class="quick-btn" type="button" data-quick="' + id + '" style="--qc:var(' + P[id].varName + ')">+1 ' + P[id].name + ' сейчас</button>';
    }).join('');
    $$('#quickAdd [data-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        addEntry({ by: b.dataset.quick, ts: Date.now(), type: 4, duration: null, note: '' }, b);
      });
    });

    setWhen(new Date());
    $('#formWhen').addEventListener('change', function () {
      var d = new Date($('#formWhen').value);
      $('#whenHint').textContent = isNaN(d) ? 'сейчас' : (Math.abs(Date.now() - d.getTime()) < 120000 ? 'сейчас' : ago(d.getTime()));
    });
    $$('.step-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = $('#formDuration');
        var v = (parseInt(input.value, 10) || 0) + parseInt(b.dataset.step, 10);
        input.value = Math.max(0, Math.min(300, v));
      });
    });

    $('#logForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var when = new Date($('#formWhen').value || Date.now());
      if (isNaN(when.getTime())) when = new Date();
      addEntry({
        by: state.person,
        ts: when.getTime(),
        type: state.formType,
        duration: $('#formDuration').value === '' ? null : parseInt($('#formDuration').value, 10),
        note: $('#formNote').value.trim()
      }, $('#logForm .btn-primary'));
      $('#formNote').value = '';
      $('#formDuration').value = '';
      setWhen(new Date());
    });
  }

  function setWhen(d) {
    var v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
      'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('#formWhen').value = v;
    $('#whenHint').textContent = 'сейчас';
  }

  function setPerson(id) {
    state.person = id;
    $$('#whoSwitch .who-btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.who === id); });
    $$('#formWho .chip').forEach(function (b) { b.classList.toggle('is-active', b.dataset.who === id); });
  }

  function addEntry(data, btn) {
    var e = Store.add(data);
    if (!e) { toast('Не получилось записать — проверьте дату'); return; }
    if (btn) { btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); }
    var b = Store.BRISTOL[e.type - 1];
    toast(P[e.by].emoji + ' ' + P[e.by].name + ': поход записан ' + b.emoji + ' (' + fmtTime.format(new Date(e.ts)) + ')');
    renderAll();
    Sync.pushSoon();
  }

  /* ---------------- действия ---------------- */
  function bindActions() {
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.dataset.tab;
        $$('.tab').forEach(function (x) {
          x.classList.toggle('is-active', x === t);
          x.setAttribute('aria-selected', x === t ? 'true' : 'false');
        });
        $$('.panel').forEach(function (p) { p.classList.toggle('is-active', p.id === 'tab-' + state.tab); });
        renderCurrent();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    function syncPeriodButtons() {
      $$('[data-period-seg] button').forEach(function (x) {
        x.classList.toggle('is-active', x.dataset.period === state.period);
      });
    }
    $$('[data-period-seg] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.period = b.dataset.period;
        syncPeriodButtons();
        renderCurrent();
      });
    });
    syncPeriodButtons();

    $$('#heatSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.heat = b.dataset.heat;
        $$('#heatSeg button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
        renderHeat(periodInfo(state.period));
      });
    });

    $$('#historySeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.dataset.filter;
        $$('#historySeg button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
        renderHistory();
      });
    });

    $('#historyList').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-del]');
      if (!btn) return;
      Store.remove(btn.dataset.del);
      toast('Запись удалена');
      renderAll();
      Sync.pushSoon();
    });

    /* ---- синхронизация ---- */
    $('#syncPill').addEventListener('click', function () {
      var tab = $('.tab[data-tab="data"]');
      if (tab) tab.click();
    });

    $$('#driverSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        // явный выбор человека важнее авто-подключения
        Sync.patch({ driver: b.dataset.driver, autoDisabled: b.dataset.driver === 'off', error: '' });
        afterConfigChange(b.dataset.driver === 'off' ? 'Синхронизация выключена' : null);
        if (b.dataset.driver !== 'off') Sync.sync({ silent: true }).then(function () { renderPill(); renderSync(); });
      });
    });

    $('#btnSyncNow').addEventListener('click', function () {
      var st = Sync.status();
      if (!st.enabled) { toast('Сначала выберите способ синхронизации'); return; }
      setBusy(true);
      Sync.sync({ throwErrors: true }).then(function (res) {
        setBusy(false);
        if (res && res.error) { toast(res.error); renderSync(); return; }
        reload();
        var pulled = res && res.pulled;
        var parts = [];
        if (pulled && pulled.added) parts.push('пришло ' + noun(pulled.added, 'запись', 'записи', 'записей'));
        if (pulled && pulled.removed) parts.push('убрано ' + pulled.removed);
        parts.push(res && res.pushed ? 'отправлено' : 'всё уже на месте');
        toast('🔄 ' + parts.join(', '));
        renderAll();
      }, function (err) {
        setBusy(false);
        toast('Не связались с сервером: ' + err.message);
        renderSync();
        renderPill();
      });
    });

    $('#btnSyncTest').addEventListener('click', function () {
      var st = Sync.status();
      if (!st.enabled) { toast('Сначала выберите способ синхронизации'); return; }
      setBusy(true);
      Sync.test().then(function (res) {
        setBusy(false);
        toast('Связь есть: на сервере ' + noun(res.count, 'запись', 'записи', 'записей'));
        renderSync();
      }, function (err) {
        setBusy(false);
        toast('Связи нет: ' + err.message);
        renderSync();
      });
    });

    $('#syncAuto').addEventListener('change', function (ev) {
      Sync.patch({ interval: ev.target.checked ? parseInt($('#syncInterval').value, 10) || 60 : 0 });
      afterConfigChange();
    });

    $('#syncInterval').addEventListener('change', function (ev) {
      Sync.patch({ interval: parseInt(ev.target.value, 10) || 60 });
      if ($('#syncAuto')) $('#syncAuto').checked = true;
      afterConfigChange();
    });

    $('#btnSyncForget').addEventListener('click', function () {
      if (!window.confirm('Забыть настройки синхронизации на этом устройстве? Сами записи останутся.')) return;
      Sync.patch({ driver: 'off', url: '', token: '', gistId: '', error: '', lastSync: 0, syncedAt: 0 });
      afterConfigChange('Настройки синхронизации сброшены');
    });

    $('#btnCopyCode').addEventListener('click', function () {
      reload();
      if (!db.entries.length) { toast('Нет данных для экспорта'); return; }
      var code = Store.encodeCode(db.entries);
      $('#codeOut').value = code;
      copy(code, 'Код синхронизации скопирован (' + code.length + ' символов)');
    });

    $('#btnExport').addEventListener('click', function () {
      reload();
      var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kakatorium-' + dayKey(new Date()) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('Файл сохранён');
    });

    $('#btnImportFile').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var data = JSON.parse(fr.result);
          var res = Store.applyPayload(data);
          toast('Импорт: пришло ' + noun(res.added, 'запись', 'записи', 'записей'));
          renderAll();
          Sync.pushSoon();
        } catch (e) { toast('Не удалось прочитать файл: ' + e.message); }
      };
      fr.readAsText(f);
      ev.target.value = '';
    });

    $('#btnImportCode').addEventListener('click', function () {
      var code = $('#codeIn').value.trim();
      if (!code) { toast('Вставьте код'); return; }
      try {
        var res = Store.merge(Store.decodeCode(code).entries, { tombstones: Store.decodeCode(code).tombstones });
        $('#codeIn').value = '';
        toast('Объединено: пришло ' + noun(res.added, 'запись', 'записи', 'записей') +
          (res.skipped ? ', уже было: ' + res.skipped : '') + (res.removed ? ', убрано удалённых: ' + res.removed : ''));
        renderAll();
        Sync.pushSoon();
      } catch (e) { toast('Код не распознан: ' + e.message); }
    });

    $('#btnDemo').addEventListener('click', function () {
      var res = Store.merge(Store.demoEntries());
      toast('Добавлено ' + res.added + ' демо-записей — посмотрите статистику');
      renderAll();
      Sync.pushSoon();
    });

    $('#btnClearDemo').addEventListener('click', function () {
      Store.clearDemo();
      toast('Демо-записи удалены');
      renderAll();
      Sync.pushSoon();
    });

    $('#btnWipe').addEventListener('click', function () {
      var shared = Sync.status().enabled;
      var message = shared
        ? 'Удалить все записи? Синхронизация включена — они исчезнут и у второго человека.'
        : 'Удалить все записи безвозвратно? Сначала сделайте экспорт.';
      if (!window.confirm(message)) return;
      Store.clearAll();
      toast('История очищена');
      renderAll();
      Sync.pushSoon();
    });

    $('#themeToggle').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (state.tab !== 'data') renderCurrent(); }, 260);
    });
  }

  function copy(text, okMessage) {
    function done() { toast(okMessage); }
    function fallback() {
      var el = $('#codeOut');
      el.focus();
      el.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? okMessage : 'Скопируйте вручную: текст уже выделен');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  /* ---------------- тема ---------------- */
  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#16120F' : '#F6EFE6');
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!saved) saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved, false);
  }

  /* ---------------- старт ---------------- */
  function renderAll() {
    reload();
    renderToday();
    if (state.tab === 'stats') renderStats();
    if (state.tab === 'compare') renderCompare();
    if (state.tab === 'history') renderHistory();
    renderData();
    renderPill();
  }

  function bootSync() {
    if (!window.Sync) return;
    Sync.attachLifecycle();
    Sync.onEvent(function () {
      renderPill();
      if (state.tab === 'data') renderSync();
    });
    // пришли чужие записи — обновляем то, что видит человек
    Sync.onRemote(function (res) {
      reload();
      renderAll();
      if (res.added) toast('🔄 От напарника пришло ' + noun(res.added, 'запись', 'записи', 'записей'));
    });
    // если страницу отдаёт наш сервер — подключаемся к нему сами, без единого клика
    Sync.detectLocalServer().then(function (found) {
      Sync.start();
      renderPill();
      if (state.tab === 'data') renderSync();
      if (found && Sync.status().lastSync) toast('🔗 Общая база подключена — статистика у вас с Алёной теперь одна');
    });
  }

  // Небольшой отладочный хук: доступен в консоли браузера как window.Kakatorium
  // Каждый вызов, как и обычное действие пользователя, перечитывает хранилище.
  var api = { state: state, db: function () { reload(); return db; }, render: {} };
  Object.keys(renderers).forEach(function (name) {
    api.render[name] = function () { reload(); renderers[name](); };
  });
  window.Kakatorium = api;

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    buildForm();
    bindActions();
    renderAll();
    bootSync();
    if (!db.entries.length) {
      setTimeout(function () {
        toast('💩 Добро пожаловать! Запишите первый поход или загрузите демо-данные во вкладке «Данные»');
      }, 700);
    }
  });
})();
