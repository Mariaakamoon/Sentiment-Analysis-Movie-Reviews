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
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const target = $("#review-result");
  button.disabled = true;
  button.innerHTML = 'Reading the room... <span>✳</span>';
  target.innerHTML = '<span class="result-placeholder">Tuning into the audience reaction...</span>';

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review: $("#review").value }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not analyze this review.");

    const result = data.result;
    const mood = ["positive", "negative", "neutral"].includes(result.sentiment.toLowerCase())
      ? result.sentiment.toLowerCase()
      : "neutral";
    const emoji = { positive: "☺", negative: "☹", neutral: "◌" }[mood];
    const compound = Number(result.compound);
    const compoundPosition = Math.max(0, Math.min(100, (compound + 1) * 50));
    const scores = ["positive", "negative", "neutral"].map((label) => {
      const score = Math.max(0, Math.min(1, Number(result[label])));
      return `<div class="score-row"><span>${label}</span><div class="score-track" role="meter" aria-label="${label} score" aria-valuemin="0" aria-valuemax="1" aria-valuenow="${score.toFixed(3)}"><span class="score-fill ${label}" style="width:${(score * 100).toFixed(1)}%"></span></div><span class="score-value">${score.toFixed(3)}</span></div>`;
    }).join("");
    const compoundClass = compound > 0 ? "positive" : compound < 0 ? "negative" : "neutral";
    target.innerHTML = `<div class="result-content"><div class="result-topline"><div><div class="result-kicker">The audience is feeling...</div><h3 class="result-sentiment ${mood}">${escapeHtml(result.sentiment)}</h3></div><span class="sentiment-stamp" aria-hidden="true">${emoji}</span></div><div class="compound-card"><div class="compound-heading"><span>OVERALL VIBE</span><span class="compound-value">${compound.toFixed(3)}</span></div><div class="compound-track" role="meter" aria-label="Overall sentiment" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="${compound.toFixed(3)}"><span class="compound-fill ${compoundClass}" style="width:${compoundPosition}%"></span></div></div><div class="score-list">${scores}</div></div>`;
  } catch (error) {
    target.innerHTML = `<span class="result-placeholder">${escapeHtml(error.message || "Could not connect to the sentiment analyzer. Please try again.")}</span>`;
  } finally {
    button.disabled = false;
    button.innerHTML = `${button.dataset.label || "Analyze sentiment"} <span>→</span>`;
  }
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
if ($("#trending-grid")) {
  $("#search-form")?.addEventListener("submit", search);
  $("#review-form")?.addEventListener("submit", analyze);
  $("#ask-form")?.addEventListener("submit", ask);
}
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

const reviewInput = $("#review");
if (reviewInput) {
  const count = $("#review-count");
  const submitButton = $("#review-form").querySelector('button[type="submit"]');
  submitButton.dataset.label = submitButton.textContent.trim().replace(/\s*→$/, "");
  const updateReviewCount = () => {
    const length = reviewInput.value.length;
    count.textContent = `${length} ${length === 1 ? "character" : "characters"}`;
  };
  reviewInput.addEventListener("input", updateReviewCount);
  document.querySelectorAll("[data-review]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewInput.value = button.dataset.review;
      updateReviewCount();
      reviewInput.focus();
    });
  });
}
