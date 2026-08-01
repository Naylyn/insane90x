function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

const TAB_LABELS = {
  legs_back: 'Legs & Back',
  shoulders_arms: 'Shoulders & Arms',
  chest_back: 'Chest & Back',
  chest_shoulders_tri: 'Chest, Shoulders & Tri',
  back_biceps: 'Back & Biceps'
};
// The full week list per tab, matching the original spreadsheet's coverage
const TAB_WEEKS = {
  legs_back: [1,2,3,4,6,7,8,9,10,11,12,13],
  shoulders_arms: [1,2,3,4,10,12],
  chest_back: [1,2,3,4,10,12],
  chest_shoulders_tri: [6,7,8,9,11,13],
  back_biceps: [6,7,8,9,11,13]
};

const params = new URLSearchParams(window.location.search);
const tabKey = params.get('tab') || 'legs_back';
const focusWeek = params.get('week') ? parseInt(params.get('week'), 10) : null;

let rows = [];
let entriesByRow = {}; // row_id -> { week -> { label -> value_text, entryId } }

async function load() {
  document.getElementById('tab-title').textContent = (TAB_LABELS[tabKey] || 'Weight Log') + ' — Weight & Rep Log';
  document.querySelectorAll('.tab-nav a').forEach(a => {
    a.classList.toggle('btn-primary', a.href.includes(`tab=${tabKey}`));
    a.classList.toggle('btn-outline', !a.href.includes(`tab=${tabKey}`));
  });

  const { data: rowData, error: rowErr } = await sb.from('i90_weight_rows').select('*').eq('tab_key', tabKey).order('row_order');
  if (rowErr) { showToast('Could not load exercises'); return; }
  rows = rowData;

  const rowIds = rows.map(r => r.id);
  let entryData = [];
  if (rowIds.length) {
    const { data, error } = await sb.from('i90_weight_entries').select('*').in('row_id', rowIds);
    if (error) { showToast('Could not load logged values'); return; }
    entryData = data;
  }

  entriesByRow = {};
  rows.forEach(r => { entriesByRow[r.id] = {}; });
  entryData.forEach(e => {
    if (!entriesByRow[e.row_id][e.week_number]) entriesByRow[e.row_id][e.week_number] = {};
    entriesByRow[e.row_id][e.week_number][e.label] = e;
  });

  render();
}

function render() {
  const table = document.getElementById('weight-table');
  table.innerHTML = '';
  const weeks = TAB_WEEKS[tabKey] || [];

  // Header row
  const thead = document.createElement('tr');
  thead.innerHTML = '<th class="ex-col">Exercise</th>' + weeks.map(w =>
    `<th class="week-block${w === focusWeek ? ' focused' : ''}" colspan="2" data-week="${w}">Week ${w}</th>`
  ).join('');
  table.appendChild(thead);

  // Collected as [weekIdx][rowIdx] -> ordered list of that row's inputs,
  // so Tab goes RIGHT across an exercise's own sub-columns first (e.g.
  // RW then LW, which belong to the same exercise), THEN down to the
  // next exercise - matches how you actually fill this in: finish one
  // exercise's numbers before moving to the next.
  const inputsByWeekThenRow = weeks.map(() => []); // [weekIdx][rowIdx] -> [inputs in slot order]

  rows.forEach((row, rowIdx) => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.className = 'ex-col';
    nameTd.textContent = row.exercise_name;
    tr.appendChild(nameTd);

    weeks.forEach((w, weekIdx) => {
      const labels = (row.labels && row.labels.length) ? row.labels : [''];
      // Always reserve 2 sub-columns per week for alignment; second is
      // blank/unused when a row only has one label.
      const slotLabels = [labels[0] || '', labels[1] !== undefined ? labels[1] : null];

      slotLabels.forEach((label, slotIdx) => {
        const td = document.createElement('td');
        td.className = 'week-block' + (w === focusWeek ? ' focused' : '');
        td.dataset.week = w;
        if (label === null) {
          tr.appendChild(td);
          return;
        }
        const existing = (entriesByRow[row.id][w] && entriesByRow[row.id][w][label]) || null;
        const wrap = document.createElement('div');
        if (label) {
          const tag = document.createElement('span');
          tag.className = 'label-tag';
          tag.textContent = label;
          wrap.appendChild(tag);
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.value = existing ? (existing.value_text || '') : '';
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        });
        input.addEventListener('blur', () => saveEntry(row.id, w, label, input.value));
        wrap.appendChild(input);
        td.appendChild(wrap);
        tr.appendChild(td);

        if (!inputsByWeekThenRow[weekIdx][rowIdx]) inputsByWeekThenRow[weekIdx][rowIdx] = [];
        inputsByWeekThenRow[weekIdx][rowIdx].push(input);
      });
    });

    table.appendChild(tr);
  });

  // Assign tabindex: within week[0], go across row[0]'s sub-columns
  // left to right, then down to row[1], and so on through every
  // exercise, before moving on to week[1].
  let ti = 1;
  inputsByWeekThenRow.forEach(rowsInWeek => {
    rowsInWeek.forEach(inputs => {
      if (!inputs) return;
      inputs.forEach(input => { input.tabIndex = ti++; });
    });
  });

  // Scroll the focused week into view
  if (focusWeek) {
    requestAnimationFrame(() => {
      const target = table.querySelector(`th.week-block[data-week="${focusWeek}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  }
}

async function saveEntry(rowId, week, label, value) {
  const { error } = await sb.from('i90_weight_entries').upsert({
    row_id: rowId,
    week_number: week,
    label: label,
    value_text: value,
    updated_at: new Date().toISOString()
  }, { onConflict: 'row_id,week_number,label' });
  if (error) { showToast('Could not save'); return; }
  if (!entriesByRow[rowId][week]) entriesByRow[rowId][week] = {};
  entriesByRow[rowId][week][label] = { value_text: value };
}

initAuth(() => {
  load();
});
