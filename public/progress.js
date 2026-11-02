function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// Progress: for every exercise, the latest thing logged in the CURRENT
// program next to the latest thing logged the last time that same
// exercise was worked on in another program, with dates.
//
// Exercises are matched by name (case-insensitive), which works for
// both log styles: Insane90X-style rows (shared library) and custom
// exercises. Works across styles too.

const PAGE = 1000; // Supabase returns at most 1000 rows per request

async function fetchAll(table, columns) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function firstNumber(text) {
  const m = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function dateOnly(iso) { return String(iso).slice(0, 10); }
function fmtDate(iso) {
  const [y, m, d] = dateOnly(iso).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function normName(n) { return String(n || '').trim().toLowerCase(); }

let records = {};     // normName -> { name, byProgram: { programId: { date, text, top } } }

function putRecord(name, programId, rec) {
  const key = normName(name);
  if (!key) return;
  if (!records[key]) records[key] = { name, byProgram: {} };
  const cur = records[key].byProgram[programId];
  if (!cur || rec.date > cur.date) records[key].byProgram[programId] = rec;
}

async function buildRecords() {
  records = {};

  // ---- Insane90X-style entries ----
  const rows = await fetchAll('i90_weight_rows', 'id,exercise_name');
  const nameById = {};
  rows.forEach(r => { nameById[r.id] = r.exercise_name; });
  const entries = await fetchAll('i90_weight_entries', 'program_id,row_id,week_number,label,value_text,updated_at');

  // group: program -> row -> week -> [entries with a value]
  const grouped = {};
  entries.forEach(e => {
    if (!e.value_text || !String(e.value_text).trim()) return;
    const k = `${e.program_id}|${e.row_id}`;
    (grouped[k] = grouped[k] || {});
    (grouped[k][e.week_number] = grouped[k][e.week_number] || []).push(e);
  });
  Object.keys(grouped).forEach(k => {
    const [programId, rowId] = k.split('|');
    const weeks = grouped[k];
    // the most recently touched week is "the last time you worked it"
    let bestWeek = null, bestDate = '';
    Object.keys(weeks).forEach(w => {
      const latest = weeks[w].reduce((m, e) => (e.updated_at > m ? e.updated_at : m), '');
      if (latest > bestDate) { bestDate = latest; bestWeek = w; }
    });
    const es = weeks[bestWeek].slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const text = `Wk ${bestWeek}: ` + es.map(e => (e.label ? `${e.label} ` : '') + String(e.value_text).trim()).join(' · ');
    const nums = es.map(e => firstNumber(e.value_text)).filter(n => n !== null);
    putRecord(nameById[rowId], programId, { date: dateOnly(bestDate), text, top: nums.length ? Math.max(...nums) : null });
  });

  // ---- Custom logs ----
  const exs = await fetchAll('i90_custom_exercises', 'id,program_id,name');
  const logs = await fetchAll('i90_custom_logs', 'program_id,exercise_id,logged_on,sets,created_at');
  const exById = {};
  exs.forEach(e => { exById[e.id] = e; });
  const latest = {}; // exercise_id -> latest session
  logs.forEach(l => {
    const hasData = (l.sets || []).some(s => (s.w && s.w.trim()) || (s.r && s.r.trim()));
    if (!hasData) return;
    const cur = latest[l.exercise_id];
    if (!cur || l.logged_on > cur.logged_on || (l.logged_on === cur.logged_on && l.created_at > cur.created_at)) latest[l.exercise_id] = l;
  });
  Object.values(latest).forEach(l => {
    const ex = exById[l.exercise_id];
    if (!ex) return;
    const filled = l.sets.filter(s => (s.w && s.w.trim()) || (s.r && s.r.trim()));
    const text = filled.map(s => `${s.w || '?'}×${s.r || '?'}`).join(', ');
    const nums = filled.map(s => firstNumber(s.w)).filter(n => n !== null);
    putRecord(ex.name, l.program_id, { date: l.logged_on, text, top: nums.length ? Math.max(...nums) : null });
  });
}

function deltaHtml(cur, prev) {
  if (cur == null || prev == null) return '<span class="none">—</span>';
  const d = Math.round((cur - prev) * 100) / 100;
  if (d > 0) return `<span class="delta-up">▲ +${d}</span>`;
  if (d < 0) return `<span class="delta-down">▼ ${d}</span>`;
  return '<span class="delta-same">＝ same</span>';
}

function render() {
  const cur = currentProgram;
  const others = allPrograms.filter(p => p.id !== cur.id);
  const sel = document.getElementById('compare-select');
  const choice = sel.value || 'auto';
  const progName = id => (allPrograms.find(p => p.id === id) || {}).name || 'Unknown';

  const rowsOut = [];
  Object.values(records).forEach(r => {
    const c = r.byProgram[cur.id] || null;
    let p = null, pid = null;
    if (choice === 'auto') {
      others.forEach(o => {
        const rec = r.byProgram[o.id];
        if (rec && (!p || rec.date > p.date)) { p = rec; pid = o.id; }
      });
    } else if (r.byProgram[choice]) { p = r.byProgram[choice]; pid = choice; }
    if (!c && !p) return;
    if (choice !== 'auto' && !p && !c) return;
    rowsOut.push({ name: r.name, c, p, pid });
  });

  rowsOut.sort((a, b) => {
    if (!!a.c !== !!b.c) return a.c ? -1 : 1;
    if (a.c && b.c && a.c.date !== b.c.date) return a.c.date < b.c.date ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const table = document.getElementById('prog-table');
  const note = document.getElementById('progress-note');
  if (!rowsOut.length) {
    table.innerHTML = '';
    note.textContent = 'Nothing logged yet. Once you log weights or reps in this program (and in an earlier one), they will show up here side by side.';
    return;
  }
  const withBoth = rowsOut.filter(r => r.c && r.p).length;
  note.textContent = withBoth
    ? `${withBoth} exercise${withBoth === 1 ? '' : 's'} can be compared with an earlier program.`
    : 'No exercise appears in both this program and an earlier one yet. Use the same exercise names to compare.';

  table.innerHTML = `
    <thead><tr>
      <th>Exercise</th>
      <th>${escapeHtml(cur.name)} (current)</th>
      <th>Last time (earlier program)</th>
      <th>Change</th>
    </tr></thead>
    <tbody>${rowsOut.map(r => `
      <tr>
        <td><b>${escapeHtml(r.name)}</b></td>
        <td>${r.c ? `${escapeHtml(r.c.text)}<span class="when">${fmtDate(r.c.date)}</span>` : '<span class="none">not logged yet</span>'}</td>
        <td>${r.p ? `${escapeHtml(r.p.text)}<span class="when">${fmtDate(r.p.date)} · ${escapeHtml(progName(r.pid))}</span>` : '<span class="none">no earlier record</span>'}</td>
        <td>${deltaHtml(r.c ? r.c.top : null, r.p ? r.p.top : null)}</td>
      </tr>`).join('')}</tbody>`;
}

initAuth(async () => {
  if (!(await initPrograms())) return;
  const sel = document.getElementById('compare-select');
  sel.innerHTML = '<option value="auto">Last time each exercise was worked (any earlier program)</option>' +
    allPrograms.filter(p => p.id !== currentProgram.id)
      .map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.archived_at ? ' (archived)' : ''}</option>`).join('');
  sel.addEventListener('change', render);
  try {
    await buildRecords();
  } catch (e) {
    showToast('Could not load progress data');
    return;
  }
  render();
});
