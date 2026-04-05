# SARADHI — Rich Question Types: Long-Term Vision

## Overview

This document is the **master specification** for all question types SARADHI will support across its full target audience — from Class 6 school students through GATE, UPSC, and postgraduate university exams. It covers every major Indian examination pattern (CBSE, ICSE, State boards, JEE, NEET, GATE, CAT, UGC NET, UPSC) and every major field (CSE, ECE, Mechanical, Civil, Chemistry, Physics, Biology, Mathematics, Arts, Humanities, Commerce, Management, Medical).

The document is organized as a **long-term vision**. Not everything will be built immediately — see the Implementation Phases section for priority order.

---

## Educational Levels Covered

| Level | Exams / Context |
|-------|----------------|
| Class 6–8 | CBSE, ICSE, State boards (middle school) |
| Class 9–10 | CBSE Board (SSLC), ICSE, Tamil Nadu Samacheer, AP/TS SSC |
| Class 11–12 | CBSE HSC, ISC, PUC (Karnataka), Tamil Nadu HSC |
| Competitive entrance | JEE Main, JEE Advanced, NEET, BITSAT, VITEEE |
| Postgraduate entrance | GATE, CAT, UGC NET, CUET-PG, UPSC Prelims |
| University internal | SASTRA, VIT, Anna University CIA/ESE, IIT quizzes |
| Professional courses | CA Foundation/Inter, UPSC Mains |

---

## Question Type Catalog

---

### 1. MCQ — Single Correct

**Description:** 4 options, exactly one correct. The most universal question type across all levels.

**Used in:** Everything — CBSE, JEE Main, NEET, GATE, university internals, school tests.

**Student input:** Click one option (radio button).

**Grading:** `selected_option === correct_answer` (index comparison).

**Variants:**
- Standard 4-option MCQ
- Statement-based MCQ — "Which of the following statements is correct?" (UPSC, UGC NET style)
- Image-options MCQ — options are images instead of text (see Type 11)

**DB fields:**
```
question_type: 'mcq'
options: ["A text", "B text", "C text", "D text"]
correct_answer: 0  -- index
```

**Complexity:** ⭐ (already built)

---

### 2. True / False

**Description:** Binary choice — True or False. Often with an optional "correct the false statement" sub-question in school exams.

**Used in:** Class 6–10 (state boards, CBSE), university formative assessment, quick concept checks.

**Student input:** Two large toggle buttons (True / False).

**Grading:** `selected_option === correct_answer` (0 = True, 1 = False).

**DB fields:**
```
question_type: 'true_false'
correct_answer: 0  -- 0=True, 1=False
options_metadata: { with_correction: false }
```

**Complexity:** ⭐ (already specced)

---

### 3. Fill in the Blank

**Description:** A sentence with one or more gaps. Student types the missing word(s).

**Used in:** Class 6–12 (vocabulary, definitions, chemical formulae), university Part A (1–2 mark questions), CBSE board exams.

**Student input:** Text input field(s).

**Grading:** Case-insensitive match against an accepted answers array. Supports multiple blanks (each blank graded independently).

**DB fields:**
```
question_type: 'fill_blank'
options_metadata: {
  accepted_answers: ["hydrogen", "H2", "H₂"],  -- for single blank
  blanks: [                                      -- for multiple blanks
    { id: 1, accepted: ["mitosis"] },
    { id: 2, accepted: ["meiosis", "reduction division"] }
  ]
}
```

**Complexity:** ⭐ (already specced)

---

### 4. Numeric Answer (with Tolerance)

**Description:** Student enters a numerical value. Correct if within tolerance of the expected answer. Also covers JEE/GATE NAT (Numerical Answer Type) — same concept, Indian competitive exam naming.

**Used in:** Physics, Chemistry, Maths (all levels), JEE Main Section B, GATE NAT, SASTRA university numerical problems.

**Student input:** Number input + optional unit display label.

**Grading:** `|student_value - correct_value| <= tolerance`

**DB fields:**
```
question_type: 'numeric'
options_metadata: {
  correct_value: 9.81,
  tolerance: 0.05,
  unit: "m/s²",
  decimal_places: 2
}
```

**Note:** JEE Main Section B accepts answers in a range (e.g., 9.76 to 9.86). This is exactly tolerance-based grading.

**Complexity:** ⭐ (already specced)

---

### 5. Short Answer

