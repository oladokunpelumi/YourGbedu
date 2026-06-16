const DEFAULT_MODELS = {
    intake: 'anthropic/claude-haiku-4.5',
    sonnet: 'anthropic/claude-sonnet-4.6',
};
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_RETRIES = 3;

function extractJSON(text) {
    let clean = String(text || '').trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    }
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first === -1 || last === -1) {
        throw new Error(`LLM response did not contain JSON: ${clean.slice(0, 200)}`);
    }
    return JSON.parse(clean.slice(first, last + 1));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUsage(usage = {}) {
    const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
    return {
        input_tokens: input,
        output_tokens: output,
        total_tokens: usage.total_tokens ?? (input + output),
        raw: usage,
    };
}

function textFromContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
    }).join('');
}

async function requestJSONWithRetry(request) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await request();
            const body = await res.text();
            if (res.status === 429 || res.status >= 500) {
                lastErr = new Error(`OpenRouter API ${res.status}: ${body.slice(0, 500)}`);
                await sleep(2000 * Math.pow(2, attempt - 1));
                continue;
            }
            if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${body.slice(0, 500)}`);
            return JSON.parse(body);
        } catch (err) {
            lastErr = err;
            if (attempt < MAX_RETRIES) await sleep(2000 * Math.pow(2, attempt - 1));
        }
    }
    throw lastErr;
}

function parseOpenRouterResponse(data, fallbackModel) {
    const choice = data.choices && data.choices[0];
    const text = textFromContent(choice?.message?.content);
    if (!text) throw new Error('OpenRouter response did not contain message content');
    return {
        json: extractJSON(text),
        usage: normalizeUsage(data.usage || {}),
        model: data.model || choice?.model || fallbackModel,
    };
}

async function callOpenRouter({ model, system, userContent, maxTokens = 4096, temperature = 0.7, apiKey, baseUrl }) {
    const content = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
    const data = await requestJSONWithRetry(() =>
        fetch(`${String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
                'X-Title': 'YourGbedu Admin',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content },
                ],
            }),
            signal: AbortSignal.timeout(90000),
        })
    );
    return parseOpenRouterResponse(data, model);
}

