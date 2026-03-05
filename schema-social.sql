-- ============================================================
-- NeverMiss Social Media Tables
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Post queue (content waiting to be posted or already posted)
CREATE TABLE IF NOT EXISTS social_queue (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  platform      TEXT        NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin')),
  content       TEXT        NOT NULL,
  media_url     TEXT,
  media_type    TEXT        CHECK (media_type IN ('image', 'video', 'carousel', NULL)),
  hashtags      TEXT,
  scheduled_at  TIMESTAMPTZ,
  status        TEXT        DEFAULT 'approved'
                            CHECK (status IN ('approved', 'posted', 'failed', 'cancelled')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);

-- Published posts + engagement metrics
CREATE TABLE IF NOT EXISTS social_posts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id         UUID        REFERENCES social_queue(id),
  platform         TEXT        NOT NULL,
  platform_post_id TEXT,
  content          TEXT,
  posted_at        TIMESTAMPTZ DEFAULT NOW(),
  likes            INTEGER     DEFAULT 0,
  comments         INTEGER     DEFAULT 0,
  shares           INTEGER     DEFAULT 0,
  reach            INTEGER     DEFAULT 0,
  impressions      INTEGER     DEFAULT 0,
  last_synced_at   TIMESTAMPTZ
);

-- Inbound DMs and comments + AI draft responses
CREATE TABLE IF NOT EXISTS social_messages (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  platform      TEXT        NOT NULL,
  message_id    TEXT,
  sender_name   TEXT,
  sender_id     TEXT,
  message_type  TEXT        CHECK (message_type IN ('dm', 'comment', 'mention', 'reply')),
  content       TEXT,
  post_id       TEXT,
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  intent        TEXT        CHECK (intent IN ('interested', 'neutral', 'negative', 'spam', 'question', NULL)),
  ai_draft      TEXT,
  replied       BOOLEAN     DEFAULT FALSE,
  reply_sent_at TIMESTAMPTZ,
  reply_text    TEXT,
  status        TEXT        DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent_to_telegram', 'approved', 'replied', 'ignored'))
);
