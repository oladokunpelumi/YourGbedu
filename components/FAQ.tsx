import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const QA = [
  {
    q: 'What makes these songs special?',
    a: 'Each YourGbedu custom song is custom-written from your story. It is a one-of-a-kind gift rooted in care, genuine emotion, and high-quality production.',
  },
  {
    q: 'How long does it take to receive the song?',
    a: 'We build and deliver your custom song in 48 hours. If you need it sooner, choose the 24-hour priority delivery upgrade during your brief.',
  },
  {
    q: 'Can I get my custom song faster in 24 hours?',
    a: 'Yes. Standard delivery means we build and deliver your custom song in 48 hours. If the moment is closer, choose the priority upgrade and we will build and deliver it in 24 hours.',
  },
  {
    q: 'What themes can I write about?',
    a: 'Anything that honors your loved one: birthdays, anniversaries, weddings, grief, encouragement, testimonies, or prayers for strength and healing.',
  },
  {
    q: 'What is your process?',
    a: 'Every YourGbedu song is created to the same standard as the songs you hear on the radio, and goes through several quality checks for both lyrics and production before completion.\n\nOur lyricists pour their hearts into making each lyric personal and meaningful, then our producers use the help of the latest music production technology, including modern artificial intelligence assisted music production tools, to bring your heartfelt lyrics to life at an affordable price. In fact, we often refine and reproduce the song multiple times until we find the best version, so the final version you receive has the best melody, lyrics, and production.',
  },
  {
    q: 'How will I receive the finished song?',
    a: 'You will receive a secure link via email to play your YourGbedu song on any device and to easily share it with family and friends.',
  },
  {
    q: 'Can I use the song in a church or event?',
    a: 'Yes, you may share and play your song at private events and gatherings.',
  },
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleOpen = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="bg-cream py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-center font-headline text-5xl font-medium leading-none text-ink md:text-6xl">
          Frequently asked <em className="text-terracotta">questions</em>
        </h2>
        <p className="mx-auto mb-14 mt-5 max-w-lg text-center font-body text-base leading-7 text-ink-soft">
          Everything you need to know about creating your custom song.
        </p>

        <div className="flex flex-col border-y border-line">
          {QA.map((item, idx) => (
            <div
              key={idx}
              className="cursor-pointer border-b border-line last:border-b-0"
              onClick={() => toggleOpen(idx)}
            >
              <button className="group flex w-full items-center justify-between gap-4 py-6 text-left">
                <h3 className="font-headline text-2xl font-medium leading-tight text-ink md:text-3xl">
                  {item.q}
                </h3>
                <div className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-ivory text-terracotta transition-colors group-hover:border-terracotta">
                  {openIndex === idx ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${openIndex === idx ? 'max-h-[800px] mt-4 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="max-w-3xl pb-6 font-body text-base leading-7 text-ink-soft whitespace-pre-wrap">
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center text-center">
          <h4 className="mb-2 font-headline text-3xl font-medium text-ink">
            Got More Questions?
          </h4>
          <p className="font-body text-base text-ink-soft">
            Reach out to us at{' '}
            <a
              href="mailto:hello@yourgbedu.com"
              className="font-medium text-terracotta transition-colors hover:text-terracotta-dark"
            >
              hello@yourgbedu.com
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
