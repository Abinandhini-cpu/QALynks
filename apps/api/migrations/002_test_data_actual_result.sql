-- Adds the two fields needed for the seven-column test case format.
-- Existing rows get an empty string, so manual test cases are unaffected.
ALTER TABLE test_cases ADD COLUMN test_data TEXT NOT NULL DEFAULT '';
ALTER TABLE test_cases ADD COLUMN actual_result TEXT NOT NULL DEFAULT '';
