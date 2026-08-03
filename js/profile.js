import { updateCurrentUser } from './auth.js';
import { getSupabaseClient } from '../config/supabase.js';
import { escapeHtml, setLoadingState } from './utils.js';

export async function renderPage({ root, profile, notify }) {
  document.title = 'Profil - Albérletkezelő';
  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode) titleNode.textContent = 'Profil';

  setLoadingState(root, 'Profil betöltése...');

  try {
    root.innerHTML = `
      <section class="page-section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Saját profil</p>
          <h2>Fiók és kapcsolat adatok.</h2>
          <p>Itt módosíthatod a saját nevedet, telefonszámodat, e-mail címedet és jelszavadat.</p>
        </div>
      </section>
      <section class="grid-2">
        <article class="card">
          <div class="card-header"><div><h3>Profil adatok</h3><p>A profil rekord közvetlen szerkesztése.</p></div></div>
          <form id="profile-form" class="form-grid">
            <label class="form-field"><span>Teljes név</span><input type="text" name="full_name" value="${escapeHtml(profile.full_name || '')}" required></label>
            <label class="form-field"><span>Telefon</span><input type="text" name="phone" value="${escapeHtml(profile.phone || '')}"></label>
            <label class="form-field"><span>E-mail</span><input type="email" name="email" value="${escapeHtml(profile.email || '')}"></label>
            <button class="btn btn-primary" type="submit">Profil mentése</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header"><div><h3>Biztonság</h3><p>Jelszó és Supabase Auth adatok.</p></div></div>
          <form id="security-form" class="form-grid">
            <label class="form-field"><span>Új jelszó</span><input type="password" name="password" minlength="6"></label>
            <label class="form-field"><span>Jelszó megerősítése</span><input type="password" name="password_confirm" minlength="6"></label>
            <button class="btn btn-primary" type="submit">Jelszó módosítása</button>
          </form>
        </article>
      </section>
      <section class="page-section">
        <div class="card-header"><div><h3>Fiók összegzés</h3><p>Aktuális jogosultságok és állapot.</p></div></div>
        <div class="metric-list">
          <div class="metric-item"><span>Szerepkör</span><strong>${profile.role === 'admin' ? 'Admin' : 'Albérlő'}</strong></div>
          <div class="metric-item"><span>Állapot</span><strong>${profile.is_active ? 'Aktív' : 'Inaktív'}</strong></div>
          <div class="metric-item"><span>E-mail</span><strong>${escapeHtml(profile.email || '-')}</strong></div>
        </div>
      </section>
    `;

    wireProfileForms(profile, notify);
  } catch (error) {
    root.innerHTML = `<section class="page-section"><div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Hiba történt</h3><p>${escapeHtml(error.message)}</p></div></section>`;
    notify(error.message, 'error');
  }
}

function wireProfileForms(profile, notify) {
  const profileForm = document.getElementById('profile-form');
  const securityForm = document.getElementById('security-form');

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(profileForm).entries());
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('profiles').update({
        full_name: payload.full_name,
        phone: payload.phone,
        email: payload.email,
      }).eq('id', profile.id);
      if (error) throw error;
      await updateCurrentUser({ email: payload.email, metadata: { full_name: payload.full_name, phone: payload.phone } });
      notify('Profil frissítve.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  securityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(securityForm).entries());
    if (payload.password !== payload.password_confirm) {
      notify('A jelszavak nem egyeznek.', 'warning');
      return;
    }
    try {
      await updateCurrentUser({ password: payload.password });
      securityForm.reset();
      notify('Jelszó módosítva.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}
