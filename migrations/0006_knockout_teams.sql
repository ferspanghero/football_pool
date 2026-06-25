-- v4: knockout team overlay. The static `data/tournament.ts` holds every fixture's id, phase,
-- kickoff, and placeholder labels; this table overlays the *resolved* team identities for a
-- knockout fixture once they are known, so the app no longer needs a source edit + redeploy to fill
-- in a bracket. Mirrors `match_results`: a `source` of 'AUTO' (written by the scheduled bracket sync
-- from ESPN) never overwrites a 'MANUAL' (admin-entered) row, so a hand correction always wins.
CREATE TABLE knockout_teams (
    match_id     TEXT PRIMARY KEY,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL')),
    updated_at   INTEGER NOT NULL
);
