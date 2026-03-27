
# SAS Edu AI — System Design & Architecture Learning Resources

> **For:** Understanding the technologies used in `SCALABILITY_ISSUES.md`, `REDesign PLan.md`, and `PRODUCTION_DGX_PLAN.md`

> **Approach:** Learn WHY a problem exists before learning the tool that solves it.

> **Time commitment:** ~5 hours/week over 16 weeks

> **Last updated:** 2026-03-26

---

## How to Use This File

Every technology maps directly to a problem in your codebase:

| You'll learn | Solves this in your code | Issue ID |

|---|---|---|

| System Design fundamentals | Understand WHY all 25 issues exist | All |

| Docker + Docker Compose | Run every service in `PRODUCTION_DGX_PLAN.md` | INFRA-05 |

| Nginx | Reverse proxy, SSL, static file serving | INFRA-05 |

| PostgreSQL + PgBouncer | DB pool capped at 5, missing indexes, slow analytics | CRIT-01, HIGH-01 |

| Redis | WebSocket scaling, auth caching, distributed state | CRIT-02, CRIT-03 |

| WebSockets + Redis Pub/Sub | Cross-instance broadcast failure | CRIT-02 |

| BullMQ (Message Queue) | Blocking AI pipeline, blocking file uploads | CRIT-05, CRIT-06 |

| Qdrant (Vector DB) | Replace Pinecone with self-hosted equivalent | INFRA-01 |

| RAG Pipeline | Understand all of `sas_b/services/` | CRIT-05, CRIT-06 |

| vLLM | Run Mistral on DGX GPUs at zero API cost | PRODUCTION |

| MinIO | Replace Supabase Storage with self-hosted S3 | PRODUCTION |

---

## Learning Path — 5 Levels

```

Level 1 → System Design Fundamentals    (understand WHY things break)

Level 2 → Infrastructure Basics         (Docker, Nginx, production ops)

Level 3 → Database Layer                (PostgreSQL, Redis, Vector DBs)

Level 4 → Real-Time & Async Systems     (WebSockets, Message Queues)

Level 5 → AI Infrastructure             (RAG, Embeddings, vLLM, MinIO)

```

---

## YouTube Channels — Watch These Alongside Reading

These channels explain system design concepts visually, which makes everything else faster to understand.

| Channel | Why Watch It | Best For |

|---|---|---|

