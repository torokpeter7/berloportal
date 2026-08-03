import { isAdmin } from './auth.js';
import { ensureAdminOrRedirect } from './app.js';
import { deleteDocument, getDocumentDownloadUrl, listApartments, listDocuments, listLeases, listTenantProfiles, uploadDocument } from './data.js';
import { escapeHtml, formatDateTime, openModal, closeModal, setLoadingState, wireModalClose, confirmDialog } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  const canEdit = isAdmin(profile);
  if (canEdit) {
    const allowed = await ensureAdminOrRedirect(profile);
    if (!allowed) return;
  }

  document.title = 'Dokumentumok - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Dokumentumok';

  setLoadingState(root, 'Dokumentumok betöltése...');

  try {
    const [documents, tenants, apartments, leases] = await Promise.all([
      listDocuments(profile),
      canEdit ? listTenantProfiles() : Promise.resolve([]),
      canEdit ? listApartments() : Promise.resolve([]),
      canEdit ? listLeases() : Promise.resolve([]),
    ]);

    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Dokumentumkezelés</p>
          <h2>${canEdit ? 'PDF dokumentumok feltöltése és kezelése.' : 'A saját dokumentumaid.'}</h2>
          <p>A fájlok Supabase Storage-ba kerülnek, és minden bérlő csak a hozzá tartozó dokumentumokat látja.</p>
        </div>
        <div class="page-actions">
          ${canEdit ? '<button class="btn btn-primary" type="button" data-upload-document><i class="fa-solid fa-upload"></i> PDF feltöltése</button>' : ''}
        </div>
      </section>
      <section class="page-section">
        ${renderDocuments(documents, canEdit)}
      </section>
      ${canEdit ? renderUploadModal(tenants, apartments, leases) : ''}
    `;

    if (canEdit) {
      wireDocumentActions(root, documents, tenants, apartments, leases, profile, notify);
    } else {
      wireTenantDownloads(root, documents, notify);
    }
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function renderDocuments(documents, canEdit) {
  if (!documents.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-file-pdf"></i></div><h3>Nincs dokumentum</h3><p>Az első PDF feltöltése után itt jelennek meg a fájlok.</p></div>';
  }

  return `
    <div class="card-grid">
      ${documents.map((doc) => `
        <article class="file-row">
          <div class="file-meta">
            <strong>${escapeHtml(doc.title || doc.file_name)}</strong>
            <span>${escapeHtml(doc.file_name)} · ${formatDateTime(doc.created_at)}</span>
            <span>${escapeHtml(doc.tenant?.full_name || doc.tenant?.email || '-')} · ${escapeHtml(doc.apartment?.title || '-')}</span>
          </div>
          <div class="toolbar">
            <button class="btn btn-secondary btn-sm" type="button" data-download-document="${doc.id}"><i class="fa-solid fa-download"></i> Letöltés</button>
            ${canEdit ? `<button class="btn btn-danger btn-sm" type="button" data-delete-document="${doc.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderUploadModal(tenants, apartments, leases) {
  return `
    <div class="modal" id="document-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3>PDF feltöltés</h3>
            <p>Adj hozzá dokumentumot egy bérlőhöz.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="document-form" class="form-grid form-columns-2">
          <label class="form-field"><span>Cím</span><input type="text" name="title" required></label>
          <label class="form-field"><span>Albérlő</span><select name="tenant_id" required>${tenants.map((item) => `<option value="${item.id}">${escapeHtml(item.full_name || item.email)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Albérlet</span><select name="apartment_id">${apartments.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Szerződés</span><select name="lease_id">${leases.map((item) => `<option value="${item.id}">${escapeHtml(item.apartment?.title || '-') } - ${escapeHtml(item.tenant?.full_name || item.tenant?.email || '-')}</option>`).join('')}</select></label>
          <label class="form-field" style="grid-column:1 / -1"><span>PDF fájl</span><input type="file" name="file" accept="application/pdf,.pdf" required></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
            <button class="btn btn-primary" type="submit">Feltöltés</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireDocumentActions(root, documents, tenants, apartments, leases, profile, notify) {
  const modal = document.getElementById('document-modal');
  const form = document.getElementById('document-form');
  wireModalClose(modal);

  root.querySelector('[data-upload-document]')?.addEventListener('click', () => {
    form.reset();
    openModal(modal);
  });

  root.querySelectorAll('[data-download-document]').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = documents.find((item) => item.id === button.dataset.downloadDocument);
      if (!doc) return;
      try {
        const url = await getDocumentDownloadUrl(doc.file_path);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-delete-document]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan törlöd a dokumentumot?', 'Törlés');
      if (!confirmed) return;
      try {
        await deleteDocument(button.dataset.deleteDocument);
        notify('Dokumentum törölve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const file = formData.get('file');
    try {
      await uploadDocument({
        profile,
        file,
        title: formData.get('title'),
        tenantId: formData.get('tenant_id'),
        apartmentId: formData.get('apartment_id'),
        leaseId: formData.get('lease_id'),
      });
      notify('Dokumentum feltöltve.', 'success');
      closeModal(modal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}

function wireTenantDownloads(root, documents, notify) {
  root.querySelectorAll('[data-download-document]').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = documents.find((item) => item.id === button.dataset.downloadDocument);
      if (!doc) return;
      try {
        const url = await getDocumentDownloadUrl(doc.file_path);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });
}
