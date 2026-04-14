-- package_migration.sql
-- Run before deploying the packaging system

-- Add package_status to submissions
ALTER TABLE submissions ADD COLUMN package_status TEXT DEFAULT NULL;

-- package_status values:
--   NULL          = not yet packaged (article may not be done yet)
--   'packaging'   = currently being packaged by cron
--   'ready'       = files are in R2, download is available
--   'failed'      = packaging failed, will retry next cron run

-- Index for cron sweep performance
CREATE INDEX IF NOT EXISTS idx_submissions_package_status
  ON submissions(package_status, grade_status);
