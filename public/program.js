// program.js
// Shared by every page. Loads the list of programs, works out which one
// is "current", draws the program bar at the top of <main>, and handles
// New Program / Finish & Archive / Restore.
//
// Which program is current:
//   1. ?program=<id> in the URL, if it exists
//   2. the one picked earlier in THIS browser tab (sessionStorage)
//   3. otherwise your chosen default program (the star), if it is active
//   4. otherwise the newest active (non-archived) program - so opening
//      the site fresh always lands on your latest program first
//   5. otherwise the newest program of any kind (everything archived)
//
// Every page then filters its data by window.currentProgram.id.

const PROGRAM_SESSION_KEY = 'i90_program_id';

window.allPrograms = [];
window.currentProgram = null;

function progStoreGet() { try { return sessionStorage.getItem(PROGRAM_SESSION_KEY); } catch (e) { return null; } }
function progStoreSet(id) { try { sessionStorage.setItem(PROGRAM_SESSION_KEY, id); } catch (e) { /* ignore */ } }

function progEsc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function progToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
}

function pickCurrentProgram(programs) {
  const urlId = new URLSearchParams(window.location.search).get('program');
  const byId = id => programs.find(p => p.id === id);
  if (urlId && byId(urlId)) return byId(urlId);
  const stored = progStoreGet();
  if (stored && byId(stored)) return byId(stored);
  const active = programs.filter(p => !p.archived_at);
  const dflt = active.find(p => p.is_default);
  if (dflt) return dflt;
  if (active.length) return active[0];   // list is newest-first
  return programs[0] || null;
}

async function initPrograms() {
  const { data, error } = await sb.from('i90_programs').select('*').order('created_at', { ascending: false });
  if (error) { progToast('Could not load programs'); return null; }
  window.allPrograms = data || [];
  window.currentProgram = pickCurrentProgram(window.allPrograms);
  if (window.currentProgram) progStoreSet(window.currentProgram.id);
  applyProgramToNav();
  renderProgramBar();
  return window.currentProgram;
}

// Nav items marked class="nav-original" only make sense for programs
// that use the original Insane90X-style logs; class="nav-custom" only
// for programs with custom weight/rep logs.
function applyProgramToNav() {
  const style = window.currentProgram ? window.currentProgram.log_style : 'original';
  document.querySelectorAll('.nav-original').forEach(el => { el.style.display = style === 'original' ? '' : 'none'; });
  document.querySelectorAll('.nav-custom').forEach(el => { el.style.display = style === 'custom' ? '' : 'none'; });
}

