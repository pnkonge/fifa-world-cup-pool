"""
WC 2026 Pool - Elo Baseline Model (v1)
======================================
Trains an Elo rating system on every international match since 1872,
backtests on past World Cups, and predicts the remaining WC 2026 matches.

This is a BASELINE. Beat it later with Poisson goal models and gradient
boosting. Don't be precious about it.

Run as a script: python elo_baseline.py
Or open in VS Code with Python extension - the # %% markers make it a notebook.
"""

# %% ---------------------------------------------------------------------------
# 1. Imports & setup
# -----------------------------------------------------------------------------
import pandas as pd
import numpy as np
from collections import defaultdict
from pathlib import Path

DATA_URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"
OUT_DIR = Path("outputs")
OUT_DIR.mkdir(exist_ok=True)

# %% ---------------------------------------------------------------------------
# 2. Load match data
# -----------------------------------------------------------------------------
# Mart Jürisoo's dataset - every international match since 1872.
# Same one that's on Kaggle, mirrored on GitHub so we can fetch directly.
print("Loading match data...")
df = pd.read_csv(DATA_URL, parse_dates=["date"])
df = df.sort_values("date").reset_index(drop=True)
print(f"  {len(df):,} matches, {df['date'].min().date()} → {df['date'].max().date()}")

# %% ---------------------------------------------------------------------------
# 3. Elo parameters
# -----------------------------------------------------------------------------
# These are the knobs. Tune later. Defaults below are reasonable starting
# points based on what FiveThirtyEight and similar models use.
INITIAL_RATING = 1500
K_BASE = 30                  # base learning rate per match
HOME_ADVANTAGE = 65          # rating bonus when playing at home (not neutral)

# Tournament importance multipliers - friendlies are noisy, WC matches are signal.
TOURNAMENT_WEIGHTS = {
    "Friendly": 0.5,
    "FIFA World Cup": 1.6,
    "FIFA World Cup qualification": 1.0,
    "UEFA Euro": 1.4,
    "UEFA Euro qualification": 0.9,
    "Copa América": 1.3,
    "African Cup of Nations": 1.2,
    "AFC Asian Cup": 1.2,
    "CONCACAF Gold Cup": 1.1,
    "Confederations Cup": 1.1,
    "UEFA Nations League": 1.0,
    "CONCACAF Nations League": 0.9,
}
DEFAULT_TOURN_WEIGHT = 0.8


def tournament_weight(name: str) -> float:
    return TOURNAMENT_WEIGHTS.get(name, DEFAULT_TOURN_WEIGHT)


def goal_diff_multiplier(score_h: float, score_a: float) -> float:
    """538-style scaling - blowouts update ratings more, but with diminishing returns."""
    gd = abs(score_h - score_a)
    if gd <= 1:
        return 1.0
    elif gd == 2:
        return 1.5
    else:
        return (11 + gd) / 8.0


