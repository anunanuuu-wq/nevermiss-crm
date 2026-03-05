// ============================================================
// NeverMiss CRM — App Router + Lead Modal + Add Lead
// ============================================================
import { supabase } from './client.js';
import { requireAuth, signOut } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderPipeline } from './pipeline.js';
import { renderLeads } from './leads.js';
import { renderSequences } from './sequences.js';
import { renderCalendar } from './calendar.js';
import { renderScripts } from './scripts.js';
import { renderTasks } from './tasks.js';
import { renderNotifications } from './notifications.js';
import { renderDocuments } from './documents.js';
import { showEmailModal } from './email.js';
import { renderEmailThread } from './emailThread.js';
import { renderMessaging } from './messaging.js';
import { renderSms } from './sms.js';
import { renderCampaignStats } from './campaignStats.js';

// ── Toast ────────────────────────────────────────────────────
export function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Current pane state ───────────────────────────────────────
let currentPane = 'dashboard';

const PANES = {
  dashboard:     { label: 'Dashboard',     render: renderDashboard },
  pipeline:      { label: 'Pipeline',      render: renderPipeline },
  leads:         { label: 'Leads',         render: renderLeads },
  sequences:     { label: 'Sequences',     render: renderSequences },
  calendar:      { label: 'Calendar',      render: renderCalendar },
  scripts:       { label: 'Scripts',       render: renderScripts },
  documents:     { label: 'Documents',     render: renderDocuments },
  tasks:         { label: 'Daily Tasks',   render: renderTasks },
  notifications: { label: 'Notifications', render: renderNotifications },
  messaging:     { label: 'Email',         render: renderMessaging },
  sms:           { label: 'SMS',           render: renderSms },
  analytics:     { label: 'Analytics',     render: renderCampaignStats },
};

async function navigate(pane) {
  if (!PANES[pane]) pane = 'dashboard';

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-pane="${pane}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update topbar title
  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) topbarTitle.textContent = PANES[pane].label;

  // Show/hide panes
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  const paneEl = document.getElementById(`pane-${pane}`);
  if (paneEl) paneEl.classList.add('active');

  currentPane = pane;
  await PANES[pane].render();
}

// ── Lead Detail Panel ────────────────────────────────────────
let currentLeadId = null;

