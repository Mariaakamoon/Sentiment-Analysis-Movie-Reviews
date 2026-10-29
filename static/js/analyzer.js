document.querySelector("#review-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const review = document.querySelector("#review").value;
  const target = document.querySelector("#review-result");
  target.innerHTML = `<span class="result-placeholder">Analyzing emotional tone...</span>`;
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({review}) });
    const data = await response.json();
    if (!response.ok || !data.ok) { target.innerHTML = `<span class="result-placeholder">${escapeHtml(data.error)}</span>`; return; }
    const result = data.result;
    let html = `<div><div class="score">${result.sentiment}</div><div class="score-label">COMPOUND ${result.compound.toFixed(3)}</div><div class="bars">positive ${result.positive.toFixed(3)} · negative ${result.negative.toFixed(3)} · neutral ${result.neutral.toFixed(3)}</div>`;
    if (data.ai_insight) {
      html += `<div class="ai-insight" style="margin-top:1.25rem;padding:0.85rem 1rem;border-radius:8px;background:rgba(255,255,255,0.05);border-left:3px solid #6366f1;"><div style="font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600;margin-bottom:0.35rem;">✨ Gemini AI Insight</div><p style="margin:0;font-size:0.92rem;line-height:1.5;">${escapeHtml(data.ai_insight)}</p></div>`;
    }
    html += `</div>`;
    target.innerHTML = html;
  } catch (error) {
    target.innerHTML = `<span class="result-placeholder">${escapeHtml(error.message)}</span>`;
  }
});