**Description:** Free text response, a few sentences to a paragraph. Requires teacher manual grading.

**Used in:** All university exams (Part A 2-mark, Part B sub-parts), CBSE SA-I/SA-II, state board short questions, Class 9–12.

**Student input:** Textarea (3–5 rows).

**Grading:** Returns `null` — goes into teacher's manual grading queue.

**DB fields:**
```
question_type: 'short_answer'
options_metadata: {
  word_limit: 50,         -- optional guidance
  marks: 2,
  model_answer: "..."     -- shown to teacher during grading
}
```

**Complexity:** ⭐ (already specced)

---

### 6. Code Question

**Description:** A code block is displayed (syntax highlighted). The question asks about its output, a missing line, or a bug. Answer mode is either MCQ or fill-blank.

**Used in:** CSE university exams, competitive programming prep, Class 11–12 CS (CBSE).

**Student input:** MCQ (select output) or text input (type the output/missing value).

**Grading:** MCQ index comparison or fill-blank string match.

**DB fields:**
```
question_type: 'code'
options_metadata: {
  code: "for i in range(3):\n  print(i*2)",
  language: "python",
  code_mode: "mcq"  -- or "fill_blank"
  accepted_answers: ["0\n2\n4"]
}
```

**Complexity:** ⭐⭐ (already specced, needs Prism.js)

---

### 7. Multiple Correct MCQ

**Description:** One or more options may be correct. Student selects all that apply. Used with partial marking in competitive exams.

**Used in:** JEE Advanced (partial marking), GATE MSQ (all-or-nothing), university internals.

**Student input:** Checkboxes.

**Grading schemes:**

| Scheme | Logic |
|--------|-------|
| `all_or_nothing` | Full marks only if exact set selected, else 0 (GATE MSQ) |
| `jee_advanced` | +4 all correct; +3 for 3/4; +2 for 2/4 with no wrong; -2 if any wrong selected |
| `per_correct` | 1 mark per correct selected option, 0 for wrong (simple partial) |

**DB fields:**
```
question_type: 'multi_correct'
options_metadata: {
  correct_options: [0, 2],           -- array of correct indices
  marking_scheme: "jee_advanced",    -- all_or_nothing | jee_advanced | per_correct
  max_marks: 4
}
```

**Complexity:** ⭐⭐

---

### 8. Assertion-Reason (AR)

**Description:** Two statements given — Assertion (A) and Reason (R). Student picks one of 4 fixed relational options. Highly specific to Indian science exams.

**The 4 fixed options (always the same):**
- (A) Both A and R are true, and R is the correct explanation of A
- (B) Both A and R are true, but R is NOT the correct explanation of A
- (C) A is true but R is false
- (D) A is false but R is true *(some boards use: both false)*

**Used in:** NEET (Biology/Chemistry/Physics), CBSE Class 11–12, UGC NET, ICSE.

**Student input:** Radio button on the 4 fixed options.

**Grading:** Index comparison (0–3).

**Teacher creates:** Only provides Assertion text, Reason text, and which option (0–3) is correct. The 4 options are auto-generated — teacher never types them.

**DB fields:**
```
question_type: 'assertion_reason'
options_metadata: {
  assertion: "Newton's first law is also called the law of inertia.",
  reason: "A body at rest tends to remain at rest unless acted upon by a net external force."
}
correct_answer: 0  -- 0=A, 1=B, 2=C, 3=D
```

**Complexity:** ⭐⭐

---

### 9. Match the Following

**Description:** Two columns. Student matches each item in the left column to an item in the right column.

**Used in:** JEE Main/Advanced, NEET, every state board (Tamil Nadu, AP/TS, Karnataka), CBSE, SASTRA Part B, UGC NET.

**Student input:** Dropdown selector next to each left-column item (mobile-friendly, no drag needed).

**Grading:** All pairs must match correctly for full marks. Partial credit option (1 mark per correct pair).

**Teacher creates:** Left items list + Right items list. Sets correct mapping (A→iii, B→i, C→iv, D→ii). Items in the right column are displayed in shuffled order to the student.

**DB fields:**
```
question_type: 'match_following'
options_metadata: {
  left_items: ["Newton's 1st law", "Newton's 2nd law", "Newton's 3rd law"],
  right_items: ["F = ma", "Equal and opposite reactions", "Law of inertia", "Conservation of momentum"],
  correct_mapping: { "0": 2, "1": 0, "2": 1 },  -- left index → right index
  partial_credit: true
}
```

