/* Какаториум — графики на чистом SVG (без зависимостей) */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function niceMax(v) {
    if (!(v > 0)) return 4;
    var steps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1200];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 500) * 500;
  }

  function ticks(max) {
    var count = max <= 6 ? max : max <= 20 ? 4 : 4;
    var out = [];
    for (var i = 0; i <= count; i++) out.push(Math.round((max / count) * i));
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function mount(container, svg) {
    if (!container) return;
    container.innerHTML = svg;
  }

  /* ---------- Групповые столбики ---------- */
  function bars(container, o) {
    if (!container) return;
    var labels = o.labels || [];
    var series = o.series || [];
    var W = Math.max(280, container.clientWidth || 640);
    var H = o.height || 260;
    var padL = 40, padR = 12, padT = 20, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var peak = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > peak) peak = v; }); });
    var max = niceMax(peak);
    var tk = ticks(max);
    var groupW = plotW / Math.max(1, labels.length);
    var n = series.length;
    var gap = groupW > 26 ? 3 : 1;
    var barW = Math.max(2, Math.min(o.maxBar || 26, (groupW * 0.72 - gap * (n - 1)) / n));
    var p = [];

    p.push('<line class="ch-axis" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"/>');
    tk.forEach(function (t) {
      var y = padT + plotH - (t / max) * plotH;
      if (t > 0) p.push('<line class="ch-grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>');
      p.push('<text class="ch-tick" x="' + (padL - 9) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + t + '</text>');
    });

    var step = Math.ceil(labels.length / (o.maxLabels || 12));
    var showValues = o.showValues !== false && labels.length <= 14;

    labels.forEach(function (lab, i) {
      var cx = padL + groupW * i + groupW / 2;
      var blockW = barW * n + gap * (n - 1);
      var tip = '<title>' + esc(o.tipTitles ? o.tipTitles[i] : lab) + '</title>';
      series.forEach(function (s, k) {
        var v = s.values[i] || 0;
        var h = v > 0 ? Math.max(3, (v / max) * plotH) : 0;
        var x = cx - blockW / 2 + k * (barW + gap);
        var y = padT + plotH - h;
        if (v > 0) {
          p.push('<rect class="ch-bar" style="animation-delay:' + (i * 14) + 'ms" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
            '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(7, barW / 2).toFixed(1) +
            '" fill="' + s.color + '">' + tip + '</rect>');
          if (showValues) {
            p.push('<text class="ch-value" x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) +
              '" text-anchor="middle" fill="' + s.color + '">' + v + '</text>');
          }
        } else {
          p.push('<rect class="ch-zero" x="' + x.toFixed(1) + '" y="' + (padT + plotH - 3) + '" width="' + barW.toFixed(1) + '" height="3" rx="1.5"/>');
        }
      });
      // невидимая зона для тултипа на весь интервал
      p.push('<rect class="ch-hit" x="' + (padL + groupW * i).toFixed(1) + '" y="' + padT + '" width="' + groupW.toFixed(1) + '" height="' + plotH + '">' + tip + '</rect>');
      if (i % step === 0) {
        p.push('<text class="ch-label" x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(lab) + '</text>');
      }
    });

    mount(container, '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img">' + p.join('') + '</svg>');
  }

  /* ---------- Линии (накопительная динамика) ---------- */
  function lines(container, o) {
    if (!container) return;
    var labels = o.labels || [];
    var series = o.series || [];
    var W = Math.max(280, container.clientWidth || 640);
    var H = o.height || 240;
    var padL = 40, padR = 14, padT = 18, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var peak = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > peak) peak = v; }); });
    var max = niceMax(peak);
    var tk = ticks(max);
    var stepX = plotW / Math.max(1, labels.length - 1);
    var p = [];

    tk.forEach(function (t) {
      var y = padT + plotH - (t / max) * plotH;
      if (t > 0) p.push('<line class="ch-grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>');
      p.push('<text class="ch-tick" x="' + (padL - 9) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + t + '</text>');
    });

    series.forEach(function (s, si) {
      var pts = s.values.map(function (v, i) {
        return [(padL + stepX * i).toFixed(1), (padT + plotH - (v / max) * plotH).toFixed(1)];
      });
      if (!pts.length) return;
      var path = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt[0] + ' ' + pt[1]; }).join(' ');
      var gid = 'area' + si + '-' + Math.random().toString(36).slice(2, 7);
      p.push('<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + s.color + '" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0"/>' +
        '</linearGradient></defs>');
      p.push('<path d="' + path + ' L' + pts[pts.length - 1][0] + ' ' + (padT + plotH) + ' L' + pts[0][0] + ' ' + (padT + plotH) + ' Z" fill="url(#' + gid + ')"/>');
      p.push('<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ch-line"/>');
      var dotStep = Math.ceil(labels.length / 16);
      pts.forEach(function (pt, i) {
        if (i % dotStep === 0 || i === pts.length - 1) {
          p.push('<circle class="ch-dot" cx="' + pt[0] + '" cy="' + pt[1] + '" r="3.5" fill="' + s.color + '">' +
            '<title>' + esc(o.tipTitles ? o.tipTitles[i] : labels[i]) + ': ' + s.values[i] + '</title></circle>');
        }
      });
    });

    var step = Math.ceil(labels.length / 8);
    labels.forEach(function (lab, i) {
      if (i % step === 0) {
        p.push('<text class="ch-label" x="' + (padL + stepX * i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(lab) + '</text>');
      }
    });

    mount(container, '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img">' + p.join('') + '</svg>');
  }

  /* ---------- Календарь-теплокарта ---------- */
  function heat(container, o) {
    if (!container) return;
    var cells = o.cells || [];
    var color = o.color || 'var(--accent)';
    var cell = o.cell || 15, gap = o.gap || 4;
    var left = 26, top = 20;
    var weeks = Math.ceil(cells.length / 7);
    var W = left + weeks * (cell + gap);
    var H = top + 7 * (cell + gap) + 4;
    var max = o.max || cells.reduce(function (m, c) { return Math.max(m, c.count || 0); }, 0) || 1;
    var p = [];
    var names = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс'];

    for (var r = 0; r < 7; r++) {
      if (names[r]) p.push('<text class="ch-tick" x="0" y="' + (top + r * (cell + gap) + cell - 3) + '" text-anchor="start">' + names[r] + '</text>');
    }

    var lastMonth = -1;
    cells.forEach(function (c, i) {
      var col = Math.floor(i / 7), row = i % 7;
      var x = left + col * (cell + gap), y = top + row * (cell + gap);
      if (!c.empty && c.label) {
        var m = c.month;
        if (m !== lastMonth && row === 0) {
          p.push('<text class="ch-label" x="' + x + '" y="' + (top - 7) + '" text-anchor="start">' + esc(c.monthName) + '</text>');
          lastMonth = m;
        }
      }
      if (c.empty) {
        p.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="4" fill="transparent"/>');
        return;
      }
      var lvl = c.count === 0 ? 0 : Math.min(5, 1 + Math.floor((c.count / max) * 4.2));
      var op = [0, 0.22, 0.4, 0.58, 0.78, 1][lvl];
      p.push('<rect class="ch-cell" x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="4" fill="' + color +
        '" fill-opacity="' + op + '">' + '<title>' + esc(c.label) + '</title></rect>');
    });

    mount(container, '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">' + p.join('') + '</svg>');
  }

  /* ---------- Пропорция 2 величин (кто больше) ---------- */
  function ratio(container, o) {
    if (!container) return;
    var a = o.a || 0, b = o.b || 0, total = a + b;
    var pa = total ? (a / total) * 100 : 50;
    container.innerHTML =
      '<div class="ratio">' +
      '<div class="ratio-fill ratio-a" style="width:' + pa.toFixed(2) + '%"></div>' +
      '<div class="ratio-fill ratio-b" style="width:' + (100 - pa).toFixed(2) + '%"></div>' +
      '<div class="ratio-knob" style="left:' + pa.toFixed(2) + '%">' + o.aLabel + ' · ' + o.bLabel + '</div>' +
      '</div>';
  }

  global.Charts = { bars: bars, lines: lines, heat: heat, ratio: ratio, niceMax: niceMax };
})(window);
