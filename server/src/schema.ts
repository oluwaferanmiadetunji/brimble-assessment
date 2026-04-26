import type Database from 'better-sqlite3'

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_url TEXT,
      upload_path TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending','building','deploying','running','failed')),
      image_tag TEXT NOT NULL,
      container_name TEXT NOT NULL,
      public_url TEXT,
      internal_port TEXT,
      last_error TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments (status);

    CREATE TRIGGER IF NOT EXISTS deployments_set_updated_at
    AFTER UPDATE ON deployments
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE deployments
      SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS deployment_logs (
      id INTEGER PRIMARY KEY,
      deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      stage TEXT CHECK (stage IN ('queued','build','run','caddy','runtime')),
      level TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_created
      ON deployment_logs (deployment_id, created_at);

    CREATE TRIGGER IF NOT EXISTS deployment_logs_set_updated_at
    AFTER UPDATE ON deployment_logs
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE deployment_logs
      SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      WHERE id = NEW.id;
    END;
  `)
}

export = { initSchema }

