/* ============================================================
   WALLITUDE — main.js
   Small, dependency-free behaviors only:
   1) Scroll-reveal fade-ins (IntersectionObserver)
   2) Footer year
   No analytics, no trackers, no unnecessary scripts.
   ============================================================ */

(function () {
  "use strict";

  // ---- Footer year ----
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ---- Subtle fade-in on scroll ----
  var revealEls = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window) || revealEls.length === 0) {
    // Fallback: just show everything immediately
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealEls.forEach(function (el) {
    observer.observe(el);
  });

  // Safety net: never leave content permanently invisible — covers
  // search-engine renderers, very fast scrolling/keyboard navigation,
  // and any edge case where an element never crosses the threshold.
  window.setTimeout(function () {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }, 2200);
})();
