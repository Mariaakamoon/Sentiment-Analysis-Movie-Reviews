async function loadMovie() {
  const target = document.querySelector("#movie-detail");
  try {
    const response = await fetch(`/api/movies/${window.CINESCOPE_MOVIE_ID}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error);
    const movie = data.movie;
    target.innerHTML = `<img class="poster" src="${movie.poster || ""}" alt="${escapeHtml(movie.title)} poster"><div class="detail-copy"><span class="tag">${movie.year} · ${movie.rating ? movie.rating.toFixed(1) : "Unrated"} / 10 · TMDB</span><h1>${escapeHtml(movie.title)}</h1><p>${escapeHtml(movie.overview)}</p><p>${escapeHtml((movie.genres || []).join(" · "))}${movie.runtime ? ` · ${movie.runtime} min` : ""}</p><p>${movie.cast?.length ? `Cast: ${escapeHtml(movie.cast.join(", "))}` : "Cast information unavailable."}</p><div class="actions"><a href="/analyzer">Analyze a review</a><a href="/ask?movie_id=${encodeURIComponent(movie.id)}">Ask about this movie</a>${movie.trailer ? `<a href="${movie.trailer}" target="_blank" rel="noreferrer">Watch trailer ↗</a>` : ""}</div></div>`;
  } catch (error) { target.innerHTML = `<p class="loading">${escapeHtml(error.message)}</p>`; }
}
loadMovie();
