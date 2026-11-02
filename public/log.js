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

// Custom workout log: exercises belong to the current program. Each
// session is one row: a date, a list of sets ({w, r} = weight, reps)
// and an optional note.
let exercises = [];       // [{ id, name, row_order }]
let logsByExercise = {};  // exercise_id -> [session rows, newest first]

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function load() {
  const pid = currentProgram.id;
  const { data: exData, error: exErr } = await sb.from('i90_custom_exercises').select('*').eq('program_id', pid).order('row_order');
  if (exErr) { showToast('Could not load exercises'); return; }
  exercises = exData || [];

  const { data: logData, error: logErr } = await sb.from('i90_custom_logs').select('*').eq('program_id', pid).order('logged_on', { ascending: false });
  if (logErr) { showToast('Could not load logs'); return; }
  logsByExercise = {};
  exercises.forEach(e => { logsByExercise[e.id] = []; });
  (logData || []).forEach(l => { if (logsByExercise[l.exercise_id]) logsByExercise[l.exercise_id].push(l); });

  loadSuggestions();
  render();
}

// Suggest names already used anywhere (any program, plus the original
// exercise library) so the same exercise keeps the same name and can be
// compared on the Progress page.
async function loadSuggestions() {
  const names = new Set();
  const { data: a } = await sb.from('i90_custom_exercises').select('name');
  (a || []).forEach(r => names.add(r.name));
  const { data: b } = await sb.from('i90_weight_rows').select('exercise_name');
  (b || []).forEach(r => names.add(r.exercise_name));
  const dl = document.getElementById('ex-suggestions');
  dl.innerHTML = '';
  [...names].sort((x, y) => x.localeCompare(y)).forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  });
}

function render() {
  const list = document.getElementById('ex-list');
  list.innerHTML = '';
  if (!exercises.length) {
    list.innerHTML = '<div class="empty-state"><div class="big">🏋️</div>No exercises yet. Add your first one above.</div>';
    return;
  }
  exercises.forEach(ex => list.appendChild(buildCard(ex)));
}

// Two-click delete so a stray tap never removes anything: the first
// click turns the button into "Sure?", the second (within 3 seconds)
// actually deletes.
function armedDelete(btn, label, onConfirm) {
  let armed = false, timer = null;
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.dataset.orig = btn.textContent;
      btn.textContent = 'Sure?';
      btn.classList.add('btn-danger');
      timer = setTimeout(() => { armed = false; btn.textContent = btn.dataset.orig; btn.classList.remove('btn-danger'); }, 3000);
    } else {
      clearTimeout(timer);
      onConfirm();
    }
  });
}

function buildCard(ex) {
  const card = document.createElement('section');
  card.className = 'ex-card';
  card.dataset.exId = ex.id;

  const head = document.createElement('div');
  head.className = 'ex-card-head';
  const title = document.createElement('h2');
  title.contentEditable = 'true';
  title.textContent = ex.name;
  title.title = 'Click to rename';
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('blur', () => renameExercise(ex, title));
  head.appendChild(title);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary btn-sm';
  addBtn.textContent = '+ Session';
  addBtn.addEventListener('click', () => addSession(ex));
  head.appendChild(addBtn);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-outline btn-sm';
  delBtn.textContent = 'Delete';
  armedDelete(delBtn, 'exercise', () => deleteExercise(ex));
  head.appendChild(delBtn);
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'ex-card-body';
  const sessions = logsByExercise[ex.id] || [];
  if (!sessions.length) {
    const p = document.createElement('div');
    p.className = 'sub';
    p.style.cssText = 'color:var(--ink-soft); font-size:12.5px;';
    p.textContent = 'No sessions logged yet. Click + Session.';
    body.appendChild(p);
  }
  sessions.forEach((s, i) => body.appendChild(buildSessionRow(ex, s, sessions[i + 1] || null)));
  card.appendChild(body);
  return card;
}

