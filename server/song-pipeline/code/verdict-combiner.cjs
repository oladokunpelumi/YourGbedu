// YourGbedu V2 — Verdict Combiner
// Runs after both Hard Checks and the Soft LLM Judge.
// Decides: pass, rewrite, or human review.

const SOFT_SCORE_KEYS = ["emotional_specificity", "singability", "hook_strength", "genre_fit", "occasion_fit"];
const SOFT_MIN = 7;       // a single score below 7 = soft fail
const SOFT_AVG_MIN = 7.5; // average must clear 7.5

function combineVerdict(state) {
  const hard = state.quality_report?.hard_checks || {};
  const soft = state.quality_report?.soft_scores || {};
  const rewriteCount = state.rewrite_count || 0;

  // Soft analysis
  const presentScores = SOFT_SCORE_KEYS
    .map(k => ({ key: k, val: soft[k] }))
    .filter(s => typeof s.val === "number");
  const softLowest = presentScores.reduce((acc, s) => s.val < acc.val ? s : acc, { key: null, val: 10 });
  const softAvg = presentScores.length === 0 ? 0 :
    presentScores.reduce((acc, s) => acc + s.val, 0) / presentScores.length;
  const softPassed = softLowest.val >= SOFT_MIN && softAvg >= SOFT_AVG_MIN;

  const hardPassed = hard.passed === true;

  // Aggregate weak sections + rewrite instructions
  const weakSections = new Set(hard.weak_sections || []);
  const rewriteInstructions = [...(hard.rewrite_instructions || [])];

  if (!softPassed) {
    // Map low soft scores to which section likely needs work
    if (typeof soft.hook_strength === "number" && soft.hook_strength < SOFT_MIN) {
      weakSections.add("chorus");
      rewriteInstructions.push("Strengthen hook: chorus scored " + soft.hook_strength + "/10. Make the central phrase more singable and emotionally precise.");
    }
    if (typeof soft.emotional_specificity === "number" && soft.emotional_specificity < SOFT_MIN) {
      weakSections.add("verse_1");
      weakSections.add("verse_2");
      rewriteInstructions.push("Emotional specificity is generic (" + soft.emotional_specificity + "/10). Replace abstract feeling with concrete action, memory, or sensory image.");
    }
    if (typeof soft.singability === "number" && soft.singability < SOFT_MIN) {
      weakSections.add("chorus");
      weakSections.add("pre_chorus");
      rewriteInstructions.push("Singability is weak (" + soft.singability + "/10). Shorten lines, reduce consonant clusters, prefer vowel-ending phrases on stresses.");
    }
    if (typeof soft.genre_fit === "number" && soft.genre_fit < SOFT_MIN) {
      weakSections.add("style_prompt");
      rewriteInstructions.push("Genre fit is off (" + soft.genre_fit + "/10). Align style prompt + lyric voice with the selected genre pack.");
    }
    if (typeof soft.occasion_fit === "number" && soft.occasion_fit < SOFT_MIN) {
      weakSections.add("bridge");
      rewriteInstructions.push("Occasion fit is off (" + soft.occasion_fit + "/10). Adjust emotional arc to match the occasion pack's emotional center.");
    }
  }

  const overallPassed = hardPassed && softPassed;

  let nextAction;
  let status;
  if (overallPassed) {
    nextAction = "format_final_output";
    status = "passed";
  } else if (rewriteCount < 2) {
    nextAction = "rewrite";
    status = "in_progress";
  } else {
    nextAction = "human_review";
    status = "needs_human_review";
  }

  return {
    passed: overallPassed,
    hard_passed: hardPassed,
    soft_passed: softPassed,
    soft_average: Number(softAvg.toFixed(2)),
    soft_lowest: softLowest.key ? { dimension: softLowest.key, value: softLowest.val } : null,
    weak_sections: Array.from(weakSections),
    rewrite_instructions: rewriteInstructions,
    rewrite_count: rewriteCount,
    next_action: nextAction,
    status
  };
}

module.exports = { combineVerdict };
