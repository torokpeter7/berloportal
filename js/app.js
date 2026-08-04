import { hasSupabaseConfig, getSupabaseConfig, setSupabaseConfig, resetSupabaseClient } from '../config/supabase.js';
import { qs, qsa, showToast, escapeHtml } from './utils.js';
import { getCurrentProfile, requireSession, requireActiveProfile, signInWithPassword, signUpWithPassword, signOut, updateCurrentUser, isAdmin } from './auth.js';

const PAGE_MODULES = {
  dashboard: () => import('./dashboard.js'),
  apartments: () => import('./apartments.js'),
  tenants: () => import('./tenants.js'),
  billing: () => import('./billing.js'),
  documents: () => import('./documents.js'),
  notifications: () => import('./notifications.js'),
  profile: () => import('./profile.js'),
  settings: () => import('./settings.js'),
};

const NAV_ITEMS = [
  { page: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard', role: 'all' },
  { page: 'apartments', icon: 'fa-building', label: 'Albérletek', role: 'admin' },
  { page: 'tenants', icon: 'fa-users', label: 'Albérlők', role: 'admin' },
  { page: 'billing', icon: 'fa-file-invoice-dollar', label: 'Havi elszámolás', role: 'all' },
  { page: 'documents', icon: 'fa-file-pdf', label: 'Dokumentumok', role: 'all' },
  { page: 'notifications', icon: 'fa-bell', label: 'Értesítések', role: 'all' },
  { page: 'profile', icon: 'fa-user-gear', label: 'Profil', role: 'all' },
  { page: 'settings', icon: 'fa-gear', label: 'Beállítások', role: 'admin' },
];

const state = {
  profile: null,
  session: null,
  page: document.body.dataset.page || 'login',
};

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((error) => {
    console.error(error);
    showToast(error.message || 'Ismeretlen hiba történt.', 'error');
  });
});

async function bootstrap() {
  if (state.page === 'login') {
    renderLoginPage();
    await wireLoginInteractions();
    return;
  }

  if (!hasSupabaseConfig()) {
    window.location.href = './login.html?setup=1';
    return;
  }

  state.session = await requireSession();
  state.profile = await requireActiveProfile();
  if (!state.profile) return;

  await renderAppShell();
  await loadCurrentPage();
  await wireGlobalActions();
}

function renderLoginPage() {
  const app = qs('#app');
  const config = getSupabaseConfig();
  app.innerHTML = `
    <main class="auth-layout">
      <section class="auth-hero">
        <div class="auth-badge"><i class="fa-solid fa-house-chimney-window"></i> Albérletkezelő</div>
        <h1>Albérletkezelő</h1>
        <p>Albérleteddel kapcsolatos dolgok egy helyen.</p>
        <div class="auth-points">
          <div><i class="fa-solid fa-chart-line"></i> Pénzügyi dashboard</div>
          <div><i class="fa-solid fa-folder-tree"></i> Dokumentumkezelés</div>
        </div>
      </section>
      <section class="auth-card">
        <div class="auth-card-head">
          <h2>Bejelentkezés</h2>
        </div>
        <form id="login-form" class="form-grid">
          <label class="form-field">
            <span>E-mail</span>
            <input type="email" name="email" placeholder="admin@pelda.hu" required>
          </label>
          <label class="form-field">
            <span>Jelszó</span>
            <input type="password" name="password" placeholder="••••••••" required>
          </label>
          <div class="auth-actions">
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-right-to-bracket"></i> Belépés</button>
          </div>
        </form>

        <form id="register-form" class="form-grid hidden">
          <label class="form-field">
            <span>Teljes név</span>
            <input type="text" name="fullName" placeholder="Kovács Anna" required>
          </label>
          <label class="form-field">
            <span>E-mail</span>
            <input type="email" name="email" placeholder="anna@pelda.hu" required>
          </label>
          <label class="form-field">
            <span>Jelszó</span>
            <input type="password" name="password" minlength="6" placeholder="Legalább 6 karakter" required>
          </label>
          <label class="form-field">
            <span>Telefon</span>
            <input type="text" name="phone" placeholder="+36 20 123 4567">
          </label>
          <div class="auth-actions">
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-user-plus"></i> Fiók létrehozása</button>
            <button class="btn btn-secondary" type="button" id="toggle-login">Vissza</button>
          </div>
        </form>

        <form id="supabase-config-form" class="setup-panel ${hasSupabaseConfig() ? 'hidden' : ''}">
          <h3>Supabase kapcsolati adatok</h3>
          <p>Első használatkor itt add meg a projekt URL-jét és anon kulcsát. A böngésző megjegyzi helyileg.</p>
          <label class="form-field">
            <span>Project URL</span>
            <input type="url" name="url" value="${escapeHtml(config.url)}" placeholder="https://xxxx.supabase.co" required>
          </label>
          <label class="form-field">
            <span>Anon key</span>
            <textarea name="anonKey" rows="4" placeholder="eyJ..." required>${escapeHtml(config.anonKey)}</textarea>
          </label>
          <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Mentés</button>
        </form>
      </section>
    </main>
  `;
}

