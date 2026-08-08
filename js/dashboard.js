import { loadDashboardData } from './data.js';
import { escapeHtml, formatCurrency, formatDate, formatDateTime, monthKey, setLoadingState, openModal, closeModal } from './utils.js';
import { isStaff } from './auth.js';

const NOTIF_POPUP_SEEN_KEY = 'dashboard-notif-popup-seen-ids';

export async function renderPage({ root, profile, notify }) {
  document.title = 'Dashboard - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Dashboard';

  setLoadingState(root, 'Dashboard betöltése...');

  try {
    const data = await loadDashboardData(profile);
    const staff = isStaff(profile);
    root.innerHTML = staff ? adminDashboard(data) : tenantDashboard(data, profile);
    if (!staff) {
      wireNewNotificationPopup(root, data.notifications || []);
    }
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Nem sikerült betölteni a dashboardot</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
    return;
  }
}

function adminDashboard(data) {
  const cards = [
    { label: 'Összes albérlet', value: data.counts.apartments, icon: 'fa-building' },
    { label: 'Aktív albérlők', value: data.counts.tenants, icon: 'fa-users' },
    { label: 'Befizetett lakbérek', value: data.counts.paidRent, icon: 'fa-circle-check' },
    { label: 'Lejárt lakbérek', value: data.counts.overdueRent, icon: 'fa-clock' },
    { label: 'Teljes kintlévőség', value: formatCurrency(data.counts.outstanding), icon: 'fa-sack-dollar' },
  ];

  return `
    <section class="page-section hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Admin áttekintés</p>
        <h2>Átlátható pénzügyi és üzemeltetési vezérlőpult.</h2>
        <p>Innen követheted az albérleteket, a szerződéseket, a havi elszámolásokat és a hátralékokat egyetlen helyen.</p>
      </div>
      <div class="badge-row">
        <span class="tag status-neutral"><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(monthKey())}</span>
        <span class="tag status-neutral"><i class="fa-solid fa-shield-halved"></i> RLS aktív</span>
      </div>
    </section>
    <section class="stat-grid">
      ${cards.map((card) => `
        <article class="stat-card">
          <div class="stat-head">
            <div>
              <div class="stat-label">${escapeHtml(card.label)}</div>
              <div class="stat-value">${escapeHtml(String(card.value))}</div>
            </div>
            <div class="stat-icon"><i class="fa-solid ${card.icon}"></i></div>
          </div>
        </article>
      `).join('')}
    </section>
    <section class="grid-2">
      <article class="card">
        <div class="card-header">
          <div>
            <h3>Legutóbbi elszámolások</h3>
            <p>Az utolsó 5 rögzítés.</p>
          </div>
        </div>
        ${renderStatementsTable(data.recentStatements)}
      </article>
      <article class="card">
        <div class="card-header">
          <div>
            <h3>Friss szerződések</h3>
            <p>Aktív és közelmúltbeli bérleti viszonyok.</p>
          </div>
        </div>
        ${renderLeasesList(data.recentLeases)}
      </article>
    </section>
  `;
}

