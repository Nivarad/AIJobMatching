# Dataset Description

## Overview

This document provides a comprehensive description of the datasets used in the AI Job-Candidate Matching System. The system processes two types of PDF documents:

1. **Candidate Resumes/CVs** - Located in `Resume_Dataset/`
2. **Job Position Descriptions** - Located in `Jobs Positions/`

---

## 📄 Candidate Resume Dataset

### Source
The candidate dataset is based on the **Resume Dataset** which contains real-world resumes organized by professional categories.

### Location
```
Resume_Dataset/
├── data/                    # Contains PDF resumes organized by category
│   ├── ACCOUNTANT/          # 117 resumes
│   ├── ADVOCATE/            # Legal professionals
│   ├── AGRICULTURE/         # Agricultural specialists
│   ├── APPAREL/             # Fashion industry
│   ├── ARTS/                # Artists and creatives
│   ├── AUTOMOBILE/          # Automotive industry
│   ├── AVIATION/            # Aviation professionals
│   ├── BANKING/             # Banking sector
│   ├── BPO/                 # Business Process Outsourcing
│   ├── BUSINESS-DEVELOPMENT/# Business development roles
│   ├── CHEF/                # Culinary professionals
│   ├── CONSTRUCTION/        # Construction industry
│   ├── CONSULTANT/          # Consulting professionals
│   ├── DESIGNER/            # Design professionals
│   ├── DIGITAL-MEDIA/       # Digital media specialists
│   ├── ENGINEERING/         # Engineers
│   ├── FINANCE/             # Finance professionals
│   ├── FITNESS/             # Fitness trainers
│   ├── HEALTHCARE/          # Healthcare workers
│   ├── HR/                  # Human Resources
│   ├── INFORMATION-TECHNOLOGY/ # IT professionals
│   ├── PUBLIC-RELATIONS/    # PR specialists
│   ├── SALES/               # Sales professionals
│   └── TEACHER/             # Educators
└── Resume/
    └── Resume.csv           # Metadata and text content
```

### Dataset Statistics
| Attribute | Value |
|-----------|-------|
| **Total Categories** | 24 professional domains |
| **File Format** | PDF documents |
| **Sample Category (ACCOUNTANT)** | 117 resumes |
| **Naming Convention** | Numeric IDs (e.g., `10554236.pdf`) |

### Extracted Data Structure
When a CV is processed by the system, the following structured data is extracted using the LLM:

```typescript
interface ExtractedCandidateData {
  // Personal Information
  name: string | null;              // Full name of candidate
  email: string | null;             // Email address
  phone: string | null;             // Contact number
  location: string | null;          // City/Region
  
  // Professional Summary
  summary: string;                   // AI-generated search-optimized summary
  
  // Skills with Proficiency
  skills: {
    name: string;                    // Skill name (e.g., "Python", "Excel")
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;      // Years using this skill
  }[];
  
  // Work Experience
  experience: {
    company: string;                 // Company name
    title: string;                   // Job title
    startDate: string;               // Format: YYYY-MM
    endDate?: string;                // Format: YYYY-MM (null if current)
    description: string;             // Role description
    skills?: string[];               // Skills used in this role
  }[];
  
  // Education
  education: {
    institution: string;             // School/University name
    degree: string;                  // Degree type (BS, MS, PhD, etc.)
    field: string;                   // Field of study
    graduationYear?: number;         // Year of graduation
  }[];
  
  // Computed Fields
  totalExperienceYears: number;      // Total years of work experience
}
```

### Sample Data Categories by Domain

| Category | Typical Skills | Experience Range |
|----------|---------------|------------------|
| **ACCOUNTANT** | Excel, QuickBooks, GAAP, Financial Reporting, Tax Preparation | 2-20 years |
| **INFORMATION-TECHNOLOGY** | Python, Java, SQL, Cloud (AWS/Azure), DevOps | 1-15 years |
| **HEALTHCARE** | Patient Care, Medical Records, HIPAA, Clinical Skills | 1-25 years |
| **ENGINEERING** | CAD, Project Management, Technical Design, Testing | 3-20 years |
| **FINANCE** | Financial Analysis, Bloomberg, Risk Management, Modeling | 2-15 years |

---

## 💼 Job Position Dataset

### Source
Custom-generated job descriptions based on real-world accounting positions, designed to test the matching algorithm against the ACCOUNTANT category in the resume dataset.

