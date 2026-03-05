// ============================================================
// NeverMiss CRM — Messaging Tab (Email Inbox)
// ============================================================
import { supabase } from './client.js';
import { sendEmail } from './email.js';
import { renderEmailThread } from './emailThread.js';
import { showToast, openLead } from './app.js';

const FROM_EMAIL = 'okama@nevermisshawaii.com';

// ── Helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function previewText(body) {
  if (!body) return '(no content)';
  const plain = body.replace(/\n/g, ' ').trim();
  return plain.length > 60 ? plain.slice(0, 60) + '\u2026' : plain;
}

// ── State ────────────────────────────────────────────────────
let _conversations = [];
let _selectedLeadId = null;

// ── Main render ──────────────────────────────────────────────
export async function renderMessaging() {
  const pane = document.getElementById('pane-messaging');
  pane.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';

  // Fetch all emails with lead info
  const { data: emails, error } = await supabase
    .from('lead_emails')
    .select('*, leads(id, business_name, contact_name, email)')
    .order('sent_at', { ascending: false })
    .limit(1000);

  if (error) {
    pane.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load messages</div><div class="empty-state-sub">${esc(error.message)}</div></div>`;
    return;
  }

  // Group by lead_id — keep most recent message per conversation
  const convMap = new Map();
  for (const email of (emails || [])) {
    if (!email.lead_id || !email.leads) continue;
    if (!convMap.has(email.lead_id)) {
      convMap.set(email.lead_id, {
        lead: email.leads,
        leadId: email.lead_id,
        latestEmail: email,
        inboundCount: 0,
      });
    }
    if (email.direction === 'inbound') {
      convMap.get(email.lead_id).inboundCount++;
    }
  }

  _conversations = Array.from(convMap.values())
    .sort((a, b) => new Date(b.latestEmail.sent_at) - new Date(a.latestEmail.sent_at));

  // Render shell
  pane.innerHTML = `
    <div class="messaging-layout">
      <!-- Left: conversation list -->
      <div class="messaging-sidebar">
        <div class="messaging-sidebar-header">
          <div class="messaging-sidebar-title">Conversations</div>
          <button class="btn btn-primary btn-sm" id="msgComposeNew">+ Compose</button>
        </div>
        <div id="msgConvList">
          ${_conversations.length === 0
            ? `<div style="padding:24px 16px;color:var(--text-muted);font-size:13px;text-align:center">No emails yet.<br>Send your first sequence to get started.</div>`
            : _conversations.map(conv => renderConvItem(conv)).join('')
          }
        </div>
      </div>

      <!-- Right: thread view -->
      <div class="messaging-main" id="msgMain">
        <div class="messaging-empty">
          <div class="messaging-empty-icon">\u2709\uFE0F</div>
          <div style="font-size:14px;font-weight:600">Select a conversation</div>
          <div style="font-size:13px">Choose a contact on the left to view the thread</div>
        </div>
      </div>
    </div>
  `;

  // Wire up conversation clicks
  pane.querySelectorAll('.msg-conv-item').forEach(el => {
    el.addEventListener('click', () => selectConversation(el.dataset.leadId));
  });

  // Compose new
  document.getElementById('msgComposeNew')?.addEventListener('click', openComposeNewModal);

  // Auto-select first conversation if none selected
  if (_conversations.length > 0 && !_selectedLeadId) {
    selectConversation(_conversations[0].leadId);
  } else if (_selectedLeadId) {
    selectConversation(_selectedLeadId);
  }
}

function renderConvItem(conv) {
  const lead = conv.lead;
  const name = lead.business_name || lead.contact_name || lead.email || 'Unknown';
  const latest = conv.latestEmail;
  const isInbound = latest.direction === 'inbound';
  const isActive = conv.leadId === _selectedLeadId;

  return `
    <div class="msg-conv-item ${isActive ? 'active' : ''}" data-lead-id="${esc(conv.leadId)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="msg-conv-name">
          ${isInbound ? '<span class="msg-conv-inbound-dot"></span>' : ''}
          ${esc(name)}
        </div>
        <div class="msg-conv-time">${timeAgo(latest.sent_at)}</div>
      </div>
      <div class="msg-conv-preview">
        ${isInbound ? '\u2190 ' : '\u2192 '}${esc(previewText(latest.body))}
      </div>
      ${conv.inboundCount > 0
        ? `<div style="margin-top:5px"><span class="msg-conv-badge">${conv.inboundCount} repl${conv.inboundCount === 1 ? 'y' : 'ies'}</span></div>`
        : ''}
    </div>
  `;
}

// ── Select and render a conversation ─────────────────────────
async function selectConversation(leadId) {
  _selectedLeadId = leadId;

  // Update active state in list
  document.querySelectorAll('.msg-conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.leadId === leadId);
  });

  const conv = _conversations.find(c => c.leadId === leadId);
  if (!conv) return;

  const lead = conv.lead;
  const name = lead.business_name || lead.contact_name || lead.email || 'Unknown';
  const main = document.getElementById('msgMain');
  if (!main) return;

  main.innerHTML = `
    <div class="messaging-thread-wrap">
      <div class="messaging-thread-header">
        <div>
          <div class="messaging-thread-header-name">${esc(name)}</div>
          <div class="messaging-thread-header-email">${esc(lead.email || '')}</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="msgViewLead" data-lead-id="${esc(leadId)}">View Lead</button>
      </div>
      <div class="messaging-thread-body" id="msgThreadBody">
        <div style="text-align:center;padding:20px"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('msgViewLead')?.addEventListener('click', () => {
    openLead(leadId);
  });

  // Render full thread (bubbles + compose) into the messaging thread body
  const threadContainer = document.getElementById('msgThreadBody');
  await renderEmailThread({ ...lead, id: leadId }, threadContainer);
}

// ── Compose New Modal ─────────────────────────────────────────
async function openComposeNewModal() {
  // Load all leads for dropdown
  const { data: leads } = await supabase
    .from('leads')
    .select('id, business_name, contact_name, email')
    .order('business_name', { ascending: true })
    .limit(500);

  let modal = document.getElementById('msgComposeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'msgComposeModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;display:none;align-items:center;justify-content:center';
    document.body.appendChild(modal);
  }

  const leadOptions = (leads || []).map(l => {
    const label = [l.business_name, l.contact_name, l.email].filter(Boolean).join(' \u2014 ');
    return `<option value="${esc(l.id)}" data-email="${esc(l.email || '')}">${esc(label)}</option>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-card" style="max-width:500px;width:100%;padding:24px">
      <div class="modal-header">
        <div class="modal-title">New Email</div>
        <button class="modal-close" id="msgComposeClose">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Lead</label>
        <select class="form-select" id="msgLeadSelect">
          <option value="">\u2014 Select a lead \u2014</option>
          ${leadOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">To</label>
        <input class="form-input" id="msgComposeTo" type="email" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input class="form-input" id="msgComposeSubject" placeholder="Subject">
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="msgComposeBody" rows="7" placeholder="Write your message\u2026"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="msgComposeCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="msgComposeSendBtn">Send</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('msgComposeClose').onclick = close;
  document.getElementById('msgComposeCancelBtn').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // Auto-fill email when lead selected
  document.getElementById('msgLeadSelect').addEventListener('change', e => {
    const opt = e.target.options[e.target.selectedIndex];
    document.getElementById('msgComposeTo').value = opt.dataset.email || '';
  });

  document.getElementById('msgComposeSendBtn').onclick = async () => {
    const leadId     = document.getElementById('msgLeadSelect').value;
    const toVal      = document.getElementById('msgComposeTo').value.trim();
    const subjectVal = document.getElementById('msgComposeSubject').value.trim();
    const bodyVal    = document.getElementById('msgComposeBody').value.trim();

    if (!toVal)   { showToast('Please enter a recipient email', true); return; }
    if (!bodyVal) { showToast('Message body is required', true); return; }

    const sendBtn = document.getElementById('msgComposeSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending\u2026';

    const htmlBody = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">${bodyVal.replace(/\n/g, '<br>')}<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"><p style="font-size:12px;color:#9ca3af">NeverMiss Hawaii \u00b7 24/7 AI Receptionist<br><a href="https://nevermisshawaii.com" style="color:#6366f1">nevermisshawaii.com</a> \u00b7 (808) 724-3713</p></div>`;

    const result = await sendEmail(toVal, subjectVal || '(no subject)', htmlBody);

    if (!result.ok) {
      showToast('Failed to send: ' + result.error, true);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      return;
    }

    // Log to lead_emails
    if (leadId) {
      await supabase.from('lead_emails').insert({
        lead_id:    leadId,
        direction:  'outbound',
        subject:    subjectVal || '(no subject)',
        body:       bodyVal,
        from_email: FROM_EMAIL,
        to_email:   toVal,
        source:     'manual',
        sent:       true,
      });
    }

    showToast('Email sent!');
    close();

    // Re-render messaging tab and auto-select the conversation
    _selectedLeadId = leadId || null;
    await renderMessaging();
  };
}
