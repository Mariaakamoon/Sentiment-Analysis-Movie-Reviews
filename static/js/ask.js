const askState = { movies: new Map() };
async function loadAskMovies() {
  const select = document.querySelector("#movie-select");
  try {
    const response = await fetch("/api/movies/catalog");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error);
    data.results.forEach((movie) => { askState.movies.set(String(movie.id), movie); select.add(new Option(`${movie.title} (${movie.year})`, movie.id)); });
  } catch (error) { select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`; }
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
