"use client";

import { useCoAgent, useCopilotAction, useCopilotChat, useHumanInTheLoop, useLangGraphInterrupt } from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useEffect, useState } from "react";

export default function CopilotKitPage() {
  const [themeColor, setThemeColor] = useState("#6366f1");

  useCopilotAction({
    name: "setThemeColor",
    description: "Set the theme color of the page.",
    parameters: [{
      name: "themeColor",
      description: "The theme color to set. Make sure to pick nice colors.",
      required: true,
    }],
    handler({ themeColor }) {
      console.log(themeColor);
      setThemeColor(themeColor);
    },
  });

  return (
    <main style={{ "--copilot-kit-primary-color": themeColor } as CopilotKitCSSProperties}>
      <YourMainContent themeColor={themeColor} />
      <CopilotSidebar
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Popup Assistant",
          initial: "👋 嗨！你正在与一个智能体聊天。这个智能体内置了一些工具，帮助你快速上手\n\n你可以尝试:\n- **前端工具**: \"把主题设置为绿色\n- **生成 UI**: \"今天杭州天气怎么样？\"\n\n- **查询问题**: \"etcd差移量不为0是什么问题？\"\n\n- **操作数据库**: \"帮我在数据库中添加一个叫蔡徐坤的歌手\"\n\n- **人机交互（Human In The Loop）**: \"帮我在数据库中查找一下那个歌手\"\n\n在你与智能体交互的过程中，你会看到界面实时更新，反映智能体的状态、工具调用以及执行进度。"
        }}
      />
    </main>
  );
}

// State of the agent, make sure this aligns with your agent's state.
type AgentState = {
  proverbs: string[];
  messages?: any[]
}

