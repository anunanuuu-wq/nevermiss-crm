-- NeverMiss Hawaii — Call Tracking + Pipeline Stage Migration (v2)
-- Run in Supabase SQL Editor (dashboard.supabase.com → SQL Editor)
-- Safe to run on live DB — handles existing data before adding constraints
-- =================================================================


-- =================================================================
-- PART 1: NORMALIZE EXISTING pipeline_stage VALUES
-- Maps old stage names → new names before adding constraint
-- =================================================================

-- Drop the partially-applied constraint from the previous run (if present)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check;

-- Map old values to new values
UPDATE leads SET pipeline_stage = 'Demo Scheduled' WHERE pipeline_stage = 'Call Scheduled';
UPDATE leads SET pipeline_stage = 'Demo Done'      WHERE pipeline_stage = 'Post Proposal';
UPDATE leads SET pipeline_stage = 'Closed Won'     WHERE pipeline_stage = 'Closed Won';
UPDATE leads SET pipeline_stage = 'DQ'             WHERE pipeline_stage IN ('Disqualified', 'Unsubscribed');

-- Catch-all: any other unrecognized value → 'New Leads'
UPDATE leads
SET pipeline_stage = 'New Leads'
WHERE pipeline_stage IS NOT NULL
  AND pipeline_stage NOT IN (
    'New Leads', 'Contacted', 'Called',
    'Demo Scheduled', 'Demo Done',
    'Closed Won', 'Closed Lost', 'DQ'
  );

-- Now add the constraint — all rows should comply
ALTER TABLE leads
  ADD CONSTRAINT leads_pipeline_stage_check
  CHECK (pipeline_stage IN (
    'New Leads',
    'Contacted',
    'Called',
    'Demo Scheduled',
    'Demo Done',
    'Closed Won',
    'Closed Lost',
    'DQ'
  ));


-- =================================================================
-- PART 2: NORMALIZE EXISTING stage VALUES + ADD CONSTRAINT
-- =================================================================

-- Drop existing stage constraint (if any)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%pipeline_stage%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Normalize old stage values
UPDATE leads SET stage = 'demo_scheduled' WHERE stage = 'call_scheduled';
UPDATE leads SET stage = 'demo_done'      WHERE stage = 'post_proposal';
UPDATE leads SET stage = 'dq'             WHERE stage IN ('disqualified', 'unsubscribed');

-- Catch-all: any unrecognized stage → 'new'
UPDATE leads
SET stage = 'new'
WHERE stage IS NOT NULL
  AND stage NOT IN (
    'new', 'contacted', 'email_sent', 'called',
    'demo_scheduled', 'demo_done',
    'closed_won', 'closed_lost',
    'replied', 'dq'
  );

-- Add updated constraint
ALTER TABLE leads
  ADD CONSTRAINT leads_stage_check
  CHECK (stage IN (
    'new',
    'contacted',
    'email_sent',
    'called',
    'demo_scheduled',
    'demo_done',
    'closed_won',
    'closed_lost',
    'replied',
    'dq'
  ));


-- =================================================================
-- PART 3: CALL TRACKING COLUMNS ON LEADS TABLE
-- =================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS call_count           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_called_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_outcome         TEXT,
  ADD COLUMN IF NOT EXISTS demo_scheduled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_outcome         TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_messaged    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_messaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_sent             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_sent_at          TIMESTAMPTZ;


-- =================================================================
-- PART 4: CALL LOG TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS call_log (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  called_at        TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  outcome          TEXT CHECK (outcome IN (
                     'no_answer',
                     'voicemail',
                     'callback_requested',
                     'demo_booked',
                     'not_interested',
                     'wrong_number',
                     'call_back_later',
                     'bad_timing'
                   )),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_log_lead_id   ON call_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_log_called_at ON call_log(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_called  ON leads(last_called_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_call_outcome ON leads(call_outcome);

ALTER TABLE call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all call_log"
  ON call_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =================================================================
-- VERIFY — results appear below after running
-- =================================================================

-- New columns on leads (should return 8 rows)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN (
    'call_count', 'last_called_at', 'call_outcome',
    'demo_scheduled_at', 'demo_completed_at', 'demo_outcome',
    'linkedin_messaged', 'sms_sent'
  )
ORDER BY column_name;

-- call_log table exists (should return 1)
SELECT COUNT(*) AS call_log_exists
FROM information_schema.tables
WHERE table_name = 'call_log';

-- Current pipeline_stage distribution after migration
SELECT pipeline_stage, COUNT(*) AS leads
FROM leads
GROUP BY pipeline_stage
ORDER BY leads DESC;
