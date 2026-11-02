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

// Every place a calendar line can link to, shown as readable text.
// Weeks per tab match the weight log pages.
const TAB_LABELS = {
  legs_back: 'Legs & Back',
  shoulders_arms: 'Shoulders & Arms',
  chest_back: 'Chest & Back',
  chest_shoulders_tri: 'Chest, Shoulders & Tri',
  back_biceps: 'Back & Biceps'
};
const TAB_WEEKS = {
  legs_back: [1,2,3,4,6,7,8,9,10,11,12,13],
  shoulders_arms: [1,2,3,4,10,12],
  chest_back: [1,2,3,4,10,12],
  chest_shoulders_tri: [6,7,8,9,11,13],
  back_biceps: [6,7,8,9,11,13]
};
const CUSTOM_LINK = '__custom__';

function linkOptionGroups() {
  const groups = [];
  Object.keys(TAB_LABELS).forEach(tab => {
    groups.push({
      label: TAB_LABELS[tab],
      options: TAB_WEEKS[tab].map(w => ({ value: `weights.html?tab=${tab}&week=${w}`, text: `${TAB_LABELS[tab]} - Week ${w}` }))
    });
  });
  const fit = [1,2,3,4,5,6,7].map(n => ({ value: `fittest.html?test=test${n}`, text: `Fit Test - Test ${n}` }));
  fit.push({ value: 'fittest.html?test=graduation', text: 'Fit Test - Graduation' });
  groups.push({ label: 'Fit Test', options: fit });
  groups.push({ label: 'Other', options: [
    { value: 'log.html', text: 'Workout Log page' },
    { value: CUSTOM_LINK, text: 'Custom web address...' }
  ]});
  return groups;
}

// A readable name for any stored link, even one not in the lists above.
function describeLink(url) {
  let m = url.match(/^weights\.html\?tab=([a-z_]+)&week=(\d+)$/);
  if (m && TAB_LABELS[m[1]]) return `${TAB_LABELS[m[1]]} - Week ${m[2]}`;
  m = url.match(/^fittest\.html\?test=(?:test(\d+)|graduation)$/);
  if (m) return m[1] ? `Fit Test - Test ${m[1]}` : 'Fit Test - Graduation';
  return null;
}

let allDays = [];
let editors = []; // one per day cell; each has .isDirty() and .save()
let dayLabels = { 1: 'Day 1', 2: 'Day 2', 3: 'Day 3', 4: 'Day 4', 5: 'Day 5', 6: 'Day 6', 7: 'Day 7' };

async function loadDayLabels() {
  const { data, error } = await sb.from('i90_day_labels').select('*').eq('program_id', currentProgram.id);
  if (error || !data) return;
  data.forEach(row => { dayLabels[row.day_number] = row.label; });
}

async function loadSchedule() {
  await loadDayLabels();
  const { data, error } = await sb.from('i90_schedule').select('*').eq('program_id', currentProgram.id).order('row_order').order('day_number');
  if (error) { showToast('Could not load calendar'); return; }
  allDays = data;
  render();
}

