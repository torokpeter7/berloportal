import { ensureAdminOrRedirect } from './app.js';
import { getAppSettings, saveAppSettings } from './data.js';
import { getSupabaseConfig, setSupabaseConfig, resetSupabaseClient } from '../config/supabase.js';
import { escapeHtml, setLoadingState, showToast } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  const allowed = await ensureAdminOrRedirect(profile);
  if (!allowed) return;

  document.title = 'Beállítások - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Beállítások';

  setLoadingState(root, 'Beállítások betöltése...');

  try {
    const settings = await getAppSettings();
    const supabaseConfig = getSupabaseConfig();
    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Admin beállítások</p>
          <h2>Rendszer és alapadatok.</h2>
          <p>Állítsd be az üzleti alapadatokat és kezeld a helyi Supabase konfigurációt.</p>
        </div>
      </section>
      <section class="grid-2">
        <article class="card">
          <div class="card-header"><div><h3>Alkalmazás beállítások</h3><p>Általános üzleti paraméterek.</p></div></div>
          <form id="settings-form" class="form-grid form-columns-2">
            <input type="hidden" name="id" value="${settings?.id || ''}">
            <label class="form-field"><span>Cég / rendszer neve</span><input type="text" name="company_name" value="${escapeHtml(settings?.company_name || 'Albérletkezelő')}" required></label>
            <label class="form-field"><span>Valuta</span><input type="text" name="currency" value="${escapeHtml(settings?.currency || 'HUF')}" required></label>
            <label class="form-field"><span>Fizetési határnap</span><input type="number" name="due_day" value="${settings?.due_day || 10}" min="1" max="31"></label>
            <label class="form-field"><span>Kapcsolati e-mail</span><input type="email" name="contact_email" value="${escapeHtml(settings?.contact_email || '')}"></label>
            <label class="form-field"><span>Kapcsolati telefon</span><input type="text" name="contact_phone" value="${escapeHtml(settings?.contact_phone || '')}"></label>
            <label class="form-field"><span>Fizetési megjegyzés</span><textarea name="payment_note" rows="4">${escapeHtml(settings?.payment_note || '')}</textarea></label>
            <div class="modal-footer" style="grid-column:1 / -1; justify-content:flex-start">
              <button class="btn btn-primary" type="submit">Mentés</button>
            </div>
          </form>
        </article>
        <article class="card">
          <div class="card-header"><div><h3>Supabase lokális konfiguráció</h3><p>A böngészőben tárolt kapcsolati adatok.</p></div></div>
          <div class="metric-list">
            <div class="metric-item"><span>Project URL</span><strong>${escapeHtml(supabaseConfig.url || '-')}</strong></div>
            <div class="metric-item"><span>Anon key</span><strong>${supabaseConfig.anonKey ? 'Elmentve' : 'Nincs megadva'}</strong></div>
          </div>
          <div class="page-actions" style="margin-top:16px">
            <button class="btn btn-secondary" type="button" data-copy-config><i class="fa-solid fa-copy"></i> Konfig másolása</button>
            <button class="btn btn-danger" type="button" data-reset-cache><i class="fa-solid fa-broom"></i> Helyi adatok törlése</button>
          </div>
        </article>
      </section>
    `;

    wireSettingsForm(profile, settings, notify);
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function wireSettingsForm(profile, settings, notify) {
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await saveAppSettings(payload);
      notify('Beállítások mentve.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}
