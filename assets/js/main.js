/* ── Mobile nav toggle ─────────────────────────────────── */
const burger = document.getElementById('burger');
const navLinks = document.querySelector('.nav__links');

burger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

/* ── Scroll-fade-in with stagger ───────────────────────── */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    }),
    { threshold: 0.08 }
  );

  const addFadeIn = (selector, staggerMs = 0) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.classList.add('fade-in');
      if (staggerMs) el.style.transitionDelay = `${i * staggerMs}ms`;
      observer.observe(el);
    });
  };

  addFadeIn('.timeline__item', 80);
  addFadeIn('.skill-group', 55);
  addFadeIn('.cert-card', 80);
  addFadeIn('.metric', 65);
  addFadeIn('.project-card', 80);
}

/* ── Nav shadow on scroll ──────────────────────────────── */
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 10
    ? '0 1px 16px rgb(0 0 0 / 6%)'
    : '';
}, { passive: true });

/* ── Scroll spy (active nav link) ──────────────────────── */
const spySections = document.querySelectorAll('section[id], header[id]');
const navAnchors = document.querySelectorAll('.nav__links a[href^="#"]');

const spy = new IntersectionObserver(
  entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        navAnchors.forEach(a => a.classList.remove('active'));
        const active = document.querySelector(`.nav__links a[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  },
  { rootMargin: '-30% 0px -65% 0px' }
);

spySections.forEach(s => spy.observe(s));
