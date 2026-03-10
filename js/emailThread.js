// ============================================================
// NeverMiss CRM — Email Thread (per-lead conversation view)
// ============================================================
import { supabase } from './client.js';
import { sendEmail } from './email.js';
import { showToast } from './app.js';

const FROM_EMAIL = 'okama@nevermisshawaii.com';

// ── Source label helpers ─────────────────────────────────────
function sourceLabel(row) {
  if (row.source === 'sequence') {
    return `Day ${row.sequence_day} Sequence`;
  }
  if (row.source === 'manual') return 'Manual';
  if (row.source === 'reply')  return 'Reply';
  return '';
}

function directionLabel(row, leadName) {
  if (row.direction === 'outbound') return 'You (NeverMiss)';
  return leadName || 'Lead';
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render the full thread into a container element ──────────
async function loadAndRender(lead, container) {
  container.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div></div>';

  const { data: emails, error } = await supabase
    .from('lead_emails')
    .select('*')
    .eq('lead_id', lead.id)
    .order('sent_at', { ascending: true });

  if (error) {
    container.innerHTML = `<div style="color:var(--dq);font-size:13px;padding:8px">Failed to load emails: ${esc(error.message)}</div>`;
    return;
  }

  // Fetch engagement events for emails that have a resend_email_id
  const resendIds = (emails || []).filter(e => e.resend_email_id).map(e => e.resend_email_id);
  const engagementMap = {};
  if (resendIds.length) {
    const { data: evts } = await supabase
      .from('email_events')
      .select('resend_email_id, event_type')
      .in('resend_email_id', resendIds);
    (evts || []).forEach(ev => {
      if (!engagementMap[ev.resend_email_id]) engagementMap[ev.resend_email_id] = new Set();
      engagementMap[ev.resend_email_id].add(ev.event_type);
    });
  }

  // Build last subject for compose pre-fill
  const lastEmail = emails && emails.length > 0 ? emails[emails.length - 1] : null;
  const lastSubject = lastEmail?.subject || '';

  // Thread bubbles
  const bubblesHtml = (emails && emails.length > 0)
    ? emails.map(row => {
        const isOut = row.direction === 'outbound';
        const isDraft = isOut && !row.sent;
        const events = row.resend_email_id ? (engagementMap[row.resend_email_id] || new Set()) : new Set();
        const openedBadge    = events.has('email.opened')    ? '<span class="engage-badge opened">Opened</span>'       : '';
        const clickedBadge   = events.has('email.clicked')   ? '<span class="engage-badge clicked">Clicked</span>'     : '';
        const deliveredBadge = events.has('email.delivered') ? '<span class="engage-badge delivered">Delivered</span>' : '';
        return `
        <div class="email-bubble ${isOut ? 'email-bubble-out' : 'email-bubble-in'}${isDraft ? ' email-bubble-draft' : ''}">
          <div class="email-bubble-meta">
            <span class="email-bubble-from">${esc(directionLabel(row, lead.contact_name || lead.business_name))}</span>
            <span class="email-bubble-badge">${esc(sourceLabel(row))}</span>
            ${isDraft ? '<span class="email-bubble-draft-tag">Draft — not sent</span>' : ''}
            ${deliveredBadge}${openedBadge}${clickedBadge}
          </div>
          ${row.subject ? `<div class="email-bubble-subject">${esc(row.subject)}</div>` : ''}
          <div class="email-bubble-body">${esc(row.body || '').replace(/\n/g, '<br>')}</div>
          <div class="email-bubble-ts">${formatDate(row.sent_at)}</div>
        </div>`;
      }).join('')
    : `<div class="email-thread-empty">No emails yet — send the first one below.</div>`;

  // Compose area
  const defaultSubject = lastSubject
    ? (lastSubject.toLowerCase().startsWith('re:') ? lastSubject : `Re: ${lastSubject}`)
    : '';

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
      <button class="btn btn-secondary btn-sm" id="etRefreshBtn" style="font-size:11px;padding:3px 10px">↻ Refresh</button>
    </div>
    <div class="email-thread-list" id="emailBubbleList">${bubblesHtml}</div>
    <div class="email-compose">
      <div class="email-compose-label">Compose</div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">To</label>
        <input class="form-input" id="etTo" type="email" value="${esc(lead.email || '')}" placeholder="recipient@example.com" style="font-size:13px">
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">Subject</label>
        <input class="form-input" id="etSubject" value="${esc(defaultSubject)}" placeholder="Subject" style="font-size:13px">
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="etBody" rows="5" placeholder="Write your message…" style="font-size:13px;resize:vertical"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary btn-sm" id="etSendBtn">Send Email</button>
      </div>
    </div>
  `;

  // Scroll to bottom of thread
  const list = container.querySelector('#emailBubbleList');
  if (list) list.scrollTop = list.scrollHeight;

  // Refresh handler
  document.getElementById('etRefreshBtn')?.addEventListener('click', () => loadAndRender(lead, container));

  // Send handler
  document.getElementById('etSendBtn').addEventListener('click', async () => {
    const sendBtn = document.getElementById('etSendBtn');
    const toVal      = (document.getElementById('etTo')?.value || '').trim();
    const subjectVal = (document.getElementById('etSubject')?.value || '').trim();
    const bodyVal    = (document.getElementById('etBody')?.value || '').trim();

    if (!toVal)      { showToast('Please enter a recipient email', true); return; }
    if (!bodyVal)    { showToast('Message body is required', true); return; }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    const htmlBody = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">${bodyVal.replace(/\n/g, '<br>')}<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"><p style="font-size:12px;color:#9ca3af">NeverMiss Hawaii · 24/7 AI Receptionist<br><a href="https://nevermisshawaii.com" style="color:#6366f1">nevermisshawaii.com</a> · (808) 724-3713</p></div>`;

    const result = await sendEmail(toVal, subjectVal || '(no subject)', htmlBody);

    if (!result.ok) {
      showToast('Failed to send: ' + result.error, true);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Email';
      return;
    }

    // Log to lead_emails table
    const { error: logErr } = await supabase.from('lead_emails').insert({
      lead_id:         lead.id,
      direction:       'outbound',
      subject:         subjectVal || '(no subject)',
      body:            bodyVal,
      from_email:      FROM_EMAIL,
      to_email:        toVal,
      source:          'manual',
      sent:            true,
      resend_email_id: result.resend_email_id || null,
    });

    if (logErr) {
      console.warn('[emailThread] Failed to log email to thread:', logErr.message);
    }

    showToast('Email sent!');

    // Re-render thread to show new message
    await loadAndRender(lead, container);
  });
}

// ── Public export — called from app.js and messaging.js ──────
export async function renderEmailThread(lead, containerEl) {
  const container = containerEl || document.getElementById('emailThreadContainer');
  if (!container) return;
  await loadAndRender(lead, container);
}