| [ByteByteGo](https://www.youtube.com/@ByteByteGo) | Alex Xu (author of System Design Interview books). Clean animated diagrams of real architectures. | System design fundamentals, distributed systems |

| [Gaurav Sen](https://www.youtube.com/@gkcs) | Former Google engineer. Deep dives into consistent hashing, load balancing, DB internals. | Advanced system design concepts |

| [Hussein Nasser](https://www.youtube.com/@hnasr) | Obsessed with databases and networking. Explains PostgreSQL, Redis, WebSockets from first principles. | **Your #1 channel** — covers almost every tech in your stack |

| [TechWorld with Nana](https://www.youtube.com/@TechWorldwithNana) | Best Docker and Kubernetes tutorials on YouTube. Beginner-friendly, production-realistic. | Docker, Docker Compose, DevOps |

| [Fireship](https://www.youtube.com/@Fireship) | 100-second concept intros. Watch for quick mental models before going deep. | Quick concept overviews |

| [Piyush Garg](https://www.youtube.com/@piyushgargdev) | Node.js, Redis, BullMQ in Hindi/English. Very practical code examples. | Node.js + Redis hands-on |

| [NetworkChuck](https://www.youtube.com/@NetworkChuck) | Nginx, Linux, Docker in entertaining format. Good for infrastructure basics. | Nginx, Linux, Docker basics |

**Recommended watch order for your situation:**

1. Fireship — watch 5-minute overviews of each technology first
2. ByteByteGo — watch the system design video for that technology
3. Hussein Nasser — watch his deep dive on the same technology
4. TechWorld with Nana — watch her hands-on Docker/Nginx tutorial

---

## Level 1 — System Design Fundamentals

> Start here. Everything else is a solution to a problem you'll learn at this level.

> Key question to answer: *Why can't you just buy a bigger server?*

### Core Concepts to Understand First

-**Horizontal vs Vertical Scaling** — why your Node.js server can't just "get bigger"

-**Stateless vs Stateful services** — why in-memory Maps (`sessionConnections`) break at scale

-**The CAP Theorem** — Consistency, Availability, Partition Tolerance (pick 2)

-**Single Point of Failure** — why your server restarting destroys live classes

-**Latency vs Throughput** — speed of one request vs total requests per second

-**Caching** — why reading from RAM is 100x faster than reading from disk

-**Message queues** — why background jobs exist (don't block the user)

-**Load balancing** — distributing traffic across multiple server instances

### Articles & Guides

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [roadmap.sh/system-design](https://roadmap.sh/system-design) | Visual roadmap | Free | **Start here on Day 1** — visual map of everything |

| [System Design Primer — GitHub](https://github.com/donnemartin/system-design-primer) | GitHub repo | Free | Industry-standard reference, 280k+ stars |

| [DesignGurus — Beginner to Advanced 2025](https://www.designgurus.io/blog/complete-system-design-roadmap-2025) | Blog | Free | Structured learning path with milestones |

| [Hello Interview — System Design](https://www.hellointerview.com/learn/system-design/deep-dives/redis) | Articles | Free | Deep dives with real examples |

| [Complete Guide to System Design 2026 — DEV](https://dev.to/fahimulhaq/complete-guide-to-system-design-oc7) | Article | Free | Comprehensive overview |

| [7 Best Free Resources — Medium](https://medium.com/@repobaby/7-best-free-resources-to-learn-system-design-in-2025-ada5e6aee6d0) | Curated list | Free | Good starting curation |

| [GeeksforGeeks — System Design Roadmap](https://www.geeksforgeeks.org/system-design/complete-roadmap-to-learn-system-design/) | Roadmap | Free | Topic-by-topic structured path |

| [learnerbits — System Design Roadmap 2025](https://learnerbits.com/system-design-roadmap-2025-from-beginner-to-expert/) | Roadmap | Free | Beginner to expert progression |

| [System Design Handbook — Best Resources](https://www.systemdesignhandbook.com/blog/best-system-design-resources/) | Resource list | Free | Curated list of top 10 resources |

### Books

| Book | Cost | Notes |

|---|---|---|

| [Designing Data-Intensive Applications — Martin Kleppmann](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) | ~$50 | **The best book on this subject**. Read Ch. 1 (reliability/scalability), Ch. 5 (replication), Ch. 6 (partitioning). |

| [System Design Interview Vol. 1 — Alex Xu](https://www.amazon.com/System-Design-Interview-insiders-Second/dp/B08CMF2CQF) | ~$35 | Very accessible. Real case studies (YouTube, Twitter, URL shortener). |

### Weekly Plan

| Week | Goal |

|---|---|

| Week 1 | Read roadmap.sh/system-design top-to-bottom. Don't go deep — just map the territory. Watch 3 ByteByteGo videos on topics you don't know. |

| Week 2 | Read System Design Primer on GitHub. For each concept, open `sas_b/server.js` and find where that concept lives (or is missing). |

---

## Level 2 — Infrastructure Basics

### 2A — Docker & Docker Compose

> Docker = packaging your app so it runs identically everywhere.

> Docker Compose = running multiple services (Node.js + PostgreSQL + Redis) together in one command.

> **This is the foundation of `PRODUCTION_DGX_PLAN.md`.**

#### Why it matters for your project

Every service in the DGX production plan runs in a Docker container — PostgreSQL, Redis, Qdrant, vLLM, MinIO, Nginx, and Node.js itself. Without Docker knowledge you cannot deploy, update, debug, or maintain production.

#### Core Concepts to Understand

-**Container vs Virtual Machine** — containers share the OS kernel (lightweight); VMs have their own OS (heavy)

-**Image vs Container** — image is the recipe, container is the running dish

-**Volumes** — where persistent data lives (survives `docker restart`)

-**Networks** — how `sas_b` container talks to `postgres` container by name

-**Environment variables** — how secrets get into containers (`env_file`, `.env`)

-**`restart: unless-stopped`** — keeps containers alive after server reboots

-**Health checks** — lets Docker know a container is actually ready, not just started

-**Resource limits** — `mem_limit`, `cpus` prevent one container starving others

#### Beginner Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [docker-curriculum.com](https://docker-curriculum.com/) | Interactive tutorial | Free | **Best beginner starting point** |

| [Official Docker Compose Quickstart](https://docs.docker.com/compose/gettingstarted/) | Official docs | Free | Hands-on from Docker themselves |

| [Official Docker Compose Docs](https://docs.docker.com/compose/) | Reference | Free | Full reference documentation |

| [Docker for Developers — Medium](https://medium.com/@harshj-1703/docker-for-developers-a-complete-beginner-to-intermediate-guide-in-one-blog-2a8b8f12b52b) | Blog | Free | Beginner to intermediate in one read |

| [BetterStack — Docker Compose Getting Started](https://betterstack.com/community/guides/scaling-docker/docker-compose-getting-started/) | Guide | Free | Clear, modern guide |

| [DataCamp — Docker Compose Guide](https://www.datacamp.com/tutorial/docker-compose-guide) | Tutorial | Free | Structured with exercises |

#### Production Docker Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Official Docker Compose in Production](https://docs.docker.com/compose/how-tos/production/) | Official | Free | **Read this after the basics** |

| [Nick Janetakis — Production Ready Docker Compose](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose) | Blog | Free | Real production patterns |

| [Nick Janetakis — Why I Use Compose in Production](https://nickjanetakis.com/blog/why-i-like-using-docker-compose-in-production) | Blog | Free | Practical production justification |

| [DEV.to — Docker Compose Advanced Techniques](https://dev.to/rajeshgheware/docker-compose-advanced-techniques-a-comprehensive-guide-to-production-deployments-1goi) | Article | Free | Health checks, secrets, resource limits |

| [Dokploy — Deploy Apps with Docker Compose 2025](https://dokploy.com/blog/how-to-deploy-apps-with-docker-compose-in-2025) | Guide | Free | Current best practices |

| [42 Docker Production Best Practices 2025](https://docs.benchhub.co/docs/tutorials/docker/docker-best-practices-2025) | Checklist | Free | Comprehensive production checklist |

| [Release — 6 Docker Compose Best Practices](https://release.com/blog/6-docker-compose-best-practices-for-dev-and-prod) | Article | Free | Dev vs prod config patterns |

#### What to practice

```bash

# After learning, try running your own stack:

dockercomposeuppostgresredis           # Start DB and cache

dockercomposelogs-fsas_b              # Watch live logs

dockercomposeexecpostgrespsql-Usaseduai   # Connect to DB

dockercomposeps                          # See status of all containers

dockercomposedown-v                     # Stop and remove volumes

dockerstats                               # See CPU/RAM per container

```

---

### 2B — Nginx (Reverse Proxy + SSL)

> Nginx is the front door of your entire production system. Every request — API, WebSocket, React page, uploaded file — passes through Nginx first.

#### Why it matters for your project

In `PRODUCTION_DGX_PLAN.md`, Nginx handles: SSL termination, serving the built React app as static files, routing `/api/` to Node.js, routing `/ws` to WebSocket with the `Upgrade` header, and proxying `/files/` to MinIO storage.

#### Core Concepts to Understand

-**Reverse proxy** — receives requests from the internet, forwards to internal services (Node.js, MinIO)

-**SSL termination** — HTTPS decrypted at Nginx; plain HTTP between Nginx and your services

-**Location blocks** — `location /api/ { proxy_pass http://nodejs; }` — routing rules

-**Upstream** — `upstream nodejs { server sas_b:3001; }` — the backend server group

-**WebSocket proxying** — requires `Upgrade $http_upgrade` and `Connection "upgrade"` headers

-**Static file serving** — serving the React build directly without touching Node.js

-**Gzip compression** — compress responses before sending (reduces bandwidth)

-**`proxy_read_timeout`** — must be high for AI streaming responses (120s+)

#### Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Official Nginx Reverse Proxy Docs](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) | Official | Free | **Start here** |

| [Official Nginx Load Balancing Docs](https://nginx.org/en/docs/http/load_balancing.html) | Official | Free | Core load balancing methods |

| [phoenixNAP — Deploy Nginx on Docker](https://phoenixnap.com/kb/docker-nginx-reverse-proxy) | Tutorial | Free | Docker + Nginx step-by-step |

| [CTO2B — Docker Nginx Tutorial](https://cto2b.io/blog/docker-nginx-reverse-proxy-tutorial/) | Tutorial | Free | Clear, practical guide |

| [FreeCodeCamp — Nginx + Docker + Let&#39;s Encrypt](https://www.freecodecamp.org/news/docker-nginx-letsencrypt-easy-secure-reverse-proxy-40165ba3aee2/) | Tutorial | Free | Full HTTPS setup |

| [Medium — Nginx + SSL + Docker + Certbot](https://medium.com/@ni8hin/title-setting-up-nginx-reverse-proxy-with-ssl-termination-using-docker-and-certbot-1c60bd7fc27e) | Article | Free | SSL termination with Docker |

| [AddWeb — Complete Beginner&#39;s Guide](https://medium.com/addweb-engineering/nginx-as-reverse-proxy-a-beginners-complete-guide-to-securing-and-load-balancing-your-web-df1b600ba09b) | Medium | Free | SSL + security + load balancing |

| [Leangaurav — Simplest HTTPS Setup](https://leangaurav.medium.com/simplest-https-setup-nginx-reverse-proxy-letsencrypt-ssl-certificate-aws-cloud-docker-4b74569b3c61) | Medium | Free | Let's Encrypt + Nginx + Docker |

| [TheServerSide — Docker Nginx Setup](https://www.theserverside.com/blog/Coffee-Talk-Java-News-Stories-and-Opinions/Docker-Nginx-reverse-proxy-setup-example) | Tutorial | Free | Step-by-step with examples |

---

## Level 3 — Database Layer

### 3A — PostgreSQL & Connection Pooling

> PostgreSQL is your core data store. Understanding indexes and connection pooling directly fixes `CRIT-01`, `HIGH-01`, and all 8 missing index issues.

#### Why it matters for your project

All platform data — users, sessions, polls, responses, leaderboards, gamification — lives in PostgreSQL. The difference between a 30ms query and a 30-second query is often one missing index.

#### Core Concepts to Understand

-**Indexes** — a data structure that speeds up lookups. Without one = full table scan.

-**B-tree index** — the default; works for `=`, `<`, `>`, `BETWEEN`, `ORDER BY`

-**Composite index** — `(session_id, student_id)` together is faster than two separate indexes for queries that filter on both

-**`EXPLAIN ANALYZE`** — shows you exactly how PostgreSQL executes a query. `Seq Scan` = no index. `Index Scan` = index used.

-**Connection limit** — PostgreSQL creates an OS process per connection. Too many = OOM kill.

-**PgBouncer transaction mode** — your app thinks it has 1000 connections; PgBouncer multiplexes them to 20 real DB connections

#### PostgreSQL Learning Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [PostgreSQL Tutorial](https://www.postgresqltutorial.com/) | Interactive | Free | **Start here** — covers everything from scratch |

| [Mastering PostgreSQL](https://masteringpostgres.com/) | Course + book | Paid | Best deep-dive course on PostgreSQL internals |

| [Class Central — Free PostgreSQL Courses](https://www.classcentral.com/subject/postgres) | Aggregator | Free | 1000+ free courses indexed |

| [Coursesity — 25+ Free PostgreSQL Courses](https://coursesity.com/free-tutorials-learn/postgresql) | Aggregator | Free | Free courses from Udemy, Coursera, YouTube |

| [Coursera — PostgreSQL Courses](https://www.coursera.org/courses?query=postgresql) | Courses | Free audit | University-level courses |

| [Javarevisited — Best Free PostgreSQL Courses](https://medium.com/javarevisited/7-best-free-postgresql-courses-for-beginners-to-learn-in-2021-3bf369d73794) | Curated list | Free | Best free options ranked |

| [Udemy — PostgreSQL Courses](https://www.udemy.com/topic/postgresql/) | Video courses | ~$15 | Best paid option on sale |

| [SQL School — PostgreSQL DBA Training](https://sqlschool.com/postgresqldba-training/) | Course | Free cert | Covers indexing, performance, DBA skills |

#### PgBouncer Connection Pooling Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [ScaleGrid — PgBouncer Deep Dive](https://scalegrid.io/blog/postgresql-connection-pooling-part-2-pgbouncer/) | Article | Free | **Best technical breakdown** |

| [Percona — PgBouncer for Enterprise](https://www.percona.com/blog/pgbouncer-for-postgresql-how-connection-pooling-solves-enterprise-slowdowns/) | Article | Free | Real performance numbers |

| [PgBouncer Simple Guide — Medium](https://gxara.medium.com/pgbouncer-a-simple-guide-for-postgresql-connection-pooling-34bb4ad05736) | Article | Free | Clear beginner explanation |

| [Database Connection Pooling with PgBouncer](https://mohllal.github.io/database-connection-pooling-with-pgbouncer/) | Blog | Free | Visual diagrams |

| [Microsoft Learn — Pooling Best Practices](https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-connection-pooling-best-practices) | Docs | Free | Best practices guide |

| [PgBouncer Official Docs](https://www.pgbouncer.org/usage.html) | Official | Free | Full configuration reference |

#### Hands-on exercise

Run `EXPLAIN ANALYZE` on the leaderboard query in `sas_b/routes/gamification.js`. Look for `Seq Scan` lines — those mean no index is being used. Each `Seq Scan` on a large table is a scalability time bomb.

---

### 3B — Redis

> Redis is the single biggest architectural unlock. It solves: WebSocket scaling, auth DB overload, job queuing, distributed rate limiting, and session state persistence — all in one tool.

#### Why it matters for your project

| Redis feature | Fixes this issue |

|---|---|

| Key-Value cache + TTL | `CRIT-03` — JWT auth hits DB on every request |

| Pub/Sub channels | `CRIT-02` — WebSocket can't broadcast across multiple server instances |

| Sorted Sets | Leaderboard — `ZADD`/`ZRANGE` replaces slow GROUP BY queries |

| BullMQ (built on Redis) | `CRIT-05` — 60-second blocking AI pipeline |

| Hash maps | Batch heartbeat accumulation (500 DB writes → 1) |

| Sets with TTL | `HIGH-06` — JWT revocation blacklist |

| Distributed rate limiting | Rate limits that work across multiple Node.js instances |

#### Core Concepts to Understand (in order)

1.**Key-Value basics** — `SET auth:user:123 "{...}" EX 300` — store a value, expire it in 5 min

2.**Cache-aside pattern** — check cache → on miss, hit DB → write result to cache

3.**TTL (Time-To-Live)** — keys auto-delete after N seconds

4.**Pub/Sub** — `PUBLISH session:ABC "payload"` → all subscribers receive it instantly

5.**Sorted Sets** — `ZADD leaderboard 150 "student_1"` → automatic ranking

6.**Hashes** — `HSET heartbeats "sess1:stu1" "1700000000"` → store multiple fields per key

7.**Redis Streams / BullMQ** — persistent job queue with retries, workers, and progress tracking

#### Core Learning Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Redis Official Docs](https://redis.io/docs/latest/) | Official | Free | **Start with "Data Types" section** |

| [DragonflyDB — Beginner Redis Tutorial](https://www.dragonflydb.io/guides/beginners-redis-tutorial) | Guide | Free | Best beginner starting point |

| [DragonflyDB — Mastering Redis Cache](https://www.dragonflydb.io/guides/mastering-redis-cache-from-basic-to-advanced) | Guide | Free | Caching patterns: cache-aside, write-through |

| [DEV.to — Redis for Node.js Developers](https://dev.to/saumyaaggarwal/-redis-for-developers-lightning-fast-cache-pub-sub-and-queues-in-nodejs-229h) | Article | Free | **Your stack exactly** — Node.js + Redis |

| [DEV.to — Redis Patterns in Production](https://dev.to/chengyixu/redis-patterns-for-nodejs-caching-pubsub-and-rate-limiting-in-production-1f4) | Article | Free | Cache, Pub/Sub, Rate Limiting in production |

| [Hello Interview — Redis System Design](https://www.hellointerview.com/learn/system-design/deep-dives/redis) | Deep dive | Free | Excellent system design perspective |

| [Redis — Build a Chat App with Pub/Sub](https://redis.io/tutorials/howtos/chatapp/) | Official tutorial | Free | **Hands-on Pub/Sub** — directly relevant to your WS fix |

| [Redis Pub/Sub Official Docs](https://redis.io/docs/latest/develop/pubsub/) | Official | Free | Pub/Sub command reference |

| [Medium — Redis Pub/Sub + Local Memory Cache](https://medium.com/@deghun/redis-pub-sub-local-memory-low-latency-high-consistency-caching-3740f66f0368) | Article | Free | Advanced hybrid caching pattern |

#### BullMQ (Job Queue) Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [BullMQ Official Docs](https://docs.bullmq.io/) | Official | Free | **The reference** |

| [BullMQ GitHub](https://github.com/taskforcesh/bullmq) | Source | Free | Examples in the `/examples` directory |

| [OneUptime — Build Job Queue with BullMQ](https://oneuptime.com/blog/post/2026-01-06-nodejs-job-queue-bullmq-redis/view) | Tutorial | Free | Step-by-step with code |

| [DEV.to — Scalable Background Jobs with BullMQ](https://dev.to/asad_ahmed_5592ac0a7d0258/building-scalable-background-jobs-in-nodejs-with-bullmq-a-complete-guide-509p) | Article | Free | Complete guide with production config |

| [DEV.to — Building a Scalable Job Queue](https://dev.to/hexshift/building-a-scalable-job-queue-with-bullmq-and-redis-in-nodejs-b36) | Article | Free | Scaling patterns |

| [DEV.to — Scaling Background Jobs](https://dev.to/hexshift/scaling-background-jobs-with-bullmq-and-redis-in-nodejs-4612) | Article | Free | Multi-worker, concurrency |

| [Medium — BullMQ Modern Guide](https://medium.com/@sindhujad6/using-bullmq-and-redis-in-your-node-js-backend-a-modern-guide-to-background-job-processing-a4fb37953192) | Article | Free | Background job processing patterns |

| [Medium — Setup BullMQ in 5 Minutes](https://medium.com/@mjdrehman/setting-up-a-job-queue-in-node-js-with-bullmq-and-redis-in-5-minutes-0f170928c0b5) | Article | Free | Quickstart |

| [BetterStack — Job Scheduling with BullMQ](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/) | Guide | Free | Scheduled/cron jobs |

#### Hands-on mental exercise

Open `sas_b/server.js` and find `const sessionConnections = new Map()`. Now imagine: if two Node.js processes each have their own Map, a teacher on Process 1 broadcasts a poll — students on Process 2 never receive it. Redis Pub/Sub fixes this: every process subscribes to the same Redis channel. The fix is in `REDesign PLan.md` Change 3.

---

### 3C — Vector Databases & Qdrant

> This explains why `sas_b/services/ragService.js` exists — why documents get turned into numbers and why a special database (Pinecone → Qdrant) is needed to search them.

#### Why it matters for your project

Every student AI query triggers this pipeline: embed question → search Qdrant → retrieve relevant chunks → feed to LLM → stream answer. Understanding this explains every file in `sas_b/services/`. In the DGX plan, Pinecone (cloud) is replaced by Qdrant (self-hosted on NVMe).

#### Core Concepts to Understand

1.**Embeddings** — text converted to a list of ~384 numbers that encode semantic *meaning*

2.**Vector similarity** — two embeddings near each other in 384-dimensional space = similar meaning

3.**Cosine similarity** — the metric: measures angle between vectors (1.0 = identical, 0.0 = unrelated)

4.**Chunking** — documents split into 400-token pieces before embedding. Why? LLMs have context limits.

5.**RAG pipeline** — Ingest → Embed → Store → Query → Retrieve → Augment → Generate

6.**Metadata filtering** — searching only within a specific session's documents (`session_id = "ABC"`)

7.**Top-K retrieval** — return the 8 most similar chunks, not all chunks

#### RAG Conceptual Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Pinecone — What is RAG?](https://www.pinecone.io/learn/retrieval-augmented-generation/) | Guide | Free | **Best introduction to RAG** |

| [IBM — What is RAG?](https://www.ibm.com/think/topics/retrieval-augmented-generation) | Article | Free | Clean conceptual overview |

| [AWS — RAG Explained](https://aws.amazon.com/what-is/retrieval-augmented-generation/) | Article | Free | Good diagrams |

| [Google Cloud — RAG Overview](https://cloud.google.com/use-cases/retrieval-augmented-generation) | Article | Free | Production-scale perspective |

| [DEV.to — RAG with Vector DBs 2025](https://dev.to/nikhilwagh/retrieval-augmented-generation-rag-with-vector-databases-powering-context-aware-ai-in-2025-4930) | Article | Free | Modern 2025 RAG patterns |

| [Wikipedia — RAG](https://en.wikipedia.org/wiki/Retrieval-augmented_generation) | Reference | Free | Academic definition with citations |

#### RAG Hands-on Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [DeepLearning.AI — RAG Course](https://learn.deeplearning.ai/courses/retrieval-augmented-generation/information) | Free course | Free | **Best hands-on course** — code + Weaviate |

| [DEV.to — RAG Pipeline Deep Dive](https://dev.to/derrickryangiggs/rag-pipeline-deep-dive-ingestion-chunking-embedding-and-vector-search-2877) | Article | Free | Ingestion, chunking, embedding, search explained |

| [Medium — RAG Deep Dive](https://medium.com/@derrickryangiggs/rag-pipeline-deep-dive-ingestion-chunking-embedding-and-vector-search-abd3c8bfc177) | Article | Free | Same article, great diagrams |

| [DigitalOcean — End-to-End RAG Pipeline](https://www.digitalocean.com/community/tutorials/end-to-end-rag-pipeline) | Tutorial | Free | Code from scratch |

| [LearnOpenCV — Vector DB + RAG Pipeline](https://learnopencv.com/vector-db-and-rag-pipeline-for-document-rag/) | Guide | Free | Document RAG with code |

| [Medium — Embeddings + RAG: Theory to Production](https://medium.com/@sharanharsoor/the-complete-guide-to-embeddings-and-rag-from-theory-to-production-758a16d747ac) | Article | Free | Theory → production path |

| [Nimbleway — Step-by-Step RAG Guide](https://www.nimbleway.com/blog/rag-pipeline-guide) | Guide | Free | Practical implementation |

| [Chitika — RAG Definitive Guide 2025](https://www.chitika.com/retrieval-augmented-generation-rag-the-definitive-guide-2025/) | Guide | Free | Comprehensive 2025 overview |

#### Qdrant Specific Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Qdrant Official Docs](https://qdrant.tech/documentation/) | Official | Free | **Start here for Qdrant** |

| [Qdrant Quickstart](https://qdrant.tech/documentation/quickstart/) | Official | Free | Up in 5 minutes |

| [Qdrant — Data Ingestion for Beginners](https://qdrant.tech/documentation/data-ingestion-beginners/) | Official | Free | Ingestion pipeline from scratch |

| [Qdrant — Understanding Vector Search](https://qdrant.tech/documentation/overview/vector-search/) | Official | Free | Core concepts |

| [Qdrant GitHub](https://github.com/qdrant/qdrant) | Source | Free | Examples directory |

| [Medium — Mastering Qdrant](https://medium.com/@animesh.py/mastering-qdrant-a-friendly-guide-to-your-first-vector-database-ecb826d49c8c) | Article | Free | Friendly beginner guide |

| [Airbyte — Beginner&#39;s Guide to Qdrant](https://airbyte.com/tutorials/beginners-guide-to-qdrant) | Tutorial | Free | Installation, setup, basic operations |

| [Cohorte — Developer&#39;s Guide to Qdrant](https://www.cohorte.co/blog/a-developers-friendly-guide-to-qdrant-vector-database) | Guide | Free | Developer-focused practical guide |

| [Analytics Vidhya — Deep Dive into Qdrant](https://www.analyticsvidhya.com/blog/2023/11/a-deep-dive-into-qdrant-the-rust-based-vector-database/) | Article | Free | Technical deep dive |

| [Medium — Vector DBs Explained + Qdrant Demo](https://medium.com/next-token/vector-databases-explained-simple-a07974c942cb) | Article | Free | Simple explanation with demo |

---

## Level 4 — Real-Time & Async Systems

### 4A — WebSocket Architecture & Scaling

> WebSockets are how live polling, attendance, leaderboard updates, and student-stuck signals work. The scaling problem here (`CRIT-02`) is the most important architectural issue in the codebase.

#### Why it matters for your project

`sas_b/server.js` has 1,462 lines largely devoted to WebSocket message handling. The core bug: all session state (`sessionConnections`, `attendanceWindows`, `pollTimers`) lives in process memory. Two server instances = two isolated islands of state.

#### Core Concepts to Understand

1.**HTTP vs WebSocket** — HTTP is request/response (open → ask → answer → close); WebSocket is a persistent pipe (open once → send/receive anytime)

2.**The upgrade handshake** — browser sends `Upgrade: websocket` header; server responds with HTTP 101 Switching Protocols

3.**The multi-server problem** — Teacher connects to Instance A, 150 students connect to Instance B. Teacher broadcasts → students never receive it.

4.**Redis Pub/Sub as the fix** — Instance A publishes to Redis channel `session:XYZ`. Instance B is subscribed → forwards to its local students.

5.**Sticky sessions** — load balancer always routes same client to same instance (avoids reconnects)

6.**Heartbeats** — client pings every 30s; server marks client offline if no ping received

7.**Graceful reconnection** — client reconnects with exponential backoff on disconnect

#### WebSocket Conceptual Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [GeeksforGeeks — WebSockets in Distributed Systems](https://www.geeksforgeeks.org/system-design/websockets-for-real-time-distributed-systems/) | Article | Free | **Start here** |

| [GeeksforGeeks — WebSockets in Microservices](https://www.geeksforgeeks.org/system-design/websockets-in-microservices-architecture/) | Article | Free | Scaling patterns |

| [Ably — WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices) | Guide | Free | Production-grade patterns |

| [The WebSocket Handbook (PDF — free)](https://pages.ably.com/hubfs/the-websocket-handbook.pdf) | Free book | Free | Most comprehensive reference |

| [Medium — Layered WebSocket Architecture](https://medium.com/@jamala.zawia/designing-a-layered-websocket-architecture-for-scalable-real-time-systems-1ba3591e3ffb) | Article | Free | Multi-layer design patterns |

| [System Design Notes — WebSocket Architecture](https://system-design.muthu.co/posts/real-time-systems/websocket-architecture/index.html) | Article | Free | System design lens |

#### WebSocket + Redis Pub/Sub Scaling (Most Relevant to Your Fix)

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [Leapcell — Scaling WebSockets with Redis Pub/Sub](https://leapcell.io/blog/scaling-websocket-services-with-redis-pub-sub-in-node-js) | Article | Free | **Exactly your use case** — Node.js + ws + Redis |

| [OneUptime — WebSocket Scaling with Redis](https://oneuptime.com/blog/post/2026-01-24-websocket-scaling-redis-pubsub/view) | Tutorial | Free | Step-by-step code (2026) |

| [Ably — Scaling Pub/Sub with WebSockets and Redis](https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis) | Article | Free | Production architecture |

| [DEV.to — Scaling WS Connections (Multi-Instance)](https://dev.to/hexshift/scaling-websocket-connections-with-redis-pubsub-for-multi-instance-nodejs-applications-3pib) | Article | Free | Code examples for multi-instance Node.js |

| [DEV.to — Horizontal WS Deployment](https://dev.to/hexshift/scaling-websocket-applications-with-redis-pubsub-for-horizontal-deployment-2mb2) | Article | Free | Horizontal scaling patterns |

| [Medium — WebSockets in Node.js with Redis](https://medium.com/@bhanushaliyash2000/scaling-web-sockets-in-node-js-using-redis-pub-sub-f7dcf5b5dd98) | Article | Free | Beginner-friendly implementation |

| [GoldFire Studios — Horizontally Scaling WS](https://goldfirestudios.com/horizontally-scaling-node-js-and-websockets-with-redis) | Article | Free | Real-world horizontal scaling |

| [Redis — Build a Chat App](https://redis.io/tutorials/howtos/chatapp/) | Official tutorial | Free | Official Redis WebSocket + Pub/Sub example |

| [DEV.to — Redis Pub/Sub + Socket.IO](https://dev.to/codexam/scaling-real-time-communication-with-redis-pubsub-and-socketio-3p56) | Article | Free | Socket.IO variant (concepts apply) |

#### Hands-on mental exercise

Find `broadcastToSession()` in `sas_b/server.js`. It loops over `sessionConnections.get(sessionId)` and calls `ws.send()`. If a student joined on a different server instance, they're not in this Map — they never receive the message. The fix (Redis Pub/Sub) is in `REDesign PLan.md` Change 3.

---

### 4B — Message Queues (BullMQ)

> Message queues turn "do this work now while user waits" into "queue this work, return immediately, process in background." This is what makes AI queries non-blocking.

#### Why it matters for your project

`CRIT-05` — students submit AI questions → HTTP connection held open 30-60 seconds → Render's free tier kills it. BullMQ: student submits query → server returns job ID in 50ms → BullMQ worker processes query → result stored in Redis → client polls or receives via WebSocket.

#### Core Concepts to Understand

1.**Producer/Consumer** — producer adds jobs to queue; one or more workers consume and process them

2.**Job lifecycle** — `waiting → active → completed / failed → delayed (on retry)`

3.**Retries with backoff** — job fails → wait 5s → retry → wait 10s → retry → wait 20s → dead letter

4.**Concurrency** — `concurrency: 3` means max 3 AI jobs run simultaneously on one worker

5.**Job progress** — `await job.updateProgress(50)` lets the frontend show a progress bar

6.**Bull Board** — web dashboard to monitor queues, see failed jobs, retry manually

7.**Graceful shutdown** — workers must finish current jobs before stopping on deploy

#### Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [BullMQ Official Docs](https://docs.bullmq.io/) | Official | Free | **The complete reference** |

| [BullMQ GitHub](https://github.com/taskforcesh/bullmq) | Source | Free | `/examples` folder has real patterns |

| [BullMQ Official Site](https://bullmq.io/) | Official | Free | Overview and feature list |

| [OneUptime — Build Job Queue with BullMQ](https://oneuptime.com/blog/post/2026-01-06-nodejs-job-queue-bullmq-redis/view) | Tutorial | Free | Step-by-step January 2026 |

| [DEV.to — Scalable Background Jobs (Complete Guide)](https://dev.to/asad_ahmed_5592ac0a7d0258/building-scalable-background-jobs-in-nodejs-with-bullmq-a-complete-guide-509p) | Article | Free | Complete guide with production config |

| [DEV.to — Building Scalable Job Queue](https://dev.to/hexshift/building-a-scalable-job-queue-with-bullmq-and-redis-in-nodejs-b36) | Article | Free | Scaling patterns |

| [DEV.to — Scaling Background Jobs](https://dev.to/hexshift/scaling-background-jobs-with-bullmq-and-redis-in-nodejs-4612) | Article | Free | Multi-worker, concurrency control |

| [Medium — BullMQ Modern Guide](https://medium.com/@sindhujad6/using-bullmq-and-redis-in-your-node-js-backend-a-modern-guide-to-background-job-processing-a4fb37953192) | Article | Free | Modern background job patterns |

| [Medium — BullMQ in 5 Minutes](https://medium.com/@mjdrehman/setting-up-a-job-queue-in-node-js-with-bullmq-and-redis-in-5-minutes-0f170928c0b5) | Quickstart | Free | Fastest setup guide |

| [BetterStack — Job Scheduling with BullMQ](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/) | Guide | Free | Cron/scheduled job patterns |

---

## Level 5 — AI Infrastructure

### 5A — vLLM & Self-Hosted LLMs

> vLLM serves your Mistral model locally on DGX GPUs. It replaces the paid Mistral API with an identical API running on-premises — zero per-token cost, zero data leaving campus.

#### Why it matters for your project

In `PRODUCTION_DGX_PLAN.md`: vLLM runs Mixtral 8x7B on GPUs 0–1 (replaces `mistral-large-latest`) and Mistral 7B on GPU 2 (replaces `mistral-small-latest`). The API is OpenAI-compatible, so `mistralClient.js` only needs a URL change.

#### Core Concepts to Understand

1.**Inference vs Training** — inference = *running* a pre-trained model; training = teaching it. DGX does inference.

2.**PagedAttention** — vLLM's core innovation. Manages GPU VRAM like an OS manages RAM — eliminates 60-80% memory waste from KV cache fragmentation.

3.**Continuous batching** — processes multiple concurrent student requests in one GPU forward pass. 50 students = 1 batched call, not 50 sequential calls.

4.**Tensor parallelism** — splits Mixtral 8x7B across 2 GPUs: `--tensor-parallel-size 2`

5.**OpenAI-compatible API** — serves `/v1/chat/completions` identically to OpenAI. Existing code works.

6.**`--served-model-name`** — lets you name the model `mistral-large-latest` so your code doesn't change

#### vLLM vs Alternatives

| Tool | Best for | VRAM needed | Speed | Production? |

|---|---|---|---|---|

| **vLLM** | High concurrency, multi-user production | Full precision (large) | Fastest | **Yes — use this on DGX** |

| **Ollama** | Local dev, single user, easy setup | Quantized (smaller) | Moderate | Dev/testing only |

| **llama.cpp** | CPU-only or minimal GPU | Minimal | Slow (CPU) | No |

| **LM Studio** | GUI desktop testing | Moderate | Moderate | No |

**Rule:** Use Ollama on your development laptop. Use vLLM on DGX in production.

#### Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [vLLM Official Site](https://vllm.ai/) | Official | Free | **Start here** |

| [vLLM GitHub](https://github.com/vllm-project/vllm) | Source + docs | Free | README quickstart + examples |

| [Nebius — Practical vLLM Guide](https://nebius.com/blog/posts/serving-llms-with-vllm-practical-guide) | Tutorial | Free | Best practical guide available |

| [TechTide — vLLM Tutorial](https://techtidesolutions.com/blog/vllm-tutorial/) | Tutorial | Free | Step-by-step deployment |

| [SitePoint — Enterprise vLLM Deployment](https://www.sitepoint.com/the-2026-definitive-guide-to-running-local-llms-in-production/) | Guide | Free | Enterprise production guide (2026) |

| [SitePoint — Local LLMs Complete Guide](https://www.sitepoint.com/local-llms-complete-guide/) | Guide | Free | Developer's complete guide |

| [IntuitionLabs — Local LLM on 24GB GPUs](https://intuitionlabs.ai/articles/local-llm-deployment-24gb-gpu-optimization) | Guide | Free | GPU optimization strategies |

| [Medium — Complete 2025 LLM Hosting Guide](https://medium.com/@rosgluk/local-llm-hosting-complete-2025-guide-ollama-vllm-localai-jan-lm-studio-more-f98136ce7e4a) | Comparison | Free | vLLM vs Ollama vs LocalAI vs others |

| [DEV.to — LLM Hosting Guide](https://dev.to/rosgluk/local-llm-hosting-complete-2025-guide-ollama-vllm-localai-jan-lm-studio-more-1dcl) | Article | Free | Same, DEV.to version |

| [vLLM vs Ollama vs llama.cpp comparison](https://itecsonline.com/post/vllm-vs-ollama-vs-llama.cpp-vs-tgi-vs-tensort) | Comparison | Free | Side-by-side technical breakdown |

| [Self-Hosted LLM Guide 2026](https://blog.premai.io/self-hosted-llm-guide-setup-tools-cost-comparison-2026/) | Guide | Free | Cost + tool comparison |

| [vLLM Production Deployment](https://introl.com/blog/vllm-production-deployment-inference-serving-architecture) | Guide | Free | Production architecture patterns |

| [AIConexio — Private LLM Deployment](https://aiconexio.com/resources/private-llm-deployment) | Guide | Free | Security + infrastructure |

| [Medium — Run vLLM on Low-VRAM GPU](https://kumarshivam-66534.medium.com/run-vllm-locally-on-low-vram-budget-laptop-4gb-gpu-in-2025-full-docker-guide-errors-ollama-bf8c498e7dec) | Article | Free | Budget GPU setup (dev machine practice) |

---

### 5B — MinIO (Self-Hosted File Storage)

> MinIO is a self-hosted, S3-compatible file storage server. It replaces Supabase Storage in the DGX plan. Any code that works with AWS S3 works with MinIO unchanged.

#### Why it matters for your project

In `PRODUCTION_DGX_PLAN.md`, uploaded PDFs, DOCX, and PPTX files are stored in MinIO instead of Supabase Storage. The code change is minimal — just swap the endpoint URL. Files never leave campus.

#### Core Concepts to Understand

1.**Object storage** — stores files as "objects" with a key (path) + metadata. Not a filesystem.

2.**S3-compatible API** — the same AWS SDK commands (`PutObject`, `GetObject`, `DeleteObject`) work with MinIO

3.**Buckets** — containers for objects. You have one: `session-resources`

4.**`forcePathStyle: true`** — required for MinIO. Uses `http://minio:9000/bucket/key` instead of `http://bucket.minio:9000/key`

5.**Signed URLs** — pre-authorized temporary URLs. Frontend uploads directly to MinIO — Node.js server never touches the file bytes.

6.**MinIO Console** — web UI at port 9001. Browse files, manage buckets, set policies.

#### Resources

| Resource | Type | Cost | Notes |

|---|---|---|---|

| [MinIO Official Site](https://www.min.io/) | Official | Free | **Start here** |

| [MinIO GitHub](https://github.com/minio/minio) | Source | Free | README has Docker quickstart |

| [SelfHostSchool — MinIO Complete Guide 2025](https://selfhostschool.com/minio-self-hosted-s3-storage-guide/) | Guide | Free | **Best beginner guide** |

| [LearnWithHasan — MinIO Self-Hosted Guide](https://learnwithhasan.com/blog/minio-self-hosted-s3-storage-guide/) | Guide | Free | Same guide, alternate source |

| [Medium — Self-Hosting S3 with MinIO + Docker Compose](https://kodelan.medium.com/step-by-step-guide-setting-up-and-self-hosting-an-s3-bucket-for-free-using-minio-object-storage-813e63cfee9a) | Article | Free | **Step-by-step Docker Compose setup** |

| [James O&#39;Claire — How to Self-Host S3 in 2025](https://jamesoclaire.com/2025/05/27/how-to-self-host-your-own-s3-in-2025/) | Blog | Free | Practical 2025 guide |

| [Asynx — Self-Host S3 with MinIO + Docker](https://asynx.in/blog/self-host-s3-object-storage-minio-docker) | Guide | Free | Docker-focused setup |

| [Brice Moyer — Self-Hosting Object Storage](https://blog.bricemoyer.com/self-hosted-object-storage-s3-with-minio/) | Blog | Free | Clean setup walkthrough |

| [OneUptime — How to Set Up MinIO](https://oneuptime.com/blog/post/2026-01-27-minio-s3-compatible-storage/view) | Tutorial | Free | January 2026 tutorial |

---

## Suggested Weekly Schedule

| Week | Level | Topic | Hours | Milestone |

|---|---|---|---|---|

| 1 | 1 | System Design — roadmap.sh + ByteByteGo YouTube | 5 hr | Can explain horizontal vs vertical scaling |

| 2 | 1 | System Design Primer on GitHub + CAP theorem | 5 hr | Can explain why stateful services break at scale |

| 3 | 2 | Docker basics — docker-curriculum.com + TechWorld with Nana | 5 hr | Can `docker run` any image from Docker Hub |

| 4 | 2 | Docker Compose — multi-service stack, volumes, networks | 5 hr | Can run Node.js + PostgreSQL + Redis locally together |

| 5 | 2 | Docker Production — health checks, resource limits, restart policies | 3 hr | Understand the `docker-compose.yml` in `PRODUCTION_DGX_PLAN.md` |

| 6 | 2 | Nginx — reverse proxy, location blocks, WebSocket proxying | 4 hr | Can route traffic through Nginx with SSL |

| 7 | 3 | PostgreSQL — indexes, EXPLAIN ANALYZE, JOIN performance | 5 hr | Can identify and fix a missing index |

| 8 | 3 | PgBouncer — connection pooling, transaction vs session mode | 3 hr | Understand why the pool size of 5 breaks at scale |

| 9 | 3 | Redis basics — key-value, TTL, cache-aside pattern | 4 hr | Can implement a simple auth cache |

| 10 | 3 | Redis advanced — Pub/Sub, Sorted Sets, Hashes | 4 hr | Can write a pub/sub example in Node.js |

| 11 | 4 | WebSockets — protocol, the multi-server problem, Redis fix | 4 hr | Can explain why WS fails with 2 servers and how to fix it |

| 12 | 4 | BullMQ — queues, workers, retries, progress, Bull Board | 4 hr | Can build an AI job queue with producer + worker |

| 13 | 3 | Qdrant + RAG — embeddings, cosine similarity, the pipeline | 4 hr | Can explain what `ragService.js` and `vectorStore.js` do |

| 14 | 5 | vLLM — PagedAttention, tensor parallelism, OpenAI API | 3 hr | Can start a local vLLM server and query it |

| 15 | 5 | MinIO — object storage, S3 API, signed URLs | 2 hr | Can run MinIO in Docker and upload a file |

| 16 | All | Review — deploy a mini version of your stack locally | 5 hr | Running local stack: Node.js + PostgreSQL + Redis + Qdrant + MinIO |

---

## Key Mental Model to Keep Coming Back To

Every technology in this list solves one of these 4 problems:

```

1. TOO SLOW       →  Indexes, Redis cache, Nginx, PgBouncer, batch embedding

2. TOO FRAGILE    →  BullMQ (retry), Redis (state persistence), health checks, graceful shutdown

3. NOT SCALABLE   →  Redis pub/sub (WebSocket), stateless services, horizontal scaling

4. TOO EXPENSIVE  →  vLLM (replaces Mistral API), Qdrant (replaces Pinecone), MinIO (replaces Supabase)

```

When you read any article or watch any video, ask: *which of these 4 problems is this solving?*

---

## Practice Project — Build a Mini Version of Your Own Stack

After completing the 16 weeks, build this locally. It touches every technology:

```

Goal: A mini real-time quiz app with AI search


Services (docker-compose.yml):

  - postgres       → stores questions and responses

  - redis          → caches results, pub/sub for live updates

  - qdrant         → vector search over your questions

  - minio          → stores PDF question banks

  - nginx          → reverse proxy to your Node.js app


Features to build:

  1. Upload a PDF → extract text → chunk → embed → store in Qdrant     (embeddingService)

  2. Search "tell me about X" → embed query → search Qdrant → return chunks   (ragService)

  3. Live poll → WebSocket broadcast via Redis pub/sub                  (server.js)

  4. Results cached in Redis for 60 seconds                             (cacheService)

  5. PDF stored in MinIO                                                (storage.js)

```

This mini project is your `sas_b/` system in miniature. By the time it works, you understand everything.

---

## Quick Reference — Technology → File in Your Codebase

| Technology | Where to see it right now |

|---|---|

| PostgreSQL indexes (missing) | `sas_b/routes/analytics.js`, `sas_b/routes/gamification.js` |

| Connection pool size (the bug) | `sas_b/db.js` line 19 — `max: 5` |

| In-memory state (the problem) | `sas_b/server.js` lines 34–43 — `sessionConnections`, `attendanceWindows` |

| Redis cache (exists) | `sas_b/services/cacheService.js` |

| WebSocket server | `sas_b/server.js` — the `wss.on('connection')` section |

| Blocking AI pipeline | `sas_b/services/ragService.js` — the `await mistralClient.chatComplete(...)` call |

| Sequential embeddings (slow) | `sas_b/services/embeddingService.js` lines 65–88 — `for` loop with `await` + `sleep` |

| Vector search | `sas_b/services/vectorStore.js` — Pinecone calls |

| LLM API calls | `sas_b/services/mistralClient.js` |

| File upload (in memory) | `sas_b/routes/resources.js` line 27 — `multer.memoryStorage()` |

| File storage (Supabase) | `sas_b/routes/resources.js` — `supabase.storage.from()` calls |

| JWT auth (no cache) | `sas_b/middleware/auth.js` lines 17–30 |

| HTTP polling (the bug) | `SAS-EDU-AI_F/src/components/student/EnhancedStudentDashboard.jsx` line 57 |

| Async forEach (the bug) | `sas_b/routes/ai-search.js` line 104 |

| N+1 leaderboard query | `sas_b/routes/gamification.js` lines 159–179 |

---

## Udemy Course Recommendations

> Udemy courses almost never sell at full price. Wait for a sale — prices drop to ₹449–₹649 (or $12–$15) regularly. Search the exact course title on udemy.com.

> **Strategy:** Buy one course per level as you reach it. Don't pre-buy all of them.

---

### Level 1 — System Design (HLD)

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **Mastering the System Design Interview** | Frank Kane | Best HLD course on Udemy. Covers stateless services, caching layers, WebSocket scaling, DB sharding — every concept behind your 25 scalability issues. **Start here.** |
| **Software Architecture & Technology of Large-Scale Systems** | Haim Ari | Covers event-driven architecture, microservices, distributed systems. Directly explains the reasoning behind every change in `REDesign PLan.md`. |
| **Rocking System Design** | Gaurav Sen | From the famous YouTube educator. Goes deeper than Frank Kane on distributed systems theory (consistent hashing, CAP theorem, leader election). Do this after Mastering. |

---

### Level 2 — Docker & Infrastructure

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **Docker Mastery: with Kubernetes +Swarm from a Docker Captain** | Bret Fisher | Written by a Docker Captain. The most practical Docker + Docker Compose course. Covers health checks, volumes, networks, production patterns — everything in `PRODUCTION_DGX_PLAN.md`. |
| **Docker & Kubernetes: The Practical Guide** | Maximilian Schwarzmüller (Academind) | More beginner-friendly entry point if Bret Fisher feels advanced. Excellent multi-container Compose coverage. Same instructor as the Node.js course below — consistent teaching style. |

> **Note:** There is no widely respected dedicated Nginx course on Udemy. Learn Nginx from the free resources in Section 2B above — they are better than paid options for Nginx specifically.

---

### Level 3A — PostgreSQL & SQL

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **SQL and PostgreSQL: The Complete Developer's Guide** | Stephen Grider | **The best PostgreSQL course on Udemy.** Deep coverage of indexes, `EXPLAIN ANALYZE`, CTEs, window functions, and query optimization. Everything in `DB/02_indexes.sql` will make complete sense after this. |
| **The Complete SQL Bootcamp: Go from Zero to Hero** | Jose Portilla | Better as a foundations course if you want SQL basics before going deep. More beginner-friendly than Grider's. Skip if you already know basic SQL. |

---

### Level 3B — Redis

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **Redis: The Complete Developer's Guide** | Stephen Grider | Covers everything your codebase needs: cache-aside pattern, Pub/Sub (the WebSocket fix), Sorted Sets (leaderboard), Hashes, Streams. Grider shows real Node.js code throughout — not abstract theory. **Buy this.** |

---

### Level 4 — Node.js, WebSockets & Microservices

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **Microservices with Node JS and React** | Stephen Grider | **Your exact tech stack.** Event-driven patterns, service communication, scaling Express.js — this course explains the architecture `REDesign PLan.md` is moving toward. |
| **NodeJS — The Complete Guide (MVC, REST APIs, GraphQL, Deno)** | Maximilian Schwarzmüller | Deep Node.js + Express architecture, authentication patterns, REST API design. Fills the structural gaps in how `sas_b/` is organized. Good pairing with Grider's microservices course. |
| **The Complete Node.js Developer Course** | Andrew Mead | More beginner-friendly alternative to Schwarzmüller. If you want to strengthen Node.js fundamentals first before going to microservices. |

---

### Level 5 — AI, RAG & LLMs

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **LangChain — Develop LLM Powered Applications with LangChain** | Eden Marco | Covers RAG pipeline architecture, vector store integration, prompt engineering, chunking strategies. Concepts apply directly to `ragService.js` and `vectorStore.js` even if you're not using LangChain. |
| **Generative AI with Large Language Models** | DeepLearning.AI (also on Coursera) | Foundation models, RAG theory, fine-tuning concepts. Best course for understanding the *why* behind your entire AI pipeline — from embeddings to generation. |
| **ChatGPT and LangChain: The Complete Developer's Masterclass** | Colt Steele | More accessible entry point for LLM development. Good for building intuition about prompt construction, context windows, and why chunking matters before going into vLLM deployment. |

---

### Bonus — LLD: Design Patterns

| Course Title | Instructor | Why It Fits Your Project |
|---|---|---|
| **Design Patterns in JavaScript** | (search by title on Udemy) | Observer (your WebSocket events), Strategy (RAG query classifier), Factory (OAuth strategy selection) — you're already using these patterns implicitly in `sas_b/`. This makes them explicit. |
| **Clean Code** | (search "Clean Code SOLID" on Udemy) | Directly improves `sas_b/` route/service separation. SOLID principles explain why splitting `ragService.js` into smaller pieces is the right architectural move. |

---

### Stephen Grider's Stack — The Recommended Trio

If budget is limited, buy these three in order. They form a complete stack:

```
1. SQL and PostgreSQL: The Complete Developer's Guide      → Your DB layer
2. Redis: The Complete Developer's Guide                   → Your cache + pub/sub layer
3. Microservices with Node JS and React                    → Your service architecture
```

All three are by the same instructor (Stephen Grider), have consistent teaching style, and together cover 80% of the architectural improvements in `REDesign PLan.md`.

---

*Last updated: 2026-03-27 — covers all technologies referenced in `SCALABILITY_ISSUES.md`, `REDesign PLan.md`, and `PRODUCTION_DGX_PLAN.md`*
