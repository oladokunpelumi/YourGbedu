// YourGbedu V2 — Hard Quality Checks
// Deterministic, code-only. Runs after lyric generation, before the soft LLM judge.
// Catches the cheap wins (banned phrases, missing details, name overuse) without
// burning an LLM call.

const BANNED_GENERIC_PHRASES = [
  "you are my everything",
  "one in a million",
  "forever and always",
  "ride or die",
  "angel from above",
  "light up my world",
  "queen of my heart",
  "king of my heart",
  "through the storm",
  "words can't explain",
  "words cant explain",
  "you complete me",
  "my better half",
  "i love you more than words can say",
  "i love you more than words",
  "happy birthday to you",
  "for he's a jolly good fellow",
  "diamonds in the sky",
  "stars in the sky",
  "ride or die"
];

// Stopwords excluded when extracting "specific phrase" tokens from heart_message
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","of","in","on","at","to","for","with","by",
  "is","are","was","were","be","been","being","have","has","had","do","does","did","this",
  "that","these","those","i","you","he","she","we","they","it","my","your","his","her",
  "our","their","me","him","us","them","so","as","not","no","nor","yes","just"
]);

function lowercaseFlatten(lyrics) {
  if (!lyrics) return "";
  if (typeof lyrics === "string") return lyrics.toLowerCase();
  return Object.values(lyrics).filter(Boolean).join(" ").toLowerCase();
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function bigrams(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + " " + tokens[i + 1]);
  return out;
}

function chorusEchoesHeartMessage(chorusText, heartMessage) {
  if (!heartMessage || strLen(heartMessage) < 10) {
    // No heart message provided — skip this check (not a fail)
    return { applicable: false, passed: true };
  }
  const chorusTokens = tokenize(chorusText);
  const heartTokens  = tokenize(heartMessage).filter(t => !STOPWORDS.has(t) && t.length > 2);
  if (heartTokens.length === 0) return { applicable: false, passed: true };

  // Echo = at least one significant bigram from heart_message appears in chorus,
  // OR at least 30% of heart message's significant tokens appear in chorus.
  const heartBigrams = bigrams(heartTokens);
  const chorusJoined = chorusTokens.join(" ");
  const bigramHit = heartBigrams.some(bg => chorusJoined.includes(bg));

  const chorusSet = new Set(chorusTokens);
  const overlap = heartTokens.filter(t => chorusSet.has(t)).length;
  const ratio = overlap / heartTokens.length;
  const ratioHit = ratio >= 0.3;

  return {
    applicable: true,
    passed: bigramHit || ratioHit,
    detail: { bigram_hit: bigramHit, token_overlap_ratio: Number(ratio.toFixed(2)) }
  };
}

function storyDetailsCount(lyricsFlat, form) {
  // Pull candidate story tokens from the customer's free-text fields
  const sources = [
    form.what_makes_special,
    form.favorite_memories,
    form.specific_phrase_to_include
  ].filter(Boolean).join(" ");

  if (!sources) return { count: 0, applicable: false, details_found: [] };

  // Heuristic: any noun-ish token of length >= 4 that is not a stopword is a candidate detail
  const candidates = Array.from(new Set(
    tokenize(sources).filter(t => t.length >= 4 && !STOPWORDS.has(t))
  ));

  const found = candidates.filter(t => lyricsFlat.includes(t));
  return {
    count: found.length,
    applicable: true,
    details_found: found.slice(0, 10),
    candidates_total: candidates.length
  };
}

function bannedPhrasesFound(lyricsFlat) {
  return BANNED_GENERIC_PHRASES.filter(p => lyricsFlat.includes(p));
}

function recipientNameCount(lyricsFlat, recipientName) {
  if (!recipientName) return 0;
  const needle = recipientName.toLowerCase();
  let count = 0, idx = 0;
  while ((idx = lyricsFlat.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function sectionLabelsComplete(lyrics) {
  const required = ["intro","verse_1","pre_chorus","chorus","verse_2","bridge","final_chorus","outro"];
  if (typeof lyrics !== "object" || lyrics === null) return false;
  return required.every(s => typeof lyrics[s] === "string" && lyrics[s].trim().length > 0);
}

function strLen(v) { return (typeof v === "string") ? v.trim().length : 0; }

function runHardChecks(state) {
  const lyrics = state.suno_output?.lyrics;
  const form = state.normalized_form || state.raw_form;
  const flat = lowercaseFlatten(lyrics);

  const chorusEcho = chorusEchoesHeartMessage(lyrics?.chorus, form.heart_message);
  const stories    = storyDetailsCount(flat, form);
  const banned     = bannedPhrasesFound(flat);
  const nameCount  = recipientNameCount(flat, form.recipient_name);
  const labelsOk   = sectionLabelsComplete(lyrics);

  // Fail criteria — the contract
  const weakSections = [];
  const rewriteInstructions = [];

  if (chorusEcho.applicable && !chorusEcho.passed) {
    weakSections.push("chorus");
    rewriteInstructions.push("Rewrite chorus to echo the customer's heart message: \"" + form.heart_message + "\".");
  }

  // Need >= 2 story details if the customer provided rich/moderate input
  const depth = state.validated_input?.input_depth || "thin";
  const minStoryDetails = depth === "rich" ? 3 : depth === "moderate" ? 2 : 1;
  if (stories.applicable && stories.count < minStoryDetails) {
    weakSections.push("verse_1", "verse_2");
    rewriteInstructions.push(
      "Lyrics use only " + stories.count + " of the customer's specific details (target: " + minStoryDetails + "). " +
      "Weave in at least " + (minStoryDetails - stories.count) + " more from: " + stories.candidates_total + " available."
    );
  }

  if (banned.length > 0) {
    weakSections.push("chorus", "bridge");
    rewriteInstructions.push("Remove banned generic phrases: " + banned.map(p => "\"" + p + "\"").join(", ") + ".");
  }

  if (nameCount > 3) {
    weakSections.push("verse_1", "verse_2", "chorus");
    rewriteInstructions.push("Recipient name used " + nameCount + " times — reduce to 1-3 natural mentions.");
  }

  if (!labelsOk) {
    weakSections.push("structure");
    rewriteInstructions.push("Lyric output is missing required sections. Ensure all of: intro, verse_1, pre_chorus, chorus, verse_2, bridge, final_chorus, outro are present and non-empty.");
  }

  const passed = weakSections.length === 0;

  return {
    chorus_echoes_heart_message: chorusEcho.applicable ? chorusEcho.passed : null,
    story_details_count: stories.count,
    story_details_min_met: stories.applicable ? stories.count >= minStoryDetails : null,
    banned_phrases_found: banned,
    recipient_name_count: nameCount,
    recipient_name_in_range: nameCount >= 1 && nameCount <= 3,
    section_labels_complete: labelsOk,
    passed,
    weak_sections: Array.from(new Set(weakSections)),
    rewrite_instructions: rewriteInstructions
  };
}

module.exports = { runHardChecks, BANNED_GENERIC_PHRASES };
