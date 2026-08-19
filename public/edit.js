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

const LINK_TYPE_LABELS = {
  '': 'No link',
  legs_back: 'Legs & Back (week)',
  shoulders_arms: 'Shoulders & Arms (week)',
  chest_back: 'Chest & Back (week)',
  chest_shoulders_tri: 'Chest, Shoulders & Tri (week)',
  back_biceps: 'Back & Biceps (week)',
  fittest: 'Fit Test #',
  custom: 'Custom URL'
};
const WEEK_TAB_KEYS = ['legs_back', 'shoulders_arms', 'chest_back', 'chest_shoulders_tri', 'back_biceps'];

let allDays = [];
let dayLabels = { 1: 'Day 1', 2: 'Day 2', 3: 'Day 3', 4: 'Day 4', 5: 'Day 5', 6: 'Day 6', 7: 'Day 7' };

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

// Turns a stored link URL back into {type, detail} so the dropdown and
// its detail field show the right thing when a day is opened for editing.
function parseLink(url) {
  if (!url) return { type: '', detail: '' };
  let m = url.match(/^weights\.html\?tab=([a-z_]+)&week=(\d+)$/);
  if (m && WEEK_TAB_KEYS.includes(m[1])) return { type: m[1], detail: m[2] };
  m = url.match(/^fittest\.html\?test=(?:test(\d+)|graduation)$/);
  if (m) return { type: 'fittest', detail: m[1] || '8' };
  return { type: 'custom', detail: url };
}

// The reverse: turns a link type + its detail value back into a real URL.
function buildLink(type, detail) {
  if (!type) return null;
  if (type === 'custom') return (detail || '').trim() || null;
  if (type === 'fittest') {
    const n = parseInt(detail, 10);
    if (!n || n < 1) return null;
    return `fittest.html?test=${n >= 8 ? 'graduation' : 'test' + n}`;
  }
  if (WEEK_TAB_KEYS.includes(type)) {
    const week = parseInt(detail, 10);
    if (!week || week < 1) return null;
    return `weights.html?tab=${type}&week=${week}`;
  }
  return null;
}

