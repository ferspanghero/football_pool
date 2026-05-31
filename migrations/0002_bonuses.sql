-- BL6: first-to-score bonus. A player's optional pick of which side scores first, and the
-- admin-recorded actual. Both nullable; 'NONE' means a goalless (0-0) match. Existing rows
-- default to NULL (no pick / not recorded), which the CHECK permits.
ALTER TABLE predictions ADD COLUMN first_scorer TEXT CHECK (first_scorer IN ('HOME', 'AWAY', 'NONE'));
ALTER TABLE match_results ADD COLUMN first_scorer TEXT CHECK (first_scorer IN ('HOME', 'AWAY', 'NONE'));
