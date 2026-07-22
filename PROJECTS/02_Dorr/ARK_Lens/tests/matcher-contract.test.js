const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { plain } = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content_bundle.js"), "utf8");
const canonicalLens = JSON.parse(
  fs.readFileSync(path.join(root, "lens-packs", "bob_job_search.json"), "utf8")
);
const matcher = require("../core/deterministic_matcher.js");
const jobCompatibility = require("../compatibility/job_extraction_compat.js");
const jobPolicy = require("../policies/job_policy_runtime.js");

function loadMatcherApi() {
  return {
    containsAny: matcher.containsAny,
    scoreSignals: jobPolicy.scoreSignals
  };
}

function signal(id, options = {}) {
  return {
    id,
    display_name: id,
    keywords: [id],
    match_scope: "all",
    blocker: false,
    qualifies_role_fit: false,
    role_fit_kind: "context",
    reason: `${id} reason`,
    ...options
  };
}

function lensWith(signalGroups, scoringPolicy = {}) {
  return {
    ...plain(canonicalLens),
    signal_groups: signalGroups,
    scoring_policy: {
      ...plain(canonicalLens.scoring_policy),
      ...scoringPolicy
    }
  };
}

function testLexicalBoundaries() {
  const { containsAny } = loadMatcherApi();

  assert.deepEqual([...containsAny("maintain availability in Australia", ["ai"])], []);
  assert.deepEqual([...containsAny("AI-native delivery", ["ai"])], ["ai"]);
  assert.deepEqual(
    [...containsAny("Own PRODUCT-STRATEGY delivery", ["product strategy"])],
    ["product strategy"]
  );
  assert.deepEqual(
    [...containsAny("Own product   strategy delivery", ["product-strategy"])],
    ["product-strategy"]
  );
  assert.deepEqual([...containsAny("AI", ["ai", "AI"])], ["ai", "AI"]);
}

function testScopeAndDuplicateOwnership() {
  const { scoreSignals } = loadMatcherApi();
  const scoped = lensWith({
    scoped: [
      signal("title", {
        keywords: ["captain"],
        match_scope: "title",
        weight: 10,
        qualifies_role_fit: true,
        role_fit_kind: "target"
      }),
      signal("company", { keywords: ["acme"], match_scope: "company", weight: 1 }),
      signal("location", { keywords: ["antarctica"], match_scope: "location", weight: 1 }),
      signal("description", { keywords: ["quantum"], match_scope: "description", weight: 1 }),
      signal("metadata", { keywords: ["ref-42"], match_scope: "metadata", weight: 1 }),
      signal("decoy", { keywords: ["decoy"], match_scope: "company", weight: 50 })
    ]
  });
  const result = scoreSignals(
    "Captain Acme Antarctica Quantum ref-42 decoy",
    scoped,
    {
      title: "Captain",
      company: "Acme",
      location: "Antarctica",
      description: "Quantum",
      metadata: "ref-42"
    }
  );

  assert.deepEqual(
    [...result.signals.positive.map((matched) => matched.id)],
    ["title", "company", "location", "description", "metadata"]
  );

  const duplicate = scoreSignals(
    "Engineering Manager automation",
    lensWith({
      rules: [
        signal("role", {
          keywords: ["engineering manager"],
          match_scope: "title",
          weight: 10,
          qualifies_role_fit: true,
          role_fit_kind: "target"
        }),
        signal("higher_weight", { keywords: ["automation"], weight: 12 }),
        signal("lower_weight", { keywords: ["automation"], weight: 8 })
      ]
    }),
    { title: "Engineering Manager" }
  );

  assert.deepEqual(
    [...duplicate.signals.positive.map((matched) => matched.id)],
    ["role", "lower_weight"]
  );
}

function testScoreEffectsAndExplanations() {
  const { scoreSignals } = loadMatcherApi();
  const target = signal("target", {
    keywords: ["engineering manager"],
    match_scope: "title",
    weight: 5,
    qualifies_role_fit: true,
    role_fit_kind: "target",
    score_floor: 80,
    score_floor_when: "no_negative",
    keyword_score_floor: { score: 88, keywords: ["engineering manager"] }
  });
  const clean = scoreSignals(
    "Engineering Manager",
    lensWith({ rules: [target] }),
    { title: "Engineering Manager" }
  );
  assert.equal(clean.matchScore, 88);
  assert.equal(clean.workflowState, "apply");
  assert.match(clean.reason, /strong product\/engineering leadership match/i);

  const concerned = scoreSignals(
    "Engineering Manager concern",
    lensWith({
      rules: [target, signal("concern", { penalty: 1 })]
    }),
    { title: "Engineering Manager" }
  );
  assert.equal(concerned.matchScore, 39);
  assert.equal(concerned.workflowState, "ignore");

  const capped = scoreSignals(
    "Engineering Manager platform",
    lensWith({
      rules: [
        signal("target", {
          keywords: ["engineering manager"],
          match_scope: "title",
          weight: 60,
          qualifies_role_fit: true,
          role_fit_kind: "target"
        }),
        signal("platform", {
          penalty: 5,
          score_cap: 45,
          outcome_reason: "Capped by explicit platform concern",
          reason_priority: 20
        })
      ]
    }),
    { title: "Engineering Manager" }
  );
  assert.equal(capped.matchScore, 45);
  assert.equal(capped.workflowState, "ignore");
  assert.equal(capped.reason, "Capped by explicit platform concern");

  const forcedWorkflow = scoreSignals(
    "Engineering Manager review-only",
    lensWith({
      rules: [
        signal("target", {
          keywords: ["engineering manager"],
          match_scope: "title",
          weight: 60,
          qualifies_role_fit: true,
          role_fit_kind: "target"
        }),
        signal("review_only", {
          keywords: ["review-only"],
          weight: 1,
          force_workflow_state: "review"
        })
      ]
    }),
    { title: "Engineering Manager" }
  );
  assert.equal(forcedWorkflow.matchScore, 96);
  assert.equal(forcedWorkflow.workflowState, "review");

  const blocked = scoreSignals(
    "Engineering Manager NV1",
    lensWith({
      blockers: [
        signal("clearance", {
          keywords: ["nv1"],
          blocker: true,
          force_score: 0,
          force_workflow_state: "ignore",
          outcome_reason: "Explicit clearance blocker",
          reason_priority: 100
        })
      ],
      rules: [target]
    }),
    { title: "Engineering Manager" }
  );
  assert.equal(blocked.matchScore, 0);
  assert.equal(blocked.workflowState, "ignore");
  assert.equal(blocked.reason, "Explicit clearance blocker");
  assert.deepEqual([...blocked.signals.matched_rule_ids], ["clearance"]);
  assert.deepEqual([...blocked.signals.matched_keywords], ["nv1"]);
}

