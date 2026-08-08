import { isStaff } from './auth.js';
import { ensureStaffOrRedirect } from './app.js';
import {
  archiveStatement,
  archiveUtilityBill,
  listApartments,
  listLeases,
  listStatements,
  listUtilityBills,
  saveStatement,
  saveUtilityBill,
  toggleStatementPaid,
  toggleUtilityBillPaid,
} from './data.js';
import { escapeHtml, formatCurrency, formatDate, formatMonth, monthKey, openModal, closeModal, setLoadingState, wireModalClose, confirmDialog } from './utils.js';

const UTILITY_LABELS = {
  all: 'Összes',
  electric: 'Villany',
  water: 'Víz',
  gas: 'Gáz',
};

const UTILITY_FILTER_TYPES = ['all', 'electric', 'gas', 'water'];
const DEFAULT_UTILITY_FILTER = 'all';
const RECENT_STATEMENTS_LIMIT = 3;
const RECENT_UTILITY_LIMIT = 5;

export async function renderPage({ root, profile, notify }) {
  const canEdit = isStaff(profile);
  if (canEdit) {
    const allowed = await ensureStaffOrRedirect(profile);
    if (!allowed) return;
  }

  document.title = 'Havi elszámolás - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Havi elszámolás';

  setLoadingState(root, 'Elszámolások betöltése...');

  try {
    const [statements, utilityBills, leases, apartments] = await Promise.all([
      listStatements({ profile }),
      listUtilityBills({ profile }),
      canEdit ? listLeases() : Promise.resolve([]),
      canEdit ? listApartments() : Promise.resolve([]),
    ]);
    const selectedApartmentId = canEdit ? window.sessionStorage.getItem('billing-apartment-id') : null;
    const visibleStatements = canEdit
      ? statements.filter((statement) => statement.apartment_id === selectedApartmentId)
      : statements;
    const visibleUtilityBills = canEdit
      ? utilityBills.filter((bill) => bill.apartment_id === selectedApartmentId)
      : utilityBills;
    const selectedUtilityType = window.sessionStorage.getItem('billing-utility-type') || DEFAULT_UTILITY_FILTER;
    const filteredUtilityBills = selectedUtilityType === 'all'
      ? visibleUtilityBills
      : visibleUtilityBills.filter((bill) => bill.utility_type === selectedUtilityType);
    const showAllStatements = window.sessionStorage.getItem('billing-statements-show-all') === 'true';
    const showAllUtilityBills = window.sessionStorage.getItem('billing-utility-show-all') === 'true';

    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Havi elszámolás</p>
          <h2>${canEdit ? 'Lakbér és külön közüzemi számlák kezelése.' : 'A saját havi elszámolásaid és közüzemi számláid.'}</h2>
        </div>
        <div class="badge-row">
          <span class="tag status-neutral"><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(monthKey())}</span>
          ${canEdit ? '<button class="btn btn-primary" type="button" data-add-statement><i class="fa-solid fa-file-invoice"></i> Új havi elszámolás</button>' : ''}
          ${canEdit ? '<button class="btn btn-secondary" type="button" data-add-utility><i class="fa-solid fa-bolt"></i> Új közüzemi számla</button>' : ''}
        </div>
      </section>
      ${canEdit ? renderApartmentFilter(apartments, selectedApartmentId) : ''}
      <section class="${canEdit ? 'grid-3' : 'grid-2'}">
        <article class="card">
          <div class="card-header"><div><h3>Havi lakbér összefoglaló</h3><p>Az utolsó rögzített hónap.</p></div></div>
          <div data-billing-summary>${renderSummary(visibleStatements[0] || null)}</div>
        </article>
        <article class="card">
          <div class="card-header"><div><h3>${canEdit ? 'Nyitott tételek' : 'Külön rögzített közüzemi számlák'}</h3><p>${canEdit ? 'Lakbér, áram, víz és gáz, amelyek még nincsenek befizetve.' : 'Áram, víz és gáz külön rekordként, időszakkal és végösszeggel.'}</p></div></div>
          <div data-utility-snapshot>${renderUtilitySnapshot(visibleUtilityBills, visibleStatements, canEdit)}</div>
        </article>
        ${canEdit ? `<div data-total-owed>${renderTotalOwed(visibleStatements, visibleUtilityBills, selectedApartmentId)}</div>` : ''}
      </section>
      <section class="page-section">
        <div class="card-header"><div><h3>Havi elszámolások</h3><p>Hónapokra bontott lakbér és összesített fizetendő.</p></div></div>
        <div data-statements-table>${renderStatementsTable(visibleStatements, canEdit, showAllStatements)}</div>
      </section>
      <section class="page-section">
          <div class="card-header">
            <div><h3>Közüzemi számlák</h3><p>Az áram, víz és gáz számlák külön kezelése, időszak és végösszeg alapján.</p></div>
            ${renderUtilityTypeFilter(selectedUtilityType)}
          </div>
        <div data-utility-bills-table>${renderUtilityBillsTable(filteredUtilityBills, canEdit, showAllUtilityBills)}</div>
      </section>
      ${canEdit ? renderStatementModal(leases) : ''}
      ${canEdit ? renderUtilityModal(leases) : ''}
    `;

    root.querySelectorAll('[data-filter-utility-type]').forEach((button) => {
      button.addEventListener('click', async () => {
        const scrollY = window.scrollY;
        window.sessionStorage.setItem('billing-utility-type', button.dataset.filterUtilityType);
        window.sessionStorage.setItem('billing-utility-show-all', 'false');
        await renderPage({ root, profile, notify });
        window.scrollTo(0, scrollY);
      });
    });

    root.querySelector('[data-toggle-statements-view]')?.addEventListener('click', async () => {
      const scrollY = window.scrollY;
      window.sessionStorage.setItem('billing-statements-show-all', String(!showAllStatements));
      await renderPage({ root, profile, notify });
      window.scrollTo(0, scrollY);
    });

    root.querySelector('[data-toggle-utility-view]')?.addEventListener('click', async () => {
      const scrollY = window.scrollY;
      window.sessionStorage.setItem('billing-utility-show-all', String(!showAllUtilityBills));
      await renderPage({ root, profile, notify });
      window.scrollTo(0, scrollY);
    });

    if (canEdit) {
      root.querySelector('[data-apartment-filter]').addEventListener('change', async (event) => {
        const scrollY = window.scrollY;
        window.sessionStorage.setItem('billing-apartment-id', event.target.value);
        await renderPage({ root, profile, notify });
        window.scrollTo(0, scrollY);
      });
      wireBillingActions(root, visibleStatements, visibleUtilityBills, leases, apartments, profile, notify);
    }
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function renderApartmentFilter(apartments, selectedApartmentId) {
  return `
    <section class="page-section">
      <label class="form-field" style="max-width: 420px">
        <span>Lakás kiválasztása</span>
        <select data-apartment-filter>
          <option value="">Válassz lakást...</option>
          ${apartments.map((apartment) => `<option value="${apartment.id}" ${apartment.id === selectedApartmentId ? 'selected' : ''}>${escapeHtml(apartment.title || apartment.address || 'Névtelen lakás')}</option>`).join('')}
        </select>
      </label>
    </section>
  `;
}

function renderSummary(statement) {
  if (!statement) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-file-invoice"></i></div><h3>Nincs még elszámolás</h3><p>Az admin itt tud új havi számlát rögzíteni.</p></div>';
  }

  return `
    <div class="metric-list">
      <div class="metric-item"><span>Hónap</span><strong>${formatMonth(statement.billing_month)}</strong></div>
      <div class="metric-item"><span>Lakbér</span><strong>${formatCurrency(statement.rent_amount)}</strong></div>
      <div class="metric-item"><span>Összes fizetendő</span><strong>${formatCurrency(statement.total_amount || statement.rent_amount)}</strong></div>
      <div class="metric-item"><span>Állapot</span><strong>${statement.is_paid ? 'Befizetve' : 'Nincs befizetve'}</strong></div>
      <div class="metric-item"><span>Befizetés dátuma</span><strong>${statement.paid_at ? formatDate(statement.paid_at) : '-'}</strong></div>
    </div>
  `;
}

function computeOutstandingTotal(statements, utilityBills) {
  const rentOutstanding = (statements || []).reduce((total, statement) => {
    if (!statement || statement.is_paid) return total;
    return total + (Number(statement.total_amount ?? statement.rent_amount) || 0);
  }, 0);

  const utilitiesOutstanding = (utilityBills || []).reduce((total, bill) => {
    if (!bill || bill.is_paid) return total;
    return total + (Number(bill.total_amount) || 0);
  }, 0);

  return rentOutstanding + utilitiesOutstanding;
}

function renderTotalOwed(statements, utilityBills, selectedApartmentId) {
  const total = computeOutstandingTotal(statements, utilityBills);
  const hasSelection = Boolean(selectedApartmentId);
  const canPay = hasSelection && total > 0;
  return `
    <article class="card">
      <div class="card-header"><div><h3>Összesen tartozik</h3><p>Lakbér + áram + víz + gáz, az összes nem fizetett tétel.</p></div></div>
      <article class="stat-card">
        <div class="stat-head">
          <div>
            <div class="stat-label">Kiválasztott lakás tartozása</div>
            <div class="stat-value">${formatCurrency(total)}</div>
          </div>
          <div class="stat-icon"><i class="fa-solid fa-sack-dollar"></i></div>
        </div>
      </article>
      <div class="page-actions" style="margin-top:16px">
        <button class="btn btn-primary" type="button" data-pay-all-outstanding ${canPay ? '' : 'disabled'}>
          <i class="fa-solid fa-circle-check"></i> Mind befizetve
        </button>
      </div>
      ${!hasSelection ? '<p class="small-muted" style="margin-top:8px">Válassz lakást a befizetéshez.</p>' : ''}
    </article>
  `;
}

function renderUtilitySnapshot(utilityBills, statements, canEdit) {
  if (canEdit) {
    return renderUnpaidItemsSnapshot(utilityBills, statements);
  }

  if (!utilityBills.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-plug-circle-bolt"></i></div><h3>Nincs még közüzemi számla</h3><p>Az áram, víz és gáz számlák külön rögzíthetők, amikor megérkeznek.</p></div>';
  }

  const latestByType = getLatestUtilityByType(utilityBills);
  return `
    <div class="grid-3">
      ${['electric', 'water', 'gas'].map((type) => {
        const bill = latestByType[type];
        return `
          <article class="stat-card">
            <div class="stat-head">
              <div>
                <div class="stat-label">${UTILITY_LABELS[type]}</div>
                <div class="stat-value">${bill ? formatCurrency(bill.total_amount) : '-'}</div>
              </div>
              <div class="stat-icon"><i class="fa-solid ${type === 'electric' ? 'fa-bolt' : type === 'water' ? 'fa-droplet' : 'fa-fire'}"></i></div>
            </div>
            <div class="small-muted">${bill ? `${formatDate(bill.period_start)} - ${formatDate(bill.period_end)}` : 'Nincs rögzítve'}</div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

// Admin/kezelő nézet: nem a legutolsó rögzített tétel, hanem a még
// befizetetlen (nyitott) tételek jelennek meg - lakbérrel kiegészítve.
function renderUnpaidItemsSnapshot(utilityBills, statements) {
  const unpaidStatements = (statements || []).filter((statement) => !statement.is_paid);
  const rentTotal = unpaidStatements.reduce((total, statement) => total + (Number(statement.total_amount ?? statement.rent_amount) || 0), 0);

  const tiles = [
    {
      label: 'Lakbér',
      icon: 'fa-house-chimney',
      total: rentTotal,
      count: unpaidStatements.length,
    },
    ...['electric', 'water', 'gas'].map((type) => {
      const unpaidBills = (utilityBills || []).filter((bill) => bill.utility_type === type && !bill.is_paid);
      return {
        label: UTILITY_LABELS[type],
        icon: type === 'electric' ? 'fa-bolt' : type === 'water' ? 'fa-droplet' : 'fa-fire',
        total: unpaidBills.reduce((total, bill) => total + (Number(bill.total_amount) || 0), 0),
        count: unpaidBills.length,
      };
    }),
  ];

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:16px">
      ${tiles.map((tile) => `
        <article class="stat-card">
          <div class="stat-head">
            <div>
              <div class="stat-label">${tile.label}</div>
              <div class="stat-value">${formatCurrency(tile.total)}</div>
            </div>
            <div class="stat-icon"><i class="fa-solid ${tile.icon}"></i></div>
          </div>
          <div class="small-muted">${tile.count > 0 ? `${tile.count} nyitott tétel` : 'Nincs nyitott tétel'}</div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderStatementsTable(statements, canEdit, showAll) {
  if (!statements.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-clipboard-list"></i></div><h3>Nincs még havi elszámolás</h3><p>Az első hónapot az új elszámolás gombbal rögzítheted.</p></div>';
  }

  const visibleStatements = showAll ? statements : statements.slice(0, RECENT_STATEMENTS_LIMIT);
  const hasMore = statements.length > RECENT_STATEMENTS_LIMIT;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hónap</th>
            <th>Albérlet</th>
            <th>Bérlő</th>
            <th>Összes fizetendő</th>
            <th>Státusz</th>
            ${canEdit ? '<th>Műveletek</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${visibleStatements.map((statement) => `
            <tr>
              <td>${formatMonth(statement.billing_month)}</td>
              <td>${escapeHtml(statement.apartment?.title || '-')}</td>
              <td>${escapeHtml(statement.tenant?.full_name || statement.tenant?.email || '-')}</td>
              <td>${formatCurrency(statement.total_amount)}</td>
              <td><span class="status-badge ${statement.is_paid ? 'status-paid' : 'status-due'}">${statement.is_paid ? 'Befizetve' : 'Tartozik'}</span></td>
              ${canEdit ? `
                <td>
                  <div class="toolbar">
                    <button class="btn btn-secondary btn-sm" type="button" data-edit-statement="${statement.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-secondary btn-sm" type="button" data-toggle-paid="${statement.id}" data-paid="${!statement.is_paid}"><i class="fa-solid ${statement.is_paid ? 'fa-rotate-left' : 'fa-circle-check'}"></i></button>
                    <button class="btn btn-danger btn-sm" type="button" data-delete-statement="${statement.id}"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              ` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${hasMore ? `
      <div class="toolbar" style="margin-top: 12px;">
        <button class="btn btn-secondary btn-sm" type="button" data-toggle-statements-view>
          ${showAll ? 'Csak az utolsó 3 megjelenítése' : `Összes megtekintése (${statements.length})`}
        </button>
      </div>
    ` : ''}
  `;
}

function renderUtilityTypeFilter(selectedType) {
  return `
    <div class="toolbar" data-utility-type-filter role="group" aria-label="Közüzemi típus szűrő">
      ${UTILITY_FILTER_TYPES.map((type) => `
        <button
          class="btn btn-sm ${type === selectedType ? 'btn-primary' : 'btn-secondary'}"
          type="button"
          data-filter-utility-type="${type}"
          aria-pressed="${type === selectedType}"
        >${UTILITY_LABELS[type]}</button>
      `).join('')}
    </div>
  `;
}

function renderUtilityBillsTable(utilityBills, canEdit, showAll) {
  if (!utilityBills.length) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-receipt"></i></div><h3>Nincs még közüzemi számla</h3><p>Az áram, víz és gáz számlákat külön fel tudod vinni.</p></div>';
  }

  const visibleBills = showAll ? utilityBills : utilityBills.slice(0, RECENT_UTILITY_LIMIT);
  const hasMore = utilityBills.length > RECENT_UTILITY_LIMIT;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Típus</th>
            <th>Elszámolási időszak</th>
            <th>Albérlet</th>
            <th>Bérlő</th>
            <th>Végösszeg</th>
            <th>Státusz</th>
            ${canEdit ? '<th>Műveletek</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${visibleBills.map((bill) => `
            <tr>
              <td>${escapeHtml(UTILITY_LABELS[bill.utility_type] || bill.utility_type)}</td>
              <td>${formatDate(bill.period_start)} - ${formatDate(bill.period_end)}</td>
              <td>${escapeHtml(bill.apartment?.title || '-')}</td>
              <td>${escapeHtml(bill.tenant?.full_name || bill.tenant?.email || '-')}</td>
              <td>${formatCurrency(bill.total_amount)}</td>
              <td><span class="status-badge ${bill.is_paid ? 'status-paid' : 'status-due'}">${bill.is_paid ? 'Befizetve' : 'Tartozik'}</span></td>
              ${canEdit ? `
                <td>
                  <div class="toolbar">
                    <button class="btn btn-secondary btn-sm" type="button" data-edit-utility="${bill.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-secondary btn-sm" type="button" data-toggle-utility-paid="${bill.id}" data-paid="${!bill.is_paid}"><i class="fa-solid ${bill.is_paid ? 'fa-rotate-left' : 'fa-circle-check'}"></i></button>
                    <button class="btn btn-danger btn-sm" type="button" data-delete-utility="${bill.id}"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              ` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${hasMore ? `
      <div class="toolbar" style="margin-top: 12px;">
        <button class="btn btn-secondary btn-sm" type="button" data-toggle-utility-view>
          ${showAll ? 'Csak az utolsó 5 megjelenítése' : `Összes megtekintése (${utilityBills.length})`}
        </button>
      </div>
    ` : ''}
  `;
}

function renderStatementModal(leases) {
  return `
    <div class="modal" id="statement-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="statement-modal-title">Új havi elszámolás</h3>
            <p>Automatikusan számított lakbér összesítő.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="statement-form" class="form-grid form-columns-2">
          <input type="hidden" name="id">
          <input type="hidden" name="apartment_id">
          <input type="hidden" name="tenant_id">
          <label class="form-field"><span>Szerződés</span><select name="lease_id" required>${leases.map((lease) => `<option value="${lease.id}" data-apartment="${lease.apartment_id}" data-tenant="${lease.tenant_id}" data-rent="${lease.monthly_rent}">${escapeHtml(lease.apartment?.title || '-') } - ${escapeHtml(lease.tenant?.full_name || lease.tenant?.email || '-')}</option>`).join('')}</select></label>
          <label class="form-field"><span>Hónap</span><input type="month" name="billing_month" value="${monthKey()}" required></label>
          <label class="form-field"><span>Lakbér</span><input type="number" step="1" name="rent_amount" required></label>
          <label class="form-field"><span>Befizetett</span><select name="is_paid"><option value="false">Nincs befizetve</option><option value="true">Befizetve</option></select></label>
          <label class="form-field"><span>Befizetés dátuma</span><input type="date" name="paid_at"></label>
          <label class="form-field"><span>Fizetési mód</span><input type="text" name="payment_method" placeholder="Átutalás, készpénz..."></label>
          <label class="form-field" style="grid-column:1 / -1"><span>Megjegyzés</span><textarea name="notes" rows="3"></textarea></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <div class="small-muted">A fogyasztás és a végösszeg automatikusan számolódik mentéskor.</div>
            <div class="toolbar">
              <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
              <button class="btn btn-primary" type="submit">Mentés</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderUtilityModal(leases) {
  const leaseOptions = leases.map((lease) => `<option value="${lease.id}" data-apartment="${lease.apartment_id}" data-tenant="${lease.tenant_id}">${escapeHtml(lease.apartment?.title || '-') } - ${escapeHtml(lease.tenant?.full_name || lease.tenant?.email || '-')}</option>`).join('');

  return `
    <div class="modal" id="utility-modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="utility-modal-title">Új közüzemi számla</h3>
            <p>Áram, víz vagy gáz külön rögzítése.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form id="utility-form" class="form-grid form-columns-2">
          <input type="hidden" name="id">
          <input type="hidden" name="apartment_id">
          <input type="hidden" name="tenant_id">
          <label class="form-field"><span>Típus</span><select name="utility_type" required><option value="electric">Villany</option><option value="water">Víz</option><option value="gas">Gáz</option></select></label>
          <label class="form-field"><span>Szerződés</span><select name="lease_id" required>${leaseOptions}</select></label>
          <label class="form-field"><span>Elszámolás kezdete</span><input type="date" name="period_start" required></label>
          <label class="form-field"><span>Elszámolás vége</span><input type="date" name="period_end" required></label>
          <label class="form-field"><span>Végösszeg</span><input type="number" step="1" name="total_amount" required></label>
          <label class="form-field"><span>Beérkezett</span><input type="date" name="received_at"></label>
          <label class="form-field"><span>Fizetési határidő</span><input type="date" name="due_date"></label>
          <label class="form-field"><span>Befizetve</span><select name="is_paid"><option value="false">Nincs befizetve</option><option value="true">Befizetve</option></select></label>
          <label class="form-field"><span>Befizetés dátuma</span><input type="date" name="paid_at"></label>
          <label class="form-field"><span>Fizetési mód</span><input type="text" name="payment_method" placeholder="Átutalás, készpénz..."></label>
          <label class="form-field" style="grid-column:1 / -1"><span>Megjegyzés</span><textarea name="notes" rows="3"></textarea></label>
          <div class="modal-footer" style="grid-column:1 / -1">
            <div class="small-muted">A fogyasztás és az összeg automatikusan számolódik mentéskor.</div>
            <div class="toolbar">
              <button class="btn btn-secondary" type="button" data-close-modal>Mégse</button>
              <button class="btn btn-primary" type="submit">Mentés</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireBillingActions(root, statements, utilityBills, leases, apartments, profile, notify) {
  const statementModal = document.getElementById('statement-modal');
  const statementForm = document.getElementById('statement-form');
  const statementTitle = document.getElementById('statement-modal-title');
  const utilityModal = document.getElementById('utility-modal');
  const utilityForm = document.getElementById('utility-form');
  const utilityTitle = document.getElementById('utility-modal-title');

  wireModalClose(statementModal);
  wireModalClose(utilityModal);

  root.querySelector('[data-pay-all-outstanding]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const unpaidStatements = statements.filter((statement) => !statement.is_paid);
    const unpaidUtilityBills = utilityBills.filter((bill) => !bill.is_paid);

    if (!unpaidStatements.length && !unpaidUtilityBills.length) return;

    const confirmed = await confirmDialog('Biztosan befizetettre állítod ennek a lakásnak az összes nyitott tételét (lakbér és közüzemi számlák)?', 'Mind befizetve');
    if (!confirmed) return;

    button.disabled = true;
    try {
      await Promise.all([
        ...unpaidStatements.map((statement) => toggleStatementPaid(statement.id, true)),
        ...unpaidUtilityBills.map((bill) => toggleUtilityBillPaid(bill.id, true)),
      ]);
      notify('A lakás tartozása befizetettre állítva.', 'success');
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      notify(error.message, 'error');
    }
  });

  const statementLeaseSelect = statementForm.querySelector('[name="lease_id"]');
  const statementRentInput = statementForm.querySelector('[name="rent_amount"]');
  const utilityLeaseSelect = utilityForm.querySelector('[name="lease_id"]');

  root.querySelector('[data-add-statement]')?.addEventListener('click', () => {
    statementForm.reset();
    statementForm.id.value = '';
    statementForm.billing_month.value = monthKey();
    statementForm.is_paid.value = 'false';
    const firstLease = leases[0];
    if (firstLease) {
      statementLeaseSelect.value = firstLease.id;
      statementRentInput.value = firstLease.monthly_rent || 0;
      statementForm.apartment_id.value = firstLease.apartment_id || '';
      statementForm.tenant_id.value = firstLease.tenant_id || '';
    }
    statementTitle.textContent = 'Új havi elszámolás';
    openModal(statementModal);
  });

  root.querySelector('[data-add-utility]')?.addEventListener('click', () => {
    utilityForm.reset();
    utilityForm.id.value = '';
    utilityForm.is_paid.value = 'false';
    const firstLease = leases[0];
    if (firstLease) {
      utilityLeaseSelect.value = firstLease.id;
      utilityForm.apartment_id.value = firstLease.apartment_id || '';
      utilityForm.tenant_id.value = firstLease.tenant_id || '';
    }
    utilityTitle.textContent = 'Új közüzemi számla';
    openModal(utilityModal);
  });

  statementLeaseSelect.addEventListener('change', () => {
    const lease = leases.find((item) => item.id === statementLeaseSelect.value);
    if (lease) {
      statementRentInput.value = lease.monthly_rent || 0;
      statementForm.apartment_id.value = lease.apartment_id || '';
      statementForm.tenant_id.value = lease.tenant_id || '';
    }
  });

  utilityLeaseSelect.addEventListener('change', () => {
    const lease = leases.find((item) => item.id === utilityLeaseSelect.value);
    if (lease) {
      utilityForm.apartment_id.value = lease.apartment_id || '';
      utilityForm.tenant_id.value = lease.tenant_id || '';
    }
  });

  root.querySelectorAll('[data-edit-statement]').forEach((button) => {
    button.addEventListener('click', () => {
      const statement = statements.find((item) => item.id === button.dataset.editStatement);
      if (!statement) return;
      statementForm.id.value = statement.id;
      statementForm.lease_id.value = statement.lease_id;
      statementForm.apartment_id.value = statement.apartment_id || '';
      statementForm.tenant_id.value = statement.tenant_id || '';
      statementForm.billing_month.value = statement.billing_month?.slice(0, 7) || monthKey();
      statementForm.rent_amount.value = statement.rent_amount || 0;
      statementForm.electric_previous.value = statement.electric_previous || 0;
      statementForm.electric_current.value = statement.electric_current || 0;
      statementForm.electric_unit_price.value = statement.electric_unit_price || 0;
      statementForm.water_previous.value = statement.water_previous || 0;
      statementForm.water_current.value = statement.water_current || 0;
      statementForm.water_unit_price.value = statement.water_unit_price || 0;
      statementForm.gas_previous.value = statement.gas_previous || 0;
      statementForm.gas_current.value = statement.gas_current || 0;
      statementForm.gas_unit_price.value = statement.gas_unit_price || 0;
      statementForm.is_paid.value = String(statement.is_paid);
      statementForm.paid_at.value = statement.paid_at ? statement.paid_at.slice(0, 10) : '';
      statementForm.payment_method.value = statement.payment_method || '';
      statementForm.notes.value = statement.notes || '';
      statementTitle.textContent = 'Elszámolás szerkesztése';
      openModal(statementModal);
    });
  });

  root.querySelectorAll('[data-edit-utility]').forEach((button) => {
    button.addEventListener('click', () => {
      const bill = utilityBills.find((item) => item.id === button.dataset.editUtility);
      if (!bill) return;
      utilityForm.id.value = bill.id;
      utilityForm.utility_type.value = bill.utility_type;
      utilityForm.lease_id.value = bill.lease_id;
      utilityForm.apartment_id.value = bill.apartment_id || '';
      utilityForm.tenant_id.value = bill.tenant_id || '';
      utilityForm.period_start.value = bill.period_start || '';
      utilityForm.period_end.value = bill.period_end || '';
      utilityForm.total_amount.value = bill.total_amount || 0;
      utilityForm.received_at.value = bill.received_at || '';
      utilityForm.due_date.value = bill.due_date || '';
      utilityForm.is_paid.value = String(bill.is_paid);
      utilityForm.paid_at.value = bill.paid_at ? bill.paid_at.slice(0, 10) : '';
      utilityForm.payment_method.value = bill.payment_method || '';
      utilityForm.notes.value = bill.notes || '';
      utilityTitle.textContent = 'Közüzemi számla szerkesztése';
      openModal(utilityModal);
    });
  });

  root.querySelectorAll('[data-toggle-paid]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await toggleStatementPaid(button.dataset.togglePaid, button.dataset.paid === 'true');
        notify('Fizetési állapot frissítve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-toggle-utility-paid]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await toggleUtilityBillPaid(button.dataset.toggleUtilityPaid, button.dataset.paid === 'true');
        notify('Közüzemi számla státusza frissítve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-delete-statement]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan törlöd az elszámolást?', 'Törlés');
      if (!confirmed) return;
      try {
        await archiveStatement(button.dataset.deleteStatement);
        notify('Elszámolás törölve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-delete-utility]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Biztosan törlöd a közüzemi számlát?', 'Törlés');
      if (!confirmed) return;
      try {
        await archiveUtilityBill(button.dataset.deleteUtility);
        notify('Közüzemi számla törölve.', 'success');
        window.location.reload();
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });

  statementForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(statementForm).entries());
    const lease = leases.find((item) => item.id === payload.lease_id);
    if (lease) {
      payload.apartment_id = lease.apartment_id;
      payload.tenant_id = lease.tenant_id;
      payload.rent_amount = lease.monthly_rent;
    }
    payload.rent_amount = payload.rent_amount || lease?.monthly_rent || 0;
    payload.total_amount = payload.rent_amount;
    try {
      await saveStatement(payload);
      notify('Elszámolás mentve.', 'success');
      closeModal(statementModal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  utilityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(utilityForm).entries());
    const lease = leases.find((item) => item.id === payload.lease_id);
    if (lease) {
      payload.apartment_id = lease.apartment_id;
      payload.tenant_id = lease.tenant_id;
    }
    try {
      await saveUtilityBill(payload);
      notify('Közüzemi számla mentve.', 'success');
      closeModal(utilityModal);
      window.location.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}

function getLatestUtilityByType(utilityBills) {
  return utilityBills.reduce((accumulator, bill) => {
    if (!accumulator[bill.utility_type]) {
      accumulator[bill.utility_type] = bill;
      return accumulator;
    }

    const current = new Date(
  accumulator[bill.utility_type].period_start ||
  accumulator[bill.utility_type].period_end
).getTime();

const candidate = new Date(
  bill.period_start ||
  bill.period_end
).getTime();
    if (candidate > current) {
      accumulator[bill.utility_type] = bill;
    }
    return accumulator;
  }, { electric: null, water: null, gas: null });
}