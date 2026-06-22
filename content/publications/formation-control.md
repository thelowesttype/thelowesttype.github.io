+++
title = "Topological Online Learning for Displacement (TOLD) based Formation Control"
date = 2026-06-20
draft = false
template = "paper.html"

[extra]
# Short fields used by the publications listing template
featured  = true
authors   = "S. Gupta*, S. Sharma*, S. Gunagi, S. Sundaram"
venue     = "IROS 2026"
year      = ""
tldr      = "Instead of giving each robot a smarter local controller, TOLD adapts who each robot listens to — rewiring edge weights online via gradient descent to minimize formation error. No training, no centralized coordinator, stackable on any existing method."
categories = ["multi-robot"]
image     = "/img/papers/dol.jpg"

# Full fields used by the standalone paper.html template
paper_authors = ["Shubhankar Gupta*", "Saksham Sharma*", "Sumant Gunagi", "Suresh Sundaram"]
institution   = "Indian Institute of Science, Bengaluru"
paper_url     = "#"
code_url      = "#"
video_url     = "#"
+++

<div class="paper-teaser">
<video width="100%" height="100%" controls muted style="border-radius:4px;">
  <source src="/vids/TOLD/formationVideo_IROS_nomusic.mp4" type="video/mp4">
</video>
</div>

<div class="paper-section paper-abstract">
<h2 class="paper-section-title">Summary</h2>
<p>
Drone swarms and multi-robot teams need to hold a precise geometric shape even when individual robots are hit by wind gusts, sensor noise, or sudden disturbances. The conventional approach gives each robot a smarter local controller — but those controllers act in isolation and never change <em>how much each robot trusts its neighbors</em>.
</p>
<p>
<strong>TOLD takes a different angle.</strong> Instead of fighting disturbances at each node, we adapt the <em>communication weights</em> between robots online — using gradient descent on the live formation error. Think of it as the formation's attention redistributing itself in real time: if a robot drifts, its neighbors automatically increase how strongly they pull it back.
</p>
<br>
<p>
<strong>No pre-training</strong>. <strong>No centralized coordinator</strong>.
</p>
</div>

<div class="paper-section">
<h2 class="paper-section-title">Method</h2>
<br>
<div class="paper-section">
<img src="/img/papers/told/framework.png"
     alt="TOLD framework overview: formation sensing, OGF/OExpGF weight updates, formation control fusion, and Crazyflie execution"
     style="width:100%;border-radius:4px;">
</div>

<p style="font-size:0.95rem;line-height:1.75;color:#bbb;margin-bottom:1.25rem;">
All controllers share the same directed ring-topology interaction graph. They differ only in how the edge weights
<strong style="color:#ddd;">w<sub>ij</sub></strong> — which encode how much robot <em>i</em> weighs its neighbor <em>j</em>'s position — are computed at each timestep.
</p>
<div class="method-cards">
<div class="method-card">
<div class="method-card-title">
<span class="algo-dot" style="background:#6495ED;"></span>Fixed Weights (baseline)
</div>
<p>Weights are initialized from the graph adjacency matrix and never updated. Simple and guaranteed stable; convergence speed is set entirely by the proportional gain <em>k<sub>p</sub></em>. Cannot compensate for spatially uneven disturbances.</p>
</div>
<div class="method-card">
<div class="method-card-title">
<span class="algo-dot" style="background:#50C878;"></span>OExpGF — Exponential Gradient
</div>
<p>Weights are updated via exponentiated gradient descent on the local formation distortion error. A discount factor &gamma; down-weights stale gradients over time. The softmax-style normalization keeps all weights non-negative and row-stochastic at every step. <strong>Provably achieves asymptotic consensus.</strong></p>
</div>
<div class="method-card">
<div class="method-card-title">
<span class="algo-dot" style="background:#FFA500;"></span>OGF — Online Gradient Flow
</div>
<p>Weights follow unconstrained online gradient descent on the local distortion error — no positivity or normalization constraints. Delivers the best formation accuracy; weights can grow large under persistent disturbances, which is the practical trade-off vs. OExpGF. <strong>Guarantees non-increasing formation distortion error.</strong></p>
</div>
</div>
</div>

