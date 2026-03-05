// ============================================================
// NeverMiss CRM — Campaign Analytics Pane (Email + SMS)
// ============================================================
import { supabase } from './client.js';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let _activeTab = 'email';

export async function renderCampaignStats() {
  const container = document.getElementById('pane-analytics');
  if (!container) return;

  container.innerHTML = `
    <div class="stats-wrap">
      <div class="stats-header">
        <h2 class="stats-title">Analytics</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="analytics-tabs">
            <button class="analytics-tab ${_activeTab === 'email' ? 'active' : ''}" data-tab="email">Email</button>
            <button class="analytics-tab ${_activeTab === 'sms' ? 'active' : ''}" data-tab="sms">SMS</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="statsRefresh">Refresh</button>
        </div>
      </div>
      <div id="statsSummary" class="stats-summary-row"></div>
      <div id="statsControls" style="margin-bottom:12px"></div>
      <div id="statsTable" class="stats-table-wrap"><div class="stats-loading">Loading&hellip;</div></div>
    </div>
  `;

  container.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      container.querySelectorAll('.analytics-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
      renderActiveTab();
    });
  });

  container.querySelector('#statsRefresh').addEventListener('click', renderActiveTab);

  await renderActiveTab();
}

async function renderActiveTab() {
  if (_activeTab === 'email') await loadEmailStats();
  else await loadSmsStats();
}


// ── EMAIL ANALYTICS ───────────────────────────────────────────

async function loadEmailStats() {
  const tableEl   = document.getElementById('statsTable');
  const summaryEl = document.getElementById('statsSummary');
  const controlsEl = document.getElementById('statsControls');
  if (!tableEl || !summaryEl) return;

  // Render group-by control for email
  controlsEl.innerHTML = `
    <select id="statsGroupBy" class="form-input" style="width:auto;font-size:13px">
      <option value="sequence_day">By Sequence Day</option>
      <option value="date">By Date (last 30 days)</option>
      <option value="all">All Time</option>
    </select>
  `;
  const groupByEl = document.getElementById('statsGroupBy');
  groupByEl.addEventListener('change', () => _loadEmailBreakdown(groupByEl.value));

  tableEl.innerHTML   = '<div class="stats-loading">Loading&hellip;</div>';
  summaryEl.innerHTML = '';

  try {
    const { data: events, error: evErr } = await supabase
      .from('email_events')
      .select('event_type, occurred_at, lead_email_id, lead_emails(sequence_day, source, sent_at)')
      .order('occurred_at', { ascending: false });
    if (evErr) throw evErr;

    const { data: sentEmails, error: sentErr } = await supabase
      .from('lead_emails')
      .select('id, resend_email_id, sequence_day, source, sent_at')
      .eq('direction', 'outbound')
      .eq('sent', true);
    if (sentErr) throw sentErr;

    const allEvents   = events      || [];
    const allSent     = sentEmails  || [];
    const totalSent   = allSent.length;

    const countOf = (type) => allEvents.filter(e => e.event_type === type).length;
    const delivered = countOf('email.delivered');
    const opens     = countOf('email.opened');
    const clicks    = countOf('email.clicked');
    const bounces   = countOf('email.bounced');
    const pct = (n) => totalSent ? Math.round((n / totalSent) * 100) + '%' : '—';

    summaryEl.innerHTML = `
      <div class="stat-card"><div class="stat-val">${totalSent}</div><div class="stat-lbl">Total Sent</div></div>
      <div class="stat-card delivered"><div class="stat-val">${delivered} <span class="stat-pct">${pct(delivered)}</span></div><div class="stat-lbl">Delivered</div></div>
      <div class="stat-card opened"><div class="stat-val">${opens} <span class="stat-pct">${pct(opens)}</span></div><div class="stat-lbl">Opened</div></div>
      <div class="stat-card clicked"><div class="stat-val">${clicks} <span class="stat-pct">${pct(clicks)}</span></div><div class="stat-lbl">Clicked</div></div>
      <div class="stat-card bounced"><div class="stat-val">${bounces} <span class="stat-pct">${pct(bounces)}</span></div><div class="stat-lbl">Bounced</div></div>
    `;

    _emailState = { allEvents, allSent };
    await _loadEmailBreakdown('sequence_day');

  } catch (e) {
    tableEl.innerHTML = `<div class="stats-empty" style="color:var(--dq)">Error: ${esc(e.message)}</div>`;
  }
}

let _emailState = { allEvents: [], allSent: [] };

