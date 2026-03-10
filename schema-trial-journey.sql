-- ============================================================
-- schema-trial-journey.sql
-- NeverMiss — Customer Journey (Trial → Paid) columns
-- Run in Supabase SQL Editor: Project → SQL Editor → New Query
-- ============================================================
-- Created: 2026-03-09
-- Plan:    plans/2026-03-09-customer-journey-optimization.md
-- ============================================================

-- ── leads table additions ─────────────────────────────────────────────────────
-- Tracks whether the combined trial setup email (onboarding form + trial agreement)
-- has been sent from the CRM Documents pane "Send Trial Setup" button.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS trial_setup_sent     BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_setup_sent_at  TIMESTAMPTZ;

-- ── onboarding_submissions table additions ────────────────────────────────────
-- Tracks trial agreement signature and automated check-in milestones.

ALTER TABLE onboarding_submissions
  -- Trial agreement (separate from the full service contract)
  ADD COLUMN IF NOT EXISTS trial_agreement_signed      BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_agreement_signed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_agreement_signer_name TEXT,

  -- Week 1 stats report (Day 7)
  ADD COLUMN IF NOT EXISTS week1_report_sent     BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS week1_report_sent_at  TIMESTAMPTZ,

  -- Day 12 trial check-in
  ADD COLUMN IF NOT EXISTS trial_checkin_sent    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_checkin_sent_at TIMESTAMPTZ;

-- ── Verification queries ──────────────────────────────────────────────────────
-- Run these after the migration to confirm columns were added:

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'leads'
--   AND column_name IN ('trial_setup_sent', 'trial_setup_sent_at')
-- ORDER BY column_name;

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'onboarding_submissions'
--   AND column_name IN (
--     'trial_agreement_signed', 'trial_agreement_signed_at', 'trial_agreement_signer_name',
--     'week1_report_sent', 'week1_report_sent_at',
--     'trial_checkin_sent', 'trial_checkin_sent_at'
--   )
-- ORDER BY column_name;
