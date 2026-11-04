-- Curated protocols can start with a run-in (adaptation / withdrawal) phase:
-- the behaviour is already followed and logged, but those days are not counted
-- as intervention. Phase order becomes baseline, run_in, intervention, washout.
alter type phase_type add value if not exists 'run_in' before 'intervention';