**Complexity:** ⭐⭐

---

### 10. Ordering / Sequence

**Description:** A list of items displayed in shuffled order. Student arranges them in the correct sequence.

**Used in:** Science process steps (mitosis stages, photosynthesis steps), History timelines, Math proof steps (Class 9–12), CAT para-jumble, CBSE ordering questions.

**Student input:** Drag-and-drop reordering (dnd-kit) with number fallback for accessibility.

**Grading:** Exact sequence match for full marks. Partial credit option (1 point per item in correct position).

**DB fields:**
```
question_type: 'ordering'
options_metadata: {
  items: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
  correct_order: [0, 1, 2, 3],   -- indices in correct order
  display_order: [2, 0, 3, 1],   -- shuffled display to student
  partial_credit: false
}
```

**Complexity:** ⭐⭐ (dnd-kit already planned)

---

### 11. Image-Based MCQ / Image Question

**Description:** An image (photograph, diagram, graph, waveform, map, circuit, molecular structure, artwork) is shown as the question stimulus. The question and answer can be any type: MCQ, short answer, numeric, fill-blank.

**This is NOT a separate question type** — it is an **image attachment** feature that works with any question type. Every question type should support `question_image_url`.

**Used in:**
- Biology — microscope images, specimen photos, anatomy diagrams
- ECE — circuit diagrams, waveforms, oscilloscope outputs
- Mechanical — FBD, stress-strain curves, machine parts
- Physics — experimental setups, ray diagrams, graphs
- Chemistry — molecular structures, lab apparatus, titration curves
- Geography/Social Science — maps, satellite images
- Arts — artwork identification, architectural styles
- Class 6–10 — nearly every science/social science question has images

**DB fields (already planned):**
```
question_image_url: "https://..."   -- image shown with the question
options_metadata: {
  option_images: [null, "url2", null, "url3"]   -- per-option images (options can also be images)
}
```

**Complexity:** ⭐ (just image upload + display; question type handles the rest)

---

### 12. Diagram Labeling (Hotspot / Label Placement)

**Description:** A static image is shown (anatomy diagram, circuit schematic, machine cross-section, geographic map). Numbered markers are placed on the image. Student selects the correct label for each marker from a dropdown.

**Used in:**
- Biology (Class 9–12, NEET) — cell organelles, heart anatomy, flower parts, neuron structure
- ECE — op-amp pin labels, transistor terminals, block diagram components
- Mechanical — machine parts, FBD components, gear nomenclature
- Civil — structural member names, soil layer identification
- Geography (Class 6–12) — map feature labeling, river systems
- Chemistry — lab apparatus parts, glassware identification

**Teacher creates:**
1. Upload image
2. Place numbered markers on image (click to place, drag to reposition)
3. For each marker number, type the correct label and 3–4 distractor options

**Student sees:** Image with numbered circles. Dropdown next to each number to pick the correct label.

**Grading:** Each marker graded independently. Total = correct markers / total markers.

**DB fields:**
```
question_type: 'diagram_labeling'
question_image_url: "https://..."
options_metadata: {
  markers: [
    { id: 1, x: 45.2, y: 30.1, correct_label: "Nucleus", options: ["Nucleus", "Mitochondria", "Ribosome", "Vacuole"] },
    { id: 2, x: 60.0, y: 55.5, correct_label: "Mitochondria", options: ["Nucleus", "Mitochondria", "Golgi body", "Lysosome"] }
  ],
  partial_credit: true
}
```

**Complexity:** ⭐⭐⭐

---

### 13. Graph / Data Interpretation

**Description:** A graph or data table is shown as an image. Questions about it can be any type (MCQ, numeric, short answer). This is Image-Based MCQ applied to data visualization — listed separately for clarity because of its distinct pedagogical role.

**Used in:**
- Physics (velocity-time, force-extension, decay curves)
- Chemistry (titration curves, reaction rate graphs, phase diagrams)
- Biology (enzyme activity curves, population growth)
- Economics/Commerce (demand-supply, cost curves)
- Mathematics (function plots, statistical graphs)
- CAT DILR (bar charts, pie charts, tables)
- CBSE case-study questions (graph in the stimulus)

**Implementation:** Same as Image-Based MCQ — `question_image_url` + any question type. No separate DB type needed. Flagged here for awareness.

