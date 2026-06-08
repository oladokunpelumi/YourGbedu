import { Genre, Mood } from './types';

export const GENRES: { name: Genre; desc: string; icon: string }[] = [
  { name: 'Afro-Beats',  desc: 'Vibrant & Rhythmic',   icon: 'music_note' },
  { name: 'Afro-R&B',   desc: 'Romantic & Groovy',     icon: 'favorite' },
  { name: 'Afro-House',  desc: 'Energetic & Electric',  icon: 'speaker' },
  { name: 'Afro-Reggae', desc: 'Island Vibes',           icon: 'queue_music' },
  { name: 'Gospel',      desc: 'Uplifting & Spiritual',  icon: 'volunteer_activism' },
  { name: 'R&B',         desc: 'Smooth & Soulful',       icon: 'radio' },
  { name: 'Hip-Hop',     desc: 'Bold & Rhythmic',        icon: 'mic' },
  { name: 'Pop',         desc: 'Catchy & Bright',        icon: 'album' },
  { name: 'Soul',        desc: 'Deep & Emotive',         icon: 'sentiment_very_satisfied' },
  { name: 'Highlife',    desc: 'Joyful & Cultural',      icon: 'celebration' },
];

export const MOODS: { name: Mood; icon: string; img: string }[] = [
  {
    name: 'Nostalgic',
    icon: 'history_edu',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAkWXZkqIJoemByHZfGIz0moxYQsHJFsq7pOkrAaXwhXAjrmLJ-cIz2Jaf7pQqv-Vv6eChJHhSmsj11s6mivOxdMORFzGQ5zU2GYa_LUqyP1chDgxwohv5wwYPB9ouVJhYmKqPJNTtPlwhhRQhR9bG3FCWUsrEYEg5JMno5yKCCOR8XEEXwescXfkYd8fcqs_3qnCSnY4iYotobpPrQqWygLOc0rIRF45_VUfBb4jc2ofSdEQlPs_D41beosQzje-gRc4fEjySdpQ',
  },
  {
    name: 'Upbeat',
    icon: 'bolt',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCBuNeOIWUItoR5KQYZvCXH73oTa53ZrzoloepIjhJTTjFfCpx-WSyw6auEeOUkp1wMRyOseJCoenCHHelq5ZPCyLM0GbRKCP6xeogToprDh2sEIde0v1bp0uPOLOzR-oxSHQY0EgBuI_ml-pXAugAOuXhI6IPmuv-STx5Gc4u2KYHaMdtyyvy2zt0rfWqG18nSMubw5Go9frJtsihR2FCGPHp2TkswKIv-m6YXCb4NXqJFHKNcPalzthJsiDkodwDFXh8k7cYZSw',
  },
  {
    name: 'Romantic',
    icon: 'favorite',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD8Dfw9-PDleiLVoAIZLrGUvO9qjlpt5s4poIl_xzG34LHTTY9YyBZ_T578qdsiR1cdFUxuPzPBDmUe7TWRB1S_GtpbgFRDL96uLNuWulvoBVy5CjUvLqdzzNku7cr53VlmctItfsRUJUf6wMecZ6f07unj9ckiDN2ToP6olp4-e7C2OxmMpkrtahtyxr-2M4RhSowmDFla3WKbrDZZD2j4UWU7z5xWJVxCfpPuUw7JoFXZ8fdYZolgpK3krbWw4tqwpWluFGmEoA',
  },
  {
    name: 'Melancholic',
    icon: 'cloudy_snowing',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAnjaO6YYEdtpaGgOeYjmMjycLvOg00DM40fLnw-bNEEhr9Y7UsWnwhHwA2zFoNncvNk1dsm7zN9IOrMIiyxyhcotIZYf4zZATOm5wC8k0AffponzAYMD3tVTmPPfKWiBGxibR_zIMPpaSbwgn5wDbafdApkhwF2viiX6VY28yEoHuyKhkX568epSw3VsCBqhMsecKbPmv0wKD5NPXatCjS9HpC6kyyQmQU53u6IQd--fWR2vLce5D7IiVx0Lzs5TxrBi_XkGIlCA',
  },
];

export const DISCOUNTED_PRICING = {
  paystack: {
    standard: { current: '₦30,000', original: '₦60,000', amountKobo: 3_000_000, originalAmountKobo: 6_000_000 },
    fast: { current: '₦50,000', original: '₦80,000', upgrade: '+₦20,000', amountKobo: 5_000_000, originalAmountKobo: 8_000_000 },
  },
  stripe: {
    standard: { current: '$25', original: '$50', amountCents: 2_500, originalAmountCents: 5_000 },
    fast: { current: '$40', original: '$65', upgrade: '+$15.00', amountCents: 4_000, originalAmountCents: 6_500 },
  },
} as const;

export type PaymentProvider = keyof typeof DISCOUNTED_PRICING;

export const OCCASION_ACCENTS = {
  birthday: {
    label: 'Birthday',
    tone: 'Celebratory',
    accent: '#C99B3E',
    soft: '#FBF0CF',
    text: '#6F521F',
  },
  anniversary: {
    label: 'Anniversary',
    tone: 'Reflective romantic',
    accent: '#B3522F',
    soft: '#F7E5DA',
    text: '#8B3E22',
  },
  wedding: {
    label: 'Wedding',
    tone: 'Joyful devotional',
    accent: '#7C8B5C',
    soft: '#EEF2E2',
    text: '#5D6A42',
  },
  valentine: {
    label: 'Valentine',
    tone: 'Romantic intimate',
    accent: '#B3522F',
    soft: '#F7E5DA',
    text: '#8B3E22',
  },
  appreciation: {
    label: 'Appreciation',
    tone: 'Warm grateful',
    accent: '#C99B3E',
    soft: '#FBF0CF',
    text: '#6F521F',
  },
  apology: {
    label: 'Apology',
    tone: 'Vulnerable healing',
    accent: '#B3522F',
    soft: '#F7E5DA',
    text: '#8B3E22',
  },
  memorial: {
    label: 'Memorial',
    tone: 'Tender honoring',
    accent: '#7C8B5C',
    soft: '#EEF2E2',
    text: '#5D6A42',
  },
  graduation: {
    label: 'Graduation',
    tone: 'Proud aspirational',
    accent: '#C99B3E',
    soft: '#FBF0CF',
    text: '#6F521F',
  },
  proposal: {
    label: 'Proposal',
    tone: 'Intimate declarative',
    accent: '#B3522F',
    soft: '#F7E5DA',
    text: '#8B3E22',
  },
  welcome_baby: {
    label: 'Welcome Baby',
    tone: 'Wonder-filled',
    accent: '#7C8B5C',
    soft: '#EEF2E2',
    text: '#5D6A42',
  },
  just_because: {
    label: 'Just Because',
    tone: 'Spontaneous heartfelt',
    accent: '#C99B3E',
    soft: '#FBF0CF',
    text: '#6F521F',
  },
  other: {
    label: 'Other',
    tone: 'Personal',
    accent: '#8B7F6C',
    soft: '#F5EDE2',
    text: '#5A4F3F',
  },
} as const;

export function getDiscountedPrice(provider: PaymentProvider | null, fastDelivery: boolean) {
  const resolvedProvider = provider || 'paystack';
  return fastDelivery
    ? DISCOUNTED_PRICING[resolvedProvider].fast
    : DISCOUNTED_PRICING[resolvedProvider].standard;
}