<div class="paper-section">
<h2 class="paper-section-title">Results</h2>
<p style="font-size:0.9rem;line-height:1.65;color:#aaa;margin-bottom:1.25rem;">
Three Crazyflie 2.0 quadrotors on a Qualisys motion-capture testbed. Drone 0 (leader) is auto piloted along a challenging 3D upward spiral; followers execute the formation algorithm using only relative position measurements from their two spatial neighbors.
</p>

<div class="algo-tabs">
  <button class="algo-tab active" data-vid="vid-fixed" style="--tcol:#6495ED;">
    <span class="algo-tab-dot" style="background:#6495ED;"></span>Fixed Weights
  </button>
  <button class="algo-tab" data-vid="vid-grad" style="--tcol:#FFA500;">
    <span class="algo-tab-dot" style="background:#FFA500;"></span>OGF
  </button>
  <button class="algo-tab" data-vid="vid-expo" style="--tcol:#50C878;">
    <span class="algo-tab-dot" style="background:#50C878;"></span>OExpGF
  </button>
</div>
<video id="vid-fixed" class="algo-video active" controls muted style="border-radius:4px;width:100%;display:block;">
  <source src="/vids/TOLD/fixed_traj.mp4" type="video/mp4">
</video>
<video id="vid-grad" class="algo-video" controls muted style="border-radius:4px;width:100%;display:none;">
  <source src="/vids/TOLD/grad_traj.mp4" type="video/mp4">
</video>
<video id="vid-expo" class="algo-video" controls muted style="border-radius:4px;width:100%;display:none;">
  <source src="/vids/TOLD/expo_traj.mp4" type="video/mp4">
</video>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.5rem;text-align:center;">
<div style="padding:1rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:3px;">
<div style="font-size:0.68rem;font-family:'DOS',monospace;color:#555;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem;">No Adaptation</div>
<div style="font-size:1.9rem;font-weight:700;color:#6495ED;">0.25 m</div>
<div style="font-size:0.75rem;color:#666;margin-top:0.3rem;">Fixed weights median error. Followers drift under disturbances.</div>
</div>
<div style="padding:1rem;background:rgba(255,165,0,0.06);border:1px solid rgba(255,165,0,0.3);border-radius:3px;">
<div style="font-size:0.68rem;font-family:'DOS',monospace;color:#a06800;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem;">OGF / Best Accuracy</div>
<div style="font-size:1.9rem;font-weight:700;color:#FFA500;">62%</div>
<div style="font-size:0.75rem;color:#666;margin-top:0.3rem;">Reduction in median distortion. Unconstrained weights, highest accuracy.</div>
</div>
<div style="padding:1rem;background:rgba(80,200,120,0.06);border:1px solid rgba(80,200,120,0.3);border-radius:3px;">
<div style="font-size:0.68rem;font-family:'DOS',monospace;color:#2a7040;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem;">OExpGF / Safe &amp; Bounded</div>
<div style="font-size:1.9rem;font-weight:700;color:#50C878;">31%</div>
<div style="font-size:0.75rem;color:#666;margin-top:0.3rem;">Reduction in median distortion. Weights stay bounded, provably stable.</div>
</div>
</div>
</div>

<div class="paper-section">
<p style="font-size:1.05rem;font-weight:600;color:#ddd;margin:0 0 0.2rem;">[ Field Notes ]</p>
<p style="font-size:0.85rem;color:#666;margin:0 0 1.1rem;line-height:1.6;">Hardware experiments: occasionally graceful, always educational. Crashes inclusive to share the pain.</p>

