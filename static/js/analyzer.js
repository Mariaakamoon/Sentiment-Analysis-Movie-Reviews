document.querySelector("#review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const review = document.querySelector("#review").value;
  const target = document.querySelector("#review-result");
  const response = await fetch("/api/analyze", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({review}) });
  const data = await response.json();
  if (!response.ok || !data.ok) { target.innerHTML = `<span class="result-placeholder">${escapeHtml(data.error)}</span>`; return; }
  const result = data.result;
  target.innerHTML = `<div><div class="score">${result.sentiment}</div><div class="score-label">COMPOUND ${result.compound.toFixed(3)}</div><div class="bars">positive ${result.positive.toFixed(3)} · negative ${result.negative.toFixed(3)} · neutral ${result.neutral.toFixed(3)}</div></div>`;
});
