import os
import time
import json
import csv
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv

from sentiment import classify_sentiment


load_dotenv(encoding="utf-8-sig")
app = Flask(__name__)

TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"
TMDB_BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/w1280"
catalog_cache = None
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DATA_DIR = Path(__file__).parent / "data"
movies_data = []
credits_data = {}


def _load_dataset():
    movies_path = DATA_DIR / "tmdb_5000_movies.csv"
    credits_path = DATA_DIR / "tmdb_5000_credits.csv"
    if not movies_path.exists() or not credits_path.exists():
        return
    with movies_path.open(encoding="utf-8-sig", newline="") as file:
        movies_data.extend(csv.DictReader(file))
    with credits_path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            credits_data[row["movie_id"]] = row


_load_dataset()


def _tmdb_token():
    return os.getenv("TMDB_API_TOKEN") or os.getenv("TMDB_API_KEY")


def _gemini_key():
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _tmdb_request(path, params=None):
    token = _tmdb_token()
    if not token:
        return None, "TMDB is not configured. Add TMDB_API_TOKEN to your .env file."

    query = ""
    if params:
        query = "?" + "&".join(
            f"{quote(str(key))}={quote(str(value))}" for key, value in params.items()
        )
    headers = {
        "Accept": "application/json",
        "User-Agent": "CineScope/1.0 (student movie discovery project)",
        "Connection": "close",
    }
    if os.getenv("TMDB_API_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    else:
        query += ("&" if query else "?") + f"api_key={quote(token)}"

    last_error = None
    for attempt in range(3):
        try:
            with urlopen(
                Request(f"{TMDB_BASE_URL}{path}{query}", headers=headers),
                timeout=8,
            ) as response:
                return response.status and response.read(), None
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    reason = last_error.reason if hasattr(last_error, "reason") else last_error
    return None, f"Movie provider unavailable: {reason}"


def _gemini_request(prompt, system_instruction=None):
    key = _gemini_key()
    if not key:
        return None, "Gemini is not configured. Add GEMINI_API_KEY to your .env file."

    import json
    preferred = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    candidate_models = [preferred]
    for fallback in ("gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"):
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 600,
        },
    }
    if system_instruction:
        body["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    data = json.dumps(body).encode("utf-8")
    last_error = None

    for model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={quote(key)}"
        req = Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "CineScope/1.0",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
                candidates = payload.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip(), None
                return None, "Gemini returned an empty response."
        except HTTPError as error:
            try:
                error_body = json.loads(error.read().decode("utf-8"))
                error_msg = error_body.get("error", {}).get("message", str(error))
            except Exception:
                error_msg = str(error)
            last_error = f"Gemini error ({error.code}): {error_msg}"
            if error.code == 404:
                continue
        except (URLError, TimeoutError) as error:
            last_error = f"Gemini service unavailable: {error}"
            continue
        except Exception as error:
            last_error = f"Gemini request failed: {error}"
            continue

    return None, last_error


def _decode_tmdb(payload):
    try:
        return json.loads(payload)
    except (TypeError, ValueError):
        return None


def _gemini_answer(movie, question, spoiler_mode):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    prompt = (
        "You are CineScope's factual movie assistant. Answer only from the supplied "
        "TMDB metadata. Do not invent facts, reviews, plot details, endings, or sources. "
        f"Spoiler mode is {'on' if spoiler_mode else 'off'}. If spoiler mode is off, "
        "do not reveal endings or major plot developments. If the metadata does not "
        "support the answer, say that clearly. Keep the answer under 120 words.\n\n"
        f"Movie metadata:\n{movie}\n\nQuestion: {question}"
    )
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 180},
        }
    ).encode("utf-8")
    try:
        with urlopen(
            Request(
                f"{GEMINI_BASE_URL}/{quote(model)}:generateContent?key={quote(api_key)}",
                data=body,
                headers={"Content-Type": "application/json", "User-Agent": "CineScope/1.0"},
                method="POST",
            ),
            timeout=12,
        ) as response:
            data = _decode_tmdb(response.read())
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text or None
    except (HTTPError, URLError, TimeoutError, KeyError, IndexError, TypeError, ValueError):
        return None


def _movie_summary(movie):
    movie_id = str(movie.get("id") or movie.get("movie_id") or "")
    genres = _parse_json_list(movie.get("genres"))
    return {
        "id": movie_id,
        "title": movie.get("title") or movie.get("name") or "Untitled",
        "year": (movie.get("release_date") or "")[:4] or "—",
        "overview": movie.get("overview") or "No overview is available.",
        "rating": movie.get("vote_average"),
        "votes": movie.get("vote_count"),
        "genres": [item.get("name") for item in genres if item.get("name")],
        "poster": None,
        "backdrop": None,
    }


