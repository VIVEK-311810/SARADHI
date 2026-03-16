import React from 'react';

const cards = [
  {
    quote: '"I can see 150 faces but I can\'t read a single one."',
    sub: 'You scan the room. You see heads down. You don\'t know if that means they\'re taking notes or hiding.',
  },
  {
    quote: '"The only feedback I get is a semester-end survey I\'ll read in January."',
    sub: 'By then the students have moved on, the topics are cold, and there\'s nothing left to fix.',
  },
  {
    quote: '"By the time exam results show the gap, it\'s already too late to close it."',
    sub: 'The marks come back. You see the pattern. You already knew it would happen. You just couldn\'t prove it in time.',
  },
];

const ProblemSection = () => {
  return (
    <section id="problem" className="bg-section-dark py-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Eyebrow */}
        <p
          className="text-xs font-semibold tracking-[0.2em] text-teal-400 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          Sound Familiar?
        </p>

        {/* Headline */}
        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-6 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          You asked{' '}
          <span className="text-slate-400 italic">"Any doubts?"</span>
          <br />
          and heard silence.
          <br />
          <span className="bg-gradient-to-r from-accent-400 to-accent-300 bg-clip-text text-transparent">
            That wasn't clarity. That was fear.
          </span>
        </h2>

        {/* Body */}
        <p
          className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-16 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="150"
        >
          You've been there. You explain a concept, scan the room, ask if
          everyone understands. Silence. You move on. But silence doesn't mean
          they got it — it means they didn't feel safe enough to say they
          didn't. And you won't find out until the answer sheets come back.
        </p>

        {/* Pain-point cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <div
              key={i}
              className="card-glass-dark rounded-2xl p-6"
              data-aos="fade-up"
              data-aos-delay={200 + i * 120}
            >
              <p className="text-white font-semibold text-base leading-snug mb-3 italic">
                {card.quote}
              </p>
              <p className="text-slate-400 text-sm leading-relaxed">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Transition line */}
        <div
          className="mt-16 text-center"
          data-aos="fade-up"
          data-aos-delay="560"
        >
          <p className="text-slate-500 text-sm">
            This isn't a teaching problem. It's a technology problem.{' '}
            <span className="text-white">And it's fixable.</span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
