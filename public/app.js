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

// Splits a day's workout_text into lines, and classifies each line as
// either a clickable link (to the matching Fit Test or weight/rep log)
// or plain display text. This is what avoids showing a workout name
// twice - once as text, once as a separate link below it. Workout text
// itself is read-only in the app; edit it in the database if it needs
// to change. Only the Day 1..Day 7 column headers are editable here.
function classifyLines(day) {
  const lines = (day.workout_text || '').split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    const fitMatch = trimmed.match(/^Fit Test\s*(\d+)$/i);
    if (fitMatch) {
      const n = parseInt(fitMatch[1], 10);
      const slot = n >= 8 ? 'graduation' : `test${n}`;
      return { type: 'link', text: line, href: `fittest.html?test=${slot}` };
    }
    if (idx === 0 && day.workout_tab) {
      return { type: 'link', text: line, href: `weights.html?tab=${day.workout_tab}&week=${day.program_week_number}` };
    }
    return { type: 'text', text: line };
  });
}

function render() {
  const table = document.getElementById('cal-table');
  table.innerHTML = '';

  const thead = document.createElement('tr');
  const cornerTh = document.createElement('th');
  thead.appendChild(cornerTh);
  for (let d = 1; d <= 7; d++) {
    const th = document.createElement('th');
    th.contentEditable = 'true';
    th.textContent = dayLabels[d];
    th.dataset.day = d;
    th.addEventListener('blur', () => saveDayLabel(d, th.textContent));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); th.blur(); }
    });
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
      const lines = classifyLines(day);
      const hasLink = lines.some(l => l.type === 'link');
      const hasContent = (day.workout_text || '').trim() !== '';

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (hasLink ? ' linked' : '') + (day.completed ? ' done' : '');

      lines.forEach((lineInfo) => {
        if (lineInfo.type === 'link') {
          const a = document.createElement('a');
          a.className = 'cal-inline-link';
          a.href = lineInfo.href;
          a.textContent = lineInfo.text.trim();
          cell.appendChild(a);
        } else if (lineInfo.text.trim() !== '') {
          const div = document.createElement('div');
          div.className = 'cal-text';
          div.textContent = lineInfo.text;
          cell.appendChild(div);
        }
      });

      // Only show the Done checkbox when there is actually a workout
      // logged that day - an empty rest day has nothing to check off.
      if (hasContent) {
        const controls = document.createElement('div');
        controls.className = 'cal-controls';
        const doneLabel = document.createElement('label');
        doneLabel.className = 'cal-done-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!day.completed;
        checkbox.addEventListener('change', () => saveCompleted(day, checkbox.checked, cell));
        doneLabel.appendChild(checkbox);
        doneLabel.appendChild(document.createTextNode('Done'));
        controls.appendChild(doneLabel);
        cell.appendChild(controls);
      }

      td.appendChild(cell);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

async function saveCompleted(day, completed, cellEl) {
  const { error } = await sb.from('i90_schedule').update({ completed, updated_at: new Date().toISOString() }).eq('id', day.id);
  if (error) { showToast('Could not save'); return; }
  day.completed = completed;
  cellEl.classList.toggle('done', completed);
}

async function saveDayLabel(dayNumber, newLabel) {
  const trimmed = newLabel.trim() || `Day ${dayNumber}`;
  if (trimmed === dayLabels[dayNumber]) return;
  const { error } = await sb.from('i90_day_labels').update({ label: trimmed, updated_at: new Date().toISOString() }).eq('day_number', dayNumber);
  if (error) { showToast('Could not save'); return; }
  dayLabels[dayNumber] = trimmed;
  showToast('Saved');
}

initAuth(() => {
  loadSchedule();
});
