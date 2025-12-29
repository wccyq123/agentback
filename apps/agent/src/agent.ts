import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
import { MongoClient } from "mongodb";
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi';
import { MONGODB_URI, QIANWEN_API_KEY } from "./constants";

dotenv.config();

import {
  convertActionsToDynamicStructuredTools,
  CopilotKitStateAnnotation,
} from "@copilotkit/sdk-js/langgraph";
import { Annotation } from "@langchain/langgraph";

const embeddings = new AlibabaTongyiEmbeddings({
  modelName: 'text-embedding-v4',
  apiKey: QIANWEN_API_KEY
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

const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec, 
  proverbs: Annotation<string[]>,
});

export type AgentState = typeof AgentStateAnnotation.State;

const getWeather = tool(
  async (args) => {
    // 🟢 真正的实时查询逻辑
    console.log("Weather tool called with args:", args);

    try {
      // 使用 wttr.in 免费天气 API (支持城市名直接查询)
      const response = await fetch(`https://wttr.in/${encodeURIComponent(args.location)}?format=j1`);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const rawData = await response.json();
      const current = rawData.current_condition[0];

      // 提取我们需要的数据
      const data = {
        location: args.location,
        date: args.date || "now",
        temperature: parseFloat(current.temp_F), // API 默认也有 F，或者我们可以手动转。wttr.in j1 返回的是 C，我们需要看下文档。
        temperature_c: parseFloat(current.temp_C),
        temperature_f: parseFloat(current.temp_F),
        conditions: current.weatherDesc[0].value,
        humidity: parseFloat(current.humidity),
        wind_speed_kmph: parseFloat(current.windspeedKmph),
        feels_like_c: parseFloat(current.FeelsLikeC),
        uv_index: parseFloat(current.uvIndex) || 0,
        // air_quality is not always available in basic wttr.in, let's keep it mocked or omit
        source: "wttr.in (Real-time)"
      };

      return JSON.stringify(data);
    } catch (error) {
      console.error("Failed to fetch weather:", error);
      return JSON.stringify({
        error: "Failed to fetch real weather data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },
  {
    name: "getWeather",
    description: "Get the real-time weather information for a given location using an external API.",
    schema: z.object({
      location: z.string().describe("The location to get weather for (e.g., 'London', 'Beijing')"),
      date: z.string().optional().describe("The date is currently ignored as this tool returns real-time current weather."),
    }),
  },
);

const getOperationAdvice = tool(
  async ({ query }) => {
    const retrievedDocs = await vectorStore.similaritySearch(query, 2);
    const serialized = retrievedDocs
      .map(
        (doc) => `Source: ${doc.metadata.source}\nContent: ${doc.pageContent}`
      )
      .join("\n");

    // 返回 JSON 字符串，以便前端可以解析并渲染，同时 LLM 也能读取内容
    return JSON.stringify({
      text: serialized,
      docs: retrievedDocs
    });
  },
  {
    name: "getOperationAdvice",
    description: "主要用于处理K8s运维相关的问题，根据问题，从数据库找出相似的案例，并提出相应的操作建议",
    schema: z.object({
      query: z.string().describe("根据问题提出相应的操作建议"),
    }),
  }
)

const tools = [getWeather, getOperationAdvice];

async function chat_node(state: AgentState, config: RunnableConfig) {
  const model = new ChatOpenAI({
    model: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com",
    },
  });
  console.log(123456, state);

  const modelWithTools = model.bindTools!([
    ...convertActionsToDynamicStructuredTools(state.copilotkit?.actions ?? []),
    ...tools,
  ]);

  const contextText = (state.copilotkit?.context ?? [])
    .map((c) => `${c.description}: ${c.value}`)
    .join("\n");
  const systemMessage = new SystemMessage({
    content: `You are a helpful assistant. Use the provided context when relevant.\n\nContext:\n${contextText}\n\nProverbs: ${JSON.stringify(
      state.proverbs
    )}`,
  });

  const response = await modelWithTools.invoke(
    [systemMessage, ...state.messages],
    config,
  );
  return {
    messages: response,
  };
}

function shouldContinue({ messages, copilotkit }: AgentState) {
  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls?.length) {
    const actions = copilotkit?.actions;
    const toolCallName = lastMessage.tool_calls![0].name;

    if (!actions || actions.every((action) => action.name !== toolCallName)) {
      return "tool_node";
    }
  }

  return "__end__";
}

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("chat_node", chat_node)
  .addNode("tool_node", new ToolNode(tools))
  .addEdge(START, "chat_node")
  .addEdge("tool_node", "chat_node")
  .addConditionalEdges("chat_node", shouldContinue as any);

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});
