-- ---------------------------------------------------------------
-- フィード
-- ---------------------------------------------------------------
CREATE TABLE feeds (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url           TEXT    NOT NULL UNIQUE,
  effective_url      TEXT,
  site_url           TEXT,
  title              TEXT    NOT NULL,
  custom_title       TEXT,
  description        TEXT,
  language           TEXT,
  icon               BLOB,
  icon_mime          TEXT,
  icon_url           TEXT,
  icon_fetched_at    INTEGER,

  etag               TEXT,
  last_modified      TEXT,
  body_hash          TEXT,
  no_cache           INTEGER NOT NULL DEFAULT 0,

  fetch_interval_sec INTEGER NOT NULL DEFAULT 3600,
  next_fetch_at      INTEGER NOT NULL,
  last_fetch_at      INTEGER,
  last_success_at    INTEGER,
  last_status        INTEGER,
  last_error_kind    TEXT,
  last_error         TEXT,
  error_count        INTEGER NOT NULL DEFAULT 0,
  disabled           INTEGER NOT NULL DEFAULT 0,
  disabled_reason    TEXT,

  fetch_full_content INTEGER NOT NULL DEFAULT 0,
  show_lead_image    INTEGER NOT NULL DEFAULT 1,
  keep_hash_in_url   INTEGER NOT NULL DEFAULT 0,
  sort_index         INTEGER NOT NULL DEFAULT 0,
  public_id          TEXT,
  created_at         INTEGER NOT NULL
);

CREATE INDEX idx_feeds_due ON feeds (next_fetch_at) WHERE disabled = 0;

-- ---------------------------------------------------------------
-- タグ
-- ---------------------------------------------------------------
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  public_id  TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE feed_tags (
  feed_id INTEGER NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags (id)  ON DELETE CASCADE,
  PRIMARY KEY (feed_id, tag_id)
);

CREATE INDEX idx_feed_tags_tag ON feed_tags (tag_id);

-- ---------------------------------------------------------------
-- 記事
-- ---------------------------------------------------------------
CREATE TABLE items (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id                 INTEGER NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  guid_hash               TEXT    NOT NULL,
  url                     TEXT,
  title                   TEXT    NOT NULL DEFAULT '',
  author                  TEXT,

  summary                 TEXT,
  lead_image_url          TEXT,

  content_html            TEXT,
  full_content_html       TEXT,
  full_content_fetched_at INTEGER,
  original_content_html   TEXT,

  enclosure_url           TEXT,
  enclosure_mime          TEXT,
  enclosure_length        INTEGER,

  published_at            INTEGER NOT NULL,
  updated_at              INTEGER,
  crawled_at              INTEGER NOT NULL,
  content_hash            TEXT    NOT NULL,

  is_read                 INTEGER NOT NULL DEFAULT 0,
  read_at                 INTEGER,
  is_starred              INTEGER NOT NULL DEFAULT 0,
  starred_at              INTEGER,
  significant_update_at   INTEGER,
  public_id               TEXT,

  UNIQUE (feed_id, guid_hash)
);

CREATE INDEX idx_items_unread   ON items (published_at DESC, id DESC) WHERE is_read = 0;
CREATE INDEX idx_items_starred  ON items (starred_at DESC)            WHERE is_starred = 1;
CREATE INDEX idx_items_read_at  ON items (read_at DESC)               WHERE is_read = 1;
CREATE INDEX idx_items_updated  ON items (significant_update_at DESC) WHERE significant_update_at IS NOT NULL;
CREATE INDEX idx_items_feed_pub ON items (feed_id, published_at DESC, id DESC);
CREATE INDEX idx_items_feed_unread ON items (feed_id, published_at DESC, id DESC) WHERE is_read = 0;
CREATE INDEX idx_items_pub      ON items (published_at DESC, id DESC);

