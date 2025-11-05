"use client";

import { PreviewMessage, ThinkingMessage } from "@/components/message";
import { MultimodalInput } from "@/components/multimodal-input";
import { Overview } from "@/components/overview";
import { Button } from "@/components/ui/button";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { Bot, Settings2, Sparkles } from "lucide-react";
import React from "react";
import { toast } from "sonner";

export function Chat() {
  const chatId = "001";
  const [useOllama, setUseOllama] = React.useState(false);
  const [ollamaModel, setOllamaModel] = React.useState("deepseek-r1:8b");
  const [ollamaUrl, setOllamaUrl] = React.useState("http://localhost:11434");
  const [showSettings, setShowSettings] = React.useState(false);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    ...(useOllama && {
      fetch: async (url: string, options?: RequestInit) => {
        return fetch("/api/chat/ollama", {
          ...options,
          body: JSON.stringify({
            ...JSON.parse(options?.body as string || "{}"),
            model: ollamaModel,
            ollama_url: ollamaUrl
          }),
        });
      }
    }),
    onError: (error: Error) => {
      if (error.message.includes("Too many requests")) {
        toast.error(
          "You are sending too many messages. Please try again later."
        );
      } else if (error.message.includes("503")) {
        toast.error(
          "Ollama service is not available. Please check your connection."
        );
      } else {
        toast.error("An error occurred. Please try again.");
      }
    },
  });

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [input, setInput] = React.useState("");

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };

  return (
    <div className="flex flex-col min-w-0 h-[calc(100dvh-52px)] bg-background">
      {/* AI Provider Selection Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between p-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {useOllama ? (
                <Bot className="h-5 w-5 text-blue-500" />
              ) : (
                <Sparkles className="h-5 w-5 text-purple-500" />
              )}
              <span className="font-medium text-sm">
                {useOllama ? `Ollama (${ollamaModel})` : "OpenAI GPT-4"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={!useOllama ? "default" : "outline"}
                size="sm"
                onClick={() => setUseOllama(false)}
                className="h-7 text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                OpenAI
              </Button>
              <Button
                variant={useOllama ? "default" : "outline"}
                size="sm"
                onClick={() => setUseOllama(true)}
                className="h-7 text-xs"
              >
                <Bot className="h-3 w-3 mr-1" />
                Ollama
              </Button>
            </div>
          </div>
          
          {useOllama && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="h-7"
            >
              <Settings2 className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {/* Ollama Settings Panel */}
        {useOllama && showSettings && (
          <div className="border-t bg-background p-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Model
                </label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md bg-background text-foreground text-sm"
                >
                  <option value="llama3.2">Llama 3.2</option>
                  <option value="deepseek-r1:8b">DeepSeek R1 8B</option>
                  <option value="phi4-mini">Phi 4 Mini</option>
                  <option value="mistral">Mistral</option>
                  <option value="qwen2.5">Qwen 2.5</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Ollama URL
                </label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md bg-background text-foreground text-sm"
                  placeholder="http://localhost:11434"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={messagesContainerRef}
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
      >
        {messages.length === 0 && <Overview />}

        {messages.map((message: UIMessage, index: number) => (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            message={message}
            isLoading={isLoading && messages.length - 1 === index}
          />
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput
          chatId={chatId}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
          messages={messages}
          setMessages={setMessages}
          sendMessage={sendMessage}
        />
      </form>
    </div>
  );
}
