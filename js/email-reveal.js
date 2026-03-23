(function () {
  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+-=?^_~';

  function scramble(display, target, onDone) {
    var len    = target.length;
    var frames = len * 5;
    var tick   = 0;

    var timer = setInterval(function () {
      var out = '';
      for (var i = 0; i < len; i++) {
        if (i < Math.floor(tick / 5)) {
          out += target[i];          // this position has settled
        } else if (target[i] === '@' || target[i] === '.') {
          out += target[i];          // keep punctuation fixed throughout
        } else {
          out += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      display.textContent = out;
      tick++;
      if (tick > frames) {
        clearInterval(timer);
        display.textContent = target;
        if (onDone) onDone();
      }
    }, 28);
  }

  function randChar() {
    return CHARS[Math.floor(Math.random() * CHARS.length)];
  }

  var link = document.getElementById('emailReveal');
  if (!link) return;

  // Randomise the placeholder text on load
  var display = link.querySelector('.email-display');
  var placeholder = display.textContent;
  display.textContent = placeholder.split('').map(function (c) {
    return (c === '@' || c === '.') ? c : randChar();
  }).join('');

  var revealed = false;

  link.addEventListener('click', function (e) {
    e.preventDefault();

    var email = link.dataset.u + '@' + link.dataset.d;

    if (revealed) {
      window.location.href = 'mailto:' + email;
      return;
    }

    link.style.pointerEvents = 'none';  // prevent double-click during animation

    scramble(display, email, function () {
      revealed = true;
      link.href  = 'mailto:' + email;
      link.title = 'Click to open mail client';
      link.style.pointerEvents = '';
    });
  });
}());
