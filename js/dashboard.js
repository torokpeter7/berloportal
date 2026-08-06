import { loadDashboardData } from './data.js';
import { escapeHtml, formatCurrency, formatDate, monthKey, setLoadingState } from './utils.js';
import { isAdmin } from './auth.js';

export async function renderPage({ root, profile, notify }) {
  document.title = 'Dashboard - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Dashboard';

  setLoadingState(root, 'Dashboard betöltése...');

  try {
    const data = await loadDashboardData(profile);
    root.innerHTML = isAdmin(profile) ? adminDashboard(data) : tenantDashboard(data, profile);
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
  const latestUtilityByType = getLatestUtilityByType(data.utilityBills || []);
  const unreadNotifications = data.notifications.filter((item) => !item.read_at).length;
  const paidState = latestStatement?.is_paid ? 'Befizetve' : 'Tartozik';

  return `
    <section class="page-section hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Albérlői áttekintés</p>
        <h2>Üdv, ${escapeHtml(profile.full_name || profile.email)}.</h2>
        <p>Itt a saját lakbér, rezsi, dokumentum és üzenet adataidat látod. Az elmúlt hónapok elszámolásai is elérhetők.</p>
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
      <article class="stat-card"><div class="stat-label">Villany</div><div class="stat-value">${formatCurrency(
  latestUtilityByType.electric && !latestUtilityByType.electric.is_paid
    ? latestUtilityByType.electric.total_amount
    : 0
)}</div></article>
      <article class="stat-card"><div class="stat-label">Víz</div><div class="stat-value">${formatCurrency(
  latestUtilityByType.water && !latestUtilityByType.water.is_paid
    ? latestUtilityByType.water.total_amount
    : 0
)}</div></article>
      <article class="stat-card"><div class="stat-label">Gáz</div><div class="stat-value">${formatCurrency(
  latestUtilityByType.gas && !latestUtilityByType.gas.is_paid
    ? latestUtilityByType.gas.total_amount
    : 0
)}</div></article>
      <article class="stat-card"><div class="stat-label">Összes fizetendő</div><div class="stat-value">${formatCurrency(
  (latestStatement && !latestStatement.is_paid
    ? (latestStatement.total_amount || latestStatement.rent_amount)
    : 0)
  + utilityTotal(latestUtilityByType)
)}</div></article>
    </section>
    <section class="grid-2 tenant-dashboard-grid">
      <article class="card">
        <div class="card-header">
          <div>
            <h3>Jelenlegi bérlemény</h3>
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
        <div style="margin-top:16px">${renderStatementsTable(data.statements.slice(0, 4))}</div>
      </article>
    </section>
  `;
}

function getLatestUtilityByType(utilityBills) {
  return utilityBills.reduce((accumulator, bill) => {
    if (!accumulator[bill.utility_type]) {
      accumulator[bill.utility_type] = bill;
      return accumulator;
    }

    const current = new Date(accumulator[bill.utility_type].period_start || accumulator[bill.utility_type].created_at).getTime();
    const candidate = new Date(bill.period_start || bill.created_at).getTime();
    if (candidate > current) {
      accumulator[bill.utility_type] = bill;
    }
    return accumulator;
  }, { electric: null, water: null, gas: null });
}

function utilityTotal(latestUtilityByType) {
  return Object.values(latestUtilityByType).reduce((total, bill) => {
    if (!bill || bill.is_paid) return total;
    return total + (Number(bill.total_amount) || 0);
  }, 0);
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
