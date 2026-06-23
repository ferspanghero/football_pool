-- BL7: the 3rd-place playoff and the final are single-match phases and therefore not boostable
-- (no choice of which match to boost; an opt-in boost there is pure ceremony and a forget-to-set
-- footgun). Purge any boost rows that were pre-set for those phases before they became non-boostable.
-- Idempotent: a no-op when no such rows exist, and safe to re-run.
DELETE FROM phase_boosts WHERE phase_id IN ('THIRD', 'FINAL');
