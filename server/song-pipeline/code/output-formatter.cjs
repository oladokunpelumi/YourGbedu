// YourGbedu V2 — Final Output Formatter
// Converts internal state to the paste-ready package the operator drops into Suno Custom Mode.
// Runs only when verdict.next_action === "format_final_output" OR status === "needs_human_review"
// (review case still produces a draft package for the human reviewer to grade).

function buildLyricsText(lyrics) {
  if (!lyrics) return "";
  const order = [
    ["intro",        "[Intro]"],
    ["verse_1",      "[Verse 1]"],
    ["pre_chorus",   "[Pre-Chorus]"],
    ["chorus",       "[Chorus]"],
    ["verse_2",      "[Verse 2]"],
    ["bridge",       "[Bridge]"],
    ["final_chorus", "[Final Chorus]"],
    ["outro",        "[Outro]"]
  ];
  return order
    .filter(([k]) => typeof lyrics[k] === "string" && lyrics[k].trim().length > 0)
    .map(([k, label]) => label + "\n" + lyrics[k].trim())
    .join("\n\n");
}

function pickPrimaryTitle(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return "";
  return titles[0];
}

function formatFinalOutput(state) {
  const titles = state.suno_output?.title_options || [];
  const styleP = state.suno_output?.style_prompt || "";
  const lyricsText = buildLyricsText(state.suno_output?.lyrics);

  return {
    order_id: state.order_id,
    customer: {
      sender_name: state.raw_form?.sender_name,
      recipient_name: state.raw_form?.recipient_name,
      occasion: state.raw_form?.occasion,
      genre: state.raw_form?.genre
    },
    title: pickPrimaryTitle(titles),
    title_options: titles,
    suno_style_prompt: styleP,
    suno_lyrics_text: lyricsText,
    quality_summary: {
      passed: state.quality_report?.verdict?.passed,
      soft_average: state.quality_report?.verdict?.soft_average,
      hard_checks: state.quality_report?.hard_checks,
      rewrite_count: state.rewrite_count || 0
    },
    operator_paste_block:
      "ORDER ID: " + state.order_id + "\n" +
      "RECIPIENT: " + state.raw_form?.recipient_name + "  |  OCCASION: " + state.raw_form?.occasion + "  |  GENRE: " + state.raw_form?.genre + "\n\n" +
      "TITLE: " + pickPrimaryTitle(titles) + "\n" +
      (titles.length > 1 ? "(alternates: " + titles.slice(1).join(" | ") + ")\n" : "") +
      "\n=== SUNO STYLE PROMPT ===\n" + styleP + "\n\n" +
      "=== SUNO LYRICS ===\n" + lyricsText + "\n"
  };
}

module.exports = { formatFinalOutput, buildLyricsText };
