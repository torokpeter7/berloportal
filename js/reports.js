import { getAppSettings } from './data.js';
import { escapeHtml, setLoadingState } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  document.title = 'Hibabejelentés - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Hibabejelentés';

  setLoadingState(root, 'Hibabejelentés betöltése...');

  try {
    const settings = await getAppSettings();
    const websitePhone = settings?.website_contact_phone || settings?.contact_phone || '+36 30 965 4445';
    const apartmentPhone = settings?.apartment_contact_phone || settings?.contact_phone || '+36 20 289 8222';
    const email = settings?.contact_email || 'torokpeter16@icloud.com';

    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Segítség és kapcsolat</p>
          <h2>Hibabejelentés</h2>
          <p>Válaszd ki, milyen problémát szeretnél jelezni.</p>
        </div>
      </section>
      <section class="grid-2" data-report-options>
        <article class="card">
          <div class="card-header">
            <div>
              <h3>Weboldallal kapcsolatos hibabejelentés</h3>
              <p>Ha a portállal vagy annak működésével kapcsolatban tapasztalsz hibát.</p>
            </div>
            <i class="fa-solid fa-globe card-header-icon"></i>
          </div>
          <button class="btn btn-primary" type="button" data-report-option="website">Elérhetőségek megjelenítése</button>
          <div class="metric-list hidden" data-report-details="website">
            <div class="metric-item"><span>Telefonszám</span><strong>${escapeHtml(websitePhone)}</strong></div>
            <div class="metric-item"><span>E-mail-cím</span><strong>${escapeHtml(email)}</strong></div>
          </div>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3>Albérlettel kapcsolatos hibabejelentés</h3>
              <p>Ha az albérlettel vagy a lakásban tapasztalt problémával kapcsolatban szeretnél jelezni.</p>
            </div>
            <i class="fa-solid fa-house-chimney card-header-icon"></i>
          </div>
          <button class="btn btn-primary" type="button" data-report-option="apartment">Telefonszám megjelenítése</button>
          <div class="metric-list hidden" data-report-details="apartment">
            <div class="metric-item"><span>Telefonszám</span><strong>${escapeHtml(apartmentPhone)}</strong></div>
          </div>
        </article>
      </section>
    `;

    root.querySelectorAll('[data-report-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const details = root.querySelector(`[data-report-details="${button.dataset.reportOption}"]`);
        details?.classList.toggle('hidden');
        button.textContent = details?.classList.contains('hidden')
          ? button.dataset.reportOption === 'website' ? 'Elérhetőségek megjelenítése' : 'Telefonszám megjelenítése'
          : 'Elérhetőségek elrejtése';
      });
    });
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Nem sikerült betölteni a kapcsolatadatokat</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}