<div class="vid-carousel" id="vidCarousel">
<div class="vid-track" id="vidTrack">

  <div class="vid-slide">
    <video width="100%" controls style="border-radius:4px;display:block;">
      <source src="/vids/TOLD/hand_exp.mp4" type="video/mp4">
    </video>
    <div class="vid-meta">
      <span class="vid-label">The Stress Test</span>
      <span class="vid-note">One of us grabbed a drone and sprinted around trying to break the formation. It adapted till it could.</span>
    </div>
  </div>

  <div class="vid-slide">
    <video width="100%" controls muted style="border-radius:4px;display:block;">
      <source src="/vids/TOLD/final_grid_video_website.mp4" type="video/mp4">
    </video>
    <div class="vid-meta">
      <span class="vid-label">Indoor / All Runs</span>
      <span class="vid-note">Grid view of every mocap experiment. Sound On for propeller experience</span>
    </div>
  </div>

  <div class="vid-slide">
    <video width="100%" controls style="border-radius:4px;display:block;">
      <source src="/vids/TOLD/fixed_gps1.mp4" type="video/mp4">
    </video>
    <div class="vid-meta">
      <span class="vid-label">Outdoor / Trial 1</span>
      <span class="vid-note">Same algorithm. No motion capture. Actual wind. The formation is L shaped with leader drone between the other two drones in terms of height seperation. </span>
    </div>
  </div>

  <div class="vid-slide">
    <video width="100%" controls style="border-radius:4px;display:block;">
      <source src="/vids/TOLD/fixed_gps2.mp4" type="video/mp4">
    </video>
    <div class="vid-meta">
      <span class="vid-label">Outdoor / Trial 2</span>
      <span class="vid-note">This time the leader gets moved around manually first, then lands. The followers kept up the whole time. Good followers!</span>
    </div>
  </div>

</div>
<div class="vid-controls">
  <button class="vid-btn" id="vidPrev">&#8592;</button>
  <div class="vid-dots" id="vidDots"></div>
  <button class="vid-btn" id="vidNext">&#8594;</button>
</div>
</div>
</div>