### Location
```
Jobs Positions/
├── Job_1_Senior_Accountant_–_Healthcare.pdf
├── Job_2_Financial_Reporting_Accountant.pdf
├── Job_3_Accounting_Operations_Manager.pdf
├── Job_4_Medical_Billing_Accounting_Specialist.pdf
├── Job_5_General_Ledger_Accountant.pdf
├── Job_6_Payroll_and_Compliance_Accountant.pdf
├── Job_7_Accounts_Payable_Lead.pdf
├── Job_8_Accounts_Receivable_Manager.pdf
├── Job_9_ERP_Accounting_Specialist.pdf
├── Job_10_Construction_Accounting_Analyst.pdf
├── Job_11_Tax_and_Compliance_Accountant.pdf
├── Job_12_Budget_and_Forecast_Accountant.pdf
├── Job_13_Cost_Accounting_Specialist.pdf
├── Job_14_Audit_and_Controls_Accountant.pdf
├── Job_15_Accounting_Systems_Implementation_Lead.pdf
├── Job_16_Corporate_Accountant.pdf
├── Job_17_Revenue_and_Billing_Accountant.pdf
├── Job_18_Financial_Close_Manager.pdf
├── Job_19_Accounting_Process_Improvement_Analyst.pdf
└── Job_20_Senior_Staff_Accountant.pdf
```

### Dataset Statistics
| Attribute | Value |
|-----------|-------|
| **Total Job Positions** | 20 |
| **File Format** | PDF documents |
| **Domain Focus** | Accounting & Finance |
| **Position Levels** | Entry to Senior/Manager |

### Extracted Data Structure
When a job description is processed, the following structured data is extracted:

```typescript
interface ExtractedJobData {
  // Basic Information
  title: string;                     // Job title
  description: string;               // Role description
  company?: string;                  // Company name
  location?: string;                 // Job location
  
  // Employment Details
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  
  // AI-Generated Summary
  summary: string;                   // Search-optimized summary
  
  // Requirements
  requirements: {
    skill: string;                   // Required skill name
    required: boolean;               // true = mandatory, false = preferred
    minYearsExperience?: number;     // Minimum years needed
  }[];
  
  // Compensation
  salaryRange?: {
    min: number;
    max: number;
    currency: string;                // e.g., "USD"
  };
  
  // Benefits
  benefits?: string[];               // List of benefits offered
}
```

### Job Position Categories

| Position Type | Example Roles | Key Requirements |
|---------------|---------------|------------------|
| **Entry Level** | Staff Accountant, Junior Accountant | Excel, Basic Accounting, 1-2 years |
| **Mid Level** | Financial Reporting, Tax Accountant | GAAP, CPA, 3-5 years |
| **Senior Level** | Senior Accountant, Manager | Leadership, ERP Systems, 5-10 years |
| **Specialized** | ERP Specialist, Cost Accountant | SAP/Oracle, Industry Knowledge |

---

## 🔄 Data Processing Pipeline

### CV/Resume Processing
```
PDF Upload → PDF Parsing → LLM Extraction → Embedding Generation → Dual Storage
                              │                      │                  │
                              ▼                      ▼                  ▼
                    Structured Data          768-dim Vector      PostgreSQL + Qdrant
```

### Job Description Processing
```
PDF Upload → PDF Parsing → LLM Extraction → Embedding Generation → Match Search
                              │                      │                  │
                              ▼                      ▼                  ▼
                    Requirements List        Job Embedding        SQL + Vector Query
```

---

## 📊 Data Quality Considerations

### Resume Dataset Characteristics
- **Variability**: Real resumes with varying formats and structures
- **Completeness**: Some fields may be missing (email, phone, etc.)
- **Languages**: Primarily English
- **Date Formats**: Various formats handled by LLM normalization

### Job Description Characteristics
- **Consistency**: Standardized format for testing
- **Coverage**: Various accounting specializations
- **Requirements Clarity**: Clear skill requirements with levels

---

## 🎯 Matching Criteria

The system matches candidates to jobs using multiple factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Skill Match** | 35% | Required vs optional skill presence |
| **Skill Proficiency** | 15% | Experience level alignment |
| **Experience Years** | 20% | Meets/exceeds requirements |
| **Location Match** | 10% | Geographic alignment |
| **Vector Similarity** | 15% | Semantic relevance |
| **SQL Match Bonus** | 5% | Found in structured search |

---

## 📁 Data Storage

### PostgreSQL (Structured Data)
- Candidate profiles with JSONB fields for flexible skill/experience storage
- Job listings with requirement arrays
- Indexed fields for efficient SQL queries

### Qdrant (Vector Data)
- 768-dimensional embeddings from Google text-embedding-004
- Candidate collection for semantic search
- Jobs collection for reverse matching
- Cosine similarity for vector comparisons

---

## 🔒 Data Privacy Note

The resume dataset contains synthetic/anonymized data suitable for demonstration purposes. In a production environment, proper data handling, consent, and privacy measures should be implemented in accordance with GDPR and other applicable regulations.
