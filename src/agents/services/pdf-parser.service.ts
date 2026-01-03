/**
 * =============================================================================
 * PDF PARSER SERVICE - Document Text Extraction
 * =============================================================================
 * 
 * This service handles PDF document parsing and text extraction for both
 * CVs/resumes and job descriptions. It serves as the first step in the
 * RAG pipeline by converting PDF documents into processable text.
 * 
 * Key Features:
 * - File-based parsing: Read PDFs from disk
 * - Buffer-based parsing: Handle uploaded files directly
 * - Batch processing: Parse all PDFs in a folder
 * - Text cleaning: Remove special characters and normalize whitespace
 * 
 * Usage in RAG Pipeline:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PDF Document → [PdfParserService] → Raw Text                   │
 * │       ↓                                                         │
 * │  Raw Text → [LLMService] → Structured Data                      │
 * │       ↓                                                         │
 * │  Structured Data → [EmbeddingService] → Vector                  │
 * │       ↓                                                         │
 * │  Vector → [VectorService/Qdrant] → Stored for Search            │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

/**
 * Result of parsing a PDF document
 */
export interface ParsedDocument {
  text: string;       // Extracted and cleaned text content
  numPages: number;   // Number of pages in the PDF
  fileName: string;   // Original file name
  filePath: string;   // Full path (empty for buffer uploads)
}

/**
 * PdfParserService - Extracts text content from PDF documents
 * 
 * Uses the pdf-parse library to extract text from PDF files.
 * Supports both file-based and buffer-based parsing for flexibility.
 */
@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  /**
   * Parse a PDF file from disk and extract text content
   * 
   * @param filePath - Absolute path to the PDF file
   * @returns ParsedDocument with extracted text and metadata
   * @throws Error if file not found or parsing fails
   */
  async parsePdf(filePath: string): Promise<ParsedDocument> {
    try {
      // Verify file exists before attempting to read
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file into memory buffer
      const dataBuffer = fs.readFileSync(filePath);

      // Parse PDF using pdf-parse library
      const data = await pdfParse(dataBuffer);

      const result: ParsedDocument = {
        text: this.cleanText(data.text),
        numPages: data.numpages,
        fileName: path.basename(filePath),
        filePath: filePath,
      };

      this.logger.log(
        `Parsed PDF: ${result.fileName} (${result.numPages} pages, ${result.text.length} chars)`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse PDF: ${filePath}`, error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Parse a PDF from a buffer (for uploaded files)
   * 
   * This method is used when handling file uploads via the API.
   * The file is received as a buffer and parsed directly without
   * writing to disk first.
   * 
   * @param buffer - PDF file content as Buffer
   * @param fileName - Original file name for reference
   * @returns ParsedDocument with extracted text
   */
  async parsePdfBuffer(
    buffer: Buffer,
    fileName: string,
  ): Promise<ParsedDocument> {
    try {
      // Parse PDF directly from buffer
      const data = await pdfParse(buffer);

      const result: ParsedDocument = {
        text: this.cleanText(data.text),
        numPages: data.numpages,
        fileName: fileName,
        filePath: '', // No file path for buffer uploads
      };

      this.logger.log(
        `Parsed PDF buffer: ${result.fileName} (${result.numPages} pages, ${result.text.length} chars)`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse PDF buffer: ${fileName}`, error);
      throw new Error(`Failed to parse PDF buffer: ${error.message}`);
    }
  }

  /**
   * Get all PDF files from a folder
   * 
   * Scans a directory and returns paths to all PDF files found.
   * Used for batch processing of resume datasets.
   * 
   * @param folderPath - Path to the folder to scan
   * @returns Array of absolute paths to PDF files
   */
  async getPdfFilesFromFolder(folderPath: string): Promise<string[]> {
    try {
      // Verify folder exists
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      // Verify it's a directory
      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${folderPath}`);
      }

      // Get all files and filter to PDFs only
      const files = fs.readdirSync(folderPath);
      const pdfFiles = files
        .filter((file) => file.toLowerCase().endsWith('.pdf'))
        .map((file) => path.join(folderPath, file));

      this.logger.log(`Found ${pdfFiles.length} PDF files in ${folderPath}`);
      return pdfFiles;
    } catch (error) {
      this.logger.error(`Failed to read folder: ${folderPath}`, error);
      throw new Error(`Failed to read folder: ${error.message}`);
    }
  }

  /**
   * Parse all PDFs in a folder (batch processing)
   * 
   * Processes all PDF files in a directory, collecting successful
   * results and tracking failures. This is used for bulk ingestion
   * of resume datasets.
   * 
   * @param folderPath - Path to folder containing PDF files
   * @returns Object with successful parses and failed attempts
   */
  async parsePdfsFromFolder(folderPath: string): Promise<{
    successful: ParsedDocument[];
    failed: { filePath: string; error: string }[];
  }> {
    const pdfFiles = await this.getPdfFilesFromFolder(folderPath);

    const successful: ParsedDocument[] = [];
    const failed: { filePath: string; error: string }[] = [];

    // Process each PDF, continuing even if some fail
    for (const filePath of pdfFiles) {
      try {
        const parsed = await this.parsePdf(filePath);
        successful.push(parsed);
      } catch (error) {
        failed.push({ filePath, error: error.message });
        this.logger.warn(`Skipping failed PDF: ${filePath}`);
      }
    }

    this.logger.log(
      `Parsed ${successful.length}/${pdfFiles.length} PDFs successfully`,
    );

    return { successful, failed };
  }

  /**
   * Clean extracted text by removing special characters and normalizing whitespace
   * 
   * PDF extraction can produce messy text with:
   * - Multiple consecutive spaces/newlines
   * - Control characters that break JSON
   * - Leading/trailing whitespace
   * 
   * This method normalizes the text for downstream processing.
   * 
   * @param text - Raw extracted text
   * @returns Cleaned text suitable for LLM processing
   */
  private cleanText(text: string): string {
    return text
      // Replace multiple whitespace characters with single space
      .replace(/\s+/g, ' ')
      // Remove control characters that might break JSON serialization
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Remove leading and trailing whitespace
      .trim();
  }
}
