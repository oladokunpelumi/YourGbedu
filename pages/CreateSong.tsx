import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OCCASION_ACCENTS, PaymentProvider, getDiscountedPrice } from '../constants';
import { paymentProviderFromGeo } from '../services/checkoutProvider';

const RECIPIENTS = [
  'Parents',
  'Partner',
  'Friends & Loved Ones',
  'Yourself',
  'Husband',
  'Wife',
  'Boyfriend',
  'Girlfriend',
  'Children',
  'Father',
  'Mother',
  'Sibling',
  'Friend',
  'Other',
];

const RECIPIENT_QUERY_MAP: Record<string, string> = {
  parents: 'Parents',
  partner: 'Partner',
  'friends-loved-ones': 'Friends & Loved Ones',
  yourself: 'Yourself',
};

const OCCASIONS = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'valentine', label: 'Valentine' },
  { value: 'appreciation', label: 'Appreciation' },
  { value: 'apology', label: 'Apology' },
  { value: 'memorial', label: 'Memorial' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'welcome_baby', label: 'Welcome Baby' },
  { value: 'just_because', label: 'Just Because' },
  { value: 'other', label: 'Other' },
] as const;

const NEW_GENRES = [
  { name: 'Afro-Beats', desc: 'Vibrant and rhythmic' },
  { name: 'Afro-R&B', desc: 'Romantic and groovy' },
  { name: 'Afro-House', desc: 'Energetic and electric' },
  { name: 'Afro-Reggae', desc: 'Island warmth' },
  { name: 'Gospel', desc: 'Uplifting and spiritual' },
  { name: 'R&B', desc: 'Smooth and soulful' },
  { name: 'Hip-Hop', desc: 'Bold and rhythmic' },
  { name: 'Pop', desc: 'Catchy and bright' },
  { name: 'Soul', desc: 'Deep and emotive' },
  { name: 'Highlife', desc: 'Joyful and cultural' },
];

const VOICES = ['Female Voice', 'Male Voice', 'No Preference'];

const FORM_STEPS = [
  {
    id: 1,
    title: 'Basics',
    heading: 'Start with the person',
    desc: 'Who the song is for, the occasion, and who it is from.',
  },
  {
    id: 2,
    title: 'Style',
    heading: 'Choose the sound',
    desc: 'Pick the genre and preferred voice direction.',
  },
  {
    id: 3,
    title: 'Story',
    heading: 'The Heart of the Story',
    desc: 'Share the qualities and memories that matter.',
  },
  {
    id: 4,
    title: 'Message',
    heading: 'Say what should be felt',
    desc: 'Add the words, promise, prayer, apology, or gratitude behind the song.',
  },
  {
    id: 5,
    title: 'Review',
    heading: 'Review and complete',
    desc: 'Confirm your brief, delivery speed, price, and email.',
  },
];

const fieldClass =
  'w-full rounded-xl border border-line bg-ivory px-4 py-3.5 font-body text-base text-ink placeholder:text-ink-muted transition-colors focus:border-terracotta focus:bg-cream focus:outline-none focus:ring-4 focus:ring-terracotta/10';

const BRIEF_STORAGE_KEY = 'yourgbedu_brief';
const DRAFT_STORAGE_KEY = 'yourgbedu_brief_draft';
const MIN_STEP = 1;
const MAX_STEP = FORM_STEPS.length;

interface CreateSongDraft {
  recipientType: string;
  recipientName: string;
  occasion: string;
  occasionDetail: string;
  senderName: string;
  genre: string;
  voiceGender: string;
  specialQualities: string;
  favoriteMemories: string;
  specialMessage: string;
  customerEmail: string;
  fastDelivery: boolean;
}

function normalizeDraft(value: unknown): CreateSongDraft | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<CreateSongDraft>;
  return {
    recipientType: parsed.recipientType || '',
    recipientName: parsed.recipientName || '',
    occasion: parsed.occasion || '',
    occasionDetail: parsed.occasionDetail || '',
    senderName: parsed.senderName || '',
    genre: parsed.genre || '',
    voiceGender: parsed.voiceGender || '',
    specialQualities: parsed.specialQualities || '',
    favoriteMemories: parsed.favoriteMemories || '',
    specialMessage: parsed.specialMessage || '',
    customerEmail: parsed.customerEmail || '',
    fastDelivery: Boolean(parsed.fastDelivery),
  };
}

