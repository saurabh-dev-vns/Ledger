/**
 * Dashboard charts: this month by category (doughnut) and the last few
 * months (bars). If Chart.js or the data is missing, the plain lists
 * already on the page stay visible, so nothing is lost.
 */
(function () {
  'use strict';

  var charts = window.LedgerCharts;
  var dataEl = document.getElementById('dash-chart-data');
  if (!charts || !dataEl) return;

  var data;

  try {
    data = JSON.parse(dataEl.textContent);
  } catch (_) {
    return;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------------------------------------------------------- category donut
  var catWrap = document.getElementById('dash-cat-chart');
  var catCanvas = document.getElementById('dash-cat-canvas');
  var catLegend = document.getElementById('dash-cat-legend');
  var catFallback = document.getElementById('dash-cat-fallback');

  if (catWrap && catCanvas && catLegend && data.byCategory && data.byCategory.length) {
    var total = data.byCategory.reduce(function (sum, r) { return sum + r.total; }, 0);

    var rows = data.byCategory.map(function (r) {
      return {
        category: r.category,
        total: r.total,
        share: total > 0 ? Math.round((r.total / total) * 1000) / 10 : 0
      };
    });

    catWrap.hidden = false;
    charts.donut(catCanvas, rows, 'This month', charts.compact(total));

    rows.forEach(function (r, i) {
      var li = el('li', 'legend-row');
      var dot = el('span', 'legend-dot');
      dot.style.background = charts.categoryColor(r.category, i);

      li.appendChild(dot);
      li.appendChild(el('span', 'legend-name', r.category));
      li.appendChild(el('span', 'legend-amount', charts.rupees(r.total)));
      li.appendChild(el('span', 'legend-share', r.share + '%'));
      catLegend.appendChild(li);
    });

    if (catFallback) catFallback.hidden = true;
  }

  // ------------------------------------------------------------ monthly bars
  var trendWrap = document.getElementById('dash-trend-chart');
  var trendCanvas = document.getElementById('dash-trend-canvas');
  var trendFallback = document.getElementById('dash-trend-fallback');

  if (trendWrap && trendCanvas && data.trend && data.trend.length) {
    var labels = data.trend.map(function (r) {
      var parts = String(r.month).split('-');
      return MONTHS[Number(parts[1]) - 1] + ' ' + String(parts[0]).slice(2);
    });

    trendWrap.hidden = false;
    charts.bars(trendCanvas, labels, data.trend.map(function (r) { return r.total; }), [], '');

    if (trendFallback) trendFallback.hidden = true;
  }
})();
