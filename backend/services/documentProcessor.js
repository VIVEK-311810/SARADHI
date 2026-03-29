const pdfParse = require('pdf-parse-new');

// pdf-parse-new uses pdfjs-dist internally which prints TrueType font warnings
// and per-page timing directly to stdout via console.log — bypassing our logger.
// The verbosity option is not forwarded by pdf-parse-new, so we filter here.
const _consoleLog = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === 'string' && (
    args[0].includes('TT: CALL') ||
    args[0].includes('getTextContent')
  )) return;
  _consoleLog(...args);
};
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../logger');

class DocumentProcessor {
  async extractText(resourceId, filePath, fileType) {
    try {
      // Download file from Supabase Storage
      const { data, error } = await supabase.storage
        .from('session-resources')
        .download(filePath);

      if (error) {
        logger.error('Error downloading file from Supabase', { error: error.message });
        throw error;
      }

      // Convert Blob to Buffer for processing
      const buffer = Buffer.from(await data.arrayBuffer());

      switch (fileType) {
        case 'pdf':
          return await this.extractFromPDF(buffer);
        case 'document':
          return await this.extractFromWord(buffer);
        case 'presentation':
          return await this.extractFromPowerPoint(buffer);
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      logger.error(`Error extracting text from ${fileType}`, { error: error.message });
      throw error;
    }
  }

  async extractFromPDF(buffer) {
    try {
      // verbosity: 0 silences pdfjs-dist TrueType font noise ("TT: CALL empty stack")
      // that would otherwise spam stdout on every PDF with non-standard fonts
      const pdfData = await pdfParse(buffer, { verbosity: 0 });

      logger.info('PDF parsed successfully', { pages: pdfData.numpages, textLength: pdfData.text?.length });

      return {
        text: pdfData.text,
        pageCount: pdfData.numpages,
        pages: this.splitByPages(pdfData.text, pdfData.numpages)
      };
    } catch (error) {
      logger.error('PDF parsing error', { error: error.message });
      throw new Error('Failed to parse PDF file');
    }
  }

  async extractFromWord(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value,
        pageCount: 1,
        pages: [result.value]
      };
    } catch (error) {
      logger.error('Word document parsing error', { error: error.message });
      throw new Error('Failed to parse Word document');
    }
  }

  async extractFromPowerPoint(buffer) {
    const tempFilePath = path.join(os.tmpdir(), `temp_ppt_${Date.now()}_${Math.random().toString(36).slice(2)}.pptx`);

    try {
      fs.writeFileSync(tempFilePath, buffer);

      const text = await officeParser.parseOfficeAsync(tempFilePath);

      logger.info('PowerPoint parsed successfully', { textLength: text?.length });

      const cleanedText = text ? text.trim() : '';

      if (!cleanedText || cleanedText.length < 10) {
        logger.warn('PowerPoint extraction returned minimal text');
        return {
          text: 'PowerPoint file uploaded but minimal text was extracted.',
          pageCount: 1,
          pages: ['PowerPoint file uploaded but minimal text was extracted.']
        };
      }

      return {
        text: cleanedText,
        pageCount: 1,
        pages: [cleanedText]
      };
    } catch (error) {
      logger.error('PowerPoint parsing error', { error: error.message });
      return {
        text: 'PowerPoint text extraction failed. File uploaded but not vectorized.',
        pageCount: 1,
        pages: ['PowerPoint text extraction failed. File uploaded but not vectorized.']
      };
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        logger.warn('Error cleaning up temp file', { error: cleanupError.message });
      }
    }
  }

  splitByPages(text, pageCount) {
    if (!text || pageCount <= 0) return [];

    const avgCharsPerPage = Math.floor(text.length / pageCount);
    const pages = [];

    for (let i = 0; i < pageCount; i++) {
      const start = i * avgCharsPerPage;
      const end = (i + 1) * avgCharsPerPage;
      const pageText = text.substring(start, end);

      if (pageText.trim()) {
        pages.push(pageText);
      }
    }

    return pages.length > 0 ? pages : [text];
  }

  /**
   * Semantic chunking — splits text into meaningful chunks at paragraph/section boundaries
   * instead of naive word-count splitting.
   *
   * @param {string} text - Full document text
   * @param {object} options
   * @param {number} options.maxTokens - Target chunk size in tokens (default 400)
   * @param {number} options.overlapTokens - Overlap between chunks in tokens (default 50)
   * @param {number} options.pageCount - Number of pages in the document
   * @returns {Array<{text, pageNumber, sectionTitle, chunkIndex, tokenCount}>}
   */
  chunkText(text, options = {}) {
    const { maxTokens = 400, overlapTokens = 50, pageCount = 1 } = options;

    if (!text || text.trim().length === 0) {
      return [];
    }

    // Step 1: Split into paragraphs (double newline or heading patterns)
    const paragraphs = this.splitIntoParagraphs(text);

    // Step 2: Group paragraphs into chunks that fit within maxTokens
    const chunks = [];
    let currentChunk = [];
    let currentTokens = 0;
    let currentSection = null;

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para.text);

      // Detect section headings
      if (this.isSectionHeading(para.text)) {
        currentSection = para.text.trim().replace(/^#+\s*/, '').substring(0, 100);
      }

      // If adding this paragraph would exceed the limit, finalize the current chunk
      if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        const pageNumber = this.estimatePageNumber(chunks.length, text, chunkText, pageCount);

        chunks.push({
          text: chunkText,
          pageNumber,
          sectionTitle: currentSection,
          chunkIndex: chunks.length,
          tokenCount: this.estimateTokens(chunkText),
        });

        // Keep overlap: take the last paragraph(s) that fit within overlapTokens
        const overlapParagraphs = [];
        let overlapCount = 0;
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          const pTokens = this.estimateTokens(currentChunk[i]);
          if (overlapCount + pTokens > overlapTokens) break;
          overlapParagraphs.unshift(currentChunk[i]);
          overlapCount += pTokens;
        }

        currentChunk = overlapParagraphs;
        currentTokens = overlapCount;
      }

      // If a single paragraph exceeds maxTokens, split it by sentences
      if (paraTokens > maxTokens) {
        const sentenceChunks = this.splitLargeParagraph(para.text, maxTokens);
        for (const sentChunk of sentenceChunks) {
          const pageNumber = this.estimatePageNumber(chunks.length, text, sentChunk, pageCount);
          chunks.push({
            text: sentChunk,
            pageNumber,
            sectionTitle: currentSection,
            chunkIndex: chunks.length,
            tokenCount: this.estimateTokens(sentChunk),
          });
        }
        currentChunk = [];
        currentTokens = 0;
      } else {
        currentChunk.push(para.text);
        currentTokens += paraTokens;
      }
    }

    // Finalize last chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n\n');
      const pageNumber = this.estimatePageNumber(chunks.length, text, chunkText, pageCount);
      chunks.push({
        text: chunkText,
        pageNumber,
        sectionTitle: currentSection,
        chunkIndex: chunks.length,
        tokenCount: this.estimateTokens(chunkText),
      });
    }

    logger.info('Document chunked', { totalChunks: chunks.length, avgTokens: Math.round(chunks.reduce((a, c) => a + c.tokenCount, 0) / (chunks.length || 1)) });

    return chunks;
  }

  /**
   * Split text into paragraphs based on double newlines, headings, and other natural boundaries
   */
  splitIntoParagraphs(text) {
    // Split on double newlines, keeping heading detection possible
    const rawParagraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    return rawParagraphs.map(p => ({
      text: p.trim(),
      isHeading: this.isSectionHeading(p),
    }));
  }

  /**
   * Detect if a line is likely a section heading
   */
  isSectionHeading(text) {
    const trimmed = text.trim();
    if (trimmed.length > 150) return false; // Headings are short
    if (trimmed.length === 0) return false;

    // Markdown headings
    if (/^#{1,4}\s+/.test(trimmed)) return true;

    // Numbered sections: "1.", "1.1", "Chapter 1", "Section 2.3"
    if (/^(\d+\.)+\s+\w/.test(trimmed)) return true;
    if (/^(chapter|section|part|unit)\s+\d/i.test(trimmed)) return true;

    // ALL CAPS lines (common in academic PDFs)
    if (/^[A-Z][A-Z\s:]{4,}$/.test(trimmed) && trimmed.length < 80) return true;

    return false;
  }

  /**
   * Split a large paragraph by sentences to fit within maxTokens
   */
  splitLargeParagraph(text, maxTokens) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentTokens = this.estimateTokens(sentence);

      if (currentTokens + sentTokens > maxTokens && current.length > 0) {
        chunks.push(current.join(' '));
        current = [];
        currentTokens = 0;
      }

      current.push(sentence.trim());
      currentTokens += sentTokens;
    }

    if (current.length > 0) {
      chunks.push(current.join(' '));
    }

    return chunks;
  }

  /**
   * Estimate page number based on chunk position in the document
   */
  estimatePageNumber(chunkIndex, fullText, chunkText, pageCount) {
    if (pageCount <= 1) return 1;

    const position = fullText.indexOf(chunkText);
    if (position === -1) return Math.min(chunkIndex + 1, pageCount);

    const ratio = position / fullText.length;
    return Math.min(Math.ceil(ratio * pageCount) || 1, pageCount);
  }

  /**
   * Estimate token count (1 token ~ 4 characters for English)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

module.exports = new DocumentProcessor();
