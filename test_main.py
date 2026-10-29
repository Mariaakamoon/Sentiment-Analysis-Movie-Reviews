import main


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json["ok"] is True


def test_separate_pages_render(client):
    for path in ("/movies", "/movie/1", "/analyzer", "/ask"):
        assert client.get(path).status_code == 200


def test_catalog_uses_local_dataset_without_tmdb(client, monkeypatch):
    monkeypatch.delenv("TMDB_API_TOKEN", raising=False)
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    response = client.get("/api/movies/catalog")
    assert response.status_code == 200
    assert response.json["ok"] is True
    assert response.json["source"] == "TMDB 5000 local dataset"
    assert response.json["count"] <= 100


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


def test_qa_uses_grounded_gemini_when_configured(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(main, "_gemini_answer", lambda movie, question, spoilers: "Grounded answer.")
    response = client.post(
        "/api/ask",
        json={"movie": {"title": "Example", "overview": "A story.", "cast": []}, "question": "Is it worth watching?", "spoilers": False},
    )
    assert response.status_code == 200
    assert response.json["answer"] == "Grounded answer."
    assert response.json["kind"] == "gemini_grounded"


import pytest


@pytest.fixture
def client():
    main.app.config.update(TESTING=True)
    with main.app.test_client() as test_client:
        yield test_client