function render() {
  const table = document.getElementById('cal-table');
  table.innerHTML = '';
  editors = [];
  updateSaveBar();

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
  equalizeCalendarCells();
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

  let dirty = false;
  function markDirty() {
    dirty = true;
    cell.classList.add('cal-dirty');
    updateSaveBar();
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

    // One dropdown, all choices in words. A link that is not in the
    // standard lists (an older week, or a typed web address) is still
    // shown by name / address, never as a bare number.
    const known = linkOptionGroups();
    const allValues = new Set(known.flatMap(g => g.options.map(o => o.value)));
    let selectedValue = '';
    let customUrl = '';
    let extraOption = null;
    if (line.link) {
      if (allValues.has(line.link)) selectedValue = line.link;
      else if (describeLink(line.link)) { selectedValue = line.link; extraOption = { value: line.link, text: describeLink(line.link) }; }
      else { selectedValue = CUSTOM_LINK; customUrl = line.link; }
    }

    const typeSelect = document.createElement('select');
    typeSelect.className = 'cal-line-linktype';
    typeSelect.setAttribute('aria-label', 'Link to');
    const none = document.createElement('option');
    none.value = ''; none.textContent = 'No link';
    typeSelect.appendChild(none);
    if (extraOption) {
      const o = document.createElement('option');
      o.value = extraOption.value; o.textContent = extraOption.text;
      typeSelect.appendChild(o);
    }
    known.forEach(g => {
      const og = document.createElement('optgroup');
      og.label = g.label;
      g.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.text;
        og.appendChild(o);
      });
      typeSelect.appendChild(og);
    });
    typeSelect.value = selectedValue;

    const detailInput = document.createElement('input');
    detailInput.type = 'text';
    detailInput.className = 'cal-line-detail';
    detailInput.placeholder = 'https://...';
    detailInput.value = customUrl;
    detailInput.style.display = selectedValue === CUSTOM_LINK ? '' : 'none';

    function syncLink() {
      const v = typeSelect.value;
      workingLines[idx].link = v === CUSTOM_LINK ? ((detailInput.value || '').trim() || null) : (v || null);
      markDirty();
    }
    typeSelect.addEventListener('change', () => {
      detailInput.style.display = typeSelect.value === CUSTOM_LINK ? '' : 'none';
      if (typeSelect.value === CUSTOM_LINK) detailInput.focus();
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
    if (cell.isConnected) equalizeCalendarCells();
  }
  renderLines();

  cell.appendChild(addLineBtn);
  cell.appendChild(controls);

  // Saves this day only if it has unsaved changes. Returns true on
  // success (or nothing to do), false on error.
  async function saveCell() {
    if (!dirty) return true;
    const cleanLines = workingLines
      .map(l => ({ text: (l.text || '').trim(), link: l.link || null }))
      .filter(l => l.text !== '' || l.link);

    const { error } = await sb.from('i90_schedule').update({
      workout_lines: cleanLines,
      completed: workingCompleted,
      updated_at: new Date().toISOString()
    }).eq('id', day.id);
    if (error) return false;

    day.workout_lines = cleanLines;
    day.completed = workingCompleted;
    workingLines = cleanLines.map(l => ({ ...l }));
    renderLines();
    dirty = false;
    cell.classList.remove('cal-dirty');
    return true;
  }
  editors.push({ isDirty: () => dirty, save: saveCell });

  return cell;
}

async function saveDayLabel(dayNumber, newLabel) {
  const trimmed = newLabel.trim() || `Day ${dayNumber}`;
  if (trimmed === dayLabels[dayNumber]) return;
  const { error } = await sb.from('i90_day_labels').upsert({ program_id: currentProgram.id, day_number: dayNumber, label: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'program_id,day_number' });
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

// ---- Save All ----
function dirtyCount() { return editors.filter(e => e.isDirty()).length; }

function updateSaveBar() {
  const bar = document.getElementById('save-bar');
  if (!bar) return;
  const n = dirtyCount();
  bar.classList.toggle('show', n > 0);
  document.getElementById('save-bar-count').textContent = `${n} unsaved day${n === 1 ? '' : 's'}`;
}

let savingAll = false;
async function saveAll() {
  if (savingAll) return;
  const pending = editors.filter(e => e.isDirty());
  if (!pending.length) { showToast('Nothing to save'); return; }
  savingAll = true;
  const btn = document.getElementById('btn-save-all');
  btn.disabled = true; btn.textContent = 'Saving...';
  const results = await Promise.all(pending.map(e => e.save()));
  const failed = results.filter(r => !r).length;
  savingAll = false;
  btn.disabled = false; btn.textContent = 'Save All';
  updateSaveBar();
  showToast(failed ? `Saved ${results.length - failed}, ${failed} failed - try again` : `Saved ${results.length} day${results.length === 1 ? '' : 's'}`);
}
document.getElementById('btn-save-all').addEventListener('click', saveAll);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); }
});
window.addEventListener('beforeunload', (e) => {
  if (dirtyCount() > 0) { e.preventDefault(); e.returnValue = ''; }
});

document.getElementById('btn-add-week').addEventListener('click', async () => {
  // re-rendering would discard unsaved edits, so save them first
  if (dirtyCount() > 0) await saveAll();
  const maxRowOrder = allDays.reduce((max, d) => Math.max(max, d.row_order), 0);
  const newRowOrder = maxRowOrder + 1;
  const newRows = [];
  for (let day_number = 1; day_number <= 7; day_number++) {
    newRows.push({
      program_id: currentProgram.id,
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

initAuth(async () => {
  if (await initPrograms()) loadSchedule();
});
