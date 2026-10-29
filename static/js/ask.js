const askState = { movies: new Map() };
const movieSelect = document.querySelector("#movie-select");
const chat = document.querySelector("#chat");

function addMovie(movie) {
  const id = String(movie.id);
  askState.movies.set(id, movie);
  if (!Array.from(movieSelect.options).some((option) => option.value === id)) {
    movieSelect.add(new Option(`${movie.title} (${movie.year})`, id));
  }
}

async function loadAskMovies() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`/api/movies/catalog?retry=${attempt}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      data.results.forEach(addMovie);
      if (!movieSelect.value) {
        movieSelect.options[0].textContent = "Select a movie";
      }
      return;
    } catch (error) {
      if (attempt === 3) {
        if (!new URLSearchParams(location.search).has("movie_id")) {
          movieSelect.options[0].textContent = "Movie library unavailable — refresh to retry";
          chat.querySelector(".assistant-message").textContent = "The movie library is unavailable right now. Please try again later.";
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
}

async function loadSelectedMovie() {
  const movieId = new URLSearchParams(location.search).get("movie_id");
  if (!movieId) return;
  if (!/^[1-9]\d*$/.test(movieId)) {
    chat.querySelector(".assistant-message").textContent = "That movie link is invalid. Choose a movie from the library instead.";
    return;
  }

  chat.querySelector(".assistant-message").textContent = "Loading the movie you selected...";
  try {
    const response = await fetch(`/api/movies/${movieId}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Movie details could not be loaded.");
    addMovie(data.movie);
    movieSelect.value = String(data.movie.id);
    chat.querySelector(".assistant-message").textContent = `You're asking about ${data.movie.title}. Ask about its story, genres, runtime, or cast.`;
  } catch (error) {
    chat.querySelector(".assistant-message").textContent = `We couldn't load the selected movie: ${error.message}`;
  }
}

document.querySelector("#ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const movie = askState.movies.get(movieSelect.value);
  const questionInput = document.querySelector("#question");
  const question = questionInput.value.trim();
  if (!question) return;
  if (!movie) {
    chat.querySelector(".assistant-message").textContent = "Select a movie first so I know which film to answer about.";
    movieSelect.focus();
    return;
  }
  chat.insertAdjacentHTML("beforeend", `<p class="user-message">${escapeHtml(question)}</p><p class="assistant-message">Thinking...</p>`);
  questionInput.value = "";
  try {
    const response = await fetch("/api/ask", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({movie, question, spoilers: document.querySelector("#spoilers").checked}) });
    const data = await response.json();
    if (response.ok && data.ok) {
      const isGemini = data.source === "Gemini AI";
      const sourceBadge = isGemini ? "✨ CineScope AI (Gemini)" : `TMDB Verified Metadata`;
      const badgeStyle = isGemini
        ? "background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);"
        : "background:rgba(255,255,255,0.08);color:var(--muted,#aaa);";
      chat.lastElementChild.innerHTML = `<span style="display:inline-block;font-size:0.72rem;letter-spacing:0.04em;text-transform:uppercase;padding:0.2rem 0.55rem;border-radius:4px;margin-bottom:0.45rem;font-weight:600;${badgeStyle}">${escapeHtml(sourceBadge)}</span><div>${escapeHtml(data.answer)}</div>`;
    } else {
      chat.lastElementChild.textContent = data.error || "Could not retrieve an answer.";
    }
  } catch (error) {
    chat.lastElementChild.textContent = `Couldn't get an answer: ${error.message}`;
  }
});

loadAskMovies();
loadSelectedMovie();