function renderProgramBar() {
  const main = document.querySelector('main');
  if (!main) return;
  let bar = document.getElementById('program-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'program-bar';
    bar.className = 'program-bar';
    main.insertBefore(bar, main.firstChild);
  }
  const cur = window.currentProgram;
  const active = window.allPrograms.filter(p => !p.archived_at);
  const archived = window.allPrograms.filter(p => p.archived_at);

  const opt = p => `<option value="${p.id}"${cur && p.id === cur.id ? ' selected' : ''}>${progEsc(p.name)}</option>`;
  const select = window.allPrograms.length
    ? `<select id="program-select" aria-label="Program">
         ${active.length ? `<optgroup label="Active">${active.map(opt).join('')}</optgroup>` : ''}
         ${archived.length ? `<optgroup label="Archived">${archived.map(opt).join('')}</optgroup>` : ''}
       </select>`
    : '<span class="program-none">No programs yet</span>';

  bar.innerHTML = `
    <span class="program-label">Program</span>
    ${select}
    ${cur && cur.archived_at ? '<span class="program-badge">Archived</span>' : ''}
    ${cur && cur.is_default ? '<span class="program-badge program-badge-default">★ Default</span>' : ''}
    ${cur ? `<span class="program-style">${cur.log_style === 'custom' ? 'Custom weight/rep logs' : 'Insane90X-style logs'}</span>` : ''}
    <span class="program-spacer"></span>
    <button type="button" class="btn btn-outline btn-sm" id="program-new">+ New Program</button>
    ${cur && !cur.archived_at && !cur.is_default ? '<button type="button" class="btn btn-outline btn-sm" id="program-default">★ Set as Default</button>' : ''}
    ${cur ? '<button type="button" class="btn btn-outline btn-sm" id="program-copy">Copy…</button><button type="button" class="btn btn-outline btn-sm" id="program-rename">Rename</button>' : ''}
    ${cur && !cur.archived_at ? '<button type="button" class="btn btn-outline btn-sm" id="program-finish">Finish / Archive…</button>' : ''}
    ${cur && cur.archived_at ? '<button type="button" class="btn btn-outline btn-sm" id="program-restore">Restore</button><button type="button" class="btn btn-danger btn-sm" id="program-delete">Delete…</button>' : ''}
  `;

  const sel = document.getElementById('program-select');
  if (sel) sel.addEventListener('change', () => {
    progStoreSet(sel.value);
    // drop any ?program= so the stored choice wins
    const url = new URL(window.location.href);
    url.searchParams.delete('program');
    window.location.href = url.pathname.split('/').pop() + (url.search || '');
  });
  document.getElementById('program-new').addEventListener('click', openNewProgramModal);
  // Clicking Calendar always goes to your default program, even after
  // browsing another one in this tab.
  document.querySelectorAll('a[href="index.html"]').forEach(a => {
    a.addEventListener('click', () => { try { sessionStorage.removeItem(PROGRAM_SESSION_KEY); } catch (e) { /* ignore */ } });
  });
  const df = document.getElementById('program-default');
  if (df) df.addEventListener('click', async () => {
    try { await setDefaultProgram(window.currentProgram.id); } catch (e) { progToast('Could not set default (run migration 6?)'); return; }
    window.location.reload();
  });
  const cp = document.getElementById('program-copy');
  if (cp) cp.addEventListener('click', openCopyModal);
  const rn = document.getElementById('program-rename');
  if (rn) rn.addEventListener('click', openRenameModal);
  const fin = document.getElementById('program-finish');
  if (fin) fin.addEventListener('click', () => openFinishModal(false));
  const del = document.getElementById('program-delete');
  if (del) del.addEventListener('click', () => openFinishModal(true));
  const res = document.getElementById('program-restore');
  if (res) res.addEventListener('click', restoreCurrent);

  if (!cur) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.marginTop = '14px';
    empty.innerHTML = '<div class="big">🏋️</div>No programs yet. Click <b>+ New Program</b> to start one.';
    bar.after(empty);
  }
}

// ------------------------------------------------------------------
// Modal plumbing
// ------------------------------------------------------------------
function openProgramModal(html) {
  closeProgramModal();
  const back = document.createElement('div');
  back.className = 'modal-backdrop open';
  back.id = 'program-modal';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('mousedown', e => { if (e.target === back) closeProgramModal(); });
  document.body.appendChild(back);
  return back;
}
function closeProgramModal() {
  const m = document.getElementById('program-modal');
  if (m) m.remove();
}

// ------------------------------------------------------------------
// New program
// ------------------------------------------------------------------
function openNewProgramModal() {
  const cur = window.currentProgram;
  const srcOptions = window.allPrograms.map(p =>
    `<option value="${p.id}"${cur && p.id === cur.id ? ' selected' : ''}>${progEsc(p.name)}${p.archived_at ? ' (archived)' : ''}</option>`).join('');
  const hasPrograms = window.allPrograms.length > 0;

  const m = openProgramModal(`
    <h2>New Program</h2>
    <form id="np-form">
      <div class="field">
        <label for="np-name">Name</label>
        <input type="text" id="np-name" required placeholder="e.g. Summer Swim + Strength">
      </div>

      <div class="field">
        <label>How do you want to log workouts?</label>
        <label class="choice"><input type="radio" name="np-style" value="custom" checked>
          <span><b>Custom weights &amp; reps</b><br><small>Add your own exercises, then log each workout as a date plus sets of weight × reps.</small></span></label>
        <label class="choice"><input type="radio" name="np-style" value="original">
          <span><b>Insane90X-style</b><br><small>The weight-by-week tabs and Fit Test, with calendar links straight to them.</small></span></label>
      </div>

      <div class="field">
        <label>Calendar</label>
        <label class="choice"><input type="radio" name="np-cal" value="blank" checked>
          <span><b>Blank calendar</b> &nbsp;<input type="number" id="np-weeks" value="13" min="1" max="52" style="width:56px;"> weeks</span></label>
        ${hasPrograms ? `<label class="choice"><input type="radio" name="np-cal" value="copy">
          <span><b>Copy the calendar from</b> <select id="np-src">${srcOptions}</select><br><small>Copies workout text, links and day names. Nothing is marked done and no logged weights come along.</small></span></label>` : ''}
      </div>

      <div id="np-status" style="font-size:12px; margin-bottom:6px;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="np-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="np-submit">Create Program</button>
      </div>
    </form>
  `);
  m.querySelector('#np-cancel').addEventListener('click', closeProgramModal);
  m.querySelector('#np-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = m.querySelector('#np-name').value.trim();
    if (!name) return;
    const style = m.querySelector('input[name=np-style]:checked').value;
    const calMode = m.querySelector('input[name=np-cal]:checked').value;
    const weeks = Math.max(1, Math.min(52, parseInt(m.querySelector('#np-weeks').value, 10) || 13));
    const srcSel = m.querySelector('#np-src');
    const btn = m.querySelector('#np-submit');
    const status = m.querySelector('#np-status');
    btn.disabled = true;
    status.textContent = 'Creating...';
    try {
      const prog = await createProgram({ name, style, calMode, weeks, sourceId: srcSel ? srcSel.value : null });
      progStoreSet(prog.id);
      window.location.href = 'index.html';
    } catch (err) {
      status.textContent = 'Could not create program: ' + (err.message || err);
      status.style.color = '#ff6b5c';
      btn.disabled = false;
    }
  });
  setTimeout(() => m.querySelector('#np-name').focus(), 0);
}

