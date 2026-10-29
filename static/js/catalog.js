async function loadCatalog() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      document.querySelector("#catalog-status").textContent = `Loading movie library (attempt ${attempt}/3)...`;
      const response = await fetch(`/api/movies/catalog?retry=${attempt}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      document.querySelector("#catalog-grid").innerHTML = data.results.map(card).join("");
      document.querySelector("#catalog-status").textContent = `${data.count} popular English and Hindi films from TMDB.`;
      return;
    } catch (error) {
      if (attempt === 3) {
        document.querySelector("#catalog-grid").innerHTML = `<p class="loading">TMDB is temporarily unavailable. Refresh to try again.</p>`;
        document.querySelector("#catalog-status").textContent = "The library could not be loaded.";
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
}
loadCatalog();
