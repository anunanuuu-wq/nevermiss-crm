// ============================================================
// NeverMiss CRM — SMS Tab (iMessage/SMS Outreach Inbox)
// ============================================================
import { supabase } from './client.js';
import { showToast, openLead } from './app.js';

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

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
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
export async function renderSms(containerEl) {
  const pane = containerEl || document.getElementById('pane-sms');
  pane.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';

  const { data: messages, error } = await supabase
    .from('lead_sms')
    .select('*, leads(id, business_name, contact_name, phone)')
    .order('sent_at', { ascending: false })
    .limit(1000);

  if (error) {
    pane.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load SMS messages</div><div class="empty-state-sub">${esc(error.message)}</div></div>`;
    return;
  }

  // Group by lead_id — keep most recent message per conversation
  const convMap = new Map();
  for (const msg of (messages || [])) {
    if (!msg.lead_id || !msg.leads) continue;
    if (!convMap.has(msg.lead_id)) {
      convMap.set(msg.lead_id, {
        lead: msg.leads,
        leadId: msg.lead_id,
        latestMsg: msg,
        inboundCount: 0,
      });
    }
    if (msg.direction === 'inbound') {
      convMap.get(msg.lead_id).inboundCount++;
    }
  }

  _conversations = Array.from(convMap.values())
    .sort((a, b) => new Date(b.latestMsg.sent_at) - new Date(a.latestMsg.sent_at));

  pane.innerHTML = `
    <div class="messaging-layout">
      <!-- Left: conversation list -->
      <div class="messaging-sidebar">
        <div class="messaging-sidebar-header">
          <div class="messaging-sidebar-title">SMS Conversations</div>
        </div>
        <div id="smsConvList">
          ${_conversations.length === 0
            ? `<div style="padding:24px 16px;color:var(--text-muted);font-size:13px;text-align:center">No SMS messages yet.<br>Run the SMS workflow to start sending texts.</div>`
            : _conversations.map(conv => renderConvItem(conv)).join('')
          }
        </div>
      </div>

      <!-- Right: thread view -->
      <div class="messaging-main" id="smsMain">
        <div class="messaging-empty">
          <div class="sms-empty-icon">💬</div>
          <div style="font-size:14px;font-weight:600">Select a conversation</div>
          <div style="font-size:13px">Choose a contact on the left to view the SMS thread</div>
        </div>
      </div>
    </div>
  `;

  pane.querySelectorAll('.sms-conv-item').forEach(el => {
    el.addEventListener('click', () => selectConversation(el.dataset.leadId));
  });

  if (_conversations.length > 0 && !_selectedLeadId) {
    selectConversation(_conversations[0].leadId);
  } else if (_selectedLeadId) {
    selectConversation(_selectedLeadId);
  }
}

function renderConvItem(conv) {
  const lead = conv.lead;
  const name = lead.business_name || lead.contact_name || lead.phone || 'Unknown';
  const latest = conv.latestMsg;
  const isInbound = latest.direction === 'inbound';
  const isActive = conv.leadId === _selectedLeadId;

  return `
    <div class="sms-conv-item msg-conv-item ${isActive ? 'active' : ''}" data-lead-id="${esc(conv.leadId)}">
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
        ? `<div style="margin-top:5px"><span class="sms-inbound-badge">${conv.inboundCount} repl${conv.inboundCount === 1 ? 'y' : 'ies'}</span></div>`
        : ''}
    </div>
  `;
}

// ── Select and render a conversation ─────────────────────────
async function selectConversation(leadId) {
  _selectedLeadId = leadId;

  document.querySelectorAll('.sms-conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.leadId === leadId);
  });

  const conv = _conversations.find(c => c.leadId === leadId);
  if (!conv) return;

  const lead = conv.lead;
  const name = lead.business_name || lead.contact_name || lead.phone || 'Unknown';
  const main = document.getElementById('smsMain');
  if (!main) return;

  main.innerHTML = `
    <div class="messaging-thread-wrap">
      <div class="messaging-thread-header">
        <div>
          <div class="messaging-thread-header-name">${esc(name)}</div>
          <div class="messaging-thread-header-email" style="color:var(--text-muted)">${esc(lead.phone || '')}</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="smsViewLead" data-lead-id="${esc(leadId)}">View Lead</button>
      </div>
      <div class="sms-thread-body" id="smsThreadBody">
        <div style="text-align:center;padding:20px"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('smsViewLead')?.addEventListener('click', () => {
    openLead(leadId);
  });

  await loadThread(leadId, lead);
}

async function loadThread(leadId, lead) {
  const { data: messages, error } = await supabase
    .from('lead_sms')
    .select('*')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: true });

  const container = document.getElementById('smsThreadBody');
  if (!container) return;

  if (error) {
    container.innerHTML = `<div class="empty-state">Failed to load thread</div>`;
    return;
  }

  const msgs = messages || [];

  container.innerHTML = `
    <div class="sms-bubble-list" id="smsBubbles">
      ${msgs.length === 0
        ? '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">No messages in this thread</div>'
        : msgs.map(m => renderBubble(m)).join('')
      }
    </div>
    <div class="sms-compose">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">
        Replies are sent manually via iMessage. Log incoming replies here.
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea class="sms-compose-input" id="smsReplyInput" rows="2"
          placeholder="Log an inbound reply from ${esc(lead.business_name || 'this lead')}\u2026"></textarea>
        <button class="btn btn-primary btn-sm" id="smsLogReplyBtn">Log Reply</button>
      </div>
    </div>
  `;

  // Scroll to bottom
  const bubbles = document.getElementById('smsBubbles');
  if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;

  document.getElementById('smsLogReplyBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('smsReplyInput');
    const body = input?.value.trim();
    if (!body) return;

    const btn = document.getElementById('smsLogReplyBtn');
    btn.disabled = true;
    btn.textContent = 'Saving\u2026';

    const { error: insertErr } = await supabase.from('lead_sms').insert({
      lead_id:   leadId,
      direction: 'inbound',
      body,
      status:    'received',
    });

    if (insertErr) {
      showToast('Failed to log reply', true);
    } else {
      showToast('Reply logged');
      input.value = '';
      // Update pipeline stage to Contacted
      await supabase.from('leads')
        .update({ pipeline_stage: 'Contacted' })
        .eq('id', leadId)
        .eq('pipeline_stage', 'New Leads');
      await loadThread(leadId, lead);
      // Refresh conversation list counts
      await renderSms();
      selectConversation(leadId);
    }

    btn.disabled = false;
    btn.textContent = 'Log Reply';
  });
}

function renderBubble(msg) {
  const isOutbound = msg.direction === 'outbound';
  const statusBadge = isOutbound ? renderStatus(msg) : '';

  return `
    <div class="sms-bubble-row ${isOutbound ? 'sms-bubble-row--out' : 'sms-bubble-row--in'}">
      <div class="sms-bubble ${isOutbound ? 'sms-bubble--out' : 'sms-bubble--in'}">
        ${esc(msg.body)}
        ${statusBadge}
      </div>
      <div class="sms-bubble-time">${formatTime(msg.sent_at)}</div>
    </div>
  `;
}

function renderStatus(msg) {
  const map = {
    sent:     { color: '#6b7280', label: 'Sent' },
    delivered:{ color: '#3b82f6', label: 'Delivered' },
    failed:   { color: '#ef4444', label: 'Failed' },
  };
  const s = map[msg.status] || map['sent'];
  return `<span class="sms-status-badge" style="background:${s.color}">${s.label}</span>`;
}
