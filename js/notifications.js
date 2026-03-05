// ============================================================
// NeverMiss CRM — Notifications
// ============================================================
import { supabase } from './client.js';
import { openLead, showToast } from './app.js';

export async function renderNotifications() {
  const pane = document.getElementById('pane-notifications');
  pane.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { showToast('Failed to load notifications', true); return; }

  const notifs = data || [];
  const unread = notifs.filter(n => !n.read).length;

  // Update nav badge
  const badge = document.querySelector('[data-pane="notifications"] .nav-badge');
  if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? 'inline' : 'none'; }

  pane.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Notifications</div>
        <div class="section-sub">${unread} unread</div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-secondary btn-sm" id="markAllRead">Mark all read</button>
        <button class="btn btn-danger btn-sm" id="clearAll">Clear all</button>
      </div>
    </div>
    <div class="table-wrap" style="max-width:700px">
      ${notifs.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-title">No notifications</div><div class="empty-state-sub">System events will appear here</div></div>`
        : notifs.map(n => `
          <div class="notif-item ${!n.read ? 'unread' : ''}" data-id="${n.id}">
            <div class="notif-dot"></div>
            <div style="flex:1">
              <div class="notif-msg">${esc(n.message)}</div>
              <div class="notif-time">${new Date(n.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</div>
            </div>
            ${n.lead_id ? `<button class="btn btn-ghost btn-sm" data-lead="${n.lead_id}">View Lead</button>` : ''}
            <button class="btn btn-ghost btn-sm mark-read" data-id="${n.id}" style="display:${n.read ? 'none' : 'inline-flex'}">Mark read</button>
          </div>
        `).join('')
      }
    </div>
  `;

  document.getElementById('markAllRead')?.addEventListener('click', async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    showToast('All marked as read');
    renderNotifications();
  });

  document.getElementById('clearAll')?.addEventListener('click', async () => {
    if (!confirm('Clear all notifications?')) return;
    await supabase.from('notifications').delete().not('id', 'is', null);
    showToast('Notifications cleared');
    renderNotifications();
  });

  pane.querySelectorAll('.mark-read').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('notifications').update({ read: true }).eq('id', btn.dataset.id);
      btn.closest('.notif-item').classList.remove('unread');
      btn.style.display = 'none';
      updateNotifBadge();
    });
  });

  pane.querySelectorAll('[data-lead]').forEach(btn => {
    btn.addEventListener('click', () => openLead(btn.dataset.lead));
  });
}

async function updateNotifBadge() {
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('read', false);
  const badge = document.querySelector('[data-pane="notifications"] .nav-badge');
  if (badge) { badge.textContent = count || ''; badge.style.display = count ? 'inline' : 'none'; }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
