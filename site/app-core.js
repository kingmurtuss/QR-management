/* QR Field Ops - Netlify + Supabase frontend */
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

let sb = null;
let session = null;
let profile = null;
let settings = null;
let reviewAiConfigured = false;
let cache = {
  profiles: [], qrs: [], businesses: [], withdrawals: [], tickets: [], appointments: [], logs: []
};
let currentPage = 'dashboard';
let pendingLocation = { latitude: null, longitude: null };
let authRun = 0;
let uiSaveTimer = null;
const UI_STATE_VERSION = 2;

const ADMIN_NAV = [
  ['dashboard', '▦', 'Dashboard'],
  ['workers', '👥', 'Workers'],
  ['qrs', '▣', 'QR Inventory'],
  ['businesses', '🏪', 'Businesses'],
  ['reviews', '✦', 'Review Assistant'],
  ['payouts', '₹', 'Payouts'],
  ['tickets', '🎫', 'Support Tickets'],
  ['appointments', '📅', 'Appointments'],
  ['settings', '⚙', 'Settings']
];
const WORKER_NAV = [
  ['dashboard', '▦', 'Dashboard'],
  ['onboard', '＋', 'Onboard Business'],
  ['qrs', '▣', 'My QR Cards'],
  ['businesses', '🏪', 'My Businesses'],
  ['reviews', '✦', 'Review Assistant'],
  ['earnings', '₹', 'Earnings'],
  ['tickets', '🎫', 'Support'],
  ['appointments', '📅', 'Appointments']
];

function esc(v = '') {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function money(v) { return `₹${Number(v || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}`; }
function dt(v) { if (!v) return '—'; return new Date(v).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'}); }
function d(v) { if (!v) return '—'; return new Date(v).toLocaleDateString('en-IN', {dateStyle:'medium'}); }
function statusBadge(s) { return `<span class="status ${esc(s || 'disabled')}">${esc(s || '—')}</span>`; }
function initials(name='User') { return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'U'; }
function isAdmin() { return profile?.role === 'admin'; }

function allowedPages() {
  return (isAdmin() ? ADMIN_NAV : WORKER_NAV).map(([id]) => id);
}
function uiStateKey() {
  return `qr-field-ops-ui-v${UI_STATE_VERSION}:${session?.user?.id || 'guest'}`;
}
function readUiState() {
  if (!session?.user?.id) return {};
  try { return JSON.parse(localStorage.getItem(uiStateKey()) || '{}') || {}; }
  catch { return {}; }
}
function persistUiState(extra = {}) {
  if (!session?.user?.id || !profile) return;
  const prev = readUiState();
  const scroll = { ...(prev.scroll || {}) };
  scroll[currentPage] = Math.max(0, Math.round(window.scrollY || 0));
  const next = { ...prev, page: currentPage, scroll, updatedAt: Date.now(), ...extra };
  try { localStorage.setItem(uiStateKey(), JSON.stringify(next)); } catch {}
}
function rememberCurrentView() {
  clearTimeout(uiSaveTimer);
  persistUiState();
}
function isDeletableQr(q) {
  return Boolean(q && q.status === 'available' && !q.worker_id && !q.business_id && !q.assigned_at && Number(q.scan_count || 0) === 0);
}

function redirectLegacyHashQr() {
  const hash = String(location.hash || '');
  const match = hash.match(/^#\/?(QR\d{5,})$/i);
  if (!match) return false;
  const code = match[1].toUpperCase();
  location.replace(`/qr/${encodeURIComponent(code)}`);
  return true;
}

function normalizeQrBase(raw) {
  const fallback = `${location.origin}/qr/`;
  let base = String(raw || '').trim();
  if (!base || base.includes('#')) return fallback;
  try {
    const url = new URL(base, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    base = url.toString();
  } catch {
    return fallback;
  }
  return base.endsWith('/') ? base : `${base}/`;
}

function qrBase() {
  return normalizeQrBase(settings?.qr_base_url);
}
function qrUrl(code) { return `${qrBase()}${encodeURIComponent(code)}`; }
function findProfile(id) { return cache.profiles.find(x => x.id === id); }
function workerName(id) { return findProfile(id)?.name || (id === profile?.id ? profile?.name : '—'); }
function toast(message, type='') {
  const el = $('#toast'); el.textContent = message; el.className = `toast ${type}`;
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 3500);
}
function showBoot(message='Connecting securely…') {
  $('#boot-message').textContent = message;
  $('#boot-screen').classList.remove('hidden');
  $('#login-screen').classList.add('hidden');
  $('#app-screen').classList.add('hidden');
}
function showLogin(error='') {
  $('#boot-screen').classList.add('hidden');
  $('#app-screen').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  const box = $('#login-error');
  if (error) { box.textContent = error; box.classList.remove('hidden'); }
  else box.classList.add('hidden');
}
function showApp() {
  $('#boot-screen').classList.add('hidden');
  $('#login-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
}

async function loadPublicConfig() {
  const res = await fetch('/.netlify/functions/public-config', {cache:'no-store'});
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.supabaseUrl || !data.supabasePublishableKey) {
    throw new Error(data.error || 'Netlify environment variables are not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }
  return data;
}

async function init() {
  if (redirectLegacyHashQr()) return;
  try {
    showBoot('Loading secure configuration…');
    const cfg = await loadPublicConfig();
    reviewAiConfigured = cfg.reviewAiConfigured === true;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        storage: window.localStorage,
        storageKey: 'qr-field-ops-auth'
      }
    });

    sb.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        setTimeout(() => { session = null; profile = null; showLogin(); }, 0);
        return;
      }
      if (nextSession && ['TOKEN_REFRESHED','USER_UPDATED'].includes(event)) {
        session = nextSession;
        return;
      }
      if (nextSession && ['INITIAL_SESSION','SIGNED_IN'].includes(event)) {
        setTimeout(() => {
          if (profile?.id === nextSession.user.id && !$('#app-screen').classList.contains('hidden')) {
            session = nextSession;
            return;
          }
          handleAuthenticatedSession(nextSession);
        }, 0);
      }
    });

    showBoot('Restoring your session…');
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data.session) await handleAuthenticatedSession(data.session);
    else showLogin();
  } catch (err) {
    console.error(err);
    showLogin(err.message || 'Could not start the application.');
  }
}

