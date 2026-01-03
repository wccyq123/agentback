import { z } from "zod";
import { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
import { MongoClient } from "mongodb";
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi';
import { MONGODB_URI, QIANWEN_API_KEY } from "./constants";
import { SqlDatabase } from "@langchain/classic/sql_db";
import { DataSource } from "typeorm";
import {
  convertActionsToDynamicStructuredTools,
  CopilotKitStateAnnotation,
} from "@copilotkit/sdk-js/langgraph";
import { Annotation, interrupt, Command } from "@langchain/langgraph";
import { sanitizeSqlQuery } from "./utils/sql";
import { getSqlPrompt } from "./utils/prompts";

dotenv.config();

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
let db: SqlDatabase | undefined;
async function getDb() {
  if (!db) {
    const datasource = new DataSource({ type: "sqlite", database: './chinook.db' });
    db = await SqlDatabase.fromDataSourceParams({ appDataSource: datasource });
  }
  return db;
}
async function getSchema() {
  const db = await getDb();
  return await db.getTableInfo();
}

const toolResponsePrompts: Record<string, string> = {
  handleSql: await getSqlPrompt(getSchema),
};

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

const handleSql = tool(async ({ query }, { toolCall }) => {
  const q = sanitizeSqlQuery(query);
  console.log('系统检测到敏感 SQL 操作');

  const reply = interrupt(`系统检测到敏感 SQL 操作: ${q}。请输入 "confirm" 确认执行。`);
  if (reply !== "confirm") {
    return {
      messages: [
        new ToolMessage({
          tool_call_id: toolCall.id!,
          content: "User rejected SQL execution.",
          name: toolCall.name,
        })
      ]
    };
  }
  console.log(query, 'query');

  if (!db) {
    db = await getDb();
  }

  try {
    const result = await db.run(q);
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch (e: any) {
    throw new Error(e?.message ?? String(e))
  }
}, {
  name: "handleSql",
  description: "主要用于处理数据库相关的问题，数据库中包含音乐内容（歌手、专辑、歌曲）、客户与员工、销售订单与明细、播放列表等内容，根据问题从数据库执行相应的SQL语句，只处理查询，不处理删除、修改与创建的操作。注意：如果用户的问题比较模糊，例如只说“查询歌手”但没说具体是谁，请不要使用此工具，而是通过其他方式询问用户。",
  schema: z.object({
    query: z.string().describe("根据问题执行相应的SQL语句"),
  }),
})

const createSql = tool(async ({ query }, { toolCall }) => {
  console.log(query, '1234query');

  const reply = interrupt(`系统检测到敏感 SQL 操作: ${toolCall.args.query}。请输入 "confirmed" 或 "yes" 确认执行。`);
  console.log(reply, 'reply');

  if (reply !== "confirm") {
    return {
      messages: [
        new ToolMessage({
          tool_call_id: toolCall.id!,
          content: "User rejected SQL execution.",
          name: toolCall.name,
        })
      ]
    };
  }
  if (!db) {
    db = await getDb();
  }
  try {
    const result = await db.run(query);
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch (e: any) {
    throw new Error(e?.message ?? String(e))
  }
}, {
  name: "createSql",
  description: "根据指令在数据库执行相应的SQL语句，数据库中包含音乐内容（歌手、专辑、歌曲）、客户与员工、销售订单与明细、播放列表等内容，只处理添加、create、insert数据的操作",
  schema: z.object({
    query: z.string().describe("根据问题执行相应的SQL语句"),
  }),
})


const tools = [getWeather, getOperationAdvice, handleSql];
const noSafeTools = [createSql];

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
    ...noSafeTools,
  ]);

  const contextText = (state.copilotkit?.context ?? [])
    .map((c: any) => `${c.description}: ${c.value}`)
    .join("\n");
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCall = lastMessage.tool_calls?.[0];
  const extraToolPrompt = toolResponsePrompts[toolCall?.name ?? ''];
  console.log(extraToolPrompt, 'extraToolPrompt');

  const systemMessage = new SystemMessage({
    content: `You are a helpful assistant. Use the provided context when relevant.\n\nContext:\n${contextText}\n\nProverbs: ${JSON.stringify(
      state.proverbs
    )}\n\n${extraToolPrompt}`,
  });

  const response = await modelWithTools.invoke(
    [systemMessage, ...state.messages],
    config,
  );
  return {
    messages: [...state.messages, response],
  };
}

// const toolNode = new ToolNode(tools);

// async function custom_tool_node(state: AgentState, config: RunnableConfig) {
//   const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
//   const toolCall = lastMessage.tool_calls?.[0];

//   if (toolCall?.name === "handleSql") {
//     // Check for confirmation in the last human message
//     const reversedMessages = [...state.messages].reverse();
//     const lastHumanMessage = reversedMessages.find(m => m._getType() === "human");

//     const isConfirmed = lastHumanMessage && (
//       lastHumanMessage.content.toString().includes("确认") ||
//       lastHumanMessage.content.toString().toLowerCase().includes("yes")
//     );
//     console.log(toolCall.args.query, 'toolCall.args.query');

//     if (!isConfirmed) {
//       return {
//         messages: [
//           new ToolMessage({
//             tool_call_id: toolCall.id!,
//             content: `请求用户确认`,
//             name: toolCall.name
//           }),
//           new AIMessage({
//             content: `系统安全拦截：执行 SQL 需要用户确认。SQL语句: ${toolCall.args.query}。请输入"确认"或"yes"以继续。`,
//           })
//         ]
//       };
//     }
//   }

//   // Delegate to the real ToolNode
//   return toolNode.invoke(state, config);
// }

function shouldContinue({ messages, copilotkit }: AgentState) {
  const lastMessage = messages[messages.length - 1] as AIMessage;
  console.log(lastMessage, 111111);

  if (lastMessage.tool_calls?.length) {
    const actions = copilotkit?.actions;
    const toolCallName = lastMessage.tool_calls![0].name;
    console.log(toolCallName, 'toolCallName');

    if (toolCallName === "createSql") {
      return "no_safe_tool_node";
    }
    if (!actions || actions.every((action: any) => action.name !== toolCallName)) {
      return "tool_node";
    }
  }

  return "__end__";
}

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("chat_node", chat_node)
  .addNode("tool_node", new ToolNode(tools))
  .addNode("no_safe_tool_node", new ToolNode(noSafeTools))
  .addEdge(START, "chat_node")
  .addEdge("tool_node", "chat_node")
  .addEdge("no_safe_tool_node", "chat_node")
  .addConditionalEdges("chat_node", shouldContinue as any);

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});

export { Command, AIMessage }