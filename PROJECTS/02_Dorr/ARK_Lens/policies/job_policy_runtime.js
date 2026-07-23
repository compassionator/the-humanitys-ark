(function initializeArkJobPolicy(root, factory) {
  const matcher = typeof module !== "undefined" && module.exports
    ? require("../core/deterministic_matcher.js")
    : root.ARK_DETERMINISTIC_MATCHER;
  const jobCompatibility = typeof module !== "undefined" && module.exports
    ? require("../compatibility/job_extraction_compat.js")
    : root.ARK_JOB_EXTRACTION_COMPATIBILITY;
  const api = factory(matcher, jobCompatibility);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_JOB_POLICY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobPolicy(
  matcher,
  jobCompatibility
) {
  if (!matcher || !jobCompatibility) {
    throw new Error("ARK matcher and Job compatibility runtime must load before job policy.");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dedupeMatchedPositiveSignals(signals) {
    const ownersByKeyword = new Map();

    signals.forEach((signal, signalIndex) => {
      (signal.keywords || []).forEach((keyword) => {
        const key = matcher.normalize(keyword).trim();
        if (!key) return;

        const owners = ownersByKeyword.get(key) || [];
        owners.push(signalIndex);
        ownersByKeyword.set(key, owners);
      });
    });

    const assignedKeywords = signals.map(() => []);

    ownersByKeyword.forEach((owners, keyword) => {
      const ownerIndex = owners.reduce((bestIndex, candidateIndex) => {
        const bestWeight = signals[bestIndex].weight || 0;
        const candidateWeight = signals[candidateIndex].weight || 0;
        return candidateWeight < bestWeight ? candidateIndex : bestIndex;
      }, owners[0]);
      const originalKeyword = (signals[ownerIndex].keywords || []).find(
        (value) => matcher.normalize(value).trim() === keyword
      );

      assignedKeywords[ownerIndex].push(originalKeyword || keyword);
    });

    return signals.flatMap((signal, signalIndex) => {
      if (assignedKeywords[signalIndex].length === 0) {
        return [];
      }

      return [{
        ...signal,
        keywords: assignedKeywords[signalIndex]
      }];
    });
  }

  function joinSignalReasons(signals, fallback) {
    const reasons = signals
      .map((signal) => signal.reason)
      .filter(Boolean);

    return reasons.length ? reasons.join("; ") : fallback;
  }

  function scoreMatchedSignals(matchResult, lensPack) {
    const policy = lensPack.scoring_policy;
    const thresholds = policy.thresholds;
    const confidence = policy.confidence;
    const reasons = policy.reasons;
    const matched = matchResult.matched_signals || [];
    const blockers = matched.filter((signal) => signal.blocker);
    const positive = dedupeMatchedPositiveSignals(
      matched.filter((signal) => !signal.blocker && (signal.weight || 0) > 0)
    );
    const negative = matched.filter(
      (signal) => !signal.blocker && (signal.penalty || 0) > 0
    );
    const positiveScore = positive.reduce((sum, signal) => sum + (signal.weight || 0), 0);
    const negativeScore = negative.reduce((sum, signal) => sum + (signal.penalty || 0), 0);
    const hasRoleFitEvidence = matched.some(
      (signal) => !signal.blocker && signal.qualifies_role_fit
    );

    if (blockers.length > 0) {
      const blockerReason = [...blockers]
        .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
        .find((signal) => signal.outcome_reason)?.outcome_reason;
      return {
        matchScore: blockers.reduce(
          (score, signal) => signal.force_score === undefined
            ? score
            : Math.min(score, signal.force_score),
          policy.min_score
        ),
        workflowState: blockers.find((signal) => signal.force_workflow_state)
          ?.force_workflow_state || "ignore",
        reason: blockerReason || reasons.blocker,
        signals: {
          positive,
          negative,
          blockers,
          matched_rule_ids: blockers.map((signal) => signal.id),
          matched_keywords: blockers.flatMap((signal) => signal.keywords)
        },
        confidence: confidence.blocker
      };
    }

    const hasNegative = negative.length > 0;
    const hasTargetRoleTitle = positive.some((signal) => signal.role_fit_kind === "target");
    const hasAdjacentRoleTitle = positive.some((signal) => signal.role_fit_kind === "adjacent");
    let matchScore = (
      hasRoleFitEvidence ? policy.role_fit_base_score + positiveScore : 0
    ) - negativeScore;

    positive.forEach((signal) => {
      const floorAllowed = signal.score_floor_when !== "no_negative" || !hasNegative;
      if (floorAllowed && signal.score_floor !== undefined) {
        matchScore = Math.max(matchScore, signal.score_floor);
      }

      const keywordFloor = signal.keyword_score_floor;
      if (
        floorAllowed &&
        keywordFloor?.score !== undefined &&
        signal.keywords.some((keyword) =>
          (keywordFloor.keywords || []).some(
            (candidate) => matcher.normalize(candidate).trim() === matcher.normalize(keyword).trim()
          )
        )
      ) {
        matchScore = Math.max(matchScore, keywordFloor.score);
      }
    });

    if (hasNegative) {
      matchScore = Math.min(matchScore, policy.any_negative_score_cap);
    }

    [...positive, ...negative].forEach((signal) => {
      if (signal.score_cap !== undefined) {
        matchScore = Math.min(matchScore, signal.score_cap);
      }
    });

    const forcedScores = [...positive, ...negative]
      .filter((signal) => signal.force_score !== undefined)
      .map((signal) => signal.force_score);
    if (forcedScores.length > 0) {
      matchScore = Math.min(...forcedScores);
    }

    matchScore = clamp(matchScore, policy.min_score, policy.max_score);

    const forcedWorkflow = [...positive, ...negative]
      .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
      .find((signal) => signal.force_workflow_state)?.force_workflow_state;
    const workflowState = forcedWorkflow || (
      matchScore >= thresholds.apply_min ? "apply" :
      matchScore >= thresholds.review_min ? "review" :
      "ignore"
    );
    const decisiveReason = [...negative]
      .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
      .find((signal) => signal.outcome_reason)?.outcome_reason;
    let reason = decisiveReason || reasons.default;

    if (decisiveReason) {
      reason = decisiveReason;
    } else if (!hasRoleFitEvidence && positive.length > 0) {
      reason = reasons.context_without_role_fit;
    } else if (matchScore >= thresholds.apply_min) {
      reason = hasTargetRoleTitle
        ? reasons.strong_target
        : reasons.strong_evidence;
    } else if (hasAdjacentRoleTitle) {
      if (hasNegative) {
        const template = reasons.adjacent_with_concerns;
        reason = template.replace(
          "{reasons}",
          joinSignalReasons(negative, "mixed signals")
        );
      } else {
        reason = reasons.adjacent;
      }
    } else if (
      !hasNegative &&
      positive.length > 0 &&
      matchScore >= thresholds.review_min
    ) {
      reason = hasTargetRoleTitle
        ? reasons.good_target
        : reasons.relevant_evidence;
    } else if (hasNegative && matchScore >= thresholds.review_min) {
      const template = reasons.review_with_concerns;
      reason = template.replace(
        "{reasons}",
        joinSignalReasons(negative, "mixed positive and negative signals")
      );
    } else if (positive.length > 0) {
      reason = reasons.limited_evidence;
    } else {
      reason = reasons.no_signals;
    }

    return {
      matchScore,
      workflowState,
      reason,
      signals: {
        positive,
        negative,
        blockers,
        matched_rule_ids: [...positive, ...negative].map((signal) => signal.id),
        matched_keywords: [...positive, ...negative].flatMap((signal) => signal.keywords)
      },
      confidence: positive.length || negative.length
        ? confidence.matched
        : confidence.unmatched
    };
  }

  function scoreLensItem(lensItem, lensPack) {
    return scoreMatchedSignals(matcher.matchLensItem(lensItem, lensPack), lensPack);
  }

  function scoreSignals(text, lensPack, context = {}) {
    return scoreMatchedSignals(matcher.matchScopedText({
      all: text,
      title: context.title || "",
      company: context.company || "",
      location: context.location || "",
      description: context.description || "",
      metadata: context.metadata || ""
    }, lensPack), lensPack);
  }

  function getDorrForWorkflow(workflowState, hasBlocker = false) {
    const byState = {
      applied: {
        scope: "self",
        color: "green",
        time: "past",
        meaning: "done",
        negated: false,
        label: "🟢 Done"
      },
      apply: {
        scope: "self",
        color: "yellow",
        time: "future",
        meaning: "do",
        negated: false,
        label: "🟡 Opportunity"
      },
      review: {
        scope: "self",
        color: "purple",
        time: "now",
        meaning: "review",
        negated: false,
        label: "🟣 Question"
      },
      blockerIgnore: {
        scope: "self",
        color: "red",
        time: "future",
        meaning: "skip",
        negated: false,
        label: "🔴 Threat"
      },
      ignore: {
        scope: "self",
        color: "yellow",
        time: "future",
        meaning: "skip",
        negated: true,
        label: "🚫🟡 Not Opportunity"
      }
    };

    if (workflowState === "ignore" && hasBlocker) {
      return byState.blockerIgnore;
    }

    return byState[workflowState] || byState.review;
  }

  function classifyLensItem(lensItem, lensPack) {
    const scored = scoreLensItem(lensItem, lensPack);
    const policy = lensPack.scoring_policy || {};

    if (lensItem.metadata?.platform_state?.applied) {
      return {
        workflow_state: "applied",
        lens_pack_id: lensPack.lens_pack_id,
        lens_pack_version: lensPack.lens_pack_version,
        lens_pack_name: lensPack.name || null,
        dorr: getDorrForWorkflow("applied"),
        action: lensPack.behavior || "report_only",
        reason: policy.reasons.applied,
        match_score: scored.matchScore,
        signals: scored.signals,
        confidence: policy.confidence.applied
      };
    }

    return {
      workflow_state: scored.workflowState,
      lens_pack_id: lensPack.lens_pack_id,
      lens_pack_version: lensPack.lens_pack_version,
      lens_pack_name: lensPack.name || null,
      dorr: getDorrForWorkflow(scored.workflowState, scored.signals.blockers.length > 0),
      action: lensPack.behavior || "report_only",
      reason: scored.reason,
      match_score: scored.matchScore,
      signals: scored.signals,
      confidence: scored.confidence
    };
  }

  function classifyExtractedJob(extracted, lensPack) {
    return classifyLensItem(jobCompatibility.toLensItem(extracted), lensPack);
  }

  return {
    classifyExtractedJob,
    classifyLensItem,
    getDorrForWorkflow,
    scoreLensItem,
    scoreSignals
  };
});
