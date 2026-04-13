-- Migration: Add grades table and extend submissions with grade_status
-- Run via: wrangler d1 execute <DB_NAME> --file=grading_migration.sql

CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  grammar_score INTEGER,
  readability_score INTEGER,
  ai_detection_score INTEGER,
  plagiarism_score INTEGER,
  seo_score INTEGER,
  overall_score INTEGER,
  rewrite_attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  graded_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

-- Only run if column doesn't exist (D1 doesn't support IF NOT EXISTS on ALTER)
ALTER TABLE submissions ADD COLUMN grade_status TEXT DEFAULT 'ungraded';

-- grade_status values: ungraded, grading, passed, rewriting, needs_review
-- grades.status values: pending, grading, passed, rewriting, needs_review
