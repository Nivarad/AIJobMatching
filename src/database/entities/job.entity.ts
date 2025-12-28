import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Job requirement interface
export interface JobRequirement {
  skill: string;
  required: boolean;
  minYearsExperience?: number;
}

// Salary range interface
export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
}

@Entity('jobs')
@Index(['status'])
@Index(['createdAt'])
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  company?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index()
  location?: string;

  @Column({ type: 'varchar', length: 50, default: 'full-time' })
  @Index()
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';

  // JSONB for requirements
  @Column({ type: 'jsonb', default: [] })
  requirements: JobRequirement[];

  @Column({ type: 'jsonb', nullable: true })
  salaryRange?: SalaryRange;

  @Column({ type: 'simple-array', nullable: true })
  benefits?: string[];

  // LLM-generated summary for semantic search
  @Column({ type: 'text', nullable: true })
  summary?: string;

  // Original job description text
  @Column({ type: 'text', nullable: true })
  rawDescriptionText?: string;

  // Original file path
  @Column({ type: 'varchar', length: 500, nullable: true })
  jobDescriptionPath?: string;

  // Vector store reference (Qdrant point ID)
  @Column({ type: 'varchar', length: 255, nullable: true })
  qdrantPointId?: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'open',
  })
  @Index()
  status: 'open' | 'closed' | 'draft';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
