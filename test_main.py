import main


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json["ok"] is True


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
