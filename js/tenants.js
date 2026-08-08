import { ensureStaffOrRedirect } from './app.js';
import { archiveLease, archiveTenant, listApartments, listLeases, listTenantProfiles, saveLease, saveTenantProfile } from './data.js';
import { escapeHtml, formatCurrency, formatDate, openModal, closeModal, wireModalClose, setLoadingState, showToast, confirmDialog } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  const allowed = await ensureStaffOrRedirect(profile);
  if (!allowed) return;

  document.title = 'Albérlők - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Albérlők';

  setLoadingState(root, 'Albérlők betöltése...');

  try {
    const [tenants, apartments, leases] = await Promise.all([listTenantProfiles(), listApartments(), listLeases()]);
    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Admin modul</p>
          <h2>Albérlők és szerződések kezelése.</h2>
          <p>Létrehozhatsz új bérlői fiókokat, módosíthatod az adatokat és lezárhatod a viszonyokat.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" data-add-tenant><i class="fa-solid fa-user-plus"></i> Új albérlő</button>
        </div>
      </section>
      <section class="grid-1">
        <article class="card">
          <div class="card-header"><div><h3>Albérlők</h3><p>Profil és aktuális állapot.</p></div></div>
          ${renderTenantTable(tenants)}
        </article>
        <article class="card">
          <div class="card-header"><div><h3>Szerződések</h3><p>Aktív és lezárt bérleti megállapodások.</p></div></div>
          ${renderLeaseTable(leases)}
        </article>
      </section>
      ${renderTenantModal(apartments)}
      ${renderLeaseModal(apartments, tenants)}
    `;

    wireTenantActions(root, tenants, apartments, leases, profile, notify);
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function renderTenantTable(tenants) {
  if (!tenants.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-users-slash"></i></div><h3>Nincs még albérlő</h3><p>Az első bérlői fiókot a gombbal hozhatod létre.</p></div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Név</th>
            <th>E-mail</th>
            <th>Telefon</th>
            <th>Albérlet</th>
            <th>Státusz</th>
            <th>Műveletek</th>
          </tr>
        </thead>
        <tbody>
          ${tenants.map((tenant) => `
            <tr>
              <td>${escapeHtml(tenant.full_name || '-')}</td>
              <td>${escapeHtml(tenant.email || '-')}</td>
              <td>${escapeHtml(tenant.phone || '-')}</td>
              <td>${escapeHtml(tenant.apartment?.title || '-')}</td>
              <td><span class="status-badge ${tenant.is_active ? 'status-paid' : 'status-danger'}">${tenant.is_active ? 'Aktív' : 'Inaktív'}</span></td>
              <td>
                <div class="toolbar">
                  <button class="btn btn-secondary btn-sm" type="button" data-edit-tenant="${tenant.id}"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn btn-secondary btn-sm" type="button" data-edit-lease="${tenant.id}"><i class="fa-solid fa-file-contract"></i></button>
                  <button class="btn btn-danger btn-sm" type="button" data-delete-tenant="${tenant.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeaseTable(leases) {
  if (!leases.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-file-contract"></i></div><h3>Nincs még szerződés</h3><p>A szerződésadatokat itt tudod kezelni.</p></div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Albérlet</th>
            <th>Bérlő</th>
            <th>Kezdés</th>
            <th>Vég</th>
            <th>Havi díj</th>
            <th>Státusz</th>
            <th>Műveletek</th>
          </tr>
        </thead>
        <tbody>
          ${leases.map((lease) => `
            <tr>
              <td>${escapeHtml(lease.apartment?.title || '-')}</td>
              <td>${escapeHtml(lease.tenant?.full_name || lease.tenant?.email || '-')}</td>
              <td>${formatDate(lease.start_date)}</td>
              <td>${lease.end_date ? formatDate(lease.end_date) : '-'}</td>
              <td>${formatCurrency(lease.monthly_rent)}</td>
              <td><span class="status-badge ${lease.status === 'active' ? 'status-paid' : 'status-neutral'}">${escapeHtml(lease.status)}</span></td>
              <td>
                <button class="btn btn-danger btn-sm" type="button" data-delete-lease="${lease.id}"><i class="fa-solid fa-xmark"></i> Lezárás</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTenantModal(apartments) {
  return `
    <div class="modal" id="tenant-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="tenant-modal-title">Új albérlő</h3>
            <p>Bejelentkezési és profiladatok.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="tenant-form" class="form-grid form-columns-2">
          <input type="hidden" name="id">
          <label class="form-field"><span>Teljes név</span><input type="text" name="full_name" required></label>
          <label class="form-field"><span>E-mail</span><input type="email" name="email" required></label>
          <label class="form-field"><span>Jelszó új létrehozáshoz</span><input type="password" name="password" minlength="6"></label>
          <label class="form-field"><span>Telefon</span><input type="text" name="phone"></label>
          <label class="form-field"><span>Albérlet</span><select name="apartment_id"><option value="">Nincs kijelölve</option>${apartments.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Aktív</span><select name="is_active"><option value="true">Igen</option><option value="false">Nem</option></select></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
            <button class="btn btn-primary" type="submit">Mentés</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderLeaseModal(apartments, tenants) {
  return `
    <div class="modal" id="lease-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3>Szerződés szerkesztése</h3>
            <p>Aktív vagy lezárt bérleti viszony.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="lease-form" class="form-grid form-columns-2">
          <input type="hidden" name="id">
          <label class="form-field"><span>Albérlet</span><select name="apartment_id" required>${apartments.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Albérlő</span><select name="tenant_id" required>${tenants.map((item) => `<option value="${item.id}">${escapeHtml(item.full_name || item.email)}</option>`).join('')}</select></label>
          <label class="form-field"><span>Kezdés</span><input type="date" name="start_date" required></label>
          <label class="form-field"><span>Vég</span><input type="date" name="end_date"></label>
          <label class="form-field"><span>Havi díj</span><input type="number" step="1" name="monthly_rent" required></label>
          <label class="form-field"><span>Kaució</span><input type="number" step="1" name="deposit_amount"></label>
          <label class="form-field"><span>Státusz</span><select name="status"><option value="active">active</option><option value="ended">ended</option></select></label>
          <label class="form-field"><span>Megjegyzés</span><textarea name="notes" rows="4"></textarea></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
            <button class="btn btn-primary" type="submit">Mentés</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireTenantActions(root, tenants, apartments, leases, profile, notify) {
  const tenantModal = document.getElementById('tenant-modal');
  const tenantForm = document.getElementById('tenant-form');
  const tenantTitle = document.getElementById('tenant-modal-title');
  const leaseModal = document.getElementById('lease-modal');
  const leaseForm = document.getElementById('lease-form');
  wireModalClose(tenantModal);
  wireModalClose(leaseModal);

  root.querySelector('[data-add-tenant]')?.addEventListener('click', () => {
    tenantForm.reset();
    tenantForm.id.value = '';
    tenantForm.is_active.value = 'true';
    tenantTitle.textContent = 'Új albérlő';
    openModal(tenantModal);
  });

  root.querySelectorAll('[data-edit-tenant]').forEach((button) => {
    button.addEventListener('click', () => {
      const tenant = tenants.find((item) => item.id === button.dataset.editTenant);
      if (!tenant) return;
      tenantForm.id.value = tenant.id;
      tenantForm.full_name.value = tenant.full_name || '';
      tenantForm.email.value = tenant.email || '';
      tenantForm.phone.value = tenant.phone || '';
      tenantForm.apartment_id.value = tenant.apartment_id || '';
      tenantForm.is_active.value = tenant.is_active ? 'true' : 'false';
      tenantTitle.textContent = 'Albérlő szerkesztése';
      openModal(tenantModal);
    });
  });

  root.querySelectorAll('[data-edit-lease]').forEach((button) => {
    button.addEventListener('click', () => {
      const tenant = tenants.find((item) => item.id === button.dataset.editLease);
      const lease = leases.find((item) => item.tenant_id === button.dataset.editLease && item.status === 'active') || leases.find((item) => item.tenant_id === button.dataset.editLease);
      leaseForm.reset();
      leaseForm.id.value = lease?.id || '';
      leaseForm.tenant_id.value = tenant?.id || '';
      leaseForm.apartment_id.value = lease?.apartment_id || tenant?.apartment_id || apartments[0]?.id || '';
      leaseForm.start_date.value = lease?.start_date || new Date().toISOString().slice(0, 10);
      leaseForm.end_date.value = lease?.end_date || '';
      leaseForm.monthly_rent.value = lease?.monthly_rent || 0;
      leaseForm.deposit_amount.value = lease?.deposit_amount || 0;
      leaseForm.status.value = lease?.status || 'active';
      leaseForm.notes.value = lease?.notes || '';
      openModal(leaseModal);
    });
  });

  root.querySelectorAll('[data-delete-tenant]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan inaktiválod az albérlőt?', 'Inaktiválás');
      if (!confirmed) return;
      try {
        await archiveTenant(button.dataset.deleteTenant);
        notify('Albérlő inaktiválva.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-delete-lease]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan lezárod a szerződést?', 'Lezárás');
      if (!confirmed) return;
      try {
        await archiveLease(button.dataset.deleteLease);
        notify('Szerződés lezárva.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  tenantForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(tenantForm).entries());
    try {
      await saveTenantProfile(payload);
      notify('Albérlő mentve.', 'success');
      closeModal(tenantModal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  leaseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(leaseForm).entries());
    try {
      await saveLease(payload);
      notify('Szerződés mentve.', 'success');
      closeModal(leaseModal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}