**Complexity:** ⭐ (handled by image support on existing types)

---

### 14. Truth Table Completion

**Description:** A truth table is shown with some cells filled in. Student fills in the missing output values. Used in digital logic and Boolean algebra.

**Used in:** CSE and ECE (Class 11–12 and university level), digital electronics, computer organization.

**Student input:** Grid of dropdowns or radio toggles (0/1) for each missing cell.

**Grading:** All missing cells must be correct for full marks. Partial credit per correct cell.

**DB fields:**
```
question_type: 'truth_table'
options_metadata: {
  headers: ["A", "B", "A AND B", "A OR B", "NOT A"],
  rows: [
    { inputs: [0, 0], outputs: [null, null, null] },  -- null = student fills
    { inputs: [0, 1], outputs: [0, null, null] },      -- 0/1 = pre-filled
    { inputs: [1, 0], outputs: [null, 1, null] },
    { inputs: [1, 1], outputs: [null, null, 0] }
  ],
  correct_outputs: [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0]
  ],
  partial_credit: true
}
```

**Complexity:** ⭐⭐⭐

---

### 15. Code Trace / Execution Trace

**Description:** A code block is shown. Student traces its execution step by step, or answers specific questions about intermediate values (variable state at a given line).

**Differs from Type 6 (Code Question):** Type 6 asks about output via MCQ/fill-blank. This type asks about intermediate state — "what is the value of `x` after line 4?" — with structured step-by-step inputs.

**Used in:** CSE (data structures, algorithms, recursion), Class 11–12 CS (CBSE), competitive programming.

**Student input:** Series of fill-blank or MCQ inputs, one per trace step.

**DB fields:**
```
question_type: 'code_trace'
options_metadata: {
  code: "x = 5\nfor i in range(3):\n  x += i\nprint(x)",
  language: "python",
  trace_steps: [
    { line: 1, ask: "Value of x?", correct: "5", type: "fill_blank" },
    { line: 2, ask: "Value of i in iteration 1?", correct: "0", type: "fill_blank" },
    { line: 3, ask: "Value of x after iteration 1?", correct: "5", type: "fill_blank" }
  ]
}
```

**Complexity:** ⭐⭐⭐

---

### 16. Passage / Case-Study Cluster

**Description:** A reading passage, data set, clinical scenario, or business case is shown. Multiple sub-questions follow — each sub-question is an independent question of any type (MCQ, short answer, numeric, etc.).

**Used in:**
- CBSE case-based / source-based questions (mandatory from 2023, 10–15% of paper)
- JEE Advanced paragraph-based questions
- NEET passage-based questions
- CAT DILR (data sets with 4 linked questions)
- Social Science / History (primary source analysis)
- Medical education (clinical case → diagnosis, investigation, treatment questions)
- Management / MBA (business case)
- Class 6–10 (comprehension passages in English, Science, Social Science)

**Live session behavior:** Sub-questions activate one by one (teacher controls pace, same as regular polls). Students see the passage above each sub-question.

**New table: `poll_clusters`**
```sql
CREATE TABLE poll_clusters (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(10) REFERENCES sessions(session_id),
  title VARCHAR(255),
  passage TEXT,
  passage_image_url TEXT,
  passage_latex TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE polls ADD COLUMN IF NOT EXISTS cluster_id INTEGER REFERENCES poll_clusters(id);
```

**Complexity:** ⭐⭐⭐

---

### 17. Essay / Long Answer

**Description:** Free text response requiring extended writing. Teacher grades manually with optional rubric.

**Used in:**
- University exams (SASTRA Part B 16-mark, Anna University, IIT end-sem)
- CBSE long answer (5-mark, 8-mark)
- ICSE descriptive questions
- UPSC Mains (10-mark, 15-mark, essay papers)
- Arts/Humanities throughout
- Management case analysis

**Student input:** Rich textarea with word count display.

**Grading:** Teacher manual. Optional rubric template (list of criteria + marks per criterion).

**DB fields:**
```
question_type: 'essay'
options_metadata: {
  word_limit: 250,
  marks: 16,
  rubric: [
    { criterion: "Correct identification of concept", marks: 4 },
    { criterion: "Derivation / working shown", marks: 8 },
    { criterion: "Diagram included and labelled", marks: 4 }
  ],
  model_answer: "..."
}
```