-- ---------------------------------------------------------------
-- 公開ID
-- ---------------------------------------------------------------
CREATE UNIQUE INDEX feeds_public_id ON feeds (public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX tags_public_id  ON tags  (public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX items_public_id ON items (public_id) WHERE public_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 未読カウンタ
-- ---------------------------------------------------------------
CREATE TABLE feed_counters (
  feed_id        INTEGER PRIMARY KEY REFERENCES feeds (id) ON DELETE CASCADE,
  unread_count   INTEGER NOT NULL DEFAULT 0,
  total_count    INTEGER NOT NULL DEFAULT 0,
  newest_item_at INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER trg_items_insert AFTER INSERT ON items BEGIN
  INSERT INTO feed_counters (feed_id, unread_count, total_count, newest_item_at)
    VALUES (NEW.feed_id, CASE WHEN NEW.is_read = 0 THEN 1 ELSE 0 END, 1, NEW.published_at)
    ON CONFLICT (feed_id) DO UPDATE SET
      unread_count   = unread_count + CASE WHEN NEW.is_read = 0 THEN 1 ELSE 0 END,
      total_count    = total_count + 1,
      newest_item_at = MAX(feed_counters.newest_item_at, NEW.published_at);
END;

CREATE TRIGGER trg_items_delete AFTER DELETE ON items BEGIN
  UPDATE feed_counters SET
    unread_count = unread_count - CASE WHEN OLD.is_read = 0 THEN 1 ELSE 0 END,
    total_count  = total_count - 1
  WHERE feed_id = OLD.feed_id;
END;

CREATE TRIGGER trg_items_read AFTER UPDATE OF is_read ON items
WHEN OLD.is_read <> NEW.is_read BEGIN
  UPDATE feed_counters SET
    unread_count = unread_count + CASE WHEN NEW.is_read = 0 THEN 1 ELSE -1 END
  WHERE feed_id = NEW.feed_id;
END;

-- ---------------------------------------------------------------
-- 全文検索
-- ---------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5 (
  title,
  body,
  content = 'items',
  content_rowid = 'id',
  tokenize = 'trigram'
);

CREATE TRIGGER trg_fts_insert AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (rowid, title, body)
    VALUES (NEW.id, NEW.title, COALESCE(NEW.summary, ''));
END;

CREATE TRIGGER trg_fts_delete AFTER DELETE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, title, body)
    VALUES ('delete', OLD.id, OLD.title, COALESCE(OLD.summary, ''));
END;

CREATE TRIGGER trg_fts_update AFTER UPDATE OF title, summary ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid, title, body)
    VALUES ('delete', OLD.id, OLD.title, COALESCE(OLD.summary, ''));
  INSERT INTO items_fts (rowid, title, body)
    VALUES (NEW.id, NEW.title, COALESCE(NEW.summary, ''));
END;

-- ---------------------------------------------------------------
-- 削除済み記事
-- ---------------------------------------------------------------
CREATE TABLE purged_items (
  feed_id   INTEGER NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  guid_hash TEXT    NOT NULL,
  purged_at INTEGER NOT NULL,
  PRIMARY KEY (feed_id, guid_hash)
);

-- ---------------------------------------------------------------
-- 認証
-- ---------------------------------------------------------------
CREATE TABLE credentials (
  id            TEXT PRIMARY KEY,
  public_key    BLOB    NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,
  device_type   TEXT,
  backed_up     INTEGER NOT NULL DEFAULT 0,
  nickname      TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

CREATE TABLE webauthn_challenges (
  challenge  TEXT PRIMARY KEY,
  purpose    TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  user_agent    TEXT
);

CREATE INDEX idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  secret_hash  TEXT    NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);

-- ---------------------------------------------------------------
-- 設定と統計
-- ---------------------------------------------------------------
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE feed_stats (
  feed_id             INTEGER PRIMARY KEY REFERENCES feeds (id) ON DELETE CASCADE,
  item_count          INTEGER NOT NULL,
  approx_bytes        INTEGER NOT NULL,
  oldest_published_at INTEGER,
  computed_at         INTEGER NOT NULL
);

CREATE TABLE host_throttle (
  host        TEXT PRIMARY KEY,
  retry_after INTEGER NOT NULL
);
