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

const PHOTO_BUCKET = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.photoBucket) || 'insane90x-photos';
const SLOTS = ['test1','test2','test3','test4','test5','test6','test7','graduation'];
const SLOT_LABELS = { test1:'Test 1', test2:'Test 2', test3:'Test 3', test4:'Test 4', test5:'Test 5', test6:'Test 6', test7:'Test 7', graduation:'Graduation' };

const params = new URLSearchParams(window.location.search);
const focusTest = params.get('test'); // e.g. "test3" or "graduation"

let allRows = [];
let entriesByRow = {}; // row_id -> { slot -> entry }

async function load() {
  globalTabIndex = 1;
  const { data: rowData, error: rowErr } = await sb.from('i90_fit_test_rows').select('*').order('section').order('row_order');
  if (rowErr) { showToast('Could not load fit test'); return; }
  allRows = rowData;

  const rowIds = allRows.map(r => r.id);
  let entryData = [];
  if (rowIds.length) {
    const { data, error } = await sb.from('i90_fit_test_entries').select('*').in('row_id', rowIds);
    if (error) { showToast('Could not load logged values'); return; }
    entryData = data;
  }
  entriesByRow = {};
  allRows.forEach(r => { entriesByRow[r.id] = {}; });
  entryData.forEach(e => { entriesByRow[e.row_id][e.slot] = e; });

  renderSection('insanity_fit_test', false);
  renderSection('p90x_fit_test', false);
  renderSection('measurements', false);
  renderSection('pictures', true);

  if (focusTest) {
    requestAnimationFrame(() => {
      const target = document.querySelector(`th[data-slot="${focusTest}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  }
}

let globalTabIndex = 1; // shared across all four sections - tabindex is page-global, not per-table

function renderSection(section, isImageSection) {
  const table = document.getElementById(`table-${section}`);
  if (!table) return;
  table.innerHTML = '';
  const rows = allRows.filter(r => r.section === section);

  const thead = document.createElement('tr');
  thead.innerHTML = '<th>Exercise</th>' + SLOTS.map(s =>
    `<th data-slot="${s}" class="${s === 'graduation' ? 'graduation-col-head' : ''}${s === focusTest ? ' focused' : ''}">${SLOT_LABELS[s]}</th>`
  ).join('');
  table.appendChild(thead);

  // Column-major: every exercise in Test 1's column first, then every
  // exercise in Test 2's column, and so on - so Tab goes DOWN through
  // one test at a time rather than sideways across a single exercise's
  // whole history.
  const focusableBySlot = SLOTS.map(() => []);

  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (isImageSection) tr.classList.add('image-row');

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `<div class="ex-name">${escapeHtml(row.exercise_name)}</div>${row.target_muscle ? `<div class="ex-muscle">${escapeHtml(row.target_muscle)}</div>` : ''}${row.instructions ? `<div class="ex-muscle">${escapeHtml(row.instructions)}</div>` : ''}`;
    tr.appendChild(nameTd);

    SLOTS.forEach((slot, slotIdx) => {
      const td = document.createElement('td');
      if (slot === 'graduation') td.classList.add('grad-cell');
      if (slot === focusTest) td.classList.add('focused');
      const existing = entriesByRow[row.id][slot];

      if (isImageSection) {
        const cell = buildPhotoCell(row.id, slot, existing);
        td.appendChild(cell);
        const btn = cell.querySelector('button');
        if (btn) focusableBySlot[slotIdx].push(btn);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = existing ? (existing.value_text || '') : '';
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        });
        input.addEventListener('blur', () => saveEntry(row.id, slot, input.value, null));
        td.appendChild(input);
        focusableBySlot[slotIdx].push(input);
      }
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  focusableBySlot.forEach(items => {
    items.forEach(el => { el.tabIndex = globalTabIndex++; });
  });
}

function buildPhotoCell(rowId, slot, existing) {
  const cell = document.createElement('div');
  cell.className = 'photo-cell';

  const imgWrap = document.createElement('div');
  if (existing && existing.image_url) {
    const img = document.createElement('img');
    img.src = existing.image_url;
    img.alt = 'Progress photo';
    imgWrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'photo-placeholder';
    ph.textContent = '📷';
    imgWrap.appendChild(ph);
  }
  cell.appendChild(imgWrap);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.capture = 'environment';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline photo-btn';
  btn.textContent = existing && existing.image_url ? 'Replace' : 'Add Photo';
  btn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      await saveEntry(rowId, slot, null, pub.publicUrl);
      showToast('Photo saved');
      load();
    } catch (err) {
      showToast('Could not upload photo');
      btn.disabled = false;
      btn.textContent = 'Add Photo';
    }
  });

  cell.appendChild(fileInput);
  cell.appendChild(btn);
  return cell;
}

async function saveEntry(rowId, slot, valueText, imageUrl) {
  const payload = {
    row_id: rowId,
    slot,
    updated_at: new Date().toISOString()
  };
  if (valueText !== null) payload.value_text = valueText;
  if (imageUrl !== null) payload.image_url = imageUrl;

  const { error } = await sb.from('i90_fit_test_entries').upsert(payload, { onConflict: 'row_id,slot' });
  if (error) { showToast('Could not save'); return; }
  if (!entriesByRow[rowId][slot]) entriesByRow[rowId][slot] = {};
  if (valueText !== null) entriesByRow[rowId][slot].value_text = valueText;
  if (imageUrl !== null) entriesByRow[rowId][slot].image_url = imageUrl;
}

initAuth(() => {
  load();
});