function render() {
  const table = document.getElementById('cal-table');
  table.innerHTML = '';

  const thead = document.createElement('tr');
  thead.appendChild(document.createElement('th'));
  for (let d = 1; d <= 7; d++) {
    const th = document.createElement('th');
    th.contentEditable = 'true';
    th.textContent = dayLabels[d];
    th.addEventListener('blur', () => saveDayLabel(d, th.textContent));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); th.blur(); }
    });
    thead.appendChild(th);
  }
  table.appendChild(thead);

  const weeks = {};
  allDays.forEach(d => {
    if (!weeks[d.row_order]) weeks[d.row_order] = [];
    weeks[d.row_order].push(d);
  });

  Object.keys(weeks).sort((a, b) => a - b).forEach(rowOrder => {
    const daysInRow = weeks[rowOrder].sort((a, b) => a.day_number - b.day_number);
    const tr = document.createElement('tr');

    const labelTd = document.createElement('td');
    labelTd.className = 'cal-week-label';
    const labelDiv = document.createElement('div');
    labelDiv.contentEditable = 'true';
    labelDiv.textContent = daysInRow[0].week_label;
    labelDiv.addEventListener('blur', () => saveWeekLabel(daysInRow, labelDiv.textContent));
    labelDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); labelDiv.blur(); }
    });
    labelTd.appendChild(labelDiv);
    tr.appendChild(labelTd);

    daysInRow.forEach(day => {
      const td = document.createElement('td');
      td.appendChild(buildDayEditor(day));
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

// Builds one day's editable cell: a list of text+link line rows, an
// "Add Line" button, and a Done checkbox - none of which write to the
// database until this cell's own Save button is clicked. That is what
// prevents an accidental tap on the checkbox (or a stray keystroke in a
// line) from silently changing saved data.
function buildDayEditor(day) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell cal-edit-cell';

  const linesWrap = document.createElement('div');
  linesWrap.className = 'cal-edit-lines';
  cell.appendChild(linesWrap);

  let workingLines = (Array.isArray(day.workout_lines) ? day.workout_lines : []).map(l => ({ ...l }));
  let workingCompleted = !!day.completed;

  const addLineBtn = document.createElement('button');
  addLineBtn.type = 'button';
  addLineBtn.className = 'btn btn-outline btn-sm cal-add-line';
  addLineBtn.textContent = '+ Line';
  addLineBtn.addEventListener('click', () => {
    workingLines.push({ text: '', link: null });
    renderLines();
  });

  const controls = document.createElement('div');
  controls.className = 'cal-controls';
  const doneLabel = document.createElement('label');
  doneLabel.className = 'cal-done-label';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = workingCompleted;
  checkbox.addEventListener('change', () => { workingCompleted = checkbox.checked; markDirty(); });
  doneLabel.appendChild(checkbox);
  doneLabel.appendChild(document.createTextNode('Done'));
  controls.appendChild(doneLabel);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-sm cal-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.disabled = true;
  controls.appendChild(saveBtn);

  function markDirty() {
    cell.classList.add('cal-dirty');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }

  function buildLineRow(line, idx) {
    const row = document.createElement('div');
    row.className = 'cal-line-row';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'cal-line-text';
    textInput.value = line.text || '';
    textInput.placeholder = 'Workout text...';
    textInput.addEventListener('input', () => { workingLines[idx].text = textInput.value; markDirty(); });

    const parsed = parseLink(line.link);
    const typeSelect = document.createElement('select');
    typeSelect.className = 'cal-line-linktype';
    Object.entries(LINK_TYPE_LABELS).forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === parsed.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    const detailInput = document.createElement('input');
    detailInput.type = 'text';
    detailInput.className = 'cal-line-detail';
    detailInput.value = parsed.detail || '';
    detailInput.style.display = parsed.type ? '' : 'none';
    detailInput.placeholder = parsed.type === 'custom' ? 'URL' : parsed.type === 'fittest' ? 'Test # (1-8)' : 'Week #';

    function syncLink() {
      workingLines[idx].link = buildLink(typeSelect.value, detailInput.value);
      markDirty();
    }
    typeSelect.addEventListener('change', () => {
      detailInput.style.display = typeSelect.value ? '' : 'none';
      detailInput.placeholder = typeSelect.value === 'custom' ? 'URL' : typeSelect.value === 'fittest' ? 'Test # (1-8)' : 'Week #';
      syncLink();
    });
    detailInput.addEventListener('input', syncLink);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove line';
    removeBtn.addEventListener('click', () => {
      workingLines.splice(idx, 1);
      renderLines();
      markDirty();
    });

    const subRow = document.createElement('div');
    subRow.className = 'cal-line-linktype-row';
    subRow.appendChild(typeSelect);
    subRow.appendChild(detailInput);
    subRow.appendChild(removeBtn);

    row.appendChild(textInput);
    row.appendChild(subRow);
    return row;
  }

  function renderLines() {
    linesWrap.innerHTML = '';
    workingLines.forEach((line, idx) => linesWrap.appendChild(buildLineRow(line, idx)));
  }
  renderLines();

  cell.appendChild(addLineBtn);
  cell.appendChild(controls);

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    const cleanLines = workingLines
      .map(l => ({ text: (l.text || '').trim(), link: l.link || null }))
      .filter(l => l.text !== '' || l.link);

    const { error } = await sb.from('i90_schedule').update({
      workout_lines: cleanLines,
      completed: workingCompleted,
      updated_at: new Date().toISOString()
    }).eq('id', day.id);

    if (error) {
      showToast('Could not save');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

    day.workout_lines = cleanLines;
    day.completed = workingCompleted;
    workingLines = cleanLines.map(l => ({ ...l }));
    renderLines();
    cell.classList.remove('cal-dirty');
    saveBtn.textContent = 'Saved \u2713';
    showToast('Saved');
    setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = true; }, 1200);
  });

  return cell;
}

async function saveDayLabel(dayNumber, newLabel) {
  const trimmed = newLabel.trim() || `Day ${dayNumber}`;
  if (trimmed === dayLabels[dayNumber]) return;
  const { error } = await sb.from('i90_day_labels').update({ label: trimmed, updated_at: new Date().toISOString() }).eq('day_number', dayNumber);
  if (error) { showToast('Could not save'); return; }
  dayLabels[dayNumber] = trimmed;
  showToast('Saved');
}

// A week label is really one value shared across all 7 day rows in
// that row_order (this is how "mark this week as Recovery" works) -
// saving it updates every one of those rows in a single call.
async function saveWeekLabel(daysInRow, newLabel) {
  const trimmed = newLabel.trim();
  if (!trimmed || trimmed === daysInRow[0].week_label) return;
  const ids = daysInRow.map(d => d.id);
  const { error } = await sb.from('i90_schedule').update({ week_label: trimmed, updated_at: new Date().toISOString() }).in('id', ids);
  if (error) { showToast('Could not save'); return; }
  daysInRow.forEach(d => { d.week_label = trimmed; });
  showToast('Saved');
}

document.getElementById('btn-add-week').addEventListener('click', async () => {
  const maxRowOrder = allDays.reduce((max, d) => Math.max(max, d.row_order), 0);
  const newRowOrder = maxRowOrder + 1;
  const newRows = [];
  for (let day_number = 1; day_number <= 7; day_number++) {
    newRows.push({
      week_label: 'New Week',
      row_order: newRowOrder,
      day_number,
      workout_lines: [],
      completed: false
    });
  }
  const { data, error } = await sb.from('i90_schedule').insert(newRows).select();
  if (error) { showToast('Could not add week'); return; }
  allDays = allDays.concat(data);
  render();
  showToast('Week added - scroll down to edit it');
});

initAuth(() => {
  loadSchedule();
});
