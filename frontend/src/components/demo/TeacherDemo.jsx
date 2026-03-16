import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Upload, Zap, LineChart, ArrowLeft, Play } from 'lucide-react';
import { enterTeacherDemoMode } from '../../utils/demoData';

const previews = [
  {
    icon: BarChart2,
    color: 'text-primary-400',
    bg: 'bg-primary-400/10 border-primary-400/20',
    title: 'Session Dashboard',
    body: 'See all your sessions at a glance — active, past, and upcoming. Start a live session with one click and share the 6-digit code with your class.',
  },
  {
    icon: Zap,
    color: 'text-accent-400',
    bg: 'bg-accent-400/10 border-accent-400/20',
    title: 'Live Polls & Quizzes',
    body: 'Create a poll in seconds. Watch responses stream in live. Auto-generate MCQs from your uploaded materials — AI does the heavy lifting.',
  },
  {
    icon: LineChart,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10 border-teal-400/20',
    title: 'Engagement Analytics',
    body: 'Track engagement trends session by session. See which topics confused students, which polls had low accuracy, and where attention dropped.',
  },
  {
    icon: Upload,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/20',
    title: 'Resource Upload',
    body: 'Upload PDF, DOCX, or PPTX. The AI reads and indexes everything so students can ask questions and get answers sourced directly from your materials.',
  },
];

const TeacherDemo = () => {
  const navigate = useNavigate();

  const handleLaunch = () => {
    enterTeacherDemoMode();
    navigate('/teacher/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-primary-600/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-12 transition-colors duration-150 min-h-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-400/30 bg-primary-400/10 text-primary-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
            Teacher Experience
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white leading-tight mb-4">
            Welcome to the{' '}
            <span className="bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
              Teacher Dashboard
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
            This is a fully interactive demo. Everything you see here is exactly
            what you'll get with your real @sastra.edu account — with live data
            from your actual sessions.
          </p>
        </div>

        {/* Preview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
          {previews.map((p, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-200"
            >
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${p.bg}`}>
                <p.icon className={`w-5 h-5 ${p.color}`} />
              </div>
              <h3 className="text-white font-semibold mb-2">{p.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={handleLaunch}
            className="inline-flex items-center gap-3 px-10 py-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] shadow-glow-primary text-base min-h-0"
          >
            <Play className="w-5 h-5" />
            Launch Teacher Demo
          </button>
          <p className="text-slate-600 text-xs mt-5 max-w-sm mx-auto">
            Simulated environment with sample data. Sign in with your{' '}
            <span className="text-slate-400">@sastra.edu</span> account for
            the real thing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeacherDemo;
