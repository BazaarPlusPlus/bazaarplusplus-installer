CREATE TABLE IF NOT EXISTS install_clients (
  install_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_version TEXT NOT NULL,
  platform TEXT,
  os_version TEXT,
  arch TEXT,
  locale TEXT
);

CREATE INDEX IF NOT EXISTS idx_install_clients_last_seen_at
ON install_clients(last_seen_at);
