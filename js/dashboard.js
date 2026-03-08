// ============================================================
// NeverMiss CRM — Dashboard
// ============================================================
import { supabase } from './client.js';
import { openLead } from './app.js';

export async function renderDashboard() {
  const pane = document.getElementById('pane-dashboard');
  pane.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';

  const today = new Date().toISOString().split('T')[0];

  const [
    { data: allLeads },
    { data: todayLeads },
    { data: closedLeads }
  ] = await Promise.all([
    supabase.from('leads').select('id, pipeline_stage, priority, mrr_value, next_action_date'),
    supabase.from('leads').select('id, business_name, contact_name, phone, next_action_type, next_action_date, pipeline_stage, priority').eq('next_action_date', today),
    supabase.from('leads').select('id, mrr_value').eq('pipeline_stage', 'Closed Won')
  ]);

  const leads = allLeads || [];
  const total   = leads.length;
  const hotLeads = leads.filter(l => l.priority === 'A').length;
  const demosSent = leads.filter(l => l.pipeline_stage === 'Demo Scheduled').length;
  const apptSet = leads.filter(l => l.pipeline_stage === 'Demo Done').length;
  const closed  = closedLeads ? closedLeads.length : 0;
  const mrr     = closedLeads ? closedLeads.reduce((s, l) => s + (l.mrr_value || 300), 0) : 0;
  const actions = todayLeads || [];

  const stageCounts = { 'New Leads': 0, Contacted: 0, Called: 0, 'Call Only': 0, 'Demo Scheduled': 0, 'Demo Done': 0, 'Closed Won': 0, 'Closed Lost': 0, DQ: 0 };
  leads.forEach(l => { if (stageCounts[l.pipeline_stage] !== undefined) stageCounts[l.pipeline_stage]++; });

  const goalCustomers = 17;
  const pct = Math.min(100, Math.round((closed / goalCustomers) * 100));

  pane.innerHTML = `
    <div class="phase-card">
      <div class="phase-label">Phase 1 Goal</div>
      <div class="phase-title">${closed} / ${goalCustomers} customers — $${mrr.toLocaleString()} MRR</div>
      <div class="phase-bar-bg">
        <div class="phase-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="phase-detail">${pct}% to $5k MRR target · Need ${Math.max(0, goalCustomers - closed)} more customers</div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Leads</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">In pipeline</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Hot Leads (A)</div>
        <div class="stat-value" style="color:#dc2626">${hotLeads}</div>
        <div class="stat-sub">Priority A</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Actions</div>
        <div class="stat-value" style="color:#f59e0b">${actions.length}</div>
        <div class="stat-sub">Follow-ups due</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Demos Sent</div>
        <div class="stat-value" style="color:#3b82f6">${demosSent}</div>
        <div class="stat-sub">Waiting on response</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Appts Set</div>
        <div class="stat-value" style="color:#8b5cf6">${apptSet}</div>
        <div class="stat-sub">Calls scheduled</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Closed / MRR</div>
        <div class="stat-value" style="color:#10b981">${closed}</div>
        <div class="stat-sub">$${mrr.toLocaleString()}/mo</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- Pipeline overview -->
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text-secondary)">PIPELINE OVERVIEW</div>
        ${Object.entries(stageCounts).map(([stage, count]) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span class="badge badge-${stage.replace(/ /g,'').replace('AppointmentSet','Appointment')}">${stage}</span>
            <div style="flex:1;background:var(--bg-tertiary);border-radius:99px;height:6px;overflow:hidden">
              <div style="height:100%;background:var(--accent);border-radius:99px;width:${total ? Math.round(count/total*100) : 0}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:var(--text-muted);width:20px;text-align:right">${count}</span>
          </div>
        `).join('')}
      </div>

      <!-- Today's actions -->
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text-secondary)">TODAY'S FOLLOW-UPS</div>
        ${actions.length === 0
          ? '<div class="empty-state"><div class="empty-state-title">All clear for today 🎉</div><div class="empty-state-sub">No follow-ups scheduled</div></div>'
          : actions.slice(0, 8).map(l => `
            <div class="action-item" style="cursor:pointer" data-id="${l.id}">
              <div style="flex:1;min-width:0">
                <div class="action-biz">${esc(l.business_name)}</div>
                <div class="action-meta">${esc(l.contact_name || '')}${l.phone ? ` · <a href="tel:${l.phone}">${esc(l.phone)}</a>` : ''}</div>
              </div>
              <div class="action-type">${esc(l.next_action_type || 'Follow up')}</div>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  pane.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => openLead(el.dataset.id));
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
