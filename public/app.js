const API = '';  // same-origin via Worker; set full URL for local dev

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const get = (path) => api(path);
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) });
const del = (path) => api(path, { method: 'DELETE' });

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-BE');
}

function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

function statusBadge(s) {
  const map = { actief: 'actief', 'in reparatie': 'reparatie', 'buiten gebruik': 'buiten', afgevoerd: 'afgevoerd' };
  return `<span class="badge badge-${map[s] || 'afgevoerd'}">${s}</span>`;
}

function expiryBadge(d) {
  if (!d) return '—';
  const days = daysUntil(d);
  if (days !== null && days <= 30 && days >= 0) return `<span class="badge badge-warn">${fmtDate(d)} (${days}d)</span>`;
  if (days !== null && days < 0) return `<span class="badge badge-buiten">${fmtDate(d)} (verlopen)</span>`;
  return fmtDate(d);
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;background:${type === 'ok' ? '#10b981' : '#ef4444'};color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.2)`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

const pages = { dashboard: loadDashboard, devices: loadDevices, locations: loadLocations, persons: loadPersons };

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const page = a.dataset.page;
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    pages[page]();
  });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function loadDashboard() {
  const [stats, expiring] = await Promise.all([
    get('/api/stats'),
    get('/api/devices?expiring_soon=1'),
  ]);
  document.getElementById('stat-total').textContent = stats.total;
  const active = stats.byStatus.find(s => s.status === 'actief');
  document.getElementById('stat-active').textContent = active ? active.count : 0;
  document.getElementById('stat-expiring').textContent = stats.expiringSoon;

  const el = document.getElementById('expiring-list');
  if (!expiring.length) { el.innerHTML = '<p class="empty">Geen verlopende garanties of licenties.</p>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Naam</th><th>Merk / Model</th><th>Locatie</th><th>Garantie t/m</th><th>Licentie t/m</th></tr></thead>
    <tbody>${expiring.map(d => `<tr class="row-warn">
      <td>${d.name}</td>
      <td>${[d.brand, d.model].filter(Boolean).join(' ') || '—'}</td>
      <td>${d.location_name || '—'}</td>
      <td>${expiryBadge(d.warranty_until)}</td>
      <td>${expiryBadge(d.license_expires)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─── DEVICES ─────────────────────────────────────────────────────────────────

let devicesData = [];

async function loadDevices() {
  const params = new URLSearchParams();
  const search = document.getElementById('search-devices').value;
  const cat = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  if (search) params.set('search', search);
  if (cat) params.set('category', cat);
  if (status) params.set('status', status);
  devicesData = await get('/api/devices?' + params);
  renderDevicesTable(devicesData);
}

function renderDevicesTable(data) {
  const el = document.getElementById('devices-table');
  if (!data.length) { el.innerHTML = '<p class="empty">Geen apparaten gevonden.</p>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Asset</th><th>Categorie</th><th>Merk / Model</th><th>Serienummer</th><th>Status</th><th>Locatie</th><th>Gebruiker</th><th>Garantie t/m</th><th>Acties</th></tr></thead>
    <tbody>${data.map(d => `<tr>
      <td><strong>${d.name}</strong>${d.asset_tag ? `<br><small style="color:#64748b">${d.asset_tag}</small>` : ''}</td>
      <td>${d.category}</td>
      <td>${[d.brand, d.model].filter(Boolean).join(' ') || '—'}</td>
      <td>${d.serial_number || '—'}</td>
      <td>${statusBadge(d.status)}</td>
      <td>${d.location_name || '—'}</td>
      <td>${d.person_name || '—'}</td>
      <td>${expiryBadge(d.warranty_until)}</td>
      <td><div class="actions">
        <button class="btn-icon" onclick="showQR(${d.id})" title="QR">&#9641;</button>
        <button class="btn-icon" onclick="editDevice(${d.id})">Bewerk</button>
        <button class="btn-danger" onclick="deleteDevice(${d.id})">&#128465;</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

document.getElementById('search-devices').addEventListener('input', debounce(loadDevices, 300));
document.getElementById('filter-category').addEventListener('change', loadDevices);
document.getElementById('filter-status').addEventListener('change', loadDevices);

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.getElementById('btn-add-device').addEventListener('click', () => openDeviceModal(null));

async function openDeviceModal(id) {
  const [locs, persons] = await Promise.all([get('/api/locations'), get('/api/persons')]);
  const d = id ? devicesData.find(x => x.id === id) || await get('/api/devices/' + id) : {};
  openModal(id ? 'Apparaat bewerken' : 'Apparaat toevoegen', deviceForm(d, locs, persons));
  document.getElementById('device-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, v || null]));
    if (body.location_id) body.location_id = +body.location_id;
    if (body.person_id) body.person_id = +body.person_id;
    try {
      if (id) await put('/api/devices/' + id, body);
      else await post('/api/devices', body);
      closeModal();
      toast(id ? 'Opgeslagen' : 'Toegevoegd');
      loadDevices();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function editDevice(id) { openDeviceModal(id); }

async function deleteDevice(id) {
  if (!confirm('Apparaat verwijderen?')) return;
  await del('/api/devices/' + id);
  toast('Verwijderd');
  loadDevices();
}

function deviceForm(d, locs, persons) {
  return `<form id="device-form" class="form-grid">
    <div class="form-group"><label>Naam *</label><input name="name" required value="${d.name||''}"></div>
    <div class="form-group"><label>Categorie *</label>
      <select name="category" required>
        ${['Desktop','Laptop','Printer','Switch','Router','Server','Monitor','Tablet','Telefoon','Access Point WIFI','Overig'].map(c => `<option ${d.category===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Merk</label><input name="brand" value="${d.brand||''}"></div>
    <div class="form-group"><label>Model</label><input name="model" value="${d.model||''}"></div>
    <div class="form-group"><label>Serienummer</label><input name="serial_number" value="${d.serial_number||''}"></div>
    <div class="form-group"><label>Asset tag</label><input name="asset_tag" value="${d.asset_tag||''}"></div>
    <div class="form-group"><label>Status</label>
      <select name="status">
        ${['actief','in reparatie','buiten gebruik','afgevoerd'].map(s => `<option ${d.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Locatie</label>
      <select name="location_id">
        <option value="">— geen —</option>
        ${locs.map(l => `<option value="${l.id}" ${d.location_id===l.id?'selected':''}>${l.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Toegewezen aan</label>
      <select name="person_id">
        <option value="">— geen —</option>
        ${persons.map(p => `<option value="${p.id}" ${d.person_id===p.id?'selected':''}>${p.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Aankoopdatum</label><input type="date" name="purchase_date" value="${d.purchase_date||''}"></div>
    <div class="form-group"><label>Garantie t/m</label><input type="date" name="warranty_until" value="${d.warranty_until||''}"></div>
    <div class="form-group"><label>Licentiesleutel</label><input name="license_key" value="${d.license_key||''}"></div>
    <div class="form-group"><label>Licentie t/m</label><input type="date" name="license_expires" value="${d.license_expires||''}"></div>
    <div class="form-group full"><label>Notities</label><textarea name="notes">${d.notes||''}</textarea></div>
    <div class="form-actions full">
      <button type="button" class="btn-secondary" onclick="closeModal()">Annuleren</button>
      <button type="submit" class="btn-primary">Opslaan</button>
    </div>
  </form>`;
}

// ─── QR CODE ─────────────────────────────────────────────────────────────────

function showQR(id) {
  const d = devicesData.find(x => x.id === id);
  if (!d) return;
  const overlay = document.getElementById('qr-overlay');
  const canvas = document.getElementById('qr-canvas');
  const label = document.getElementById('qr-label');
  canvas.innerHTML = '';
  const info = JSON.stringify({ id: d.id, name: d.name, sn: d.serial_number, asset: d.asset_tag });
  QRCode.toCanvas(document.createElement('canvas'), info, { width: 200, margin: 1 }, (err, c) => {
    if (!err) canvas.appendChild(c);
  });
  label.textContent = `${d.name}${d.asset_tag ? ' · ' + d.asset_tag : ''}`;
  overlay.classList.remove('hidden');
}

document.getElementById('qr-close').addEventListener('click', () => {
  document.getElementById('qr-overlay').classList.add('hidden');
});

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

async function loadLocations() {
  const data = await get('/api/locations');
  const el = document.getElementById('locations-list');
  if (!data.length) { el.innerHTML = '<p class="empty">Geen locaties.</p>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Naam</th><th>Gebouw</th><th>Acties</th></tr></thead>
    <tbody>${data.map(l => `<tr>
      <td>${l.name}</td>
      <td>${l.building || '—'}</td>
      <td><div class="actions">
        <button class="btn-icon" onclick="editLocation(${l.id},'${esc(l.name)}','${esc(l.building||'')}')">Bewerk</button>
        <button class="btn-danger" onclick="deleteLocation(${l.id})">&#128465;</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

document.getElementById('btn-add-location').addEventListener('click', () => openLocationModal(null));

function openLocationModal(id, name = '', building = '') {
  openModal(id ? 'Locatie bewerken' : 'Locatie toevoegen', `
    <form id="loc-form" class="form-grid">
      <div class="form-group full"><label>Naam *</label><input name="name" required value="${name}"></div>
      <div class="form-group full"><label>Gebouw</label><input name="building" value="${building}"></div>
      <div class="form-actions full">
        <button type="button" class="btn-secondary" onclick="closeModal()">Annuleren</button>
        <button type="submit" class="btn-primary">Opslaan</button>
      </div>
    </form>
  `);
  document.getElementById('loc-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      if (id) await put('/api/locations/' + id, body);
      else await post('/api/locations', body);
      closeModal(); toast('Opgeslagen'); loadLocations();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function editLocation(id, name, building) { openLocationModal(id, name, building); }

async function deleteLocation(id) {
  if (!confirm('Locatie verwijderen?')) return;
  await del('/api/locations/' + id);
  toast('Verwijderd'); loadLocations();
}

// ─── PERSONS ─────────────────────────────────────────────────────────────────

async function loadPersons() {
  const data = await get('/api/persons');
  const el = document.getElementById('persons-list');
  if (!data.length) { el.innerHTML = '<p class="empty">Geen personen.</p>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Naam</th><th>E-mail</th><th>Afdeling</th><th>Acties</th></tr></thead>
    <tbody>${data.map(p => `<tr>
      <td>${p.name}</td>
      <td>${p.email || '—'}</td>
      <td>${p.department || '—'}</td>
      <td><div class="actions">
        <button class="btn-icon" onclick="editPerson(${p.id},'${esc(p.name)}','${esc(p.email||'')}','${esc(p.department||'')}')">Bewerk</button>
        <button class="btn-danger" onclick="deletePerson(${p.id})">&#128465;</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

document.getElementById('btn-add-person').addEventListener('click', () => openPersonModal(null));

function openPersonModal(id, name = '', email = '', dept = '') {
  openModal(id ? 'Persoon bewerken' : 'Persoon toevoegen', `
    <form id="person-form" class="form-grid">
      <div class="form-group full"><label>Naam *</label><input name="name" required value="${name}"></div>
      <div class="form-group"><label>E-mail</label><input type="email" name="email" value="${email}"></div>
      <div class="form-group"><label>Afdeling</label><input name="department" value="${dept}"></div>
      <div class="form-actions full">
        <button type="button" class="btn-secondary" onclick="closeModal()">Annuleren</button>
        <button type="submit" class="btn-primary">Opslaan</button>
      </div>
    </form>
  `);
  document.getElementById('person-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, v || null]));
    try {
      if (id) await put('/api/persons/' + id, body);
      else await post('/api/persons', body);
      closeModal(); toast('Opgeslagen'); loadPersons();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function editPerson(id, name, email, dept) { openPersonModal(id, name, email, dept); }

async function deletePerson(id) {
  if (!confirm('Persoon verwijderen?')) return;
  await del('/api/persons/' + id);
  toast('Verwijderd'); loadPersons();
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
document.getElementById('qr-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('qr-overlay')) document.getElementById('qr-overlay').classList.add('hidden');
});

function esc(s) { return String(s).replace(/'/g, "\\'"); }

// ─── BOOT ─────────────────────────────────────────────────────────────────────
loadDashboard();
