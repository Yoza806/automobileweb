const header = document.querySelector(".site-header");
const logo = document.querySelector(".logo");
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
const navLinks = document.querySelectorAll(".nav-menu a");
const testimonialCards = [...document.querySelectorAll(".testimonial-card")];
const carouselButtons = document.querySelectorAll(".carousel-btn");
const newsletterForm = document.querySelector("#newsletterForm");
const formMessage = document.querySelector("#formMessage");
const preorderTab = document.querySelector(".preorder-tab");
const preorderClose = document.querySelector(".close-btn");

let activeReview = 0;
let reviewTimer;

function updateHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 16);
}

function setMenu(open) {
  navMenu.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
}

function showReview(index) {
  activeReview = (index + testimonialCards.length) % testimonialCards.length;
  testimonialCards.forEach((card, cardIndex) => {
    card.classList.toggle("is-active", cardIndex === activeReview);
  });
}

function startReviewTimer() {
  window.clearInterval(reviewTimer);
  reviewTimer = window.setInterval(() => {
    showReview(activeReview + 1);
  }, 5200);
}

window.addEventListener("scroll", updateHeader);
updateHeader();

navToggle.addEventListener("click", () => {
  setMenu(!navMenu.classList.contains("is-open"));
});

if (logo) {
  logo.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/";
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    setMenu(false);
    const text = link.textContent.trim().toLowerCase();
    const href = link.getAttribute("href");
    const isHomePage = window.location.pathname === "/";

    if (text === 'shop') {
      e.preventDefault();
      window.location.href = '/shop';
    } else if (href && href.startsWith('#') && !isHomePage) {
      // Redirect to home page with the section hash if we are currently on /shop or other pages
      e.preventDefault();
      window.location.href = '/' + href;
    }
  });
});

carouselButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.direction === "next" ? 1 : -1;
    showReview(activeReview + direction);
    startReviewTimer();
  });
});

if (testimonialCards.length) {
  startReviewTimer();
}

if (newsletterForm) {
  newsletterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = "/shop";
  });
}

function togglePreorder() {
  const popup = document.querySelector(".preorder-popup") || document.getElementById("preorderPopup");
  if (popup) {
    popup.classList.toggle("active");
  }
}

preorderTab?.addEventListener("click", togglePreorder);
preorderClose?.addEventListener("click", togglePreorder);