async function _loadEmailBreakdown(groupBy) {
  const tableEl = document.getElementById('statsTable');
  if (!tableEl) return;
  const { allEvents, allSent } = _emailState;
  const groups = buildEmailGroups(allEvents, allSent, groupBy);

  if (!groups.length) {
    tableEl.innerHTML = '<div class="stats-empty">No email data yet. Send some emails and set up the Resend webhook first.</div>';
    return;
  }

  const groupLabel = groupBy === 'sequence_day' ? 'Sequence Day' : groupBy === 'date' ? 'Date' : 'Period';
  const rows = groups.map(g => {
    const r = (n) => g.sent ? Math.round(n / g.sent * 100) + '%' : '—';
    return `<tr>
      <td>${esc(g.label)}</td>
      <td>${g.sent}</td>
      <td>${g.delivered} <span class="tbl-pct">${r(g.delivered)}</span></td>
      <td>${g.opened} <span class="tbl-pct">${r(g.opened)}</span></td>
      <td>${g.clicked} <span class="tbl-pct">${r(g.clicked)}</span></td>
      <td>${g.bounced} <span class="tbl-pct">${r(g.bounced)}</span></td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <table class="stats-table">
      <thead><tr>
        <th>${groupLabel}</th><th>Sent</th><th>Delivered</th>
        <th>Opened</th><th>Clicked</th><th>Bounced</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildEmailGroups(events, sentEmails, groupBy) {
  const groups = {};
  for (const email of sentEmails) {
    const key = getEmailKey(email, groupBy);
    if (!groups[key]) groups[key] = { label: key, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    groups[key].sent++;
  }
  for (const ev of events) {
    const le = ev.lead_emails;
    if (!le) continue;
    const key = getEmailKey({ sequence_day: le.sequence_day, source: le.source, sent_at: le.sent_at }, groupBy);
    if (!groups[key]) continue;
    if (ev.event_type === 'email.delivered') groups[key].delivered++;
    if (ev.event_type === 'email.opened')    groups[key].opened++;
    if (ev.event_type === 'email.clicked')   groups[key].clicked++;
    if (ev.event_type === 'email.bounced')   groups[key].bounced++;
  }
  const values = Object.values(groups);
  if (groupBy === 'sequence_day') {
    const order = { 'Day 1': 0, 'Day 3': 1, 'Day 7': 2, 'Day 10': 3, 'Manual': 4 };
    return values.sort((a, b) => (order[a.label] ?? 99) - (order[b.label] ?? 99));
  }
  return values.sort((a, b) => (a.label < b.label ? 1 : -1));
}

function getEmailKey(email, groupBy) {
  if (groupBy === 'sequence_day') {
    if (email.sequence_day) return `Day ${email.sequence_day}`;
    if (email.source === 'manual') return 'Manual';
    return 'Other';
  }
  if (groupBy === 'date') return (email.sent_at || '').slice(0, 10) || 'Unknown';
  return 'All Time';
}


// ── SMS ANALYTICS ─────────────────────────────────────────────

const SMS_TEMPLATE_LABELS = {
  sms_day2:  'SMS Day 2',
  sms_day4:  'SMS Day 4',
  sms_day8:  'SMS Day 8',
  sms_day11: 'SMS Day 11',
  reply:     'Replies Sent',
  twilio_inbound: 'Inbound (Twilio)',
};

const SMS_TEMPLATE_ORDER = ['sms_day2', 'sms_day4', 'sms_day8', 'sms_day11', 'reply'];

async function loadSmsStats() {
  const tableEl    = document.getElementById('statsTable');
  const summaryEl  = document.getElementById('statsSummary');
  const controlsEl = document.getElementById('statsControls');
  if (!tableEl || !summaryEl) return;

  // Group-by control for SMS
  controlsEl.innerHTML = `
    <select id="smsGroupBy" class="form-input" style="width:auto;font-size:13px">
      <option value="template">By SMS Day</option>
      <option value="date">By Date (last 30 days)</option>
      <option value="all">All Time</option>
    </select>
  `;
  const groupByEl = document.getElementById('smsGroupBy');
  groupByEl.addEventListener('change', () => _loadSmsBreakdown(groupByEl.value));

  tableEl.innerHTML   = '<div class="stats-loading">Loading&hellip;</div>';
  summaryEl.innerHTML = '';

  try {
    // All outbound messages
    const { data: outbound, error: outErr } = await supabase
      .from('lead_sms')
      .select('id, lead_id, status, template, sent_at, direction')
      .eq('direction', 'outbound')
      .order('sent_at', { ascending: false });
    if (outErr) throw outErr;

    // All inbound messages
    const { data: inbound, error: inErr } = await supabase
      .from('lead_sms')
      .select('id, lead_id, sent_at')
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false });
    if (inErr) throw inErr;

    const allOut   = outbound || [];
    const allIn    = inbound  || [];
    const totalSent = allOut.length;

    const countStatus = (status) => allOut.filter(m => m.status === status).length;
    const delivered = countStatus('delivered');
    const failed    = countStatus('failed');
    const sent      = countStatus('sent'); // sent but delivery not yet confirmed
    // Unique leads who replied
    const repliedLeads = new Set(allIn.map(m => m.lead_id)).size;
    const replyRate = totalSent ? Math.round((repliedLeads / totalSent) * 100) + '%' : '—';
    const deliveryRate = totalSent ? Math.round((delivered / totalSent) * 100) + '%' : '—';
    const failRate = totalSent ? Math.round((failed / totalSent) * 100) + '%' : '—';

    summaryEl.innerHTML = `
      <div class="stat-card"><div class="stat-val">${totalSent}</div><div class="stat-lbl">Total Sent</div></div>
      <div class="stat-card delivered"><div class="stat-val">${delivered} <span class="stat-pct">${deliveryRate}</span></div><div class="stat-lbl">Delivered</div></div>
      <div class="stat-card opened"><div class="stat-val">${sent}</div><div class="stat-lbl">Sent (Pending Confirm)</div></div>
      <div class="stat-card clicked"><div class="stat-val">${repliedLeads} <span class="stat-pct">${replyRate}</span></div><div class="stat-lbl">Replied</div></div>
      <div class="stat-card bounced"><div class="stat-val">${failed} <span class="stat-pct">${failRate}</span></div><div class="stat-lbl">Failed</div></div>
    `;

    _smsState = { allOut, allIn };
    await _loadSmsBreakdown('template');

  } catch (e) {
    tableEl.innerHTML = `<div class="stats-empty" style="color:var(--dq)">Error: ${esc(e.message)}</div>`;
  }
}

let _smsState = { allOut: [], allIn: [] };

async function _loadSmsBreakdown(groupBy) {
  const tableEl = document.getElementById('statsTable');
  if (!tableEl) return;
  const { allOut, allIn } = _smsState;

  const groups = {};

  for (const msg of allOut) {
    const key = getSmsKey(msg, groupBy);
    if (!groups[key]) groups[key] = { label: getSmsLabel(msg, groupBy), sent: 0, delivered: 0, failed: 0, pending: 0, _order: getSmsOrder(msg, groupBy) };
    groups[key].sent++;
    if (msg.status === 'delivered') groups[key].delivered++;
    else if (msg.status === 'failed') groups[key].failed++;
    else groups[key].pending++;
  }

  // Count replies per group (by date if date groupBy, otherwise just total)
  const repliedByDate = {};
  const repliedLeads  = new Set();
  for (const msg of allIn) {
    const dateKey = (msg.sent_at || '').slice(0, 10);
    repliedByDate[dateKey] = (repliedByDate[dateKey] || new Set());
    repliedByDate[dateKey].add(msg.lead_id);
    repliedLeads.add(msg.lead_id);
  }

  const values = Object.values(groups);
  if (!values.length) {
    tableEl.innerHTML = '<div class="stats-empty">No SMS data yet. Run the SMS workflow to start sending texts.</div>';
    return;
  }

  values.sort((a, b) => a._order - b._order);

  const groupLabel = groupBy === 'template' ? 'SMS Day' : groupBy === 'date' ? 'Date' : 'Period';

  const rows = values.map(g => {
    const r = (n) => g.sent ? Math.round(n / g.sent * 100) + '%' : '—';
    // For date groupBy, show per-day replies; for template, show total
    const replied = groupBy === 'date'
      ? (repliedByDate[g.label] ? repliedByDate[g.label].size : 0)
      : (groupBy === 'all' ? repliedLeads.size : '—');
    return `<tr>
      <td>${esc(g.label)}</td>
      <td>${g.sent}</td>
      <td>${g.delivered} <span class="tbl-pct">${r(g.delivered)}</span></td>
      <td>${g.pending}</td>
      <td>${g.failed} <span class="tbl-pct">${r(g.failed)}</span></td>
      <td>${replied}</td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <table class="stats-table">
      <thead><tr>
        <th>${groupLabel}</th><th>Sent</th><th>Delivered</th>
        <th>Pending</th><th>Failed</th><th>Replied</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function getSmsKey(msg, groupBy) {
  if (groupBy === 'template') return msg.template || 'other';
  if (groupBy === 'date')     return (msg.sent_at || '').slice(0, 10) || 'Unknown';
  return 'All Time';
}

function getSmsLabel(msg, groupBy) {
  if (groupBy === 'template') return SMS_TEMPLATE_LABELS[msg.template] || msg.template || 'Other';
  if (groupBy === 'date')     return (msg.sent_at || '').slice(0, 10) || 'Unknown';
  return 'All Time';
}

function getSmsOrder(msg, groupBy) {
  if (groupBy === 'template') return SMS_TEMPLATE_ORDER.indexOf(msg.template ?? '') ?? 99;
  if (groupBy === 'date')     return -(new Date(msg.sent_at || 0).getTime());
  return 0;
}
