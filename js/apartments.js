import { ensureAdminOrRedirect } from './app.js';
import { archiveApartment, listApartments, saveApartment } from './data.js';
import { escapeHtml, formatCurrency, formatNumber, openModal, closeModal, wireModalClose, setLoadingState, showToast, confirmDialog } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  const allowed = await ensureAdminOrRedirect(profile);
  if (!allowed) return;

  document.title = 'Albérletek - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Albérletek';

  setLoadingState(root, 'Albérletek betöltése...');

  try {
    const apartments = await listApartments();
    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Admin modul</p>
          <h2>Albérletek kezelése.</h2>
          <p>Itt hozhatsz létre, szerkeszthetsz és archiválhatsz minden lakást és ingatlant.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" data-add-apartment><i class="fa-solid fa-plus"></i> Új albérlet</button>
        </div>
      </section>
      <section class="page-section">
        ${renderTable(apartments)}
      </section>
      ${renderModal()}
    `;

    wireApartmentActions(root, apartments, notify);
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function renderTable(apartments) {
  if (!apartments.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-building-circle-xmark"></i></div><h3>Nincs még albérlet</h3><p>Hozz létre egy új ingatlant a gombbal.</p></div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Név</th>
            <th>Kód</th>
            <th>Cím</th>
            <th>Alapterület</th>
            <th>Szobák</th>
            <th>Havi díj</th>
            <th>Státusz</th>
            <th>Műveletek</th>
          </tr>
        </thead>
        <tbody>
          ${apartments.map((apartment) => `
            <tr>
              <td>${escapeHtml(apartment.title)}</td>
              <td>${escapeHtml(apartment.code || '-')}</td>
              <td>${escapeHtml(apartment.address || '-')}</td>
              <td>${apartment.area_sqm ? `${formatNumber(apartment.area_sqm)} m²` : '-'}</td>
              <td>${apartment.rooms ?? '-'}</td>
              <td>${formatCurrency(apartment.monthly_rent)}</td>
              <td><span class="status-badge ${apartment.is_active ? 'status-paid' : 'status-neutral'}">${apartment.is_active ? 'Aktív' : 'Archivált'}</span></td>
              <td>
                <div class="toolbar">
                  <button class="btn btn-secondary btn-sm" type="button" data-edit-apartment="${apartment.id}"><i class="fa-solid fa-pen"></i> Szerkesztés</button>
                  <button class="btn btn-danger btn-sm" type="button" data-delete-apartment="${apartment.id}"><i class="fa-solid fa-trash"></i> Törlés</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderModal() {
  return `
    <div class="modal" id="apartment-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="apartment-modal-title">Új albérlet</h3>
            <p>Ingatlan adatok rögzítése.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="apartment-form" class="form-grid form-columns-2">
          <input type="hidden" name="id">
          <label class="form-field"><span>Név</span><input type="text" name="title" required></label>
          <label class="form-field"><span>Kód</span><input type="text" name="code" placeholder="A-101"></label>
          <label class="form-field" style="grid-column:1 / -1"><span>Cím</span><input type="text" name="address" required></label>
          <label class="form-field"><span>Alapterület (m²)</span><input type="number" step="0.1" name="area_sqm"></label>
          <label class="form-field"><span>Szobák száma</span><input type="number" step="1" name="rooms"></label>
          <label class="form-field"><span>Havi lakbér</span><input type="number" step="1" name="monthly_rent" required></label>
          <label class="form-field"><span>Aktív</span><select name="is_active"><option value="true">Igen</option><option value="false">Nem</option></select></label>
          <label class="form-field" style="grid-column:1 / -1"><span>Megjegyzés</span><textarea name="notes" rows="4"></textarea></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
            <button class="btn btn-primary" type="submit">Mentés</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireApartmentActions(root, apartments, notify) {
  const modal = document.getElementById('apartment-modal');
  const form = document.getElementById('apartment-form');
  const titleNode = document.getElementById('apartment-modal-title');
  wireModalClose(modal);

  root.querySelector('[data-add-apartment]')?.addEventListener('click', () => {
    form.reset();
    form.id.value = '';
    form.is_active.value = 'true';
    titleNode.textContent = 'Új albérlet';
    openModal(modal);
  });

  root.querySelectorAll('[data-edit-apartment]').forEach((button) => {
    button.addEventListener('click', () => {
      const apartment = apartments.find((item) => item.id === button.dataset.editApartment);
      if (!apartment) return;
      form.id.value = apartment.id;
      form.title.value = apartment.title || '';
      form.code.value = apartment.code || '';
      form.address.value = apartment.address || '';
      form.area_sqm.value = apartment.area_sqm ?? '';
      form.rooms.value = apartment.rooms ?? '';
      form.monthly_rent.value = apartment.monthly_rent ?? '';
      form.is_active.value = apartment.is_active ? 'true' : 'false';
      form.notes.value = apartment.notes || '';
      titleNode.textContent = 'Albérlet szerkesztése';
      openModal(modal);
    });
  });

  root.querySelectorAll('[data-delete-apartment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan archiválod az albérletet?', 'Archíválás');
      if (!confirmed) return;
      try {
        await archiveApartment(button.dataset.deleteApartment);
        notify('Albérlet archiválva.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await saveApartment(payload);
      notify('Albérlet mentve.', 'success');
      closeModal(modal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}
