```python
from sentiment import classify_sentiment
from review_io import display_results


def main():
    print("========================================")
    print(" Movie Review Sentiment Analysis")
    print("========================================")
    print("Enter a movie review to analyze it.")
    print("Type 'exit' to quit the application.")

    while True:
        review = input("\nEnter your movie review: ")

        if review.strip().lower() == "exit":
            print("Thank you for using the application!")
            break

        if not review.strip():
            print("Review cannot be empty. Please enter a movie review.")
            continue

        try:
            results = classify_sentiment(review)
            display_results(review, results)

        except ValueError as error:
            print(f"Invalid review: {error}")

        except TypeError as error:
            print(f"Invalid input type: {error}")


if __name__ == "__main__":
    main()
```