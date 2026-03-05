-- NeverMiss CRM — Bounce Tracking Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bhdvjckhtoqtmuawboap/sql
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards)

-- Add bounce tracking columns to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email_bounced  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bounced_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_reason  TEXT;

-- Extend lead_emails.source CHECK to include 'bounce'
-- Drop old constraint and recreate with 'bounce' added
ALTER TABLE lead_emails
  DROP CONSTRAINT IF EXISTS lead_emails_source_check;

ALTER TABLE lead_emails
  ADD CONSTRAINT lead_emails_source_check
    CHECK (source IN ('sequence', 'manual', 'reply', 'bounce'));
