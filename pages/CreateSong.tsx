import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentProvider, getDiscountedPrice } from '../constants';

const RECIPIENTS = [
  'Husband',
  'Wife',
  'Boyfriend',
  'Girlfriend',
  'Children',
  'Father',
  'Mother',
  'Sibling',
  'Friend',
  'Myself',
  'Other',
];

const OCCASIONS = [
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'valentine', label: 'Valentine' },
  { value: 'appreciation', label: 'Appreciation' },
  { value: 'apology', label: 'Apology' },
  { value: 'memorial', label: 'Memorial' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'welcome_baby', label: 'Welcome Baby' },
  { value: 'just_because', label: 'Just Because' },
  { value: 'other', label: 'Other' },
];

const NEW_GENRES = [
  { name: 'Afro-Beats',  icon: 'music_note',              desc: 'Vibrant & rhythmic' },
  { name: 'Afro-R&B',   icon: 'favorite',                desc: 'Romantic & groovy' },
  { name: 'Afro-House',  icon: 'speaker',                 desc: 'Energetic & electric' },
  { name: 'Afro-Reggae', icon: 'queue_music',             desc: 'Island vibes' },
  { name: 'Gospel',      icon: 'volunteer_activism',      desc: 'Uplifting & spiritual' },
  { name: 'R&B',         icon: 'radio',                   desc: 'Smooth & soulful' },
  { name: 'Hip-Hop',     icon: 'mic',                     desc: 'Bold & rhythmic' },
  { name: 'Pop',         icon: 'album',                   desc: 'Catchy & bright' },
  { name: 'Soul',        icon: 'sentiment_very_satisfied', desc: 'Deep & emotive' },
  { name: 'Highlife',    icon: 'celebration',             desc: 'Joyful & cultural' },
];

const VOICES = ['Female Voice', 'Male Voice', 'No Preference'];

const FORM_STEPS = [
  {
    id: 1,
    title: 'Basics',
    heading: "Let's start with the basics",
    desc: 'Who the song is for and who it is from.',
  },
  {
    id: 2,
    title: 'Style',
    heading: 'Musical Style',
    desc: 'Choose the genre and preferred voice.',
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
    heading: 'A message from your heart',
    desc: 'Add the words you want them to feel.',
  },
  {
    id: 5,
    title: 'Review',
    heading: 'Review & Complete',
    desc: 'Confirm delivery, price, and email.',
  },
];