// Creates the program row, its 7 day headers and its calendar. Also
// used by "Finish & start a new round".
async function createProgram({ name, style, calMode, weeks, sourceId }) {
  const { data: prog, error } = await sb.from('i90_programs').insert({ name, log_style: style }).select().single();
  if (error) throw error;

  try {
    let labels = [1, 2, 3, 4, 5, 6, 7].map(n => ({ program_id: prog.id, day_number: n, label: `Day ${n}` }));
    let scheduleRows = [];

    if (calMode === 'copy' && sourceId) {
      const { data: srcLabels, error: lErr } = await sb.from('i90_day_labels').select('*').eq('program_id', sourceId);
      if (lErr) throw lErr;
      if (srcLabels && srcLabels.length) {
        labels = labels.map(l => {
          const found = srcLabels.find(s => s.day_number === l.day_number);
          return found ? { ...l, label: found.label } : l;
        });
      }
      const { data: srcSched, error: sErr } = await sb.from('i90_schedule').select('*').eq('program_id', sourceId).order('row_order').order('day_number');
      if (sErr) throw sErr;
      scheduleRows = (srcSched || []).map(r => ({
        program_id: prog.id,
        week_label: r.week_label,
        row_order: r.row_order,
        day_number: r.day_number,
        workout_lines: r.workout_lines || [],
        completed: false
      }));
    } else {
      for (let w = 1; w <= weeks; w++) {
        for (let d = 1; d <= 7; d++) {
          scheduleRows.push({ program_id: prog.id, week_label: `Week ${w}`, row_order: w, day_number: d, workout_lines: [], completed: false });
        }
      }
    }

    const { error: dlErr } = await sb.from('i90_day_labels').insert(labels);
    if (dlErr) throw dlErr;
    if (scheduleRows.length) {
      const { error: schErr } = await sb.from('i90_schedule').insert(scheduleRows);
      if (schErr) throw schErr;
    }

    // Custom-log programs started from a copy keep the same exercise
    // NAMES (no logged values) so the weeks line up for comparison.
    if (calMode === 'copy' && sourceId && style === 'custom') {
      const { data: srcEx } = await sb.from('i90_custom_exercises').select('*').eq('program_id', sourceId).order('row_order');
      if (srcEx && srcEx.length) {
        await sb.from('i90_custom_exercises').insert(srcEx.map((e, i) => ({ program_id: prog.id, name: e.name, row_order: i })));
      }
    }
  } catch (err) {
    // Don't leave a half-built program behind.
    await sb.from('i90_programs').delete().eq('id', prog.id);
    throw err;
  }
  return prog;
}

