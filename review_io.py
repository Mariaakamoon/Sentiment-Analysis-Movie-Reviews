def display_results(review, results):
    print("\n--- Sentiment Analysis Results ---")
    print(f"Original Review: {review}")
    print(f"Sentiment: {results['sentiment']}")
    print(f"Positive Score: {results['positive']:.3f}")
    print(f"Negative Score: {results['negative']:.3f}")
    print(f"Neutral Score: {results['neutral']:.3f}")
    print(f"Compound Score: {results['compound']:.3f}")
    print("----------------------------------")