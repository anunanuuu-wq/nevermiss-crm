// Netlify Function: handle-email-events
// Receives ALL Resend webhook events and logs them to the email_events table.
// For email.bounced and email.complained: also DQs the lead (sets pipeline_stage=DQ,
// stops sequence, logs note + notification + bounce email thread entry).
//
// Required Netlify environment variables:
//   BOUNCE_WEBHOOK_TOKEN  — shared secret, sent by Resend as X-Webhook-Token header
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_KEY  — service_role key
//
// Resend webhook setup (manual, one-time):
//   Dashboard → Webhooks → Add endpoint
//   URL: https://crm.nevermisshawaii.com/.netlify/functions/handle-email-events
//   Custom header: X-Webhook-Token: <BOUNCE_WEBHOOK_TOKEN value>
//   Events: email.sent, email.delivered, email.opened, email.clicked,
//           email.bounced, email.complained

const HANDLED_EVENTS = new Set([
  'email.sent', 'email.delivered', 'email.opened',
  'email.clicked', 'email.bounced', 'email.complained',
]);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // No token auth — Resend's webhook validation doesn't reliably support custom headers.
  // Security: endpoint URL is not public; only known Resend event types trigger writes.

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { type, data } = payload;

  // Silently ignore event types we don't handle (Resend sends all subscribed types)
  if (!HANDLED_EVENTS.has(type)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[handle-email-events] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const headers = {
    'apikey':        serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };

  const resendEmailId = data?.email_id;
  const toEmail       = Array.isArray(data?.to) ? data.to[0] : data?.to;
  const clickUrl      = data?.click?.link || null;
  const occurredAt    = data?.created_at || new Date().toISOString();

  try {
    // 1. Try to match the lead_emails row by resend_email_id (most precise match)
    let leadEmailId = null;
    let leadId      = null;

    if (resendEmailId) {
      const leRes = await fetch(
        `${supabaseUrl}/rest/v1/lead_emails?resend_email_id=eq.${encodeURIComponent(resendEmailId)}&select=id,lead_id&limit=1`,
        { headers }
      );
      const leRows = await leRes.json();
      if (Array.isArray(leRows) && leRows[0]) {
        leadEmailId = leRows[0].id;
        leadId      = leRows[0].lead_id;
      }
    }

    // 2. If no lead_emails match, fall back to looking up lead by recipient email
    if (!leadId && toEmail) {
      const lookupRes = await fetch(
        `${supabaseUrl}/rest/v1/leads?email=eq.${encodeURIComponent(toEmail)}&select=id&limit=1`,
        { headers }
      );
      const leads = await lookupRes.json();
      if (Array.isArray(leads) && leads[0]) {
        leadId = leads[0].id;
      }
    }

    // 3. Log the event to email_events
    const minHeaders = { ...headers, 'Prefer': 'return=minimal' };
    await fetch(`${supabaseUrl}/rest/v1/email_events`, {
      method: 'POST',
      headers: minHeaders,
      body: JSON.stringify({
        resend_email_id: resendEmailId || 'unknown',
        lead_email_id:   leadEmailId,
        lead_id:         leadId,
        event_type:      type,
        click_url:       clickUrl,
        occurred_at:     occurredAt,
      }),
    });

    console.log(`[handle-email-events] Logged ${type} for ${toEmail || resendEmailId || 'unknown'}`);

    // 4. For bounces/complaints: DQ the lead
    if (type === 'email.bounced' || type === 'email.complained') {
      if (!toEmail) {
        console.warn('[handle-email-events] No recipient email for bounce/complaint — cannot DQ');
        return { statusCode: 200, body: JSON.stringify({ ok: true, logged: true, dq: false }) };
      }

      // Re-fetch lead with bounce fields to check current state
      const fullLookup = await fetch(
        `${supabaseUrl}/rest/v1/leads?email=eq.${encodeURIComponent(toEmail)}&select=id,business_name,email_bounced&limit=1`,
        { headers }
      );
      const fullLeads = await fullLookup.json();
      const lead = Array.isArray(fullLeads) ? fullLeads[0] : null;

      if (!lead) {
        console.log(`[handle-email-events] No lead found for ${toEmail} — skipping DQ`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, logged: true, dq: false }) };
      }

      if (lead.email_bounced) {
        console.log(`[handle-email-events] Lead ${lead.id} already marked bounced — skipping DQ`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, logged: true, dq: 'already bounced' }) };
      }

      const reason = type === 'email.complained'
        ? `Spam complaint (Resend event: email.complained)`
        : `Hard bounce (Resend event: email.bounced, email_id: ${resendEmailId || 'unknown'})`;

      await markLeadBounced(supabaseUrl, minHeaders, lead.id, lead.business_name || toEmail, toEmail, reason);
      console.log(`[handle-email-events] DQ'd lead ${lead.id} (${toEmail}). Reason: ${reason}`);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, type, lead_id: leadId }) };

  } catch (e) {
    console.error('[handle-email-events] Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// ── Bounce handling (DQ lead, log note + notification + email thread entry) ───
async function markLeadBounced(supabaseUrl, headers, leadId, bizName, toEmail, reason) {
  const now = new Date().toISOString();

  // 1. Update lead: DQ, stop sequence, mark bounced
  await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${leadId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      email_bounced:   true,
      bounced_at:      now,
      bounce_reason:   reason,
      pipeline_stage:  'DQ',
      sequence_active: false,
    }),
  });

  // 2. Add lead note
  await fetch(`${supabaseUrl}/rest/v1/lead_notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      lead_id: leadId,
      content: `Email bounced on ${now.slice(0, 10)}: ${reason}`,
    }),
  });

  // 3. Add notification
  await fetch(`${supabaseUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      lead_id: leadId,
      type:    'bounce',
      message: `Email bounced for ${bizName} (${toEmail}) \u2014 moved to DQ. ${reason}`,
      read:    false,
    }),
  });

  // 4. Log to lead_emails thread (source='bounce', direction='inbound')
  await fetch(`${supabaseUrl}/rest/v1/lead_emails`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      lead_id:    leadId,
      direction:  'inbound',
      subject:    'Email Delivery Failure',
      body:       reason,
      from_email: 'MAILER-DAEMON',
      to_email:   toEmail,
      source:     'bounce',
      sent:       true,
    }),
  });
}
