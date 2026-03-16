import React from 'react';
import { Trophy, Medal, Award, Star, Zap, BookOpen, Flame } from 'lucide-react';

const badges = [
  { icon: Star, label: 'First Login', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  { icon: Trophy, label: 'Quiz Master', color: 'text-primary-400 bg-primary-400/10 border-primary-400/20' },
  { icon: Flame, label: 'Streak King', color: 'text-accent-400 bg-accent-400/10 border-accent-400/20' },
  { icon: BookOpen, label: 'Top Scholar', color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  { icon: Zap, label: 'Fast Answers', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
];

const podium = [
  { rank: 2, name: 'R. Meena', xp: '1,840 XP', color: 'border-slate-400/40', glow: 'shadow-[0_0_20px_rgba(148,163,184,0.2)]', icon: Medal, iconColor: 'text-slate-300' },
  { rank: 1, name: 'A. Karthik', xp: '2,340 XP', color: 'border-yellow-400/40', glow: 'shadow-[0_0_24px_rgba(250,204,21,0.25)]', icon: Trophy, iconColor: 'text-yellow-400', tall: true },
  { rank: 3, name: 'V. Lakshmi', xp: '1,620 XP', color: 'border-amber-600/40', glow: 'shadow-[0_0_20px_rgba(217,119,6,0.2)]', icon: Award, iconColor: 'text-amber-500' },
];

const GamificationSection = () => {
  return (
    <section id="gamification" className="bg-section-dark py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <p
          className="text-xs font-semibold tracking-[0.2em] text-accent-400 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          Human Nature, Not Gimmicks
        </p>

        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-6 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          You already know this:{' '}
          <span className="bg-gradient-to-r from-accent-400 to-yellow-300 bg-clip-text text-transparent">
            the student in second place
          </span>
          <br />
          works harder than the student in first.
        </h2>

        <p
          className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-16 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          Gamification isn't about cartoon badges. It's about something teachers
          have always known — a little healthy competition sharpens attention.
          When every poll answer earns points, when the leaderboard updates live,
          when your name moves up in front of the whole class — suddenly
          "any doubts?" gets 140 responses instead of silence.
        </p>

        {/* Podium */}
        <div
          className="flex items-end justify-center gap-4 mb-12"
          data-aos="fade-up"
          data-aos-delay="300"
        >
          {podium.map((p, i) => (
            <div
              key={i}
              className={`card-glass-dark rounded-2xl p-5 flex flex-col items-center border ${p.color} ${p.glow} transition-transform duration-300 hover:-translate-y-1 ${p.tall ? 'mb-0 w-36 sm:w-44' : 'mb-4 w-28 sm:w-36'}`}
            >
              <p.icon className={`${p.iconColor} mb-2 ${p.tall ? 'w-7 h-7' : 'w-5 h-5'}`} />
              <span className={`font-display font-bold text-white mb-1 ${p.tall ? 'text-2xl' : 'text-xl'}`}>
                #{p.rank}
              </span>
              <span className="text-white text-xs font-medium text-center mb-1">{p.name}</span>
              <span className={`text-xs font-semibold ${p.iconColor}`}>{p.xp}</span>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div
          className="flex flex-wrap justify-center gap-3 mb-12"
          data-aos="fade-up"
          data-aos-delay="420"
        >
          {badges.map((b, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${b.color}`}
            >
              <b.icon className="w-3.5 h-3.5" />
              {b.label}
            </div>
          ))}
        </div>

        {/* Subtext */}
        <div
          className="text-center max-w-xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="500"
        >
          <p className="text-slate-400 text-base leading-relaxed">
            And for you?{' '}
            <span className="text-white font-medium">
              You don't have to manufacture motivation. The scoreboard does it
              for you.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default GamificationSection;
