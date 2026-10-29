
from nltk.sentiment import SentimentIntensityAnalyzer


def classify_sentiment(review):
    """
    Classify a movie review as Positive, Negative, or Neutral.

    Returns a dictionary containing the sentiment label and
    VADER's positive, negative, neutral, and compound scores.
    """

    # Reject non-string inputs.
    if not isinstance(review, str):
        raise TypeError("Review must be a string.")

    # Reject empty reviews or reviews containing only spaces.
    if not review.strip():
        raise ValueError("Review cannot be empty or blank.")

    # Initialize VADER and calculate sentiment scores.
    analyzer = SentimentIntensityAnalyzer()
    scores = analyzer.polarity_scores(review)

    # Classify the review using the compound score.
    compound = scores["compound"]

    if compound >= 0.05:
        sentiment = "Positive"
    elif compound <= -0.05:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"

    # Return exactly the five required keys.
    return {
        "sentiment": sentiment,
        "positive": scores["pos"],
        "negative": scores["neg"],
        "neutral": scores["neu"],
        "compound": compound,
    }
