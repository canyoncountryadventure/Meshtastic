(() => {
  const counter = document.getElementById('visitorCount');
  if (!counter) return;

  fetch('/api/visitor-count', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('Visitor count unavailable');
      return response.json();
    })
    .then(({ visitors }) => {
      if (!Number.isFinite(visitors) || visitors < 0) return;
      const value = counter.querySelector('strong');
      if (!value) return;
      value.textContent = new Intl.NumberFormat().format(visitors);
      counter.hidden = false;
    })
    .catch(() => {
      counter.hidden = true;
    });
})();
