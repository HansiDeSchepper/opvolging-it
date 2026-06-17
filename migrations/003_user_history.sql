CREATE TABLE IF NOT EXISTS device_user_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  person_name_snapshot TEXT,
  assigned_at DATE NOT NULL,
  returned_at DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_device ON device_user_history(device_id);
