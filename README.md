# AI Job-Candidate Matching System

An AI-powered job-candidate matching system built with NestJS that uses LLM agents to intelligently match job descriptions with candidate CVs using both semantic search and SQL queries.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NestJS Application                            │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│  /candidate/*   │   /job-offer/*  │         Direct Processing       │
│  - POST /load   │   - POST /match │      (No queuing needed)        │
│  - POST /load_  │   - GET /       │                                 │
│    folder       │   - GET /:id    │                                 │
│  - GET /        │                 │                                 │
│  - GET /:id     │                 │                                 │
├─────────────────┴─────────────────┴─────────────────────────────────┤
│                       OrchestratorAgent                              │
│    Routes tasks to appropriate worker agents                         │
├──────────────────────────┬──────────────────────────────────────────┤
│  CandidateIngestionAgent │         JobProcessingAgent               │
│                          │  ┌────────────────────────────────────┐  │
│  - Parse PDF             │  │ Tools:                             │  │
│  - Extract data (LLM)    │  │ - PostgresQueryTool (SQL search)   │  │
│  - Generate summary      │  │ - VectorSearchTool (semantic)      │  │
│  - Create embeddings     │  │ - MatchingGradeTool (scoring)      │  │
│  - Store in DB + Vector  │  └────────────────────────────────────┘  │
└──────────────────────────┴──────────────────────────────────────────┘
              │                       │
         ┌────┴────┐            ┌─────┴─────┐
         │ Qdrant  │            │ PostgreSQL│
         │ :6333   │            │   :5432   │
         │ (Vector)│            │   (SQL)   │
         └─────────┘            └───────────┘
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | NestJS + TypeScript |
| **LLM** | Llama 3.1 8B Instruct (via Hugging Face Inference API) |
| **Embeddings** | BAAI/bge-small-en-v1.5 (384 dimensions) |
| **Vector Database** | Qdrant |
| **Relational Database** | PostgreSQL |
| **PDF Processing** | pdf-parse |
| **Containerization** | Docker Compose |

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.x
- **pnpm** >= 8.x
- **Docker** & **Docker Compose**
- **Hugging Face Account** with API token

### Hugging Face Setup

1. Create an account at [huggingface.co](https://huggingface.co)
2. Accept the Llama 3.1 license at [meta-llama/Llama-3.1-8B-Instruct](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
3. Generate an API token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

## 🚀 Quick Start

### 1. Clone and Install

```bash
# Navigate to project directory
cd "Project 4"

# Install dependencies
pnpm install
```

### 2. Configure Environment

```bash
# Copy example environment file
copy .env.example .env

# Edit .env and add your Hugging Face token
# HF_TOKEN=hf_your_token_here
```

### 3. Start Services

```bash
# Start all Docker containers (PostgreSQL, Qdrant)
pnpm run docker:up

# Wait for services to be healthy, then start the application
pnpm run start:dev

# OR start everything at once
pnpm run start:all
```

### 4. Verify Installation

```bash
# Check if services are running
pnpm run docker:ps

# Application should be running at:
# http://localhost:3000/api
```

## 📦 PNPM Scripts Reference

| Script | Description |
|--------|-------------|
| `pnpm run start:dev` | Start NestJS in development mode with hot reload |
| `pnpm run start:prod` | Start NestJS in production mode |
| `pnpm run start:all` | Start Docker containers + NestJS app |
| `pnpm run docker:up` | Start all Docker containers in background |
| `pnpm run docker:down` | Stop and remove all Docker containers |
| `pnpm run docker:stop` | Stop Docker containers (preserve data) |
| `pnpm run docker:logs` | Follow logs from all containers |
| `pnpm run docker:ps` | Show status of Docker containers |
| `pnpm run docker:clean` | Stop containers and remove volumes (⚠️ deletes data) |
| `pnpm run build` | Build the application |
| `pnpm run test` | Run tests |

## 🔌 API Reference

### Base URL
```
http://localhost:3000/api
```

---

### Candidate Endpoints

#### Upload Single CV
```http
POST /api/candidate/load
Content-Type: multipart/form-data

file: <PDF file>
```

**Response:**
```json
{
  "success": true,
  "candidateId": "uuid-here",
  "message": "CV processed successfully. Candidate ID: uuid-here"
}
```

#### Process Folder of CVs
```http
POST /api/candidate/load_folder
Content-Type: application/json

{
  "folderPath": "C:/path/to/cvs"
}
```

**Response:**
```json
{
  "success": true,
  "batchId": "batch-1703123456789",
  "totalFiles": 10,
  "jobIds": ["uuid-1", "uuid-2", "..."],
  "message": "Processed 8 CVs successfully. 2 failed."
}
```

#### List Candidates
```http
GET /api/candidate?page=1&limit=20
```

#### Get Candidate Details
```http
GET /api/candidate/:id
```

#### Get Candidate Statistics
```http
GET /api/candidate/stats
```

**Response:**
```json
{
  "total": 100,
  "active": 95,
  "pending": 3,
  "failed": 2
}
```

#### Delete Candidate
```http
DELETE /api/candidate/:id
```

---

### Job Offer Endpoints

#### Match Candidates to Job
```http
POST /api/job-offer/match
Content-Type: multipart/form-data

file: <Job Description PDF>
```

**Response:**
```json
{
  "success": true,
  "message": "Found 5 matching candidates",
  "job": {
    "id": "job-uuid",
    "title": "Senior Software Engineer",
    "company": "Tech Corp",
    "location": "New York",
    "requirements": ["TypeScript", "React", "Node.js"]
  },
  "candidates": [
    {
      "candidateId": "candidate-uuid-1",
      "name": "John Doe",
      "email": "john@example.com",
      "matchScore": 100,
      "matchSources": ["sql", "vector"],
      "matchDetails": {
        "sqlMatch": true,
        "vectorMatch": true,
        "vectorScore": 0.89
      },
      "skills": ["TypeScript", "React", "Node.js", "PostgreSQL"],
      "experienceYears": 5,
      "summary": "Full-stack developer with 5 years experience..."
    }
  ],
  "searchMetadata": {
    "sqlMatchCount": 12,
    "vectorMatchCount": 8,
    "dualMatchCount": 3
  }
}
```

#### List Jobs
```http
GET /api/job-offer?page=1&limit=20
```

#### Get Job Details
```http
GET /api/job-offer/:id
```

#### Get Job Statistics
```http
GET /api/job-offer/stats
```

#### Close Job
```http
PATCH /api/job-offer/:id/close
```

#### Delete Job
```http
DELETE /api/job-offer/:id
```

---

### Queue Endpoints

#### Get Pending Jobs
```http
GET /api/queue/pending
```

**Response:**
```json
{
  "count": 5,
  "jobIds": ["job-1", "job-2", "job-3", "job-4", "job-5"]
}
```

#### Get Job Status
```http
GET /api/queue/status/:jobId
```

**Response:**
```json
{
  "id": "job-1",
  "status": "active",
  "progress": 60,
  "data": {
    "filePath": "/path/to/cv.pdf",
    "fileName": "cv.pdf"
  }
}
```

#### Get Queue Overview
```http
GET /api/queue/overview
```

**Response:**
```json
{
  "pending": { "count": 5, "jobIds": ["..."] },
  "active": { "count": 1, "jobIds": ["..."] },
  "completed": { "count": 100, "jobIds": ["..."] },
  "failed": { "count": 2, "jobIds": ["..."] }
}
```

---

## 🤖 Agent Architecture

### OrchestratorAgent
The main coordinator that receives requests and delegates to appropriate worker agents:
- Routes `/candidate/*` requests to `CandidateIngestionAgent`
- Routes `/job-offer/*` requests to `JobProcessingAgent`
- Aggregates results and handles errors

### CandidateIngestionAgent
Processes CV files through a pipeline:
1. **Parse PDF** - Extract text from PDF using pdf-parse
2. **LLM Extraction** - Use Llama 3.1 to extract structured data (name, email, skills, experience, education)
3. **Generate Summary** - Create a search-optimized summary for semantic search
4. **Create Embedding** - Generate 384-dim embedding using BGE model
5. **Dual Storage** - Save to PostgreSQL (structured data) and Qdrant (vector embedding)

### JobProcessingAgent
Processes job descriptions and finds matching candidates:
1. **Parse Job PDF** - Extract text from job description
2. **LLM Extraction** - Extract structured requirements
3. **Dual Search**:
   - **SQL Query** - Find candidates by skills, experience, location
   - **Vector Search** - Find semantically similar candidates
4. **Score Calculation** - Combine results with matching grade
   - Candidates found in BOTH searches get score = 100
   - Others are scored based on vector similarity and SQL match

### Tools

| Tool | Description |
|------|-------------|
| `PostgresQueryTool` | Queries candidates from PostgreSQL using TypeORM with filters for skills, experience, location |
| `VectorSearchTool` | Performs semantic search in Qdrant using BGE embeddings |
| `MatchingGradeTool` | Calculates final match score; dual-match = 100, otherwise weighted combination |

---

## 📊 Matching Score Logic

```
IF candidate found in SQL AND Vector search:
    score = 100 (perfect match)
ELSE:
    score = weighted_combination(
        sql_match: 70 points if matched,
        vector_score: 0-80 points based on similarity,
        llm_grade: 0-50 points (optional)
    )
    score = min(99, normalized_score)  # 100 reserved for dual-match
```

---

## 🐳 Docker Services

| Service | Port | Volume | Description |
|---------|------|--------|-------------|
| PostgreSQL | 5432 | `postgres_data` | Relational database for candidates and jobs |
| Qdrant | 6333 | `qdrant_data` | Vector database for semantic search |

### Persistent Volumes
All data is persisted in named Docker volumes. To completely reset:
```bash
npm run docker:clean
```

---

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Application port | `3000` |
| `HF_TOKEN` | Hugging Face API token | **Required** |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database | `job_matching` |
| `QDRANT_HOST` | Qdrant host | `localhost` |
| `QDRANT_PORT` | Qdrant port | `6333` |
| `LLM_MODEL` | Hugging Face LLM model | `meta-llama/Llama-3.1-8B-Instruct` |
| `EMBEDDING_MODEL` | Embedding model | `BAAI/bge-small-en-v1.5` |
| `MAX_CANDIDATES_RETURN` | Max candidates in match results | `5` |
| `DUAL_MATCH_SCORE` | Score for dual SQL+Vector match | `100` |

---

## 🔍 Troubleshooting

### Docker Issues

**Containers not starting:**
```bash
# Check container logs
npm run docker:logs

# Restart containers
npm run docker:down
npm run docker:up
```

**Port already in use:**
```bash
# Check what's using the port
netstat -ano | findstr :5432
# Kill the process or change port in .env
```

### Hugging Face Issues

**401 Unauthorized:**
- Check that your `HF_TOKEN` is valid
- Ensure you've accepted the Llama 3.1 license

**Model loading slow:**
- First request may take 20-60 seconds (cold start)
- Subsequent requests will be faster

### Database Issues

**Connection refused:**
```bash
# Ensure PostgreSQL container is running
docker ps | findstr postgres

# Check PostgreSQL logs
docker logs job-matching-postgres
```

---

## 📁 Project Structure

```
src/
├── main.ts                     # Application entry point
├── app.module.ts               # Root module
├── common/
│   ├── dto/                    # Data Transfer Objects
│   └── interfaces/             # TypeScript interfaces
├── database/
│   ├── database.module.ts      # TypeORM configuration
│   └── entities/               # Database entities
│       ├── candidate.entity.ts
│       └── job.entity.ts
├── vector/
│   ├── vector.module.ts        # Qdrant configuration
│   └── vector.service.ts       # Qdrant operations
├── candidate/
│   ├── candidate.module.ts
│   ├── candidate.controller.ts
│   └── candidate.service.ts
├── job-offer/
│   ├── job-offer.module.ts
│   ├── job-offer.controller.ts
│   └── job-offer.service.ts
└── agents/
    ├── agents.module.ts
    ├── orchestrator.agent.ts   # Main orchestrator
    ├── candidate-ingestion.agent.ts
    ├── job-processing.agent.ts
    ├── services/
    │   ├── llm.service.ts      # Hugging Face LLM
    │   ├── embedding.service.ts # BGE embeddings
    │   └── pdf-parser.service.ts
    └── tools/
        ├── postgres-query.tool.ts
        ├── vector-search.tool.ts
        └── matching-grade.tool.ts
```

---

## 📝 License

MIT

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
