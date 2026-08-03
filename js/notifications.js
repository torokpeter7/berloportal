import { listNotifications, listTenantProfiles, sendNotification, markNotificationRead } from './data.js';
import { isAdmin } from './auth.js';
import { ensureAdminOrRedirect } from './app.js';
import { escapeHtml, formatDateTime, openModal, closeModal, setLoadingState, wireModalClose, confirmDialog } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  const canEdit = isAdmin(profile);
  if (canEdit) {
    const allowed = await ensureAdminOrRedirect(profile);
    if (!allowed) return;
  }

  document.title = 'Értesítések - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Értesítések';

  setLoadingState(root, 'Értesítések betöltése...');

  try {
    const [notifications, tenants] = await Promise.all([
      listNotifications(profile),
      canEdit ? listTenantProfiles() : Promise.resolve([]),
    ]);

    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Értesítések</p>
          <h2>${canEdit ? 'Admin üzenetek küldése.' : 'A saját üzeneteid.'}</h2>
          <p>Az admin közvetlen üzenetet küldhet, az albérlő pedig kizárólag a saját értesítéseit látja.</p>
        </div>
        <div class="page-actions">
          ${canEdit ? '<button class="btn btn-primary" type="button" data-compose-message><i class="fa-solid fa-paper-plane"></i> Üzenet küldése</button>' : ''}
        </div>
      </section>
      <section class="page-section">
        ${renderNotifications(notifications, canEdit)}
      </section>
      ${canEdit ? renderComposeModal(tenants) : ''}
    `;

    if (canEdit) {
      wireNotificationActions(root, notifications, tenants, profile, notify);
    } else {
      wireTenantNotificationActions(root, notifications, profile, notify);
    }
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function renderNotifications(notifications, canEdit) {
  if (!notifications.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-bell-slash"></i></div><h3>Nincs üzenet</h3><p>Itt jelennek meg a bérlői értesítések.</p></div>';
  }

  return `
    <div class="card-grid">
      ${notifications.map((item) => `
        <article class="card">
          <div class="card-header">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${formatDateTime(item.created_at)}</p>
            </div>
            <span class="status-badge ${item.read_at ? 'status-paid' : 'status-due'}">${item.read_at ? 'Olvasva' : 'Olvasatlan'}</span>
          </div>
          <p>${escapeHtml(item.message)}</p>
          ${!canEdit && !item.read_at ? `<div class="page-actions"><button class="btn btn-secondary btn-sm" type="button" data-mark-read="${item.id}">Elolvasva</button></div>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderComposeModal(tenants) {
  return `
    <div class="modal" id="notification-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3>Új üzenet</h3>
            <p>Egyetlen albérlőnek küldött értesítés.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="notification-form" class="form-grid form-columns-2">
          <label class="form-field"><span>Címzett</span><select name="recipient_id" required>${tenants.map((item) => `<option value="${item.id}">${escapeHtml(item.full_name || item.email)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Cím</span><input type="text" name="title" required></label>
          <label class="form-field" style="grid-column:1 / -1"><span>Üzenet</span><textarea name="message" rows="5" required></textarea></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
            <button class="btn btn-primary" type="submit">Küldés</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireNotificationActions(root, notifications, tenants, profile, notify) {
  const modal = document.getElementById('notification-modal');
  const form = document.getElementById('notification-form');
  wireModalClose(modal);

  root.querySelector('[data-compose-message]')?.addEventListener('click', () => {
    form.reset();
    openModal(modal);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await sendNotification({
        recipientId: payload.recipient_id,
        title: payload.title,
        message: payload.message,
        senderId: profile.id,
      });
      notify('Üzenet elküldve.', 'success');
      closeModal(modal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}

function wireTenantNotificationActions(root, notifications, profile, notify) {
  root.querySelectorAll('[data-mark-read]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await markNotificationRead(button.dataset.markRead);
        notify('Üzenet olvasottnak jelölve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });
}