def _parse_json_list(value):
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def _local_movie(movie):
    result = _movie_summary(movie)
    credit = credits_data.get(str(movie.get("id")), {})
    cast = _parse_json_list(credit.get("cast"))
    result["cast"] = [person.get("name") for person in cast[:8] if person.get("name")]
    result["runtime"] = int(movie["runtime"]) if str(movie.get("runtime", "")).isdigit() else None
    result["trailer"] = None
    return result


def _error(message, status=502):
    return jsonify({"ok": False, "error": message}), status


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/movies")
def movies_page():
    return render_template("catalog.html")


@app.get("/movie/<int:movie_id>")
def movie_page(movie_id):
    return render_template("movie.html", movie_id=movie_id)


@app.get("/analyzer")
def analyzer_page():
    return render_template("analyzer.html")


@app.get("/ask")
def ask_page():
    return render_template("ask.html")


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "service": "cinescope",
        "metadata_source": "TMDB 5000 local dataset" if movies_data else "unavailable",
        "tmdb_configured": bool(_tmdb_token()),
        "gemini_configured": bool(_gemini_key()),
    })


@app.get("/api/movies/search")
def search_movies():
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return _error("Enter at least two characters to search.", 400)
    query = query.casefold()
    results = [
        _local_movie(movie)
        for movie in movies_data
        if query in (movie.get("title") or "").casefold()
        or query in (movie.get("original_title") or "").casefold()
    ]
    results.sort(key=lambda movie: movie.get("rating") or 0, reverse=True)
    return jsonify({"ok": True, "source": "TMDB 5000 local dataset", "results": results[:24]})


@app.get("/api/movies/trending")
def trending_movies():
    results = sorted(movies_data, key=lambda movie: float(movie.get("popularity") or 0), reverse=True)
    return jsonify({"ok": True, "source": "TMDB 5000 local dataset", "results": [_local_movie(movie) for movie in results[:24]]})


@app.get("/api/movies/catalog")
def movie_catalog():
    global catalog_cache
    if catalog_cache is not None:
        return jsonify({"ok": True, "source": "TMDB 5000 local dataset", "count": len(catalog_cache), "results": catalog_cache})

    filtered = [movie for movie in movies_data if movie.get("original_language") in {"en", "hi"}]
    filtered.sort(key=lambda movie: float(movie.get("popularity") or 0), reverse=True)
    results = [_local_movie(movie) for movie in filtered[:100]]
    catalog_cache = results
    return jsonify({"ok": True, "source": "TMDB 5000 local dataset", "count": len(results), "results": results})


@app.get("/api/movies/<int:movie_id>")
def movie_details(movie_id):
    local_movie = next((movie for movie in movies_data if str(movie.get("id")) == str(movie_id)), None)
    if local_movie:
        return jsonify({"ok": True, "source": "TMDB 5000 local dataset", "movie": _local_movie(local_movie)})
    payload, error = _tmdb_request(f"/movie/{movie_id}", {"append_to_response": "credits,videos"})
    if error:
        return _error(error)
    movie = _decode_tmdb(payload)
    if not isinstance(movie, dict) or not movie.get("id"):
        return _error("The movie provider returned an invalid response.")
    result = _movie_summary(movie)
    result.update(
        {
            "runtime": movie.get("runtime"),
            "genres": [genre["name"] for genre in movie.get("genres", []) if genre.get("name")],
            "cast": [person["name"] for person in movie.get("credits", {}).get("cast", [])[:8]],
            "trailer": next(
                (
                    f"https://www.youtube.com/watch?v={video['key']}"
                    for video in movie.get("videos", {}).get("results", [])
                    if video.get("site") == "YouTube" and video.get("type") == "Trailer"
                ),
                None,
            ),
        }
    )
    return jsonify({"ok": True, "source": "TMDB", "movie": result})


