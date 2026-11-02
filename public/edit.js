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
  const corner = document.createElement('th');
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'icon-btn cal-rearrange-all';
  allBtn.textContent = '⇄ Days';
  allBtn.title = 'Rearrange which workout goes on which day, in every week';
  allBtn.addEventListener('click', () => openRearrangeModal(null));
  corner.appendChild(allBtn);
  thead.appendChild(corner);
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

  const rowKeys = Object.keys(weeks).sort((a, b) => a - b);
  rowKeys.forEach((rowOrder, rowIdx) => {
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
    labelTd.appendChild(buildWeekControls(daysInRow, rowIdx, rowKeys.length));
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

  // Swap this day's workout with the day before / after it, same week.
  const idx = day.day_number;
  const mkSwap = (txt, title, otherDay) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn cal-swap'; b.textContent = txt; b.title = title;
    b.addEventListener('click', () => swapDaysInWeek(day, otherDay));
    return b;
  };
  if (idx > 1) controls.appendChild(mkSwap('◀', `Swap with ${dayLabels[idx - 1]}`, idx - 1));
  if (idx < 7) controls.appendChild(mkSwap('▶', `Swap with ${dayLabels[idx + 1]}`, idx + 1));

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

// =====================================================================
// Week (row) and day (column) operations
// =====================================================================
// Structural changes re-read the calendar, which would throw away
// unsaved edits - so pending edits are saved first.
async function structural(fn, doneMsg) {
  if (dirtyCount() > 0) await saveAll();
  if (dirtyCount() > 0) { showToast('Fix the unsaved days first'); return; }
  try {
    await fn();
  } catch (err) {
    showToast('Could not do that: ' + (err.message || err));
    return;
  }
  await loadSchedule();
  if (doneMsg) showToast(doneMsg);
}

function weekRows(rowOrder) { return allDays.filter(d => d.row_order === rowOrder); }

function buildWeekControls(daysInRow, rowIdx, total) {
  const rowOrder = daysInRow[0].row_order;
  const wrap = document.createElement('div');
  wrap.className = 'cal-week-controls';
  const mk = (txt, title, onClick, disabled) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn'; b.textContent = txt; b.title = title;
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    wrap.appendChild(b);
    return b;
  };
  mk('▲', 'Move this week up', () => moveWeek(rowOrder, -1), rowIdx === 0);
  mk('▼', 'Move this week down', () => moveWeek(rowOrder, +1), rowIdx === total - 1);
  mk('⧉', 'Duplicate this week (inserted right below)', () => duplicateWeek(rowOrder));
  mk('⇄', 'Rearrange days in this week only', () => openRearrangeModal(rowOrder));
  const del = mk('🗑', 'Delete this week', () => {}, false);
  // two-click delete so a stray tap never removes a week
  let armed = false, timer = null;
  del.addEventListener('click', () => {
    if (!armed) {
      armed = true; del.textContent = 'Sure?'; del.classList.add('armed');
      timer = setTimeout(() => { armed = false; del.textContent = '🗑'; del.classList.remove('armed'); }, 3000);
    } else {
      clearTimeout(timer);
      deleteWeek(rowOrder);
    }
  });
  return wrap;
}

async function moveWeek(rowOrder, dir) {
  const orders = [...new Set(allDays.map(d => d.row_order))].sort((a, b) => a - b);
  const i = orders.indexOf(rowOrder);
  const other = orders[i + dir];
  if (other === undefined) return;
  await structural(async () => {
    const a = weekRows(rowOrder).map(d => d.id), b = weekRows(other).map(d => d.id);
    const now = new Date().toISOString();
    const r1 = await sb.from('i90_schedule').update({ row_order: other, updated_at: now }).in('id', a);
    if (r1.error) throw r1.error;
    const r2 = await sb.from('i90_schedule').update({ row_order: rowOrder, updated_at: now }).in('id', b);
    if (r2.error) throw r2.error;
  }, 'Week moved');
}

async function duplicateWeek(rowOrder) {
  await structural(async () => {
    const src = weekRows(rowOrder);
    // make room: push every later week down by one
    const later = [...new Set(allDays.filter(d => d.row_order > rowOrder).map(d => d.row_order))].sort((a, b) => b - a);
    for (const ro of later) {
      const { error } = await sb.from('i90_schedule').update({ row_order: ro + 1 }).in('id', weekRows(ro).map(d => d.id));
      if (error) throw error;
    }
    const copies = src.map(d => ({
      program_id: currentProgram.id,
      week_label: `${d.week_label} (copy)`,
      row_order: rowOrder + 1,
      day_number: d.day_number,
      workout_lines: d.workout_lines || [],
      completed: false
    }));
    const { error } = await sb.from('i90_schedule').insert(copies);
    if (error) throw error;
  }, 'Week duplicated just below - rename it if you like');
}

