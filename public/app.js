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

async function loadSchedule() {
  const { data, error } = await sb.from('i90_schedule').select('*').order('row_order').order('day_number');
  if (error) { showToast('Could not load calendar'); return; }
  allDays = data;
  render();
}

function render() {
  const table = document.getElementById('cal-table');
  table.innerHTML = '';

  const thead = document.createElement('tr');
  thead.innerHTML = '<th></th>' + [1,2,3,4,5,6,7].map(d => `<th>Day ${d}</th>`).join('');
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
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (day.workout_tab ? ' linked' : '') + (day.completed ? ' done' : '');

      const textDiv = document.createElement('div');
      textDiv.className = 'cal-text';
      textDiv.contentEditable = 'true';
      textDiv.textContent = day.workout_text || '';
      textDiv.addEventListener('blur', () => saveWorkoutText(day, textDiv.textContent));
      // Enter alone commits and blurs; Shift+Enter allows a new line
      textDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          textDiv.blur();
        }
      });
      cell.appendChild(textDiv);

      const controls = document.createElement('div');
      controls.className = 'cal-controls';

      const doneLabel = document.createElement('label');
      doneLabel.style.display = 'flex';
      doneLabel.style.alignItems = 'center';
      doneLabel.style.gap = '4px';
      doneLabel.style.fontSize = '10px';
      doneLabel.style.color = 'var(--ink-soft)';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!day.completed;
      checkbox.addEventListener('change', () => saveCompleted(day, checkbox.checked, cell));
      doneLabel.appendChild(checkbox);
      doneLabel.appendChild(document.createTextNode('Done'));
      controls.appendChild(doneLabel);

      if (day.workout_tab) {
        const link = document.createElement('a');
        link.className = 'cal-link-tag';
        link.href = `weights.html?tab=${day.workout_tab}&week=${day.program_week_number}`;
        link.textContent = `🏋 ${TAB_LABELS[day.workout_tab]} →`;
        controls.appendChild(link);
      }

      cell.appendChild(controls);
      td.appendChild(cell);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

async function saveWorkoutText(day, newText) {
  if (newText === day.workout_text) return;
  const { error } = await sb.from('i90_schedule').update({ workout_text: newText, updated_at: new Date().toISOString() }).eq('id', day.id);
  if (error) { showToast('Could not save'); return; }
  day.workout_text = newText;
  showToast('Saved');
}

async function saveCompleted(day, completed, cellEl) {
  const { error } = await sb.from('i90_schedule').update({ completed, updated_at: new Date().toISOString() }).eq('id', day.id);
  if (error) { showToast('Could not save'); return; }
  day.completed = completed;
  cellEl.classList.toggle('done', completed);
}

initAuth(() => {
  loadSchedule();
});
