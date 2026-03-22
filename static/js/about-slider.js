(function () {
  'use strict';

  var slider    = document.getElementById('aboutSlider');
  if (!slider || !window.ABOUT_STAGES) return;

  // Disable pull-to-refresh so swiping down doesn't reload the page
  document.body.style.overscrollBehaviorY = 'none';
  document.documentElement.style.overscrollBehaviorY = 'none';

  var stages    = window.ABOUT_STAGES;
  var textArea  = document.getElementById('aboutTextArea');
  var popups    = document.querySelectorAll('.about-popup');
  var fsPopups  = document.querySelectorAll('.about-popup.popup-fullscreen');
  var flickerPs = document.querySelectorAll('.about-popup[data-flicker]');
  var flashEl   = document.getElementById('about-flash');

  var currentIdx    = -1;
  var pendingTimers = [];

  // ── Click-to-dismiss ──────────────────────────────────────────────────────
  function hidePopup(p) {
    if (!p.classList.contains('visible') || p.classList.contains('is-hiding')) return;
    p.classList.add('is-hiding');
    p.classList.remove('visible');
    p.dataset.dismissed = '1';
    p.addEventListener('transitionend', function cleanup() {
      p.removeEventListener('transitionend', cleanup);
      p.classList.remove('is-hiding');
    });
  }

  popups.forEach(function (p) {
    p.addEventListener('click', function () { hidePopup(p); });
  });
  var cvBtn         = document.getElementById('about-cv-btn');
  var CV_SHOW_AT    = 75;   // slider % at which the CV button fades in

  // ── Token marker support ──────────────────────────────────────────────────
  // *word*  → bold white   (class a-bold)
  // ^word^  → red          (class a-red)
  // Multi-word spans (*phrase with spaces*) are supported — each word is
  // individually marked before the LCS diff runs.

  var BOLD_RE = /^\*(.*)\*$/;
  var RED_RE  = /^\^(.*)\^$/;

  function stripMarkers(tok) {
    var t = tok.trimEnd();
    var trail = tok.slice(t.length);
    if (BOLD_RE.test(t)) return t.replace(BOLD_RE, '$1') + trail;
    if (RED_RE.test(t))  return t.replace(RED_RE,  '$1') + trail;
    return tok;
  }

  function wordClass(tok) {
    var t = tok.trimEnd();
    if (BOLD_RE.test(t)) return 'a-word a-bold';
    if (RED_RE.test(t))  return 'a-word a-red';
    return 'a-word';
  }

  function makeSpan(tok) {
    var span = document.createElement('span');
    span.className   = wordClass(tok);
    span.textContent = stripMarkers(tok);
    return span;
  }

  // ── Tokenize — expands multi-word *bold* / ^red^ spans first ─────────────
  function tokenize(text) {
    // Expand *multi word bold* → *multi* *word* *bold*
    text = text.replace(/\*([^*]+)\*/g, function (_, inner) {
      return inner.trim().split(/\s+/).map(function (w) { return '*' + w + '*'; }).join(' ');
    });
    // Expand ^multi word red^ → ^multi^ ^word^ ^red^
    text = text.replace(/\^([^^]+)\^/g, function (_, inner) {
      return inner.trim().split(/\s+/).map(function (w) { return '^' + w + '^'; }).join(' ');
    });
    return text.match(/\S+\s*/g) || [];
  }

  // ── LCS on token arrays — compare stripped keys so *bold* matches plain ──
  function computeLCS(a, b) {
    var m = a.length, n = b.length;
    var dp = new Array((m + 1) * (n + 1)).fill(0);
    var i, j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var idx = i * (n + 1) + j;
        if (stripMarkers(a[i-1]).trimEnd() === stripMarkers(b[j-1]).trimEnd()) {
          dp[idx] = dp[(i-1)*(n+1)+(j-1)] + 1;
        } else {
          dp[idx] = Math.max(dp[(i-1)*(n+1)+j], dp[i*(n+1)+(j-1)]);
        }
      }
    }
    var result = [];
    i = m; j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && stripMarkers(a[i-1]).trimEnd() === stripMarkers(b[j-1]).trimEnd()) {
        result.unshift({ type: 'keep', word: b[j-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i*(n+1)+(j-1)] >= dp[(i-1)*(n+1)+j])) {
        result.unshift({ type: 'add', word: b[j-1] });
        j--;
      } else {
        result.unshift({ type: 'remove', word: a[i-1] });
        i--;
      }
    }
    return result;
  }

  // ── Pair consecutive removes + adds as morphs ─────────────────────────────
  function buildTransition(rawDiff) {
    var result = [];
    var i = 0;
    while (i < rawDiff.length) {
      if (rawDiff[i].type !== 'remove' && rawDiff[i].type !== 'add') {
        result.push(rawDiff[i++]);
        continue;
      }
      var removes = [], adds = [];
      while (i < rawDiff.length && (rawDiff[i].type === 'remove' || rawDiff[i].type === 'add')) {
        if (rawDiff[i].type === 'remove') removes.push(rawDiff[i].word);
        else                              adds.push(rawDiff[i].word);
        i++;
      }
      var pairs = Math.min(removes.length, adds.length);
      for (var p = 0; p < pairs; p++) {
        result.push({ type: 'morph', from: removes[p], word: adds[p] });
      }
      for (var p = pairs; p < removes.length; p++) {
        result.push({ type: 'remove', word: removes[p] });
      }
      for (var p = pairs; p < adds.length; p++) {
        result.push({ type: 'add', word: adds[p] });
      }
    }
    return result;
  }

  // ── Pre-compute all forward transitions on page load ──────────────────────
  var transitions = stages.map(function (stage, i) {
    if (i === 0) return null;
    var oldToks = tokenize(stages[i-1].text);
    var newToks = tokenize(stage.text);
    return buildTransition(computeLCS(oldToks, newToks));
  });

  function cancelAll() {
    pendingTimers.forEach(clearInterval);
    pendingTimers = [];
  }

  // ── Morph a span: fade out old word, swap text+style, fade in new ─────────
  function morphSpan(span, fromTok, toTok) {
    span.textContent = stripMarkers(fromTok);
    span.className   = wordClass(fromTok) + ' a-morph-out';
    span.addEventListener('animationend', function () {
      span.textContent = stripMarkers(toTok);
      var base = wordClass(toTok);
      span.className = base + ' a-morph-in';
      span.addEventListener('animationend', function () {
        span.className = base;
      }, { once: true });
    }, { once: true });
  }

  // ── Render stage without animation ────────────────────────────────────────
  function renderStage(idx) {
    cancelAll();
    var tokens = tokenize(stages[idx].text);
    textArea.innerHTML = '';
    tokens.forEach(function (tok) { textArea.appendChild(makeSpan(tok)); });
    currentIdx = idx;
  }

  // ── Apply animated transition ─────────────────────────────────────────────
  function applyTransition(fromIdx, toIdx) {
    cancelAll();
    var diff = transitions[toIdx];
    if (!diff) { renderStage(toIdx); return; }

    var oldSpans = Array.from(textArea.querySelectorAll('.a-word'));
    var oldIdx   = 0;
    var frag     = document.createDocumentFragment();

    diff.forEach(function (tok) {
      var span;
      if (tok.type === 'keep') {
        span = oldSpans[oldIdx++];
        span.className   = wordClass(tok.word);
        span.textContent = stripMarkers(tok.word);
        frag.appendChild(span);

      } else if (tok.type === 'remove') {
        span = oldSpans[oldIdx++];
        span.className = 'a-word a-word-out';
        frag.appendChild(span);
        span.addEventListener('animationend', function () { span.remove(); }, { once: true });

      } else if (tok.type === 'add') {
        span = makeSpan(tok.word);
        span.className = wordClass(tok.word) + ' a-word-in';
        frag.appendChild(span);

      } else if (tok.type === 'morph') {
        span = (oldIdx < oldSpans.length) ? oldSpans[oldIdx++] : document.createElement('span');
        frag.appendChild(span);
        (function (s, f, t) {
          requestAnimationFrame(function () { morphSpan(s, f, t); });
        })(span, tok.from, tok.word);
      }
    });

    textArea.innerHTML = '';
    textArea.appendChild(frag);
    currentIdx = toIdx;
  }

  // ── Map slider 0-100 to stage index ──────────────────────────────────────
  function stageIdx(val) {
    return Math.min(Math.floor((val / 100) * stages.length), stages.length - 1);
  }

  // ── Looped attention flicker ──────────────────────────────────────────────
  // Runs continuously while any [data-flicker] popup is visible.
  function updateFlicker() {
    var anyVisible = false;
    flickerPs.forEach(function (fp) {
      if (fp.classList.contains('visible')) anyVisible = true;
    });
    if (flashEl) flashEl.classList.toggle('about-flickering', anyVisible);
  }

  // ── Main update ───────────────────────────────────────────────────────────
  slider.addEventListener('input', function () {
    var val = parseInt(slider.value, 10);
    var idx = stageIdx(val);

    if (idx !== currentIdx) {
      if (idx === currentIdx + 1) applyTransition(currentIdx, idx);
      else renderStage(idx);
    }

    popups.forEach(function (p) {
      var show = parseInt(p.dataset.show, 10);
      var hide = parseInt(p.dataset.hide || '101', 10);
      var shouldShow = val >= show && val < hide;
      var isVisible  = p.classList.contains('visible');
      var isHiding   = p.classList.contains('is-hiding');

      if (!shouldShow) {
        // Reset dismissed state when slider leaves the popup's range
        delete p.dataset.dismissed;
      }

      if (shouldShow && !isVisible && !isHiding && !p.dataset.dismissed) {
        p.classList.add('visible');
      } else if (!shouldShow && isVisible && !isHiding) {
        p.classList.add('is-hiding');
        p.classList.remove('visible');
        p.addEventListener('transitionend', function cleanup() {
          p.removeEventListener('transitionend', cleanup);
          p.classList.remove('is-hiding');
        });
      }
    });

    // Show CV button once slider reaches the conviction / lab-search zone
    if (cvBtn) cvBtn.classList.toggle('visible', val >= CV_SHOW_AT);

    // Start/stop looped flicker for attention-grabbing popups
    updateFlicker();

    // Dim text behind fullscreen popups
    var anyFsVisible = false;
    fsPopups.forEach(function (fp) {
      if (fp.classList.contains('visible')) anyFsVisible = true;
    });
    if (textArea) textArea.classList.toggle('text-dimmed', anyFsVisible);

    var pct = parseFloat(slider.value).toFixed(2);
    slider.style.background =
      'linear-gradient(to right,#8ed6fb ' + pct + '%,rgba(255,255,255,0.18) ' + pct + '%)';
  });

  renderStage(0);

  // ── Mouse-wheel scrolls the slider ──────────────────────────────────────
  // Scroll down = more hard sell, scroll up = less. step=3 per notch feels
  // responsive without jumping stages too fast.
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    var step = Math.sign(e.deltaY) * 1;
    var val  = Math.max(0, Math.min(100, parseInt(slider.value, 10) + step));
    slider.value = val;
    slider.dispatchEvent(new Event('input'));
  }, { passive: false });

  // ── Touch handling ───────────────────────────────────────────────────────
  // Axis-locked pattern: vertical swipe → native page scroll (browser owns),
  // horizontal swipe → slider control (JS owns). touch-action: pan-y on the
  // container tells the browser this upfront so scroll response is instant.
  //
  // Axis locks after 8px of movement so short taps don't mis-fire.
  var touchStartX       = 0;
  var touchStartY       = 0;
  var swipeAxis         = null;   // 'h' | 'v' | null
  var sliderActive      = false;
  var sliderTouchStartX = 0;
  var sliderTouchStartV = 0;
  var swipeAccum        = 0;      // fractional accumulator for swipe steps

  // Slider bar: direct horizontal drag
  slider.addEventListener('touchstart', function (e) {
    sliderActive      = true;
    sliderTouchStartX = e.touches[0].clientX;
    sliderTouchStartV = parseFloat(slider.value);
  }, { passive: true });

  slider.addEventListener('touchmove', function (e) {
    var dx  = e.touches[0].clientX - sliderTouchStartX;
    var val = Math.max(0, Math.min(100, sliderTouchStartV + (dx / slider.getBoundingClientRect().width) * 100));
    slider.value = val;
    slider.dispatchEvent(new Event('input'));
  }, { passive: true });

  // General touch: lock axis, horizontal controls slider
  document.addEventListener('touchstart', function (e) {
    if (e.target.closest('a, button, nav, header, input, label')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swipeAxis   = null;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (sliderActive) { e.preventDefault(); return; }

    var x  = e.touches[0].clientX;
    var y  = e.touches[0].clientY;
    var dx = x - touchStartX;
    var dy = y - touchStartY;

    // Lock axis after 8px so taps don't accidentally trigger either path
    if (!swipeAxis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      swipeAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }

    if (swipeAxis === 'h') {
      e.preventDefault();
      swipeAccum += -dx * 8 / window.innerWidth;   // ~1/3 screen swipe = 1 stage
      var whole = Math.trunc(swipeAccum);
      if (whole !== 0) {
        swipeAccum -= whole;
        var val = Math.max(0, Math.min(100, parseInt(slider.value, 10) + whole));
        slider.value = val;
        slider.dispatchEvent(new Event('input'));
      }
      touchStartX = x;
    }
    // swipeAxis === 'v': fall through — browser handles scroll naturally
  }, { passive: false });

  document.addEventListener('touchend', function () {
    swipeAxis    = null;
    sliderActive = false;
    swipeAccum   = 0;
  }, { passive: true });
}());