**Complexity:** ⭐⭐ (UI + rubric grading interface for teacher)

---

### 18. One-Word / One-Line Answer

**Description:** Answer is a single word, formula, or one short sentence. Very common in Indian university Part A sections and state board exams.

**Used in:** SASTRA Part A (all compulsory 2-mark questions), Anna University Part A, state board 1-mark objective section, Class 6–12 one-mark questions.

**Student input:** Short text input (single line, max ~50 characters).

**Grading:** Case-insensitive exact match or near-match against accepted answers array. (Subset of fill_blank — surfaced as a separate type for teacher UI clarity, but shares grading logic.)

**DB fields:**
```
question_type: 'one_word'
options_metadata: {
  accepted_answers: ["Pascal", "Pa", "N/m²", "N m⁻²"],
  marks: 1
}
```

**Complexity:** ⭐ (shares grading logic with fill_blank)

---

### 19. Differentiate Between (Tabular Comparison)

**Description:** Student fills in a 2-column comparison table. Highly specific to Indian school and university exams. "Differentiate between mitosis and meiosis" is a classic example.

**Used in:**
- Class 9–12 Biology, Chemistry, Physics (CBSE, ICSE, State boards)
- University exams (distinguish between OSI and TCP/IP model, etc.)
- NEET, JEE (as short-answer variant)

**Teacher creates:** Column headers (e.g., "Mitosis" vs "Meiosis"), number of rows, and correct answers per cell.

**Student input:** Text inputs arranged in a 2-column table grid. Each row is one point of difference.

**Grading:** Teacher manual (conceptual answers, hard to auto-grade). Optional keyword matching per cell.

**DB fields:**
```
question_type: 'differentiate'
options_metadata: {
  col1_header: "Mitosis",
  col2_header: "Meiosis",
  rows: 4,
  marks_per_row: 1,
  model_answers: [
    { col1: "Occurs in somatic cells", col2: "Occurs in reproductive cells" },
    { col1: "Produces 2 daughter cells", col2: "Produces 4 daughter cells" }
  ]
}
```

**Complexity:** ⭐⭐

---

### 20. Match with Images

**Description:** Matching question where one or both columns contain images instead of text. Student matches image to text label, or image to image.

**Used in:**
- Biology — match organism image to its phylum/class
- History — match portrait image to historical figure name
- Geography — match landform image to name
- Chemistry — match lab apparatus image to its name/use
- Class 6–10 (very common in science workbooks)

**Implementation:** Extension of Type 9 (Match the Following) with image support in items.

**DB fields:**
```
question_type: 'match_following'   -- reuses the same type
options_metadata: {
  left_items: [
    { type: "image", url: "https://...frog.jpg", alt: "Animal A" },
    { type: "image", url: "https://...snake.jpg", alt: "Animal B" }
  ],
  right_items: [
    { type: "text", value: "Amphibia" },
    { type: "text", value: "Reptilia" }
  ],
  correct_mapping: { "0": 0, "1": 1 }
}
```

**Complexity:** ⭐⭐ (image support added to match_following)

---

## Negative Marking Configuration

Not a question type — a **property** that applies to any gradable question type.

**Supported schemes:**

| Exam | Penalty |
|------|---------|
| JEE Main/Advanced | -1 mark per wrong answer |
| NEET | -1 mark per wrong answer |
| GATE (1-mark) | -1/3 mark |
| GATE (2-mark) | -2/3 mark |
| UPSC Prelims | -1/3 mark |
| Custom | Teacher-defined |

**DB fields (added to `options_metadata` on any question):**
```
options_metadata: {
  negative_marking: true,
  negative_value: 0.33,    -- fraction of question marks deducted
  negative_scheme: "gate_1mark"  -- gate_1mark | gate_2mark | jee | neet | custom
}
```

**Frontend:** Warning banner on student view — "⚠ Negative marking: −0.33 for wrong answer."

---

## Bloom's Taxonomy Tagging

Applies to every question type. NEP 2020 mandates competency-based assessment with explicit cognitive level tracking.

| Level | Description | Typical Question |
|-------|-------------|-----------------|
| **Remember** | Recall facts | Define, state, list, identify |
| **Understand** | Explain concepts | Explain, describe, summarize |
| **Apply** | Use in new context | Calculate, solve, demonstrate |
| **Analyze** | Break down | Compare, differentiate, classify |
| **Evaluate** | Judge / critique | Justify, assess, argue |
| **Create** | Produce new | Design, construct, formulate |

