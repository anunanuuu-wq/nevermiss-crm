-- ============================================================
-- NeverMiss CRM — SMS Table Schema
-- Run this in Supabase SQL Editor before using the SMS tab
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'received')),
  template    TEXT,          -- e.g. 'text1', 'text3' — which SMS template was used
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-lead queries
CREATE INDEX IF NOT EXISTS idx_lead_sms_lead_id ON lead_sms(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_sms_sent_at ON lead_sms(sent_at DESC);

-- Enable Row Level Security (match leads table pattern)
ALTER TABLE lead_sms ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can manage lead_sms"
  ON lead_sms FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Add SMS tracking columns to leads table ─────────────────
-- Run these separately if leads table already exists:

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sms_sent         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_followup_sent     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_followup_sent_at  TIMESTAMPTZ;
