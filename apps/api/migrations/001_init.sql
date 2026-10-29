CREATE TABLE sequences (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO sequences (name, value) VALUES ('test_case', 0);

CREATE TABLE test_cases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  title_normalized  TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  preconditions     TEXT NOT NULL DEFAULT '',
  expected_result   TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL CHECK (priority IN ('Critical','High','Medium','Low')),
  test_type         TEXT NOT NULL CHECK (test_type IN
                      ('Functional','Regression','Smoke','Integration','UI','Performance','Security')),
  module            TEXT NOT NULL DEFAULT '',
  module_normalized TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL CHECK (status IN ('Draft','Ready','Deprecated')),
  revision          INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
CREATE INDEX idx_test_cases_active ON test_cases (deleted_at, updated_at);
CREATE INDEX idx_test_cases_duplicate ON test_cases (title_normalized, module_normalized);

CREATE TABLE test_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id    INTEGER NOT NULL REFERENCES test_cases (id) ON DELETE CASCADE,
  position        INTEGER NOT NULL CHECK (position >= 1),
  action          TEXT NOT NULL CHECK (length(trim(action)) > 0),
  expected_result TEXT NOT NULL DEFAULT '',
  UNIQUE (test_case_id, position)
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0)
);

CREATE TABLE test_case_tags (
  test_case_id INTEGER NOT NULL REFERENCES test_cases (id) ON DELETE CASCADE,
  tag_id       INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (test_case_id, tag_id)
);
