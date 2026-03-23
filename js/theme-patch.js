// theme-patch.js
// Restores persisted theme on load and wires the toggle button.
// main.js (defer) also handles this but runs later — this ensures
// no flash of wrong theme and that our listener fires first.

(function () {
  var saved = localStorage.getItem('theme') || 'dark';
  document.body.classList.remove('dark', 'light');
  document.body.classList.add(saved);

  var btn = document.getElementById('mode');
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      var next = document.body.classList.contains('dark') ? 'light' : 'dark';
      document.body.classList.remove('dark', 'light');
      document.body.classList.add(next);
      localStorage.setItem('theme', next);
    }, true); // capture phase — fires before main.js's bubble listener
  }
  // Close the burger menu when a nav section link is clicked (not search).
  document.addEventListener('click', function (e) {
    var link = e.target.closest('.main-nav .nav-link');
    if (!link) return;
    var menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.checked = false;
  });
}());
