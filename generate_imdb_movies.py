import json
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
BASICS_FILE = DATA_DIR / "title.basics.tsv"
RATINGS_FILE = DATA_DIR / "title.ratings.tsv"
OUTPUT_FILE = DATA_DIR / "movies.json"

SELECTED_TYPES = {"movie", "tvMovie"}
MAX_MOVIES = None  # Load all movies


def parse_ratings(path):
    ratings = {}
    with path.open("r", encoding="utf-8", errors="replace") as f:
        header = next(f)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 3:
                continue
            tconst, averageRating, numVotes = parts
            ratings[tconst] = {
                "averageRating": float(averageRating),
                "numVotes": int(numVotes),
            }
    return ratings


def make_poster_url(title):
    safe_title = quote_plus(title[:40])
    return f"https://via.placeholder.com/200x300?text={safe_title}"


def parse_titles(path, ratings):
    movies = []
    with path.open("r", encoding="utf-8", errors="replace") as f:
        headers = next(f).rstrip("\n").split("\t")
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != len(headers):
                continue
            row = dict(zip(headers, parts))
            if row["titleType"] not in SELECTED_TYPES:
                continue
            if row["isAdult"] != "0":
                continue
            if row["startYear"] == "\\N":
                continue
            if row["tconst"] not in ratings:
                continue
            movie_rating = ratings[row["tconst"]]
            movie = {
                "tconst": row["tconst"],
                "title": row["primaryTitle"],
                "originalTitle": row["originalTitle"],
                "year": int(row["startYear"]),
                "genres": [] if row["genres"] == "\\N" else row["genres"].split(","),
                "averageRating": movie_rating["averageRating"],
                "numVotes": movie_rating["numVotes"],
                "posterUrl": make_poster_url(row["primaryTitle"]),
            }
            movies.append(movie)
    return movies


def main():
    print("Parsing IMDB ratings...")
    ratings = parse_ratings(RATINGS_FILE)
    print(f"Loaded ratings for {len(ratings)} titles.")

    print("Parsing IMDB title basics...")
    movies = parse_titles(BASICS_FILE, ratings)
    print(f"Found {len(movies)} matching movies.")

    movies.sort(key=lambda item: (-item["numVotes"], -item["averageRating"], item["title"]))
    selected = movies if MAX_MOVIES is None else movies[:MAX_MOVIES]

    for index, movie in enumerate(selected, start=1):
        movie["id"] = index

    print(f"Writing {len(selected)} movies to {OUTPUT_FILE}")
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(selected, f, indent=2, ensure_ascii=False)

    print("Done.")


if __name__ == "__main__":
    main()