function buildSessionRow(ex, session, prev) {
  const row = document.createElement('div');
  row.className = 'session-row';

  const date = document.createElement('input');
  date.type = 'date';
  date.value = session.logged_on;
  row.appendChild(date);

  const setsWrap = document.createElement('span');
  setsWrap.style.cssText = 'display:inline-flex; gap:6px; flex-wrap:wrap; align-items:center;';
  row.appendChild(setsWrap);

  const prevSets = prev && Array.isArray(prev.sets) ? prev.sets : [];

  function addSetPair(set, idx) {
    const pair = document.createElement('span');
    pair.className = 'set-pair';
    const w = document.createElement('input');
    w.type = 'text'; w.className = 'set-w'; w.value = set.w || '';
    w.placeholder = (prevSets[idx] && prevSets[idx].w) || 'wt';
    w.setAttribute('aria-label', `Set ${idx + 1} weight`);
    const x = document.createElement('span'); x.textContent = '×';
    const r = document.createElement('input');
    r.type = 'text'; r.className = 'set-r'; r.value = set.r || '';
    r.placeholder = (prevSets[idx] && prevSets[idx].r) || 'reps';
    r.setAttribute('aria-label', `Set ${idx + 1} reps`);
    [w, r].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      inp.addEventListener('blur', persist);
    });
    pair.append(w, x, r);
    setsWrap.appendChild(pair);
  }
  (Array.isArray(session.sets) && session.sets.length ? session.sets : [{}]).forEach(addSetPair);

  const moreSet = document.createElement('button');
  moreSet.type = 'button';
  moreSet.className = 'icon-btn';
  moreSet.textContent = '+ set';
  moreSet.title = 'Add a set';
  moreSet.addEventListener('click', () => { addSetPair({}, setsWrap.children.length); setsWrap.lastChild.querySelector('input').focus(); });
  row.appendChild(moreSet);

  const lessSet = document.createElement('button');
  lessSet.type = 'button';
  lessSet.className = 'icon-btn';
  lessSet.textContent = '− set';
  lessSet.title = 'Remove the last set';
  lessSet.addEventListener('click', () => {
    if (setsWrap.children.length > 1) { setsWrap.lastChild.remove(); persist(); }
  });
  row.appendChild(lessSet);

  const note = document.createElement('input');
  note.type = 'text'; note.className = 'note-input'; note.placeholder = 'note (optional)';
  note.value = session.note || '';
  note.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); note.blur(); } });
  note.addEventListener('blur', persist);
  row.appendChild(note);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-outline btn-sm';
  del.textContent = '✕';
  del.title = 'Delete this session';
  armedDelete(del, 'session', () => deleteSession(session));
  row.appendChild(del);

  date.addEventListener('change', persist);

  async function persist() {
    const sets = [...setsWrap.children].map(p => ({
      w: p.querySelector('.set-w').value.trim(),
      r: p.querySelector('.set-r').value.trim()
    }));
    const payload = { logged_on: date.value || todayStr(), sets, note: note.value.trim() || null, updated_at: new Date().toISOString() };
    const unchanged = payload.logged_on === session.logged_on && payload.note === (session.note || null) &&
      JSON.stringify(sets) === JSON.stringify(session.sets || []);
    if (unchanged) return;
    const { error } = await sb.from('i90_custom_logs').update(payload).eq('id', session.id);
    if (error) { showToast('Could not save'); return; }
    Object.assign(session, payload);
    showToast('Saved');
  }
  return row;
}

async function addSession(ex) {
  const sessions = logsByExercise[ex.id] || [];
  const last = sessions[0];
  const n = last && Array.isArray(last.sets) && last.sets.length ? last.sets.length : 3;
  const sets = Array.from({ length: n }, () => ({ w: '', r: '' }));
  const { data, error } = await sb.from('i90_custom_logs').insert({
    program_id: currentProgram.id, exercise_id: ex.id, logged_on: todayStr(), sets
  }).select().single();
  if (error) { showToast('Could not add session'); return; }
  logsByExercise[ex.id] = [data, ...sessions].sort((a, b) => (a.logged_on < b.logged_on ? 1 : -1));
  render();
  const first = document.querySelector(`[data-ex-id="${ex.id}"] .session-row .set-w`);
  if (first) first.focus();
}

async function deleteSession(session) {
  const { error } = await sb.from('i90_custom_logs').delete().eq('id', session.id);
  if (error) { showToast('Could not delete'); return; }
  logsByExercise[session.exercise_id] = logsByExercise[session.exercise_id].filter(s => s.id !== session.id);
  render();
}

async function renameExercise(ex, el) {
  const name = el.textContent.trim();
  if (!name) { el.textContent = ex.name; return; }
  if (name === ex.name) return;
  if (exercises.some(o => o.id !== ex.id && o.name.toLowerCase() === name.toLowerCase())) {
    showToast('That exercise already exists'); el.textContent = ex.name; return;
  }
  const { error } = await sb.from('i90_custom_exercises').update({ name }).eq('id', ex.id);
  if (error) { showToast('Could not rename'); el.textContent = ex.name; return; }
  ex.name = name;
  showToast('Renamed');
}

async function deleteExercise(ex) {
  const { error } = await sb.from('i90_custom_exercises').delete().eq('id', ex.id);
  if (error) { showToast('Could not delete'); return; }
  exercises = exercises.filter(e => e.id !== ex.id);
  delete logsByExercise[ex.id];
  render();
  showToast('Exercise deleted');
}

document.getElementById('add-ex-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-ex-name');
  const name = input.value.trim();
  if (!name) return;
  if (exercises.some(x => x.name.toLowerCase() === name.toLowerCase())) { showToast('Already in this program'); return; }
  const order = exercises.reduce((m, x) => Math.max(m, x.row_order), -1) + 1;
  const { data, error } = await sb.from('i90_custom_exercises').insert({ program_id: currentProgram.id, name, row_order: order }).select().single();
  if (error) { showToast('Could not add exercise'); return; }
  exercises.push(data);
  logsByExercise[data.id] = [];
  input.value = '';
  render();
  loadSuggestions();
});

initAuth(async () => {
  if (!(await initPrograms())) return;
  if (currentProgram.log_style !== 'custom') {
    document.getElementById('ex-list').innerHTML =
      '<div class="empty-state"><div class="big">📋</div>This program uses Insane90X-style logs (the weight tabs and Fit Test in the menu). ' +
      'Create a new program with <b>Custom weights &amp; reps</b> to use this page.</div>';
    document.getElementById('add-ex-form').style.display = 'none';
    return;
  }
  load();
});
