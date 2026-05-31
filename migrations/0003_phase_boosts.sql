-- BL7: per-phase 2x boost. A player may flag one match per phase to double the points it earns.
-- The (player_id, phase_id) primary key enforces the one-boost-per-phase rule.
CREATE TABLE phase_boosts (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    phase_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (player_id, phase_id)
);
