import React from 'react';
import { FileText, Sparkles } from 'lucide-react';

const AISection = () => {
  return (
    <section id="ai-assistant" className="bg-section-alt py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Story */}
          <div>
            <p
              className="text-xs font-semibold tracking-[0.2em] text-teal-400 uppercase mb-4"
              data-aos="fade-right"
            >
              The 2AM Question
            </p>

            <h2
              className="text-3xl sm:text-4xl font-display font-bold text-white leading-tight mb-6"
              data-aos="fade-right"
              data-aos-delay="100"
            >
              Your best student is stuck on{' '}
              <span className="text-teal-300">Slide 47</span> at 2am.
              <br />
              Your office hours are at 10am.
              <br />
              <span className="text-slate-400 text-2xl sm:text-3xl mt-2 block">
                What happens in between?
              </span>
            </h2>

            <div
              className="space-y-4 text-slate-400 leading-relaxed"
              data-aos="fade-right"
              data-aos-delay="200"
            >
              <p>
                They Google it. They get a StackOverflow answer that's{' '}
                <em>close but not quite right</em>. They get confused. They
                move on. They carry that confusion into your next lecture.
              </p>
              <p>
                Now multiply that by 150 students, every night.
              </p>
              <p className="text-white font-medium">
                What if your own slides, your own notes, your own PDFs could
                answer their questions — accurately, with the exact context you
                taught — any time they ask?
              </p>
            </div>

            <div
              className="mt-8 p-4 border border-teal-400/20 bg-teal-400/5 rounded-xl text-sm text-teal-300 leading-relaxed"
              data-aos="fade-right"
              data-aos-delay="300"
            >
              <Sparkles className="w-4 h-4 inline mr-2 mb-0.5" />
              Your teaching keeps working even when you're not in the room.
            </div>
          </div>

          {/* Right: Chat mockup */}
          <div data-aos="fade-left" data-aos-delay="200">
            <div className="card-glass-dark rounded-2xl overflow-hidden border border-white/10">
              {/* Header */}
              <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse-glow" />
                <span className="text-sm text-white font-medium">AI Study Assistant</span>
                <span className="ml-auto text-xs text-slate-500">Online · Powered by your slides</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Student message */}
                <div className="flex justify-end">
                  <div className="chat-bubble-user max-w-[85%]">
                    I don't understand how a binary search tree stays balanced
                    after deletion
                  </div>
                </div>

                {/* AI response */}
                <div className="flex justify-start">
                  <div className="chat-bubble-ai max-w-[90%]">
                    <p className="mb-3">
                      Great question! In your Data Structures lecture, Prof.
                      explains that AVL trees use{' '}
                      <strong className="text-teal-300">rotations</strong> after
                      deletion to maintain the balance factor (height difference
                      ≤ 1).
                    </p>
                    {/* Source card */}
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400">
                      <FileText className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
                      <span>
                        <span className="text-primary-400 font-medium">Source:</span>{' '}
                        DS_Week7_Trees.pdf · Slide 23
                      </span>
                    </div>
                  </div>
                </div>

                {/* Typing indicator */}
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer note */}
              <div className="px-4 pb-4 text-center">
                <p className="text-xs text-slate-600">
                  Answers sourced exclusively from uploaded course materials
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AISection;
