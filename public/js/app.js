const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#siteNav');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// Handle the shop redirect for navigation links only
document.querySelectorAll('.site-nav a').forEach(el => {
  if (el.textContent.trim().toLowerCase() === 'shop') {
    el.addEventListener('click', () => {
      window.location.href = '/shop';
    });
  }
});
