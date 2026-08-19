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

let allDays = [];
let dayLabels = { 1:'Day 1', 2:'Day 2', 3:'Day 3', 4:'Day 4', 5:'Day 5', 6:'Day 6', 7:'Day 7' };

async function loadDayLabels() {
  const { data, error } = await sb.from('i90_day_labels').select('*');
  if (error || !data) return;
  data.forEach(row => { dayLabels[row.day_number] = row.label; });
}

async function loadSchedule() {
  await loadDayLabels();
  const { data, error } = await sb.from('i90_schedule').select('*').order('row_order').order('day_number');
  if (error) { showToast('Could not load calendar'); return; }
  allDays = data;
  render();
}

// Read-only view: this page never writes anything back to the
// database. All editing - workout text, links, day headers, week
// labels, marking a day done, and adding weeks - happens on the
// Edit page instead. Workout content comes from the day's
// `workout_lines` array (each line is { text, link }), set up there.
function render() {
  const table = document.getElementById('cal-table');
  table.innerHTML = '';

  const thead = document.createElement('tr');
  const cornerTh = document.createElement('th');
  thead.appendChild(cornerTh);
  for (let d = 1; d <= 7; d++) {
    const th = document.createElement('th');
    th.textContent = dayLabels[d];
    thead.appendChild(th);
  }
  table.appendChild(thead);

  // group by row_order (each row_order = one week row)
  const weeks = {};
  allDays.forEach(d => {
    if (!weeks[d.row_order]) weeks[d.row_order] = [];
    weeks[d.row_order].push(d);
  });

  Object.keys(weeks).sort((a,b) => a - b).forEach(rowOrder => {
    const daysInRow = weeks[rowOrder].sort((a,b) => a.day_number - b.day_number);
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.className = 'cal-week-label';
    labelTd.textContent = daysInRow[0].week_label;
    tr.appendChild(labelTd);

    daysInRow.forEach(day => {
      const td = document.createElement('td');
      const lines = Array.isArray(day.workout_lines) ? day.workout_lines : [];
      const hasLink = lines.some(l => l.link);
      const hasContent = lines.some(l => (l.text || '').trim() !== '');

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (hasLink ? ' linked' : '') + (day.completed ? ' done' : '');

      lines.forEach((lineInfo) => {
        if (!lineInfo.text || lineInfo.text.trim() === '') return;
        if (lineInfo.link) {
          const a = document.createElement('a');
          a.className = 'cal-inline-link';
          a.href = lineInfo.link;
          a.textContent = lineInfo.text.trim();
          cell.appendChild(a);
        } else {
          const div = document.createElement('div');
          div.className = 'cal-text';
          div.textContent = lineInfo.text;
          cell.appendChild(div);
        }
      });

      // A day that is done shows a plain checkmark badge - no
      // checkbox, nothing clickable, purely informational here.
      if (hasContent && day.completed) {
        const badge = document.createElement('div');
        badge.className = 'cal-done-badge';
        badge.textContent = '✓ Done';
        cell.appendChild(badge);
      }

      td.appendChild(cell);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

initAuth(() => {
  loadSchedule();
});