function testLensItemBoundaryAndPureRuntime() {
  const linkedIn = jobCompatibility.toLensItem({
    source: {
      id: "linkedin_jobs",
      source_item_id: "123",
      url: "https://www.linkedin.com/jobs/view/123/"
    },
    type: "job",
    display: {
      primary_text: "Engineering Manager",
      secondary_text: "Example Co",
      tertiary_text: "Sydney"
    },
    content: {
      summary: "Engineering Manager Example Co Sydney",
      full_text: "Lead engineering teams."
    },
    platform_state: { applied: true, applied_text: "Applied" },
    metadata: { posted: "1 day ago", extraction_mode: "job_detail" }
  });
  const seek = jobCompatibility.toLensItem({
    source: {
      id: "seek_jobs",
      source_item_id: "456",
      url: "https://www.seek.com.au/job/456"
    },
    type: "job",
    display: {
      primary_text: "Head of Product",
      secondary_text: "Example AU",
      tertiary_text: "Melbourne"
    },
    content: { summary: "Head of Product", full_text: "Own product strategy." },
    platform_state: { applied: false },
    metadata: { posted: "2d ago", extraction_mode: "job_detail" }
  });

  assert.deepEqual(
    plain({
      item_id: linkedIn.item_id,
      source_adapter_id: linkedIn.source_adapter_id,
      item_type: linkedIn.item_type,
      source_url: linkedIn.source_url,
      primary_text: linkedIn.primary_text,
      secondary_text: linkedIn.secondary_text,
      body_text: linkedIn.body_text,
      published_at: linkedIn.published_at,
      labels: linkedIn.observable_platform_labels
    }),
    {
      item_id: "123",
      source_adapter_id: "linkedin_jobs",
      item_type: "job",
      source_url: "https://www.linkedin.com/jobs/view/123/",
      primary_text: "Engineering Manager",
      secondary_text: "Example Co",
      body_text: "Lead engineering teams.",
      published_at: "1 day ago",
      labels: ["Applied"]
    }
  );
  assert.equal(seek.source_adapter_id, "seek_jobs");
  assert.equal(seek.metadata.tertiary_text, "Melbourne");

  const genericResult = matcher.matchLensItem(linkedIn, lensWith({
    rules: [signal("leadership", {
      keywords: ["engineering manager"],
      match_scope: "title"
    })]
  }));
  assert.deepEqual(
    plain(genericResult.evidence),
    [{
      rule_id: "leadership",
      group: "rules",
      match_scope: "title",
      keyword: "engineering manager"
    }]
  );
  assert.equal(genericResult.score_or_priority, null);
  assert.equal(genericResult.recommended_action, null);

  [
    "core/lens_item.js",
    "core/deterministic_matcher.js",
    "policies/job_policy_runtime.js"
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /\b(?:document|window|chrome)\b/);
  });
  assert.doesNotMatch(contentSource, /function scoreSignals\(/);
  assert.doesNotMatch(contentSource, /function getMatchedSignals\(/);
}

function testJobDorrPresentationPreservation() {
  assert.deepEqual(plain(jobPolicy.getDorrForWorkflow("applied")), {
    scope: "self",
    color: "green",
    time: "past",
    meaning: "done",
    negated: false,
    label: "🟢 Done"
  });
  assert.deepEqual(plain(jobPolicy.getDorrForWorkflow("apply")), {
    scope: "self",
    color: "yellow",
    time: "future",
    meaning: "do",
    negated: false,
    label: "🟡 Opportunity"
  });
  assert.deepEqual(plain(jobPolicy.getDorrForWorkflow("review")), {
    scope: "self",
    color: "purple",
    time: "now",
    meaning: "review",
    negated: false,
    label: "🟣 Question"
  });
  assert.deepEqual(plain(jobPolicy.getDorrForWorkflow("ignore")), {
    scope: "self",
    color: "yellow",
    time: "future",
    meaning: "skip",
    negated: true,
    label: "🚫🟡 Not Opportunity"
  });
  assert.deepEqual(plain(jobPolicy.getDorrForWorkflow("ignore", true)), {
    scope: "self",
    color: "red",
    time: "future",
    meaning: "skip",
    negated: false,
    label: "🔴 Threat"
  });
}

testLexicalBoundaries();
testScopeAndDuplicateOwnership();
testScoreEffectsAndExplanations();
testLensItemBoundaryAndPureRuntime();
testJobDorrPresentationPreservation();

console.log("ARK Lens matcher behavior-freezing contracts passed");