function tenantDashboard(data, profile) {
  const latestStatement = data.statements[0] || null;
  // data.utilityBills mostantól csak a még nyitott (nem fizetett) tételeket
  // tartalmazza (lásd loadDashboardData), ezért itt típusonként összegezzük
  // őket - így akkor sem lesz alulszámolva a tartozás, ha egy típusból
  // (pl. villany, vagy egyéb) egyszerre több nyitott tétel is van.
  const unpaidUtilityTotals = sumUnpaidUtilityByType(data.utilityBills || []);
  const unreadNotifications = data.notifications.filter((item) => !item.read_at).length;
  const paidState = latestStatement?.is_paid ? 'Befizetve' : 'Tartozik';

  return `
    <section class="page-section hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Albérlői áttekintés</p>
        <h2>Üdv, ${escapeHtml(profile.full_name || profile.email)}.</h2>
        <p>Itt a saját lakbér, rezsi, dokumentum és üzenet adataidat látod.</p>
      </div>
      <div class="badge-row">
        <span class="tag status-neutral"><i class="fa-solid fa-bell"></i> ${unreadNotifications} olvasatlan</span>
        <span class="tag ${latestStatement?.is_paid ? 'status-paid' : 'status-due'}"><i class="fa-solid ${latestStatement?.is_paid ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${paidState}</span>
      </div>
    </section>
    <section class="stat-grid">
      <article class="stat-card"><div class="stat-label">Lakbér</div><div class="stat-value">${formatCurrency(
  latestStatement && !latestStatement.is_paid
    ? latestStatement.rent_amount
    : 0
)}</div></article>
      <article class="stat-card"><div class="stat-label">Villany</div><div class="stat-value">${formatCurrency(unpaidUtilityTotals.electric)}</div></article>
      <article class="stat-card"><div class="stat-label">Víz</div><div class="stat-value">${formatCurrency(unpaidUtilityTotals.water)}</div></article>
      <article class="stat-card"><div class="stat-label">Gáz</div><div class="stat-value">${formatCurrency(unpaidUtilityTotals.gas)}</div></article>
      <article class="stat-card"><div class="stat-label">Egyéb</div><div class="stat-value">${formatCurrency(unpaidUtilityTotals.other)}</div></article>
      <article class="stat-card"><div class="stat-label">Összes fizetendő</div><div class="stat-value">${formatCurrency(
  (latestStatement && !latestStatement.is_paid
    ? (latestStatement.total_amount || latestStatement.rent_amount)
    : 0)
  + unpaidUtilityTotals.electric + unpaidUtilityTotals.water + unpaidUtilityTotals.gas + unpaidUtilityTotals.other
)}</div></article>
    </section>
    <section class="grid-2 tenant-dashboard-grid">
      <article class="card">
        <div class="card-header">
          <div>
            <h3>Aktív szerződés</h3>
            <p>A legutóbbi aktív szerződés adatai.</p>
          </div>
        </div>
        ${data.lease ? `
          <div class="metric-list">
            <div class="metric-item"><span>Albérlet</span><strong>${escapeHtml(data.lease.apartment?.title || 'Nincs megadva')}</strong></div>
            <div class="metric-item"><span>Havi díj</span><strong>${formatCurrency(data.lease.monthly_rent)}</strong></div>
          </div>
        ` : '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-house-circle-exclamation"></i></div><h3>Nincs aktív szerződés</h3><p>Az admin még nem rendelt hozzád bérleményt.</p></div>'}
      </article>
      <article class="card">
        <div class="card-header">
          <div>
            <h3>Üzenetek és dokumentumok</h3>
            <p>Az utolsó releváns elemek.</p>
          </div>
        </div>
        <div class="metric-list">
          <div class="metric-item"><span>Dokumentumok</span><strong>${data.documents.length}</strong></div>
          <div class="metric-item"><span>Üzenetek</span><strong>${data.notifications.length}</strong></div>
        </div>
        <!-- <div style="margin-top:16px">${renderStatementsTable(data.statements.slice(0, 4))}</div> -->
      </article>
    </section>
    ${renderNewNotificationModal(data.notifications || [])}
  `;
}