// ------------------------------------------------------------------
// Finish / archive / delete / restore
// ------------------------------------------------------------------
function openFinishModal(deleteOnly) {
  const cur = window.currentProgram;
  if (!cur) return;

  const m = openProgramModal(`
    <h2>${deleteOnly ? 'Delete' : 'Finish'} “${progEsc(cur.name)}”</h2>
    <form id="fp-form">
      ${deleteOnly ? '' : `
      <label class="choice"><input type="radio" name="fp-mode" value="archive" checked>
        <span><b>Archive it (keep the data)</b><br><small>Hides it from your active programs but keeps every logged weight and rep, with dates, so the Progress page can compare against it later.</small></span></label>
      <label class="choice"><input type="radio" name="fp-mode" value="delete">
        <span><b>Delete it permanently</b><br><small>Removes the calendar and every logged value. This cannot be undone.</small></span></label>
      <div id="fp-newround" class="field" style="margin-top:12px;">
        <label class="choice"><input type="checkbox" id="fp-newround-on" checked>
          <span><b>Start a fresh round right away</b><br><small>Creates a new program with the same calendar (nothing marked done, no logged values) and makes it your current program.</small></span></label>
        <input type="text" id="fp-newname" value="${progEsc(cur.name)} (new round)" style="margin-top:6px;">
      </div>`}
      <div id="fp-confirm-wrap" style="display:${deleteOnly ? 'block' : 'none'}; margin-top:12px;">
        <div class="field">
          <label for="fp-confirm">Type the program name to confirm</label>
          <input type="text" id="fp-confirm" autocomplete="off" placeholder="${progEsc(cur.name)}">
        </div>
      </div>
      <div id="fp-status" style="font-size:12px; margin-top:6px;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="fp-cancel">Cancel</button>
        <button type="submit" class="btn ${deleteOnly ? 'btn-danger' : 'btn-primary'}" id="fp-submit">${deleteOnly ? 'Delete Forever' : 'Archive'}</button>
      </div>
    </form>
  `);

  const form = m.querySelector('#fp-form');
  const confirmWrap = m.querySelector('#fp-confirm-wrap');
  const submit = m.querySelector('#fp-submit');
  const newRound = m.querySelector('#fp-newround');

  function currentMode() {
    if (deleteOnly) return 'delete';
    return form.querySelector('input[name=fp-mode]:checked').value;
  }
  function syncMode() {
    const mode = currentMode();
    confirmWrap.style.display = mode === 'delete' ? 'block' : 'none';
    if (newRound) newRound.style.display = mode === 'archive' ? 'block' : 'none';
    if (!deleteOnly) {
      submit.textContent = mode === 'delete' ? 'Delete Forever' : 'Archive';
      submit.className = 'btn ' + (mode === 'delete' ? 'btn-danger' : 'btn-primary');
    }
  }
  form.querySelectorAll('input[name=fp-mode]').forEach(r => r.addEventListener('change', syncMode));
  syncMode();
  m.querySelector('#fp-cancel').addEventListener('click', closeProgramModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = currentMode();
    const status = m.querySelector('#fp-status');
    if (mode === 'delete' && m.querySelector('#fp-confirm').value.trim() !== cur.name) {
      status.textContent = 'The name does not match - nothing was deleted.';
      status.style.color = '#ff6b5c';
      return;
    }
    submit.disabled = true;
    status.style.color = '';
    status.textContent = 'Working...';
    try {
      let nextId = null;
      if (mode === 'archive') {
        const startNew = m.querySelector('#fp-newround-on').checked;
        if (startNew) {
          const name = m.querySelector('#fp-newname').value.trim() || `${cur.name} (new round)`;
          const np = await createProgram({ name, style: cur.log_style, calMode: 'copy', weeks: 13, sourceId: cur.id });
          nextId = np.id;
        }
        const { error } = await sb.from('i90_programs').update({ archived_at: new Date().toISOString(), is_default: false }).eq('id', cur.id);
        if (error) throw error;
        if (nextId && cur.is_default) await setDefaultProgram(nextId);
      } else {
        const { error } = await sb.from('i90_programs').delete().eq('id', cur.id);
        if (error) throw error;
      }
      if (nextId) progStoreSet(nextId);
      else { try { sessionStorage.removeItem(PROGRAM_SESSION_KEY); } catch (err) { /* ignore */ } }
      window.location.href = 'index.html';
    } catch (err) {
      status.textContent = 'Could not finish: ' + (err.message || err);
      status.style.color = '#ff6b5c';
      submit.disabled = false;
    }
  });
}

async function restoreCurrent() {
  const cur = window.currentProgram;
  if (!cur) return;
  const { error } = await sb.from('i90_programs').update({ archived_at: null }).eq('id', cur.id);
  if (error) { progToast('Could not restore'); return; }
  progToast('Restored');
  window.location.reload();
}