function buildMock(stage, ctx, judgeCallCount, mockFailures) {
    const form = ctx.form || ctx.normalized_form || {};
    const recipient = form.recipient_name || 'Recipient';
    if (stage === 'intake') {
        return {
            input_depth: 'moderate',
            customer_signals: {
                sender: form.sender_name,
                recipient,
                relationship: form.recipient_type,
                occasion: form.occasion,
                genre: form.genre,
                voice_gender: form.voice_gender,
                tone_preference: form.tone_preference,
                relationship_energy: form.relationship_energy,
                emotion_intensity: form.emotion_intensity,
                language_flavor: form.language_flavor || 'no_preference',
                avoid: form.things_to_avoid || '',
            },
            dominant_emotion: 'quiet gratitude for steady love',
            hidden_need: 'the sender wants to say what he does not say often enough',
            relationship_role: 'anchor',
            sender_voice: 'tender, grateful',
            usable_story_material: ['rooftop restaurant in Lekki', 'dancing in the kitchen at 2am', 'steady love'],
            exact_phrase_to_preserve: form.heart_message || '',
            risk_notes: [],
            generation_directive: 'Make the recipient feel deeply seen and quietly celebrated.',
        };
    }
    if (stage === 'brief') {
        return {
            song_identity: {
                recipient,
                sender: form.sender_name,
                relationship: form.recipient_type,
                occasion: form.occasion,
                genre: form.genre,
                voice_gender: form.voice_gender,
                language_flavor: form.language_flavor || 'no_preference',
            },
            emotional_center: {
                dominant_feeling: 'deep-rooted gratitude',
                hidden_need: 'unsaid thanks',
                emotional_tension: 'she has carried more than he has said aloud',
                emotional_promise: 'he chooses clearer words',
                relationship_archetype: 'anchor and partner',
            },
            section_arc: {
                intro: 'late-night intimacy',
                verse_1: 'rooftop memory',
                pre_chorus: 'gathering feeling',
                chorus: 'gratitude peak around fingerprints image',
                verse_2: 'kitchen at 2am as sacred proof',
                bridge: 'raw confession',
                final_chorus: 'fuller return',
                outro: 'soft final truth',
            },
            story_bank: {
                scenes: ['rooftop restaurant in Lekki', 'dancing in the kitchen at 2am'],
                objects_or_places: ['kitchen', 'Lekki rooftop'],
                exact_phrase_to_echo: form.heart_message || '',
            },
            hook_strategy: {
                hook_type: 'phrase_hook',
                hook_idea: 'your fingerprints on everything',
                chorus_emotional_job: 'land the gratitude',
                repeatable_phrase_direction: 'soft and certain',
                final_chorus_variation: 'wider harmonies, more openly grateful',
            },
            sonic_direction: {
                genre_base: form.genre,
                occasion_modifier: 'intimate opening, slow lift',
                tempo_feel: 'slow midtempo ~78 BPM',
                groove: 'gentle sway',
                instrument_palette: ['muted Rhodes', 'finger-picked guitar', 'light shakers', 'soft sub-bass'],
                vocal_delivery: 'close, smooth, breathy',
                harmony_direction: 'layered chorus harmonies',
                dynamic_movement: 'intimate verse to lifted chorus to bare bridge to full final chorus',
                ending: 'fade to guitar and whispered ad-libs',
            },
            lyric_voice: {
                pov: 'first person singular',
                address_style: 'second person, intimate',
                diction: 'tender, grateful, mature',
                rhyme_density: 'moderate',
                singability_direction: 'short lines, vowel endings',
                cultural_language_rule: form.language_flavor || 'no_preference',
            },
            avoid: { forbidden_topics: [], forbidden_phrases: [], overused_emotional_angles: [], style_risks: [] },
            final_creative_target: 'A late-night Afro-R&B gratitude song built on the fingerprints image.',
        };
    }
    if (stage === 'style') {
        return {
            style_prompt: 'Afro-R&B and neo-soul custom love song with a warm vocal, slow midtempo groove around 78 BPM, intimate late-night emotion, muted Rhodes, finger-picked guitar, soft shakers, warm pads, gentle sub-bass, close conversational verses, layered harmony chorus, stripped bridge, and wider final chorus.',
        };
    }
    if (stage === 'lyrics' || stage === 'rewrite') {
        return {
            title_options: ['Fingerprints', 'Everything Good', 'Low Light Love'],
            lyrics: {
                intro: 'Low light, your photograph\nLagos hums below the glass',
                verse_1: `Rooftop in Lekki, first night that we sat\nYou laughed at my nerves and I never looked back\nYou hold this whole house calm when the power cuts out\nThe quiet kind of strong nobody claps about`,
                pre_chorus: 'I never say it right\nSo let me sing it now',
                chorus: `Everything good in my life\nHas your fingerprints on it, ${recipient}\nEvery soft and steady light\nYou put your fingerprints on it`,
                verse_2: 'Kitchen at 2am, your hand finds my hand\nNo music but the fridge and still we dance\nFlour on the counter, slow steps on the floor\nIf this is all we get, I would still ask for more',
                bridge: 'I do not say thank you like I should\nYou carried us through and made it look good',
                final_chorus: `Everything good in my life\nHas your fingerprints on it\nEvery year you stayed by my side\nYou put your fingerprints on it, oh`,
                outro: 'Leave the lights low\nYour hand in mine, we sway slow',
            },
            rewrite_notes: stage === 'rewrite'
                ? {
                    sections_changed: ['chorus', 'final_chorus'],
                    sections_preserved: ['intro', 'verse_1', 'pre_chorus', 'verse_2', 'bridge', 'outro'],
                    instructions_addressed: ['strengthened hook'],
                }
                : undefined,
        };
    }
    if (stage === 'judge') {
        const fail = judgeCallCount <= mockFailures;
        return {
            scores: fail
                ? { emotional_specificity: 8, singability: 8, hook_strength: 6, genre_fit: 9, occasion_fit: 9 }
                : { emotional_specificity: 9, singability: 8, hook_strength: 8, genre_fit: 9, occasion_fit: 9 },
            lowest_dimension: fail ? 'hook_strength' : 'singability',
            issues: fail ? ["Chorus phrase doesn't land memorably enough"] : [],
            rewrite_targets: fail ? ['chorus - sharpen the central phrase'] : [],
            one_line_verdict: fail ? 'Solid song, weak hook - one targeted rewrite needed.' : 'Deliverable with pride.',
        };
    }
    throw new Error(`Unknown mock stage: ${stage}`);
}

function makeClient({
    mock = process.env.SONG_PIPELINE_MOCK === '1',
    mockFailures = Number(process.env.SONG_PIPELINE_MOCK_FAILURES || 0),
    modelIntake = process.env.YG_MODEL_INTAKE || process.env.LLM_MODEL || DEFAULT_MODELS.intake,
    modelSonnet = process.env.YG_MODEL_SONNET || process.env.LLM_MODEL || DEFAULT_MODELS.sonnet,
    apiKey = process.env.OPENROUTER_API_KEY,
    baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
    const usage = { calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    let judgeCalls = 0;

    async function run(stage, { model, system, userContent, maxTokens, temperature }) {
        if (mock) {
            if (stage === 'judge') judgeCalls++;
            await sleep(5);
            usage.calls += 1;
            return {
                json: buildMock(stage, userContent.__raw || userContent, judgeCalls, mockFailures),
                usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
                model: 'mock',
            };
        }
        if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
        const result = await callOpenRouter({
            model,
            system,
            userContent: userContent.__guarded || userContent,
            maxTokens,
            temperature,
            apiKey,
            baseUrl,
        });
        usage.calls += 1;
        usage.input_tokens += result.usage.input_tokens || 0;
        usage.output_tokens += result.usage.output_tokens || 0;
        usage.total_tokens += result.usage.total_tokens || 0;
        return result;
    }

    return {
        run,
        mock,
        models: { haiku: modelIntake, sonnet: modelSonnet },
        getUsage: () => ({ ...usage, provider: mock ? 'mock' : 'openrouter' }),
    };
}

module.exports = {
    makeClient,
    callOpenRouter,
    extractJSON,
    normalizeUsage,
    parseOpenRouterResponse,
};
