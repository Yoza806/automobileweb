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
  if (header) header.classList.toggle("is-scrolled", window.scrollY > 16);
}

function setMenu(open) {
  if (navMenu) navMenu.classList.toggle("is-open", open);
  if (navToggle) navToggle.setAttribute("aria-expanded", String(open));
}

function showReview(index) {
  if (!testimonialCards.length) return;
  activeReview = (index + testimonialCards.length) % testimonialCards.length;
  testimonialCards.forEach((card, cardIndex) => {
    card.classList.toggle("is-active", cardIndex === activeReview);
  });
}

function startReviewTimer() {
  if (!testimonialCards.length) return;
  window.clearInterval(reviewTimer);
  reviewTimer = window.setInterval(() => {
    showReview(activeReview + 1);
  }, 5200);
}

window.addEventListener("scroll", updateHeader);
updateHeader();

navToggle?.addEventListener("click", () => {
  setMenu(!navMenu.classList.contains("is-open"));
});

logo?.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "/";
});

navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    if (navMenu?.classList.contains("is-open")) setMenu(false);
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

// Product Image Carousel Logic
window.cycleImage = function(btn, dir, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  
  // Debugging log: remove once confirmed working
  console.log('Carousel clicked:', dir);

  const container = btn.closest('.img-carousel-container');
  const imagesAttr = container ? container.getAttribute('data-images') : null;
  if (!container || !imagesAttr) return;

  const img = container.querySelector('img');
  const images = imagesAttr.split(',').filter(url => !!url);
  
  if (images.length <= 1) return;

  // Reliability: Use attribute directly to track state
  let currentIndex = parseInt(container.getAttribute('data-current-index') || '0');
  const nextIdx = (currentIndex + dir + images.length) % images.length;
  
  container.setAttribute('data-current-index', nextIdx);
  if (img) img.src = images[nextIdx];

  // Sync with product detail thumbnails if they exist
  const gallery = container.closest('.product-gallery');
  if (gallery) updateThumbnails(gallery, nextIdx);
};

window.setProductImage = function(thumbBtn, index) {
  const gallery = thumbBtn.closest('.product-gallery');
  const container = gallery.querySelector('.img-carousel-container');
  const img = container.querySelector('img');
  const images = container.dataset.images.split(',').filter(url => !!url);
  
  img.src = images[index];
  container.setAttribute('data-current-index', index); // Keep the carousel index in sync with the thumbnail
  updateThumbnails(gallery, index);
};

function updateThumbnails(gallery, activeIndex) {
  const thumbnails = gallery.querySelectorAll('.thumbnail-item');
  thumbnails.forEach((thumb, i) => {
    thumb.classList.toggle('active', i === activeIndex);
  });
};