// ------------------------------------------------------------------
// Uniform calendar cells: the tallest cell (e.g. one with 3 workout
// lines) sets the height of every cell, in every week.
// ------------------------------------------------------------------
function equalizeCalendarCells() {
  const cells = document.querySelectorAll('.cal-table .cal-cell');
  if (!cells.length) return;
  cells.forEach(c => { c.style.minHeight = ''; });
  let max = 0;
  cells.forEach(c => { max = Math.max(max, c.getBoundingClientRect().height); });
  cells.forEach(c => { c.style.minHeight = Math.ceil(max) + 'px'; });
}
let _eqTimer = null;
window.addEventListener('resize', () => { clearTimeout(_eqTimer); _eqTimer = setTimeout(equalizeCalendarCells, 120); });

// ------------------------------------------------------------------
// Copy the current program's calendar into a new program
// ------------------------------------------------------------------
function openCopyModal() {
  const cur = window.currentProgram;
  if (!cur) return;
  const m = openProgramModal(`
    <h2>Copy “${progEsc(cur.name)}”</h2>
    <form id="cp-form">
      <div class="field">
        <label for="cp-name">Name for the copy</label>
        <input type="text" id="cp-name" required value="${progEsc(cur.name)} (copy)">
      </div>
      <p class="sub" style="font-size:12.5px; color:var(--ink-soft); margin-bottom:12px;">
        Copies the calendar: workout text, links, week labels and day names. Nothing is marked done and no logged weights or reps come along.
        ${cur.log_style === 'custom' ? 'Your exercise list is copied too (names only).' : ''}
      </p>
      <div class="field">
        <label>Log style for the copy</label>
        <label class="choice"><input type="radio" name="cp-style" value="custom"${cur.log_style === 'custom' ? ' checked' : ''}><span>Custom weights &amp; reps</span></label>
        <label class="choice"><input type="radio" name="cp-style" value="original"${cur.log_style === 'original' ? ' checked' : ''}><span>Insane90X-style</span></label>
      </div>
      <div id="cp-status" style="font-size:12px; margin-bottom:6px;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="cp-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="cp-submit">Create Copy</button>
      </div>
    </form>
  `);
  m.querySelector('#cp-cancel').addEventListener('click', closeProgramModal);
  m.querySelector('#cp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = m.querySelector('#cp-name').value.trim();
    if (!name) return;
    const style = m.querySelector('input[name=cp-style]:checked').value;
    const btn = m.querySelector('#cp-submit');
    const status = m.querySelector('#cp-status');
    btn.disabled = true; status.textContent = 'Copying...';
    try {
      const prog = await createProgram({ name, style, calMode: 'copy', weeks: 13, sourceId: cur.id });
      progStoreSet(prog.id);
      window.location.href = 'index.html';
    } catch (err) {
      status.textContent = 'Could not copy: ' + (err.message || err);
      status.style.color = '#ff6b5c';
      btn.disabled = false;
    }
  });
  setTimeout(() => { const i = m.querySelector('#cp-name'); i.focus(); i.select(); }, 0);
}

// ------------------------------------------------------------------
// Rename
// ------------------------------------------------------------------
function openRenameModal() {
  const cur = window.currentProgram;
  if (!cur) return;
  const m = openProgramModal(`
    <h2>Rename program</h2>
    <form id="rn-form">
      <div class="field">
        <label for="rn-name">Program name</label>
        <input type="text" id="rn-name" required value="${progEsc(cur.name)}">
      </div>
      <div id="rn-status" style="font-size:12px; margin-bottom:6px;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="rn-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="rn-submit">Save</button>
      </div>
    </form>
  `);
  m.querySelector('#rn-cancel').addEventListener('click', closeProgramModal);
  m.querySelector('#rn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = m.querySelector('#rn-name').value.trim();
    if (!name) return;
    if (name === cur.name) { closeProgramModal(); return; }
    const { error } = await sb.from('i90_programs').update({ name }).eq('id', cur.id);
    if (error) { const s = m.querySelector('#rn-status'); s.textContent = 'Could not rename.'; s.style.color = '#ff6b5c'; return; }
    window.location.reload();
  });
  setTimeout(() => { const i = m.querySelector('#rn-name'); i.focus(); i.select(); }, 0);
}

// Only one program can be the default: clear the old one first.
async function setDefaultProgram(id) {
  const { error: e1 } = await sb.from('i90_programs').update({ is_default: false }).eq('is_default', true);
  if (e1) throw e1;
  const { error: e2 } = await sb.from('i90_programs').update({ is_default: true }).eq('id', id);
  if (e2) throw e2;
}
