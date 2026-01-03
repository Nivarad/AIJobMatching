import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Skill interface
export interface Skill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number; // Can be decimal (e.g., 1.5 years)
}

// Experience interface
export interface Experience {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  description: string;
  skills?: string[];
}

// Education interface
export interface Education {
  institution: string;
  degree: string;
  field: string;
  graduationYear?: number;
}

@Entity('candidates')
@Index(['email'], { unique: true })
@Index(['status'])
@Index(['createdAt'])
export class Candidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  name?: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index()
  location?: string;

  // JSONB for flexible structured data
  @Column({ type: 'jsonb', default: [] })
  skills: Skill[];

  @Column({ type: 'jsonb', default: [] })
  experience: Experience[];

  @Column({ type: 'jsonb', default: [] })
  education: Education[];

  // Computed/extracted fields for faster querying
  @Column({ type: 'double precision', default: 0 })
  @Index()
  totalExperienceYears: number;

  // LLM-generated summary optimized for semantic search
  @Column({ type: 'text', nullable: true })
  summary?: string;

  // Original resume text
  @Column({ type: 'text', nullable: true })
  rawResumeText?: string;

  // Original file path
  @Column({ type: 'varchar', length: 500, nullable: true })
  resumePath?: string;

  // Vector store reference (Qdrant point ID)
  @Column({ type: 'varchar', length: 255, nullable: true })
  qdrantPointId?: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: 'active' | 'inactive' | 'pending' | 'failed';

  // Processing status message (for failures)
  @Column({ type: 'text', nullable: true })
  processingMessage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
