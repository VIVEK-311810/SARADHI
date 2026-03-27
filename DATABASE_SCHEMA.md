# SAS Edu AI — Supabase Database Schema Reference

> **Project:** Project_IIT (`zihzhlamocqeallvzqmb`)
> **Region:** ap-south-1 (Mumbai)
> **PostgreSQL Version:** 17.6.1
> **Schema:** public
> **Last documented:** 2026-03-26
> **Source:** Live Supabase MCP + migration files `backend/migrations/001–010`

---

## Quick Stats

| Metric | Value |
|---|---|
| Total tables | 31 |
| Total indexes | 115 (including PKs) |
| Total foreign keys | 37 |
| RLS enabled | 0 / 31 tables (**all disabled**) |
| Migrations applied | 010 |

---

## Table of Contents

1. [Core Tables](#1-core-tables)
   - [users](#users)
   - [sessions](#sessions)
   - [session_participants](#session_participants)
2. [Poll System](#2-poll-system)
   - [polls](#polls)
   - [poll_responses](#poll_responses)
   - [generated_mcqs](#generated_mcqs)
3. [Resource & RAG Pipeline](#3-resource--rag-pipeline)
   - [resources](#resources)
   - [resource_chunks](#resource_chunks)
   - [resource_access_logs](#resource_access_logs)
   - [uploaded_resources](#uploaded_resources)
   - [query_classifications](#query_classifications)
4. [Transcription](#4-transcription)
   - [transcription_sessions](#transcription_sessions)
   - [transcripts](#transcripts)
5. [Gamification](#5-gamification)
   - [student_points](#student_points)
   - [student_badges](#student_badges)
   - [student_streaks](#student_streaks-global-legacy)
   - [student_xp](#student_xp)
   - [session_streaks](#session_streaks)
   - [session_summaries](#session_summaries)
6. [Attendance](#6-attendance)
   - [session_attendance_windows](#session_attendance_windows)
7. [Community](#7-community)
   - [community_tickets](#community_tickets)
   - [community_replies](#community_replies)
   - [community_upvotes](#community_upvotes)
8. [AI Study Assistant](#8-ai-study-assistant)
   - [ai_conversations](#ai_conversations)
   - [ai_messages](#ai_messages)
   - [ai_doubts](#ai_doubts)
   - [ai_study_analytics](#ai_study_analytics)
9. [Session Notes](#9-session-notes)
   - [session_notes](#session_notes)
10. [Knowledge Cards](#10-knowledge-cards)
    - [knowledge_card_rounds](#knowledge_card_rounds)
    - [knowledge_card_pairs](#knowledge_card_pairs)
    - [knowledge_card_votes](#knowledge_card_votes)
11. [All Indexes Summary](#11-all-indexes-summary)
12. [All Foreign Keys Summary](#12-all-foreign-keys-summary)
13. [Security Advisories](#13-security-advisories)
14. [Performance Advisories](#14-performance-advisories)
15. [Migration History](#15-migration-history)

---

## 1. Core Tables

### `users`

> Stores both teachers and students with OAuth2 authentication and SASTRA domain restrictions.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `varchar` | NOT NULL | — | **PK**. SHA256 hash of name (teacher) or student register number |
| `email` | `varchar` | NOT NULL | — | UNIQUE. Must be `@sastra.edu` (teacher) or `number@sastra.ac.in` (student) |
| `full_name` | `varchar` | NOT NULL | — | |
| `role` | `varchar` | NOT NULL | — | CHECK: `'teacher'` or `'student'` |
| `register_number` | `varchar` | NULL | — | Student register number |
| `department` | `varchar` | NULL | — | |
| `oauth_provider` | `varchar` | NULL | `'google'` | |
| `oauth_id` | `varchar` | NULL | — | Google OAuth subject ID |
| `profile_picture_url` | `text` | NULL | — | |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `last_login` | `timestamp` | NULL | — | |
| `is_active` | `boolean` | NULL | `true` | |

**Constraints:**
- `users_pkey` — PRIMARY KEY (`id`)
- `users_email_key` — UNIQUE (`email`)
- CHECK: `role IN ('teacher', 'student')`

**Indexes:**
```sql
CREATE UNIQUE INDEX users_pkey ON users USING btree (id)
CREATE UNIQUE INDEX users_email_key ON users USING btree (email)
CREATE INDEX idx_users_email ON users USING btree (email)
CREATE INDEX idx_users_oauth_id ON users USING btree (oauth_id)
CREATE INDEX idx_users_register_number ON users USING btree (register_number)
CREATE INDEX idx_users_role ON users USING btree (role)
```

> Note: `idx_users_email` is redundant with `users_email_key` — both index `email`.

---

### `sessions`

> Class sessions created by teachers that students can join.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval('sessions_id_seq')` | **PK** (serial) |
| `session_id` | `varchar` | NOT NULL | — | UNIQUE. 6-char human-readable join code (e.g., `ABC123`) |
| `teacher_id` | `varchar` | NULL | — | FK → `users.id` |
| `title` | `varchar` | NOT NULL | — | |
| `description` | `text` | NULL | — | |
| `course_name` | `varchar` | NULL | — | |
| `is_active` | `boolean` | NULL | `false` | Session is joinable |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `ended_at` | `timestamp` | NULL | — | |
| `is_live` | `boolean` | NOT NULL | `false` | Live streaming started (added migration 007) |
| `live_started_at` | `timestamp` | NULL | — | |
| `live_ended_at` | `timestamp` | NULL | — | |
| `notes_status` | `varchar` | NULL | `'none'` | |
| `notes_url` | `text` | NULL | — | |
| `notes_generated_at` | `timestamp` | NULL | — | |
| `notes_error` | `text` | NULL | — | |
| `leaderboard_visible` | `boolean` | NULL | `false` | Added migration 009 |

**Constraints:**
- `sessions_pkey` — PRIMARY KEY (`id`)
- `sessions_session_id_key` — UNIQUE (`session_id`)
- `sessions_teacher_id_fkey` — FK `teacher_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX sessions_pkey ON sessions USING btree (id)
CREATE UNIQUE INDEX sessions_session_id_key ON sessions USING btree (session_id)
CREATE INDEX idx_sessions_is_active ON sessions USING btree (is_active)
CREATE INDEX idx_sessions_session_id ON sessions USING btree (session_id)
CREATE INDEX idx_sessions_teacher ON sessions USING btree (teacher_id)
CREATE INDEX idx_sessions_teacher_id ON sessions USING btree (teacher_id)
```

> Note: `idx_sessions_teacher` and `idx_sessions_teacher_id` are duplicates — both index `teacher_id`.

---

### `session_participants`

> Junction table tracking student participation in sessions with real-time status.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` |
| `student_id` | `varchar` | NULL | — | FK → `users.id` |
| `joined_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `left_at` | `timestamp` | NULL | — | |
| `is_active` | `boolean` | NULL | `true` | Currently in session |
| `connection_status` | `varchar` | NULL | `'offline'` | CHECK: `'online'` or `'offline'` |
| `websocket_id` | `varchar` | NULL | — | |
| `last_activity` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `attendance_status` | `varchar` | NULL | NULL | `'present'`, `'late'`, `'absent'`, or NULL (not taken) |
| `attendance_marked_at` | `timestamp` | NULL | — | |

**Constraints:**
- `session_participants_pkey` — PRIMARY KEY (`id`)
- `session_participants_session_id_student_id_key` — UNIQUE (`session_id`, `student_id`)
- FK `session_id` → `sessions.id`
- FK `student_id` → `users.id`
- CHECK: `connection_status IN ('online', 'offline')`

**Indexes:**
```sql
CREATE UNIQUE INDEX session_participants_pkey ON session_participants USING btree (id)
CREATE UNIQUE INDEX session_participants_session_id_student_id_key ON session_participants USING btree (session_id, student_id)
CREATE INDEX idx_session_participants_active ON session_participants USING btree (is_active)
CREATE INDEX idx_session_participants_session_id ON session_participants USING btree (session_id)
CREATE INDEX idx_session_participants_student ON session_participants USING btree (student_id)
CREATE INDEX idx_session_participants_student_id ON session_participants USING btree (student_id)
CREATE INDEX idx_sp_session_attendance ON session_participants USING btree (session_id, attendance_status)
```

> Note: `idx_session_participants_student` and `idx_session_participants_student_id` are duplicates.

---

## 2. Poll System

### `polls`

> Polls/MCQs created by teachers for real-time student engagement with queue management.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` |
| `question` | `text` | NOT NULL | — | |
| `options` | `jsonb` | NOT NULL | — | Array of option strings: `["A", "B", "C", "D"]` |
| `correct_answer` | `int4` | NULL | — | Zero-based index into `options` |
| `justification` | `text` | NULL | — | Explanation of correct answer |
| `time_limit` | `int4` | NULL | `60` | Seconds |
| `is_active` | `boolean` | NULL | `false` | Poll is currently live |
| `queue_status` | `varchar` | NULL | `'manual'` | CHECK: `'manual'`, `'queued'`, `'active'`, `'completed'` |
| `queue_position` | `int4` | NULL | — | Position in auto-advance queue |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `activated_at` | `timestamp` | NULL | — | |
| `completed_at` | `timestamp` | NULL | — | |
| `ends_at` | `timestamp` | NULL | — | Added migration 005 — persists timer across restarts |
| `difficulty` | `int4` | NULL | `1` | 1=easy, 2=medium, 3=hard (added migration 009) |

**Constraints:**
- `polls_pkey` — PRIMARY KEY (`id`)
- FK `session_id` → `sessions.id`
- CHECK: `queue_status IN ('manual','queued','active','completed')`

**Indexes:**
```sql
CREATE UNIQUE INDEX polls_pkey ON polls USING btree (id)
CREATE INDEX idx_polls_active_ends ON polls USING btree (is_active, ends_at) WHERE (is_active = true)
CREATE INDEX idx_polls_created_at ON polls USING btree (created_at)
CREATE INDEX idx_polls_is_active ON polls USING btree (is_active)
CREATE INDEX idx_polls_queue_position ON polls USING btree (queue_position)
CREATE INDEX idx_polls_queue_status ON polls USING btree (queue_status)
CREATE INDEX idx_polls_session_id ON polls USING btree (session_id)
```

---

### `poll_responses`

> Student responses to polls with timing and correctness tracking.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `poll_id` | `int4` | NULL | — | FK → `polls.id` |
| `student_id` | `varchar` | NULL | — | FK → `users.id` |
| `selected_option` | `int4` | NOT NULL | — | Zero-based index of chosen answer |
| `is_correct` | `boolean` | NULL | — | |
| `response_time` | `int4` | NULL | — | Milliseconds from poll activation to response |
| `responded_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `poll_responses_pkey` — PRIMARY KEY (`id`)
- `poll_responses_poll_id_student_id_key` — UNIQUE (`poll_id`, `student_id`) — prevents double-answering
- FK `poll_id` → `polls.id`
- FK `student_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX poll_responses_pkey ON poll_responses USING btree (id)
CREATE UNIQUE INDEX poll_responses_poll_id_student_id_key ON poll_responses USING btree (poll_id, student_id)
CREATE INDEX idx_poll_responses_poll_id ON poll_responses USING btree (poll_id)
CREATE INDEX idx_poll_responses_responded_at ON poll_responses USING btree (responded_at)
CREATE INDEX idx_poll_responses_student ON poll_responses USING btree (student_id)
CREATE INDEX idx_poll_responses_student_id ON poll_responses USING btree (student_id)
```

> Note: `idx_poll_responses_student` and `idx_poll_responses_student_id` are duplicates.

---

### `generated_mcqs`

> AI-generated MCQs awaiting teacher approval and activation.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` |
| `question` | `text` | NOT NULL | — | |
| `options` | `jsonb` | NOT NULL | — | Same format as `polls.options` |
| `correct_answer` | `int4` | NOT NULL | — | |
| `justification` | `text` | NULL | — | |
| `time_limit` | `int4` | NULL | `60` | |
| `sent_to_students` | `boolean` | NULL | `false` | Teacher approved and pushed to polls |
| `sent_at` | `timestamp` | NULL | — | |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `generated_mcqs_pkey` — PRIMARY KEY (`id`)
- FK `session_id` → `sessions.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX generated_mcqs_pkey ON generated_mcqs USING btree (id)
CREATE INDEX idx_generated_mcqs_created_at ON generated_mcqs USING btree (created_at)
CREATE INDEX idx_generated_mcqs_sent_to_students ON generated_mcqs USING btree (sent_to_students)
CREATE INDEX idx_generated_mcqs_session_id ON generated_mcqs USING btree (session_id)
```

---

## 3. Resource & RAG Pipeline

### `resources`

> File resources stored in Supabase Storage; the primary input to the RAG pipeline.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | **PK** |
| `session_id` | `varchar` | NOT NULL | — | 6-char session code (not FK to sessions.id — FK to sessions.session_id) |
| `teacher_id` | `text` | NULL | — | |
| `title` | `varchar` | NOT NULL | — | |
| `description` | `text` | NULL | — | |
| `resource_type` | `varchar` | NOT NULL | — | `pdf`, `ppt`, `doc`, `url`, etc. |
| `file_path` | `text` | NOT NULL | — | Supabase Storage path |
| `file_url` | `text` | NOT NULL | — | Public URL |
| `file_name` | `varchar` | NULL | — | |
| `file_size` | `int4` | NULL | — | Bytes |
| `mime_type` | `varchar` | NULL | — | |
| `is_downloadable` | `boolean` | NULL | `true` | |
| `is_public` | `boolean` | NULL | `false` | |
| `view_count` | `int4` | NULL | `0` | |
| `download_count` | `int4` | NULL | `0` | |
| `is_vectorized` | `boolean` | NULL | `false` | Embedded into Pinecone |
| `vectorization_status` | `varchar` | NULL | `'pending'` | `pending`, `processing`, `completed`, `failed` |
| `chunk_count` | `int4` | NULL | `0` | Number of chunks created |
| `last_vectorized_at` | `timestamp` | NULL | — | |
| `created_at` | `timestamp` | NULL | `now()` | |
| `updated_at` | `timestamp` | NULL | `now()` | |
| `summary` | `text` | NULL | — | AI-generated summary (added migration 004) |
| `summary_generated_at` | `timestamp` | NULL | — | |
| `extractive_keywords` | `text[]` | NULL | — | GIN-indexed keyword array (added migration 004) |
| `topic_tags` | `text[]` | NULL | — | Topic categorization tags |

**Constraints:**
- `resources_pkey` — PRIMARY KEY (`id`)

**Indexes:**
```sql
CREATE UNIQUE INDEX resources_pkey ON resources USING btree (id)
CREATE INDEX idx_resources_keywords ON resources USING gin (extractive_keywords)   -- array search
CREATE INDEX idx_resources_session ON resources USING btree (session_id)
CREATE INDEX idx_resources_session_id ON resources USING btree (session_id)        -- duplicate of above
CREATE INDEX idx_resources_session_vectorized ON resources USING btree (session_id, is_vectorized)
CREATE INDEX idx_resources_teacher ON resources USING btree (teacher_id)
CREATE INDEX idx_resources_type ON resources USING btree (resource_type)
CREATE INDEX idx_resources_vectorized ON resources USING btree (is_vectorized)
```

---

### `resource_chunks`

> Text chunks extracted from resources for the RAG embedding pipeline.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | **PK** |
| `resource_id` | `uuid` | NOT NULL | — | FK → `resources.id` |
| `chunk_index` | `int4` | NOT NULL | — | Order within resource |
| `chunk_text` | `text` | NOT NULL | — | ~400 token text window |
| `token_count` | `int4` | NULL | — | |
| `page_number` | `int4` | NULL | — | Source page in PDF |
| `section_title` | `varchar` | NULL | — | Added migration 008 |
| `pinecone_vector_id` | `varchar` | UNIQUE, NOT NULL | — | ID used in Pinecone vector store |
| `created_at` | `timestamp` | NULL | `now()` | |

**Constraints:**
- `resource_chunks_pkey` — PRIMARY KEY (`id`)
- `resource_chunks_pinecone_vector_id_key` — UNIQUE (`pinecone_vector_id`)
- `resource_chunks_resource_id_chunk_index_key` — UNIQUE (`resource_id`, `chunk_index`)
- FK `resource_id` → `resources.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX resource_chunks_pkey ON resource_chunks USING btree (id)
CREATE UNIQUE INDEX resource_chunks_pinecone_vector_id_key ON resource_chunks USING btree (pinecone_vector_id)
CREATE UNIQUE INDEX resource_chunks_resource_id_chunk_index_key ON resource_chunks USING btree (resource_id, chunk_index)
CREATE INDEX idx_chunks_pinecone ON resource_chunks USING btree (pinecone_vector_id)
CREATE INDEX idx_chunks_resource ON resource_chunks USING btree (resource_id)
```

---

### `resource_access_logs`

> Tracks every student view, download, and AI search interaction with resources.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | **PK** |
| `resource_id` | `uuid` | NOT NULL | — | FK → `resources.id` |
| `student_id` | `varchar` | NOT NULL | — | FK → `users.id` |
| `action` | `varchar` | NOT NULL | — | `'view'`, `'download'`, `'search'` |
| `accessed_at` | `timestamp` | NULL | `now()` | |
| `search_query` | `text` | NULL | — | If action is `'search'` |
| `similarity_score` | `float8` | NULL | — | Cosine similarity from vector search |

**Constraints:**
- `resource_access_logs_pkey` — PRIMARY KEY (`id`)
- `resource_access_logs_resource_id_fkey` — FK `resource_id` → `resources.id`
- `fk_access_log_student` — FK `student_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX resource_access_logs_pkey ON resource_access_logs USING btree (id)
CREATE INDEX idx_access_logs_action ON resource_access_logs USING btree (action)
CREATE INDEX idx_access_logs_resource ON resource_access_logs USING btree (resource_id)
CREATE INDEX idx_access_logs_student ON resource_access_logs USING btree (student_id)
```

---

### `uploaded_resources`

> Stores metadata for files uploaded via Cloudinary by teachers (separate from Supabase Storage `resources`).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `varchar` | NOT NULL | — | FK → `sessions.session_id` (the 6-char code) |
| `teacher_id` | `varchar` | NOT NULL | — | FK → `users.id` |
| `title` | `varchar` | NOT NULL | — | |
| `description` | `text` | NULL | — | |
| `resource_type` | `varchar` | NOT NULL | — | `pdf`, `ppt`, `doc`, `url`, `image`, `excel`, `zip`, `other` |
| `file_url` | `text` | NOT NULL | — | Cloudinary URL or external URL |
| `file_name` | `varchar` | NULL | — | |
| `file_size` | `int4` | NULL | — | Bytes; NULL for URL-type resources |
| `mime_type` | `varchar` | NULL | — | |
| `is_downloadable` | `boolean` | NULL | `true` | |
| `view_count` | `int4` | NULL | `0` | |
| `download_count` | `int4` | NULL | `0` | |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | Auto-updated by trigger |

**Constraints:**
- `uploaded_resources_pkey` — PRIMARY KEY (`id`)
- `fk_uploaded_session` — FK `session_id` → `sessions.session_id`
- `fk_uploaded_teacher` — FK `teacher_id` → `users.id`

**Triggers:**
- `trigger_update_uploaded_resources_updated_at` — BEFORE UPDATE, sets `updated_at = CURRENT_TIMESTAMP`

**Indexes:**
```sql
CREATE UNIQUE INDEX uploaded_resources_pkey ON uploaded_resources USING btree (id)
CREATE INDEX idx_uploaded_resources_session ON uploaded_resources USING btree (session_id)
CREATE INDEX idx_uploaded_resources_teacher ON uploaded_resources USING btree (teacher_id)
CREATE INDEX idx_uploaded_resources_type ON uploaded_resources USING btree (resource_type)
```

---

### `query_classifications`

> Caches AI query classifications to avoid re-running intent detection on identical queries.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | **PK** |
| `session_id` | `varchar` | NOT NULL | — | |
| `query_text` | `text` | NOT NULL | — | Original query string |
| `query_hash` | `varchar(64)` | NOT NULL | — | SHA-256 of query_text |
| `query_type` | `varchar` | NOT NULL | — | Classified intent type |
| `extracted_entities` | `jsonb` | NULL | — | Entities extracted during classification |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `query_classifications_pkey` — PRIMARY KEY (`id`)
- `query_classifications_query_hash_session_id_key` — UNIQUE (`query_hash`, `session_id`)

**Indexes:**
```sql
CREATE UNIQUE INDEX query_classifications_pkey ON query_classifications USING btree (id)
CREATE UNIQUE INDEX query_classifications_query_hash_session_id_key ON query_classifications USING btree (query_hash, session_id)
CREATE INDEX idx_query_classifications_hash ON query_classifications USING btree (query_hash)
CREATE INDEX idx_query_classifications_session ON query_classifications USING btree (session_id)
```

---

## 4. Transcription

### `transcription_sessions`

> Tracks audio recording sessions with timer intervals for webhook posting to the GPU server.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `varchar(255)` | NOT NULL | — | The class session ID (allows duplicates — multiple recordings per session) |
| `segment_interval` | `int4` | NOT NULL | — | Minutes between webhook posts |
| `start_time` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `end_time` | `timestamp` | NULL | — | |
| `is_paused` | `boolean` | NULL | `false` | |
| `pdf_uploaded` | `boolean` | NULL | `false` | |
| `pdf_filename` | `varchar(500)` | NULL | — | |
| `status` | `varchar(50)` | NULL | `'active'` | `'active'`, `'paused'`, `'stopped'` |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | Auto-updated by trigger |

**Constraints:**
- `transcription_sessions_pkey` — PRIMARY KEY (`id`)

**Triggers:**
- `update_transcription_sessions_updated_at` — BEFORE UPDATE, calls `update_updated_at_column()`

**Indexes:**
```sql
CREATE UNIQUE INDEX transcription_sessions_pkey ON transcription_sessions USING btree (id)
CREATE INDEX idx_sessions_status ON transcription_sessions USING btree (status)
```

---

### `transcripts`

> Individual transcript segments from the GPU transcription server.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_db_id` | `int4` | NOT NULL | — | FK → `transcription_sessions.id` |
| `segment_text` | `text` | NOT NULL | — | Transcribed text for this segment |
| `timestamp` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `sent_to_webhook` | `boolean` | NULL | `false` | True if included in a webhook post |
| `detected_language` | `varchar(10)` | NULL | — | e.g., `'en'`, `'ta'` |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `transcripts_pkey` — PRIMARY KEY (`id`)
- `transcripts_session_db_id_fkey` — FK `session_db_id` → `transcription_sessions.id` ON DELETE CASCADE

**Indexes:**
```sql
CREATE UNIQUE INDEX transcripts_pkey ON transcripts USING btree (id)
CREATE INDEX idx_transcripts_sent ON transcripts USING btree (sent_to_webhook)
CREATE INDEX idx_transcripts_session ON transcripts USING btree (session_db_id)
CREATE INDEX idx_transcripts_session_sent ON transcripts USING btree (session_db_id, sent_to_webhook)
```

---

## 5. Gamification

### `student_points`

> Per-poll and per-session point awards.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE SET NULL |
| `poll_id` | `int4` | NULL | — | FK → `polls.id` ON DELETE SET NULL |
| `points` | `int4` | NOT NULL | `0` | |
| `point_type` | `varchar` | NOT NULL | — | `'correct_answer'`, `'fast_response'`, `'streak_bonus'`, `'first_responder'`, `'perfect_session'`, etc. |
| `earned_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `student_points_pkey` — PRIMARY KEY (`id`)
- `unique_poll_points` — UNIQUE (`student_id`, `poll_id`, `point_type`) — prevents duplicate poll-level awards
- `unique_session_level_points` — UNIQUE (`student_id`, `session_id`, `point_type`) WHERE `poll_id IS NULL` — prevents duplicate session-level awards (partial index, added migration 009)

**Indexes:**
```sql
CREATE UNIQUE INDEX student_points_pkey ON student_points USING btree (id)
CREATE UNIQUE INDEX unique_poll_points ON student_points USING btree (student_id, poll_id, point_type)
CREATE UNIQUE INDEX unique_session_level_points ON student_points USING btree (student_id, session_id, point_type) WHERE (poll_id IS NULL)
CREATE INDEX idx_student_points_session ON student_points USING btree (session_id)
CREATE INDEX idx_student_points_student ON student_points USING btree (student_id)
```

---

### `student_badges`

> Achievement badges awarded to students.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | |
| `badge_type` | `varchar` | NOT NULL | — | `'first_responder'`, `'perfect_score'`, `'streak_3'`, `'streak_5'`, `'streak_10'`, `'participation_star'`, `'accuracy_master'` |
| `badge_name` | `varchar` | NOT NULL | — | Display name |
| `badge_description` | `text` | NULL | — | |
| `earned_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE SET NULL |
| `badge_tier` | `varchar` | NULL | `'bronze'` | `'bronze'`, `'silver'`, `'gold'` (added migration 009) |
| `badge_category` | `varchar` | NULL | — | Added migration 009 |

**Constraints:**
- `student_badges_pkey` — PRIMARY KEY (`id`)
- FK `session_id` → `sessions.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX student_badges_pkey ON student_badges USING btree (id)
CREATE INDEX idx_student_badges_student ON student_badges USING btree (student_id)
```

---

### `student_streaks` (Global — Legacy)

> Global cross-session streaks. Superseded by `session_streaks` for scoring, but retained.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | UNIQUE, NOT NULL | — | One row per student |
| `current_streak` | `int4` | NULL | `0` | Consecutive correct answers |
| `max_streak` | `int4` | NULL | `0` | All-time maximum streak |
| `last_correct_at` | `timestamp` | NULL | — | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `student_streaks_pkey` — PRIMARY KEY (`id`)
- `student_streaks_student_id_key` — UNIQUE (`student_id`)

**Indexes:**
```sql
CREATE UNIQUE INDEX student_streaks_pkey ON student_streaks USING btree (id)
CREATE UNIQUE INDEX student_streaks_student_id_key ON student_streaks USING btree (student_id)
CREATE INDEX idx_student_streaks_student ON student_streaks USING btree (student_id)
```

---

### `student_xp`

> XP (experience points) for persistent progression across sessions (added migration 009).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | |
| `xp_amount` | `int4` | NOT NULL | — | |
| `xp_type` | `varchar` | NOT NULL | — | `'session_participation'`, `'session_top3'`, `'perfect_session'`, `'weekly_consistency'`, `'resource_engagement'`, `'knowledge_card'` |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE SET NULL |
| `earned_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `student_xp_pkey` — PRIMARY KEY (`id`)
- `unique_session_xp` — UNIQUE (`student_id`, `session_id`, `xp_type`)

**Indexes:**
```sql
CREATE UNIQUE INDEX student_xp_pkey ON student_xp USING btree (id)
CREATE UNIQUE INDEX unique_session_xp ON student_xp USING btree (student_id, session_id, xp_type)
CREATE INDEX idx_student_xp_session ON student_xp USING btree (session_id)
CREATE INDEX idx_student_xp_student ON student_xp USING btree (student_id)
```

---

### `session_streaks`

> Session-scoped streaks replacing global streaks for scoring (added migration 009).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE CASCADE |
| `current_streak` | `int4` | NULL | `0` | |
| `max_streak` | `int4` | NULL | `0` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `session_streaks_pkey` — PRIMARY KEY (`id`)
- `unique_session_streak` — UNIQUE (`student_id`, `session_id`)

**Indexes:**
```sql
CREATE UNIQUE INDEX session_streaks_pkey ON session_streaks USING btree (id)
CREATE UNIQUE INDEX unique_session_streak ON session_streaks USING btree (student_id, session_id)
CREATE INDEX idx_session_streaks_student_session ON session_streaks USING btree (student_id, session_id)
```

---

### `session_summaries`

> Post-session report card for each student (added migration 009).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE CASCADE |
| `rank` | `int4` | NULL | — | Final leaderboard rank |
| `total_participants` | `int4` | NULL | — | |
| `accuracy` | `numeric(5,2)` | NULL | — | Percentage |
| `points_earned` | `int4` | NULL | `0` | |
| `xp_gained` | `int4` | NULL | `0` | |
| `badges_earned` | `text[]` | NULL | `'{}'` | Array of badge type strings |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `session_summaries_pkey` — PRIMARY KEY (`id`)
- `unique_session_summary` — UNIQUE (`student_id`, `session_id`)

**Indexes:**
```sql
CREATE UNIQUE INDEX session_summaries_pkey ON session_summaries USING btree (id)
CREATE UNIQUE INDEX unique_session_summary ON session_summaries USING btree (student_id, session_id)
CREATE INDEX idx_session_summaries_session ON session_summaries USING btree (session_id)
CREATE INDEX idx_session_summaries_student ON session_summaries USING btree (student_id)
```

---

## 6. Attendance

### `session_attendance_windows`

> Persists live attendance windows so they survive server restarts (added migration 007).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NOT NULL | — | FK → `sessions.id` ON DELETE CASCADE |
| `duration_seconds` | `int4` | NOT NULL | `60` | How long window stays open |
| `opened_by` | `varchar` | NOT NULL | — | FK → `users.id` (the teacher) |
| `opened_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `closed_at` | `timestamp` | NULL | — | |
| `is_active` | `boolean` | NOT NULL | `true` | |

**Constraints:**
- `session_attendance_windows_pkey` — PRIMARY KEY (`id`)
- `idx_one_active_window_per_session` — UNIQUE (`session_id`) WHERE `is_active = TRUE` — enforces max 1 open window per session
- FK `session_id` → `sessions.id`
- FK `opened_by` → `users.id`

> **Note:** `opened_by` has no covering index — flagged by performance advisor.

**Indexes:**
```sql
CREATE UNIQUE INDEX session_attendance_windows_pkey ON session_attendance_windows USING btree (id)
CREATE UNIQUE INDEX idx_one_active_window_per_session ON session_attendance_windows USING btree (session_id) WHERE (is_active = true)
CREATE INDEX idx_attendance_window_session ON session_attendance_windows USING btree (session_id, is_active)
```

---

## 7. Community

### `community_tickets`

> Discussion board tickets — either session-scoped OR subject-scoped, never both (added migration 007).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NULL | — | FK → `sessions.id`. NULL for global tickets |
| `subject` | `varchar(100)` | NULL | — | E.g., `'Math'`. NULL for session-scoped tickets |
| `author_id` | `varchar` | NOT NULL | — | FK → `users.id` |
| `title` | `varchar(255)` | NOT NULL | — | |
| `content` | `text` | NOT NULL | — | |
| `status` | `varchar` | NOT NULL | `'open'` | CHECK: `'open'` or `'resolved'` |
| `upvote_count` | `int4` | NOT NULL | `0` | Denormalized count (kept in sync with community_upvotes) |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `community_tickets_pkey` — PRIMARY KEY (`id`)
- `chk_ticket_scope` — CHECK: `(session_id IS NOT NULL AND subject IS NULL) OR (session_id IS NULL AND subject IS NOT NULL)`
- FK `session_id` → `sessions.id`
- FK `author_id` → `users.id`
- CHECK: `status IN ('open', 'resolved')`

**Indexes:**
```sql
CREATE UNIQUE INDEX community_tickets_pkey ON community_tickets USING btree (id)
CREATE INDEX idx_tickets_author_id ON community_tickets USING btree (author_id)
CREATE INDEX idx_tickets_session_id ON community_tickets USING btree (session_id)
CREATE INDEX idx_tickets_status ON community_tickets USING btree (status)
CREATE INDEX idx_tickets_subject ON community_tickets USING btree (subject) WHERE (session_id IS NULL)
CREATE INDEX idx_tickets_upvotes ON community_tickets USING btree (upvote_count DESC)
```

---

### `community_replies`

> Replies to community tickets.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `ticket_id` | `int4` | NOT NULL | — | FK → `community_tickets.id` ON DELETE CASCADE |
| `author_id` | `varchar` | NOT NULL | — | FK → `users.id` ON DELETE CASCADE |
| `content` | `text` | NOT NULL | — | |
| `is_solution` | `boolean` | NOT NULL | `false` | Teacher marked as accepted answer |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `community_replies_pkey` — PRIMARY KEY (`id`)
- FK `ticket_id` → `community_tickets.id`
- FK `author_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX community_replies_pkey ON community_replies USING btree (id)
CREATE INDEX idx_replies_author_id ON community_replies USING btree (author_id)
CREATE INDEX idx_replies_ticket_id ON community_replies USING btree (ticket_id)
```

---

### `community_upvotes`

> Upvotes on community tickets — one per user per ticket enforced by composite PK.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | Surrogate PK (note: original design used composite PK `(ticket_id, user_id)`) |
| `ticket_id` | `int4` | NOT NULL | — | FK → `community_tickets.id` ON DELETE CASCADE |
| `user_id` | `varchar` | NOT NULL | — | FK → `users.id` ON DELETE CASCADE |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `community_upvotes_pkey` — PRIMARY KEY (`id`)
- `community_upvotes_ticket_id_user_id_key` — UNIQUE (`ticket_id`, `user_id`) — prevents duplicate upvotes

**Indexes:**
```sql
CREATE UNIQUE INDEX community_upvotes_pkey ON community_upvotes USING btree (id)
CREATE UNIQUE INDEX community_upvotes_ticket_id_user_id_key ON community_upvotes USING btree (ticket_id, user_id)
CREATE INDEX idx_upvotes_ticket_id ON community_upvotes USING btree (ticket_id)
CREATE INDEX idx_upvotes_user_id ON community_upvotes USING btree (user_id)
```

---

## 8. AI Study Assistant

### `ai_conversations`

> AI chat conversation threads per student per session — replaces localStorage chat history (added migration 008).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | **PK** |
| `session_id` | `varchar` | NOT NULL | — | 6-char session code |
| `student_id` | `varchar` | NOT NULL | — | FK → `users.id` ON DELETE CASCADE |
| `title` | `varchar` | NULL | — | Auto-generated from first message |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `is_active` | `boolean` | NULL | `true` | |

**Constraints:**
- `ai_conversations_pkey` — PRIMARY KEY (`id`)
- FK `student_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX ai_conversations_pkey ON ai_conversations USING btree (id)
CREATE INDEX idx_ai_conversations_session ON ai_conversations USING btree (session_id, created_at DESC)
CREATE INDEX idx_ai_conversations_student_session ON ai_conversations USING btree (student_id, session_id)
```

---

### `ai_messages`

> Individual messages within AI conversations.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | **PK** |
| `conversation_id` | `uuid` | NOT NULL | — | FK → `ai_conversations.id` ON DELETE CASCADE |
| `role` | `varchar` | NOT NULL | — | CHECK: `'user'` or `'assistant'` |
| `content` | `text` | NOT NULL | — | |
| `message_type` | `varchar` | NULL | `'text'` | |
| `metadata` | `jsonb` | NULL | — | Sources, citations, etc. |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `ai_messages_pkey` — PRIMARY KEY (`id`)
- FK `conversation_id` → `ai_conversations.id`
- CHECK: `role IN ('user', 'assistant')`

**Indexes:**
```sql
CREATE UNIQUE INDEX ai_messages_pkey ON ai_messages USING btree (id)
CREATE INDEX idx_ai_messages_conversation ON ai_messages USING btree (conversation_id, created_at)
```

---

### `ai_doubts`

> Student doubts flagged from AI messages for teacher review.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | **PK** |
| `message_id` | `uuid` | NOT NULL | — | FK → `ai_messages.id` ON DELETE CASCADE |
| `session_id` | `varchar` | NOT NULL | — | |
| `student_id` | `varchar` | NOT NULL | — | FK → `users.id` ON DELETE CASCADE |
| `doubt_text` | `text` | NOT NULL | — | Student's stated confusion |
| `status` | `varchar` | NULL | `'unresolved'` | CHECK: `'unresolved'` or `'resolved'` |
| `resolved_by` | `varchar` | NULL | — | FK → `users.id` (teacher) |
| `resolved_at` | `timestamp` | NULL | — | |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `ai_doubts_pkey` — PRIMARY KEY (`id`)
- FK `message_id` → `ai_messages.id`
- FK `student_id` → `users.id`
- FK `resolved_by` → `users.id`
- CHECK: `status IN ('unresolved', 'resolved')`

> **Performance issue:** `message_id` and `resolved_by` FKs have no covering index — flagged by advisor.

**Indexes:**
```sql
CREATE UNIQUE INDEX ai_doubts_pkey ON ai_doubts USING btree (id)
CREATE INDEX idx_ai_doubts_session_status ON ai_doubts USING btree (session_id, status)
CREATE INDEX idx_ai_doubts_student ON ai_doubts USING btree (student_id, created_at DESC)
```

---

### `ai_study_analytics`

> Aggregated study behaviour per student per session.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | **PK** |
| `student_id` | `varchar` | NOT NULL | — | FK → `users.id` ON DELETE CASCADE |
| `session_id` | `varchar` | NOT NULL | — | 6-char session code |
| `total_queries` | `int4` | NULL | `0` | |
| `topics_explored` | `text[]` | NULL | — | |
| `resources_referenced` | `uuid[]` | NULL | — | |
| `last_query_at` | `timestamp` | NULL | — | |
| `study_duration_minutes` | `int4` | NULL | `0` | |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `ai_study_analytics_pkey` — PRIMARY KEY (`id`)
- `ai_study_analytics_student_id_session_id_key` — UNIQUE (`student_id`, `session_id`)
- FK `student_id` → `users.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX ai_study_analytics_pkey ON ai_study_analytics USING btree (id)
CREATE UNIQUE INDEX ai_study_analytics_student_id_session_id_key ON ai_study_analytics USING btree (student_id, session_id)
CREATE INDEX idx_ai_study_analytics_student ON ai_study_analytics USING btree (student_id)
```

---

## 9. Session Notes

### `session_notes`

> Auto-generated session notes from transcript + resources.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NOT NULL | — | FK → `sessions.id` |
| `status` | `varchar` | NOT NULL | `'generating'` | `'generating'`, `'completed'`, `'failed'` |
| `notes_url` | `text` | NULL | — | URL to the generated notes document |
| `storage_path` | `text` | NULL | — | Supabase Storage path |
| `transcript_length` | `int4` | NULL | — | Characters |
| `resource_count` | `int4` | NULL | — | Resources used |
| `generation_started_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `generation_completed_at` | `timestamp` | NULL | — | |
| `error_message` | `text` | NULL | — | If status = `'failed'` |

**Constraints:**
- `session_notes_pkey` — PRIMARY KEY (`id`)
- FK `session_id` → `sessions.id`

**Indexes:**
```sql
CREATE UNIQUE INDEX session_notes_pkey ON session_notes USING btree (id)
CREATE INDEX idx_session_notes_session_id ON session_notes USING btree (session_id)
```

---

## 10. Knowledge Cards

### `knowledge_card_rounds`

> A knowledge card activity round within a session (added migration 010).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `session_id` | `int4` | NULL | — | FK → `sessions.id` ON DELETE CASCADE |
| `teacher_id` | `varchar` | NOT NULL | — | |
| `status` | `varchar` | NULL | `'draft'` | CHECK: `'draft'`, `'distributed'`, `'active'`, `'completed'` |
| `total_pairs` | `int4` | NULL | `0` | |
| `topic` | `varchar` | NULL | — | Subject of the cards |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `knowledge_card_rounds_pkey` — PRIMARY KEY (`id`)
- FK `session_id` → `sessions.id`
- CHECK: `status IN ('draft','distributed','active','completed')`

**Indexes:**
```sql
CREATE UNIQUE INDEX knowledge_card_rounds_pkey ON knowledge_card_rounds USING btree (id)
CREATE INDEX idx_kc_rounds_session ON knowledge_card_rounds USING btree (session_id)
```

---

### `knowledge_card_pairs`

> Individual Q&A card pairs within a round.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `round_id` | `int4` | NULL | — | FK → `knowledge_card_rounds.id` ON DELETE CASCADE |
| `question_text` | `text` | NOT NULL | — | |
| `answer_text` | `text` | NOT NULL | — | |
| `difficulty` | `int4` | NULL | `1` | CHECK: 1–3 |
| `status` | `varchar` | NULL | `'pending'` | CHECK: `'pending'`, `'active'`, `'revealed'`, `'completed'`, `'skipped'` |
| `question_holder_id` | `varchar` | NULL | — | Student assigned the question card |
| `answer_holder_id` | `varchar` | NULL | — | Student assigned the answer card |
| `order_index` | `int4` | NULL | `0` | Display order |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `knowledge_card_pairs_pkey` — PRIMARY KEY (`id`)
- FK `round_id` → `knowledge_card_rounds.id`
- CHECK: `difficulty BETWEEN 1 AND 3`
- CHECK: `status IN ('pending','active','revealed','completed','skipped')`

**Indexes:**
```sql
CREATE UNIQUE INDEX knowledge_card_pairs_pkey ON knowledge_card_pairs USING btree (id)
CREATE INDEX idx_kc_pairs_answer_holder ON knowledge_card_pairs USING btree (answer_holder_id)
CREATE INDEX idx_kc_pairs_question_holder ON knowledge_card_pairs USING btree (question_holder_id)
CREATE INDEX idx_kc_pairs_round ON knowledge_card_pairs USING btree (round_id)
```

---

### `knowledge_card_votes`

> Student votes (thumbs up/down) on knowledge card answers.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `int4` | NOT NULL | `nextval(...)` | **PK** |
| `pair_id` | `int4` | NULL | — | FK → `knowledge_card_pairs.id` ON DELETE CASCADE |
| `student_id` | `varchar` | NOT NULL | — | |
| `vote` | `varchar` | NOT NULL | — | CHECK: `'up'` or `'down'` |
| `created_at` | `timestamp` | NULL | `CURRENT_TIMESTAMP` | |

**Constraints:**
- `knowledge_card_votes_pkey` — PRIMARY KEY (`id`)
- `unique_kc_vote` — UNIQUE (`pair_id`, `student_id`) — one vote per student per pair

**Indexes:**
```sql
CREATE UNIQUE INDEX knowledge_card_votes_pkey ON knowledge_card_votes USING btree (id)
CREATE UNIQUE INDEX unique_kc_vote ON knowledge_card_votes USING btree (pair_id, student_id)
CREATE INDEX idx_kc_votes_pair ON knowledge_card_votes USING btree (pair_id)
```

---

## 11. All Indexes Summary

| Table | Index Name | Type | Unique | Partial | Columns |
|---|---|---|---|---|---|
| `ai_conversations` | `ai_conversations_pkey` | btree | YES | — | `id` |
| `ai_conversations` | `idx_ai_conversations_session` | btree | — | — | `session_id, created_at DESC` |
| `ai_conversations` | `idx_ai_conversations_student_session` | btree | — | — | `student_id, session_id` |
| `ai_doubts` | `ai_doubts_pkey` | btree | YES | — | `id` |
| `ai_doubts` | `idx_ai_doubts_session_status` | btree | — | — | `session_id, status` |
| `ai_doubts` | `idx_ai_doubts_student` | btree | — | — | `student_id, created_at DESC` |
| `ai_messages` | `ai_messages_pkey` | btree | YES | — | `id` |
| `ai_messages` | `idx_ai_messages_conversation` | btree | — | — | `conversation_id, created_at` |
| `ai_study_analytics` | `ai_study_analytics_pkey` | btree | YES | — | `id` |
| `ai_study_analytics` | `ai_study_analytics_student_id_session_id_key` | btree | YES | — | `student_id, session_id` |
| `ai_study_analytics` | `idx_ai_study_analytics_student` | btree | — | — | `student_id` |
| `community_replies` | `community_replies_pkey` | btree | YES | — | `id` |
| `community_replies` | `idx_replies_author_id` | btree | — | — | `author_id` |
| `community_replies` | `idx_replies_ticket_id` | btree | — | — | `ticket_id` |
| `community_tickets` | `community_tickets_pkey` | btree | YES | — | `id` |
| `community_tickets` | `idx_tickets_author_id` | btree | — | — | `author_id` |
| `community_tickets` | `idx_tickets_session_id` | btree | — | — | `session_id` |
| `community_tickets` | `idx_tickets_status` | btree | — | — | `status` |
| `community_tickets` | `idx_tickets_subject` | btree | — | YES (`session_id IS NULL`) | `subject` |
| `community_tickets` | `idx_tickets_upvotes` | btree | — | — | `upvote_count DESC` |
| `community_upvotes` | `community_upvotes_pkey` | btree | YES | — | `id` |
| `community_upvotes` | `community_upvotes_ticket_id_user_id_key` | btree | YES | — | `ticket_id, user_id` |
| `community_upvotes` | `idx_upvotes_ticket_id` | btree | — | — | `ticket_id` |
| `community_upvotes` | `idx_upvotes_user_id` | btree | — | — | `user_id` |
| `generated_mcqs` | `generated_mcqs_pkey` | btree | YES | — | `id` |
| `generated_mcqs` | `idx_generated_mcqs_created_at` | btree | — | — | `created_at` |
| `generated_mcqs` | `idx_generated_mcqs_sent_to_students` | btree | — | — | `sent_to_students` |
| `generated_mcqs` | `idx_generated_mcqs_session_id` | btree | — | — | `session_id` |
| `knowledge_card_pairs` | `knowledge_card_pairs_pkey` | btree | YES | — | `id` |
| `knowledge_card_pairs` | `idx_kc_pairs_answer_holder` | btree | — | — | `answer_holder_id` |
| `knowledge_card_pairs` | `idx_kc_pairs_question_holder` | btree | — | — | `question_holder_id` |
| `knowledge_card_pairs` | `idx_kc_pairs_round` | btree | — | — | `round_id` |
| `knowledge_card_rounds` | `knowledge_card_rounds_pkey` | btree | YES | — | `id` |
| `knowledge_card_rounds` | `idx_kc_rounds_session` | btree | — | — | `session_id` |
| `knowledge_card_votes` | `knowledge_card_votes_pkey` | btree | YES | — | `id` |
| `knowledge_card_votes` | `unique_kc_vote` | btree | YES | — | `pair_id, student_id` |
| `knowledge_card_votes` | `idx_kc_votes_pair` | btree | — | — | `pair_id` |
| `poll_responses` | `poll_responses_pkey` | btree | YES | — | `id` |
| `poll_responses` | `poll_responses_poll_id_student_id_key` | btree | YES | — | `poll_id, student_id` |
| `poll_responses` | `idx_poll_responses_poll_id` | btree | — | — | `poll_id` |
| `poll_responses` | `idx_poll_responses_responded_at` | btree | — | — | `responded_at` |
| `poll_responses` | `idx_poll_responses_student` | btree | — | — | `student_id` |
| `poll_responses` | `idx_poll_responses_student_id` | btree | — | — | `student_id` (**duplicate**) |
| `polls` | `polls_pkey` | btree | YES | — | `id` |
| `polls` | `idx_polls_active_ends` | btree | — | YES (`is_active = true`) | `is_active, ends_at` |
| `polls` | `idx_polls_created_at` | btree | — | — | `created_at` |
| `polls` | `idx_polls_is_active` | btree | — | — | `is_active` |
| `polls` | `idx_polls_queue_position` | btree | — | — | `queue_position` |
| `polls` | `idx_polls_queue_status` | btree | — | — | `queue_status` |
| `polls` | `idx_polls_session_id` | btree | — | — | `session_id` |
| `query_classifications` | `query_classifications_pkey` | btree | YES | — | `id` |
| `query_classifications` | `query_classifications_query_hash_session_id_key` | btree | YES | — | `query_hash, session_id` |
| `query_classifications` | `idx_query_classifications_hash` | btree | — | — | `query_hash` |
| `query_classifications` | `idx_query_classifications_session` | btree | — | — | `session_id` |
| `resource_access_logs` | `resource_access_logs_pkey` | btree | YES | — | `id` |
| `resource_access_logs` | `idx_access_logs_action` | btree | — | — | `action` |
| `resource_access_logs` | `idx_access_logs_resource` | btree | — | — | `resource_id` |
| `resource_access_logs` | `idx_access_logs_student` | btree | — | — | `student_id` |
| `resource_chunks` | `resource_chunks_pkey` | btree | YES | — | `id` |
| `resource_chunks` | `resource_chunks_pinecone_vector_id_key` | btree | YES | — | `pinecone_vector_id` |
| `resource_chunks` | `resource_chunks_resource_id_chunk_index_key` | btree | YES | — | `resource_id, chunk_index` |
| `resource_chunks` | `idx_chunks_pinecone` | btree | — | — | `pinecone_vector_id` (**redundant** with unique above) |
| `resource_chunks` | `idx_chunks_resource` | btree | — | — | `resource_id` |
| `resources` | `resources_pkey` | btree | YES | — | `id` |
| `resources` | `idx_resources_keywords` | GIN | — | — | `extractive_keywords` (array search) |
| `resources` | `idx_resources_session` | btree | — | — | `session_id` |
| `resources` | `idx_resources_session_id` | btree | — | — | `session_id` (**duplicate**) |
| `resources` | `idx_resources_session_vectorized` | btree | — | — | `session_id, is_vectorized` |
| `resources` | `idx_resources_teacher` | btree | — | — | `teacher_id` |
| `resources` | `idx_resources_type` | btree | — | — | `resource_type` |
| `resources` | `idx_resources_vectorized` | btree | — | — | `is_vectorized` |
| `session_attendance_windows` | `session_attendance_windows_pkey` | btree | YES | — | `id` |
| `session_attendance_windows` | `idx_one_active_window_per_session` | btree | YES | YES (`is_active = true`) | `session_id` |
| `session_attendance_windows` | `idx_attendance_window_session` | btree | — | — | `session_id, is_active` |
| `session_notes` | `session_notes_pkey` | btree | YES | — | `id` |
| `session_notes` | `idx_session_notes_session_id` | btree | — | — | `session_id` |
| `session_participants` | `session_participants_pkey` | btree | YES | — | `id` |
| `session_participants` | `session_participants_session_id_student_id_key` | btree | YES | — | `session_id, student_id` |
| `session_participants` | `idx_session_participants_active` | btree | — | — | `is_active` |
| `session_participants` | `idx_session_participants_session_id` | btree | — | — | `session_id` |
| `session_participants` | `idx_session_participants_student` | btree | — | — | `student_id` |
| `session_participants` | `idx_session_participants_student_id` | btree | — | — | `student_id` (**duplicate**) |
| `session_participants` | `idx_sp_session_attendance` | btree | — | — | `session_id, attendance_status` |
| `session_streaks` | `session_streaks_pkey` | btree | YES | — | `id` |
| `session_streaks` | `unique_session_streak` | btree | YES | — | `student_id, session_id` |
| `session_streaks` | `idx_session_streaks_student_session` | btree | — | — | `student_id, session_id` (**redundant** with unique above) |
| `session_summaries` | `session_summaries_pkey` | btree | YES | — | `id` |
| `session_summaries` | `unique_session_summary` | btree | YES | — | `student_id, session_id` |
| `session_summaries` | `idx_session_summaries_session` | btree | — | — | `session_id` |
| `session_summaries` | `idx_session_summaries_student` | btree | — | — | `student_id` |
| `sessions` | `sessions_pkey` | btree | YES | — | `id` |
| `sessions` | `sessions_session_id_key` | btree | YES | — | `session_id` |
| `sessions` | `idx_sessions_is_active` | btree | — | — | `is_active` |
| `sessions` | `idx_sessions_session_id` | btree | — | — | `session_id` (**redundant** with unique above) |
| `sessions` | `idx_sessions_teacher` | btree | — | — | `teacher_id` |
| `sessions` | `idx_sessions_teacher_id` | btree | — | — | `teacher_id` (**duplicate**) |
| `student_badges` | `student_badges_pkey` | btree | YES | — | `id` |
| `student_badges` | `idx_student_badges_student` | btree | — | — | `student_id` |
| `student_points` | `student_points_pkey` | btree | YES | — | `id` |
| `student_points` | `unique_poll_points` | btree | YES | — | `student_id, poll_id, point_type` |
| `student_points` | `unique_session_level_points` | btree | YES | YES (`poll_id IS NULL`) | `student_id, session_id, point_type` |
| `student_points` | `idx_student_points_session` | btree | — | — | `session_id` |
| `student_points` | `idx_student_points_student` | btree | — | — | `student_id` |
| `student_streaks` | `student_streaks_pkey` | btree | YES | — | `id` |
| `student_streaks` | `student_streaks_student_id_key` | btree | YES | — | `student_id` |
| `student_streaks` | `idx_student_streaks_student` | btree | — | — | `student_id` (**redundant** with unique above) |
| `student_xp` | `student_xp_pkey` | btree | YES | — | `id` |
| `student_xp` | `unique_session_xp` | btree | YES | — | `student_id, session_id, xp_type` |
| `student_xp` | `idx_student_xp_session` | btree | — | — | `session_id` |
| `student_xp` | `idx_student_xp_student` | btree | — | — | `student_id` |
| `transcription_sessions` | `transcription_sessions_pkey` | btree | YES | — | `id` |
| `transcription_sessions` | `idx_sessions_status` | btree | — | — | `status` |
| `transcripts` | `transcripts_pkey` | btree | YES | — | `id` |
| `transcripts` | `idx_transcripts_sent` | btree | — | — | `sent_to_webhook` |
| `transcripts` | `idx_transcripts_session` | btree | — | — | `session_db_id` |
| `transcripts` | `idx_transcripts_session_sent` | btree | — | — | `session_db_id, sent_to_webhook` |
| `uploaded_resources` | `uploaded_resources_pkey` | btree | YES | — | `id` |
| `uploaded_resources` | `idx_uploaded_resources_session` | btree | — | — | `session_id` |
| `uploaded_resources` | `idx_uploaded_resources_teacher` | btree | — | — | `teacher_id` |
| `uploaded_resources` | `idx_uploaded_resources_type` | btree | — | — | `resource_type` |
| `users` | `users_pkey` | btree | YES | — | `id` |
| `users` | `users_email_key` | btree | YES | — | `email` |
| `users` | `idx_users_email` | btree | — | — | `email` (**redundant** with unique above) |
| `users` | `idx_users_oauth_id` | btree | — | — | `oauth_id` |
| `users` | `idx_users_register_number` | btree | — | — | `register_number` |
| `users` | `idx_users_role` | btree | — | — | `role` |

---

## 12. All Foreign Keys Summary

| Table | Column | → References | ON DELETE |
|---|---|---|---|
| `ai_conversations` | `student_id` | `users.id` | CASCADE |
| `ai_doubts` | `message_id` | `ai_messages.id` | CASCADE |
| `ai_doubts` | `resolved_by` | `users.id` | — |
| `ai_doubts` | `student_id` | `users.id` | CASCADE |
| `ai_messages` | `conversation_id` | `ai_conversations.id` | CASCADE |
| `ai_study_analytics` | `student_id` | `users.id` | CASCADE |
| `community_replies` | `author_id` | `users.id` | CASCADE |
| `community_replies` | `ticket_id` | `community_tickets.id` | CASCADE |
| `community_tickets` | `author_id` | `users.id` | CASCADE |
| `community_tickets` | `session_id` | `sessions.id` | CASCADE |
| `community_upvotes` | `ticket_id` | `community_tickets.id` | CASCADE |
| `community_upvotes` | `user_id` | `users.id` | CASCADE |
| `generated_mcqs` | `session_id` | `sessions.id` | — |
| `knowledge_card_pairs` | `round_id` | `knowledge_card_rounds.id` | CASCADE |
| `knowledge_card_rounds` | `session_id` | `sessions.id` | CASCADE |
| `knowledge_card_votes` | `pair_id` | `knowledge_card_pairs.id` | CASCADE |
| `poll_responses` | `poll_id` | `polls.id` | — |
| `poll_responses` | `student_id` | `users.id` | — |
| `polls` | `session_id` | `sessions.id` | — |
| `resource_access_logs` | `resource_id` | `resources.id` | CASCADE |
| `resource_access_logs` | `student_id` | `users.id` | — |
| `resource_chunks` | `resource_id` | `resources.id` | — |
| `session_attendance_windows` | `opened_by` | `users.id` | — |
| `session_attendance_windows` | `session_id` | `sessions.id` | CASCADE |
| `session_notes` | `session_id` | `sessions.id` | — |
| `session_participants` | `session_id` | `sessions.id` | — |
| `session_participants` | `student_id` | `users.id` | — |
| `session_streaks` | `session_id` | `sessions.id` | CASCADE |
| `session_summaries` | `session_id` | `sessions.id` | CASCADE |
| `sessions` | `teacher_id` | `users.id` | — |
| `student_badges` | `session_id` | `sessions.id` | SET NULL |
| `student_points` | `poll_id` | `polls.id` | SET NULL |
| `student_points` | `session_id` | `sessions.id` | SET NULL |
| `student_xp` | `session_id` | `sessions.id` | SET NULL |
| `transcripts` | `session_db_id` | `transcription_sessions.id` | CASCADE |
| `uploaded_resources` | `session_id` | `sessions.session_id` | CASCADE |
| `uploaded_resources` | `teacher_id` | `users.id` | CASCADE |

---

## 13. Security Advisories

> **Severity: ERROR** — All 31 tables have RLS (Row Level Security) disabled.

### Why This Exists (Context)
The app accesses Supabase via the **service role key** through Express.js + JWT auth. No direct Supabase PostgREST calls are made from the browser. This means the current app code is safe — but the database is unprotected if the Supabase REST URL is ever hit directly.

### Tables Flagged

All tables in the `public` schema have RLS disabled:

`users`, `sessions`, `session_participants`, `polls`, `poll_responses`, `generated_mcqs`, `resources`, `resource_chunks`, `resource_access_logs`, `uploaded_resources`, `query_classifications`, `transcription_sessions`, `transcripts`, `student_points`, `student_badges`, `student_streaks`, `student_xp`, `session_streaks`, `session_summaries`, `session_attendance_windows`, `community_tickets`, `community_replies`, `community_upvotes`, `ai_conversations`, `ai_messages`, `ai_doubts`, `ai_study_analytics`, `session_notes`, `knowledge_card_rounds`, `knowledge_card_pairs`, `knowledge_card_votes`

### Remediation
Since the app uses Express.js as the API layer (not direct Supabase PostgREST), the minimum fix is:
```sql
-- Block all direct PostgREST access while keeping service role access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- (Repeat for all tables)
-- No need to add policies — service role bypasses RLS by default
```

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

---

## 14. Performance Advisories

### Missing Indexes on Foreign Keys

The following FKs have **no covering index** — each one causes a full table scan on JOIN or ON DELETE:

| Table | FK Column | FK Constraint | Fix |
|---|---|---|---|
| `ai_doubts` | `message_id` | `ai_doubts_message_id_fkey` | `CREATE INDEX ON ai_doubts(message_id)` |
| `ai_doubts` | `resolved_by` | `ai_doubts_resolved_by_fkey` | `CREATE INDEX ON ai_doubts(resolved_by)` |
| `session_attendance_windows` | `opened_by` | `session_attendance_windows_opened_by_fkey` | `CREATE INDEX ON session_attendance_windows(opened_by)` |

### Duplicate/Redundant Indexes

These pairs of indexes cover identical columns — one should be dropped:

| Table | Redundant Index | Kept By | Action |
|---|---|---|---|
| `users` | `idx_users_email` | `users_email_key` | Drop `idx_users_email` |
| `sessions` | `idx_sessions_teacher_id` | `idx_sessions_teacher` | Drop one |
| `sessions` | `idx_sessions_session_id` | `sessions_session_id_key` | Drop `idx_sessions_session_id` |
| `session_participants` | `idx_session_participants_student_id` | `idx_session_participants_student` | Drop one |
| `poll_responses` | `idx_poll_responses_student_id` | `idx_poll_responses_student` | Drop one |
| `resources` | `idx_resources_session_id` | `idx_resources_session` | Drop one |
| `resource_chunks` | `idx_chunks_pinecone` | `resource_chunks_pinecone_vector_id_key` | Drop `idx_chunks_pinecone` |
| `student_streaks` | `idx_student_streaks_student` | `student_streaks_student_id_key` | Drop `idx_student_streaks_student` |
| `session_streaks` | `idx_session_streaks_student_session` | `unique_session_streak` | Drop `idx_session_streaks_student_session` |

---

## 15. Migration History

| Migration | File | What it does |
|---|---|---|
| 001 | `001_transcription_schema.sql` | Creates `transcription_sessions`, `transcripts`; trigger for `updated_at` |
| 002 | `002_uploaded_resources.sql` | Creates `uploaded_resources`, `resource_access_logs` (old int version) |
| 003 | `003_gamification_schema.sql` | Creates `student_points`, `student_badges`, `student_streaks` |
| 004 | `004_ai_enhancements.sql` | Adds `summary`, `extractive_keywords`, `topic_tags` to `resources`; creates `query_classifications` |
| 005 | `005_production_hardening.sql` | Adds `polls.ends_at`; adds production performance indexes on `poll_responses`, `sessions`, `student_points`, `resources`, `session_participants` |
| 006 | `006_performance_indexes.sql` | Enterprise-scale index audit — adds composite indexes and unique constraint on `poll_responses(poll_id, student_id)` |
| 007 | `007_attendance_community.sql` | Adds `sessions.is_live`; adds `attendance_status`/`attendance_marked_at` to `session_participants`; creates `session_attendance_windows`, `community_tickets`, `community_replies`, `community_upvotes` |
| 008 | `008_ai_study_assistant.sql` | Creates `ai_conversations`, `ai_messages`, `ai_doubts`, `ai_study_analytics`; adds `section_title` to `resource_chunks` |
| 009 | `009_gamification_revamp.sql` | Creates `student_xp`, `session_streaks`, `session_summaries`; adds `polls.difficulty`, `student_badges.badge_tier/badge_category`, `sessions.leaderboard_visible`; adds partial unique index `unique_session_level_points` |
| 010 | `010_knowledge_cards.sql` | Creates `knowledge_card_rounds`, `knowledge_card_pairs`, `knowledge_card_votes` |

---

## Database Functions & Triggers

| Function | Used By | Purpose |
|---|---|---|
| `update_updated_at_column()` | `transcription_sessions` trigger | Sets `updated_at = CURRENT_TIMESTAMP` on update |
| `update_uploaded_resources_updated_at()` | `uploaded_resources` trigger | Sets `updated_at = CURRENT_TIMESTAMP` on update |

---

*Last documented: 2026-03-26 — sourced from live Supabase MCP (project `zihzhlamocqeallvzqmb`) + `backend/migrations/001–010`*
