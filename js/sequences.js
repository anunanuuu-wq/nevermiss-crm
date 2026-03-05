// ============================================================
// NeverMiss CRM — Sequences
// ============================================================
import { supabase } from './client.js';
import { openLead, showToast } from './app.js';

let seqFilter = 'all';

export async function renderSequences() {
  const pane = document.getElementById('pane-sequences');
  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Sequences</div>
        <div class="section-sub">Track email sequence progress per lead</div>
      </div>
    </div>

    <div class="filter-tabs mb-16">
      <button class="filter-tab active" data-filter="all">All</button>
      <button class="filter-tab" data-filter="active">Active</button>
      <button class="filter-tab" data-filter="due">Due Today</button>
      <button class="filter-tab" data-filter="complete">Completed</button>
      <button class="filter-tab" data-filter="none">Not Started</button>
      <button class="filter-tab" data-filter="ready">Ready to Send</button>
    </div>

    <div class="table-wrap">
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Readiness</th>
              <th>Contact</th>
              <th>Stage</th>
              <th>Active</th>
              <th style="text-align:center">Day 1</th>
              <th style="text-align:center">Day 3</th>
              <th style="text-align:center">Day 7</th>
              <th style="text-align:center">Day 10</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="seqBody">
            <tr class="loading-row"><td colspan="10"><div class="spinner"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      seqFilter = tab.dataset.filter;
      loadSeqData();
    });
  });

  await loadSeqData();
}

async function loadSeqData() {
  const { data, error } = await supabase
    .from('leads')
    .select('id, business_name, contact_name, pipeline_stage, sequence_active, day1_sent, day1_sent_at, day3_sent, day3_sent_at, day7_sent, day7_sent_at, day10_sent, day10_sent_at, personalization_notes, emails_drafted')
    .order('created_at', { ascending: false });

  if (error) { showToast('Failed to load sequences', true); return; }

  const today = new Date();
  let leads = data || [];

  // Filter
  if (seqFilter === 'active') {
    leads = leads.filter(l => l.sequence_active);
  } else if (seqFilter === 'complete') {
    leads = leads.filter(l => l.day1_sent && l.day3_sent && l.day7_sent && l.day10_sent);
  } else if (seqFilter === 'none') {
    leads = leads.filter(l => !l.day1_sent && !l.day3_sent && !l.day7_sent && !l.day10_sent);
  } else if (seqFilter === 'ready') {
    // Has drafts + hasn't started sequence yet
    leads = leads.filter(l => l.emails_drafted && !l.day1_sent);
  } else if (seqFilter === 'due') {
    // Day 3 due = day1_sent_at was 2-3 days ago and day3 not sent
    leads = leads.filter(l => {
      if (!l.day1_sent_at) return false;
      const d1 = new Date(l.day1_sent_at);
      const diff = Math.floor((today - d1) / (1000 * 60 * 60 * 24));
      return (diff >= 2 && !l.day3_sent) ||
             (diff >= 6 && l.day3_sent && !l.day7_sent) ||
             (diff >= 9 && l.day7_sent && !l.day10_sent);
    });
  }

  const tbody = document.getElementById('seqBody');
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-title">No leads in this view</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => {
    const stageClass = l.pipeline_stage.replace(/ /g,'');
    return `
      <tr>
        <td class="td-name"><a href="#" class="open-lead" data-id="${l.id}">${esc(l.business_name)}</a></td>
        <td>${readinessBadge(l)}</td>
        <td class="td-muted">${esc(l.contact_name || '—')}</td>
        <td><span class="badge badge-${stageClass}">${l.pipeline_stage}</span></td>
        <td>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" class="toggle-active" data-id="${l.id}" ${l.sequence_active ? 'checked' : ''}>
            <span style="font-size:12px;color:var(--text-muted)">${l.sequence_active ? 'Yes' : 'No'}</span>
          </label>
        </td>
        ${['day1','day3','day7','day10'].map(day => {
          const sent = l[`${day}_sent`];
          const ts = l[`${day}_sent_at`];
          return `
            <td style="text-align:center">
              <div title="${ts ? new Date(ts).toLocaleDateString() : ''}">
                <input type="checkbox" class="toggle-day" data-id="${l.id}" data-day="${day}" ${sent ? 'checked' : ''}
                  style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer">
              </div>
            </td>
          `;
        }).join('')}
        <td>
          <button class="btn btn-ghost btn-sm open-lead" data-id="${l.id}">View</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.open-lead').forEach(el =>
    el.addEventListener('click', (e) => { e.preventDefault(); openLead(el.dataset.id); })
  );

  tbody.querySelectorAll('.toggle-active').forEach(cb => {
    cb.addEventListener('change', async () => {
      await supabase.from('leads').update({ sequence_active: cb.checked }).eq('id', cb.dataset.id);
      cb.nextElementSibling.textContent = cb.checked ? 'Yes' : 'No';
      showToast(cb.checked ? 'Sequence activated' : 'Sequence paused');
    });
  });

  tbody.querySelectorAll('.toggle-day').forEach(cb => {
    cb.addEventListener('change', async () => {
      const { day, id } = cb.dataset;
      const update = {
        [`${day}_sent`]: cb.checked,
        [`${day}_sent_at`]: cb.checked ? new Date().toISOString() : null
      };
      const { error } = await supabase.from('leads').update(update).eq('id', id);
      if (error) { showToast('Update failed', true); cb.checked = !cb.checked; return; }
      showToast(`Day ${day.replace('day','')} marked ${cb.checked ? 'sent' : 'unsent'}`);
    });
  });
}

function readinessBadge(lead) {
  const hasResearch = !!lead.personalization_notes;
  const hasDraft    = !!lead.emails_drafted;
  const inSequence  = lead.day1_sent || lead.day3_sent || lead.day7_sent || lead.day10_sent;
  const complete    = lead.day1_sent && lead.day3_sent && lead.day7_sent && lead.day10_sent;

  if (complete) return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#f0fdf4;color:#15803d">Complete</span>`;
  if (inSequence) return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#eff6ff;color:#1d4ed8">In Sequence</span>`;
  if (hasResearch && hasDraft) return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#f0fdf4;color:#15803d" title="Research + Draft ready — good to send">Ready</span>`;
  if (hasResearch && !hasDraft) return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#fffbeb;color:#b45309" title="SMYKM research done — run /draft-emails">Draft Needed</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#fef2f2;color:#dc2626" title="No SMYKM research — run /get-leads first">Research Needed</span>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
