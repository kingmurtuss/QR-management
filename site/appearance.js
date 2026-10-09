/* Shared appearance preference. Business logic and account state stay in each app. */
(() => {
  'use strict';
  const key = 'yam-appearance';
  const root = document.documentElement;
  let theme = 'dark';
  try { const saved = localStorage.getItem(key); if (saved === 'light' || saved === 'dark') theme = saved; } catch {}
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
  const moon = '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>';
  function apply(next) {
    theme = next;
    root.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#171914' : '#f3ece2';
    const button = document.getElementById('appearance-toggle');
    if (button) {
      const target = next === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', `Switch to ${target} theme`);
      button.setAttribute('aria-pressed', String(next === 'light'));
      button.title = `Switch to ${target} theme`;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${target === 'light' ? sun : moon}</svg><span>${target === 'light' ? 'Light' : 'Dark'} mode</span>`;
    }
  }
  apply(theme);
  function mount() {
    const button = document.createElement('button');
    button.id = 'appearance-toggle';
    button.className = 'appearance-toggle';
    button.type = 'button';
    button.addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, theme); } catch {}
    });
    document.body.append(button);
    apply(theme);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
  window.addEventListener('storage', event => {
    if (event.key === key) apply(event.newValue === 'light' ? 'light' : 'dark');
  });
})();
