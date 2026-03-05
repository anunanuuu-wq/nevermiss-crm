-- NeverMiss CRM — Sequence Readiness: adds emails_drafted flag to leads
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bhdvjckhtoqtmuawboap/sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS emails_drafted BOOLEAN DEFAULT FALSE;

-- Backfill: mark any lead where day1_sent = true as emails_drafted = true
-- (if they were sent, they obviously had drafts)
UPDATE leads
  SET emails_drafted = TRUE
  WHERE day1_sent = TRUE AND (emails_drafted IS NULL OR emails_drafted = FALSE);
