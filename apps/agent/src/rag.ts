import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi';
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
import { MongoClient } from "mongodb";
import * as fs from 'fs';
import { DEEPSEEK_API_KEY, MONGODB_URI } from "./constants";


const path = "/Users/chenyangwu/Documents/trae_projects/AgentBackend/agentback/report";
const files = fs.readdirSync(path);

const embeddings = new AlibabaTongyiEmbeddings({
  modelName: 'text-embedding-v4',
  apiKey: DEEPSEEK_API_KEY
});

const client = new MongoClient(MONGODB_URI);

const collection = client
  .db('HC')
  .collection('HC_K8s_Doc');

const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
  collection: collection as any,
  indexName: "vector_index",
  textKey: "text",
  embeddingKey: "embedding",
});

async function main() {
  try {

    for (const file of files) {
      if (file.endsWith('.pdf')) {
        try {
          console.log(`Processing file: ${file}`);
          const loader = new PDFLoader(
            path + "/" + file
          );
          const docs = await loader.load();
          console.log(`Loaded ${docs.length} pages from ${file}`);

          if (docs.length > 0) {
            console.log("Content preview:", docs[0].pageContent.slice(0, 200));
          }

          const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
          });

          const allSplits = await textSplitter.splitDocuments(docs);
          console.log(`Split into ${allSplits.length} chunks`);


          const BATCH_SIZE = 10;
          for (let i = 0; i < allSplits.length; i += BATCH_SIZE) {
            const batch = allSplits.slice(i, i + BATCH_SIZE);
            await vectorStore.addDocuments(batch);
            console.log(`Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allSplits.length / BATCH_SIZE)}`);
          }
          console.log(`Successfully indexed ${file}`);
        } catch (e) {
          console.error(`Error processing file ${file}:`, e);
        }
      }
    }
  } finally {
    await client.close();
    console.log("Database connection closed");
  }
}

main().catch(console.error); 