<style>
.paper-figure {
  background: #f8f8f8;
  border-radius: 4px;
  padding: 0.75rem;
}
.paper-figure-caption {
  font-size: 0.78rem;
  line-height: 1.55;
  color: #555;
  margin: 0.4rem 0 0;
  font-style: italic;
}
.paper-video-embed {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: rgba(255,255,255,0.03);
  border: 1px dashed rgba(255,255,255,0.15);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  font-size: 0.85rem;
  color: rgba(255,255,255,0.25);
  overflow: hidden;
}
.vid-carousel { position: relative; overflow: hidden; }
.vid-track { display: flex; transition: transform 0.35s cubic-bezier(.4,0,.2,1); }
.vid-slide { min-width: 100%; }
.vid-meta { margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; }
.vid-label {
  font-size: 0.72rem;
  font-family: 'DOS', monospace;
  color: #8ed6fb;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.vid-note { font-size: 0.82rem; color: #666; font-style: italic; }
.vid-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.9rem;
}
.vid-btn {
  background: none;
  border: 1px solid rgba(255,255,255,0.12);
  color: #666;
  padding: 0.2rem 0.75rem;
  border-radius: 2px;
  cursor: pointer;
  font-family: 'DOS', monospace;
  font-size: 1rem;
  transition: border-color 0.12s, color 0.12s;
}
.vid-btn:hover { border-color: #8ed6fb; color: #8ed6fb; }
.vid-dots { display: flex; gap: 0.45rem; align-items: center; }
.vid-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.15);
  cursor: pointer;
  transition: background 0.15s;
}
.vid-dot.active { background: #8ed6fb; }
.algo-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.algo-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.9rem;
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 2px;
  color: #555;
  font-family: 'DOS', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.algo-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.4;
  transition: opacity 0.12s;
  flex-shrink: 0;
}
.algo-tab.active { border-color: var(--tcol); color: #ddd; }
.algo-tab.active .algo-tab-dot { opacity: 1; }
.algo-tab:hover:not(.active) { border-color: rgba(255,255,255,0.25); color: #999; }
</style>

<div class="paper-section">
<h2 class="paper-section-title">Interactive Demo</h2>
<p style="font-size:0.9rem;line-height:1.6;color:#aaa;margin-bottom:0.85rem;">
The solid white circle is the <strong style="color:#ddd;">leader (agent 0)</strong>.
Drag it or use arrow keys to move it. Ghost clusters show where each algorithm
positions the follower agents. Differences are most visible after the algorithms
have been running for a few seconds on the Figure-8 path &mdash; watch the error
values in the legend diverge as OGF adapts its edge weights.
</p>
<div id="paramPanel"></div>
<div class="demo-wrapper">
<div class="demo-canvas-wrap">
<canvas id="formationCanvas" width="700" height="525"></canvas>
</div>
<div class="demo-controls">
<label for="pathSelect">Path:</label>
<select id="pathSelect">
<option value="none">Manual (arrow keys / drag)</option>
<option value="figure8">Figure-8</option>
<option value="spiral">Spiral</option>
<option value="octagon">Octagon</option>
</select>
<button id="pauseBtn">Pause / Resume</button>
<button id="resetBtn">Reset</button>
</div>
<p class="demo-hint">Arrow keys: move leader &nbsp;|&nbsp; Q / W: height up / down &nbsp;|&nbsp; Space: pause &nbsp;|&nbsp; R: reset</p>
</div>
<div style="display:flex;flex-wrap:wrap;gap:0.5rem;font-size:0.82rem;font-family:monospace;color:#666;margin-top:0.5rem;">
<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6495ED;margin-right:4px;"></span>Fixed Weights</span>
<span style="margin:0 0.5rem;">·</span>
<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#50C878;margin-right:4px;"></span>OExpGF</span>
<span style="margin:0 0.5rem;">·</span>
<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FFA500;margin-right:4px;"></span>OGF</span>
</div>
</div>

<div class="paper-section">
<h2 class="paper-section-title">Acknowledgements</h2>
<p style="font-size:0.95rem;line-height:1.8;color:#bbb;">
We thank <strong style="color:#ddd;">Varad Vaidya</strong>, <strong style="color:#ddd;">Samahith S A</strong>, and <strong style="color:#ddd;">Naveed Shaikh</strong> for their help conducting the hardware experiments and for many valuable discussions.
</p>
</div>

<div class="paper-section">
<h2 class="paper-section-title">BibTeX</h2>
<pre class="bibtex-block">@inproceedings{gupta2026told,
  title     = {Topological Online Learning for Displacement-based Formation Control},
  author    = {Gupta, Shubhankar and Sharma, Saksham and Sundaram, Suresh},
  booktitle = {IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS)},
  year      = {2026},
}</pre>
</div>

<script src="/js/formation_sim.js"></script>
<script>
(function() {
  var track = document.getElementById('vidTrack');
  var dotsWrap = document.getElementById('vidDots');
  if (!track || !dotsWrap) return;
  var slides = track.children;
  var n = slides.length;
  var cur = 0;
  for (var i = 0; i < n; i++) {
    var d = document.createElement('div');
    d.className = 'vid-dot' + (i === 0 ? ' active' : '');
    (function(idx) { d.onclick = function() { go(idx); }; })(i);
    dotsWrap.appendChild(d);
  }
  function go(idx) {
    cur = (idx + n) % n;
    track.style.transform = 'translateX(-' + (cur * 100) + '%)';
    Array.from(dotsWrap.children).forEach(function(d, i) {
      d.classList.toggle('active', i === cur);
    });
  }
  document.getElementById('vidPrev').onclick = function() { go(cur - 1); };
  document.getElementById('vidNext').onclick = function() { go(cur + 1); };
})();

document.querySelectorAll('.algo-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.algo-tab').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.algo-video').forEach(function(v) { v.style.display = 'none'; v.pause(); });
    btn.classList.add('active');
    document.getElementById(btn.dataset.vid).style.display = 'block';
  });
});
</script>
