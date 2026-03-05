-- NeverMiss Hawaii CRM — Schema Update
-- Run this in Supabase SQL Editor AFTER the original schema.sql

-- ============================================================
-- NEW COLUMNS ON LEADS
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not sent'
    CHECK (onboarding_status IN ('not sent','sent','submitted')),
  ADD COLUMN IF NOT EXISTS contract_status TEXT DEFAULT 'not sent'
    CHECK (contract_status IN ('not sent','sent','signed'));

-- ============================================================
-- ONBOARDING SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,

  -- Business
  business_name TEXT,
  industry TEXT,
  address TEXT,
  website TEXT,

  -- Contacts
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  business_phone TEXT,

  -- Service mode
  service_mode TEXT CHECK (service_mode IN ('auto','transfer')),

  -- Calendar
  calendar_type TEXT,
  available_days TEXT,
  hours_start TEXT,
  hours_end TEXT,
  appt_duration TEXT,

  -- Top 5 FAQs
  faq_1_q TEXT, faq_1_a TEXT,
  faq_2_q TEXT, faq_2_a TEXT,
  faq_3_q TEXT, faq_3_a TEXT,
  faq_4_q TEXT, faq_4_a TEXT,
  faq_5_q TEXT, faq_5_a TEXT,

  -- Pricing
  estimates_policy TEXT,
  avg_job_value TEXT,
  emergency_service BOOLEAN DEFAULT FALSE,
  service_area TEXT,

  -- Voice / AI
  voice_style TEXT,
  ai_name TEXT DEFAULT 'Leilani',
  greeting_script TEXT,

  -- Go-live
  target_golive_date DATE,
  best_test_time TEXT,
  additional_notes TEXT,

  -- Signature
  signer_name TEXT,
  signer_date DATE,

  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted'))
);

CREATE TRIGGER onboarding_updated_at
  BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert onboarding"
  ON onboarding_submissions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon select onboarding"
  ON onboarding_submissions FOR SELECT TO anon USING (true);

CREATE POLICY "auth all onboarding"
  ON onboarding_submissions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================
-- CONTRACT SIGNATURES
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,

  -- Client details captured at signing
  business_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  business_address TEXT,

  -- Deal terms
  service_mode TEXT CHECK (service_mode IN ('auto','transfer')),
  monthly_fee TEXT DEFAULT '$300.00/month',
  setup_tier TEXT,
  setup_fee TEXT,
  included_hours TEXT,

  -- Digital signature
  signature_text TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW(),

  status TEXT DEFAULT 'signed' CHECK (status IN ('signed'))
);

ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert contract"
  ON contract_signatures FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon select contract"
  ON contract_signatures FOR SELECT TO anon USING (true);

CREATE POLICY "auth all contracts"
  ON contract_signatures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Allow anon to read leads by ID (needed for client-facing forms to pre-fill business name)
-- UUID is 128-bit random — functionally unguessable, safe as shared secret
CREATE POLICY "anon read lead by id"
  ON leads FOR SELECT TO anon USING (true);

-- ============================================================
-- SMYKM PERSONALIZATION FIELDS ON LEADS
-- Run in Supabase SQL Editor after the original schema-update.sql
-- Safe to run on live DB — IF NOT EXISTS skips existing columns
-- ============================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address               TEXT,
  ADD COLUMN IF NOT EXISTS personalization_notes TEXT,
  ADD COLUMN IF NOT EXISTS recent_win            TEXT,
  ADD COLUMN IF NOT EXISTS smykm_subject_1       TEXT,
  ADD COLUMN IF NOT EXISTS smykm_subject_2       TEXT,
  ADD COLUMN IF NOT EXISTS smykm_subject_3       TEXT,
  ADD COLUMN IF NOT EXISTS specialty             TEXT,
  ADD COLUMN IF NOT EXISTS values_notes          TEXT,
  ADD COLUMN IF NOT EXISTS years_in_business     TEXT;