const CreateSong: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [recipientType, setRecipientType] = useState('');
  const [occasion, setOccasion] = useState('');
  const [occasionDetail, setOccasionDetail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [genre, setGenre] = useState('');
  const [voiceGender, setVoiceGender] = useState('');
  const [specialQualities, setSpecialQualities] = useState('');
  const [favoriteMemories, setFavoriteMemories] = useState('');
  const [specialMessage, setSpecialMessage] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isFastDelivery, setIsFastDelivery] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  useEffect(() => {
    if (step !== 5 || paymentProvider !== null) return;
    let cancelled = false;

    const detectProvider = async () => {
      setIsDetectingLocation(true);
      try {
        const response = await fetch('/api/geo/country');
        const data = await response.json();
        if (!cancelled) setPaymentProvider(data.isNigeria ? 'paystack' : 'stripe');
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
    if (step === 2 && (!genre || !voiceGender)) {
      setError('Please select both a genre and voice preference.');
      return;
    }
    if (step === 3 && (specialQualities.trim().length < 5 || favoriteMemories.trim().length < 5)) {
      setError('Please provide a few details for both questions to help us write the best song.');
      return;
    }
    if (step === 4 && specialMessage.trim().length < 5) {
      setError('Please write a special message from your heart.');
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  };

  const prevStep = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
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
    navigate('/checkout');
  };

  const currentStep = FORM_STEPS[step - 1];
  const nextStepMeta = FORM_STEPS[step] || null;
  const price = getDiscountedPrice(paymentProvider, isFastDelivery);
  const fastPrice = getDiscountedPrice(paymentProvider, true);
  const providerLabel = paymentProvider === 'stripe' ? 'Stripe' : 'Paystack';
  const occasionLabel = OCCASIONS.find((item) => item.value === occasion)?.label || occasion;

  return (
    <div className="max-w-6xl mx-auto my-6 min-h-[calc(100vh-96px)] overflow-hidden rounded-2xl border border-[#E8D5A3]/40 bg-[#FFFDF5] shadow-[0_8px_28px_rgba(36,26,0,0.06)]">
      <div className="grid min-h-[calc(100vh-96px)] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden bg-[#fff8f0] px-6 py-8 lg:block" aria-label="Song brief steps">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[#8a7124]">
            YourGbedu Brief
          </p>
          <h2 className="mt-3 font-serif text-3xl italic leading-none text-[#241a00]">
            Create your song
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#5C4A2F]">
            A few focused details give our producers everything they need.
          </p>

          <ol className="mt-10 space-y-5">
            {FORM_STEPS.map((item) => {
              const isActive = item.id === step;
              const isComplete = item.id < step;
              return (
                <li key={item.id} className="flex gap-3" aria-current={isActive ? 'step' : undefined}>
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                      isActive
                        ? 'border-[#241a00] bg-[#241a00] text-[#D4AF37]'
                        : isComplete
                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#241a00]'
                          : 'border-[#E8D5A3] bg-white text-[#8a7124]'
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
                    <span className={`block font-display text-sm font-bold ${isActive ? 'text-[#241a00]' : 'text-[#5C4A2F]'}`}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-[#8a7124]">
                      {item.desc}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:px-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Progress header */}
        <div className="text-center mb-10 w-full max-w-xl mx-auto">
          <p className="text-[#8a7124] font-bold tracking-widest uppercase text-xs mb-3 font-display" id="create-song-step">
            Step {step} of {FORM_STEPS.length}
          </p>
          <div
            className="flex justify-between gap-2 mb-5"
            role="progressbar"
            aria-labelledby="create-song-step"
            aria-valuemin={1}
            aria-valuemax={FORM_STEPS.length}
            aria-valuenow={step}
          >
            {FORM_STEPS.map((item) => (
              <div key={item.id} className="h-1.5 flex-1 rounded-full overflow-hidden bg-[#E8D5A3]/50">
                <div
                  className={`h-full bg-[#D4AF37] transition-all duration-500 ${step >= item.id ? 'w-full' : 'w-0'}`}
                />
              </div>
            ))}
          </div>
          {nextStepMeta && (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-full bg-[#fff8f0] px-4 py-2 text-xs text-[#5C4A2F] ring-1 ring-[#E8D5A3]/70 lg:hidden">
              <span className="font-display font-bold uppercase tracking-wider text-[#8a7124]">
                Next
              </span>
              <span>{nextStepMeta.title}: {nextStepMeta.desc}</span>
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold text-[#241a00] tracking-tight mb-4 font-serif italic">
            {currentStep.heading}
          </h1>
          <p className="text-[#5C4A2F] font-body text-lg">
            {currentStep.desc}
          </p>
        </div>

        {/* Dynamic Form Area */}
        <div className="w-full max-w-3xl mx-auto">
          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="flex flex-col gap-8">
              <div>
                <p className="block text-[#241a00] font-bold mb-4 font-display text-xl text-center">
                  Who's this for?
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {RECIPIENTS.map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRecipientType(r)}
                      aria-pressed={recipientType === r}
                      className={`px-5 py-3 rounded-full border-2 font-bold transition-all text-sm font-display uppercase tracking-wide
                        ${
                          recipientType === r
                            ? 'bg-[#241a00] border-[#241a00] text-[#D4AF37] shadow-[0_4px_14px_rgba(36,26,0,0.12)] scale-[1.02]'
                            : 'bg-white border-[#E8D5A3] text-[#5C4A2F] hover:border-[#D4AF37] hover:text-[#241a00]'
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="block text-[#241a00] font-bold mb-4 font-display text-xl text-center">
                  What's the occasion?
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {OCCASIONS.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() => {
                        setOccasion(item.value);
                        if (item.value !== 'other') setOccasionDetail('');
                      }}
                      aria-pressed={occasion === item.value}
                      className={`rounded-2xl border-2 px-4 py-3 text-sm font-bold uppercase tracking-wide transition-all font-display ${
                        occasion === item.value
                          ? 'bg-[#241a00] border-[#241a00] text-[#D4AF37] shadow-[0_4px_14px_rgba(36,26,0,0.12)]'
                          : 'bg-white border-[#E8D5A3] text-[#5C4A2F] hover:border-[#D4AF37] hover:text-[#241a00]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {occasion === 'other' && (
                  <div className="mx-auto mt-4 max-w-md">
                    <label htmlFor="occasion-detail" className="sr-only">
                      Occasion details
                    </label>
                    <input
                      id="occasion-detail"
                      type="text"
                      value={occasionDetail}
                      onChange={(e) => setOccasionDetail(e.target.value)}
                      placeholder="Tell us the occasion"
                      className="w-full rounded-xl border-2 border-[#E8D5A3] bg-white px-4 py-3 text-center font-body text-[#241a00] placeholder-[#A08B74] transition-all focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10"
                    />
                  </div>
                )}
              </div>
              <div className="max-w-md w-full mx-auto mt-4">
                <label htmlFor="sender-name" className="block text-[#241a00] font-bold mb-3 font-display text-xl text-center">
                  What's your name?
                </label>
                <input
                  id="sender-name"
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-white border-2 border-[#E8D5A3] rounded-xl px-4 py-4 text-[#241a00] placeholder-[#A08B74] focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-body text-lg text-center"
                />
              </div>
            </div>
          )}

          {/* Step 2: Musical Style */}
          {step === 2 && (
            <div className="flex flex-col gap-10">
              <div>
                <p className="block text-[#241a00] font-bold mb-4 font-display text-xl text-center uppercase tracking-wide">
                  Choose A Genre
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {NEW_GENRES.map((g) => (
                    <button
                      type="button"
                      key={g.name}
                      onClick={() => setGenre(g.name)}
                      aria-pressed={genre === g.name}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${genre === g.name ? 'bg-white border-[#D4AF37] ring-2 ring-[#D4AF37]/20 shadow-[0_4px_14px_rgba(36,26,0,0.08)]' : 'bg-white border-[#E8D5A3] hover:border-[#D4AF37]'}`}
                    >
                      <span
                        className={`material-symbols-outlined text-3xl mb-2 ${genre === g.name ? 'text-[#D4AF37]' : 'text-[#8a7124]'}`}
                      >
                        {g.icon}
                      </span>
                      <span
                        className={`font-bold font-display ${genre === g.name ? 'text-[#241a00]' : 'text-[#5C4A2F]'}`}
                      >
                        {g.name}
                      </span>
                      <span className="text-xs text-[#8a7124] mt-1">{g.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="block text-[#241a00] font-bold mb-4 font-display text-xl text-center uppercase tracking-wide">
                  Preferred Voice Gender
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  {VOICES.map((v) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setVoiceGender(v)}
                      aria-pressed={voiceGender === v}
                      className={`px-6 py-4 rounded-xl border-2 font-bold transition-all font-display tracking-wide
                        ${
                          voiceGender === v
                            ? 'bg-[#241a00] border-[#241a00] text-[#D4AF37] shadow-[0_4px_14px_rgba(36,26,0,0.12)] scale-[1.02]'
                            : 'bg-white border-[#E8D5A3] text-[#5C4A2F] hover:border-[#D4AF37] hover:text-[#241a00]'
                        }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Character & Memories */}
          {step === 3 && (
            <div className="flex flex-col gap-8 w-full mx-auto">
              <div className="relative group">
                <label htmlFor="special-qualities" className="block text-[#241a00] font-bold mb-2 font-serif italic text-2xl">
                  What makes them special?
                </label>
                <p className="text-[#5C4A2F] mb-4 font-body">
                  Describe their character and the qualities you love most.
                </p>
                <textarea
                  id="special-qualities"
                  className="w-full bg-white border-2 border-[#E8D5A3] rounded-2xl p-6 text-[#241a00] placeholder:text-[#A08B74] focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 resize-none transition-all text-lg leading-relaxed h-[180px] font-body"
                  placeholder="They always put others first and have a laugh that lights up the room..."
                  value={specialQualities}
                  onChange={(e) => setSpecialQualities(e.target.value)}
                />
              </div>
              <div className="relative group">
                <label htmlFor="favorite-memories" className="block text-[#241a00] font-bold mb-2 font-serif italic text-2xl">
                  Share your favorite memories
                </label>
                <p className="text-[#5C4A2F] mb-4 font-body">
                  What moments with them do you treasure most?
                </p>
                <textarea
                  id="favorite-memories"
                  className="w-full bg-white border-2 border-[#E8D5A3] rounded-2xl p-6 text-[#241a00] placeholder:text-[#A08B74] focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 resize-none transition-all text-lg leading-relaxed h-[180px] font-body"
                  placeholder="That summer road trip to the coast, or simply lazy Sunday mornings drinking coffee..."
                  value={favoriteMemories}
                  onChange={(e) => setFavoriteMemories(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 4: Message */}
          {step === 4 && (
            <div className="flex flex-col gap-6 w-full mx-auto shadow-sm">
              <div className="relative group">
                <p className="text-[#5C4A2F] mb-6 font-body text-lg text-center px-4">
                  Write anything else that you feel would be relevant to include in your song, and
                  we'll do our best to include it! What do you want them to know, that you've never
                  said enough?
                </p>
                <textarea
                  aria-label="Special message to include in the song"
                  className="w-full bg-white border-2 border-[#E8D5A3] rounded-2xl p-8 text-[#241a00] placeholder:text-[#A08B74] focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 resize-none transition-all text-xl leading-relaxed h-[350px] font-body"
                  placeholder="I've never told you this enough, but you are the rock of my life. Thank you for always believing in me."
                  value={specialMessage}
                  onChange={(e) => setSpecialMessage(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 5: Summary & Email */}
          {step === 5 && (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
              <div className="bg-white border border-[#E8D5A3] rounded-3xl p-8 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                <h3 className="text-2xl font-bold text-[#241a00] mb-6 font-serif italic flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#D4AF37]">receipt_long</span>
                  Your Song Brief
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 relative">
                  {[
                    { label: 'To', value: recipientType },
                    {
                      label: 'Occasion',
                      value: `${occasionLabel}${occasion === 'other' && occasionDetail ? ` - ${occasionDetail}` : ''}`,
                    },
                    { label: 'From', value: senderName },
                    { label: 'Style', value: genre },
                    { label: 'Voice', value: voiceGender },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="bg-[#FFFDF5] rounded-2xl p-4 border border-[#E8D5A3]"
                    >
                      <p className="text-xs text-[#8a7124] uppercase tracking-widest font-display mb-1">
                        {item.label}
                      </p>
                      <p className="text-lg font-bold text-[#241a00] truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-8 border-t border-[#E8D5A3] relative z-10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-5 bg-[#FFFDF5] border-2 border-[#E8D5A3] rounded-2xl mb-8 cursor-pointer transition-all hover:border-[#D4AF37] text-left"
                    onClick={() => setIsFastDelivery(!isFastDelivery)}
                    aria-pressed={isFastDelivery}
                  >
                    <div className="flex flex-col gap-1 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#D4AF37]">bolt</span>
                        <span className="text-lg font-bold text-[#241a00] font-display">
                          24-Hour Fast Delivery
                        </span>
                        <span className="px-2 py-0.5 bg-[#D4AF37]/10 text-[#8a7124] text-xs font-bold rounded-full uppercase tracking-wider">
                          Priority
                        </span>
                      </div>
                      <p className="text-[#5C4A2F] text-sm font-body">
                        Skip the queue and get your song in exactly 24 hours.
                      </p>
                      <p className="text-[#241a00] font-bold text-sm mt-1">
                        {fastPrice.upgrade}
                      </p>
                    </div>
                    <div
                      className={`relative w-14 h-8 transition-colors duration-300 rounded-full flex-shrink-0 border-2 ${isFastDelivery ? 'bg-[#D4AF37] border-[#D4AF37]' : 'bg-[#E8D5A3]/30 border-[#E8D5A3]'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-300 ${isFastDelivery ? 'translate-x-6' : 'translate-x-0'}`}
                      />
                    </div>
                  </button>

                  <label htmlFor="customer-email" className="text-sm font-medium text-[#241a00] block mb-3 font-display">
                    Where should we send your completed song?{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7124]">
                      alternate_email
                    </span>
                    <input
                      id="customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="you@email.com"
                      required
                      className="w-full bg-[#FFFDF5] border-2 border-[#E8D5A3] rounded-xl py-4 pl-12 pr-4 text-[#241a00] placeholder:text-[#A08B74] focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 transition-all font-body"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#241a00] border border-[#241a00] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  {isDetectingLocation ? (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-[#D4AF37] animate-spin">
                        progress_activity
                      </span>
                      <span className="text-[#e2c15a] font-body text-sm">
                        Detecting your location...
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-2xl font-bold text-[#D4AF37] font-display">
                          {price.current}
                        </span>
                        <span className="text-sm text-[#8a7124] line-through font-display">
                          {price.original}
                        </span>
                        <span className="px-2.5 py-1 bg-[#D4AF37] text-[#241a00] text-xs font-bold rounded-full font-display tracking-wide">
                          Discounted
                        </span>
                      </div>
                      <p className="text-sm text-[#e2c15a] font-body">
                        Delivery in {isFastDelivery ? '24 Hours' : '3 Days'} • Secure Payment via{' '}
                        {providerLabel}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2 text-3xl text-[#D4AF37]/40">
                  <i className="pf pf-mastercard" />
                  <i className="pf pf-visa" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-8 mx-auto max-w-2xl bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm flex items-center justify-center gap-2 font-medium">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">error</span>
              {error}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between pt-8 mt-4 border-t border-[#E8D5A3]/50">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1 || isSubmitting}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-[#5C4A2F] hover:text-[#241a00] hover:bg-[#241a00]/5'}`}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_back</span>
            Back
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-2 px-10 py-4 rounded-xl bg-[#241a00] text-[#FFFDF5] font-bold shadow-[0_5px_16px_rgba(36,26,0,0.12)] transition-all transform hover:scale-[1.02] active:scale-[0.98] text-lg font-display tracking-wide"
            >
              Continue
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCompleteBrief}
              disabled={isSubmitting || !customerEmail || isDetectingLocation || !paymentProvider}
              className="flex items-center gap-3 px-10 py-4 rounded-xl bg-[#D4AF37] text-[#241a00] font-bold shadow-[0_5px_16px_rgba(36,26,0,0.10)] hover:bg-[#e2c15a] transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-lg font-display tracking-wider uppercase"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-xl animate-spin" aria-hidden="true">
                    progress_activity
                  </span>
                  Processing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">lock</span>
                  Continue to Checkout
                </>
              )}
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default CreateSong;
