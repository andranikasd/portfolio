/* Renders the plain, readable half of the portfolio from the same JSON. */

import { inline } from './text.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  mail: ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6 12 13 2 6'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  github: ['M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z'],
  linkedin: ['M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z', 'M2 9h4v12H2z', 'M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
};

const FILLED = new Set(['github', 'linkedin']);

function icon(name) {
  const paths = ICONS[name];
  if (!paths) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const filled = FILLED.has(name);
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  if (!filled) {
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function section(id, title, alt) {
  const s = el('section', `section${alt ? ' section--alt' : ''}`);
  s.id = id;
  const c = el('div', 'container');
  if (title) c.appendChild(el('h2', 'section__title', title));
  s.appendChild(c);
  return { section: s, container: c };
}

function externalAttrs(a, link) {
  if (link.download) a.setAttribute('download', '');
  else if (/^https?:/.test(link.url)) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
}

/* ── Sections ─────────────────────────────────────────────── */

function hero(data) {
  const header = el('header', 'hero');
  header.id = 'home';
  const c = el('div', 'container');
  c.append(
    el('p', 'hero__eyebrow', data.meta.title),
    el('h1', 'hero__name', data.meta.name),
    el('p', 'hero__tagline', data.meta.tagline),
  );

  const cta = el('div', 'hero__cta');
  const primary = el('a', 'btn btn--primary', 'Get in Touch');
  primary.href = '#contact';
  cta.appendChild(primary);
  for (const link of data.links.filter(l => l.icon === 'github' || l.icon === 'linkedin')) {
    const a = el('a', 'btn btn--ghost', link.label);
    a.href = link.url;
    externalAttrs(a, link);
    cta.appendChild(a);
  }
  const toMap = el('button', 'btn btn--map', '⚔ Explore the campaign map');
  toMap.type = 'button';
  toMap.dataset.goto = 'map';
  cta.appendChild(toMap);

  c.appendChild(cta);
  header.appendChild(c);
  return header;
}

function metrics(data) {
  if (!data.metrics?.length) return null;
  const wrap = el('div', 'metrics');
  const c = el('div', 'container');
  const grid = el('div', 'metrics__grid');
  for (const m of data.metrics) {
    const item = el('div', 'metric');
    item.append(el('span', 'metric__value', m.value), el('span', 'metric__label', m.label));
    grid.appendChild(item);
  }
  c.appendChild(grid);
  wrap.appendChild(c);
  return wrap;
}

function experience(data) {
  const { section: s, container } = section('experience', 'Experience');
  const list = el('ol', 'timeline');
  for (const e of data.experience) {
    const li = el('li', 'timeline__item');
    const head = el('div', 'timeline__header');
    const meta = el('div', 'timeline__meta');
    meta.append(el('h3', 'timeline__role', e.role), el('span', 'timeline__company', e.company));
    if (e.badge) meta.appendChild(el('span', 'timeline__badge', e.badge));
    head.append(meta, el('span', 'timeline__date', [e.period, e.duration, e.location].filter(Boolean).join(' · ')));

    const bullets = el('ul', 'timeline__bullets');
    for (const b of e.bullets || []) {
      const item = el('li');
      item.appendChild(inline(b));
      bullets.appendChild(item);
    }
    li.append(head, bullets);

    if (e.stack?.length) {
      const tags = el('ul', 'tag-list tag-list--inline');
      for (const t of e.stack) tags.appendChild(el('li', 'tag', t));
      li.appendChild(tags);
    }
    list.appendChild(li);
  }
  container.appendChild(list);
  return s;
}

function skills(data) {
  const { section: s, container } = section('skills', 'Skills', true);
  const grid = el('div', 'skills__grid');
  for (const g of data.skills) {
    const group = el('div', 'skill-group');
    group.appendChild(el('h3', 'skill-group__title', g.group));
    const tags = el('ul', 'tag-list');
    for (const t of g.tags) tags.appendChild(el('li', 'tag', t));
    group.appendChild(tags);
    grid.appendChild(group);
  }
  container.appendChild(grid);
  return s;
}

function certifications(data) {
  const { section: s, container } = section('certifications', 'Certifications');
  const grid = el('div', 'certs__grid');
  for (const cert of data.certifications) {
    const card = el('div', 'cert-card');
    card.append(el('p', 'cert-card__issuer', cert.issuer), el('h3', 'cert-card__name', cert.name));
    grid.appendChild(card);
  }
  container.appendChild(grid);
  return s;
}

function projects(data) {
  if (!data.projects?.length) return null;
  const { section: s, container } = section('projects', 'Featured Work', true);
  const grid = el('div', 'projects__grid');
  for (const p of data.projects) {
    const card = el(p.url ? 'a' : 'div', 'project-card');
    if (p.url) {
      card.href = p.url;
      card.target = '_blank';
      card.rel = 'noopener';
    }
    card.append(
      el('span', 'project-card__tag', p.tag),
      el('h3', 'project-card__title', p.title),
      el('p', 'project-card__desc', p.desc),
    );
    grid.appendChild(card);
  }
  container.appendChild(grid);
  return s;
}

function contact(data) {
  const s = el('section', 'section');
  s.id = 'contact';
  const c = el('div', 'container container--narrow');
  c.append(el('h2', 'section__title', 'Contact'));
  if (data.contact?.lead) c.appendChild(el('p', 'contact__lead', data.contact.lead));

  const links = el('div', 'contact__links');
  for (const link of data.links) {
    const a = el('a', 'contact-link');
    a.href = link.url;
    externalAttrs(a, link);
    const svg = icon(link.icon);
    if (svg) a.appendChild(svg);
    a.appendChild(document.createTextNode(link.short || link.label));
    links.appendChild(a);
  }
  c.appendChild(links);
  s.appendChild(c);
  return s;
}

function footer(data) {
  const f = el('footer', 'footer');
  const c = el('div', 'container');
  c.appendChild(el('p', null, data.meta.copyright));
  f.appendChild(c);
  return f;
}

/* ── Entry point ──────────────────────────────────────────── */

export function renderDoc(data) {
  const root = document.getElementById('doc-root');
  root.replaceChildren();

  const nav = document.querySelector('.nav__brand');
  nav.textContent = data.meta.name;

  const navLinks = document.getElementById('nav-links');
  navLinks.replaceChildren();
  const targets = [
    ['experience', 'Experience'],
    ['skills', 'Skills'],
    ['certifications', 'Certifications'],
    data.projects?.length ? ['projects', 'Projects'] : null,
    ['contact', 'Contact'],
  ].filter(Boolean);

  for (const [id, label] of targets) {
    const li = el('li');
    const a = el('a', null, label);
    a.href = `#${id}`;
    li.appendChild(a);
    navLinks.appendChild(li);
  }
  const cvLi = el('li', 'nav__cv-link');
  const cvA = el('a', null, 'Download CV');
  cvA.href = data.meta.cv;
  cvA.setAttribute('download', '');
  cvLi.appendChild(cvA);
  navLinks.appendChild(cvLi);

  const cvBtn = document.querySelector('.nav__cv');
  if (cvBtn) cvBtn.href = data.meta.cv;

  for (const node of [
    hero(data),
    metrics(data),
    experience(data),
    skills(data),
    certifications(data),
    projects(data),
    contact(data),
    footer(data),
  ]) {
    if (node) root.appendChild(node);
  }
}
