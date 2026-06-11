import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  mapOrderToPipelineForm,
  deriveEmotionalFields,
} = require('./lib/order-mapper.cjs');

describe('song pipeline order mapper', () => {
  it('maps display fields to v2 enums and excludes payment/customer PII', () => {
    const { form } = mapOrderToPipelineForm({
      sender_name: 'Tunde',
      recipient_name: 'Aisha',
      recipient_type: 'Wife',
      occasion: 'anniversary',
      genre: 'Afro-R&B',
      voice_gender: 'Female Voice',
      special_qualities: 'Kind and steady',
      favorite_memories: 'Lekki rooftop',
      special_message: 'Everything good has your fingerprints on it',
      customer_email: 'private@example.com',
      paystack_reference: 'secret-ref',
      amount: 3000000,
    });

    expect(form.recipient_type).toBe('wife');
    expect(form.genre).toBe('afro_rnb');
    expect(form.voice_gender).toBe('female');
    expect(JSON.stringify(form)).not.toContain('private@example.com');
    expect(JSON.stringify(form)).not.toContain('secret-ref');
    expect(form).not.toHaveProperty('amount');
  });

  it('handles Parents, Partner, and Yourself special cases', () => {
    const parents = mapOrderToPipelineForm({ recipient_type: 'Parents', sender_name: 'Mo', genre: 'Pop', occasion: 'birthday' });
    expect(parents.form.recipient_type).toBe('other');
    expect(parents.form.what_makes_special).toContain("sender's parents");

    const partner = mapOrderToPipelineForm({ recipient_type: 'Partner', sender_name: 'Mo', genre: 'Pop', occasion: 'anniversary' });
    expect(partner.form.recipient_type).toBe('other');
    expect(partner.form.what_makes_special).toContain("sender's partner");

    const myself = mapOrderToPipelineForm({ recipient_type: 'Yourself', sender_name: 'Mo', genre: 'Soul', occasion: 'graduation' });
    expect(myself.form.recipient_type).toBe('myself');
    expect(myself.form.recipient_name).toBe('Mo');
  });

  it('applies gospel, family guard, intensity, override, and warning rules', () => {
    const gospel = deriveEmotionalFields({ occasion: 'wedding', genre: 'gospel', recipient_type: 'wife', story: 'long enough' });
    expect(gospel.tone_preference).toBe('spiritual');
    expect(gospel.relationship_energy).toBe('devotional');

    const family = deriveEmotionalFields({ occasion: 'anniversary', genre: 'pop', recipient_type: 'mother', story: 'thank you mum' });
    expect(family.tone_preference).toBe('tender');
    expect(family.relationship_energy).toBe('grateful');

    const intense = deriveEmotionalFields({ occasion: 'birthday', genre: 'pop', recipient_type: 'friend', story: 'x'.repeat(401) });
    expect(intense.emotion_intensity).toBe('deeply_emotional');

    const override = deriveEmotionalFields(
      { occasion: 'birthday', genre: 'pop', recipient_type: 'friend', story: '' },
      { tone_preference: 'funny' }
    );
    expect(override.tone_preference).toBe('funny');
    expect(override.source.tone_preference).toBe('admin');

    const unknown = mapOrderToPipelineForm({ recipient_type: 'Cousin', genre: 'Fuji', occasion: 'naming ceremony' });
    expect(unknown.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
