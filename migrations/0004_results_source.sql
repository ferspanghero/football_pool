-- BL4: provenance of a recorded result. 'AUTO' = written by the scheduled results sync;
-- 'MANUAL' = entered or edited by an admin. The sync writes 'AUTO' and never overwrites a 'MANUAL'
-- row, so a hand-entered (or hand-corrected) result always wins. Existing rows default to 'MANUAL'
-- because they were entered by an admin before the sync existed — protecting them immediately.
ALTER TABLE match_results ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO', 'MANUAL'));
