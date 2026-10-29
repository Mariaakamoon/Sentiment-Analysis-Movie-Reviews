import main


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert "tmdb_configured" in response.json
    assert "gemini_configured" in response.json


def test_health_reflects_gemini_env(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    response = client.get("/health")
    assert response.json["gemini_configured"] is True

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    response = client.get("/health")
    assert response.json["gemini_configured"] is False


def test_qa_uses_gemini_when_configured(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(
        main,
        "_gemini_request",
        lambda prompt, system_instruction=None: ("Gemini test answer about the film.", None),
    )
    response = client.post(
        "/api/ask",
        json={"movie": {"title": "Inception", "overview": "A dream within a dream.", "cast": ["Leonardo DiCaprio"]}, "question": "What is the theme?", "spoilers": False},
    )
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["source"] == "Gemini AI"
    assert response.json["answer"] == "Gemini test answer about the film."


def test_qa_fallback_when_gemini_unavailable(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(
        main,
        "_gemini_request",
        lambda prompt, system_instruction=None: (None, "Quota exceeded"),
    )
    response = client.post(
        "/api/ask",
        json={"movie": {"title": "Inception", "overview": "A dream within a dream.", "genres": ["Action", "Sci-Fi"]}, "question": "What genre is this?", "spoilers": False},
    )
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["source"] == "TMDB"
    assert "Action, Sci-Fi" in response.json["answer"]


def test_analyze_with_gemini_insight(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(
        main,
        "_gemini_request",
        lambda prompt, system_instruction=None: ("A profoundly moving and thoughtful performance.", None),
    )
    response = client.post("/api/analyze", json={"review": "A truly breathtaking movie with superb acting."})
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert set(response.json["result"]) == {"sentiment", "positive", "negative", "neutral", "compound"}
    assert response.json["ai_insight"] == "A profoundly moving and thoughtful performance."


def test_separate_pages_render(client):
    for path in ("/movies", "/movie/1", "/analyzer", "/ask"):
        assert client.get(path).status_code == 200


def test_catalog_requires_tmdb_without_fabricating_movies(client, monkeypatch):
    monkeypatch.delenv("TMDB_API_TOKEN", raising=False)
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    response = client.get("/api/movies/catalog")
    assert response.status_code == 502
    assert response.json["ok"] is False
    assert response.json["error"].startswith("TMDB is not configured")


def test_analyze_endpoint_preserves_classifier_contract(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "classify_sentiment",
        lambda review: {
            "sentiment": "Positive",
            "positive": 0.8,
            "negative": 0.0,
            "neutral": 0.2,
            "compound": 0.8,
        },
    )
    response = client.post("/api/analyze", json={"review": "A lovely film"})
    assert response.status_code == 200
    assert set(response.json["result"]) == {"sentiment", "positive", "negative", "neutral", "compound"}


def test_analyze_endpoint_rejects_blank_review(client):
    response = client.post("/api/analyze", json={"review": " "})
    assert response.status_code == 400
    assert response.json["ok"] is False


def test_qa_honors_spoiler_free_mode(client):
    response = client.post(
        "/api/ask",
        json={"movie": {"title": "Example", "overview": "A story.", "cast": []}, "question": "What is the ending?", "spoilers": False},
    )
    assert response.status_code == 200
    assert "will not reveal" in response.json["answer"]


import pytest


@pytest.fixture
def client():
    main.app.config.update(TESTING=True)
    with main.app.test_client() as test_client:
        yield test_client
