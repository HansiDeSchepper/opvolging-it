ALTER TABLE devices ADD COLUMN acquisition_type TEXT NOT NULL DEFAULT 'aangekocht';
ALTER TABLE devices ADD COLUMN lease_end DATE;
ALTER TABLE devices ADD COLUMN lease_provider TEXT;
