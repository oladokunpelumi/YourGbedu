const { VALID_ENUMS } = require('./loader.cjs');

const RECIPIENT_MAP = {
    Husband: 'husband',
    Wife: 'wife',
    Boyfriend: 'boyfriend',
    Girlfriend: 'girlfriend',
    Children: 'children',
    Father: 'father',
    Mother: 'mother',
    Sibling: 'sibling',
    Friend: 'friend',
    'Friends & Loved Ones': 'friend',
    Yourself: 'myself',
    Parents: 'other',
    Partner: 'other',
};

const GENRE_MAP = {
    'Afro-Beats': 'afro_beats',
    'Afro-R&B': 'afro_rnb',
    'Afro-House': 'afro_house',
    'Afro-Reggae': 'afro_reggae',
    Gospel: 'gospel',
    'R&B': 'rnb',
    'Hip-Hop': 'hip_hop',
    Pop: 'pop',
    Soul: 'soul',
    Highlife: 'highlife',
};

const VOICE_MAP = {
    'Female Voice': 'female',
    'Male Voice': 'male',
    'No Preference': 'no_preference',
};

const OCCASION_TONE_ENERGY = {
    birthday: ['joyful', 'playful'],
    anniversary: ['romantic', 'passionate'],
    wedding: ['romantic', 'devotional'],
    valentine: ['romantic', 'passionate'],
    proposal: ['romantic', 'devotional'],
    appreciation: ['tender', 'grateful'],
    apology: ['healing', 'healing'],
    memorial: ['reflective', 'nostalgic'],
    graduation: ['proud', 'proud'],
    welcome_baby: ['tender', 'protective'],
    just_because: ['joyful', 'playful'],
    other: ['emotional', 'calm'],
};

const NON_ROMANTIC_RECIPIENTS = new Set(['children', 'father', 'mother', 'sibling', 'friend', 'myself', 'other']);
const DERIVED_FIELDS = ['tone_preference', 'relationship_energy', 'emotion_intensity'];

function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeDisplay(value, map, fallback, warnings, label) {
    const raw = clean(value);
    if (!raw) return fallback;
    if (map[raw]) return map[raw];
    const snake = raw.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (Object.values(map).includes(snake)) return snake;
    warnings.push(`Unknown ${label} '${raw}', defaulted to ${fallback}.`);
    return fallback;
}

function normalizeOccasion(value, occasionDetail, warnings) {
    const raw = clean(value);
    const snake = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (VALID_ENUMS.occasion.includes(snake)) return { occasion: snake, occasionDetail };
    if (!raw) return { occasion: 'other', occasionDetail };
    warnings.push(`Unknown occasion '${raw}', defaulted to other.`);
    return {
        occasion: 'other',
        occasionDetail: [raw, occasionDetail].filter(Boolean).join(' - '),
    };
}

function storyText(order) {
    return [
        order.special_qualities,
        order.favorite_memories,
        order.special_message,
        order.story,
    ].map(clean).filter(Boolean).join(' ');
}

function deriveEmotionalFields({ occasion, genre, recipient_type, story = '' }, overrides = {}) {
    const sources = {};
    let [tone, energy] = OCCASION_TONE_ENERGY[occasion] || OCCASION_TONE_ENERGY.other;

    if (genre === 'gospel' && occasion !== 'memorial') {
        tone = 'spiritual';
        energy = 'devotional';
    }

    if (NON_ROMANTIC_RECIPIENTS.has(recipient_type)) {
        if (tone === 'romantic') tone = 'tender';
        if (energy === 'passionate' || energy === 'devotional') energy = 'grateful';
    }

    const storyLength = clean(story).length;
    let intensity = 'medium';
    if (['memorial', 'apology', 'proposal'].includes(occasion) || storyLength > 400) {
        intensity = 'deeply_emotional';
    } else if (storyLength < 80 && ['just_because', 'birthday'].includes(occasion)) {
        intensity = 'soft';
    }

    const result = {
        tone_preference: tone,
        relationship_energy: energy,
        emotion_intensity: intensity,
    };

    for (const field of DERIVED_FIELDS) sources[field] = 'derived';
    for (const field of DERIVED_FIELDS) {
        if (overrides[field]) {
            if (!VALID_ENUMS[field].includes(overrides[field])) {
                const err = new Error(`${field} must be one of: ${VALID_ENUMS[field].join(', ')}`);
                err.statusCode = 400;
                throw err;
            }
            result[field] = overrides[field];
            sources[field] = 'admin';
        }
    }

    return { ...result, source: sources };
}

function mapOrderToPipelineForm(order, overrides = {}) {
    const warnings = [];
    const specialNotes = [];
    let recipientType = normalizeDisplay(order.recipient_type, RECIPIENT_MAP, 'other', warnings, 'recipient');
    let recipientName = clean(order.recipient_name);

    if (clean(order.recipient_type) === 'Yourself') {
        recipientType = 'myself';
        recipientName = clean(order.sender_name) || recipientName || 'Myself';
    }
    if (clean(order.recipient_type) === 'Parents') specialNotes.push("The song is for the sender's parents.");
    if (clean(order.recipient_type) === 'Partner') specialNotes.push("The song is for the sender's partner.");

    const occasionResolved = normalizeOccasion(order.occasion, clean(order.occasion_detail), warnings);
    const genre = normalizeDisplay(order.genre, GENRE_MAP, 'afro_beats', warnings, 'genre');
    const voice = normalizeDisplay(order.voice_gender, VOICE_MAP, 'no_preference', warnings, 'voice');
    const story = storyText(order);
    const derived = deriveEmotionalFields({
        occasion: occasionResolved.occasion,
        genre,
        recipient_type: recipientType,
        story,
    }, overrides);

    const whatMakesSpecial = [clean(order.special_qualities), ...specialNotes].filter(Boolean).join('\n');
    const form = {
        sender_name: clean(order.sender_name) || 'YourGbedu Customer',
        recipient_name: recipientName || 'Loved One',
        recipient_type: recipientType,
        occasion: occasionResolved.occasion,
        occasion_detail: occasionResolved.occasionDetail,
        genre,
        voice_gender: voice,
        what_makes_special: whatMakesSpecial,
        favorite_memories: clean(order.favorite_memories),
        heart_message: clean(order.special_message) || clean(order.story),
        tone_preference: derived.tone_preference,
        relationship_energy: derived.relationship_energy,
        emotion_intensity: derived.emotion_intensity,
        specific_phrase_to_include: '',
        language_flavor: 'no_preference',
        things_to_avoid: '',
        song_length: 'standard',
        explicitness: 'clean',
        religious_language: genre === 'gospel' ? 'strong' : 'none',
        spoken_intro: 'auto',
    };

    return { form, derived, warnings };
}

module.exports = {
    mapOrderToPipelineForm,
    deriveEmotionalFields,
    RECIPIENT_MAP,
    GENRE_MAP,
    VOICE_MAP,
    OCCASION_TONE_ENERGY,
};