function YourMainContent({ themeColor }: { themeColor: string }) {
  // 🪁 Shared State: https://docs.copilotkit.ai/coagents/shared-state
  const { state, setState, run } = useCoAgent<AgentState>({
    name: "starterAgent",
    initialState: {
      proverbs: [
        "CopilotKit may be new, but its the best thing since sliced bread.",
      ]
    },
  })

  useLangGraphInterrupt({

    render: ({ event, resolve, result }) => {
      console.log(result);
      return (
        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            onClick={() => resolve("confirm")}
          >
            确认执行
          </button>
          <button
            className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            onClick={() => resolve("cancel")}
          >
            取消
          </button>
        </div>
      );
    },
  })

  useCopilotAction({
    name: 'createSql',
    description: '根据指令在数据库执行相应的SQL语句，数据库中包含音乐内容（歌手、专辑、歌曲）、客户与员工、销售订单与明细、播放列表等内容，只处理添加、create、insert数据的操作',
    available: "disabled",
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The SQL query to create.',
        required: true,
      }
    ],
    render: ({ status, args, result }) => {
      console.log(status, args, result);
      // 当处于执行中或完成状态时显示
      return (
        <div className="p-4 rounded-lg text-white text-sm" style={{
          backgroundColor: themeColor, marginTop: '1rem'
        }}>
          <p className="font-bold mb-2">已生成 SQL 查询:</p>
          <code className="block bg-green-50 p-2 rounded mb-2 break-all" style={{ color: themeColor }}>{args.query}</code>

          {result && (
            <div className="mt-2 border-t border-green-200 pt-2">
              <p className="font-bold">执行结果:</p>
              <pre className="text-xs overflow-auto max-h-40 bg-green-50" style={{ color: themeColor }}>{JSON.stringify(result)}</pre>
            </div>
          )}
        </div>
      );
    }
  })

  useHumanInTheLoop({
    name: 'confirmSingle',
    description: '当用户需要查询歌手、歌曲或专辑，但是没有输入具体的名称时，必须调用此工具向用户要求输入具体的姓名或名称。不要自己猜测。',
    parameters: [
      {
        name: 'artists',
        type: 'string',
        description: '歌手的名字',
        required: true
      }
    ],
    render: ({ args, status, respond, result }) => {
      console.log(args, status, respond, result);
      const [value, setValue] = useState<string>("")
      if (status === "executing" && respond) {
        return (
          <div className="p-6 w-full max-w-md mx-auto bg-white border border-gray-200 rounded-xl shadow-sm transition-all hover:shadow-md my-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-indigo-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <h3 className="font-semibold text-lg text-gray-800">需要明确信息</h3>
              </div>
              
              <p className="text-gray-600 text-sm">
                关于 <span className="font-medium text-indigo-600">"{args.artists}"</span>，请提供更确切的姓名以确保查询准确。
              </p>
              
              <div className="flex gap-2">
                <input 
                  value={value} 
                  onChange={(e) => setValue(e.target.value)} 
                  type="text" 
                  placeholder="请输入具体姓名..." 
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-gray-800"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && value.trim()) {
                      respond(value);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!value.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap"
                  onClick={() => respond(value)}
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        );
      }
      return <></>;
    }
  })

  useCopilotAction({
    name: 'handleSql',
    description: '主要用于处理数据库相关的问题，数据库中包含音乐内容（歌手、专辑、歌曲）、客户与员工、销售订单与明细、播放列表等内容，根据问题从数据库执行相应的SQL语句，只处理查询，不处理删除、修改与创建的操作',
    available: "disabled",
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: '根据问题执行相应的SQL语句',
        required: true,
      }
    ],
    render: ({ status, args, result }) => {
      console.log(status, args, result);
      // 当处于执行中或完成状态时显示
      return (
        <div className="p-4  rounded-lg text-white text-sm" style={{ backgroundColor: themeColor, marginTop: '1rem' }}>
          <p className="font-bold mb-2">已生成 SQL 查询:</p>
          <code className="block bg-green-50 p-2 rounded mb-2 break-all" style={{ color: themeColor }}>{args.query}</code>

          {result && (
            <div className="mt-2 border-t pt-2">
              <p className="font-bold">执行结果:</p>
              <pre className="text-xs overflow-auto max-h-40 bg-green-50" style={{ color: themeColor }}>{JSON.stringify(result)}</pre>
            </div>
          )}
        </div>
      );
    }
  })

  const [ds, setDs] = useState<string[]>([])



  useCopilotAction({
    name: "addProverb",
    description: "Add a proverb to the list.",
    parameters: [{
      name: "proverb",
      description: "The proverb to add. Make it witty, short and concise.",
      required: true,
    }],
    handler: ({ proverb }) => {
      setState((prevState) => ({
        ...prevState,
        proverbs: [...(prevState?.proverbs || []), proverb],
      }));
    },
  }, [setState]);

  //🪁 Generative UI: https://docs.copilotkit.ai/coagents/generative-ui
  useCopilotAction({
    name: "getWeather",
    description: "Get the weather for a given location.",
    available: "disabled",
    parameters: [
      { name: "location", type: "string", required: true },

    ],
    render: ({ status, args, result }) => {
      if (status !== "complete" || !result) {
        return (
          <div className="p-4 bg-gray-100 rounded-lg animate-pulse text-gray-500 text-sm">
            正在查询 {args.location} 的天气...
          </div>
        );
      }
      let data: any = {};
      try {
        data = typeof result === "string" ? JSON.parse(result) : result;
      } catch { }
      return (
        <WeatherCard
          location={data.location ?? args.location}
          themeColor={themeColor}
          date={data.date}
          temperature={data.temperature}
          temperature_c={data.temperature_c}
          temperature_f={data.temperature_f}
          conditions={data.conditions}
          humidity={data.humidity}
          wind_speed_kmph={data.wind_speed_kmph}
          feels_like_c={data.feels_like_c}
          uv_index={data.uv_index}
        />
      );
    },
  });

  useCopilotAction({
    name: "getOperationAdvice",
    description: "Get the operation advice for a given query.",
    available: "disabled",
    parameters: [
      { name: "query", type: "string", required: true },
    ],
    render: ({ status, args, result }) => {
      console.log(status, args, result);

      if (status !== "complete" || !result) {
        return (
          <div className="p-4 bg-gray-100 rounded-lg animate-pulse text-gray-500 text-sm">
            🔍 Searching knowledge base for "{args.query}"...
          </div>
        );
      }

      let docs: any[] = [];
      try {
        const parsed = typeof result === "string" ? JSON.parse(result) : result;
        docs = parsed.docs || [];
      } catch (e) {
        console.error("Failed to parse result:", e);
      }
      const sources = Array.from(new Set(docs.map((doc: any) => doc.metadata?.source || "").filter(Boolean)));
      console.log(sources);

      setDs(Array.from(new Set([...sources, ...(ds || [])])))
      return (
        <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-60 overflow-y-auto">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
            📚 发现 {sources.length} 个相关文档
          </h3>
          {sources.map((source: any, i: number) => (
            <div key={i} className="text-sm bg-white p-3 rounded border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="font-medium text-blue-600 mb-1 text-xs break-all">
                {source.split('/').pop() || "Unknown Source"}
              </div>
              <div className="text-gray-600 line-clamp-3 text-xs font-mono bg-gray-50 p-1 rounded" style={{ height: "70px" }}>
                文档存储于：{source || ""}
              </div>
            </div>
          ))}
        </div>
      );
    }
  });

  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="h-screen w-screen flex justify-center items-center flex-col transition-colors duration-300"
    >
      <div className="bg-white/20 backdrop-blur-md p-8 rounded-2xl shadow-xl max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">你可能需要用到的文档</h1>
        <hr className="border-white/20 my-6" />
        <div className="flex flex-col gap-3">
          {ds?.map((doc, index) => (
            <div key={index} className="text-sm bg-white p-3 rounded border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="font-medium text-blue-600 mb-1 text-xs break-all">
                {(doc || '').split('/').pop() || "Unknown Source"}
              </div>
              <div className="text-gray-600 line-clamp-3 text-xs font-mono bg-gray-50 p-1 rounded" style={{ height: "70px" }}>
                文档存储于：{doc || ""}
              </div>
            </div>
          ))}
        </div>
        {state.proverbs?.length === 0 && <p className="text-center text-white/80 italic my-8">
          No proverbs yet. Ask the assistant to add some!
        </p>}
      </div>
    </div>
  );
}