**DB field:** `blooms_level VARCHAR(20)` on `polls` and `generated_mcqs` tables.

---

## Question Metadata (All Types)

Every question supports:

| Field | Type | Purpose |
|-------|------|---------|
| `marks` | INTEGER | Marks for this question (Indian exams always show marks) |
| `difficulty_level` | VARCHAR(20) | easy / medium / hard |
| `subject_tag` | VARCHAR(50) | math, physics, chemistry, biology, cs, ece, mechanical, civil, english, history, economics, art |
| `topic` | VARCHAR(100) | Chapter/unit (e.g., "Kinematics") |
| `sub_topic` | VARCHAR(100) | Sub-unit (e.g., "Projectile Motion") |
| `blooms_level` | VARCHAR(20) | remember / understand / apply / analyze / evaluate / create |
| `question_image_url` | TEXT | Image displayed with the question |
| `question_latex` | TEXT | LaTeX equation displayed with question |
| `options_metadata` | JSONB | All type-specific config (see each type above) |
| `solution_steps` | JSONB | Step-by-step solution shown after reveal |
| `time_limit` | INTEGER | Seconds (per question override) |
| `exam_tags` | VARCHAR(50)[] | e.g., ["jee_2022", "neet_2023", "cbse_2024"] |

---

## Database Schema

### Migration: `011_rich_question_types.sql`

```sql
-- polls table additions
ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS question_type      VARCHAR(30)   DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS question_image_url TEXT,
  ADD COLUMN IF NOT EXISTS question_latex      TEXT,
  ADD COLUMN IF NOT EXISTS options_metadata    JSONB,
  ADD COLUMN IF NOT EXISTS solution_steps      JSONB,
  ADD COLUMN IF NOT EXISTS subject_tag         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS difficulty_level    VARCHAR(20)   DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS marks               INTEGER       DEFAULT 1,
  ADD COLUMN IF NOT EXISTS blooms_level        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS topic               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sub_topic           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cluster_id          INTEGER,
  ADD COLUMN IF NOT EXISTS exam_tags           VARCHAR(50)[];

-- poll_responses additions
ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS answer_data JSONB;

-- sessions additions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS subject      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subject_tags VARCHAR(50)[];

-- generated_mcqs additions (same rich columns)
ALTER TABLE generated_mcqs
  ADD COLUMN IF NOT EXISTS question_type      VARCHAR(30)   DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS question_image_url TEXT,
  ADD COLUMN IF NOT EXISTS question_latex      TEXT,
  ADD COLUMN IF NOT EXISTS options_metadata    JSONB,
  ADD COLUMN IF NOT EXISTS solution_steps      JSONB,
  ADD COLUMN IF NOT EXISTS subject_tag         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS difficulty_level    VARCHAR(20)   DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS blooms_level        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS topic               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS exam_tags           VARCHAR(50)[];

-- passage/case-study clusters
CREATE TABLE IF NOT EXISTS poll_clusters (
  id                  SERIAL PRIMARY KEY,
  session_id          VARCHAR(10)   REFERENCES sessions(session_id),
  title               VARCHAR(255),
  passage             TEXT,
  passage_image_url   TEXT,
  passage_latex       TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE polls
  ADD CONSTRAINT fk_cluster FOREIGN KEY (cluster_id) REFERENCES poll_clusters(id);
```

---

## Frontend Dependencies

```
katex                  — LaTeX math rendering (inline $...$ and block $$...$$)
prismjs                — Syntax-highlighted code blocks
@dnd-kit/core          — Drag-and-drop core
@dnd-kit/sortable      — Sortable lists (Ordering/Sequence type)
@dnd-kit/utilities     — Drag utilities
```

