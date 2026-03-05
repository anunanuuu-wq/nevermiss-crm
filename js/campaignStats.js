// ============================================================
// NeverMiss CRM — Campaign Analytics Pane
// ============================================================
import { supabase } from './client.js';

export async function renderCampaignStats() {
  const container = document.getElementById('pane-analytics');
  if (!container) return;

  container.innerHTML = `
    <div class="stats-wrap">
      <div class="stats-header">
        <h2 class="stats-title">Email Analytics</h2>
        <div class="stats-controls">
          <select id="statsGroupBy" class="form-input" style="width:auto;font-size:13px">
            <option value="sequence_day">By Sequence Day</option>
            <option value="date">By Date (last 30 days)</option>
            <option value="all">All Time</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="statsRefresh">Refresh</button>
        </div>
      </div>
      <div id="statsSummary" class="stats-summary-row"></div>
      <div id="statsTable" class="stats-table-wrap"><div class="stats-loading">Loading&hellip;</div></div>
    </div>
  `;

  const groupByEl = container.querySelector('#statsGroupBy');
  container.querySelector('#statsRefresh').addEventListener('click', () => loadStats(groupByEl.value));
  groupByEl.addEventListener('change', () => loadStats(groupByEl.value));

  await loadStats('sequence_day');
}

async function loadStats(groupBy) {
  const tableEl   = document.getElementById('statsTable');
  const summaryEl = document.getElementById('statsSummary');
  if (!tableEl || !summaryEl) return;

  tableEl.innerHTML   = '<div class="stats-loading">Loading&hellip;</div>';
  summaryEl.innerHTML = '';

  try {
    // Fetch all events (with join to lead_emails for sequence_day / source)
    const { data: events, error: evErr } = await supabase
      .from('email_events')
      .select('event_type, occurred_at, lead_email_id, lead_emails(sequence_day, source, sent_at)')
      .order('occurred_at', { ascending: false });

    if (evErr) throw evErr;

    // Fetch outbound sent emails for denominator (total sends)
    const { data: sentEmails, error: sentErr } = await supabase
      .from('lead_emails')
      .select('id, resend_email_id, sequence_day, source, sent_at')
      .eq('direction', 'outbound')
      .eq('sent', true);

    if (sentErr) throw sentErr;

    const allEvents   = events   || [];
    const allSent     = sentEmails || [];
    const totalSent   = allSent.length;

    // All-time summary counts
    const countOf = (type) => allEvents.filter(e => e.event_type === type).length;
    const allDelivered = countOf('email.delivered');
    const allOpens     = countOf('email.opened');
    const allClicks    = countOf('email.clicked');
    const allBounces   = countOf('email.bounced');

    const pct = (n) => totalSent ? Math.round((n / totalSent) * 100) + '%' : '—';

    summaryEl.innerHTML = `
      <div class="stat-card"><div class="stat-val">${totalSent}</div><div class="stat-lbl">Total Sent</div></div>
      <div class="stat-card delivered"><div class="stat-val">${allDelivered} <span class="stat-pct">${pct(allDelivered)}</span></div><div class="stat-lbl">Delivered</div></div>
      <div class="stat-card opened"><div class="stat-val">${allOpens} <span class="stat-pct">${pct(allOpens)}</span></div><div class="stat-lbl">Opened</div></div>
      <div class="stat-card clicked"><div class="stat-val">${allClicks} <span class="stat-pct">${pct(allClicks)}</span></div><div class="stat-lbl">Clicked</div></div>
      <div class="stat-card bounced"><div class="stat-val">${allBounces} <span class="stat-pct">${pct(allBounces)}</span></div><div class="stat-lbl">Bounced</div></div>
    `;

    // Build breakdown table
    const groups = buildGroups(allEvents, allSent, groupBy);

    if (!groups.length) {
      tableEl.innerHTML = '<div class="stats-empty">No email data yet. Send some emails and set up the Resend webhook first.</div>';
      return;
    }

    const groupLabel = groupBy === 'sequence_day' ? 'Sequence Day'
                     : groupBy === 'date'         ? 'Date'
                     : 'Period';

    const rows = groups.map(g => {
      const r = (n) => g.sent ? Math.round(n / g.sent * 100) + '%' : '—';
      return `
        <tr>
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
        <thead>
          <tr>
            <th>${groupLabel}</th>
            <th>Sent</th>
            <th>Delivered</th>
            <th>Opened</th>
            <th>Clicked</th>
            <th>Bounced</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

  } catch (e) {
    tableEl.innerHTML = `<div class="stats-empty" style="color:var(--dq)">Error loading analytics: ${esc(e.message)}</div>`;
  }
}

function buildGroups(events, sentEmails, groupBy) {
  const groups = {};

  // Seed groups from sent emails (these are the denominators)
  for (const email of sentEmails) {
    const key = getKey(email, groupBy);
    if (!groups[key]) {
      groups[key] = { label: key, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    }
    groups[key].sent++;
  }

  // Tally events into groups
  for (const ev of events) {
    const le = ev.lead_emails;
    if (!le) continue;
    const key = getKey({ sequence_day: le.sequence_day, source: le.source, sent_at: le.sent_at }, groupBy);
    if (!groups[key]) continue;
    if (ev.event_type === 'email.delivered') groups[key].delivered++;
    if (ev.event_type === 'email.opened')    groups[key].opened++;
    if (ev.event_type === 'email.clicked')   groups[key].clicked++;
    if (ev.event_type === 'email.bounced')   groups[key].bounced++;
  }

  const values = Object.values(groups);

  if (groupBy === 'sequence_day') {
    // Sort: Day 1, Day 3, Day 7, Day 10, Manual, Other
    const order = { 'Day 1': 0, 'Day 3': 1, 'Day 7': 2, 'Day 10': 3, 'Manual': 4 };
    return values.sort((a, b) => (order[a.label] ?? 99) - (order[b.label] ?? 99));
  }

  // For date groupBy: most recent first
  return values.sort((a, b) => (a.label < b.label ? 1 : -1));
}

function getKey(email, groupBy) {
  if (groupBy === 'sequence_day') {
    if (email.sequence_day) return `Day ${email.sequence_day}`;
    if (email.source === 'manual') return 'Manual';
    return 'Other';
  }
  if (groupBy === 'date') {
    return (email.sent_at || '').slice(0, 10) || 'Unknown';
  }
  return 'All Time';
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
