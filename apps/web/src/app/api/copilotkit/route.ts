import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
  LangChainAdapter,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { NextRequest } from "next/server";
import { graph } from "@repo/agent";

const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages, threadId }) => {
    const result = await graph.invoke({ messages: messages as any }, { configurable: { thread_id: threadId } });
    return result.messages[result.messages.length - 1] as any;
  },
});

const runtime = new CopilotRuntime({
  agents: {
    starterAgent: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8123",
      graphId: "starterAgent",
      langsmithApiKey: process.env.LANGSMITH_API_KEY || "",
    })
  }
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
