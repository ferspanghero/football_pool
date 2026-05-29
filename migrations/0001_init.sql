CREATE TABLE games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    champion_team_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(game_id, display_name)
);

CREATE TABLE predictions (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    home_goals INTEGER NOT NULL CHECK (home_goals >= 0),
    away_goals INTEGER NOT NULL CHECK (away_goals >= 0),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (player_id, match_id)
);

CREATE TABLE match_results (
    match_id TEXT PRIMARY KEY,
    home_goals INTEGER NOT NULL CHECK (home_goals >= 0),
    away_goals INTEGER NOT NULL CHECK (away_goals >= 0),
    recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_predictions_match ON predictions(match_id);
