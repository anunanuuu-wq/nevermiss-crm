// ============================================================
// NeverMiss CRM — Email Sending via Resend
// ============================================================
import { supabase } from './client.js';

const FROM_EMAIL = 'okama@nevermisshawaii.com';

// RESEND_API_KEY is declared globally in config.js

export async function sendEmail(to, subject, html) {
  try {
    // Route through Netlify function to avoid CORS — Resend API cannot be called directly from browser
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, resend_email_id: body.id || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// options: { to, subject, body, leadId, statusField, onSent }
export function showEmailModal({ to, subject, body, leadId, statusField, onSent }) {
  // Reuse existing modal node if present, otherwise create it
  let modal = document.getElementById('emailSendModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'emailSendModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:300;display:none;align-items:center;justify-content:center';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-card" style="max-width:480px;width:100%;padding:24px">
      <div class="modal-header">
        <div class="modal-title">Send Email</div>
        <button class="modal-close" id="emailModalClose">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">To</label>
        <input class="form-input" id="emailTo" type="email" value="${esc(to || '')}" placeholder="recipient@example.com">
      </div>
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input class="form-input" id="emailSubject" value="${esc(subject || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="emailBody" rows="7">${esc(body || '')}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="emailCancel">Cancel</button>
        <button class="btn btn-primary" id="emailSend">Send</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  function closeModal() {
    modal.style.display = 'none';
  }

  document.getElementById('emailModalClose').onclick = closeModal;
  document.getElementById('emailCancel').onclick = closeModal;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('emailSend').onclick = async () => {
    const sendBtn = document.getElementById('emailSend');
    const toVal = document.getElementById('emailTo').value.trim();
    const subjectVal = document.getElementById('emailSubject').value.trim();
    const bodyVal = document.getElementById('emailBody').value.trim();

    if (!toVal) { _toast('Please enter a recipient email', true); return; }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending\u2026';

    const htmlBody = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">${bodyVal.replace(/\n/g, '<br>')}<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"><p style="font-size:12px;color:#9ca3af">NeverMiss Hawaii \u00b7 24/7 AI Receptionist<br><a href="https://nevermisshawaii.com" style="color:#6366f1">nevermisshawaii.com</a> \u00b7 (808) 724-3713</p></div>`;

    const result = await sendEmail(toVal, subjectVal, htmlBody);

    if (!result.ok) {
      console.error('[NeverMiss] Email send failed:', result.error);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Failed — ' + result.error;
      sendBtn.style.background = '#dc2626';
      _toast('Failed to send: ' + result.error, true);
      setTimeout(() => {
        sendBtn.textContent = 'Send';
        sendBtn.style.background = '';
      }, 5000);
      return;
    }

    if (leadId && statusField) {
      await supabase.from('leads').update({ [statusField]: 'sent' }).eq('id', leadId);
    }

    // Log to email thread
    if (leadId) {
      await supabase.from('lead_emails').insert({
        lead_id:         leadId,
        direction:       'outbound',
        subject:         subjectVal,
        body:            bodyVal,
        from_email:      FROM_EMAIL,
        to_email:        toVal,
        source:          'manual',
        sent:            true,
        resend_email_id: result.resend_email_id || null,
      });
    }

    _toast('Email sent!');
    closeModal();
    if (onSent) onSent();
  };
}

function _toast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._dt);
  t._dt = setTimeout(() => t.classList.remove('show'), 2800);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
