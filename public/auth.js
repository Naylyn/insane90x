// auth.js
// Handles: login form, session persistence/caching, logout, and the
// Manage Users panel. Same proven pattern as Home Hub and Bin & Closet Tags.
//
// Session caching behavior: supabase-js stores the login session in the
// browser's localStorage and silently refreshes it in the background as
// long as it is still valid. That is what makes a device stay "recognized"
// across visits with no login prompt.
//
// Session EXPIRY: Supabase's own "Time-box user sessions" setting requires
// the Pro plan. On the free plan, this file enforces the same idea itself:
// it stamps the device with the date it signed in, and on every visit
// checks whether SESSION_MAX_AGE_DAYS has passed. If so, it signs the
// device out and shows the login form again, even though the underlying
// Supabase session might technically still be valid.
const SESSION_MAX_AGE_DAYS = 30;
const LOGIN_TIMESTAMP_KEY = 'household_login_at';

const sb = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

let currentSession = null;

function isSessionExpired() {
  const loginAt = localStorage.getItem(LOGIN_TIMESTAMP_KEY);
  if (!loginAt) return false;
  const elapsedMs = Date.now() - parseInt(loginAt, 10);
  return elapsedMs > SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function markLoginIfNeeded() {
  if (!localStorage.getItem(LOGIN_TIMESTAMP_KEY)) {
    localStorage.setItem(LOGIN_TIMESTAMP_KEY, Date.now().toString());
  }
}

function clearLoginTimestamp() {
  localStorage.removeItem(LOGIN_TIMESTAMP_KEY);
}

function showLoginGate(message) {
  document.getElementById('login-gate').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  const err = document.getElementById('login-error');
  if (message) {
    err.textContent = message;
    err.style.display = 'block';
  } else {
    err.style.display = 'none';
  }
}

function showApp() {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  const emailTag = document.getElementById('current-user-email');
  if (emailTag && currentSession) emailTag.textContent = currentSession.user.email;
}

function initAuth(onSignedIn, onSignedOut) {
  async function handleSession(session) {
    currentSession = session;
    if (session) {
      markLoginIfNeeded();
      if (isSessionExpired()) {
        clearLoginTimestamp();
        await sb.auth.signOut();
        return;
      }
      showApp();
      onSignedIn(session);
    } else {
      showLoginGate();
      if (onSignedOut) onSignedOut();
    }
  }

  sb.auth.getSession().then(({ data: { session } }) => handleSession(session));
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') clearLoginTimestamp();
    handleSession(session);
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'Log In';
    if (error) showLoginGate(error.message);
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await sb.auth.signOut();
    });
  }

  const manageBtn = document.getElementById('btn-manage-users');
  const manageBackdrop = document.getElementById('manage-users-backdrop');
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      manageBackdrop.classList.add('open');
      document.getElementById('new-user-status').textContent = '';
    });
  }
  const manageCancel = document.getElementById('manage-users-cancel');
  if (manageCancel) {
    manageCancel.addEventListener('click', () => manageBackdrop.classList.remove('open'));
  }
  const newUserForm = document.getElementById('new-user-form');
  if (newUserForm) {
    newUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('new-user-email').value.trim();
      const password = document.getElementById('new-user-password').value;
      const status = document.getElementById('new-user-status');
      status.textContent = 'Creating login...';
      status.style.color = '';
      const { data, error } = await sb.functions.invoke('admin-create-user', {
        body: { email, password }
      });
      if (error || (data && data.error)) {
        status.textContent = (data && data.error) || error.message || 'Could not create login.';
        status.style.color = '#a13d2e';
      } else {
        status.textContent = `Login created for ${email}.`;
        status.style.color = '#2f6b4f';
        newUserForm.reset();
      }
    });
  }
}
