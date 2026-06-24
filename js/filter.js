// ─── Category filter for publications and projects sections ──────────────────
// Each filter group is scoped to its own section so pub filters don't affect
// project filters and vice versa.

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-group').forEach(group => {
    const targetSelector = group.dataset.target;
    const container = group.closest('.section-inner').querySelector(targetSelector);
    if (!container) return;

    group.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const cat = btn.dataset.category;

        container.querySelectorAll('[data-categories]').forEach(card => {
          const cardCats = card.dataset.categories.split(',').map(s => s.trim());
          const show = cat === 'all' || cardCats.includes(cat);
          card.style.display = show ? '' : 'none';
        });
      });
    });
  });
});
