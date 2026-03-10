// Netlify Function: retell-webhook
// Receives Retell call_ended events.
// - Detects book_appointment_cal or transfer_to_human tool calls
// - Sends Twilio SMS to business owner when a booking is made (Mode 1)
// - Logs every call to Supabase call_logs table (used by weekly/monthly stats)
//
// Required Netlify environment variables:
//   SUPABASE_URL            — Supabase project URL
//   SUPABASE_SERVICE_KEY    — service_role key
//   TWILIO_ACCOUNT_SID      — Twilio account SID
//   TWILIO_AUTH_TOKEN       — Twilio auth token
//   TWILIO_PHONE_NUMBER     — NeverMiss Twilio number (e.g. +18087243713)
//
// Optional:
//   RETELL_WEBHOOK_SECRET   — if set, verifies Retell HMAC signature
//
// Retell webhook setup (one-time per agent — done automatically by create-retell-agent.py):
//   The webhook_url on each agent is set to:
//   https://crm.nevermisshawaii.com/.netlify/functions/retell-webhook

const crypto = require('crypto');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sbHeaders(serviceKey) {
  return {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
}

// Verify Retell HMAC signature (optional — only if RETELL_WEBHOOK_SECRET is set)
function verifySignature(body, signatureHeader, secret) {
  if (!secret) return true; // skip if no secret configured
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return signatureHeader === expected;
}

// Parse transcript_object to find tool calls
function findToolCall(transcriptObj, toolName) {
  if (!Array.isArray(transcriptObj)) return null;
  return transcriptObj.find(
    (t) => t.role === 'tool_call_invocation' && t.name === toolName
  ) || null;
}

// Parse booking args from tool_call_invocation arguments string
function parseBookingArgs(toolCallItem) {
  try {
    const raw = toolCallItem.arguments || toolCallItem.parameters || '{}';
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

// Format ISO datetime → human-readable: "Tuesday Mar 10 at 2:30 PM"
function formatDatetime(iso) {
  if (!iso) return 'scheduled time';
  try {
    const d = new Date(iso);
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = days[d.getDay()];
    const month = months[d.getMonth()];
    const date = d.getDate();
    let hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = mins === '00' ? `${hours} ${ampm}` : `${hours}:${mins} ${ampm}`;
    return `${day} ${month} ${date} at ${timeStr}`;
  } catch {
    return iso;
  }
}

// Classify call type based on transcript_object
function classifyCall(transcriptObj, durationMs) {
  if (!Array.isArray(transcriptObj)) return 'info';
  if (durationMs < 10000) return 'abandoned';
  const toolNames = transcriptObj
    .filter((t) => t.role === 'tool_call_invocation')
    .map((t) => t.name);
  if (toolNames.includes('book_appointment_cal')) return 'booking';
  if (toolNames.includes('transfer_to_human')) return 'transfer';
  return 'info';
}

// ── Supabase: look up owner phone by agent_id ─────────────────────────────────

async function fetchOwnerByAgentId(supabaseUrl, serviceKey, agentId) {
  // onboarding_submissions stores agent_id in additional_notes (written by create-retell-agent.py)
  // We search for the row where additional_notes contains the agent_id
  const url = `${supabaseUrl}/rest/v1/onboarding_submissions?additional_notes=ilike.*${agentId}*&limit=1`;
  const res = await fetch(url, { headers: sbHeaders(serviceKey) });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows.length) return null;
  const row = rows[0];
  return {
    businessName: row.business_name || 'Your business',
    ownerPhone: row.contact_phone || row.business_phone || null,
    ownerName: row.contact_name || 'Owner',
  };
}

// ── Supabase: log call ────────────────────────────────────────────────────────

async function logCall(supabaseUrl, serviceKey, data) {
  const url = `${supabaseUrl}/rest/v1/call_logs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(serviceKey), 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// ── Twilio: send SMS ──────────────────────────────────────────────────────────

async function sendSms(accountSid, authToken, from, to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: to, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  return res.ok;
}

// ── Main handler ──────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Signature verification (optional)
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;
  const sig = event.headers['x-retell-signature'] || '';
  if (webhookSecret && !verifySignature(event.body, sig, webhookSecret)) {
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Only handle call_ended events
  if (payload.event !== 'call_ended') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const call = payload.call || {};
  const agentId        = call.agent_id || '';
  const callId         = call.call_id || '';
  const durationMs     = call.duration_ms || 0;
  const callerPhone    = call.from_number || '';
  const transcriptObj  = call.transcript_object || [];

  const supabaseUrl  = process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_KEY;
  const accountSid   = process.env.TWILIO_ACCOUNT_SID;
  const authToken    = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone    = process.env.TWILIO_PHONE_NUMBER;

  if (!supabaseUrl || !serviceKey) {
    console.error('[retell-webhook] Missing Supabase env vars');
    return { statusCode: 500, body: 'Server config error' };
  }

  // Classify the call
  const callType = classifyCall(transcriptObj, durationMs);

  // Look up owner info
  const owner = await fetchOwnerByAgentId(supabaseUrl, serviceKey, agentId);
  const businessName = owner?.businessName || 'Unknown Business';
  const ownerPhone   = owner?.ownerPhone || null;

  // Extract booking details (Mode 1 only)
  let bookedName     = null;
  let bookedDatetime = null;
  let bookedService  = null;
  let smsSent        = false;

  if (callType === 'booking') {
    const bookingToolCall = findToolCall(transcriptObj, 'book_appointment_cal');
    if (bookingToolCall) {
      const args   = parseBookingArgs(bookingToolCall);
      bookedName     = args.name || args.attendee_name || 'a caller';
      bookedDatetime = args.confirmed_datetime || args.start_time || null;
      bookedService  = args.service_type || args.notes || 'appointment';
    }

    // Send SMS to owner if we have their number and Twilio is configured
    if (ownerPhone && accountSid && authToken && fromPhone) {
      const displayDatetime = formatDatetime(bookedDatetime);
      const displayName     = bookedName || 'a caller';
      const displayService  = bookedService || 'an appointment';
      const displayCaller   = callerPhone
        ? `Their number: ${callerPhone}.`
        : '';

      const smsBody = [
        `📞 Leilani booked ${displayName} for ${displayService} on ${displayDatetime}.`,
        displayCaller,
        '— NeverMiss',
      ].filter(Boolean).join(' ');

      smsSent = await sendSms(accountSid, authToken, fromPhone, ownerPhone, smsBody);
      if (smsSent) {
        console.log(`[retell-webhook] SMS sent to ${ownerPhone} for booking: ${displayName}`);
      } else {
        console.error(`[retell-webhook] Twilio SMS failed for ${ownerPhone}`);
      }
    } else if (!ownerPhone) {
      console.warn(`[retell-webhook] No owner phone for agent_id=${agentId} — SMS skipped`);
    }
  }

  // Log call to Supabase
  await logCall(supabaseUrl, serviceKey, {
    call_id:              callId,
    agent_id:             agentId,
    business_name:        businessName,
    duration_seconds:     Math.round(durationMs / 1000),
    call_type:            callType,
    caller_phone:         callerPhone,
    booked_name:          bookedName,
    booked_datetime:      bookedDatetime,
    booked_service:       bookedService,
    sms_sent_to_owner:    smsSent,
  });

  return { statusCode: 200, body: 'OK' };
};