// Simple sun icon for the weather card
function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14 text-yellow-200">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeWidth="2" stroke="currentColor" />
    </svg>
  );
}

// Weather card component where the location and themeColor are based on what the agent
// sets via tool calls.
function WeatherCard({
  location,
  themeColor,
  date,
  temperature,
  temperature_c,
  temperature_f,
  conditions,
  humidity,
  wind_speed_kmph,
  feels_like_c,
  uv_index,
}: {
  location?: string,
  themeColor: string,
  date?: string,
  temperature?: number,
  temperature_c?: number,
  temperature_f?: number,
  conditions?: string,
  humidity?: number,
  wind_speed_kmph?: number,
  feels_like_c?: number,
  uv_index?: number,
}) {
  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="rounded-xl shadow-xl mt-6 mb-4 max-w-md w-full"
    >
      <div className="bg-white/20 p-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white capitalize">{location}</h3>
            <p className="text-white">{date || "当前天气"}</p>
          </div>
          <SunIcon />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="text-3xl font-bold text-white">
            {typeof temperature_c === "number" ? `${Math.round(temperature_c)}°C` : typeof temperature_f === "number" ? `${Math.round(temperature_f)}°F` : "-"}
          </div>
          <div className="text-sm text-white">{conditions || "-"}</div>
        </div>

        <div className="mt-4 pt-4 border-t border-white">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-white text-xs">湿度</p>
              <p className="text-white font-medium">{typeof humidity === "number" ? `${humidity}%` : "-"}</p>
            </div>
            <div>
              <p className="text-white text-xs">风速</p>
              <p className="text-white font-medium">{typeof wind_speed_kmph === "number" ? `${wind_speed_kmph} km/h` : "-"}</p>
            </div>
            <div>
              <p className="text-white text-xs">体感温度</p>
              <p className="text-white font-medium">{typeof feels_like_c === "number" ? `${feels_like_c}°C` : "-"}</p>
            </div>
            <div>
              <p className="text-white text-xs">紫外线指数</p>
              <p className="text-white font-medium">{typeof uv_index === "number" ? uv_index : "-"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
