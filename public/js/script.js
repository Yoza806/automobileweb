const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
const navLinks = document.querySelectorAll(".nav-menu a");
const testimonialCards = [...document.querySelectorAll(".testimonial-card")];
const carouselButtons = document.querySelectorAll(".carousel-btn");
const newsletterForm = document.querySelector("#newsletterForm");
const formMessage = document.querySelector("#formMessage");

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

navLinks.forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
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

newsletterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = new FormData(newsletterForm).get("name").trim();
  formMessage.textContent = `Thanks, ${name}. Your request is ready for seller confirmation.`;
  newsletterForm.reset();
});