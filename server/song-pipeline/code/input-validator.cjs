// YourGbedu V2 — Input Validator
// Pure function. No LLM. Runs as the first stage after the webhook.
//
// Contract:
//   input:  raw form JSON (see schemas/form.schema.json)
//   output: { is_valid, missing_fields, input_depth, warnings, normalized }
//
// Used in n8n as the body of a Code node (drop in $input.item.json as form).

const REQUIRED_FIELDS = [
  "sender_name",
  "recipient_name",
  "recipient_type",
  "occasion",
  "genre",
  "voice_gender",
  "tone_preference",
  "relationship_energy",
  "emotion_intensity"
];

const VALID_ENUMS = {
  recipient_type:      ["husband","wife","boyfriend","girlfriend","children","father","mother","sibling","friend","myself","other"],
  occasion:            ["birthday","anniversary","wedding","valentine","appreciation","apology","memorial","graduation","proposal","welcome_baby","just_because","other"],
  genre:               ["afro_beats","afro_rnb","afro_house","afro_reggae","gospel","rnb","hip_hop","pop","soul","highlife"],
  voice_gender:        ["female","male","no_preference"],
  tone_preference:     ["tender","joyful","funny","emotional","romantic","spiritual","sensual","reflective","proud","healing"],
  relationship_energy: ["playful","protective","passionate","calm","grateful","healing","proud","devotional","nostalgic"],
  emotion_intensity:   ["soft","medium","deeply_emotional"],
  language_flavor:     ["english_only","light_pidgin","light_yoruba","light_igbo","light_hausa","nigerian_english","no_preference"],
  song_length:         ["short","standard","extended"],
  explicitness:        ["clean","mild"],
  religious_language:  ["none","light","strong"],
  spoken_intro:        ["yes","no","auto"]
};

// Story fields drive input depth scoring
const STORY_FIELDS = ["what_makes_special", "favorite_memories", "heart_message"];

function strLen(v) {
  return (typeof v === "string") ? v.trim().length : 0;
}

function validateInput(form) {
  const missing = [];
  const warnings = [];
  const invalidEnums = [];

  // Required field presence
  for (const field of REQUIRED_FIELDS) {
    if (!form[field] || strLen(form[field]) === 0) {
      missing.push(field);
    }
  }

  // Enum validity for present fields
  for (const [field, allowed] of Object.entries(VALID_ENUMS)) {
    if (form[field] && !allowed.includes(form[field])) {
      invalidEnums.push({ field, value: form[field], allowed });
    }
  }

  // Defaults for optional fields (filled to keep downstream stages predictable)
  const normalized = {
    ...form,
    language_flavor:    form.language_flavor    || "no_preference",
    song_length:        form.song_length        || "standard",
    explicitness:       form.explicitness       || "clean",
    religious_language: form.religious_language || "none",
    spoken_intro:       form.spoken_intro       || "auto",
    things_to_avoid:    form.things_to_avoid    || "",
    occasion_detail:    form.occasion_detail    || "",
    specific_phrase_to_include: form.specific_phrase_to_include || ""
  };

  // Input depth scoring — drives how much the downstream stages rely on the form vs the packs
  const storyChars = STORY_FIELDS.reduce((acc, f) => acc + strLen(form[f]), 0);
  let inputDepth;
  if (storyChars >= 250)      inputDepth = "rich";
  else if (storyChars >= 80)  inputDepth = "moderate";
  else                        inputDepth = "thin";

  if (inputDepth === "thin") {
    warnings.push("Story input is thin. Downstream stages will lean on packs and tone preference more than customer-specific detail.");
  }

  // Conflict warnings (non-fatal)
  if (form.occasion === "memorial" && ["afro_house", "afro_beats"].includes(form.genre)) {
    warnings.push("Memorial + " + form.genre + " is unusual. Genre pack will downshift to reverent treatment.");
  }
  if (form.occasion === "apology" && form.tone_preference === "joyful") {
    warnings.push("Apology + joyful tone is unusual. Tone will be softened to humble.");
  }
  if (form.religious_language === "strong" && form.genre !== "gospel" && !["wedding","memorial","welcome_baby","graduation"].includes(form.occasion)) {
    warnings.push("Strong religious language outside gospel/sacred occasions. Lyrics will balance reverence with genre fit.");
  }

  const is_valid = missing.length === 0 && invalidEnums.length === 0;

  return {
    is_valid,
    missing_fields: missing,
    invalid_enums: invalidEnums,
    input_depth: inputDepth,
    story_chars: storyChars,
    warnings,
    normalized
  };
}

module.exports = { validateInput, VALID_ENUMS };
