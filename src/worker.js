const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

async function parseBody(req) {
  try { return await req.json(); } catch { return {}; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ─── DEVICES ─────────────────────────────────────────────────────────────

    if (path === '/api/devices' && method === 'GET') {
      const q = url.searchParams;
      let sql = `
        SELECT d.*, l.name AS location_name, p.name AS person_name
        FROM devices d
        LEFT JOIN locations l ON d.location_id = l.id
        LEFT JOIN persons p ON d.person_id = p.id
        WHERE 1=1
      `;
      const params = [];
      if (q.get('category')) { sql += ' AND d.category = ?'; params.push(q.get('category')); }
      if (q.get('status')) { sql += ' AND d.status = ?'; params.push(q.get('status')); }
      if (q.get('search')) {
        sql += ' AND (d.name LIKE ? OR d.brand LIKE ? OR d.model LIKE ? OR d.serial_number LIKE ? OR d.asset_tag LIKE ?)';
        const s = `%${q.get('search')}%`;
        params.push(s, s, s, s, s);
      }
      if (q.get('expiring_soon')) {
        sql += " AND d.warranty_until BETWEEN date('now') AND date('now','+30 days')";
      }
      sql += ' ORDER BY d.updated_at DESC';
      const { results } = await env.DB.prepare(sql).bind(...params).all();
      return json(results);
    }

    if (path === '/api/devices' && method === 'POST') {
      const b = await parseBody(request);
      if (!b.name || !b.category) return err('Naam en categorie zijn verplicht');
      const stmt = env.DB.prepare(`
        INSERT INTO devices (name, category, brand, model, serial_number, asset_tag, status,
          location_id, person_id, purchase_date, warranty_until, license_key, license_expires, notes,
          acquisition_type, lease_end, lease_provider)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const r = await stmt.bind(
        b.name, b.category, b.brand||null, b.model||null, b.serial_number||null, b.asset_tag||null,
        b.status||'actief', b.location_id||null, b.person_id||null, b.purchase_date||null,
        b.warranty_until||null, b.license_key||null, b.license_expires||null, b.notes||null,
        b.acquisition_type||'aangekocht', b.lease_end||null, b.lease_provider||null
      ).run();
      return json({ id: r.meta.last_row_id }, 201);
    }

    const deviceMatch = path.match(/^\/api\/devices\/(\d+)$/);
    if (deviceMatch) {
      const id = deviceMatch[1];

      if (method === 'GET') {
        const row = await env.DB.prepare(`
          SELECT d.*, l.name AS location_name, p.name AS person_name
          FROM devices d
          LEFT JOIN locations l ON d.location_id = l.id
          LEFT JOIN persons p ON d.person_id = p.id
          WHERE d.id = ?
        `).bind(id).first();
        if (!row) return err('Niet gevonden', 404);
        return json(row);
      }

      if (method === 'PUT') {
        const b = await parseBody(request);
        if (!b.name || !b.category) return err('Naam en categorie zijn verplicht');
        await env.DB.prepare(`
          UPDATE devices SET name=?, category=?, brand=?, model=?, serial_number=?, asset_tag=?,
            status=?, location_id=?, person_id=?, purchase_date=?, warranty_until=?,
            license_key=?, license_expires=?, notes=?, acquisition_type=?, lease_end=?, lease_provider=?,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).bind(
          b.name, b.category, b.brand||null, b.model||null, b.serial_number||null, b.asset_tag||null,
          b.status||'actief', b.location_id||null, b.person_id||null, b.purchase_date||null,
          b.warranty_until||null, b.license_key||null, b.license_expires||null, b.notes||null,
          b.acquisition_type||'aangekocht', b.lease_end||null, b.lease_provider||null, id
        ).run();
        return json({ ok: true });
      }

      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM devices WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── DEVICE USER HISTORY ─────────────────────────────────────────────────

    const histMatch = path.match(/^\/api\/devices\/(\d+)\/history$/);
    if (histMatch) {
      const id = histMatch[1];
      if (method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT h.*, p.name AS person_name
          FROM device_user_history h
          LEFT JOIN persons p ON h.person_id = p.id
          WHERE h.device_id = ?
          ORDER BY h.assigned_at DESC
        `).bind(id).all();
        return json(results);
      }
      if (method === 'POST') {
        const b = await parseBody(request);
        if (!b.assigned_at) return err('Datum is verplicht');
        let personName = b.person_name_snapshot || null;
        if (b.person_id && !personName) {
          const p = await env.DB.prepare('SELECT name FROM persons WHERE id=?').bind(b.person_id).first();
          if (p) personName = p.name;
        }
        const r = await env.DB.prepare(`
          INSERT INTO device_user_history (device_id, person_id, person_name_snapshot, assigned_at, returned_at, notes)
          VALUES (?,?,?,?,?,?)
        `).bind(id, b.person_id||null, personName, b.assigned_at, b.returned_at||null, b.notes||null).run();
        return json({ id: r.meta.last_row_id }, 201);
      }
    }

    const histItemMatch = path.match(/^\/api\/history\/(\d+)$/);
    if (histItemMatch) {
      const id = histItemMatch[1];
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM device_user_history WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── LOCATIONS ────────────────────────────────────────────────────────────

    if (path === '/api/locations') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM locations ORDER BY name').all();
        return json(results);
      }
      if (method === 'POST') {
        const b = await parseBody(request);
        if (!b.name) return err('Naam is verplicht');
        const r = await env.DB.prepare('INSERT INTO locations (name, building) VALUES (?,?)').bind(b.name, b.building||null).run();
        return json({ id: r.meta.last_row_id }, 201);
      }
    }

    const locMatch = path.match(/^\/api\/locations\/(\d+)$/);
    if (locMatch) {
      const id = locMatch[1];
      if (method === 'PUT') {
        const b = await parseBody(request);
        await env.DB.prepare('UPDATE locations SET name=?, building=? WHERE id=?').bind(b.name, b.building||null, id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM locations WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── PERSONS ─────────────────────────────────────────────────────────────

    if (path === '/api/persons') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM persons ORDER BY name').all();
        return json(results);
      }
      if (method === 'POST') {
        const b = await parseBody(request);
        if (!b.name) return err('Naam is verplicht');
        const r = await env.DB.prepare('INSERT INTO persons (name, email, department) VALUES (?,?,?)').bind(b.name, b.email||null, b.department||null).run();
        return json({ id: r.meta.last_row_id }, 201);
      }
    }

    const personMatch = path.match(/^\/api\/persons\/(\d+)$/);
    if (personMatch) {
      const id = personMatch[1];
      if (method === 'PUT') {
        const b = await parseBody(request);
        await env.DB.prepare('UPDATE persons SET name=?, email=?, department=? WHERE id=?').bind(b.name, b.email||null, b.department||null, id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM persons WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── STATS ───────────────────────────────────────────────────────────────

    if (path === '/api/stats' && method === 'GET') {
      const [total, byStatus, expiring] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) as total FROM devices').first(),
        env.DB.prepare("SELECT status, COUNT(*) as count FROM devices GROUP BY status").all(),
        env.DB.prepare(`
          SELECT COUNT(*) as count FROM devices
          WHERE warranty_until BETWEEN date('now') AND date('now','+30 days')
        `).first(),
      ]);
      return json({ total: total.total, byStatus: byStatus.results, expiringSoon: expiring.count });
    }

    return err('Niet gevonden', 404);
  },
};