async function wireLoginInteractions() {
  const loginForm = qs('#login-form');
  const registerForm = qs('#register-form');
  const configForm = qs('#supabase-config-form');
  const toggleRegister = qs('#toggle-register');
  const toggleLogin = qs('#toggle-login');

  toggleRegister?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  });

  toggleLogin?.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  configForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(configForm);
    setSupabaseConfig(formData.get('url'), formData.get('anonKey'));
    await resetSupabaseClient();
    showToast('Supabase kapcsolati adatok elmentve.', 'success');
    setTimeout(() => window.location.reload(), 300);
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      await signInWithPassword(formData.get('email'), formData.get('password'));
      showToast('Sikeres belépés.', 'success');
      window.location.href = './dashboard.html';
    } catch (error) {
      const message = normalizeAuthError(error);
      showToast(message, 'error');
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    try {
      await signUpWithPassword({
        email: formData.get('email'),
        password: formData.get('password'),
        fullName: formData.get('fullName'),
        phone: formData.get('phone'),
        role: 'tenant',
      });
      showToast('Fiók létrehozva. Ha az e-mail megerősítés aktív, ellenőrizd a leveleket.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function normalizeAuthError(error) {
  const rawMessage = String(error?.message || '');

  if (rawMessage.includes('Invalid login credentials')) {
    return 'Hibás e-mail vagy jelszó, vagy a Supabase-ben nincs még ilyen Auth-fiók. Ellenőrizd, hogy létrehoztad-e a felhasználót és be van-e fejezve az e-mail megerősítés.';
  }

  if (rawMessage.includes('Email not confirmed')) {
    return 'A fiók még nincs megerősítve. Nyisd meg a megerősítő e-mailt, vagy kapcsold ki az e-mail confirmationt a Supabase Auth beállításokban.';
  }

  return rawMessage || 'Ismeretlen hitelesítési hiba történt.';
}

async function renderAppShell() {
  const app = qs('#app');
  const sidebarMarkup = await fetch('../components/sidebar.html').then((response) => response.text());
  const navbarMarkup = await fetch('../components/navbar.html').then((response) => response.text());

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar"></aside>
      <button class="sidebar-backdrop" type="button" data-close-sidebar aria-label="Close menu"></button>
      <div class="content-shell">
        <header class="topbar" id="topbar"></header>
        <main class="page-main">
          <div class="page-inner" id="page-content"></div>
        </main>
      </div>
    </div>
    <div id="global-modal-root"></div>
    <div id="toast-container" class="toast-container"></div>
  `;

  qs('#sidebar').innerHTML = sidebarMarkup;
  qs('#topbar').innerHTML = navbarMarkup;
  updateUserBadge();
  wireSidebar();
  wireNavbar();
}

function updateUserBadge() {
  const nameNodes = qsa('[data-user-name]');
  const roleNodes = qsa('[data-user-role]');
  const avatarNodes = qsa('[data-user-avatar]');

  nameNodes.forEach((node) => {
    node.textContent = state.profile.full_name || state.profile.email || 'Felhasználó';
  });
  roleNodes.forEach((node) => {
    node.textContent = isAdmin(state.profile) ? 'Admin' : 'Albérlő';
  });
  avatarNodes.forEach((node) => {
    node.textContent = (state.profile.full_name || state.profile.email || 'U').trim().charAt(0).toUpperCase();
  });
}

function wireSidebar() {
  const currentPage = state.page;
  qsa('[data-nav-page]').forEach((link) => {
    const allowedRole = link.dataset.role;
    const targetPage = link.dataset.navPage;
    if (allowedRole === 'admin' && !isAdmin(state.profile)) {
      link.remove();
      return;
    }

    if (targetPage === currentPage) {
      link.classList.add('active');
    }

    link.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open');
      if (targetPage !== currentPage) {
        window.location.href = `./${targetPage}.html`;
      }
    });
  });
}

function wireNavbar() {
  qs('[data-logout]')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = './login.html';
  });

  qs('[data-mobile-menu]')?.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('sidebar-open');
    qs('[data-mobile-menu]')?.setAttribute('aria-expanded', String(isOpen));
  });

  qs('[data-close-sidebar]')?.addEventListener('click', closeSidebar);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  qs('[data-mobile-menu]')?.setAttribute('aria-expanded', 'false');
}

async function loadCurrentPage() {
  const loader = PAGE_MODULES[state.page];
  if (!loader) {
    return;
  }
  const module = await loader();
  if (typeof module.renderPage === 'function') {
    await module.renderPage({
      root: qs('#page-content'),
      profile: state.profile,
      session: state.session,
      refreshProfile: refreshProfile,
      notify: showToast,
    });
  }
}

async function refreshProfile() {
  state.profile = await getCurrentProfile();
  updateUserBadge();
}

async function wireGlobalActions() {
  qsa('[data-copy-config]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { url, anonKey } = getSupabaseConfig();
      await navigator.clipboard.writeText(`${url}\n${anonKey}`);
      showToast('A Supabase konfiguráció a vágólapra másolva.', 'success');
    });
  });

  qsa('[data-reset-cache]').forEach((button) => {
    button.addEventListener('click', async () => {
      localStorage.removeItem('alberlet_supabase_url');
      localStorage.removeItem('alberlet_supabase_anon_key');
      await resetSupabaseClient();
      showToast('A helyi Supabase konfiguráció törölve.', 'success');
    });
  });
}

export async function ensureAdminOrRedirect(profile = state.profile) {
  if (!isAdmin(profile)) {
    showToast('Ehhez a nézethez admin jogosultság szükséges.', 'warning');
    window.location.href = './dashboard.html';
    return false;
  }
  return true;
}

export async function getPageState() {
  return { ...state };
}

export function goto(page) {
  window.location.href = `./${page}.html`;
}

export { updateCurrentUser };
