-- NeverMiss Hawaii CRM — Email Engagement Schema
-- Run in Supabase SQL Editor
-- Adds resend_email_id to lead_emails and creates email_events table

-- 1. Add resend_email_id to lead_emails (nullable — existing rows stay NULL)
ALTER TABLE lead_emails
  ADD COLUMN IF NOT EXISTS resend_email_id TEXT;

CREATE INDEX IF NOT EXISTS lead_emails_resend_id_idx ON lead_emails(resend_email_id);

-- 2. Email engagement events table — one row per Resend webhook event
CREATE TABLE IF NOT EXISTS email_events (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  resend_email_id  TEXT NOT NULL,
  lead_email_id    UUID REFERENCES lead_emails(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,  -- sent, delivered, opened, clicked, bounced, complained
  click_url        TEXT,           -- populated for email.clicked events
  occurred_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_events_resend_id_idx   ON email_events(resend_email_id);
CREATE INDEX IF NOT EXISTS email_events_lead_id_idx     ON email_events(lead_id);
CREATE INDEX IF NOT EXISTS email_events_event_type_idx  ON email_events(event_type);
CREATE INDEX IF NOT EXISTS email_events_occurred_at_idx ON email_events(occurred_at);

-- Row Level Security
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth only" ON email_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
