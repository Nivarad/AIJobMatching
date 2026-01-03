# 🤖 AI Job-Candidate Matching System

An intelligent job-candidate matching system built with **NestJS** that leverages **Large Language Models (LLMs)**, **Retrieval Augmented Generation (RAG)**, and a **multi-agent architecture** to intelligently match job descriptions with candidate CVs.

---

## 🖼️ System Overview Infographic

![How an AI Job Matching Engine Works](./infographic.png)

*The infographic above illustrates the complete flow: from PDF ingestion through LLM extraction, dual storage (SQL + Vector), dual-search matching strategy, multi-factor scoring algorithm, to final ranked results delivery.*

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
  - [System Architecture](#system-architecture)
  - [Agentic Architecture](#agentic-architecture)
  - [RAG Pipeline](#rag-pipeline)
- [Technology Stack](#-technology-stack)
- [Models and Methods](#-models-and-methods)
  - [Google Gemini 2.5 Flash Lite](#google-gemini-25-flash-lite)
  - [Text Embedding Model](#text-embedding-model)
  - [RAG with Qdrant](#rag-with-qdrant)
  - [Dual Search Strategy](#dual-search-strategy)
  - [Sophisticated Scoring Algorithm](#sophisticated-scoring-algorithm)
- [Dataset Description](#-dataset-description)
- [Setup Instructions](#-setup-instructions)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Application](#running-the-application)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Deliverables](#-deliverables)
- [Authors](#-authors)

---

## 🎯 Overview

This project implements an AI-powered job matching system that automatically:
1. **Ingests CVs/Resumes** from PDF files and extracts structured information
2. **Processes Job Descriptions** to understand requirements
3. **Matches Candidates to Jobs** using semantic similarity and structured queries
4. **Ranks Candidates** with a sophisticated multi-factor scoring algorithm

The system uses a **multi-agent architecture** where specialized agents handle different tasks, coordinated by an orchestrator agent.

---

## ✨ Features

- **📄 PDF Processing**: Automatic extraction of text from CV and job description PDFs
- **🧠 LLM-Powered Extraction**: Uses Google Gemini 2.5 Flash Lite for structured data extraction
- **🔍 Dual Search Strategy**: Combines SQL queries with semantic vector search
- **📊 Sophisticated Scoring**: Multi-factor weighted scoring algorithm
- **🚀 RESTful API**: Full CRUD operations with Swagger documentation
- **🐳 Docker Support**: Easy deployment with Docker Compose
- **📈 Scalable Architecture**: Modular design with NestJS

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NestJS Application                                 │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   /api/candidate/*  │   /api/job-offer/*  │        Swagger Docs             │
│   ─────────────────│─────────────────────│─────────────────────────────────│
│   POST /load        │   POST /match       │        /docs                    │
│   POST /load_folder │   POST /match-path  │                                 │
│   GET /             │   GET /             │                                 │
│   GET /:id          │   GET /:id          │                                 │
│   DELETE /:id       │   DELETE /:id       │                                 │
├─────────────────────┴─────────────────────┴─────────────────────────────────┤
│                           Service Layer                                      │
│          CandidateService              JobOfferService                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                         AGENTIC LAYER                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      OrchestratorAgent                               │   │
│   │                    (Central Task Router)                             │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │                                             │
│           ┌────────────────────┴────────────────────┐                       │
│           ▼                                         ▼                       │
│   ┌───────────────────────┐              ┌───────────────────────┐          │
│   │ CandidateIngestion    │              │   JobProcessing       │          │
│   │      Agent            │              │      Agent            │          │
│   │                       │              │                       │          │
│   │ • Parse PDFs          │              │ • Parse PDFs          │          │
│   │ • Extract data (LLM)  │              │ • Extract data (LLM)  │          │
│   │ • Generate embeddings │              │ • Execute dual search │          │
│   │ • Store to DB         │              │ • Calculate scores    │          │
│   └───────────────────────┘              └───────────────────────┘          │
├─────────────────────────────────────────────────────────────────────────────┤
│                            TOOLS LAYER                                       │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐     │
│   │ PostgresQuery   │  │  VectorSearch   │  │    MatchingGrade        │     │
│   │     Tool        │  │     Tool        │  │       Tool              │     │
│   │                 │  │                 │  │                         │     │
│   │ SQL filtering   │  │ Semantic search │  │ Sophisticated scoring   │     │
│   │ by skills, exp  │  │ via Qdrant      │  │ with weighted factors   │     │
│   └─────────────────┘  └─────────────────┘  └─────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────────┤
│                          SERVICES LAYER                                      │
│                                                                              │
│   ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────────┐     │
│   │ LLMService  │    │ EmbeddingService│    │   PdfParserService      │     │
│   │             │    │                 │    │                         │     │
│   │ Gemini 2.5  │    │ text-embedding  │    │   pdf-parse library     │     │
│   │ Flash Lite  │    │    -004         │    │                         │     │
│   └─────────────┘    └─────────────────┘    └─────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                                           │
│                                                                              │
│         ┌─────────────────────┐         ┌─────────────────────┐             │
│         │     PostgreSQL      │         │       Qdrant        │             │
│         │     (Port 5432)     │         │     (Port 6333)     │             │
│         │                     │         │                     │             │
│         │ • Candidates table  │         │ • candidates        │             │
│         │ • Jobs table        │         │   collection        │             │
│         │ • JSONB fields      │         │ • jobs collection   │             │
│         │ • Indexed queries   │         │ • 768-dim vectors   │             │
│         └─────────────────────┘         └─────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agentic Architecture

The system employs a **multi-agent architecture** with three main agents:

#### 1. OrchestratorAgent (Central Coordinator)
- **Role**: Task router and coordinator
- **Responsibilities**:
  - Receives tasks from API controllers
  - Routes tasks to appropriate worker agents
  - Handles errors and aggregates results
- **Supported Tasks**: `ingest_cv`, `ingest_folder`, `match_job`

#### 2. CandidateIngestionAgent (CV Processing)
- **Role**: Process CVs/resumes and store candidate data
- **Pipeline**:
  1. Parse PDF → Extract raw text
  2. LLM Extraction → Structured data (name, skills, experience)
  3. Summary Generation → Search-optimized summary
  4. Embedding Generation → 768-dimensional vector
  5. Dual Storage → PostgreSQL + Qdrant

#### 3. JobProcessingAgent (Job Matching)
- **Role**: Process job descriptions and find matching candidates
- **Pipeline**:
  1. Parse PDF → Extract job requirements
  2. LLM Extraction → Structured requirements
  3. Save Job → PostgreSQL + Qdrant
  4. Dual Search → SQL + Vector search
  5. Score Calculation → Sophisticated matching

### RAG Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    RAG (Retrieval Augmented Generation) Flow                  │
└──────────────────────────────────────────────────────────────────────────────┘

INDEXING PHASE (CV Ingestion):
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐
│   PDF CV    │ -> │  LLM        │ -> │  Embedding  │ -> │  Vector Store       │
│   Upload    │    │  Extraction │    │  Generation │    │  (Qdrant)           │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────────────┘
                          │                                        │
                          ▼                                        ▼
                   Structured Data                          768-dim Vector
                          │                                        │
                          └────────────────────┬───────────────────┘
                                               ▼
                                      ┌─────────────────┐
                                      │   PostgreSQL    │
                                      │   (Metadata)    │
                                      └─────────────────┘

RETRIEVAL PHASE (Job Matching):
┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────────────┐
│  Job PDF    │ -> │  LLM        │ -> │          DUAL RETRIEVAL                 │
│  Upload     │    │  Extraction │    │                                         │
└─────────────┘    └─────────────┘    │  ┌─────────────┐    ┌─────────────┐    │
                          │           │  │ SQL Query   │    │ Vector      │    │
                          ▼           │  │ (PostgreSQL)│    │ Search      │    │
                   Job Requirements   │  │             │    │ (Qdrant)    │    │
                          │           │  │ Skills      │    │             │    │
                          │           │  │ Experience  │    │ Semantic    │    │
                          │           │  │ Filters     │    │ Similarity  │    │
                          │           │  └──────┬──────┘    └──────┬──────┘    │
                          │           │         │                  │           │
                          │           │         └────────┬─────────┘           │
                          │           │                  ▼                     │
                          │           │         MERGE & SCORE                  │
                          │           │                  │                     │
                          │           └──────────────────┼─────────────────────┘
                          │                              │
                          └──────────────────────────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ Ranked Results  │
                                      │ (Top 5)         │
                                      └─────────────────┘
```

---

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Framework** | NestJS + TypeScript | Backend application framework |
| **LLM** | Google Gemini 2.5 Flash Lite | Structured data extraction |
| **Embeddings** | Google text-embedding-004 | 768-dimensional vectors |
| **Vector Database** | Qdrant | Semantic similarity search |
| **Relational Database** | PostgreSQL | Structured data storage |
| **ORM** | TypeORM | Database abstraction |
| **PDF Processing** | pdf-parse | PDF text extraction |
| **Validation** | Zod | Schema validation |
| **API Documentation** | Swagger/OpenAPI | Interactive API docs |
| **Containerization** | Docker Compose | Service orchestration |

---

## 🧠 Models and Methods

### Google Gemini 2.5 Flash Lite

**Model ID**: `gemini-2.5-flash-lite`

The system uses Google's Gemini 2.5 Flash Lite for all LLM operations:

#### Features Used:
- **Structured Output**: JSON schema-based extraction for reliable parsing
- **Low Temperature (0.1)**: Consistent, deterministic outputs
- **Large Context Window**: Handles lengthy CVs and job descriptions

#### Tasks Performed:
1. **CV Data Extraction**: Extract name, skills, experience, education
2. **Job Data Extraction**: Extract title, requirements, salary range
3. **Summary Generation**: Create search-optimized summaries
4. **Match Grading**: Generate reasoning for match scores

```typescript
// Example: Structured output configuration
config: {
  responseMimeType: 'application/json',
  responseSchema: zodToJsonSchema(CandidateExtractionSchema),
  temperature: 0.1,
}
```

### Text Embedding Model

**Model ID**: `text-embedding-004`

Google's latest embedding model for semantic search:

| Property | Value |
|----------|-------|
| Dimensions | 768 |
| Similarity Metric | Cosine |
| Normalization | Applied before storage |

#### Usage:
- Generate candidate summary embeddings
- Generate job summary embeddings
- Semantic similarity search queries

### RAG with Qdrant

**Qdrant** is used as the vector database for RAG implementation:

#### Collections:
1. **candidates**: Stores candidate embeddings with metadata
2. **jobs**: Stores job embeddings with metadata

#### Configuration:
```typescript
{
  host: 'localhost',
  port: 6333,
  embeddingDimensions: 768,
  distance: 'Cosine'
}
```

#### Payload Structure:
```typescript
// Candidate Payload
{
  candidateId: string,
  name: string,
  email: string,
  skills: string[],
  experienceYears: number,
  location: string,
  summary: string,
  createdAt: string
}
```

### Dual Search Strategy

The system combines two search methods for optimal results:

#### 1. SQL Search (PostgreSQL)
- Filters by required skills (JSONB queries)
- Filters by minimum experience years
- Supports fuzzy skill matching
- Configurable match percentage threshold

```sql
-- Simplified example of skill matching
SELECT * FROM candidates
WHERE (skill_match_count / total_skills) >= 0.3
  AND total_experience_years >= min_required
```

#### 2. Vector Search (Qdrant)
- Semantic similarity using embeddings
- Cosine similarity scoring
- Returns top-k most similar candidates

```typescript
// Vector search example
const results = await vectorService.searchCandidates(
  queryEmbedding,  // 768-dim job summary embedding
  limit: 20,       // Top 20 candidates
);
```

#### 3. Result Merging
- Candidates found in both searches = "Dual Match" (highest priority)
- Unique candidates from each search retained
- All candidates scored with sophisticated algorithm

### Sophisticated Scoring Algorithm

The matching score is calculated using multiple weighted factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Skill Match** | 35% | Percentage of required/optional skills matched |
| **Skill Proficiency** | 15% | How well skill levels align with requirements |
| **Experience Match** | 20% | Years of experience vs. requirements |
| **Location Match** | 10% | Geographic alignment (remote-friendly) |
| **Vector Similarity** | 15% | Semantic similarity score from embeddings |
| **SQL Match Bonus** | 5% | Bonus for appearing in structured search |

#### Skill Matching Features:
- **Exact Matching**: Direct skill name comparison
- **Fuzzy Matching**: Handles variations (JS/JavaScript, Python/Py)
- **Abbreviation Support**: Common tech abbreviations
- **Levenshtein Distance**: Close spelling matches

#### Experience Scoring:
- **Perfect Match (0-3 years over)**: 100%
- **Slightly Overqualified (3-7 years)**: 70-90%
- **Significantly Overqualified (7+)**: 50-70%
- **Slightly Under (-2 years)**: 60-80%
- **Significantly Under**: 20-60%

---

## 📊 Dataset Description

For detailed dataset information, see [DATASET_DESCRIPTION.md](./DATASET_DESCRIPTION.md).

### Quick Overview:

#### Candidate Dataset (`Resume_Dataset/`)
- **24 professional categories** (Accountant, IT, Healthcare, etc.)
- **PDF format** resumes with real-world content
- **Structured extraction** into: name, skills, experience, education

#### Job Dataset (`Jobs Positions/`)
- **20 job descriptions** focused on accounting positions
- **PDF format** with standardized structure
- **Extracted fields**: title, requirements, salary, benefits

---

## 🚀 Setup Instructions

### Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | >= 18.x | Runtime environment |
| **pnpm** | >= 8.x | Package manager |
| **Docker** | Latest | Container runtime |
| **Docker Compose** | Latest | Service orchestration |

### Installation

#### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd AIJobMatching
```

#### Step 2: Install Dependencies
```bash
pnpm install
```

#### Step 3: Get Google AI API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### Configuration

#### Step 1: Create Environment File
```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

#### Step 2: Configure Environment Variables
Edit `.env` with your settings:

```env
# =============================================================================
# Google AI Configuration (Required)
# =============================================================================
GEMINI_API_KEY=your_google_ai_api_key_here

# =============================================================================
# LLM Configuration
# =============================================================================
LLM_MODEL=gemini-2.5-flash-lite
EMBEDDING_MODEL=text-embedding-004

# =============================================================================
# Matching Configuration
# =============================================================================
MAX_CANDIDATES_RETURN=5
DUAL_MATCH_SCORE=100

# =============================================================================
# Database Configuration
# =============================================================================
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=job_matching

# =============================================================================
# Qdrant Configuration
# =============================================================================
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_CANDIDATES_COLLECTION=candidates
QDRANT_JOBS_COLLECTION=jobs
EMBEDDING_DIMENSIONS=768
```

### Running the Application

#### Option 1: Development Mode (Recommended)

```bash
# Step 1: Start Docker containers (PostgreSQL + Qdrant)
pnpm run docker:up

# Step 2: Wait for services to be healthy (~10 seconds)

# Step 3: Start the NestJS application
pnpm run start:dev
```

#### Option 2: All-in-One Command
```bash
pnpm run start:all
```

#### Option 3: Production Mode
```bash
# Build the application
pnpm run build

# Start in production mode
pnpm run start:prod
```

### Verifying Installation

1. **Application Health**: http://localhost:3000/api
2. **Swagger Documentation**: http://localhost:3000/docs
3. **Qdrant Dashboard**: http://localhost:6333/dashboard

### Stopping the Application

```bash
# Stop NestJS (Ctrl+C in terminal)

# Stop Docker containers
pnpm run docker:down

# Remove all data (clean slate)
pnpm run docker:clean
```

### Troubleshooting

#### Issue: Qdrant Collection Dimension Mismatch
If you've run the application before with different embedding dimensions:
```bash
# Option 1: Delete collections via Qdrant dashboard
# http://localhost:6333/dashboard -> Delete candidates & jobs collections

# Option 2: Reset all data
pnpm run docker:clean
pnpm run docker:up
```

#### Issue: Port Already in Use
```bash
# Check what's using the port (Windows)
netstat -ano | findstr :3000
netstat -ano | findstr :5432
netstat -ano | findstr :6333

# Kill the process or change ports in .env
```

#### Issue: API Key Invalid
Ensure your Google AI API key:
- Is active and has quota remaining
- Has access to Gemini 2.5 Flash Lite
- Is correctly copied without spaces

---

## 📚 API Documentation

Access the interactive Swagger documentation at: http://localhost:3000/docs

### Candidate Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/candidate/load` | Upload a single CV PDF |
| `POST` | `/api/candidate/load_folder` | Process all CVs in a folder |
| `GET` | `/api/candidate` | List all candidates (paginated) |
| `GET` | `/api/candidate/:id` | Get candidate by ID |
| `DELETE` | `/api/candidate/:id` | Delete a candidate |

### Job Offer Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/job-offer/match` | Upload job PDF and find matches |
| `POST` | `/api/job-offer/match-path` | Match from server file path |
| `GET` | `/api/job-offer` | List all job offers (paginated) |
| `GET` | `/api/job-offer/:id` | Get job offer by ID |
| `DELETE` | `/api/job-offer/:id` | Delete a job offer |

### Example: Upload and Match

```bash
# 1. Upload CVs from a folder
curl -X POST http://localhost:3000/api/candidate/load_folder \
  -H "Content-Type: application/json" \
  -d '{"folderPath": "./Resume_Dataset/data/ACCOUNTANT"}'

# 2. Upload a job description and get matches
curl -X POST http://localhost:3000/api/job-offer/match \
  -F "file=@./Jobs Positions/Job_1_Senior_Accountant_Healthcare.pdf"
```

### Sample Response (Job Matching)

```json
{
  "success": true,
  "message": "Found 5 matching candidates",
  "job": {
    "id": "uuid-here",
    "title": "Senior Accountant – Healthcare",
    "company": "Healthcare Corp",
    "requirements": [
      {"skill": "GAAP", "required": true, "minYearsExperience": 3},
      {"skill": "Excel", "required": true, "minYearsExperience": 2}
    ]
  },
  "candidates": [
    {
      "candidateId": "candidate-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "matchScore": 100,
      "matchSources": ["sql", "vector"],
      "matchDetails": {
        "sqlMatch": true,
        "vectorMatch": true,
        "vectorScore": 0.89,
        "skillScore": 85,
        "experienceScore": 90,
        "reasoning": "Excellent match. Skills: 4/5 required skills matched."
      },
      "skills": ["GAAP", "Excel", "QuickBooks", "SAP"],
      "experienceYears": 7.5
    }
  ],
  "searchMetadata": {
    "sqlMatchCount": 15,
    "vectorMatchCount": 12,
    "dualMatchCount": 5
  }
}
```

---

## 📁 Project Structure

```
AIJobMatching/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   │
│   ├── agents/                    # Agentic architecture
│   │   ├── agents.module.ts       # Agents module configuration
│   │   ├── orchestrator.agent.ts  # Central task coordinator
│   │   ├── candidate-ingestion.agent.ts  # CV processing agent
│   │   ├── job-processing.agent.ts       # Job matching agent
│   │   │
│   │   ├── services/              # Shared AI services
│   │   │   ├── llm.service.ts     # Gemini LLM integration
│   │   │   ├── embedding.service.ts  # Embedding generation
│   │   │   └── pdf-parser.service.ts # PDF text extraction
│   │   │
│   │   └── tools/                 # Agent tools
│   │       ├── postgres-query.tool.ts  # SQL search tool
│   │       ├── vector-search.tool.ts   # Vector search tool
│   │       └── matching-grade.tool.ts  # Scoring algorithm
│   │
│   ├── candidate/                 # Candidate feature module
│   │   ├── candidate.module.ts
│   │   ├── candidate.controller.ts
│   │   └── candidate.service.ts
│   │
│   ├── job-offer/                 # Job offer feature module
│   │   ├── job-offer.module.ts
│   │   ├── job-offer.controller.ts
│   │   └── job-offer.service.ts
│   │
│   ├── database/                  # Database configuration
│   │   ├── database.module.ts
│   │   └── entities/
│   │       ├── candidate.entity.ts
│   │       └── job.entity.ts
│   │
│   ├── vector/                    # Vector database module
│   │   ├── vector.module.ts
│   │   └── vector.service.ts
│   │
│   └── common/                    # Shared code
│       ├── dto/                   # Data Transfer Objects
│       └── interfaces/            # TypeScript interfaces
│
├── Jobs Positions/                # Sample job descriptions (20 PDFs)
├── Resume_Dataset/                # Sample CVs (24 categories)
│
├── docker-compose.yml             # Docker services config
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── nest-cli.json                  # NestJS CLI config
├── .env.example                   # Environment template
├── README.md                      # This file
└── DATASET_DESCRIPTION.md         # Dataset documentation
```

---

## 📦 Deliverables

This project includes the following deliverables:

### 1. Source Code
- ✅ Clean, well-structured TypeScript code
- ✅ Comprehensive inline comments
- ✅ Modular architecture following NestJS best practices

### 2. Documentation
- ✅ **README.md**: Complete project documentation (this file)
- ✅ **DATASET_DESCRIPTION.md**: Detailed dataset documentation
- ✅ **Swagger/OpenAPI**: Interactive API documentation at `/docs`

### 3. Dataset
- ✅ **Resume Dataset**: 24 categories of professional CVs
- ✅ **Job Positions**: 20 accounting job descriptions

### 4. Models & Methods
- ✅ **LLM**: Google Gemini 2.5 Flash Lite for structured extraction
- ✅ **Embeddings**: Google text-embedding-004 (768 dimensions)
- ✅ **Vector Store**: Qdrant for RAG implementation
- ✅ **Database**: PostgreSQL for structured storage
- ✅ **Architecture**: Multi-agent system with orchestrator pattern

### 5. Infrastructure
- ✅ **Docker Compose**: Easy deployment with containerization
- ✅ **Environment Configuration**: Flexible configuration via `.env`

---

## 🔧 Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | `3000` |
| `GEMINI_API_KEY` | Google AI API key | **Required** |
| `LLM_MODEL` | LLM model identifier | `gemini-2.5-flash-lite` |
| `EMBEDDING_MODEL` | Embedding model | `text-embedding-004` |
| `MAX_CANDIDATES_RETURN` | Max candidates returned | `5` |
| `DUAL_MATCH_SCORE` | Score for dual matches | `100` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database | `job_matching` |
| `QDRANT_HOST` | Qdrant host | `localhost` |
| `QDRANT_PORT` | Qdrant port | `6333` |
| `EMBEDDING_DIMENSIONS` | Vector dimensions | `768` |

---

## 📦 PNPM Scripts Reference

| Script | Description |
|--------|-------------|
| `pnpm run start:dev` | Start in development mode with hot reload |
| `pnpm run start:prod` | Start in production mode |
| `pnpm run start:all` | Start Docker + NestJS application |
| `pnpm run build` | Build the application |
| `pnpm run docker:up` | Start Docker containers |
| `pnpm run docker:down` | Stop Docker containers |
| `pnpm run docker:clean` | Stop containers and remove volumes |
| `pnpm run docker:logs` | View Docker logs |
| `pnpm run test` | Run tests |
| `pnpm run lint` | Run ESLint |

---

## 👥 Authors

**Group B** - AI Job Matching System Project

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- Google AI for Gemini API access
- Qdrant team for the vector database
- NestJS community for the excellent framework
- Resume Dataset contributors

---

**Happy Matching! 🎯**