async function handleAuthenticatedSession(nextSession) {
  if (profile?.id === nextSession?.user?.id && !$('#app-screen').classList.contains('hidden')) {
    session = nextSession;
    return;
  }
  const run = ++authRun;
  session = nextSession;
  showBoot('Loading your workspace…');

  let p = null;
  let pErr = null;
  for (let i = 0; i < 4; i++) {
    const r = await sb.from('profiles').select('id,role,name,email,phone,active,created_at').eq('id', session.user.id).maybeSingle();
    p = r.data; pErr = r.error;
    if (p || pErr) break;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  if (run !== authRun) return;
  if (pErr) {
    console.error(pErr);
    showLogin(`Google login succeeded, but your profile could not be loaded: ${pErr.message}`);
    return;
  }
  if (!p) {
    showLogin('Login succeeded, but this account has no profile row. Run supabase_setup.sql and sign in again.');
    return;
  }
  if (session.user.app_metadata?.account_type === 'restaurant_manager') {
    location.replace('/restaurants/?manager=1');
    return;
  }
  if (p.active === false) {
    await sb.auth.signOut();
    showLogin('This account is disabled. Contact your administrator.');
    return;
  }
  profile = p;

  if (location.hash && /access_token|refresh_token|error/.test(location.hash)) {
    history.replaceState({}, document.title, location.pathname + location.search);
  }

  try {
    await refreshAll(false);
    if (run !== authRun) return;
    buildShell();
    showApp();
    const savedUi = readUiState();
    const restoredPage = allowedPages().includes(savedUi.page) ? savedUi.page : 'dashboard';
    navigate(restoredPage, { restoreScroll: true, skipRemember: true });
  } catch (err) {
    console.error(err);
    showLogin(`Signed in, but application data could not load: ${err.message}`);
  }
}

async function signInGoogle() {
  $('#login-error').classList.add('hidden');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/` }
  });
  if (error) showLogin(error.message);
}

async function signInEmail(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) showLogin(error.message);
}

async function logout() {
  showBoot('Signing out…');
  try { localStorage.removeItem(uiStateKey()); } catch {}
  await sb.auth.signOut({scope:'local'});
  location.replace('/');
}

function buildShell() {
  const nav = isAdmin() ? ADMIN_NAV : WORKER_NAV;
  $('#nav').innerHTML = nav.map(([id,icon,label]) => `<button class="nav-btn" data-page="${id}"><span class="nav-icon">${icon}</span>${esc(label)}</button>`).join('');
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
  $('#user-name').textContent = profile.name || 'User';
  $('#user-email').textContent = profile.email || session.user.email || '';
  $('#user-avatar').textContent = initials(profile.name || session.user.email);
  $('#role-badge').textContent = profile.role;
  $('#brand-role').textContent = isAdmin() ? 'Admin workspace' : 'Field worker workspace';
  $('#brand-company').textContent = settings?.company_name || 'QR Field Ops';
}

async function refreshAll(notify=true) {
  if (!sb || !profile) return;
  const settingRes = await sb.from('settings').select('*').eq('id', true).maybeSingle();
  if (settingRes.error) throw settingRes.error;
  settings = settingRes.data || {commission_rate:100, company_name:'QR Field Ops', qr_base_url:`${location.origin}/qr/`};

  const queries = isAdmin() ? [
    sb.from('profiles').select('id,role,name,email,phone,active,created_at').order('created_at', {ascending:true}),
    sb.from('qr_codes').select('*').order('created_at', {ascending:false}),
    sb.from('businesses').select('*').order('created_at', {ascending:false}),
    sb.from('withdrawals').select('*').order('created_at', {ascending:false}),
    sb.from('tickets').select('*').order('created_at', {ascending:false}),
    sb.from('appointments').select('*').order('created_at', {ascending:false}),
    sb.from('activity_logs').select('*').order('created_at', {ascending:false}).limit(100)
  ] : [
    sb.from('profiles').select('id,role,name,email,phone,active,created_at').eq('id', profile.id),
    sb.from('qr_codes').select('*').eq('worker_id', profile.id).order('created_at', {ascending:false}),
    sb.from('businesses').select('*').eq('worker_id', profile.id).order('created_at', {ascending:false}),
    sb.from('withdrawals').select('*').eq('worker_id', profile.id).order('created_at', {ascending:false}),
    sb.from('tickets').select('*').eq('worker_id', profile.id).order('created_at', {ascending:false}),
    sb.from('appointments').select('*').eq('worker_id', profile.id).order('created_at', {ascending:false}),
    Promise.resolve({data:[],error:null})
  ];

  const [profilesR,qrsR,businessesR,withdrawalsR,ticketsR,appointmentsR,logsR] = await Promise.all(queries);
  for (const r of [profilesR,qrsR,businessesR,withdrawalsR,ticketsR,appointmentsR,logsR]) if (r.error) throw r.error;
  cache = {
    profiles: profilesR.data || [], qrs: qrsR.data || [], businesses: businessesR.data || [],
    withdrawals: withdrawalsR.data || [], tickets: ticketsR.data || [], appointments: appointmentsR.data || [], logs: logsR.data || []
  };
  if (!isAdmin()) cache.profiles = [profile];
  $('#brand-company').textContent = settings.company_name || 'QR Field Ops';
  if (notify) toast('Data refreshed', 'success');
}

function navigate(page, { restoreScroll = false, skipRemember = false } = {}) {
  if (!skipRemember) rememberCurrentView();
  const validPages = allowedPages();
  const nextPage = validPages.includes(page) ? page : 'dashboard';
  const savedBefore = readUiState();
  const restoreY = restoreScroll ? Number(savedBefore.scroll?.[nextPage] || 0) : 0;
  currentPage = nextPage;
  if (session?.user?.id && profile) {
    const scroll = { ...(savedBefore.scroll || {}) };
    if (!restoreScroll) scroll[currentPage] = 0;
    try { localStorage.setItem(uiStateKey(), JSON.stringify({ ...savedBefore, page: currentPage, scroll, updatedAt: Date.now() })); } catch {}
  }
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === currentPage));
  $('#sidebar').classList.remove('open');
  const titles = {
    dashboard:['Dashboard','Overview of your field operations'], workers:['Workers','Accounts, roles and performance'],
    qrs:[isAdmin()?'QR Inventory':'My QR Cards','Permanent dynamic QR inventory'], businesses:[isAdmin()?'Businesses':'My Businesses','Onboarded business records'],
    reviews:['Review Assistant','Optional AI review and reply tools'],
    payouts:['Payouts','Worker withdrawal requests'], tickets:['Support Tickets','Worker support and responses'],
    appointments:['Appointments','Sales and service follow-ups'], settings:['Settings','Company, commission and QR configuration'],
    onboard:['Onboard Business','Assign an available QR to a new client'], earnings:['Earnings','Commission and withdrawal history']
  };
  const [title,sub] = titles[currentPage] || ['QR Field Ops',''];
  $('#page-title').textContent = title; $('#page-subtitle').textContent = sub;
  renderPage();
  requestAnimationFrame(() => {
    window.scrollTo({ top: Number.isFinite(restoreY) ? restoreY : 0, left: 0, behavior: 'auto' });
  });
}

function renderPage() {
  const page = $('#page');
  try {
    if (currentPage === 'dashboard') page.innerHTML = renderDashboard();
    else if (currentPage === 'workers') page.innerHTML = renderWorkers();
    else if (currentPage === 'qrs') page.innerHTML = renderQrs();
    else if (currentPage === 'businesses') page.innerHTML = renderBusinesses();
    else if (currentPage === 'reviews') page.innerHTML = renderReviewAssistant();
    else if (currentPage === 'onboard') page.innerHTML = renderOnboard();
    else if (currentPage === 'earnings') page.innerHTML = renderEarnings();
    else if (currentPage === 'payouts') page.innerHTML = renderPayouts();
    else if (currentPage === 'tickets') page.innerHTML = renderTickets();
    else if (currentPage === 'appointments') page.innerHTML = renderAppointments();
    else if (currentPage === 'settings') page.innerHTML = renderSettings();
    wirePage();
    if (currentPage === 'reviews') wireReviewAssistant();
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="alert error">Could not render this page: ${esc(err.message)}</div>`;
  }
}