def expected_score(rating_a: float, rating_b: float) -> float:
    """Standard Elo expected score - probability A 'wins' treating draws as half."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


# %% ---------------------------------------------------------------------------
# 4. Train: walk every match in chronological order, updating ratings.
#    Also store pre-match rating diff + outcome for later draw-rate calibration.
# -----------------------------------------------------------------------------
print("\nTraining Elo ratings (one pass through history)...")

ratings: dict[str, float] = defaultdict(lambda: INITIAL_RATING)
calibration_rows = []  # (rating_diff, outcome) for fitting draw probs later

for row in df.itertuples(index=False):
    if pd.isna(row.home_score) or pd.isna(row.away_score):
        continue  # skip unplayed (includes the future WC 2026 fixtures)

    r_h = ratings[row.home_team] + (0 if row.neutral else HOME_ADVANTAGE)
    r_a = ratings[row.away_team]
    diff = r_h - r_a

    if row.home_score > row.away_score:
        outcome = "H"
        actual_h = 1.0
    elif row.home_score < row.away_score:
        outcome = "A"
        actual_h = 0.0
    else:
        outcome = "D"
        actual_h = 0.5

    calibration_rows.append((diff, outcome))

    expected_h = expected_score(r_h, r_a)
    k = K_BASE * tournament_weight(row.tournament) * goal_diff_multiplier(
        row.home_score, row.away_score
    )
    delta = k * (actual_h - expected_h)
    ratings[row.home_team] += delta
    ratings[row.away_team] -= delta

print(f"  Built ratings for {len(ratings):,} teams")

# %% ---------------------------------------------------------------------------
# 5. Sanity check - current top 20
# -----------------------------------------------------------------------------
top20 = sorted(ratings.items(), key=lambda x: -x[1])[:20]
print("\nTop 20 teams by current Elo:")
for i, (team, r) in enumerate(top20, 1):
    print(f"  {i:2d}. {team:30s} {r:7.1f}")

# %% ---------------------------------------------------------------------------
# 6. Calibrate draw probability empirically.
#    Pure Elo only gives a 2-way prob (treating draw as half a win). To get
#    P(W)/P(D)/P(L) we look at how often draws *actually* happened at each
#    rating-difference band in our training data.
# -----------------------------------------------------------------------------
calib = pd.DataFrame(calibration_rows, columns=["diff", "outcome"])

BIN_EDGES = np.arange(-800, 801, 50)
calib["bin"] = pd.cut(calib["diff"], bins=BIN_EDGES, labels=False)

bin_stats = (
    calib.groupby("bin")["outcome"]
    .value_counts(normalize=True)
    .unstack(fill_value=0)
    .reindex(columns=["H", "D", "A"], fill_value=0)
)

# Smooth lightly so sparse bins don't give weird probs
bin_stats = bin_stats.rolling(window=3, min_periods=1, center=True).mean()

# Lookup helper
BIN_CENTERS = (BIN_EDGES[:-1] + BIN_EDGES[1:]) / 2


def lookup_probs(rating_diff: float) -> dict[str, float]:
    """Return calibrated {home_win, draw, away_win} probabilities."""
    diff_clipped = np.clip(rating_diff, BIN_EDGES[0] + 1, BIN_EDGES[-1] - 1)
    bin_idx = int(np.searchsorted(BIN_EDGES, diff_clipped) - 1)
    bin_idx = max(0, min(bin_idx, len(bin_stats) - 1))
    row = bin_stats.iloc[bin_idx]
    return {"home_win": float(row["H"]), "draw": float(row["D"]), "away_win": float(row["A"])}


# Sanity check the calibration curve
print("\nDraw rate by rating-diff bin (sanity check - should peak near zero diff):")
for diff in [-400, -200, -50, 0, 50, 200, 400]:
    p = lookup_probs(diff)
    print(f"  diff={diff:+5d}: H={p['home_win']:.2f}  D={p['draw']:.2f}  A={p['away_win']:.2f}")


# %% ---------------------------------------------------------------------------
# 7. Predict function
# -----------------------------------------------------------------------------
def predict(home: str, away: str, neutral: bool = True) -> dict[str, float]:
    """Probability of {home_win, draw, away_win} for a future match."""
    if home not in ratings:
        print(f"  WARNING: unknown team {home!r}, using default rating")
    if away not in ratings:
        print(f"  WARNING: unknown team {away!r}, using default rating")
    r_h = ratings[home] + (0 if neutral else HOME_ADVANTAGE)
    r_a = ratings[away]
    return lookup_probs(r_h - r_a)


# %% ---------------------------------------------------------------------------
# 8. Backtest: how would these ratings have predicted past World Cups?
#    For an honest backtest, we'd retrain with knowledge cutoffs. For a
#    baseline, we'll just compute Brier score on every WC match using the
#    rating that *existed at the time of that match* - which we capture by
#    re-running the loop and snapshotting.
# -----------------------------------------------------------------------------
def brier_3way(probs: dict[str, float], outcome: str) -> float:
    """Multi-class Brier score. Outcome is 'H', 'D', or 'A'."""
    targets = {"H": "home_win", "D": "draw", "A": "away_win"}
    return sum(
        (probs[outcome_key] - (1.0 if outcome_key == targets[outcome] else 0.0)) ** 2
        for outcome_key in ["home_win", "draw", "away_win"]
    )


print("\nBacktest: predicting past WCs with rating-at-the-time...")

snapshot: dict[str, float] = defaultdict(lambda: INITIAL_RATING)
backtest_results = []

for row in df.itertuples(index=False):
    if pd.isna(row.home_score) or pd.isna(row.away_score):
        continue

    r_h = snapshot[row.home_team] + (0 if row.neutral else HOME_ADVANTAGE)
    r_a = snapshot[row.away_team]

    is_wc = row.tournament == "FIFA World Cup"
    if is_wc and row.date.year >= 2014:
        probs = lookup_probs(r_h - r_a)
        if row.home_score > row.away_score:
            outcome = "H"
        elif row.home_score < row.away_score:
            outcome = "A"
        else:
            outcome = "D"
        # baseline = uniform 1/3 each
        uniform = {"home_win": 1 / 3, "draw": 1 / 3, "away_win": 1 / 3}
        backtest_results.append(
            {
                "year": row.date.year,
                "home": row.home_team,
                "away": row.away_team,
                "outcome": outcome,
                "p_h": probs["home_win"],
                "p_d": probs["draw"],
                "p_a": probs["away_win"],
                "brier_model": brier_3way(probs, outcome),
                "brier_uniform": brier_3way(uniform, outcome),
                "correct": (
                    (outcome == "H" and probs["home_win"] == max(probs.values()))
                    or (outcome == "D" and probs["draw"] == max(probs.values()))
                    or (outcome == "A" and probs["away_win"] == max(probs.values()))
                ),
            }
        )

    # update snapshot
    expected_h = expected_score(r_h, r_a)
    actual_h = 1.0 if row.home_score > row.away_score else (0.0 if row.home_score < row.away_score else 0.5)
    k = K_BASE * tournament_weight(row.tournament) * goal_diff_multiplier(row.home_score, row.away_score)
    delta = k * (actual_h - expected_h)
    snapshot[row.home_team] += delta
    snapshot[row.away_team] -= delta

bt = pd.DataFrame(backtest_results)
print(f"  Matches backtested: {len(bt)}")
print(f"  Mean Brier (model):   {bt['brier_model'].mean():.4f}")
print(f"  Mean Brier (uniform): {bt['brier_uniform'].mean():.4f}")
print(f"  Lower is better. Skill vs uniform: "
      f"{(1 - bt['brier_model'].mean() / bt['brier_uniform'].mean()) * 100:.1f}%")
print(f"  Pick accuracy (argmax): {bt['correct'].mean():.1%}")

print("\n  By tournament:")
print(bt.groupby("year")[["brier_model", "brier_uniform", "correct"]].mean().round(4))

# %% ---------------------------------------------------------------------------
# 9. Predict the remaining WC 2026 matches
# -----------------------------------------------------------------------------
upcoming = df[
    (df["tournament"] == "FIFA World Cup")
    & (df["date"].dt.year == 2026)
    & (df["home_score"].isna())
].copy()

print(f"\nPredicting {len(upcoming)} remaining WC 2026 matches...")

preds = []
for row in upcoming.itertuples(index=False):
    p = predict(row.home_team, row.away_team, neutral=True)
    # Pick = highest-probability outcome
    if p["home_win"] >= max(p["draw"], p["away_win"]):
        pick = f"{row.home_team} Win"
    elif p["away_win"] >= p["draw"]:
        pick = f"{row.away_team} Win"
    else:
        pick = "Draw"
    preds.append(
        {
            "date": row.date.date(),
            "home": row.home_team,
            "away": row.away_team,
            "p_home_win": round(p["home_win"], 3),
            "p_draw": round(p["draw"], 3),
            "p_away_win": round(p["away_win"], 3),
            "model_pick": pick,
            "confidence": round(max(p.values()), 3),
        }
    )

preds_df = pd.DataFrame(preds)
print(preds_df.head(20).to_string(index=False))

out_path = OUT_DIR / "wc2026_predictions.csv"
preds_df.to_csv(out_path, index=False)
print(f"\nFull predictions written to: {out_path}")

# %% ---------------------------------------------------------------------------
# 10. Also dump current ratings for all WC 2026 teams
# -----------------------------------------------------------------------------
wc_teams = sorted(set(upcoming["home_team"]) | set(upcoming["away_team"]))
ratings_df = pd.DataFrame(
    [{"team": t, "elo": round(ratings[t], 1)} for t in wc_teams]
).sort_values("elo", ascending=False)

ratings_path = OUT_DIR / "wc2026_team_ratings.csv"
ratings_df.to_csv(ratings_path, index=False)
print(f"WC 2026 team ratings written to: {ratings_path}")
print("\nTop 10 in the tournament:")
print(ratings_df.head(10).to_string(index=False))
