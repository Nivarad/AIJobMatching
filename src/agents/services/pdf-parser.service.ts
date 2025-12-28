import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

export interface ParsedDocument {
  text: string;
  numPages: number;
  fileName: string;
  filePath: string;
}

@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  /**
   * Parse a PDF file and extract text content
   */
  async parsePdf(filePath: string): Promise<ParsedDocument> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file buffer
      const dataBuffer = fs.readFileSync(filePath);

      // Parse PDF
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
   * Parse a PDF from buffer (for uploaded files)
   */
  async parsePdfBuffer(
    buffer: Buffer,
    fileName: string,
  ): Promise<ParsedDocument> {
    try {
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
   */
  async getPdfFilesFromFolder(folderPath: string): Promise<string[]> {
    try {
      // Check if folder exists
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${folderPath}`);
      }

      // Get all files
      const files = fs.readdirSync(folderPath);

      // Filter PDF files
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
   * Parse all PDFs in a folder
   */
  async parsePdfsFromFolder(folderPath: string): Promise<{
    successful: ParsedDocument[];
    failed: { filePath: string; error: string }[];
  }> {
    const pdfFiles = await this.getPdfFilesFromFolder(folderPath);

    const successful: ParsedDocument[] = [];
    const failed: { filePath: string; error: string }[] = [];

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
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters that might break JSON
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Trim
      .trim();
  }
}
