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
const { supabase } = require('../../config/supabase');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../../logger');

// Zip bomb guard — inspect ZIP local file headers to sum uncompressed sizes.
// Rejects files where total uncompressed content exceeds MAX_UNCOMPRESSED_BYTES
// or the compression ratio exceeds MAX_RATIO (protects against decompression explosions).
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_RATIO = 100; // e.g. 50 KB compressed → reject if expands > 5 MB

function checkZipBomb(buffer) {
  let offset = 0;
  let totalUncompressed = 0;
  let entryCount = 0;

  while (offset + 30 <= buffer.length) {
    // Local file header signature: PK\x03\x04
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    totalUncompressed += uncompressedSize;
    entryCount++;

    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      return { safe: false, reason: `Total uncompressed size (${Math.round(totalUncompressed / 1024 / 1024)} MB) exceeds ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB limit` };
    }

    offset += 30 + fileNameLength + extraFieldLength + compressedSize;
  }

  if (entryCount > 0 && buffer.length > 0) {
    const ratio = totalUncompressed / buffer.length;
    if (ratio > MAX_RATIO) {
      return { safe: false, reason: `Compression ratio ${ratio.toFixed(0)}:1 exceeds limit of ${MAX_RATIO}:1` };
    }
  }

  return { safe: true };
}

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
    const zipCheck = checkZipBomb(buffer);
    if (!zipCheck.safe) {
      logger.warn('Zip bomb detected in Word document', { reason: zipCheck.reason });
      throw new Error('File rejected: potential zip bomb detected');
    }
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
    const zipCheck = checkZipBomb(buffer);
    if (!zipCheck.safe) {
      logger.warn('Zip bomb detected in PowerPoint file', { reason: zipCheck.reason });
      throw new Error('File rejected: potential zip bomb detected');
    }
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
          contentType: this.detectContentType(chunkText),
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
            contentType: this.detectContentType(sentChunk),
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
        contentType: this.detectContentType(chunkText),
      });
    }

    logger.info('Document chunked', { totalChunks: chunks.length, avgTokens: Math.round(chunks.reduce((a, c) => a + c.tokenCount, 0) / (chunks.length || 1)) });

    return chunks;
  }

  /**
   * Classify a chunk's dominant content type.
   * Returns 'equation' | 'code' | 'table' | 'text'
   */
  detectContentType(text) {
    const t = text.trim();

    // Display math blocks: $$...$$ or \begin{equation}...\end{equation}
    if (/\$\$[\s\S]+?\$\$/.test(t)) return 'equation';
    if (/\\begin\{(equation|align|gather|math|displaymath|multline)\*?\}/.test(t)) return 'equation';

    // Code fences: ```...``` or 4-space indented blocks
    if (/^```[\s\S]*```$/m.test(t)) return 'code';
    if (/^(    |\t)/.test(t) && t.split('\n').filter(l => l.trim()).every(l => /^(    |\t)/.test(l))) {
      return 'code';
    }

    // Markdown / ASCII tables: lines with multiple | characters
    const lines = t.split('\n').filter(l => l.trim());
    const tableLines = lines.filter(l => (l.match(/\|/g) || []).length >= 2);
    if (tableLines.length >= 2 && tableLines.length / lines.length > 0.5) return 'table';

    // Heavily equation-rich text: many LaTeX commands
    const latexCommands = (t.match(/\\[a-zA-Z]+/g) || []).length;
    const inlineMath = (t.match(/\$[^$\n]{1,80}\$/g) || []).length;
    if (latexCommands + inlineMath * 2 > 5) return 'equation';

    return 'text';
  }

  /**
   * Split text into paragraphs, treating LaTeX blocks and code fences as atomic units
   * so they are never split mid-equation or mid-block.
   */
  splitIntoParagraphs(text) {
    // Replace display math blocks ($$...$$) and code fences (```...```) with
    // single-paragraph placeholders so the double-newline split doesn't break them.
    // We then re-expand after splitting.

    const atomics = [];
    const PLACEHOLDER = '\x00ATOMIC\x00';

    // Order matters: longer/outer patterns first (display math before inline)
    const protectedText = text
      // display math: $$...$$ (may span multiple lines)
      .replace(/\$\$[\s\S]+?\$\$/g, match => {
        atomics.push(match);
        return `\n\n${PLACEHOLDER}${atomics.length - 1}\n\n`;
      })
      // LaTeX environments: \begin{...}...\end{...}
      .replace(/\\begin\{[^}]+\}[\s\S]+?\\end\{[^}]+\}/g, match => {
        atomics.push(match);
        return `\n\n${PLACEHOLDER}${atomics.length - 1}\n\n`;
      })
      // code fences: ```...```
      .replace(/```[\s\S]*?```/g, match => {
        atomics.push(match);
        return `\n\n${PLACEHOLDER}${atomics.length - 1}\n\n`;
      });

    const rawParagraphs = protectedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    return rawParagraphs.map(p => {
      // Re-expand atomics
      let expanded = p.trim().replace(
        new RegExp(`${PLACEHOLDER}(\\d+)`, 'g'),
        (_, idx) => atomics[parseInt(idx)] || ''
      );
      return {
        text: expanded,
        isHeading: this.isSectionHeading(expanded),
      };
    });
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
   * Split a large paragraph by sentences to fit within maxTokens.
   * Inline math ($...$) is treated as an atomic unit — sentence splitting
   * never breaks in the middle of an equation.
   */
  splitLargeParagraph(text, maxTokens) {
    // Temporarily replace inline math with placeholders so ". " inside $...$ isn't
    // treated as a sentence boundary (e.g. "F = ma. where a = 9.81 m/s²")
    const inlineMaths = [];
    const safe = text.replace(/\$[^$\n]{1,200}\$/g, match => {
      inlineMaths.push(match);
      return `\x00M${inlineMaths.length - 1}\x00`;
    });
    const rawSentences = safe.match(/[^.!?]+[.!?]+/g) || [safe];
    // Restore inline math in each sentence
    const sentences = rawSentences.map(s =>
      s.replace(/\x00M(\d+)\x00/g, (_, i) => inlineMaths[parseInt(i)] || '')
    );
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
