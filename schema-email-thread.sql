-- NeverMiss Hawaii CRM — Email Thread Schema
-- Run in Supabase SQL Editor after schema-update.sql
-- Adds lead_emails table to store full email conversation threads per lead

CREATE TABLE IF NOT EXISTS lead_emails (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  subject       TEXT,
  body          TEXT,
  from_email    TEXT,
  to_email      TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  source        TEXT NOT NULL CHECK (source IN ('sequence', 'manual', 'reply')),
  sequence_day  INT,         -- populated for source='sequence' (1, 3, 7, or 10)
  reply_type    TEXT,        -- populated for source='reply' inbound (positive/negative/etc.)
  sent          BOOLEAN DEFAULT TRUE,  -- FALSE = draft (not yet sent to lead)
  message_id    TEXT         -- RFC Message-ID header for deduplication (optional)
);

-- Index for fast thread lookup per lead
CREATE INDEX IF NOT EXISTS lead_emails_lead_id_idx ON lead_emails(lead_id);
CREATE INDEX IF NOT EXISTS lead_emails_sent_at_idx  ON lead_emails(sent_at);

-- Row Level Security (same pattern as all other CRM tables)
ALTER TABLE lead_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth only" ON lead_emails
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
