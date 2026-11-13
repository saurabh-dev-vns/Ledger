/**
 * Shared chart helpers for the dashboard and the Insights page.
 * Needs Chart.js (loaded first from /vendor/chartjs/chart.umd.min.js).
 * Exposes window.LedgerCharts. All text goes through textContent or
 * Chart.js, never innerHTML, so user-typed names cannot inject markup.
 */
(function () {
  'use strict';

  if (typeof Chart === 'undefined') {
    window.LedgerCharts = null;
    return;
  }

  var css = getComputedStyle(document.documentElement);
  var color = function (name, fallback) {
    return (css.getPropertyValue(name) || '').trim() || fallback;
  };

  var INK = color('--ink', '#1F2A24');
  var INK_SOFT = color('--ink-soft', '#5B6660');
  var LINE = color('--line-soft', '#EAE3D2');
  var GREEN = color('--green', '#2F5D50');
  var RUST = color('--rust', '#B5533C');

  // One fixed colour per category so it looks the same on every chart.
  var CATEGORY_COLORS = {
    'Food & Dining': '#B5533C',
    'Transport': '#2F5D50',
    'Groceries': '#C89B3C',
    'Shopping': '#7B8FB0',
    'Bills & Utilities': '#5E8C7B',
    'Rent': '#8A5A44',
    'Entertainment': '#A9739B',
    'Health': '#4F8FA3',
    'Education': '#9A9A4B',
    'Travel': '#D98C5F',
    'Other': '#9AA39D'
  };
  var EXTRA_COLORS = ['#6C8EAD', '#B08968', '#7A9E7E', '#C7A26B', '#8E7DBE'];

  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = INK_SOFT;
  Chart.defaults.animation = false;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = INK;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;

  var rupeeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  var compactFormat = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

  function rupees(n) {
    return '\u20B9' + rupeeFormat.format(Number(n) || 0);
  }

  function compact(n) {
    return '\u20B9' + compactFormat.format(Number(n) || 0);
  }

  function categoryColor(name, index) {
    return CATEGORY_COLORS[name] || EXTRA_COLORS[index % EXTRA_COLORS.length];
  }

  // Keeps one chart per canvas, so switching tabs never stacks charts.
  var registry = new Map();

  function mount(canvas, config) {
    var old = registry.get(canvas);
    if (old) old.destroy();

    var chart = new Chart(canvas, config);
    registry.set(canvas, chart);
    return chart;
  }

  function unmount(canvas) {
    var old = registry.get(canvas);
    if (old) {
      old.destroy();
      registry.delete(canvas);
    }
  }

  // Writes the total in the middle of a doughnut.
  var centerText = {
    id: 'ledgerCenterText',
    afterDraw: function (chart, args, opts) {
      if (!opts || !opts.text) return;

      var area = chart.chartArea;
      var ctx = chart.ctx;
      var x = (area.left + area.right) / 2;
      var y = (area.top + area.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK_SOFT;
      ctx.font = "500 11px 'Inter', sans-serif";
      ctx.fillText(opts.label || '', x, y - 12);
      ctx.fillStyle = INK;
      ctx.font = "600 18px 'Fraunces', Georgia, serif";
      ctx.fillText(opts.text, x, y + 8);
      ctx.restore();
    }
  };

  /** rows: [{ category, total, share }] */
  function donut(canvas, rows, centerLabel, centerValue) {
    return mount(canvas, {
      type: 'doughnut',
      data: {
        labels: rows.map(function (r) { return r.category; }),
        datasets: [{
          data: rows.map(function (r) { return r.total; }),
          backgroundColor: rows.map(function (r, i) { return categoryColor(r.category, i); }),
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          ledgerCenterText: { label: centerLabel, text: centerValue },
          tooltip: {
            callbacks: {
              label: function (item) {
                var row = rows[item.dataIndex];
                var pct = row && typeof row.share === 'number' ? ' (' + row.share + '%)' : '';
                return ' ' + item.label + ': ' + rupees(item.parsed) + pct;
              }
            }
          }
        }
      },
      plugins: [centerText]
    });
  }

  /**
   * Bars for the current period and an optional dashed line for the
   * comparison period. previous may be empty or contain nulls.
   */
  function bars(canvas, labels, current, previous, previousName) {
    var datasets = [{
      type: 'bar',
      label: 'Spent',
      data: current,
      backgroundColor: GREEN,
      hoverBackgroundColor: RUST,
      borderRadius: 4,
      maxBarThickness: 28,
      order: 2
    }];

    if (previous && previous.length) {
      datasets.push({
        type: 'line',
        label: previousName || 'Before',
        data: previous,
        borderColor: '#9AA39D',
        borderDash: [5, 4],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        spanGaps: false,
        order: 1
      });
    }

    return mount(canvas, {
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: {
            beginAtZero: true,
            grid: { color: LINE },
            border: { display: false },
            ticks: { callback: function (v) { return compact(v); }, maxTicksLimit: 5 }
          }
        },
        plugins: {
          legend: { display: !!(previous && previous.length), position: 'bottom', labels: { boxWidth: 12, boxHeight: 3, usePointStyle: false } },
          tooltip: {
            callbacks: {
              label: function (item) {
                return ' ' + item.dataset.label + ': ' + rupees(item.parsed.y);
              }
            }
          }
        }
      }
    });
  }

  /** Horizontal bars. rows: [{ name, total }] */
  function hbars(canvas, rows) {
    return mount(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.name; }),
        datasets: [{
          data: rows.map(function (r) { return r.total; }),
          backgroundColor: rows.map(function (r, i) { return categoryColor('', i + 2); }),
          borderRadius: 4,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: LINE },
            border: { display: false },
            ticks: { callback: function (v) { return compact(v); }, maxTicksLimit: 5 }
          },
          y: { grid: { display: false } }
        },
        plugins: {
          tooltip: { callbacks: { label: function (item) { return ' ' + rupees(item.parsed.x); } } }
        }
      }
    });
  }

  window.LedgerCharts = {
    rupees: rupees,
    compact: compact,
    categoryColor: categoryColor,
    donut: donut,
    bars: bars,
    hbars: hbars,
    unmount: unmount
  };
})();
