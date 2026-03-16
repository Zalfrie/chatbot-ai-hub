import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export class ImporterService {
  /** Extract text from a PDF buffer */
  async fromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.replace(/\s+/g, ' ').trim();
  }

  /** Extract text from a DOCX buffer */
  async fromDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.replace(/\s+/g, ' ').trim();
  }

  /** Extract text from a plain-text CSV/TXT buffer */
  fromText(buffer: Buffer): string {
    return buffer.toString('utf-8').replace(/\s+/g, ' ').trim();
  }
}

export const importerService = new ImporterService();
