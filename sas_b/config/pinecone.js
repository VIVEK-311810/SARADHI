const { Pinecone } = require('@pinecone-database/pinecone');

const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeIndex = process.env.PINECONE_INDEX;

if (!pineconeApiKey || !pineconeIndex) {
  console.error('Missing Pinecone configuration. Please check your .env file.');
  process.exit(1);
}

const pinecone = new Pinecone({
  apiKey: pineconeApiKey,
});

const index = pinecone.index(pineconeIndex);

module.exports = { pinecone, index };
