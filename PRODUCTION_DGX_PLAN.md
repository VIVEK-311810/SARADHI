# SAS Edu AI — Production Deployment on SASTRA DGX Server

> **Date:** 2026-03-26
> **Target:** NVIDIA DGX server, on-premises at SASTRA University
> **Goal:** Zero external cloud dependencies. Every service runs on DGX. No API costs, no data leaves campus.

---

## Table of Contents

1. [What Changes and Why](#1-what-changes-and-why)
2. [DGX Server Architecture](#2-dgx-server-architecture)
3. [Service Replacement Map](#3-service-replacement-map)
4. [Change 1 — LLM: Mistral API → vLLM on GPU](#4-change-1--llm-mistral-api--vllm-on-gpu)
5. [Change 2 — Embeddings: HuggingFace API → TEI Server on GPU](#5-change-2--embeddings-huggingface-api--tei-server-on-gpu)
6. [Change 3 — Vector DB: Pinecone → Qdrant](#6-change-3--vector-db-pinecone--qdrant)
7. [Change 4 — Database: Supabase → PostgreSQL + PgBouncer](#7-change-4--database-supabase--postgresql--pgbouncer)
8. [Change 5 — File Storage: Supabase Storage → MinIO](#8-change-5--file-storage-supabase-storage--minio)
9. [Change 6 — Cache & Queue: Upstash → Self-Hosted Redis](#9-change-6--cache--queue-upstash--self-hosted-redis)
10. [Change 7 — Reverse Proxy: Nginx](#10-change-7--reverse-proxy-nginx)
11. [Full Docker Compose Stack](#11-full-docker-compose-stack)
12. [Code Changes Required](#12-code-changes-required)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Procedure](#14-deployment-procedure)
15. [Cost Comparison](#15-cost-comparison)

---

## 1. What Changes and Why

### The core principle
Every service that currently calls an external API must be replaced with a self-hosted equivalent running on the DGX. No data leaves the campus network.

### Before (Development/Current)

```
sas_b (Render)
  │
  ├── Mistral API          → mistral.ai servers (France)     ← $$ per token
  ├── HuggingFace API      → huggingface.co servers          ← rate-limited, slow
  ├── Pinecone             → pinecone.io cloud               ← $$ per vector
  ├── Supabase (DB)        → AWS ap-south-1 (Mumbai)         ← shared cloud DB
  ├── Supabase Storage     → AWS S3 (Mumbai)                 ← $$ per GB
  └── Upstash Redis        → upstash.com cloud               ← $$ per command

SAS-EDU-AI_F (Vercel)
  └── CDN-distributed globally
```

### After (Production on DGX)

```
SASTRA Campus Network
  │
  ├── Nginx (reverse proxy, SSL termination, port 443)
  │
  ├── Node.js / Express (sas_b)          → runs on DGX CPU
  ├── React Build (SAS-EDU-AI_F)         → served by Nginx as static files
  │
  ├── vLLM (GPU inference server)        → DGX GPU (Mistral 7B / Mixtral 8x7B)
  ├── TEI (embedding server)             → DGX GPU (all-MiniLM-L6-v2)
  ├── Qdrant (vector database)           → DGX SSD
  ├── PostgreSQL + PgBouncer             → DGX SSD
  ├── MinIO (object storage)             → DGX HDD/SSD
  └── Redis                             → DGX RAM
```

---

## 2. DGX Server Architecture

### Assumed DGX Configuration

NVIDIA DGX servers typically come with:
- **GPUs:** 8× A100 80GB (DGX A100) or 8× H100 80GB (DGX H100)
- **CPU:** 2× AMD EPYC 7742 (128 cores total)
- **RAM:** 1TB–2TB system RAM
- **Storage:** 30TB NVMe SSD + optional spinning disk
- **Network:** 8× 200Gb InfiniBand + 2× 10GbE

### Service-to-Resource Allocation

```
┌─────────────────────────────────────────────────────────────┐
│                    DGX Server                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GPU Partition (vLLM + TEI)                          │   │
│  │                                                     │   │
│  │  GPU 0-1:  vLLM → Mixtral 8x7B (2x80GB = 160GB)   │   │
│  │            (or Mistral 7B on 1 GPU)                │   │
│  │  GPU 2:    TEI → all-MiniLM-L6-v2 embedding server │   │
│  │  GPU 3-7:  Reserved for future models / transcription│  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CPU / Memory Partition (All other services)         │   │
│  │                                                     │   │
│  │  Node.js (sas_b)    — 8 CPU cores, 32GB RAM         │   │
│  │  PostgreSQL         — 8 CPU cores, 64GB RAM         │   │
│  │  PgBouncer          — 1 CPU core,  1GB RAM          │   │
│  │  Redis              — 2 CPU cores, 16GB RAM         │   │
│  │  Qdrant             — 4 CPU cores, 32GB RAM         │   │
│  │  MinIO              — 4 CPU cores, 8GB RAM          │   │
│  │  Nginx              — 2 CPU cores, 2GB RAM          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Storage                                            │   │
│  │  NVMe SSD (fast):  PostgreSQL, Redis, Qdrant index  │   │
│  │  HDD (bulk):       MinIO (uploaded PDFs/docs)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Service Replacement Map

| Current Service | What it does | DGX Replacement | Why this choice |
|---|---|---|---|
| `mistral.ai API` | LLM answers, classification, MCQ gen | **vLLM** + Mixtral 8x7B | Fastest GPU inference server, OpenAI-compatible API |
| `HuggingFace Inference API` | Text embeddings (384-dim) | **TEI** (Text Embeddings Inference) | HuggingFace's own GPU-optimized embedding server |
| `Pinecone` | Vector similarity search | **Qdrant** | Fastest self-hosted vector DB, Rust-based, low memory |
| `Supabase PostgreSQL` | All relational data | **PostgreSQL 16** + **PgBouncer** | Direct control, no connection limits |
| `Supabase Storage` | Uploaded PDF/DOCX/PPTX files | **MinIO** | S3-compatible API, same code works with tiny config change |
| `Upstash Redis` | Cache, pub/sub, job queue | **Redis 7** | Standard Redis, no API key needed |
| `Vercel (frontend)` | Serve React SPA | **Nginx** (static files) | Same Nginx already used as reverse proxy |
| `Render (backend)` | Host Node.js server | **PM2** on DGX | Multi-core cluster mode, auto-restart |

---

## 4. Change 1 — LLM: Mistral API → vLLM on GPU

### Why vLLM

vLLM is specifically designed for high-throughput LLM serving:
- **Continuous batching** — serves multiple students simultaneously from one GPU process
- **PagedAttention** — handles long contexts without running out of GPU VRAM
- **OpenAI-compatible API** — your existing `mistralClient.js` barely changes, just the base URL
- **Supports Mixtral 8x7B** — runs on 2× A100 80GB; significantly better than Mistral 7B

### Model Choice

| Model | VRAM Required | Quality | Speed |
|---|---|---|---|
| `mistralai/Mistral-7B-Instruct-v0.3` | 1× A100 40GB | Good for classification | Very fast |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | 2× A100 80GB | Near-Mistral-Large quality | Fast |
| `meta-llama/Meta-Llama-3.1-70B-Instruct` | 4× A100 80GB | Best quality | Moderate |

**Recommended:** Run Mixtral 8x7B on GPU 0-1 (primary) and Mistral 7B on GPU 2 (for fast classification). This mirrors your current `mistral-large-latest` + `mistral-small-latest` pattern exactly.

### Docker setup (in docker-compose.yml)

```yaml
vllm-large:
  image: vllm/vllm-openai:latest
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=0,1         # GPUs 0 and 1 for Mixtral
    - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
  command: >
    --model mistralai/Mixtral-8x7B-Instruct-v0.1
    --tensor-parallel-size 2
    --max-model-len 32768
    --served-model-name mistral-large-latest
    --host 0.0.0.0
    --port 8000
  ports:
    - "8000:8000"
  volumes:
    - /dgx/models:/root/.cache/huggingface   # Cache models on fast NVMe
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            device_ids: ['0', '1']
            capabilities: [gpu]

vllm-small:
  image: vllm/vllm-openai:latest
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=2
    - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
  command: >
    --model mistralai/Mistral-7B-Instruct-v0.3
    --tensor-parallel-size 1
    --max-model-len 8192
    --served-model-name mistral-small-latest
    --host 0.0.0.0
    --port 8001
  ports:
    - "8001:8001"
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            device_ids: ['2']
            capabilities: [gpu]
```

### Code change in `sas_b/services/mistralClient.js`

```js
// CHANGE: Only the base URL changes. Everything else stays identical.

// BEFORE:
const BASE_URL = 'https://api.mistral.ai/v1';
const HEADERS = {
  'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
  'Content-Type': 'application/json'
};

// AFTER:
const BASE_URL_LARGE = process.env.VLLM_LARGE_URL || 'http://vllm-large:8000/v1';
const BASE_URL_SMALL = process.env.VLLM_SMALL_URL || 'http://vllm-small:8001/v1';

// No Authorization header needed for local vLLM
const HEADERS = { 'Content-Type': 'application/json' };

// Model names stay EXACTLY the same ('mistral-large-latest', 'mistral-small-latest')
// because vLLM is started with --served-model-name matching those names
```

**That's it.** The rest of `mistralClient.js` — circuit breaker, retry logic, streaming, error handling — works unchanged because vLLM implements the OpenAI-compatible `/chat/completions` API exactly.

### New environment variables

```env
VLLM_LARGE_URL=http://vllm-large:8000/v1
VLLM_SMALL_URL=http://vllm-small:8001/v1
# Remove: MISTRAL_API_KEY (no longer needed)
```

---

## 5. Change 2 — Embeddings: HuggingFace API → TEI Server on GPU

### Why TEI (Text Embeddings Inference)

HuggingFace's own embedding server, built in Rust, optimized for throughput:
- **Batching** — accepts arrays of strings, processes in parallel on GPU
- **HTTP API** — drop-in replacement for the HuggingFace Inference API endpoint
- **Same model** — runs `sentence-transformers/all-MiniLM-L6-v2` with identical 384-dim output
- No rate limits. No `await this.sleep(1000)` needed.

### Docker setup

```yaml
tei-embedding:
  image: ghcr.io/huggingface/text-embeddings-inference:cuda-1.5
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=3           # GPU 3 for embeddings
  command: --model-id sentence-transformers/all-MiniLM-L6-v2 --port 8080
  ports:
    - "8080:8080"
  volumes:
    - /dgx/models:/data
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            device_ids: ['3']
            capabilities: [gpu]
```

### Code change in `sas_b/services/embeddingService.js`

```js
// BEFORE — external HuggingFace API with 1s rate limiting:
const response = await fetch(
  `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
    body: JSON.stringify({ inputs: text })
  }
);

// AFTER — local TEI server, same response format, no rate limits:
const TEI_URL = process.env.TEI_URL || 'http://tei-embedding:8080';

// Single embedding
async generateEmbedding(text) {
  const response = await fetch(`${TEI_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: text })
  });
  const result = await response.json();
  return result[0]; // TEI returns [[...384 dims...]]
}

// Batch embedding — REMOVE all sleep() calls, TEI handles concurrency internally
async batchEmbed(texts) {
  const BATCH_SIZE = 128; // TEI handles large batches efficiently on GPU
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await fetch(`${TEI_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: batch })
    });
    const embeddings = await response.json();
    results.push(...embeddings);
    // NO sleep() needed — TEI manages GPU throughput internally
  }
  return results;
}
```

**Performance impact:** 100 document chunks: was 110 seconds → now **under 2 seconds** (GPU batch inference).

### New environment variables

```env
TEI_URL=http://tei-embedding:8080
# Remove: HUGGINGFACE_API_KEY (no longer needed for embeddings)
```

---

## 6. Change 3 — Vector DB: Pinecone → Qdrant

### Why Qdrant

- Written in Rust — fastest self-hosted vector DB available
- Full metadata filtering (`session_id`, `resource_id`) identical to Pinecone's filter syntax
- Docker image is small (~200MB), runs entirely on NVMe SSD
- REST API is well-documented and easy to migrate to
- Free, open-source, no license

### Docker setup

```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
    - "6334:6334"       # gRPC port (optional, faster for batch ops)
  volumes:
    - /dgx/qdrant:/qdrant/storage    # Fast NVMe SSD
  environment:
    - QDRANT__SERVICE__GRPC_PORT=6334
```

### Create collection on first startup (run once)

```bash
curl -X PUT http://localhost:6333/collections/saseduai-educational-resources \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "default_segment_number": 4
    },
    "hnsw_config": {
      "m": 16,
      "ef_construct": 100
    }
  }'
```

### Code change in `sas_b/services/vectorStore.js`

Qdrant's API is slightly different from Pinecone's. The key operations map as follows:

```js
// sas_b/services/vectorStore.js — REPLACE entire file

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'saseduai-educational-resources';

class VectorStore {

  // UPSERT — replaces pinecone index.upsert()
  async upsertChunks(resourceId, chunks, embeddings) {
    const points = chunks.map((chunk, i) => ({
      id: `${resourceId}_chunk_${i}`,   // Qdrant accepts string IDs
      vector: embeddings[i],
      payload: {                         // Qdrant calls metadata "payload"
        resource_id: resourceId,
        session_id: chunk.session_id,
        chunk_index: i,
        text: chunk.text.slice(0, 1000),
        token_count: chunk.token_count,
        page_number: chunk.page_number || null,
        section_title: chunk.section_title || null,
        resource_title: chunk.resource_title,
        file_name: chunk.file_name,
        resource_type: chunk.resource_type
      }
    }));

    // Batch upsert in groups of 100
    for (let i = 0; i < points.length; i += 100) {
      const batch = points.slice(i, i + 100);
      const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch })
      });
      if (!response.ok) throw new Error(`Qdrant upsert failed: ${await response.text()}`);
    }
  }

  // QUERY — replaces pinecone index.query()
  async search(queryEmbedding, sessionId, topK = 8) {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: queryEmbedding,
        limit: topK,
        filter: {
          must: [{ key: 'session_id', match: { value: sessionId } }]
        },
        with_payload: true,
        score_threshold: 0.3   // Ignore results with < 30% similarity
      })
    });

    const data = await response.json();

    // Return in same shape as Pinecone matches for compatibility
    return data.result.map(hit => ({
      id: hit.id,
      score: hit.score,
      metadata: hit.payload
    }));
  }

  // DELETE — replaces pinecone index.deleteMany()
  async deleteByResourceId(resourceId) {
    await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'resource_id', match: { value: resourceId } }]
        }
      })
    });
  }
}

module.exports = new VectorStore();
```

**The `ragService.js` and all callers remain unchanged** — they only call `vectorStore.search()` and `vectorStore.upsertChunks()`, which have the same signature.

### New environment variables

```env
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=saseduai-educational-resources
# Remove: PINECONE_API_KEY, PINECONE_ENVIRONMENT, PINECONE_INDEX
```

---

## 7. Change 4 — Database: Supabase → PostgreSQL + PgBouncer

### Docker setup

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: saseduai
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: saseduai
    # Performance tuning for DGX's large RAM
    POSTGRES_INITDB_ARGS: "--data-checksums"
  command: >
    postgres
    -c max_connections=200
    -c shared_buffers=16GB
    -c effective_cache_size=48GB
    -c work_mem=64MB
    -c maintenance_work_mem=2GB
    -c wal_buffers=64MB
    -c checkpoint_completion_target=0.9
    -c random_page_cost=1.1
    -c effective_io_concurrency=200
  volumes:
    - /dgx/postgres:/var/lib/postgresql/data   # Fast NVMe
    - ./migrations:/docker-entrypoint-initdb.d  # Auto-run on first start
  ports:
    - "5432:5432"

pgbouncer:
  image: bitnami/pgbouncer:latest
  environment:
    POSTGRESQL_HOST: postgres
    POSTGRESQL_PORT: 5432
    POSTGRESQL_USERNAME: saseduai
    POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRESQL_DATABASE: saseduai
    PGBOUNCER_PORT: 6543
    PGBOUNCER_POOL_MODE: transaction        # Transaction pooling = most connections
    PGBOUNCER_MAX_CLIENT_CONN: 1000         # Accept up to 1000 app connections
    PGBOUNCER_DEFAULT_POOL_SIZE: 20         # Maintain 20 real PG connections
    PGBOUNCER_MIN_POOL_SIZE: 5
  ports:
    - "6543:6543"
  depends_on:
    - postgres
```

### Code change in `sas_b/db.js`

```js
// CHANGE: Point to local PgBouncer instead of Supabase pooler

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'pgbouncer',      // Docker service name
  port: parseInt(process.env.DB_PORT) || 6543,   // PgBouncer port
  database: process.env.DB_NAME || 'saseduai',
  user: process.env.DB_USER || 'saseduai',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false                                      // No SSL needed on local network
});

module.exports = { pool };
```

### Migrate Supabase data to local PostgreSQL

```bash
# On dev machine — export from Supabase
pg_dump "postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  --no-owner --no-acl -f supabase_export.sql

# On DGX — import to local PostgreSQL
docker exec -i saradhi_postgres_1 psql -U saseduai saseduai < supabase_export.sql
```

### Remove Supabase client from code

Currently, `sas_b` uses both the `pg` driver AND the `@supabase/supabase-js` client. The Supabase client is used for:
1. File storage operations (see Change 5)
2. Some direct table queries in `routes/ai-assistant.js` and `routes/resources.js`

Replace all `supabase.from('table').select(...)` calls with `pool.query('SELECT ...')`:

```js
// BEFORE (Supabase client style):
const { data, error } = await supabase
  .from('resources')
  .select('id, title, file_url')
  .eq('session_id', sessionId);

// AFTER (pg driver — same as the rest of the codebase):
const result = await pool.query(
  'SELECT id, title, file_url FROM resources WHERE session_id = $1',
  [sessionId]
);
const data = result.rows;
```

### New environment variables

```env
DB_HOST=pgbouncer
DB_PORT=6543
DB_NAME=saseduai
DB_USER=saseduai
DB_PASSWORD=your_strong_password_here
# Remove: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_API_KEY
```

---

## 8. Change 5 — File Storage: Supabase Storage → MinIO

### Why MinIO

MinIO implements the **AWS S3 API exactly**. The Supabase Storage SDK internally uses S3 API calls. By switching to MinIO's S3-compatible endpoint, the code change is minimal.

### Docker setup

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
  ports:
    - "9000:9000"     # S3 API
    - "9001:9001"     # MinIO web console (admin UI)
  volumes:
    - /dgx/storage:/data    # Point to DGX bulk storage (HDD or SSD)
```

### Create bucket on first startup (run once)

```bash
# Install MinIO client
docker run -it --rm --network saradhi_default \
  minio/mc alias set local http://minio:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY && \
  mc mb local/session-resources && \
  mc anonymous set download local/session-resources
```

### Code change in `sas_b/config/supabase.js` (or create `sas_b/config/storage.js`)

Replace the Supabase storage client with an S3 client pointing at MinIO:

```js
// sas_b/config/storage.js — NEW FILE (replaces Supabase storage usage)
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  region: 'us-east-1',           // MinIO ignores this, but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  },
  forcePathStyle: true            // REQUIRED for MinIO — uses /bucket/key not bucket.host/key
});

const BUCKET = process.env.STORAGE_BUCKET || 'session-resources';

// Upload file
async function uploadFile(filePath, buffer, mimeType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: filePath,
    Body: buffer,
    ContentType: mimeType
  }));
  return `${process.env.MINIO_PUBLIC_URL}/${BUCKET}/${filePath}`;
}

// Get public URL (MinIO serves files publicly if bucket policy allows)
function getPublicUrl(filePath) {
  return `${process.env.MINIO_PUBLIC_URL}/${BUCKET}/${filePath}`;
}

// Download file (returns Buffer)
async function downloadFile(filePath) {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: filePath }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Delete file
async function deleteFile(filePath) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: filePath }));
}

// Signed upload URL (for direct browser uploads — see REDesign PLan.md Change 5)
async function getSignedUploadUrl(filePath, expiresIn = 300) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: filePath }), { expiresIn });
}

module.exports = { uploadFile, getPublicUrl, downloadFile, deleteFile, getSignedUploadUrl };
```

### Update `sas_b/routes/resources.js`

```js
// REPLACE all supabase.storage calls with the new storage module:
const storage = require('../config/storage');

// BEFORE:
const { data, error } = await supabase.storage
  .from('session-resources')
  .upload(filePath, file.buffer, { contentType: file.mimetype });

// AFTER:
const publicUrl = await storage.uploadFile(filePath, file.buffer, file.mimetype);
```

Install the AWS SDK (lighter than Supabase client for just storage):

```bash
cd sas_b
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### New environment variables

```env
MINIO_ENDPOINT=http://minio:9000
MINIO_PUBLIC_URL=https://your-dgx-domain.sastra.edu/files  # Via Nginx proxy
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
STORAGE_BUCKET=session-resources
# Remove: SUPABASE_URL, SUPABASE_SERVICE_KEY for storage purposes
```

---

## 9. Change 6 — Cache & Queue: Upstash → Self-Hosted Redis

### Docker setup

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --maxmemory 16gb
    --maxmemory-policy allkeys-lru
    --appendonly yes
    --appendfsync everysec
    --save 900 1
    --save 300 10
  ports:
    - "6379:6379"
  volumes:
    - /dgx/redis:/data     # Persist to NVMe for fast recovery
```

### Code change in `sas_b/redis.js`

```js
// CHANGE: Remove Upstash URL, point to local Redis

const Redis = require('ioredis');

// BEFORE (Upstash):
// const redis = new Redis(process.env.REDIS_URL); // wss://... upstash.io

// AFTER (local Docker):
const redisConfig = {
  host: process.env.REDIS_HOST || 'redis',    // Docker service name
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,  // Optional for local
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true
};

const redis = new Redis(redisConfig);
const redisPub = new Redis(redisConfig);
const redisSub = new Redis(redisConfig);

module.exports = { redis, redisPub, redisSub };
```

### New environment variables

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=   # Leave empty for local, or set a password for security
# Remove: REDIS_URL (Upstash format no longer needed)
```

---

## 10. Change 7 — Reverse Proxy: Nginx

Nginx sits in front of everything. It handles SSL, serves the React frontend, and routes API/WebSocket traffic to Node.js. MinIO files are also proxied through Nginx.

### `nginx/nginx.conf`

```nginx
upstream nodejs {
    server sas_b:3001;
    keepalive 64;
}

upstream minio {
    server minio:9000;
}

server {
    listen 80;
    server_name your-dgx-domain.sastra.edu;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-dgx-domain.sastra.edu;

    # SSL — use SASTRA's certificate or Let's Encrypt
    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # React frontend — served as static files
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;   # SPA fallback routing

        # Cache static assets with content hash in filename
        location ~* \.(js|css|png|jpg|ico|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://nodejs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;    # Allow long AI requests
    }

    # Auth routes
    location /auth/ {
        proxy_pass http://nodejs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # WebSocket
    location /ws {
        proxy_pass http://nodejs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;    # Keep WS alive for 1 hour
        proxy_send_timeout 3600s;
    }

    # MinIO file storage (proxied — hides internal MinIO address)
    location /files/ {
        proxy_pass http://minio/session-resources/;
        proxy_set_header Host $host;
        proxy_buffering off;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### Docker setup

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/ssl:/etc/nginx/ssl:ro
    - ./frontend_build:/usr/share/nginx/html:ro   # Built React app
  depends_on:
    - sas_b
    - minio
```

---

## 11. Full Docker Compose Stack

### `docker-compose.yml` (Production)

```yaml
version: '3.9'

services:

  # ─── AI Inference ─────────────────────────────────────────────────────────
  vllm-large:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    restart: unless-stopped
    volumes:
      - /dgx/models:/root/.cache/huggingface
    command: >
      --model mistralai/Mixtral-8x7B-Instruct-v0.1
      --tensor-parallel-size 2
      --max-model-len 32768
      --served-model-name mistral-large-latest
      --host 0.0.0.0 --port 8000
    environment:
      - NVIDIA_VISIBLE_DEVICES=0,1
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['0','1']
              capabilities: [gpu]

  vllm-small:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    restart: unless-stopped
    volumes:
      - /dgx/models:/root/.cache/huggingface
    command: >
      --model mistralai/Mistral-7B-Instruct-v0.3
      --tensor-parallel-size 1
      --max-model-len 8192
      --served-model-name mistral-small-latest
      --host 0.0.0.0 --port 8001
    environment:
      - NVIDIA_VISIBLE_DEVICES=2
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['2']
              capabilities: [gpu]

  tei-embedding:
    image: ghcr.io/huggingface/text-embeddings-inference:cuda-1.5
    runtime: nvidia
    restart: unless-stopped
    volumes:
      - /dgx/models:/data
    command: --model-id sentence-transformers/all-MiniLM-L6-v2 --port 8080
    environment:
      - NVIDIA_VISIBLE_DEVICES=3
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['3']
              capabilities: [gpu]

  # ─── Databases ────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: saseduai
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: saseduai
    command: >
      postgres
      -c max_connections=200
      -c shared_buffers=16GB
      -c effective_cache_size=48GB
      -c work_mem=64MB
    volumes:
      - /dgx/postgres:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  pgbouncer:
    image: bitnami/pgbouncer:latest
    restart: unless-stopped
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_USERNAME: saseduai
      POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRESQL_DATABASE: saseduai
      PGBOUNCER_PORT: 6543
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 1000
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
    depends_on:
      - postgres

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --maxmemory 16gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - /dgx/redis:/data

  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    ports:
      - "6333:6333"
    volumes:
      - /dgx/qdrant:/qdrant/storage

  # ─── File Storage ─────────────────────────────────────────────────────────
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    ports:
      - "9001:9001"    # Admin console (internal only)
    volumes:
      - /dgx/storage:/data

  # ─── Application ──────────────────────────────────────────────────────────
  sas_b:
    build:
      context: ./sas_b
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      DB_HOST: pgbouncer
      DB_PORT: 6543
      DB_NAME: saseduai
      DB_USER: saseduai
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      QDRANT_URL: http://qdrant:6333
      VLLM_LARGE_URL: http://vllm-large:8000/v1
      VLLM_SMALL_URL: http://vllm-small:8001/v1
      TEI_URL: http://tei-embedding:8080
      MINIO_ENDPOINT: http://minio:9000
      MINIO_PUBLIC_URL: https://your-dgx-domain.sastra.edu/files
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
      STORAGE_BUCKET: session-resources
      JWT_SECRET: ${JWT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      FRONTEND_URL: https://your-dgx-domain.sastra.edu
      GOOGLE_CLIENT_ID_EDU: ${GOOGLE_CLIENT_ID_EDU}
      GOOGLE_CLIENT_SECRET_EDU: ${GOOGLE_CLIENT_SECRET_EDU}
      GOOGLE_CLIENT_ID_ACIN: ${GOOGLE_CLIENT_ID_ACIN}
      GOOGLE_CLIENT_SECRET_ACIN: ${GOOGLE_CLIENT_SECRET_ACIN}
      GOOGLE_CALLBACK_URL_EDU: https://your-dgx-domain.sastra.edu/auth/google/callback/edu
      GOOGLE_CALLBACK_URL_ACIN: https://your-dgx-domain.sastra.edu/auth/google/callback/acin
    depends_on:
      - pgbouncer
      - redis
      - qdrant
      - vllm-large
      - vllm-small
      - tei-embedding
      - minio

  # ─── Reverse Proxy ────────────────────────────────────────────────────────
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./frontend_build:/usr/share/nginx/html:ro
    depends_on:
      - sas_b
      - minio
```

---

## 12. Code Changes Required

### Summary of all files to change

| File | Change | Effort |
|---|---|---|
| `sas_b/db.js` | Point to local PgBouncer, disable SSL | 5 min |
| `sas_b/redis.js` | Use host/port instead of Upstash URL | 5 min |
| `sas_b/services/mistralClient.js` | Change base URL to local vLLM | 10 min |
| `sas_b/services/embeddingService.js` | Point to TEI, remove rate limiting sleep() | 20 min |
| `sas_b/services/vectorStore.js` | Rewrite for Qdrant REST API | 2 hr |
| `sas_b/config/storage.js` | New file: S3 client pointing at MinIO | 1 hr |
| `sas_b/routes/resources.js` | Replace supabase.storage calls with storage module | 1 hr |
| `sas_b/routes/ai-assistant.js` | Replace supabase.from() with pool.query() | 2 hr |
| `sas_b/config/supabase.js` | Remove or keep only if needed for legacy | 30 min |
| `SAS-EDU-AI_F/.env.production` | Update API_URL to DGX domain | 5 min |

### `sas_b/Dockerfile.prod` — new file

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Run with PM2 cluster mode (uses all CPU cores)
RUN npm install -g pm2

EXPOSE 3001

CMD ["pm2-runtime", "ecosystem.config.js"]
```

### `sas_b/ecosystem.config.js` — PM2 cluster config

```js
module.exports = {
  apps: [{
    name: 'sas_b',
    script: 'server.js',
    instances: 'max',        // One process per CPU core
    exec_mode: 'cluster',
    max_memory_restart: '4G',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/sas_b/error.log',
    out_file: '/var/log/sas_b/out.log',
  }]
};
```

### Build and deploy frontend

```bash
# On dev machine or CI
cd SAS-EDU-AI_F
REACT_APP_API_URL=https://your-dgx-domain.sastra.edu/api \
REACT_APP_AUTH_URL=https://your-dgx-domain.sastra.edu \
REACT_APP_WS_URL=wss://your-dgx-domain.sastra.edu \
CI=false npm run build

# Copy build output to DGX
rsync -avz build/ user@dgx:/app/frontend_build/
```

---

## 13. Environment Variables

### `.env.production` (on DGX — never commit this file)

```env
# ─── Node ─────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3001

# ─── Database (local PostgreSQL via PgBouncer) ────────────────────────────
DB_HOST=pgbouncer
DB_PORT=6543
DB_NAME=saseduai
DB_USER=saseduai
DB_PASSWORD=CHANGE_THIS_STRONG_PASSWORD

# ─── Redis (local) ────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# ─── Vector DB (local Qdrant) ─────────────────────────────────────────────
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=saseduai-educational-resources

# ─── LLM (local vLLM on GPU) ─────────────────────────────────────────────
VLLM_LARGE_URL=http://vllm-large:8000/v1
VLLM_SMALL_URL=http://vllm-small:8001/v1

# ─── Embeddings (local TEI on GPU) ────────────────────────────────────────
TEI_URL=http://tei-embedding:8080

# ─── File Storage (local MinIO) ───────────────────────────────────────────
MINIO_ENDPOINT=http://minio:9000
MINIO_PUBLIC_URL=https://YOUR_DGX_DOMAIN.sastra.edu/files
MINIO_ACCESS_KEY=CHANGE_THIS_ACCESS_KEY
MINIO_SECRET_KEY=CHANGE_THIS_SECRET_KEY
STORAGE_BUCKET=session-resources

# ─── JWT / Session ────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_THIS_LONG_RANDOM_STRING_64_CHARS
SESSION_SECRET=CHANGE_THIS_LONG_RANDOM_STRING_64_CHARS

# ─── Google OAuth (stays the same — Google handles this externally) ────────
GOOGLE_CLIENT_ID_EDU=your_edu_client_id
GOOGLE_CLIENT_SECRET_EDU=your_edu_client_secret
GOOGLE_CLIENT_ID_ACIN=your_acin_client_id
GOOGLE_CLIENT_SECRET_ACIN=your_acin_client_secret
GOOGLE_CALLBACK_URL_EDU=https://YOUR_DGX_DOMAIN.sastra.edu/auth/google/callback/edu
GOOGLE_CALLBACK_URL_ACIN=https://YOUR_DGX_DOMAIN.sastra.edu/auth/google/callback/acin

# ─── Frontend URL ─────────────────────────────────────────────────────────
FRONTEND_URL=https://YOUR_DGX_DOMAIN.sastra.edu

# ─── HuggingFace Hub Token (for downloading models — only during first pull) ─
HF_TOKEN=hf_your_token_here

# ─── REMOVED (no longer needed in production) ─────────────────────────────
# MISTRAL_API_KEY          → replaced by vLLM
# HUGGINGFACE_API_KEY      → replaced by TEI server
# PINECONE_API_KEY         → replaced by Qdrant
# PINECONE_ENVIRONMENT     → replaced by Qdrant
# PINECONE_INDEX           → replaced by Qdrant collection name
# SUPABASE_URL             → replaced by local PostgreSQL
# SUPABASE_ANON_KEY        → replaced by local PostgreSQL
# SUPABASE_SERVICE_KEY     → replaced by local PostgreSQL
# SUPABASE_API_KEY         → replaced by local PostgreSQL
```

---

## 14. Deployment Procedure

### First-time setup on DGX

```bash
# 1. Create directory structure on DGX fast NVMe
sudo mkdir -p /dgx/{postgres,redis,qdrant,models,storage}
sudo chown -R $USER:$USER /dgx/

# 2. Install Docker and NVIDIA Container Toolkit
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker

# 3. Copy project to DGX
rsync -avz --exclude node_modules --exclude .git \
  /path/to/SARADHI/ user@dgx:/app/saradhi/

# 4. Create .env.production with all variables above
cd /app/saradhi && nano .env.production

# 5. First-time model download (only happens once — cached at /dgx/models)
# This downloads Mixtral 8x7B (~90GB) and Mistral 7B (~14GB)
docker compose -f docker-compose.yml --env-file .env.production up vllm-large
# Wait for "Uvicorn running on http://0.0.0.0:8000" in logs
# Then: Ctrl+C (model is now cached on disk)

# 6. Build React frontend
cd SAS-EDU-AI_F
REACT_APP_API_URL=https://YOUR_DGX_DOMAIN.sastra.edu/api \
REACT_APP_AUTH_URL=https://YOUR_DGX_DOMAIN.sastra.edu \
REACT_APP_WS_URL=wss://YOUR_DGX_DOMAIN.sastra.edu \
CI=false npm run build
cp -r build/ /app/saradhi/frontend_build/

# 7. Create Qdrant collection
docker compose up qdrant -d
sleep 5
curl -X PUT http://localhost:6333/collections/saseduai-educational-resources \
  -H 'Content-Type: application/json' \
  -d '{"vectors": {"size": 384, "distance": "Cosine"}}'

# 8. Create MinIO bucket
docker compose up minio -d
sleep 5
docker run --rm --network saradhi_default minio/mc \
  alias set local http://minio:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker run --rm --network saradhi_default minio/mc \
  mb local/session-resources
docker run --rm --network saradhi_default minio/mc \
  anonymous set download local/session-resources

# 9. Import database from Supabase
pg_dump "YOUR_SUPABASE_CONNECTION_STRING" --no-owner --no-acl -f backup.sql
docker compose up postgres pgbouncer -d
sleep 10
docker exec -i saradhi_postgres_1 psql -U saseduai saseduai < backup.sql

# 10. Start everything
docker compose --env-file .env.production up -d

# 11. Verify health
curl https://YOUR_DGX_DOMAIN.sastra.edu/api/health
```

### Update/redeploy procedure

```bash
cd /app/saradhi

# Pull latest code
git pull origin main

# Rebuild backend (no GPU restart needed for most changes)
docker compose build sas_b
docker compose up -d sas_b  # Zero-downtime with PM2 cluster

# If frontend changed — rebuild and copy
cd SAS-EDU-AI_F && CI=false npm run build
cp -r build/ /app/saradhi/frontend_build/
docker compose exec nginx nginx -s reload  # Reload without downtime
```

---

## 15. Cost Comparison

### Ongoing monthly cost

| Service | Development (Cloud) | Production (DGX) |
|---|---|---|
| Mistral API (LLM) | $15–50/mo (token-based) | **$0** (local GPU) |
| HuggingFace API (embeddings) | $9/mo (pro inference) | **$0** (local GPU) |
| Pinecone (vector DB) | $0–70/mo (pod-based) | **$0** (local SSD) |
| Supabase (DB + Storage) | $25/mo (pro tier) | **$0** (local disk) |
| Upstash Redis | $10/mo | **$0** (local RAM) |
| Render (backend hosting) | $14/mo | **$0** (local server) |
| Vercel (frontend) | $0 (hobby) | **$0** (Nginx) |
| **Total** | **~$73–158/mo** | **$0/mo** |

### One-time compute cost

All compute runs on existing DGX hardware provided by SASTRA University. No additional purchase required.

- **Electricity:** ~6kW load for full stack (DGX A100 TDP is 6.5kW). SASTRA absorbs this.
- **Storage:** NVMe for DB/models (~2TB used), HDD for uploaded files (~grows with usage)
- **Bandwidth:** Internal campus network only. No external bandwidth costs.

### What stays external (can't run locally)

| Service | Why it stays external | Cost |
|---|---|---|
| **Google OAuth** | Google's identity provider — cannot be replaced | $0 (free) |
| **Cloudinary** (if used for images) | Could be replaced with MinIO but low priority | $0 (free tier) |
| **GPU transcription server** | Already on a separate server per existing config | Existing |

---

*Prepared 2026-03-26. Assumes NVIDIA DGX A100 server available at SASTRA University with Ubuntu 22.04 OS and Docker installed. Adjust GPU device IDs based on actual DGX configuration.*
