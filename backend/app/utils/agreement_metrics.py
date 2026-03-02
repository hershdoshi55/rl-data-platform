"""Inter-annotator agreement metrics.

Provides three metrics:
- Agreement percentage (within ±1 point)
- Cohen's kappa (for two raters)
- Krippendorff's alpha (interval scale, for any number of raters)
"""

from __future__ import annotations

from collections import Counter
from typing import List


def compute_agreement_percentage(scores: List[float]) -> float:
    """Compute the percentage of score pairs within 1 point of each other.

    Given N scores for the same item, considers all C(N, 2) unique pairs and
    returns the fraction where |score_i - score_j| <= 1.

    Args:
        scores: List of numeric scores (e.g. overall_score values 1–7).

    Returns:
        Float in [0.0, 1.0].  Returns 1.0 if fewer than 2 scores.
    """
    if len(scores) < 2:
        return 1.0

    total_pairs = 0
    agreeing_pairs = 0

    for i in range(len(scores)):
        for j in range(i + 1, len(scores)):
            total_pairs += 1
            if abs(scores[i] - scores[j]) <= 1.0:
                agreeing_pairs += 1

    return agreeing_pairs / total_pairs if total_pairs > 0 else 1.0


def compute_cohens_kappa(rater1: List, rater2: List) -> float:
    """Compute Cohen's kappa between two raters.

    Handles both nominal and ordinal categories.  Returns the standard kappa
    formula:  κ = (P_o - P_e) / (1 - P_e)

    Args:
        rater1: List of ratings from rater 1.
        rater2: List of ratings from rater 2.

    Returns:
        Float in [-1, 1].  Returns 0.0 if the lists have fewer than 2 items
        or P_e == 1 (perfect expected agreement, degenerate case).

    Raises:
        ValueError: if rater1 and rater2 have different lengths.
    """
    if len(rater1) != len(rater2):
        raise ValueError("rater1 and rater2 must have the same length")

    n = len(rater1)
    if n == 0:
        return 0.0

    categories = set(rater1) | set(rater2)

    # Observed agreement
    p_o = sum(1 for a, b in zip(rater1, rater2) if a == b) / n

    # Expected agreement
    count1 = Counter(rater1)
    count2 = Counter(rater2)
    p_e = sum((count1[cat] / n) * (count2[cat] / n) for cat in categories)

    if p_e == 1.0:
        return 0.0  # Degenerate case

    kappa = (p_o - p_e) / (1.0 - p_e)
    return kappa


def compute_krippendorff_alpha(ratings: List[List]) -> float:
    """Compute Krippendorff's alpha for interval-level data.

    Supports any number of raters and handles missing values (None).

    Args:
        ratings: A list of lists where ratings[i][j] is the rating from
                 rater i on item j.  Missing ratings should be None.

    Returns:
        Float in [-1, 1].  Returns 1.0 if there is no disagreement and
        0.0 if there are fewer than 2 valid units or raters.
    """
    if not ratings or len(ratings) < 2:
        return 0.0

    n_items = max(len(r) for r in ratings)

    # Build coincidence matrix approach via pairable values per unit
    # Using the simplified interval formula:
    # D_o = sum over all units of all pairable disagreements / n_pairable
    # D_e = expected disagreement based on marginal distribution

    # Collect all (value_a, value_b) coincident pairs across all units
    observed_sum = 0.0
    n_pairable = 0

    all_values: List[float] = []

    for j in range(n_items):
        unit_ratings = []
        for rater_ratings in ratings:
            if j < len(rater_ratings) and rater_ratings[j] is not None:
                unit_ratings.append(float(rater_ratings[j]))

        all_values.extend(unit_ratings)
        m_u = len(unit_ratings)
        if m_u < 2:
            continue  # Cannot form pairs

        # Sum of squared differences for all pairs in this unit (interval metric)
        for a in range(len(unit_ratings)):
            for b in range(a + 1, len(unit_ratings)):
                diff_sq = (unit_ratings[a] - unit_ratings[b]) ** 2
                observed_sum += diff_sq
                n_pairable += 1

    if n_pairable == 0:
        return 1.0  # No disagreement possible

    D_o = observed_sum / n_pairable

    # Expected disagreement: mean of all pairwise squared differences in data
    n_vals = len(all_values)
    if n_vals < 2:
        return 1.0

    expected_sum = 0.0
    expected_count = 0
    for i in range(n_vals):
        for j in range(i + 1, n_vals):
            expected_sum += (all_values[i] - all_values[j]) ** 2
            expected_count += 1

    D_e = expected_sum / expected_count if expected_count > 0 else 0.0

    if D_e == 0.0:
        return 1.0  # Perfect agreement (all values identical)

    alpha = 1.0 - (D_o / D_e)
    return alpha