function renderNewNotificationModal(notifications) {
  const unread = notifications.filter((item) => !item.read_at);
  if (!unread.length) return '';

  const preview = unread.slice(0, 4);
  const remaining = unread.length - preview.length;

  return `
    <div class="modal" id="new-notification-modal" aria-hidden="true" data-unread-ids="${escapeHtml(unread.map((item) => item.id).join(','))}">
      <div class="modal-dialog modal-sm">
        <div class="modal-header">
          <div>
            <h3><i class="fa-solid fa-bell"></i> Új üzeneted érkezett</h3>
            <p>${unread.length} olvasatlan üzeneted van.</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="metric-list" style="padding: 0 24px">
          ${preview.map((item) => `
            <div class="metric-item">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <div class="small-muted">${formatDateTime(item.created_at)}</div>
              </div>
            </div>
          `).join('')}
          ${remaining > 0 ? `<p class="small-muted">+ ${remaining} további üzenet</p>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" data-close-modal>Bezárás</button>
          <button class="btn btn-primary" type="button" data-goto-notifications><i class="fa-solid fa-bell"></i> Üzenetek megnyitása</button>
        </div>
      </div>
    </div>
  `;
}

function wireNewNotificationPopup(root, notifications) {
  const modal = document.getElementById('new-notification-modal');
  if (!modal) return;

  const unreadIds = (modal.dataset.unreadIds || '').split(',').filter(Boolean);
  if (!unreadIds.length) return;

  let seenIds = [];
  try {
    seenIds = JSON.parse(window.sessionStorage.getItem(NOTIF_POPUP_SEEN_KEY) || '[]');
  } catch {
    seenIds = [];
  }

  // Csak akkor mutatjuk a felugró ablakot, ha van olyan olvasatlan üzenet,
  // amit ebben a böngészési munkamenetben még nem láttunk - így nem
  // zavarja a bérlőt minden dashboard-váltásnál, csak amikor tényleg új
  // üzenet érkezett a belépés óta.
  const hasUnseen = unreadIds.some((id) => !seenIds.includes(id));
  if (!hasUnseen) return;

  const markSeenAndClose = () => {
    window.sessionStorage.setItem(NOTIF_POPUP_SEEN_KEY, JSON.stringify(unreadIds));
    closeModal(modal);
  };

  modal.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', markSeenAndClose);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) markSeenAndClose();
  });
  modal.querySelector('[data-goto-notifications]')?.addEventListener('click', () => {
    window.sessionStorage.setItem(NOTIF_POPUP_SEEN_KEY, JSON.stringify(unreadIds));
    window.location.href = './notifications.html';
  });

  openModal(modal);
}

function sumUnpaidUtilityByType(utilityBills) {
  return utilityBills.reduce((totals, bill) => {
    if (!bill || bill.is_paid) return totals;
    const type = totals[bill.utility_type] === undefined ? 'other' : bill.utility_type;
    totals[type] = (totals[type] || 0) + (Number(bill.total_amount) || 0);
    return totals;
  }, { electric: 0, water: 0, gas: 0, other: 0 });
}

function renderStatementsTable(rows) {
  if (!rows || rows.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-file-invoice"></i></div><h3>Nincs még elszámolás</h3><p>A havi rögzítések itt fognak megjelenni.</p></div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hónap</th>
            <th>Albérlet</th>
            <th>Bérlő</th>
            <th>Összeg</th>
            <th>Állapot</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatDate(row.billing_month))}</td>
              <td>${escapeHtml(row.apartment?.title || 'Nincs megadva')}</td>
              <td>${escapeHtml(row.tenant?.full_name || row.tenant?.email || 'Nincs megadva')}</td>
              <td>${formatCurrency(row.total_amount)}</td>
              <td><span class="status-badge ${row.is_paid ? 'status-paid' : 'status-due'}">${row.is_paid ? 'Befizetve' : 'Tartozik'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeasesList(rows) {
  if (!rows || rows.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-file-contract"></i></div><h3>Nincs még szerződés</h3><p>Az új albérleti szerződések itt jelennek meg.</p></div>';
  }

  return `
    <div class="metric-list">
      ${rows.map((row) => `
        <div class="metric-item">
          <div>
            <strong>${escapeHtml(row.apartment?.title || 'Nincs megadva')}</strong>
            <div class="small-muted">${escapeHtml(row.tenant?.full_name || row.tenant?.email || 'Ismeretlen bérlő')}</div>
          </div>
          <div style="text-align:right">
            <strong>${formatCurrency(row.monthly_rent)}</strong>
            <div class="small-muted">${formatDate(row.start_date)} - ${row.end_date ? formatDate(row.end_date) : 'Folyamatban'}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}