// ─── CONFIGURABLE IMAGE LIST ────────────────────────────────────────────────
// Replace with your real image paths. Add or remove entries freely.
// Arrow stroke on the border thins as you click deeper; resets at stage 0.
const PROFILE_IMAGES = [
  '/img/viz/input.png',
  '/img/viz/attn_layer_02.png',
  '/img/viz/attn_layer_04.png',
  '/img/viz/attn_layer_06.png',
  '/img/viz/attn_layer_08.png',
  '/img/viz/attn_layer_10.png',
  '/img/viz/attn_layer_12.png',
  '/img/viz/attn_layer_14.png',
  '/img/viz/attn_layer_16.png',
  '/img/viz/attn_layer_22.png',
  '/img/viz/pca_layer_00.png',
  '/img/viz/pca_layer_02.png',
  '/img/viz/pca_layer_04.png',
  '/img/viz/pca_layer_06.png',
  '/img/viz/pca_layer_08.png',
  '/img/viz/pca_layer_10.png',
  '/img/viz/pca_layer_12.png',
  '/img/viz/pca_layer_14.png',
  '/img/viz/pca_layer_16.png',
  '/img/viz/pca_layer_18.png',
  '/img/viz/pca_layer_20.png',
  '/img/viz/pca_layer_22.png',
];

// ─── CLICK CYCLE ─────────────────────────────────────────────────────────────
const heroPhoto = document.getElementById('heroPhoto');
if (!heroPhoto) throw new Error('hero.js: not on homepage');

let currentStage = 0;

heroPhoto.addEventListener('click', () => {
  currentStage = (currentStage + 1) % PROFILE_IMAGES.length;
  heroPhoto.src = PROFILE_IMAGES[currentStage];
});
