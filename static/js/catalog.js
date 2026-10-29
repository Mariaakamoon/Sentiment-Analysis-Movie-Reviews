async function loadCatalog() {
  try {
    const response = await fetch("/api/movies/catalog");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error);
    document.querySelector("#catalog-grid").innerHTML = data.results.map(card).join("");
    document.querySelector("#catalog-status").textContent = `${data.count} popular English and Hindi films from TMDB.`;
  } catch (error) {
    document.querySelector("#catalog-grid").innerHTML = `<p class="loading">${escapeHtml(error.message)}</p>`;
    document.querySelector("#catalog-status").textContent = "The library could not be loaded.";
  }
}
loadCatalog();