function readCreateSongDraft(): CreateSongDraft | null {
  try {
    const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (rawDraft) return normalizeDraft(JSON.parse(rawDraft));

    const rawBrief = sessionStorage.getItem(BRIEF_STORAGE_KEY);
    if (rawBrief) return normalizeDraft(JSON.parse(rawBrief));
  } catch {
    return null;
  }
  return null;
}

function hasDraftContent(draft: CreateSongDraft) {
  return Boolean(
    draft.recipientType ||
      draft.recipientName ||
      draft.occasion ||
      draft.occasionDetail ||
      draft.senderName ||
      draft.genre ||
      draft.voiceGender ||
      draft.specialQualities ||
      draft.favoriteMemories ||
      draft.specialMessage ||
      draft.customerEmail ||
      draft.fastDelivery
  );
}

function parseStepParam(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return MIN_STEP;
  return Math.min(Math.max(parsed, MIN_STEP), MAX_STEP);
}

const CreateSong: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [initialDraft] = useState(() => readCreateSongDraft());
  const [step, setStep] = useState(1);

  const [recipientType, setRecipientType] = useState(initialDraft?.recipientType || '');
  const [recipientName, setRecipientName] = useState(initialDraft?.recipientName || '');
  const [occasion, setOccasion] = useState(initialDraft?.occasion || '');
  const [occasionDetail, setOccasionDetail] = useState(initialDraft?.occasionDetail || '');
  const [senderName, setSenderName] = useState(initialDraft?.senderName || '');
  const [genre, setGenre] = useState(initialDraft?.genre || '');
  const [voiceGender, setVoiceGender] = useState(initialDraft?.voiceGender || '');
  const [specialQualities, setSpecialQualities] = useState(initialDraft?.specialQualities || '');
  const [favoriteMemories, setFavoriteMemories] = useState(initialDraft?.favoriteMemories || '');
  const [specialMessage, setSpecialMessage] = useState(initialDraft?.specialMessage || '');
  const [customerEmail, setCustomerEmail] = useState(initialDraft?.customerEmail || '');
  const [isFastDelivery, setIsFastDelivery] = useState(Boolean(initialDraft?.fastDelivery));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const selectedPersona =
    RECIPIENT_QUERY_MAP[(searchParams.get('recipient') || '').toLowerCase()] || '';
  const draftData = useMemo<CreateSongDraft>(() => ({
    recipientType,
    recipientName,
    occasion,
    occasionDetail,
    senderName,
    genre,
    voiceGender,
    specialQualities,
    favoriteMemories,
    specialMessage,
    customerEmail,
    fastDelivery: isFastDelivery,
  }), [
    recipientType,
    recipientName,
    occasion,
    occasionDetail,
    senderName,
    genre,
    voiceGender,
    specialQualities,
    favoriteMemories,
    specialMessage,
    customerEmail,
    isFastDelivery,
  ]);
  const isStepOneComplete = useCallback(() => {
    return Boolean(
      recipientType &&
        occasion &&
        senderName.trim() &&
        (recipientType === 'Yourself' || recipientName.trim())
    );
  }, [occasion, recipientName, recipientType, senderName]);
  const isStepTwoComplete = useCallback(() => Boolean(genre && voiceGender), [genre, voiceGender]);
  const isStepThreeComplete = useCallback(() => {
    return specialQualities.trim().length >= 5 && favoriteMemories.trim().length >= 5;
  }, [favoriteMemories, specialQualities]);
  const isStepFourComplete = useCallback(() => specialMessage.trim().length >= 5, [specialMessage]);
  const furthestAllowedStep = useMemo(() => {
    if (!isStepOneComplete()) return 1;
    if (!isStepTwoComplete()) return 2;
    if (!isStepThreeComplete()) return 3;
    if (!isStepFourComplete()) return 4;
    return 5;
  }, [isStepFourComplete, isStepOneComplete, isStepThreeComplete, isStepTwoComplete]);
  const navigateToStep = useCallback(
    (targetStep: number, replace = false) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('step', String(Math.min(Math.max(targetStep, MIN_STEP), MAX_STEP)));
      navigate(`/create?${nextParams.toString()}`, { replace });
    },
    [navigate, searchParams]
  );

  useEffect(() => {
    const checkoutError = sessionStorage.getItem('yourgbedu_checkout_error');
    if (!checkoutError) return;
    setError(checkoutError);
    sessionStorage.removeItem('yourgbedu_checkout_error');
  }, []);

  useEffect(() => {
    if (!selectedPersona) return;
    if (initialDraft) return;
    setRecipientType(selectedPersona);
  }, [initialDraft, selectedPersona]);

  useEffect(() => {
    try {
      if (hasDraftContent(draftData)) {
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      } else {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      // sessionStorage may be unavailable; the form still works in memory.
    }
  }, [draftData]);

  useEffect(() => {
    const requestedStep = parseStepParam(searchParams.get('step'));
    const clampedStep = Math.min(requestedStep, furthestAllowedStep);
    if (searchParams.get('step') !== String(clampedStep)) {
      navigateToStep(clampedStep, true);
      return;
    }
    setStep(clampedStep);
  }, [furthestAllowedStep, navigateToStep, searchParams]);

  useEffect(() => {
    if (step !== 5 || paymentProvider !== null) return;
    let cancelled = false;

    const detectProvider = async () => {
      setIsDetectingLocation(true);
      try {
        const response = await fetch('/api/geo/country');
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error('Geo detection failed.');
        if (!cancelled) setPaymentProvider(paymentProviderFromGeo(data));
      } catch {
        if (!cancelled) setPaymentProvider('paystack');
      } finally {
        if (!cancelled) setIsDetectingLocation(false);
      }
    };

    void detectProvider();

    return () => {
      cancelled = true;
    };
  }, [step, paymentProvider]);

  const nextStep = () => {
    setError(null);
    if (step === 1 && (!recipientType || !occasion || !senderName.trim())) {
      setError('Please select who this is for, choose an occasion, and enter your name.');
      return;
    }
    if (step === 1 && recipientType && recipientType !== 'Yourself' && !recipientName.trim()) {
      setError("Please add the recipient's name so we can write the song for them.");
      return;
    }
    if (step === 2 && !isStepTwoComplete()) {
      setError('Please select both a genre and voice preference.');
      return;
    }
    if (step === 3 && !isStepThreeComplete()) {
      setError('Please provide a few details for both questions to help us write the best song.');
      return;
    }
    if (step === 4 && !isStepFourComplete()) {
      setError('Please write a special message from your heart.');
      return;
    }
    navigateToStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    navigate(-1);
  };

  const handleCompleteBrief = () => {
    if (step !== 5) return;
    if (!customerEmail || !customerEmail.includes('@')) {
      setError('Please enter a valid email address to receive your song.');
      return;
    }
    if (!paymentProvider) {
      setError('We are still preparing your checkout options. Please wait a moment.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const briefData = {
      recipientType,
      recipientName: recipientType && recipientType !== 'Yourself' ? recipientName.trim() : '',
      occasion,
      occasionDetail,
      senderName,
      genre,
      voiceGender,
      specialQualities,
      favoriteMemories,
      specialMessage,
      customerEmail,
      fastDelivery: isFastDelivery,
      paymentProvider,
    };
    sessionStorage.setItem('yourgbedu_brief', JSON.stringify(briefData));
    sessionStorage.removeItem('yourgbedu_checkout_error');
    const promo = searchParams.get('promo');
    navigate(promo ? `/checkout?promo=${encodeURIComponent(promo)}` : '/checkout');
  };

  const currentStep = FORM_STEPS[step - 1];
  const nextStepMeta = FORM_STEPS[step] || null;
  const price = getDiscountedPrice(paymentProvider, isFastDelivery);
  const fastPrice = getDiscountedPrice(paymentProvider, true);
  const providerLabel = paymentProvider === 'stripe' ? 'Stripe' : 'Paystack';
  const occasionLabel = OCCASIONS.find((item) => item.value === occasion)?.label || occasion;
  const activeOccasion = useMemo(() => {
    return OCCASION_ACCENTS[(occasion || 'other') as keyof typeof OCCASION_ACCENTS];
  }, [occasion]);

  return (
    <div className="bg-ivory px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden self-start rounded-2xl border border-line bg-cream p-6 lg:block" aria-label="Song brief steps">
          <p className="editorial-kicker">YourGbedu brief</p>
          <h2 className="mt-4 font-headline text-4xl font-medium leading-none text-ink">
            Create your <em className="text-terracotta">song</em>
          </h2>
          <p className="mt-4 text-sm leading-6 text-ink-soft">
            Each step feeds the production team a clearer emotional map.
          </p>

          <ol className="mt-9 space-y-3">
            {FORM_STEPS.map((item) => {
              const isActive = item.id === step;
              const isComplete = item.id < step;
              return (
                <li
                  key={item.id}
                  className={`flex gap-3 rounded-xl border p-3 ${
                    isActive
                      ? 'border-terracotta bg-terracotta-pale'
                      : isComplete
                        ? 'border-sage-soft bg-sage-pale'
                        : 'border-transparent bg-transparent'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isActive
                        ? 'bg-terracotta text-cream'
                        : isComplete
                          ? 'bg-sage text-cream'
                          : 'border border-line bg-ivory text-ink-muted'
                    }`}
                  >
                    {isComplete ? (
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        check
                      </span>
                    ) : (
                      item.id
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-label text-sm font-bold text-ink">{item.title}</span>
                    <span className="mt-1 block text-xs leading-snug text-ink-muted">{item.desc}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="rounded-2xl border border-line bg-cream p-5 sm:p-8 lg:p-10">
          <div className="mb-8 border-b border-line pb-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-label text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                  Step {step} of {FORM_STEPS.length}
                </p>
                <h1 className="mt-3 font-headline text-5xl font-medium leading-none text-ink sm:text-6xl">
                  {currentStep.heading}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">{currentStep.desc}</p>
              </div>
              {nextStepMeta && (
                <div className="rounded-2xl border border-line bg-ivory p-4 sm:max-w-[240px] lg:hidden">
                  <p className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                    Next
                  </p>
                  <p className="mt-1 font-label text-sm font-bold text-ink">{nextStepMeta.title}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{nextStepMeta.desc}</p>
                </div>
              )}
            </div>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-ivory" aria-hidden="true">
              <div
                className="h-full rounded-full bg-terracotta transition-[width] duration-300"
                style={{ width: `${(step / FORM_STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="mx-auto max-w-3xl">
            {step === 1 && (
              <div className="space-y-8">
                {selectedPersona && (
                  <div className="rounded-2xl border border-terracotta/30 bg-terracotta-pale p-4 text-terracotta-dark">
                    <p className="font-label text-xs font-bold uppercase tracking-[0.16em]">
                      Selected path
                    </p>
                    <p className="mt-1 text-sm leading-6">
                      You started with <span className="font-bold">{selectedPersona}</span>. You
                      can change this below.
                    </p>
                  </div>
                )}

                <div>
                  <p className="mb-3 font-headline text-2xl font-semibold text-ink">
                    Who is this for?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {RECIPIENTS.map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => {
                          setRecipientType(r);
                          if (r === 'Yourself') setRecipientName('');
                        }}
                        aria-pressed={recipientType === r}
                        className={`rounded-full border px-4 py-2.5 font-label text-sm font-bold transition-colors ${
                          recipientType === r
                            ? 'border-terracotta bg-terracotta text-cream'
                            : 'border-line bg-ivory text-ink-soft hover:border-terracotta hover:text-terracotta'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {recipientType && recipientType !== 'Yourself' && (
                    <div className="mt-5">
                      <label htmlFor="recipient-name" className="mb-2 block font-label text-sm font-bold text-ink">
                        What is their name?
                      </label>
                      <input
                        id="recipient-name"
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder={`Their first name`}
                        className={fieldClass}
                      />
                      <p className="mt-2 text-xs leading-5 text-ink-muted">
                        We will weave this into the lyrics so the song feels written for them.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <p className="font-headline text-2xl font-semibold text-ink">
                      What is the occasion?
                    </p>
                    {occasion && (
                      <p className="font-label text-xs font-bold uppercase tracking-[0.12em]" style={{ color: activeOccasion.text }}>
                        {activeOccasion.tone}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {OCCASIONS.map((item) => {
                      const accent = OCCASION_ACCENTS[item.value];
                      const selected = occasion === item.value;
                      return (
                        <button
                          type="button"
                          key={item.value}
                          onClick={() => {
                            setOccasion(item.value);
                            if (item.value !== 'other') setOccasionDetail('');
                          }}
                          aria-pressed={selected}
                          className="rounded-2xl border px-4 py-3 text-left transition-colors"
                          style={{
                            backgroundColor: selected ? accent.accent : '#FAF6EE',
                            borderColor: selected ? accent.accent : '#E5DDD0',
                            color: selected ? '#FFFDF6' : '#1F1B14',
                          }}
                        >
                          <span className="block font-label text-sm font-bold">{item.label}</span>
                          <span className="mt-1 block text-xs opacity-75">{accent.tone}</span>
                        </button>
                      );
                    })}
                  </div>
                  {occasion === 'other' && (
                    <div className="mt-4">
                      <label htmlFor="occasion-detail" className="mb-2 block font-label text-sm font-bold text-ink">
                        Tell us the occasion
                      </label>
                      <input
                        id="occasion-detail"
                        type="text"
                        value={occasionDetail}
                        onChange={(e) => setOccasionDetail(e.target.value)}
                        placeholder="Naming ceremony, retirement party, private apology..."
                        className={fieldClass}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="sender-name" className="mb-2 block font-headline text-2xl font-semibold text-ink">
                    What is your name?
                  </label>
                  <input
                    id="sender-name"
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Enter your name"
                    className={fieldClass}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-9">
                <div>
                  <p className="mb-3 font-headline text-2xl font-semibold text-ink">
                    Choose a genre
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {NEW_GENRES.map((g) => (
                      <button
                        type="button"
                        key={g.name}
                        onClick={() => setGenre(g.name)}
                        aria-pressed={genre === g.name}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          genre === g.name
                            ? 'border-terracotta bg-terracotta text-cream'
                            : 'border-line bg-ivory text-ink hover:border-terracotta'
                        }`}
                      >
                        <span className="block font-headline text-2xl italic leading-none">{g.name}</span>
                        <span className={`mt-2 block font-label text-xs font-bold uppercase tracking-[0.14em] ${genre === g.name ? 'text-terracotta-soft' : 'text-ink-muted'}`}>
                          {g.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 font-headline text-2xl font-semibold text-ink">
                    Preferred voice
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {VOICES.map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setVoiceGender(v)}
                        aria-pressed={voiceGender === v}
                        className={`rounded-full border px-5 py-3 font-label text-sm font-bold transition-colors ${
                          voiceGender === v
                            ? 'border-ink bg-ink text-cream'
                            : 'border-line bg-ivory text-ink-soft hover:border-terracotta hover:text-terracotta'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-7">
                <div>
                  <label htmlFor="special-qualities" className="mb-2 block font-headline text-2xl font-semibold text-ink">
                    What makes them special?
                  </label>
                  <p className="mb-3 text-sm leading-6 text-ink-muted">
                    Describe their character and the qualities you love most.
                  </p>
                  <textarea
                    id="special-qualities"
                    className={`${fieldClass} min-h-[170px] resize-y leading-7`}
                    placeholder="They are calm when everything is falling apart..."
                    value={specialQualities}
                    onChange={(e) => setSpecialQualities(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="favorite-memories" className="mb-2 block font-headline text-2xl font-semibold text-ink">
                    Share your favorite memories
                  </label>
                  <p className="mb-3 text-sm leading-6 text-ink-muted">
                    What moments with them do you treasure most?
                  </p>
                  <textarea
                    id="favorite-memories"
                    className={`${fieldClass} min-h-[170px] resize-y leading-7`}
                    placeholder="Our first date, the long calls, the day everything changed..."
                    value={favoriteMemories}
                    onChange={(e) => setFavoriteMemories(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <label htmlFor="special-message" className="mb-2 block font-headline text-2xl font-semibold text-ink">
                  What should the song say?
                </label>
                <p className="mb-4 text-sm leading-6 text-ink-muted">
                  Add the words you want included, even if they are rough. Emotion matters more than polish.
                </p>
                <textarea
                  id="special-message"
                  className={`${fieldClass} min-h-[320px] resize-y text-lg leading-8`}
                  placeholder="I do not say it enough, but you are the reason I am still standing..."
                  value={specialMessage}
                  onChange={(e) => setSpecialMessage(e.target.value)}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-7">
                <div className="rounded-2xl border border-line bg-ivory p-5 sm:p-7">
                  <h3 className="font-headline text-4xl font-semibold leading-none text-ink">
                    Your song brief
                  </h3>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: 'To',
                        value: recipientName && recipientType !== 'Yourself'
                          ? `${recipientName} (${recipientType})`
                          : recipientType,
                      },
                      {
                        label: 'Occasion',
                        value: `${occasionLabel}${occasion === 'other' && occasionDetail ? ` - ${occasionDetail}` : ''}`,
                      },
                      { label: 'From', value: senderName },
                      { label: 'Style', value: genre },
                      { label: 'Voice', value: voiceGender },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-line bg-cream p-4">
                        <p className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                          {item.label}
                        </p>
                        <p className="mt-1 truncate font-body text-lg font-bold text-ink">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="mt-6 flex w-full items-center justify-between gap-5 rounded-2xl border border-line bg-cream p-5 text-left transition-colors hover:border-terracotta"
                    onClick={() => setIsFastDelivery(!isFastDelivery)}
                    aria-pressed={isFastDelivery}
                  >
                    <span>
                      <span className="block font-label text-sm font-bold text-ink">
                        24-hour fast delivery
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-ink-soft">
                        Skip the queue and get your song in exactly 24 hours.
                      </span>
                      <span className="mt-1 block font-body text-sm font-bold text-ink">
                        {'upgrade' in fastPrice ? fastPrice.upgrade : ''}
                      </span>
                    </span>
                    <span
                      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
                        isFastDelivery ? 'border-terracotta bg-terracotta' : 'border-line-strong bg-ivory'
                      }`}
                    >
                      <span
                        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-cream shadow-sm transition-transform ${
                          isFastDelivery ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>

                  <div className="mt-6">
                    <label htmlFor="customer-email" className="mb-2 block font-label text-sm font-bold text-ink">
                      Where should we send your completed song? <span className="text-terracotta">*</span>
                    </label>
                    <input
                      id="customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="you@email.com"
                      required
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-ink p-6 text-cream">
                  {isDetectingLocation ? (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-mustard animate-spin" aria-hidden="true">
                        progress_activity
                      </span>
                      <span className="text-sm">Detecting your location...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-headline text-4xl font-semibold text-mustard">
                          {price.current}
                        </span>
                        <span className="text-sm text-cream/35 line-through">{price.original}</span>
                        <span className="rounded-full bg-mustard px-3 py-1 font-label text-xs font-bold uppercase tracking-[0.12em] text-ink">
                          Discounted
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-cream/65">
                        {isFastDelivery
                          ? `We build and deliver your song in 24 hours - secure payment via ${providerLabel}.`
                          : `We build and deliver your song in 48 hours - secure payment via ${providerLabel}.`}
                      </p>
                      <p className="mt-3 border-t border-cream/10 pt-3 text-xs leading-5 text-cream/50">
                        Your brief is saved in this browser until payment starts, so you can return
                        and edit it before checkout.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="mx-auto mt-9 flex w-full max-w-3xl items-center justify-between border-t border-line pt-6">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 1 || isSubmitting}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-label text-sm font-bold text-ink-soft transition-colors hover:bg-ivory hover:text-ink ${
                step === 1 ? 'pointer-events-none opacity-0' : ''
              }`}
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                arrow_back
              </span>
              Back
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta"
              >
                Continue
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCompleteBrief}
                disabled={isSubmitting || !customerEmail || isDetectingLocation || !paymentProvider}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-terracotta px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined text-lg animate-spin" aria-hidden="true">
                      progress_activity
                    </span>
                    Processing
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">
                      lock
                    </span>
                    Continue to checkout
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CreateSong;