Install:
```bash
cd SAS-EDU-AI_F && npm install katex prismjs @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Frontend Components Required

### Shared (used by both teacher and student)

| Component | Purpose |
|-----------|---------|
| `shared/LatexRenderer.jsx` | KaTeX wrapper — renders `$...$` and `$$...$$` in mixed text |
| `shared/CodeBlock.jsx` | Prism.js syntax-highlighted code with language badge |
| `shared/RichQuestionRenderer.jsx` | Universal question renderer — handles all types |
| `shared/ImageWithMarkers.jsx` | Image with clickable/placed numbered markers (Diagram Labeling) |
| `shared/TruthTableInput.jsx` | Interactive truth table grid |
| `shared/MatchingInput.jsx` | Two-column match with dropdowns |
| `shared/OrderingInput.jsx` | Drag-to-reorder list (dnd-kit) |
| `shared/DifferentiateTable.jsx` | 2-column comparison table input |

### Teacher

| Component | Purpose |
|-----------|---------|
| `teacher/SolutionStepsBuilder.jsx` | Ordered step editor (title + explanation + LaTeX + code) |
| `teacher/DiagramMarkerEditor.jsx` | Upload image, place markers, set label options |
| `teacher/ClusterBuilder.jsx` | Create passage + attach sub-questions |
| `teacher/RubricBuilder.jsx` | Create grading rubric for essay/short answer |

### Student

| Component | Purpose |
|-----------|---------|
| `student/SolutionStepsViewer.jsx` | Accordion solution display post-reveal |
| `student/AssertionReasonView.jsx` | Two-statement display with 4 fixed options |
| `student/PassageView.jsx` | Sticky passage display above sub-questions |

---

## Backend Components

### routes/polls.js

New `gradeResponse(questionType, answerData, poll)` function handles all types:

| Type | Grading Logic |
|------|--------------|
| `mcq`, `true_false`, `one_word` variant | Index / string comparison |
| `fill_blank`, `one_word` | Case-insensitive match against accepted_answers array |
| `numeric` | `\|student - correct\| <= tolerance` |
| `short_answer`, `essay`, `differentiate` | Returns `null` (teacher manual) |
| `code` | MCQ index or fill_blank string match |
| `multi_correct` | Set comparison with scheme-based partial marking |
| `assertion_reason` | Index comparison (0–3) |
| `match_following` | Pair-by-pair comparison, partial credit option |
| `ordering` | Sequence comparison, partial credit option |
| `diagram_labeling` | Marker-by-marker label match |
| `truth_table` | Cell-by-cell output comparison |
| `code_trace` | Step-by-step fill_blank matching |

Negative marking applied post-grading:
```js
if (!isCorrect && answerData.attempted && poll.options_metadata?.negative_marking) {
  score -= poll.options_metadata.negative_value;
}
```

---

## Subject-Aware AI

When a session has a subject set, the RAG pipeline includes subject-specific instructions:

| Subject | AI Behavior |
|---------|------------|
| **Math** | Format all equations in LaTeX, show step-by-step working, reference theorems |
| **Physics** | Include relevant formulas in LaTeX, always show units, reference laws (Newton, Faraday, etc.) |
| **Chemistry** | Use chemical notation (H₂O), include balanced reaction equations, IUPAC names |
| **CS** | Include code examples with syntax highlighting, explain time/space complexity |
| **ECE** | Include circuit equations, reference component specs, use standard notation |
| **Mechanical** | Include FBD descriptions, standard formulas, SI units |
| **Biology** | Reference biological processes, use binomial nomenclature, classification hierarchy |
| **Engineering** | Include technical formulas, reference standards, show unit analysis |
| **Literature** | Quote specific passages, use literary analysis terminology, reference author/period |
| **Art** | Reference art movements, techniques, visual elements, historical context |
| **Business / Management** | Include frameworks (SWOT, Porter's 5), case study references, financial ratios |
| **Economics** | Include supply-demand analysis, graph descriptions, policy implications |
| **Geography** | Reference coordinates, climate zones, geomorphological processes |
| **History** | Reference dates, causes-effects, primary sources |

---

## Field-to-Question-Type Matrix

| Field | Primary Types | Secondary Types |
|-------|--------------|-----------------|
| **CSE** | MCQ, Code, Code Trace, Truth Table, Ordering, Numeric, Fill Blank | Short Answer, Essay, Multi-correct |
| **ECE** | MCQ, Numeric, Truth Table, Diagram Labeling, Image-based MCQ, Match | Code, Fill Blank |
| **Mechanical** | Numeric, Image-based MCQ, Diagram Labeling, Short Answer, Essay | Match, Ordering |
| **Civil** | Numeric, Image-based MCQ, Short Answer, Essay | Diagram Labeling, Match |
| **Chemistry** | MCQ, Numeric, Fill Blank, Image-based MCQ, Diagram Labeling | Match, Assertion-Reason |
| **Physics** | Numeric, MCQ, Image-based MCQ, Assertion-Reason, Graph Interp. | Multi-correct, Code |
| **Biology** | MCQ, Assertion-Reason, Diagram Labeling, Match with Images, Ordering | Fill Blank, Differentiate |
| **Mathematics** | Numeric, Fill Blank, Short Answer, Ordering, MCQ | Essay (proofs), Code |
| **English / Literature** | Passage Cluster, Essay, Short Answer, Fill Blank, True/False | MCQ, Ordering |
| **History / Social Science** | MCQ, Passage Cluster, Image-based MCQ, Short Answer, Essay | Match, Ordering |
| **Commerce / Accounts** | MCQ, Numeric, Short Answer, Essay | Case Study, True/False |
| **Management / MBA** | Case Study, Essay, MCQ, Short Answer | Numeric, Multi-correct |
| **Medical / NEET prep** | MCQ, Assertion-Reason, Match, Diagram Labeling, Image-based | Passage Cluster |
| **Class 6–8** | MCQ, True/False, Fill Blank, One-Word, Match, Ordering | Image-based MCQ, Short Answer |
| **Class 9–10** | MCQ, Short Answer, Essay, Fill Blank, Diagram Labeling, Case-Study | Assertion-Reason, Differentiate |
| **Class 11–12** | All types (JEE/NEET prep patterns dominate) | — |

---

## Implementation Phases

### Phase 1 — Foundation (Build First)
*Covers 90% of daily classroom use*

1. DB migration `011_rich_question_types.sql`
2. `gradeResponse()` in polls.js for Types 1–6
3. `LatexRenderer.jsx` + `CodeBlock.jsx`
4. `RichQuestionRenderer.jsx` (Types 1–6)
5. `SolutionStepsBuilder.jsx` + `SolutionStepsViewer.jsx`
6. Update `PollPanel.jsx` — question type selector, LaTeX field, subject tag, difficulty
7. Update `EnhancedStudentSession.jsx` — use RichQuestionRenderer, send `answer_data`
8. Update `sessions.js` — accept `subject` field

### Phase 2 — India-Critical Types
*Covers competitive exam patterns (JEE, NEET, GATE, CBSE)*

9. Multiple Correct MCQ (Type 7) — checkboxes + partial marking schemes
10. Assertion-Reason (Type 8) — fixed 4-option display
11. Match the Following (Type 9) — dropdown column matching
12. Ordering/Sequence (Type 10) — dnd-kit sortable
13. Negative marking config — property on any question
14. One-Word Answer (Type 18) — short text, exact match

### Phase 3 — Visual & Field-Specific Types
*Covers engineering, biology, geography, arts*

15. Image support on all question types (already `question_image_url`, expose in UI)
16. Diagram Labeling (Type 12) — marker editor + dropdown student input
17. Differentiate Between (Type 19) — 2-column table input
18. Match with Images (Type 20) — image items in match columns
19. Essay / Long Answer (Type 17) — word counter + rubric builder

### Phase 4 — Advanced Types
*Covers CAT, UPSC, Medical, CSE deep questions*

20. Passage / Case-Study Cluster (Type 16) — new table + clustered activation
21. Truth Table Completion (Type 14) — grid input
22. Code Trace (Type 15) — step-by-step trace inputs
23. Bloom's taxonomy tag — teacher UI + analytics dashboard

---

## Verification Checklist (Phase 1)

- [ ] Run migration: `cd backend && node run-migration-011.js`
- [ ] Create a **Math** session — subject dropdown visible in CreateSession
- [ ] Teacher creates **Numeric** question: "What is g?" correct=9.81, tolerance=0.05, unit=m/s²
- [ ] Student answers 9.83 → correct; answers 10.5 → wrong
- [ ] Teacher creates **Fill Blank**: accepted = ["oxygen", "O", "O₂"]
- [ ] Student types "OXYGEN" → correct (case-insensitive)
- [ ] Teacher creates **Short Answer** → appears in manual grading queue
- [ ] Teacher creates **Code** question (Python snippet) → student sees syntax-highlighted block
- [ ] LaTeX question `$F = ma$` renders correctly in student view
- [ ] Solution steps appear in student view after teacher sends `reveal-answers`
- [ ] AI Assistant in a Physics session responds with LaTeX equations that render
- [ ] Upload a PDF with `$$E = mc^2$$` → chunk is not split mid-equation in Pinecone
