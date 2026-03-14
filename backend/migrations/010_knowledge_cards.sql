-- Migration 010: Knowledge Cards — interactive Q&A card activity
-- Teachers generate AI Q&A pairs distributed as cards to students for live interaction

-- Knowledge card rounds (one round per activity instance in a session)
CREATE TABLE IF NOT EXISTS knowledge_card_rounds (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  teacher_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'distributed', 'active', 'completed')),
  total_pairs INTEGER DEFAULT 0,
  topic VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kc_rounds_session ON knowledge_card_rounds(session_id);

-- Knowledge card Q&A pairs
CREATE TABLE IF NOT EXISTS knowledge_card_pairs (
  id SERIAL PRIMARY KEY,
  round_id INTEGER REFERENCES knowledge_card_rounds(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revealed', 'completed', 'skipped')),
  question_holder_id VARCHAR(50),   -- student assigned the question
  answer_holder_id VARCHAR(50),     -- student assigned the answer
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kc_pairs_round ON knowledge_card_pairs(round_id);
CREATE INDEX IF NOT EXISTS idx_kc_pairs_question_holder ON knowledge_card_pairs(question_holder_id);
CREATE INDEX IF NOT EXISTS idx_kc_pairs_answer_holder ON knowledge_card_pairs(answer_holder_id);

-- Votes on knowledge card answers (thumbs up/down)
CREATE TABLE IF NOT EXISTS knowledge_card_votes (
  id SERIAL PRIMARY KEY,
  pair_id INTEGER REFERENCES knowledge_card_pairs(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_kc_vote UNIQUE (pair_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_kc_votes_pair ON knowledge_card_votes(pair_id);
