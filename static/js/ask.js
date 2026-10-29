const askState = { movies: new Map() };
async function loadAskMovies() {
  const select = document.querySelector("#movie-select");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      select.innerHTML = `<option value="">Loading movie library (attempt ${attempt}/3)...</option>`;
      const response = await fetch(`/api/movies/catalog?retry=${attempt}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      select.innerHTML = '<option value="">Select a movie</option>';
      data.results.forEach((movie) => { askState.movies.set(String(movie.id), movie); select.add(new Option(`${movie.title} (${movie.year})`, movie.id)); });
      return;
    } catch (error) {
      if (attempt === 3) {
        select.innerHTML = `<option value="">Movie library unavailable — refresh to retry</option>`;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
}
document.querySelector("#ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const movie = askState.movies.get(document.querySelector("#movie-select").value);
  const questionInput = document.querySelector("#question");
  const question = questionInput.value.trim();
  if (!movie || !question) return;
  const chat = document.querySelector("#chat");
  chat.insertAdjacentHTML("beforeend", `<p class="user-message">${escapeHtml(question)}</p><p class="assistant-message">Checking verified metadata...</p>`);
  questionInput.value = "";
  const response = await fetch("/api/ask", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({movie, question, spoilers: document.querySelector("#spoilers").checked}) });
  const data = await response.json();
  chat.lastElementChild.textContent = response.ok && data.ok ? data.answer : data.error;
});
loadAskMovies();
