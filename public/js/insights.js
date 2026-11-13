/**
 * Insights page: period tabs, numbers, charts and the written insight.
 * Numbers come from GET /insights/data (SQL). The text comes from
 * POST /insights/ai (AI when available, rules otherwise). Everything
 * user-controlled is written with textContent, never as HTML.
 */
(function () {
  'use strict';

  var root = document.getElementById('insights-root');
  var initialEl = document.getElementById('insights-initial');
  if (!root || !initialEl) return;

  var charts = window.LedgerCharts;
  var csrf = root.dataset.csrf;
  var aiEnabled = root.dataset.ai === '1';

  var TREND_TITLES = {
    day: ['Last 7 days', 'Daily spending for the past week'],
    week: ['Daily spending', 'Last 7 days compared with the 7 days before'],
    month: ['Daily spending', 'This month compared with last month'],
    year: ['Monthly spending', 'This year compared with last year']
  };

  var PERIOD_NAMES = { day: 'Today', week: 'Last 7 days', month: 'This month', year: 'This year' };

  var state = { period: root.dataset.period || 'month', seq: 0, controller: null };

  function $(id) { return document.getElementById(id); }

  function rupees(n) {
    return charts ? charts.rupees(n) : '\u20B9' + (Number(n) || 0).toFixed(2);
  }

  function localToday() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function show(node, visible) {
    node.hidden = !visible;
  }

  // ---------------------------------------------------------------- numbers

  function renderKpis(data) {
    var k = data.kpis;

    $('kpi-spent').textContent = rupees(k.spent);

    var change = $('kpi-change');
    change.className = 'kpi-change';

    if (k.changePct === null) {
      change.textContent = k.count ? 'Nothing to compare with ' + data.previousLabel : 'No spending yet';
    } else {
      var arrow = k.changePct > 0 ? '\u25B2 ' : k.changePct < 0 ? '\u25BC ' : '';
      change.textContent = arrow + Math.abs(k.changePct) + '% vs ' + data.previousLabel;
      if (k.changePct > 0) change.classList.add('is-up');
      if (k.changePct < 0) change.classList.add('is-down');
    }

    $('kpi-avg').textContent = data.period === 'day' ? rupees(k.spent) : rupees(k.avgPerDay);
    $('kpi-avg-sub').textContent = data.period === 'day' ? 'for today' : 'per day over ' + k.daysInRange + ' days';

    $('kpi-count').textContent = String(k.count);
    $('kpi-count-sub').textContent = data.period === 'day'
      ? 'logged today'
      : k.activeDays + ' of ' + k.daysInRange + ' days with spending';

    if (k.biggest) {
      $('kpi-biggest').textContent = rupees(k.biggest.amount);
      $('kpi-biggest-sub').textContent = k.biggest.category;
    } else {
      $('kpi-biggest').textContent = '-';
      $('kpi-biggest-sub').textContent = 'no expenses';
    }

    $('kpi-added').textContent = rupees(k.added);
    $('kpi-added-sub').textContent = k.transfers.count
      ? k.transfers.count + ' transfer' + (k.transfers.count === 1 ? '' : 's') + ' of ' + rupees(k.transfers.total)
      : 'money added to accounts';
  }

  // ------------------------------------------------------------- categories

  function renderCategories(data) {
    var canvas = $('cat-canvas');
    var legend = $('cat-legend');
    var rows = data.categories;

    clear(legend);

    if (!rows.length) {
      if (charts) charts.unmount(canvas);
      show($('cat-box'), false);
      show($('cat-empty'), true);
      return;
    }

    show($('cat-box'), true);
    show($('cat-empty'), false);

    if (charts) charts.donut(canvas, rows, 'Spent', charts.compact(data.kpis.spent));

    rows.forEach(function (r, i) {
      var li = el('li', 'legend-row');
      var dot = el('span', 'legend-dot');
      dot.style.background = charts ? charts.categoryColor(r.category, i) : '#9AA39D';

      var name = el('span', 'legend-name', r.category);
      var amount = el('span', 'legend-amount', rupees(r.total));
      var pct = el('span', 'legend-share', r.share + '%');

      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(amount);
      li.appendChild(pct);

      if (r.changePct !== null && Math.abs(r.changePct) >= 1) {
        var chip = el('span', 'legend-change ' + (r.changePct > 0 ? 'is-up' : 'is-down'),
          (r.changePct > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(r.changePct) + '%');
        chip.title = 'Compared with ' + data.previousLabel;
        li.appendChild(chip);
      }

      legend.appendChild(li);
    });
  }

  // ------------------------------------------------------------------ trend

  function renderTrend(data) {
    var canvas = $('trend-canvas');
    var titles = TREND_TITLES[data.period];
    var t = data.trend;

    $('trend-title').textContent = titles[0];
    $('trend-sub').textContent = titles[1];

    var hasData = t.current.some(function (v) { return v > 0; }) || t.previous.some(function (v) { return v > 0; });

    show($('trend-box'), hasData);
    show($('trend-empty'), !hasData);

    if (!hasData) {
      if (charts) charts.unmount(canvas);
      return;
    }

    if (charts) charts.bars(canvas, t.labels, t.current, t.previous, 'Before');
  }

  // --------------------------------------------------------------- accounts

  function renderAccounts(data) {
    var canvas = $('acct-canvas');
    var rows = data.accounts;

    show($('acct-box'), rows.length > 0);
    show($('acct-empty'), rows.length === 0);

    if (!rows.length) {
      if (charts) charts.unmount(canvas);
      return;
    }

    // Height follows the number of bars so labels stay readable.
    $('acct-box').style.height = Math.max(140, rows.length * 44 + 40) + 'px';
    if (charts) charts.hbars(canvas, rows);
  }

  // ---------------------------------------------------------------- budgets

  function meter(label, valueText, pct, level) {
    var wrap = el('div', 'budget-mini');
    var head = el('div', 'bar-item-head');
    head.appendChild(el('span', null, label));
    head.appendChild(el('span', null, valueText));

    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill' + (level ? ' ' + level : ''));
    fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    track.appendChild(fill);

    wrap.appendChild(head);
    wrap.appendChild(track);
    return wrap;
  }

  function renderBudgets(data) {
    var list = $('budget-list');
    var items = data.budgets.items;

    clear(list);
    show($('budget-empty'), items.length === 0);

    items.forEach(function (b) {
      var level = b.pct >= 100 ? 'over' : b.pct >= 80 ? 'warn' : '';
      list.appendChild(meter(b.category, rupees(b.spent) + ' / ' + rupees(b.amount) + ' (' + b.pct + '%)', b.pct, level));
    });
  }

  function renderCreditAndLoans(data) {
    var list = $('credit-list');
    clear(list);

    data.credit.forEach(function (c) {
      var level = c.pct >= 90 ? 'over' : c.pct >= 70 ? 'warn' : '';
      list.appendChild(meter(c.name, rupees(c.used) + ' / ' + rupees(c.limit) + ' (' + c.pct + '%)', c.pct, level));
    });

    var loans = data.loans;
    var hasLoans = loans.openCount > 0;

    show($('loans-line'), hasLoans);
    if (hasLoans) {
      $('loans-line').textContent =
        'Open loans: ' + rupees(loans.owedToMe) + ' owed to you, ' + rupees(loans.iOwe) + ' you owe.';
    }

    show($('credit-empty'), data.credit.length === 0 && !hasLoans);
  }

  // ---------------------------------------------------------------- insight

  function showInsight(insight, meta) {
    var card = $('insight-card');

    card.dataset.mood = insight.mood || 'good';
    $('insight-headline').textContent = insight.headline;

    var list = $('insight-points');
    clear(list);
    (insight.points || []).forEach(function (p) { list.appendChild(el('li', null, p)); });

    var tip = $('insight-tip');
    show(tip, !!insight.tip);
    $('insight-tip-text').textContent = insight.tip || '';

    var badge = $('insight-badge');
    badge.textContent = insight.source === 'ai' ? '\u2728 AI summary' : 'Quick summary';
    badge.dataset.source = insight.source || 'rules';

    var notice = $('insight-notice');
    var text = meta && meta.notice ? meta.notice : '';
    notice.textContent = text;
    show(notice, !!text);
  }

  function setInsightPending(pending) {
    $('insight-card').classList.toggle('is-pending', pending);
    show($('insight-pending'), pending);
  }

  // ---------------------------------------------------------------- loading

  function setTabs() {
    document.querySelectorAll('.period-tab').forEach(function (btn) {
      var active = btn.dataset.period === state.period;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    });
  }

  function showError(message) {
    $('insights-error-text').textContent = message || '';
    show($('insights-error'), !!message);
  }

  function setBusy(busy) {
    root.classList.toggle('is-loading', busy);
    root.setAttribute('aria-busy', String(busy));
  }

  function render(data) {
    $('period-name').textContent = PERIOD_NAMES[data.period];
    $('period-range').textContent = data.range.from === data.range.to
      ? data.range.from
      : data.range.from + ' to ' + data.range.to;

    renderKpis(data);
    renderCategories(data);
    renderTrend(data);
    renderAccounts(data);
    renderBudgets(data);
    renderCreditAndLoans(data);
  }

  function readJson(response) {
    return response.json().then(
      function (json) { return { status: response.status, json: json }; },
      function () { throw new Error('Please reload the page and sign in again.'); }
    );
  }

  function fetchAi(period, seq) {
    if (!aiEnabled) return;

    setInsightPending(true);

    var body = new URLSearchParams({ csrf_token: csrf, period: period, today: localToday() });

    fetch('/insights/ai', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body,
      signal: state.controller.signal
    })
      .then(readJson)
      .then(function (res) {
        if (seq !== state.seq) return;
        setInsightPending(false);
        if (!res.json.ok) return;
        showInsight(res.json.insight, res.json);
      })
      .catch(function (err) {
        if (err.name === 'AbortError' || seq !== state.seq) return;
        setInsightPending(false);
      });
  }

  function loadPeriod(period) {
    state.period = period;
    var seq = ++state.seq;

    if (state.controller) state.controller.abort();
    state.controller = new AbortController();

    setTabs();
    setBusy(true);
    showError('');
    setInsightPending(false);

    try {
      history.replaceState(null, '', '?period=' + period);
    } catch (_) { /* not important */ }

    fetch('/insights/data?period=' + encodeURIComponent(period) + '&today=' + localToday(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: state.controller.signal
    })
      .then(readJson)
      .then(function (res) {
        if (seq !== state.seq) return;
        if (!res.json.ok) throw new Error(res.json.error || 'Could not load insights.');

        render(res.json.data);
        showInsight(res.json.insight, null);
        setBusy(false);
        fetchAi(period, seq);
      })
      .catch(function (err) {
        if (err.name === 'AbortError' || seq !== state.seq) return;
        setBusy(false);
        showError(err.message || 'Could not load insights. Please try again.');
      });
  }

  // ------------------------------------------------------------------ start

  document.querySelectorAll('.period-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.period !== state.period) loadPeriod(btn.dataset.period);
    });

    // Arrow keys move between tabs, like a normal tab list.
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

      var tabs = Array.prototype.slice.call(document.querySelectorAll('.period-tab'));
      var i = tabs.indexOf(btn);
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];

      next.focus();
      next.click();
    });
  });

  $('insights-retry').addEventListener('click', function () { loadPeriod(state.period); });

  var initial;

  try {
    initial = JSON.parse(initialEl.textContent);
  } catch (_) {
    loadPeriod(state.period);
    return;
  }

  setTabs();

  // The server used its own date. If the browser's date differs (for example
  // just after midnight in India), reload the numbers for the local date.
  if (initial.data.today !== localToday()) {
    loadPeriod(state.period);
    return;
  }

  var seq = ++state.seq;
  state.controller = new AbortController();

  render(initial.data);
  showInsight(initial.insight, null);
  setBusy(false);
  fetchAi(state.period, seq);
})();