@app.post("/api/analyze")
def analyze_review():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "review" not in body:
        return _error("A review string is required.", 400)
    review_text = body.get("review")
    try:
        sentiment_result = classify_sentiment(review_text)
    except (TypeError, ValueError) as error:
        return _error(str(error), 400)

    ai_insight = None
    if _gemini_key():
        prompt = (
            f"A user submitted the following movie review:\n\n"
            f"\"{review_text.strip()}\"\n\n"
            f"VADER classified it as {sentiment_result['sentiment']} "
            f"(compound score: {sentiment_result['compound']:.2f}). "
            f"In 1 to 2 concise sentences, provide an AI insight explaining the emotional tone and key themes expressed in this review."
        )
        system_inst = "You are CineScope's AI movie review critic. Be concise, perceptive, and helpful."
        insight_text, _ = _gemini_request(prompt, system_inst)
        if insight_text:
            ai_insight = insight_text

    response_data = {
        "ok": True,
        "result": sentiment_result,
        "gemini_enabled": bool(_gemini_key()),
    }
    if ai_insight:
        response_data["ai_insight"] = ai_insight
    return jsonify(response_data)


@app.post("/api/ask")
def ask_about_movie():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("A movie and question are required.", 400)
    movie = body.get("movie")
    question = body.get("question", "").strip()
    spoiler_mode = bool(body.get("spoilers"))
    if not isinstance(movie, dict) or not movie.get("title") or not question:
        return _error("A movie and question are required.", 400)

    lowered = question.lower()
    if any(word in lowered for word in ("ending", "ends", "dies", "kill", "death", "twist")) and not spoiler_mode:
        answer = "Spoiler-free mode is on, so I will not reveal major plot developments. Turn on spoilers to ask about the ending."
        return jsonify({"ok": True, "answer": answer, "kind": "boundary", "source": "TMDB", "spoilers": spoiler_mode})

    # If Gemini is configured, use it for rich, context-aware answers
    if _gemini_key():
        cast_str = ", ".join(movie.get("cast", [])[:8]) or "Cast not listed"
        genres_str = ", ".join(movie.get("genres", [])) or "Genres not listed"
        overview = movie.get("overview") or "No overview available."
        year = movie.get("year") or "Unknown"
        runtime = f"{movie.get('runtime')} minutes" if movie.get("runtime") else "Runtime not listed"

        prompt = (
            f"Movie Context:\n"
            f"- Title: {movie.get('title')} ({year})\n"
            f"- Genres: {genres_str}\n"
            f"- Runtime: {runtime}\n"
            f"- Cast: {cast_str}\n"
            f"- Overview: {overview}\n\n"
            f"User Question: {question}\n\n"
            f"Rules:\n"
            f"1. Spoilers allowed: {'YES' if spoiler_mode else 'NO'}.\n"
            f"2. If spoilers are NO, do NOT reveal major plot twists, endings, or character deaths.\n"
            f"3. Give a clear, helpful, well-written response in 1-3 concise paragraphs.\n"
            f"4. Stay grounded in the film's verified details."
        )
        system_inst = "You are CineScope's AI movie assistant, giving film lovers knowledgeable, spoiler-aware answers."
        gemini_answer, err = _gemini_request(prompt, system_inst)
        if gemini_answer:
            return jsonify({
                "ok": True,
                "answer": gemini_answer,
                "kind": "gemini_ai",
                "source": "Gemini AI",
                "spoilers": spoiler_mode,
            })

    # Fallback to verified TMDB metadata rules if Gemini is not configured or unavailable
    if "who" in lowered and "cast" in lowered:
        cast = ", ".join(movie.get("cast", [])) or "The cast list is not available."
        answer = f"Available cast information for {movie['title']}: {cast}."
        kind = "verified"
    elif any(word in lowered for word in ("genre", "genres", "runtime", "long")):
        genres = ", ".join(movie.get("genres", [])) or "not available"
        runtime = f"{movie['runtime']} minutes" if movie.get("runtime") else "not available"
        answer = f"TMDB lists {movie['title']} as {genres}; runtime: {runtime}."
        kind = "verified"
    elif any(word in lowered for word in ("about", "plot", "story", "overview")):
        answer = f"TMDB describes {movie['title']} this way: {movie.get('overview') or 'No overview is available.'}"
        kind = "verified"
    else:
        answer = "I can answer from the available TMDB metadata, but this question needs a fuller source than this app currently has. I will not guess."
        kind = "unavailable"
    if kind == "unavailable":
        generated = _gemini_answer(movie, question, spoiler_mode)
        if generated:
            answer = generated
            kind = "gemini_grounded"
    source = "TMDB + Gemini" if kind == "gemini_grounded" else "TMDB"
    return jsonify({"ok": True, "answer": answer, "kind": kind, "source": source, "spoilers": spoiler_mode})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5002")),
        debug=os.getenv("FLASK_DEBUG", "").lower() == "true",
    )
