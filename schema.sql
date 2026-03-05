-- NeverMiss Hawaii CRM — Supabase Schema
-- Paste this entire file into Supabase SQL Editor and click Run

-- ============================================================
-- LEADS (main table)
-- ============================================================
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  industry TEXT,
  city TEXT,
  state TEXT DEFAULT 'HI',
  pipeline_stage TEXT DEFAULT 'Cold'
    CHECK (pipeline_stage IN ('Cold','Interested','Demo Sent','Appointment Set','Closed','DQ')),
  priority TEXT DEFAULT 'C' CHECK (priority IN ('A','B','C')),
  source TEXT DEFAULT 'Manual',
  next_action_date DATE,
  next_action_type TEXT,
  notes TEXT,
  day1_sent BOOLEAN DEFAULT FALSE,
  day1_sent_at TIMESTAMPTZ,
  day3_sent BOOLEAN DEFAULT FALSE,
  day3_sent_at TIMESTAMPTZ,
  day7_sent BOOLEAN DEFAULT FALSE,
  day7_sent_at TIMESTAMPTZ,
  day10_sent BOOLEAN DEFAULT FALSE,
  day10_sent_at TIMESTAMPTZ,
  sequence_active BOOLEAN DEFAULT FALSE,
  mrr_value NUMERIC DEFAULT 300
);

-- ============================================================
-- LEAD NOTES (multiple notes per lead)
-- ============================================================
CREATE TABLE lead_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL
);

-- ============================================================
-- DAILY TASKS
-- ============================================================
CREATE TABLE daily_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  task_date DATE DEFAULT CURRENT_DATE,
  content TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- SCRIPTS (user-editable, saved in DB not localStorage)
-- ============================================================
CREATE TABLE scripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT ''
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  type TEXT,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- AUTO-UPDATE updated_at ON LEADS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything
CREATE POLICY "auth only" ON leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth only" ON lead_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth only" ON daily_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth only" ON scripts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth only" ON notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DEFAULT SCRIPTS
-- ============================================================
INSERT INTO scripts (key, title) VALUES
  ('warmOutreach',   'Warm Outreach'),
  ('coldEmail',      'Cold Email'),
  ('coldCall',       'Cold Call'),
  ('salesCall',      'Sales Call'),
  ('sequenceDay1',   'Day 1 Email'),
  ('sequenceDay3',   'Day 3 Email'),
  ('sequenceDay7',   'Day 7 Email'),
  ('sequenceDay10',  'Day 10 Email');
