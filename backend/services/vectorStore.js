const { index } = require('../config/pinecone');
const { supabase } = require('../config/supabase');
const logger = require('../logger');

class VectorStore {
  /**
   * Upsert vectors with enhanced metadata (denormalized resource info)
   */
  async upsertVectors(resourceId, sessionId, chunks, embeddings, resourceMeta = {}) {
    try {
      if (chunks.length !== embeddings.length) {
        throw new Error('Chunks and embeddings length mismatch');
      }

      const vectors = chunks.map((chunk, i) => ({
        id: `${resourceId}_chunk_${i}`,
        values: embeddings[i],
        metadata: {
          resource_id: resourceId,
          session_id: sessionId,
          chunk_index: i,
          text: chunk.text.substring(0, 1000), // Pinecone metadata limit
          token_count: chunk.tokenCount || 0,
          // Pinecone rejects null — use empty string / 0 as sentinels
          page_number: chunk.pageNumber ?? 0,
          section_title: chunk.sectionTitle || '',
          content_type: chunk.contentType || 'text',
          // Denormalized fields — eliminates N+1 lookups during search
          resource_title: resourceMeta.title || '',
          file_name: resourceMeta.fileName || '',
          resource_type: resourceMeta.resourceType || '',
        }
      }));

      // Upsert to Pinecone (batch size: 100)
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch);
        logger.info(`Upserted vectors ${i + 1}-${Math.min(i + batchSize, vectors.length)} to Pinecone`);
      }

      // Save chunk metadata to Supabase
      const chunkRecords = chunks.map((chunk, i) => ({
        resource_id: resourceId,
        chunk_index: i,
        chunk_text: chunk.text,
        token_count: chunk.tokenCount,
        page_number: chunk.pageNumber || null,
        section_title: chunk.sectionTitle || null,
        content_type: chunk.contentType || 'text',
        pinecone_vector_id: `${resourceId}_chunk_${i}`
      }));

      const { error } = await supabase
        .from('resource_chunks')
        .insert(chunkRecords);

      if (error) {
        logger.error('Error saving chunks to Supabase', { error: error.message });
        throw error;
      }

      logger.info(`Saved ${chunkRecords.length} chunk records to Supabase`);
      return vectors.length;
    } catch (error) {
      logger.error('Error upserting vectors', { error: error.message });
      throw error;
    }
  }

  /**
   * Search for similar vectors — returns enriched results with denormalized metadata
   */
  async searchSimilar(queryEmbedding, sessionId, topK = 5) {
    try {
      const response = await index.query({
        vector: queryEmbedding,
        topK,
        filter: {
          session_id: { $eq: sessionId }
        },
        includeMetadata: true
      });

      if (!response.matches || response.matches.length === 0) {
        return [];
      }

      return response.matches.map(match => ({
        resourceId: match.metadata.resource_id,
        chunkIndex: match.metadata.chunk_index,
        text: match.metadata.text,
        pageNumber: match.metadata.page_number,
        similarityScore: match.score,
        pineconeId: match.id,
        // Denormalized fields (may be null for vectors created before this enhancement)
        section_title: match.metadata.section_title || null,
        resource_title: match.metadata.resource_title || null,
        file_name: match.metadata.file_name || null,
        resource_type: match.metadata.resource_type || null,
        content_type: match.metadata.content_type || 'text',
      }));
    } catch (error) {
      logger.error('Error searching vectors', { error: error.message });
      throw error;
    }
  }

  async deleteResource(resourceId) {
    try {
      await index.deleteMany({
        filter: { resource_id: { $eq: resourceId } }
      });

      logger.info(`Deleted vectors for resource ${resourceId} from Pinecone`);

      const { error } = await supabase
        .from('resource_chunks')
        .delete()
        .eq('resource_id', resourceId);

      if (error) {
        logger.error('Error deleting chunks from Supabase', { error: error.message });
        throw error;
      }

      logger.info(`Deleted chunk records for resource ${resourceId} from Supabase`);
    } catch (error) {
      logger.error('Error deleting resource vectors', { error: error.message });
      // Don't throw — allow resource deletion to continue even if vector deletion fails
    }
  }
}

module.exports = new VectorStore();
