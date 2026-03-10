// Netlify Function: track-open
// Called when an email recipient opens a tracked NeverMiss email.
// Logs an email.opened event to Supabase email_events.
// Returns a 1x1 transparent GIF — no visible effect, just a tracking pixel.
//
// Required Netlify env vars (already set — shared with handle-email-events):
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_KEY  — service_role key
//
// Query params:
//   tid  — tracking ID (UUID generated at send time, stored as resend_email_id in lead_emails)
//
// Pixel URL embedded in emails:
//   https://crm.nevermisshawaii.com/.netlify/functions/track-open?tid={tracking_id}

const TRANSPARENT_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function sbHeaders(serviceKey) {
  return {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
  };
}

exports.handler = async (event) => {
  const { tid } = event.queryStringParameters || {};

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && serviceKey && tid) {
    // Fire-and-forget: don't let Supabase errors block the pixel response
    try {
      // Look up the lead_emails row by tracking ID to get lead_id + lead_email_id
      let leadEmailId = null;
      let leadId      = null;

      const leRes  = await fetch(
        `${supabaseUrl}/rest/v1/lead_emails?resend_email_id=eq.${encodeURIComponent(tid)}&select=id,lead_id&limit=1`,
        { headers: sbHeaders(serviceKey) }
      );
      const leRows = await leRes.json();
      if (Array.isArray(leRows) && leRows[0]) {
        leadEmailId = leRows[0].id;
        leadId      = leRows[0].lead_id;
      }

      // Log the open event to email_events
      await fetch(`${supabaseUrl}/rest/v1/email_events`, {
        method:  'POST',
        headers: sbHeaders(serviceKey),
        body:    JSON.stringify({
          resend_email_id: tid,
          lead_email_id:   leadEmailId,
          lead_id:         leadId,
          event_type:      'email.opened',
          occurred_at:     new Date().toISOString(),
        }),
      });

      console.log(`[track-open] Opened: tid=${tid.slice(0, 8)} lead=${leadId || 'unknown'}`);
    } catch (e) {
      console.error('[track-open] Error:', e.message);
    }
  }

  // Always return the 1x1 transparent GIF regardless of tracking outcome
  return {
    statusCode:      200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma':        'no-cache',
    },
    body:            TRANSPARENT_GIF,
    isBase64Encoded: true,
  };
};
