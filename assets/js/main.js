/* Boot: load the single JSON config, render both views, wire the switch. */

import { renderDoc } from './doc-view.js';
import { createMapView } from './map/map-view.js';

const VIEW_KEY = 'ag-portfolio-view';
const CONFIG_URL = 'assets/data/portfolio.json';

const body = document.body;
let mapView = null;
let data = null;

/* ── View routing ─────────────────────────────────────────── */

function readRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'doc' || hash === 'map') return hash;
  if (hash) return 'doc';                       // deep link like #experience
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'doc' || saved === 'map') return saved;
  } catch { /* private mode — fall through to the default */ }
  return 'map';
}

async function setView(view, { push = true } = {}) {
  // Building the world takes real work. Stay on the loading state until it is
  // ready rather than flashing an empty canvas.
  if (view === 'map' && !mapView) {
    body.dataset.view = 'loading';
    await ensureMap();
  }

  body.dataset.view = view;
  document.querySelectorAll('.view-switch__btn').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.goto === view));
  });

  try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }

  if (view === 'map') {
    mapView?.activate();
    document.documentElement.style.overflow = 'hidden';
  } else {
    mapView?.deactivate();
    document.documentElement.style.overflow = '';
  }

  if (push) {
    const target = view === 'map' ? '#/map' : '#/doc';
    const current = location.hash;
    const isViewRoute = current === '' || current === '#/map' || current === '#/doc' || current === '#map' || current === '#doc';
    if (current !== target && isViewRoute) history.replaceState(null, '', target);
  }
}

let mapBuild = null;

function ensureMap() {
  if (!data) return Promise.resolve();
  if (!mapBuild) {
    mapBuild = createMapView(data, { onSwitchToDoc: () => setView('doc') })
      .then(view => { mapView = view; });
  }
  return mapBuild;
}

/* ── Document-view behaviours ─────────────────────────────── */

function wireDocChrome() {
  const burger = document.getElementById('burger');
  const navLinks = document.getElementById('nav-links');
  const nav = document.getElementById('nav');

  burger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  window.addEventListener('scroll', () => {
    nav.classList.toggle('is-stuck', window.scrollY > 10);
  }, { passive: true });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }, { threshold: 0.08 });

  const fade = (selector, stagger) => {
    document.querySelectorAll(selector).forEach((node, i) => {
      node.classList.add('fade-in');
      if (stagger) node.style.transitionDelay = `${i * stagger}ms`;
      observer.observe(node);
    });
  };
  fade('.metric', 65);
  fade('.timeline__item', 80);
  fade('.skill-group', 55);
  fade('.cert-card', 80);
  fade('.project-card', 80);
}

/* ── Boot ─────────────────────────────────────────────────── */

function fail(message) {
  const box = document.getElementById('boot-error');
  box.hidden = false;
  box.textContent = message;
  // Distinct from 'error', which is the in-game 500 page.
  body.dataset.view = 'boot-error';
}

async function boot() {
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    fail(
      `Could not load ${CONFIG_URL} (${err.message}). ` +
      'This page renders from a JSON config, so it needs to be served over HTTP — ' +
      'try `python3 -m http.server` rather than opening the file directly.',
    );
    return;
  }

  document.title = `${data.meta.name} — ${data.meta.title}`;
  renderDoc(data);
  wireDocChrome();

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.goto));
  });

  window.addEventListener('hashchange', () => setView(readRoute(), { push: false }));
  await setView(readRoute(), { push: false });

  // Deep links like #experience should land on the section, not the map.
  const deep = location.hash.replace(/^#\/?/, '');
  if (deep && deep !== 'map' && deep !== 'doc') {
    document.getElementById(deep)?.scrollIntoView();
  }
}

boot();
