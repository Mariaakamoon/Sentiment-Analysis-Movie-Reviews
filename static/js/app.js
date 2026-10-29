const state = { movies: new Map(), selected: null };
const $ = (selector) => document.querySelector(selector);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cinescope-theme", theme);
  $("#theme-toggle").setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
}

function card(movie) {
  state.movies.set(String(movie.id), movie);
  const image = movie.poster
    ? `<img class="poster" src="${movie.poster}" alt="Poster for ${escapeHtml(movie.title)}" loading="lazy">`
    : `<div class="poster missing" role="img" aria-label="No poster available">Poster unavailable</div>`;
  return `<article class="movie-card"><a class="movie-open" href="/movie/${movie.id}" data-id="${movie.id}" aria-label="Open details for ${escapeHtml(movie.title)}">${image}<h3>${escapeHtml(movie.title)}</h3><p>${movie.year} · ${movie.rating ? movie.rating.toFixed(1) : "No rating"}</p></a></article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function loadTrending() {
  const response = await fetch("/api/movies/trending");
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error);
  $("#trending-grid").innerHTML = data.results.length ? data.results.map(card).join("") : '<p class="loading">No movies were returned.</p>';
  addOptions(data.results);
}

function addOptions(movies) {
  const select = $("#movie-select");
  movies.forEach((movie) => {
    if (![...select.options].some((option) => option.value === String(movie.id))) {
      select.add(new Option(`${movie.title} (${movie.year})`, movie.id));
    }
  });
}

async function showDetail(id) {
  const response = await fetch(`/api/movies/${id}`);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error);
  const movie = data.movie;
  state.selected = movie;
  state.movies.set(String(movie.id), movie);
  addOptions([movie]);
  $("#detail-title").textContent = movie.title;
  $("#detail").innerHTML = `<img class="poster" src="${movie.poster || ""}" alt="${escapeHtml(movie.title)} poster"><div class="detail-copy"><span class="tag">${movie.year} · ${movie.rating ? movie.rating.toFixed(1) : "Unrated"} / 10 · TMDB</span><p>${escapeHtml(movie.overview)}</p><p>${escapeHtml((movie.genres || []).join(" · "))}${movie.runtime ? ` · ${movie.runtime} min` : ""}</p><p>${movie.cast?.length ? `Cast: ${escapeHtml(movie.cast.join(", "))}` : "Cast information unavailable."}</p><div class="actions">${movie.trailer ? `<a href="${movie.trailer}" target="_blank" rel="noreferrer">Watch trailer ↗</a>` : ""}<button type="button" data-scroll="analyzer">Analyze a review</button></div></div>`;
  $("#detail-section").classList.remove("hidden");
  $("#detail-section").scrollIntoView({ behavior: "smooth" });
}

async function search(event) {
  event.preventDefault();
  const query = $("#search-input").value.trim();
  if (query.length < 2) return;
  $("#status").textContent = "Searching the movie archive...";
  try {
    const response = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error);
    $("#trending-grid").innerHTML = data.results.length ? data.results.map(card).join("") : '<p class="loading">No matching movies found.</p>';
    addOptions(data.results);
    $("#status").textContent = `${data.results.length} result(s) from TMDB.`;
  } catch (error) { $("#status").textContent = error.message; }
}

async function analyze(event) {
  event.preventDefault();
  const review = $("#review").value;
  const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review }) });
  const data = await response.json();
  if (!response.ok || !data.ok) { $("#review-result").innerHTML = `<span class="result-placeholder">${escapeHtml(data.error)}</span>`; return; }
  const result = data.result;
  $("#review-result").innerHTML = `<div><div class="score">${result.sentiment}</div><div class="score-label">COMPOUND ${result.compound.toFixed(3)}</div><div class="bars">positive ${result.positive.toFixed(3)} · negative ${result.negative.toFixed(3)} · neutral ${result.neutral.toFixed(3)}</div></div>`;
}

async function ask(event) {
  event.preventDefault();
  const question = $("#question").value.trim();
  const movie = state.movies.get($("#movie-select").value) || state.selected;
  if (!question || !movie) return;
  $("#chat").insertAdjacentHTML("beforeend", `<p class="user-message">${escapeHtml(question)}</p><p class="assistant-message">Checking the available sources...</p>`);
  $("#question").value = "";
  const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movie, question, spoilers: $("#spoilers").checked }) });
  const data = await response.json();
  $("#chat").lastElementChild.textContent = response.ok && data.ok ? data.answer : data.error;
}

$("#theme-toggle")?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#search-form")?.addEventListener("submit", search);
$("#review-form")?.addEventListener("submit", analyze);
$("#ask-form")?.addEventListener("submit", ask);
$("#close-detail")?.addEventListener("click", () => $("#detail-section").classList.add("hidden"));
document.addEventListener("click", (event) => {
  const open = event.target.closest(".movie-open");
  if (open) showDetail(open.dataset.id).catch((error) => { $("#status").textContent = error.message; });
  const scroll = event.target.closest("[data-scroll]");
  if (scroll) document.getElementById(scroll.dataset.scroll).scrollIntoView({ behavior: "smooth" });
});
if ($("#trending-grid")) {
  loadTrending().catch((error) => { $("#trending-grid").innerHTML = `<p class="loading">${escapeHtml(error.message)}</p>`; });
}
