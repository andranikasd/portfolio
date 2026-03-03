/* ── Mobile nav toggle ─────────────────────────────────── */
const burger = document.getElementById('burger');
const navLinks = document.querySelector('.nav__links');

burger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

/* ── Scroll-fade-in for sections ───────────────────────── */
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }),
  { threshold: 0.1 }
);

document.querySelectorAll(
  '.skill-group, .cert-card, .timeline__item'
).forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});

/* ── Nav border on scroll ──────────────────────────────── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 10
    ? '0 1px 12px rgba(0,0,0,0.08)'
    : '';
});
