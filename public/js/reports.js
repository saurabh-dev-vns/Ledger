/**
 * Reports form: the "Month" and "Custom range" choice shows one set of
 * date fields and switches the other off, so only the chosen period is
 * sent. Without JavaScript both sets stay visible; the server then uses
 * the custom range whenever From or To is filled in.
 */
(function () {
  'use strict';

  var form = document.getElementById('report-form');
  if (!form) return;

  var radios = form.querySelectorAll('input[name="mode"]');
  var monthGroup = form.querySelectorAll('.period-month');
  var rangeGroup = form.querySelectorAll('.period-range');
  var monthInput = form.querySelector('input[name="month"]');
  var fromInput = form.querySelector('input[name="from"]');
  var toInput = form.querySelector('input[name="to"]');

  function setGroup(labels, on) {
    labels.forEach(function (label) {
      label.hidden = !on;
      label.querySelectorAll('input').forEach(function (input) { input.disabled = !on; });
    });
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // First and last day of the month in the Month field, used to prefill a new range.
  function prefillRange() {
    if (fromInput.value || toInput.value) return;

    var parts = (monthInput.value || '').split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    if (!y || !m) return;

    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    fromInput.value = y + '-' + pad(m) + '-01';
    toInput.value = y + '-' + pad(m) + '-' + pad(last);
  }

  function apply() {
    var checked = form.querySelector('input[name="mode"]:checked');
    var range = !!checked && checked.value === 'range';

    if (range) prefillRange();

    setGroup(monthGroup, !range);
    setGroup(rangeGroup, range);
  }

  radios.forEach(function (radio) { radio.addEventListener('change', apply); });
  apply();
})();