async function deleteWeek(rowOrder) {
  await structural(async () => {
    const { error } = await sb.from('i90_schedule').delete().in('id', weekRows(rowOrder).map(d => d.id));
    if (error) throw error;
  }, 'Week deleted');
}

// Gives day `a` the workout of day `b` and vice versa (text, links, done).
async function swapContents(rowA, rowB) {
  const now = new Date().toISOString();
  const r1 = await sb.from('i90_schedule').update({ workout_lines: rowB.workout_lines || [], completed: !!rowB.completed, updated_at: now }).eq('id', rowA.id);
  if (r1.error) throw r1.error;
  const r2 = await sb.from('i90_schedule').update({ workout_lines: rowA.workout_lines || [], completed: !!rowA.completed, updated_at: now }).eq('id', rowB.id);
  if (r2.error) throw r2.error;
}

async function swapDaysInWeek(day, otherDayNumber) {
  const other = allDays.find(d => d.row_order === day.row_order && d.day_number === otherDayNumber);
  if (!other) return;
  await structural(() => swapContents(day, other), 'Swapped');
}

// mapping[target] = source day number: day `target` receives the workout
// that was on day `source`. Applied to one week, or to every week.
async function applyDayMapping(mapping, onlyRowOrder) {
  const orders = onlyRowOrder == null ? [...new Set(allDays.map(d => d.row_order))] : [onlyRowOrder];
  const now = new Date().toISOString();
  const jobs = [];
  orders.forEach(ro => {
    const rows = weekRows(ro);
    const byDay = {};
    rows.forEach(r => { byDay[r.day_number] = r; });
    for (let target = 1; target <= 7; target++) {
      const src = mapping[target];
      if (src === target || !byDay[target] || !byDay[src]) continue;
      jobs.push(sb.from('i90_schedule').update({
        workout_lines: byDay[src].workout_lines || [], completed: !!byDay[src].completed, updated_at: now
      }).eq('id', byDay[target].id));
    }
  });
  const results = await Promise.all(jobs);
  const bad = results.find(r => r.error);
  if (bad) throw bad.error;
}

function openRearrangeModal(onlyRowOrder) {
  const scopeText = onlyRowOrder == null ? 'every week' : `just “${(weekRows(onlyRowOrder)[0] || {}).week_label}”`;
  const dayOpts = sel => [1,2,3,4,5,6,7].map(n => `<option value="${n}"${n === sel ? ' selected' : ''}>${escapeHtml(dayLabels[n])}</option>`).join('');
  const rowsHtml = [1,2,3,4,5,6,7].map(n => `
    <div class="rearr-row">
      <span class="rearr-target">${escapeHtml(dayLabels[n])}</span>
      <span class="rearr-arrow">gets the workout from</span>
      <select data-target="${n}">${dayOpts(n)}</select>
    </div>`).join('');
  const m = openProgramModal(`
    <h2>Rearrange days</h2>
    <p class="sub" style="font-size:12.5px; color:var(--ink-soft); margin-bottom:12px;">
      Applies to <b>${scopeText}</b>. Example: to move Wednesday's workout to Friday, Friday's to Monday and Monday's to Wednesday, set Friday = Wednesday, Monday = Friday, Wednesday = Monday. Each day must be used exactly once. Day names stay where they are.
    </p>
    ${rowsHtml}
    <div id="rearr-status" style="font-size:12px; margin-top:8px;"></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" id="rearr-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="rearr-apply">Apply</button>
    </div>
  `);
  m.querySelector('#rearr-cancel').addEventListener('click', closeProgramModal);
  m.querySelector('#rearr-apply').addEventListener('click', async () => {
    const mapping = {};
    m.querySelectorAll('select[data-target]').forEach(s => { mapping[parseInt(s.dataset.target, 10)] = parseInt(s.value, 10); });
    const used = new Set(Object.values(mapping));
    const status = m.querySelector('#rearr-status');
    if (used.size !== 7) {
      status.textContent = 'Each day can only be used once - two days are getting the same workout.';
      status.style.color = '#ff6b5c';
      return;
    }
    closeProgramModal();
    await structural(() => applyDayMapping(mapping, onlyRowOrder), 'Days rearranged');
  });
}
