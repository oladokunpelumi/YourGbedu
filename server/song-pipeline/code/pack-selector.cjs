// YourGbedu V2 — Pack Selector
// Deterministic. No LLM. Reads form fields, returns merged pack object.
//
// In n8n: paste the OCCASIONS / GENRES / VOICES JSON inline as consts below,
// or use the Set node to inject them. For a custom backend later, require()
// the JSON files from /packs.

// ---- BEGIN INLINE PACK DATA (kept in sync with /packs/*.json) ----
// On any pack edit, regenerate this block from the JSON files.
// Or in n8n, pull packs via an HTTP Request to a Git-hosted raw URL.

const OCCASIONS = require('../packs/occasions.json');
const GENRES    = require('../packs/genres.json');
const VOICES    = require('../packs/relationship-voices.json');

// ---- END INLINE PACK DATA ----

const HOOK_TYPE_BY_INTENSITY = {
  soft:              ["phrase_hook", "memory_hook", "name_hook"],
  medium:            ["phrase_hook", "praise_hook", "promise_hook"],
  deeply_emotional:  ["confession_hook", "question_hook", "phrase_hook"]
};

function selectPacks(form) {
  const occasion = OCCASIONS[form.occasion] || OCCASIONS.other;
  const genre    = GENRES[form.genre];
  const voice    = VOICES[form.recipient_type] || VOICES.other;

  if (!genre) {
    throw new Error("Pack Selector: unknown genre '" + form.genre + "'");
  }

  // Apply intensity adjustment to genre
  const intensityAdjustment =
    form.emotion_intensity === "deeply_emotional" ? genre.emotional_adjustments?.emotional :
    form.emotion_intensity === "soft"             ? genre.emotional_adjustments?.soft :
    null;

  // Apply occasion-specific adjustment to genre (e.g., memorial + afro_rnb)
  const occasionAdjustment = genre.emotional_adjustments?.[form.occasion] || null;

  // Religious language steer (gospel only)
  const religiousAdjustment =
    form.religious_language === "strong" ? genre.emotional_adjustments?.strong_religious :
    form.religious_language === "light"  ? genre.emotional_adjustments?.light_religious :
    null;

  // Hook type recommendation — intersect occasion best_hook_types with intensity-preferred set
  const intensityHooks = HOOK_TYPE_BY_INTENSITY[form.emotion_intensity] || HOOK_TYPE_BY_INTENSITY.medium;
  const overlap = occasion.best_hook_types.filter(h => intensityHooks.includes(h));
  const recommended_hook_type = overlap[0] || occasion.best_hook_types[0];

  return {
    occasion_key: form.occasion,
    genre_key: form.genre,
    recipient_type_key: form.recipient_type,

    occasion_pack: occasion,
    genre_pack: genre,
    relationship_voice: voice,

    derived: {
      recommended_hook_type,
      intensity_adjustment: intensityAdjustment,
      occasion_adjustment: occasionAdjustment,
      religious_adjustment: religiousAdjustment,
      combined_avoid: [
        ...(occasion.avoid || []),
        ...(genre.avoid || []),
        ...(voice.avoid || []),
        ...(form.things_to_avoid ? [form.things_to_avoid] : [])
      ],
      combined_style_modifiers: [
        ...(occasion.style_modifier || []),
        intensityAdjustment,
        occasionAdjustment,
        religiousAdjustment
      ].filter(Boolean)
    }
  };
}

module.exports = { selectPacks };