export async function openLead(id) {
  currentLeadId = id;
  const panel = document.getElementById('leadPanel');
  const overlay = document.getElementById('leadOverlay');
  const body = document.getElementById('leadPanelBody');

  panel.classList.add('open');
  overlay.classList.add('visible');
  body.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';

  const [{ data: lead }, { data: notes }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('lead_notes').select('*').eq('lead_id', id).order('created_at', { ascending: false })
  ]);

  if (!lead) { body.innerHTML = '<div class="empty-state">Lead not found</div>'; return; }

  document.getElementById('leadPanelTitle').textContent = lead.business_name;

  const stageOpts = ['New Leads','Contacted','Called','Demo Scheduled','Demo Done','Closed Won','Closed Lost','DQ'];
  const actionTypes = ['Call','Email','Follow up','Demo','Proposal','Check in'];

  body.innerHTML = `
    <!-- Stage + Priority row -->
    <div class="panel-section">
      <div class="panel-section-title">Status</div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Pipeline Stage</label>
          <select class="form-select autosave" data-field="pipeline_stage">
            ${stageOpts.map(s => `<option ${lead.pipeline_stage===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Priority</label>
          <select class="form-select autosave" data-field="priority">
            ${['A','B','C'].map(p => `<option ${lead.priority===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- Contact Info -->
    <div class="panel-section">
      <div class="panel-section-title">Contact Info</div>
      <div class="form-group">
        <label class="form-label">Business Name</label>
        <input class="form-input autosave" data-field="business_name" value="${esc(lead.business_name || '')}">
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Contact Name</label>
          <input class="form-input autosave" data-field="contact_name" value="${esc(lead.contact_name || '')}">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Industry</label>
          <input class="form-input autosave" data-field="industry" value="${esc(lead.industry || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Phone</label>
          <input class="form-input autosave" data-field="phone" type="tel" value="${esc(lead.phone || '')}">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Email</label>
          <div style="display:flex;gap:6px">
            <input class="form-input autosave" data-field="email" type="email" value="${esc(lead.email || '')}" style="flex:1;min-width:0">
            <button class="btn btn-secondary btn-sm" id="panelSendCustomEmail" style="white-space:nowrap;align-self:flex-end;margin-bottom:1px">Send Email</button>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">City</label>
          <input class="form-input autosave" data-field="city" value="${esc(lead.city || '')}">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">State</label>
          <input class="form-input autosave" data-field="state" value="${esc(lead.state || 'HI')}">
        </div>
      </div>
      <div class="form-group mb-0">
        <label class="form-label">Website</label>
        <input class="form-input autosave" data-field="website" value="${esc(lead.website || '')}">
      </div>
    </div>

    <!-- Next Action -->
    <div class="panel-section">
      <div class="panel-section-title">Next Action</div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Action Type</label>
          <select class="form-select autosave" data-field="next_action_type">
            <option value="">— None —</option>
            ${actionTypes.map(t => `<option ${lead.next_action_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Action Date</label>
          <input class="form-input autosave" data-field="next_action_date" type="date" value="${lead.next_action_date || ''}">
        </div>
      </div>
    </div>

    <!-- Email Sequence -->
    <div class="panel-section">
      <div class="panel-section-title">Email Sequence</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="seqActiveToggle" ${lead.sequence_active ? 'checked' : ''} style="accent-color:var(--accent)">
          <span style="font-weight:600">Sequence Active</span>
        </label>
      </div>
      <div class="seq-days">
        ${[
          { day: 'day1', label: 'Day 1', sent: lead.day1_sent, ts: lead.day1_sent_at },
          { day: 'day3', label: 'Day 3', sent: lead.day3_sent, ts: lead.day3_sent_at },
          { day: 'day7', label: 'Day 7', sent: lead.day7_sent, ts: lead.day7_sent_at },
          { day: 'day10', label: 'Day 10', sent: lead.day10_sent, ts: lead.day10_sent_at },
        ].map(d => `
          <label class="seq-day ${d.sent ? 'sent' : ''}" data-day="${d.day}">
            <input type="checkbox" class="seq-day-cb" data-day="${d.day}" ${d.sent ? 'checked' : ''} style="display:none">
            <div style="flex:1">
              <div class="seq-day-label">${d.label} Email</div>
              ${d.sent && d.ts
                ? `<div class="seq-day-ts">Sent ${new Date(d.ts).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</div>`
                : `<div class="seq-day-ts">Not sent</div>`
              }
            </div>
            ${d.sent ? '<span class="seq-day-check">✓</span>' : ''}
          </label>
        `).join('')}
      </div>
    </div>

    <!-- Notes -->
    <div class="panel-section">
      <div class="panel-section-title">Notes</div>
      ${(notes || []).map(n => `
        <div class="note-item">
          <div>${esc(n.content)}</div>
          <div class="note-ts">${new Date(n.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</div>
        </div>
      `).join('') || '<div style="color:var(--text-muted);font-size:13px">No notes yet</div>'}
      <div class="add-note-row">
        <input class="add-note-input" id="newNoteInput" placeholder="Add a note…">
        <button class="btn btn-primary btn-sm" id="addNoteBtn">Add</button>
      </div>
    </div>

    <!-- Messages -->
    <div class="panel-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="panel-section-title" style="margin-bottom:0">Messages</div>
        <div class="panel-msg-toggle">
          <button class="panel-msg-tab active" data-type="email">Email</button>
          <button class="panel-msg-tab" data-type="sms">SMS</button>
        </div>
      </div>
      <div id="emailThreadContainer"></div>
      <div id="smsThreadContainer" style="display:none"></div>
    </div>

    <!-- Documents -->
    <div class="panel-section">
      <div class="panel-section-title">Documents</div>

      <!-- Onboarding Form -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-secondary);margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:5px">Onboarding Form</div>
          <span id="panelOnboardingBadge">${docStatusPill(lead.onboarding_status || 'not sent')}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" id="panelCopyOnboarding">Copy Link</button>
          <button class="btn btn-primary btn-sm" id="panelSendOnboarding">Send</button>
        </div>
      </div>

      <!-- Service Contract -->
      <div style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-secondary)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:13px;font-weight:600;margin-bottom:5px">Service Contract</div>
            <span id="panelContractBadge">${docStatusPill(lead.contract_status || 'not sent', true)}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-select" id="panelContractTier" style="font-size:12px;padding:3px 6px;height:30px;flex:1">
            <option value="0|40">Starter — $0 setup, 40 hrs/mo</option>
            <option value="500|80">Standard — $500 setup, 80 hrs/mo</option>
            <option value="1500|Unlimited">Premium — $1,500 setup, Unlimited</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="panelCopyContract" style="white-space:nowrap">Copy Link</button>
          <button class="btn btn-primary btn-sm" id="panelSendContract" style="white-space:nowrap">Send</button>
        </div>
      </div>
    </div>

    <!-- Lead info footer -->
    <div style="font-size:11.5px;color:var(--text-faint);margin-top:8px">
      Created ${new Date(lead.created_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })} ·
      Source: ${esc(lead.source || 'Manual')}
    </div>
  `;

  // Auto-save on blur
  body.querySelectorAll('.autosave').forEach(el => {
    el.addEventListener('blur', async () => {
      const field = el.dataset.field;
      const value = el.value || null;
      await supabase.from('leads').update({ [field]: value }).eq('id', id);
      showToast('Saved');

      // Update panel title if business name changed
      if (field === 'business_name' && value) {
        document.getElementById('leadPanelTitle').textContent = value;
      }
    });
  });

  // Sequence active toggle
  document.getElementById('seqActiveToggle')?.addEventListener('change', async (e) => {
    await supabase.from('leads').update({ sequence_active: e.target.checked }).eq('id', id);
    showToast(e.target.checked ? 'Sequence activated' : 'Sequence paused');
  });

  // Sequence day toggles
  body.querySelectorAll('.seq-day').forEach(dayEl => {
    dayEl.addEventListener('click', async () => {
      const cb = dayEl.querySelector('.seq-day-cb');
      const day = dayEl.dataset.day;
      const nowChecked = !cb.checked;
      cb.checked = nowChecked;

      const update = {
        [`${day}_sent`]: nowChecked,
        [`${day}_sent_at`]: nowChecked ? new Date().toISOString() : null
      };
      await supabase.from('leads').update(update).eq('id', id);
      showToast(`Day ${day.replace('day','')} marked ${nowChecked ? 'sent' : 'unsent'}`);

      // Refresh UI
      dayEl.classList.toggle('sent', nowChecked);
      const ts = dayEl.querySelector('.seq-day-ts');
      if (ts) ts.textContent = nowChecked ? `Sent ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })}` : 'Not sent';

      const check = dayEl.querySelector('.seq-day-check');
      if (nowChecked && !check) {
        const span = document.createElement('span');
        span.className = 'seq-day-check';
        span.textContent = '✓';
        dayEl.appendChild(span);
      } else if (!nowChecked && check) {
        check.remove();
      }
    });
  });

  // Copy onboarding link from lead panel
  document.getElementById('panelCopyOnboarding')?.addEventListener('click', async () => {
    const link = `${window.location.origin}/onboarding.html?id=${id}`;
    copyText(link);
    showToast('Onboarding link copied!');
    if (!lead.onboarding_status || lead.onboarding_status === 'not sent') {
      await supabase.from('leads').update({ onboarding_status: 'sent' }).eq('id', id);
      lead.onboarding_status = 'sent';
      const badge = document.getElementById('panelOnboardingBadge');
      if (badge) badge.innerHTML = docStatusPill('sent');
    }
  });

  // Copy contract link from lead panel
  document.getElementById('panelCopyContract')?.addEventListener('click', async () => {
    const tierSelect = document.getElementById('panelContractTier');
    const [setup, hours] = (tierSelect?.value || '0|40').split('|');
    const link = `${window.location.origin}/contract.html?id=${id}&setup=${setup}&hours=${encodeURIComponent(hours)}`;
    copyText(link);
    showToast('Contract link copied!');
    if (!lead.contract_status || lead.contract_status === 'not sent') {
      await supabase.from('leads').update({ contract_status: 'sent' }).eq('id', id);
      lead.contract_status = 'sent';
      const badge = document.getElementById('panelContractBadge');
      if (badge) badge.innerHTML = docStatusPill('sent', true);
    }
  });

  // Send custom email from lead panel — scroll to compose area in thread
  document.getElementById('panelSendCustomEmail')?.addEventListener('click', () => {
    const compose = document.querySelector('.email-compose');
    if (compose) {
      compose.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('etBody')?.focus();
    }
  });

  // Send onboarding link from lead panel
  document.getElementById('panelSendOnboarding')?.addEventListener('click', () => {
    const firstName = (lead.contact_name || '').split(' ')[0] || 'there';
    const link = `${window.location.origin}/onboarding.html?id=${id}`;
    showEmailModal({
      to: lead.email || '',
      subject: 'Your onboarding form \u2014 NeverMiss Hawaii',
      body: `Hi ${firstName},\n\n${lead.business_name} is approved for NeverMiss Hawaii. Complete your onboarding form so we can get your AI receptionist set up:\n\n${link}\n\nJust a few minutes. Reply with any questions.\n\nOkeanu Kama\nNeverMiss Hawaii\nnevermisshawaii.com | (808) 724-3713`,
      leadId: id,
      statusField: 'onboarding_status',
      onSent: () => {
        lead.onboarding_status = 'sent';
        const badge = document.getElementById('panelOnboardingBadge');
        if (badge) badge.innerHTML = docStatusPill('sent');
      },
    });
  });

  // Send contract link from lead panel
  document.getElementById('panelSendContract')?.addEventListener('click', () => {
    const tierSelect = document.getElementById('panelContractTier');
    const tierLabel = tierSelect?.options[tierSelect.selectedIndex]?.text || 'Starter';
    const [setup, hours] = (tierSelect?.value || '0|40').split('|');
    const link = `${window.location.origin}/contract.html?id=${id}&setup=${setup}&hours=${encodeURIComponent(hours)}`;
    const firstName = (lead.contact_name || '').split(' ')[0] || 'there';
    showEmailModal({
      to: lead.email || '',
      subject: 'Your NeverMiss Hawaii service agreement',
      body: `Hi ${firstName},\n\nHere\u2019s your ${tierLabel} service agreement for NeverMiss Hawaii. Review and sign:\n\n${link}\n\nSetup begins immediately after. Reply with any questions.\n\nOkeanu Kama\nNeverMiss Hawaii\nnevermisshawaii.com | (808) 724-3713`,
      leadId: id,
      statusField: 'contract_status',
      onSent: () => {
        lead.contract_status = 'sent';
        const badge = document.getElementById('panelContractBadge');
        if (badge) badge.innerHTML = docStatusPill('sent', true);
      },
    });
  });

  // Load email thread (default)
  renderEmailThread(lead);

  // Email / SMS toggle in lead panel
  body.querySelectorAll('.panel-msg-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      body.querySelectorAll('.panel-msg-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      const emailEl = document.getElementById('emailThreadContainer');
      const smsEl   = document.getElementById('smsThreadContainer');
      if (emailEl) emailEl.style.display = type === 'email' ? '' : 'none';
      if (smsEl)   smsEl.style.display   = type === 'sms'   ? '' : 'none';
      if (type === 'sms') await loadLeadSmsThread(id, lead, smsEl);
    });
  });

  async function loadLeadSmsThread(leadId, leadData, container) {
    container.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div></div>';
    const { data: msgs, error } = await supabase
      .from('lead_sms').select('*').eq('lead_id', leadId).order('sent_at', { ascending: true });
    if (error) { container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px">Failed to load SMS</div>'; return; }

    const bubbles = (msgs || []).map(m => {
      const out = m.direction === 'outbound';
      const statusMap = { sent: ['#6b7280','Sent'], delivered: ['#3b82f6','Delivered'], failed: ['#ef4444','Failed'] };
      const [sc, sl] = statusMap[m.status] || statusMap.sent;
      const badge = out ? `<span class="sms-status-badge" style="background:${sc}">${sl}</span>` : '';
      const ts = m.sent_at ? new Date(m.sent_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}) : '';
      return `<div class="sms-bubble-row ${out?'sms-bubble-row--out':'sms-bubble-row--in'}">
        <div class="sms-bubble ${out?'sms-bubble--out':'sms-bubble--in'}">${esc(m.body)}${badge}</div>
        <div class="sms-bubble-time">${ts}</div></div>`;
    }).join('');

    container.innerHTML = `
      <div class="sms-bubble-list" style="max-height:280px" id="leadSmsBubbles">${
        bubbles || '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No SMS messages yet</div>'
      }</div>
      <div class="sms-compose" style="margin-top:0">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea class="sms-compose-input" id="leadSmsSendInput" rows="2" placeholder="Send a message via iMessage\u2026"></textarea>
          <button class="btn btn-primary btn-sm" id="leadSmsSendBtn">Send</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:5px">
          Delivered via iMessage sync within ~60 sec \u00b7
          <a href="#" id="leadSmsLogLink" style="color:var(--text-muted);text-decoration:underline">Log inbound manually</a>
        </div>
        <div id="leadSmsLogForm" style="display:none;margin-top:8px">
          <div style="display:flex;gap:8px;align-items:flex-end">
            <textarea class="sms-compose-input" id="leadSmsReplyInput" rows="2" placeholder="Their reply\u2026" style="border-color:#d1d5db"></textarea>
            <button class="btn btn-secondary btn-sm" id="leadSmsLogBtn">Log</button>
          </div>
        </div>
      </div>`;

    const bl = document.getElementById('leadSmsBubbles');
    if (bl) bl.scrollTop = bl.scrollHeight;

    // Send outbound
    document.getElementById('leadSmsSendBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('leadSmsSendInput');
      const body2 = input?.value.trim();
      if (!body2) return;
      const sendBtn = document.getElementById('leadSmsSendBtn');
      sendBtn.disabled = true; sendBtn.textContent = 'Queuing\u2026';
      const { error: ie } = await supabase.from('lead_sms').insert({ lead_id: leadId, direction: 'outbound', body: body2, status: 'pending' });
      if (ie) { showToast('Failed to queue message', true); }
      else { showToast('Queued — sends within 60 sec'); input.value = ''; await loadLeadSmsThread(leadId, leadData, container); }
      sendBtn.disabled = false; sendBtn.textContent = 'Send';
    });

    // Toggle manual log form
    document.getElementById('leadSmsLogLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      const form = document.getElementById('leadSmsLogForm');
      if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
    });

    // Log inbound manually
    document.getElementById('leadSmsLogBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('leadSmsReplyInput');
      const body2 = input?.value.trim();
      if (!body2) return;
      const logBtn = document.getElementById('leadSmsLogBtn');
      logBtn.disabled = true; logBtn.textContent = 'Saving\u2026';
      const { error: ie } = await supabase.from('lead_sms').insert({ lead_id: leadId, direction: 'inbound', body: body2, status: 'received' });
      if (ie) { showToast('Failed to log reply', true); }
      else {
        showToast('Reply logged');
        input.value = '';
        await supabase.from('leads').update({ pipeline_stage: 'Contacted' }).eq('id', leadId).eq('pipeline_stage', 'New Leads');
        await loadLeadSmsThread(leadId, leadData, container);
      }
      logBtn.disabled = false; logBtn.textContent = 'Log';
    });
  }

  // Add note
  document.getElementById('addNoteBtn')?.addEventListener('click', addNote);
  document.getElementById('newNoteInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNote();
  });

  async function addNote() {
    const input = document.getElementById('newNoteInput');
    const content = input?.value.trim();
    if (!content) return;

    const { error } = await supabase.from('lead_notes').insert({ lead_id: id, content });
    if (error) { showToast('Failed to add note', true); return; }

    input.value = '';
    showToast('Note added');

    // Refresh notes section (just reload the lead)
    await openLead(id);
  }
}

export function closeLead() {
  document.getElementById('leadPanel').classList.remove('open');
  document.getElementById('leadOverlay').classList.remove('visible');
  currentLeadId = null;
}

// ── Add Lead Modal ───────────────────────────────────────────
function setupAddLeadModal() {
  const modal = document.getElementById('addLeadModal');
  const form = document.getElementById('addLeadForm');

  document.getElementById('addLeadClose').onclick = () => modal.classList.remove('visible');
  document.getElementById('cancelAddLead').onclick = () => modal.classList.remove('visible');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitAddLead');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    const data = Object.fromEntries(new FormData(form).entries());
    // Remove empty strings
    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

    const { error } = await supabase.from('leads').insert(data);

    if (error) {
      showToast('Failed to add lead: ' + error.message, true);
    } else {
      showToast('Lead added!');
      form.reset();
      modal.classList.remove('visible');
      // Refresh current pane
      if (PANES[currentPane]) await PANES[currentPane].render();
    }

    btn.disabled = false;
    btn.textContent = 'Add Lead';
  });
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const session = await requireAuth();
  if (!session) return;

  // Display user info
  const email = session.user?.email || '';
  const initials = email.slice(0, 2).toUpperCase();
  document.getElementById('userInitials').textContent = initials;
  document.getElementById('userName').textContent = email.split('@')[0];
  document.getElementById('userEmail').textContent = email;

  // Nav clicks
  document.querySelectorAll('.nav-item[data-pane]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.pane));
  });

  // Sign out
  document.getElementById('btnSignOut')?.addEventListener('click', signOut);

  // Panel close
  document.getElementById('leadPanelClose').addEventListener('click', closeLead);
  document.getElementById('leadOverlay').addEventListener('click', closeLead);

  // Delete lead from panel
  document.getElementById('btnDeleteLead').addEventListener('click', async () => {
    if (!currentLeadId) return;
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    const { error } = await supabase.from('leads').delete().eq('id', currentLeadId);
    if (!error) {
      closeLead();
      showToast('Lead deleted');
      if (PANES[currentPane]) await PANES[currentPane].render();
    }
  });

  // Add Lead topbar button
  document.getElementById('btnAddLeadTop').addEventListener('click', () =>
    document.getElementById('addLeadModal').classList.add('visible')
  );

  setupAddLeadModal();

  // Load notification badge
  loadNotifBadge();

  // Navigate to default
  await navigate('dashboard');
}

async function loadNotifBadge() {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false);

  const badge = document.querySelector('[data-pane="notifications"] .nav-badge');
  if (badge) { badge.textContent = count || ''; badge.style.display = count ? 'inline' : 'none'; }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function docStatusPill(status, isContract = false) {
  const map = {
    'not sent':  { bg: '#f3f4f6', color: '#6b7280', text: 'Not Sent' },
    'sent':      { bg: '#eff6ff', color: '#1d4ed8', text: 'Sent' },
    'submitted': { bg: '#f0fdf4', color: '#15803d', text: 'Submitted' },
    'signed':    { bg: '#f0fdf4', color: '#15803d', text: 'Signed' },
  };
  const s = map[status] || map['not sent'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.text}</span>`;
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

init();
