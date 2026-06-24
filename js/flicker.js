(function () {
  try {
    var mode = localStorage.getItem('theme');
    document.body.classList.add('theme',mode);
  } catch (e) {}
})();
