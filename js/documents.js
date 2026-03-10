// ============================================================
// NeverMiss CRM — Documents Pane
// Send onboarding forms + service contracts to leads
// ============================================================
import { supabase } from './client.js';
import { showEmailModal } from './email.js';

const SETUP_TIERS = [
  { label: 'Beta — $0 setup (waived)', value: '0|unlimited',    setup: '0',    hours: 'unlimited' },
  { label: 'Standard — $500 setup',    value: '500|unlimited',  setup: '500',  hours: 'unlimited' },
  { label: 'Premium — $1,500 setup',   value: '1500|unlimited', setup: '1500', hours: 'unlimited' },
];

function buildOnboardingLink(id) {
  return `${window.location.origin}/onboarding.html?id=${id}`;
}

function buildTrialAgreementLink(id) {
  return `${window.location.origin}/trial-agreement.html?id=${id}`;
}

function buildContractLink(id, setup, hours) {
  return `${window.location.origin}/contract.html?id=${id}&setup=${setup}&hours=${encodeURIComponent(hours)}`;
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
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._dt);
  t._dt = setTimeout(() => t.classList.remove('show'), 2800);
}

function statusPill(status, type) {
  const map = {
    'not sent':  { bg: '#f3f4f6', color: '#6b7280', text: 'Not Sent' },
    'sent':      { bg: '#eff6ff', color: '#1d4ed8', text: 'Sent' },
    'submitted': { bg: '#f0fdf4', color: '#15803d', text: 'Submitted' },
    'signed':    { bg: '#f0fdf4', color: '#15803d', text: 'Signed' },
  };
  const s = map[status] || map['not sent'];
  return `<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:600;background:${s.bg};color:${s.color}">${s.text}</span>`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function renderDocuments() {
  const pane = document.getElementById('pane-documents');
  pane.innerHTML = `
    <div class="section-header" style="flex-direction:column;align-items:flex-start">
      <div class="section-title">Documents</div>
      <div class="section-sub">Copy a link and send it to the client — their response saves directly to their CRM profile.</div>
    </div>
    <div id="docsContent" style="text-align:center;padding:40px">
      <div class="spinner"></div>
    </div>
  `;

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, business_name, contact_name, email, onboarding_status, contract_status, pipeline_stage, trial_setup_sent')
    .neq('pipeline_stage', 'DQ')
    .order('business_name');

  if (error) {
    document.getElementById('docsContent').innerHTML =
      `<div style="color:#dc2626;font-size:13px">Failed to load leads: ${esc(error.message)}</div>`;
    return;
  }

  const total              = leads?.length || 0;
  const trialSetupSent     = leads?.filter(l => l.trial_setup_sent).length || 0;
  const onboardingSent     = leads?.filter(l => l.onboarding_status !== 'not sent').length || 0;
  const onboardingDone     = leads?.filter(l => l.onboarding_status === 'submitted').length || 0;
  const contractSigned     = leads?.filter(l => l.contract_status === 'signed').length || 0;

  const tierOptions = SETUP_TIERS.map(t =>
    `<option value="${t.value}">${esc(t.label)}</option>`
  ).join('');

  document.getElementById('docsContent').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      <div class="stat-card" style="flex:1;min-width:130px">
        <div class="stat-label">Active Leads</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:130px">
        <div class="stat-label">Trial Setup Sent</div>
        <div class="stat-value">${trialSetupSent}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:130px">
        <div class="stat-label">Forms Submitted</div>
        <div class="stat-value">${onboardingDone}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:130px">
        <div class="stat-label">Contracts Signed</div>
        <div class="stat-value">${contractSigned}</div>
      </div>
    </div>

    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <colgroup>
          <col style="width:20%">
          <col style="width:16%">
          <col style="width:14%">
          <col style="width:14%">
          <col style="width:36%">
        </colgroup>
        <thead>
          <tr>
            <th>Business</th>
            <th>Trial Setup</th>
            <th>Onboarding</th>
            <th>Contract</th>
            <th>Contract Link</th>
          </tr>
        </thead>
        <tbody id="docsTableBody">
          ${(leads || []).map(lead => `
            <tr data-lead-id="${lead.id}">
              <td>
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lead.business_name)}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">${esc(lead.contact_name || '')}</div>
              </td>
              <td class="trial-setup-cell">
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${statusPill(lead.trial_setup_sent ? 'sent' : 'not sent', 'trial')}
                  <button class="btn btn-primary btn-sm send-trial-setup" data-id="${lead.id}" style="white-space:nowrap;font-size:11px;padding:3px 8px;background:#16a34a;border-color:#16a34a">Send Trial Setup</button>
                </div>
              </td>
              <td class="onboarding-status-cell">
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${statusPill(lead.onboarding_status || 'not sent', 'onboarding')}
                  ${lead.onboarding_status === 'submitted'
                    ? `<button class="btn btn-secondary btn-sm view-onboarding" data-id="${lead.id}" style="white-space:nowrap;font-size:11px;padding:2px 8px">View</button>`
                    : `<button class="btn btn-secondary btn-sm send-onboarding" data-id="${lead.id}" style="white-space:nowrap;font-size:11px;padding:2px 8px">Send Form</button>`}
                </div>
              </td>
              <td class="contract-status-cell">
                <div style="display:flex;align-items:center;gap:6px">
                  ${statusPill(lead.contract_status || 'not sent', 'contract')}
                  ${lead.contract_status === 'signed'
                    ? `<button class="btn btn-secondary btn-sm view-contract" data-id="${lead.id}" style="white-space:nowrap;font-size:11px;padding:2px 8px">View</button>`
                    : ''}
                </div>
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <select class="form-select tier-select" data-id="${lead.id}" style="font-size:12px;padding:3px 6px;height:28px;flex:1;min-width:0">
                    ${tierOptions}
                  </select>
                  <button class="btn btn-secondary btn-sm copy-contract" data-id="${lead.id}" style="white-space:nowrap;flex-shrink:0">Copy</button>
                  <button class="btn btn-primary btn-sm send-contract" data-id="${lead.id}" style="white-space:nowrap;flex-shrink:0">Send</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // ── Event listeners ────────────────────────────────────────

  // Send Trial Setup (onboarding form + trial agreement in one email)
  document.querySelectorAll('.send-trial-setup').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const lead = (leads || []).find(l => l.id === id);
      const firstName = (lead?.contact_name || '').split(' ')[0] || 'there';
      const onboardingLink = buildOnboardingLink(id);
      const trialLink = buildTrialAgreementLink(id);
      showEmailModal({
        to: lead?.email || '',
        subject: `Your NeverMiss free trial — 2 quick things`,
        body: `Hi ${firstName},\n\nExcited to get NeverMiss live for ${lead?.business_name || 'you'}. Two quick things to kick off your free 14-day trial:\n\n1. Trial Agreement (takes 30 seconds):\n${trialLink}\n\n2. Setup Form (takes about 5 minutes — tells me your hours, booking style, what you want the AI to say):\n${onboardingLink}\n\nOnce I have both, I\u2019ll have everything configured and live on your phones within 48 hours. I\u2019ll send a test call first so you can hear it before it goes live.\n\nOkeanu Kama\nNeverMiss Hawaii\nnevermisshawaii.com | (808) 724-3713`,
        leadId: id,
        onSent: async () => {
          const row = btn.closest('tr');
          const trialCell = row?.querySelector('.trial-setup-cell');
          if (lead) lead.trial_setup_sent = true;
          if (trialCell) {
            trialCell.querySelector('span').outerHTML = statusPill('sent', 'trial');
          }
          await supabase.from('leads').update({
            trial_setup_sent: true,
            trial_setup_sent_at: new Date().toISOString(),
          }).eq('id', id);
        },
      });
    });
  });

  // Copy onboarding link
  document.querySelectorAll('.copy-onboarding').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const link = buildOnboardingLink(id);
      copyText(link);
      toast('Onboarding link copied!');

      // Mark as sent if currently "not sent"
      const row = btn.closest('tr');
      const statusCell = row?.querySelector('.onboarding-status-cell');
      const lead = (leads || []).find(l => l.id === id);
      if (lead && (!lead.onboarding_status || lead.onboarding_status === 'not sent')) {
        await supabase.from('leads').update({ onboarding_status: 'sent' }).eq('id', id);
        lead.onboarding_status = 'sent';
        if (statusCell) statusCell.innerHTML = statusPill('sent', 'onboarding');
      }
    });
  });

  // Copy contract link
  document.querySelectorAll('.copy-contract').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const row = btn.closest('tr');
      const tierSelect = row?.querySelector('.tier-select');
      const [setup, hours] = (tierSelect?.value || '0|40').split('|');
      const link = buildContractLink(id, setup, hours);
      copyText(link);
      toast('Contract link copied!');

      // Mark as sent if currently "not sent"
      const statusCell = row?.querySelector('.contract-status-cell');
      const lead = (leads || []).find(l => l.id === id);
      if (lead && (!lead.contract_status || lead.contract_status === 'not sent')) {
        await supabase.from('leads').update({ contract_status: 'sent' }).eq('id', id);
        lead.contract_status = 'sent';
        if (statusCell) statusCell.innerHTML = statusPill('sent', 'contract');
      }
    });
  });

  // Send onboarding link
  document.querySelectorAll('.send-onboarding').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const lead = (leads || []).find(l => l.id === id);
      const firstName = (lead?.contact_name || '').split(' ')[0] || 'there';
      const link = buildOnboardingLink(id);
      showEmailModal({
        to: lead?.email || '',
        subject: 'Your onboarding form \u2014 NeverMiss Hawaii',
        body: `Hi ${firstName},\n\n${lead?.business_name} is approved for NeverMiss Hawaii. Complete your onboarding form so we can get your AI receptionist set up:\n\n${link}\n\nJust a few minutes. Reply with any questions.\n\nOkeanu Kama\nNeverMiss Hawaii\nnevermisshawaii.com | (808) 724-3713`,
        leadId: id,
        statusField: 'onboarding_status',
        onSent: () => {
          const row = btn.closest('tr');
          const statusCell = row?.querySelector('.onboarding-status-cell');
          if (lead) lead.onboarding_status = 'sent';
          if (statusCell) statusCell.innerHTML = statusPill('sent', 'onboarding');
        },
      });
    });
  });

  // Send contract link
  document.querySelectorAll('.send-contract').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const lead = (leads || []).find(l => l.id === id);
      const row = btn.closest('tr');
      const tierSelect = row?.querySelector('.tier-select');
      const tierLabel = tierSelect?.options[tierSelect.selectedIndex]?.text || 'Starter';
      const [setup, hours] = (tierSelect?.value || '0|40').split('|');
      const link = buildContractLink(id, setup, hours);
      const firstName = (lead?.contact_name || '').split(' ')[0] || 'there';
      showEmailModal({
        to: lead?.email || '',
        subject: 'Your NeverMiss Hawaii service agreement',
        body: `Hi ${firstName},\n\nHere\u2019s your ${tierLabel} service agreement for NeverMiss Hawaii. Review and sign:\n\n${link}\n\nSetup begins immediately after. Reply with any questions.\n\nOkeanu Kama\nNeverMiss Hawaii\nnevermisshawaii.com | (808) 724-3713`,
        leadId: id,
        statusField: 'contract_status',
        onSent: () => {
          const statusCell = row?.querySelector('.contract-status-cell');
          if (lead) lead.contract_status = 'sent';
          if (statusCell) statusCell.innerHTML = statusPill('sent', 'contract');
        },
      });
    });
  });

  // View onboarding submission
  document.querySelectorAll('.view-onboarding').forEach(btn => {
    btn.addEventListener('click', () => openOnboardingView(btn.dataset.id));
  });

  // View contract signature
  document.querySelectorAll('.view-contract').forEach(btn => {
    btn.addEventListener('click', () => openContractView(btn.dataset.id));
  });
}

// ── Document Viewer ─────────────────────────────────────────

async function openOnboardingView(leadId) {
  const { data, error } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error || !data) {
    toast('Could not load submission data', true);
    return;
  }

  const sections = [
    {
      heading: 'Business Information',
      fields: [
        ['Business Name', data.business_name],
        ['Industry', data.industry],
        ['Address', data.address],
        ['Website', data.website],
        ['Business Phone', data.business_phone],
      ]
    },
    {
      heading: 'Contact',
      fields: [
        ['Contact Name', data.contact_name],
        ['Contact Email', data.contact_email],
        ['Contact Phone', data.contact_phone],
      ]
    },
    {
      heading: 'Service Configuration',
      fields: [
        ['Service Mode', data.service_mode === 'auto' ? 'Auto-Booking' : 'Lead Capture + Transfer'],
        ['Calendar Type', data.calendar_type || '—'],
        ['Available Days', data.available_days || '—'],
        ['Hours', `${data.hours_start || ''} – ${data.hours_end || ''}`],
        ['Appointment Duration', data.appt_duration ? `${data.appt_duration} min` : '—'],
        ['Service Area', data.service_area || '—'],
        ['Emergency Service', data.emergency_service ? 'Yes' : 'No'],
        ['Estimates Policy', data.estimates_policy || '—'],
        ['Avg Job Value', data.avg_job_value || '—'],
      ]
    },
    {
      heading: 'AI Setup',
      fields: [
        ['Voice Style', data.voice_style || '—'],
        ['AI Name', data.ai_name || '—'],
        ['Greeting Script', data.greeting_script || '—'],
      ]
    },
    {
      heading: 'FAQ Answers',
      fields: [
        data.faq_1_q ? [`Q: ${data.faq_1_q}`, data.faq_1_a || '(no answer)'] : null,
        data.faq_2_q ? [`Q: ${data.faq_2_q}`, data.faq_2_a || '(no answer)'] : null,
        data.faq_3_q ? [`Q: ${data.faq_3_q}`, data.faq_3_a || '(no answer)'] : null,
        data.faq_4_q ? [`Q: ${data.faq_4_q}`, data.faq_4_a || '(no answer)'] : null,
        data.faq_5_q ? [`Q: ${data.faq_5_q}`, data.faq_5_a || '(no answer)'] : null,
      ].filter(Boolean)
    },
    {
      heading: 'Go-Live & Additional Notes',
      fields: [
        ['Target Go-Live Date', data.target_golive_date || '—'],
        ['Best Test Time', data.best_test_time || '—'],
        ['AI Restrictions', data.ai_restrictions || '—'],
        ['Additional Notes', data.additional_notes || '—'],
      ]
    },
    {
      heading: 'Signature',
      fields: [
        ['Signed By', data.signer_name],
        ['Date Signed', data.signer_date],
      ]
    },
  ];

  renderDocumentModal(
    `Onboarding Form — ${esc(data.business_name)}`,
    `Submitted ${data.signer_date}`,
    sections
  );
}

async function openContractView(leadId) {
  const { data, error } = await supabase
    .from('contract_signatures')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error || !data) {
    toast('Could not load contract data', true);
    return;
  }

  const sections = [
    {
      heading: 'Business Information',
      fields: [
        ['Business Name', data.business_name],
        ['Contact Name', data.contact_name],
        ['Contact Email', data.contact_email],
        ['Contact Phone', data.contact_phone],
        ['Business Address', data.business_address || '—'],
      ]
    },
    {
      heading: 'Agreement Terms',
      fields: [
        ['Service Mode', data.service_mode === 'auto' ? 'Auto-Booking' : 'Lead Capture + Transfer'],
        ['Monthly Fee', data.monthly_fee],
        ['Setup Fee', data.setup_fee],
        ['Included Setup Hours', data.included_hours],
      ]
    },
    {
      heading: 'Digital Signature',
      fields: [
        ['Signed By', data.signature_text],
        ['Signed At', data.signed_at ? new Date(data.signed_at).toLocaleString('en-US', { timeZone: 'Pacific/Honolulu', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' HST' : '—'],
      ]
    },
  ];

  renderDocumentModal(
    `Service Agreement — ${esc(data.business_name)}`,
    `Signed ${new Date(data.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    sections
  );
}

function renderDocumentModal(title, subtitle, sections) {
  document.getElementById('docViewerTitle').textContent = title;
  document.getElementById('docViewerSub').textContent = subtitle;

  document.getElementById('docViewerBody').innerHTML = sections.map(sec => `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">${esc(sec.heading)}</div>
      <div style="display:grid;gap:8px">
        ${sec.fields.map(([label, value]) => `
          <div style="display:grid;grid-template-columns:180px 1fr;gap:12px;padding:8px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
            <div style="font-size:12px;font-weight:600;color:#64748b">${esc(label)}</div>
            <div style="font-size:13px;color:#1e293b;white-space:pre-wrap">${esc(value || '—')}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  const modal = document.getElementById('docViewerModal');
  modal.style.display = 'flex';
}
