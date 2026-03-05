// ============================================================
// NeverMiss CRM — Scripts Tab
// ============================================================
import { supabase } from './client.js';
import { showToast } from './app.js';

export async function renderScripts() {
  const pane = document.getElementById('pane-scripts');
  pane.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';

  const { data, error } = await supabase.from('scripts').select('*').order('key');
  if (error) { showToast('Failed to load scripts', true); return; }

  const scripts = data || [];

  const ORDER = ['warmOutreach','coldEmail','coldCall','salesCall','sequenceDay1','sequenceDay3','sequenceDay7','sequenceDay10'];
  const sorted = ORDER.map(key => scripts.find(s => s.key === key)).filter(Boolean);

  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Scripts</div>
        <div class="section-sub">Templates auto-save when you click away</div>
      </div>
    </div>
    <div class="scripts-grid">
      ${sorted.map(s => `
        <div class="script-card">
          <div class="script-card-title">
            <span>${esc(s.title)}</span>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="script-saved" id="saved-${s.key}" style="display:none">✓ Saved</span>
              <button class="btn btn-secondary btn-sm copy-btn" data-key="${s.key}">Copy</button>
            </div>
          </div>
          <textarea class="script-textarea" id="script-${s.key}" data-key="${s.key}" data-id="${s.id}"
            placeholder="Write your ${esc(s.title)} script here…">${esc(s.content || '')}</textarea>
        </div>
      `).join('')}
    </div>
  `;

  pane.querySelectorAll('.script-textarea').forEach(ta => {
    ta.addEventListener('blur', async () => {
      const { key, id } = ta.dataset;
      const { error } = await supabase
        .from('scripts')
        .update({ content: ta.value })
        .eq('id', id);
      if (!error) {
        const saved = document.getElementById(`saved-${key}`);
        if (saved) {
          saved.style.display = 'inline';
          setTimeout(() => saved.style.display = 'none', 2000);
        }
      }
    });
  });

  pane.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta = document.getElementById(`script-${btn.dataset.key}`);
      if (!ta) return;
      navigator.clipboard.writeText(ta.value).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    });
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
