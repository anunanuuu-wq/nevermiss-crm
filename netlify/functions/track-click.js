// Netlify Function: track-click
// Called when an email recipient clicks a tracked link in a NeverMiss email.
// Logs an email.clicked event to Supabase, then 302-redirects to the real URL.
//
// Required Netlify env vars (already set — shared with handle-email-events):
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_KEY  — service_role key
//
// Query params:
//   tid  — tracking ID (UUID, matches resend_email_id in lead_emails)
//   url  — target URL (URL-encoded)
//
// Link format embedded in emails:
//   https://crm.nevermisshawaii.com/.netlify/functions/track-click?tid={tracking_id}&url={encoded_target_url}

function sbHeaders(serviceKey) {
  return {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
  };
}

exports.handler = async (event) => {
  const { tid, url } = event.queryStringParameters || {};
  const targetUrl    = url ? decodeURIComponent(url) : null;

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && serviceKey && tid) {
    try {
      // Look up lead_emails row to get lead_id + lead_email_id
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

      // Log the click event
      await fetch(`${supabaseUrl}/rest/v1/email_events`, {
        method:  'POST',
        headers: sbHeaders(serviceKey),
        body:    JSON.stringify({
          resend_email_id: tid,
          lead_email_id:   leadEmailId,
          lead_id:         leadId,
          event_type:      'email.clicked',
          click_url:       targetUrl,
          occurred_at:     new Date().toISOString(),
        }),
      });

      console.log(`[track-click] Click: tid=${tid.slice(0, 8)} → ${targetUrl}`);
    } catch (e) {
      console.error('[track-click] Error:', e.message);
    }
  }

  // Redirect to the real URL
  if (targetUrl) {
    return {
      statusCode: 302,
      headers:    { Location: targetUrl },
      body:       '',
    };
  }

  return { statusCode: 400, body: 'Missing url parameter' };
};
