"use client";

import { PreviewMessage, ThinkingMessage } from "@/components/message";
import { MultimodalInput } from "@/components/multimodal-input";
import { Overview } from "@/components/overview";
import { Button } from "@/components/ui/button";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { Bot, Settings2, Sparkles, Wifi, WifiOff, RefreshCw } from "lucide-react";
import React from "react";
import { toast } from "sonner";

export function Chat() {
  const chatId = "001";
  const [useOllama, setUseOllama] = React.useState(true); // Default to Ollama
  const [ollamaModel, setOllamaModel] = React.useState("deepseek-r1:8b");
  const [ollamaUrl, setOllamaUrl] = React.useState("http://localhost:11434");
  const [showSettings, setShowSettings] = React.useState(false);
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = React.useState(false);
  const [ollamaConnected, setOllamaConnected] = React.useState(false);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    onError: (error: Error) => {
      console.error("Chat error:", error);
      if (error.message.includes("Too many requests")) {
        toast.error(
          "You are sending too many messages. Please try again later."
        );
      } else if (error.message.includes("503")) {
        toast.error(
          "Ollama service is not available. Please check your connection."
        );
      } else {
        toast.error(`An error occurred: ${error.message}`);
      }
    },
  });

  // Override the sendMessage function to use correct endpoint
  const customSendMessage = React.useCallback(async (message: any) => {
    const endpoint = useOllama ? "/api/chat/ollama" : "/api/chat";
    console.log(`Sending message to: ${endpoint}, useOllama: ${useOllama}, model: ${ollamaModel}`);
    
    if (useOllama) {
      // For Ollama, we need to send additional data
      const enhancedMessage = {
        ...message,
        data: {
          model: ollamaModel,
          ollama_url: ollamaUrl
        }
      };
      
      // Use fetch directly for Ollama
      const sendToOllama = async () => {
        console.log('Sending to Ollama with:', {
          messages: [...messages, { role: 'user', content: message.text || message.content }],
          model: ollamaModel,
          ollama_url: ollamaUrl
        });

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [...messages, { role: 'user', content: message.text || message.content }],
              model: ollamaModel,
              ollama_url: ollamaUrl
            }),
          });

          console.log('Response status:', response.status);
          console.log('Response headers:', response.headers);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
          }

          // Add user message immediately
          setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'user', 
            content: message.text || message.content,
            parts: [{ type: 'text', text: message.text || message.content }]
          } as any]);

          // Start assistant message
          const assistantId = (Date.now() + 1).toString();
          let assistantContent = '';
          
          setMessages(prev => [...prev, { 
            id: assistantId, 
            role: 'assistant', 
            content: '',
            parts: [{ type: 'text', text: '' }]
          } as any]);

          // Handle streaming response
          const reader = response.body?.getReader();
          if (reader) {
            console.log('Starting to read stream...');
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log('Stream finished');
                break;
              }

              const chunk = new TextDecoder().decode(value);
              console.log('Received chunk:', chunk);
              
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    console.log('Stream done marker received');
                    continue;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    console.log('Parsed data:', parsed);
                    
                    if (parsed.type === 'text-delta' && parsed.delta) {
                      assistantContent += parsed.delta;
                      console.log('Updating content:', assistantContent);
                      
                      setMessages(prev => 
                        prev.map(msg => 
                          msg.id === assistantId 
                            ? { ...msg, content: assistantContent, parts: [{ type: 'text', text: assistantContent }] }
                            : msg
                        )
                      );
                    }
                  } catch (e) {
                    console.log('JSON parse error:', e, 'for data:', data);
                  }
                }
              }
            }
          } else {
            console.error('No reader available');
          }
        } catch (error) {
          console.error('Ollama request failed:', error);
          toast.error(`Failed to send message to Ollama: ${error}`);
        }
      };

      await sendToOllama();
    } else {
      // Use default sendMessage for OpenAI
      return await sendMessage(message);
    }
  }, [useOllama, ollamaModel, ollamaUrl, messages, sendMessage, setMessages]);

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [input, setInput] = React.useState("");

  const isLoading = status === "submitted" || status === "streaming";

  // Function to fetch available models from Ollama
  const fetchOllamaModels = React.useCallback(async () => {
    if (!ollamaUrl) return;
    
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/ollama/models?ollama_url=${encodeURIComponent(ollamaUrl)}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.models || []);
        setOllamaConnected(true);
        
        // If current model is not in the list, select the first available model
        if (data.models && data.models.length > 0 && !data.models.includes(ollamaModel)) {
          setOllamaModel(data.models[0]);
        }
      } else {
        setAvailableModels([]);
        setOllamaConnected(false);
        toast.error("Failed to fetch models from Ollama");
      }
    } catch (error) {
      setAvailableModels([]);
      setOllamaConnected(false);
      toast.error("Cannot connect to Ollama service");
    } finally {
      setIsLoadingModels(false);
    }
  }, [ollamaUrl, ollamaModel]);

  // Function to check Ollama connection
  const checkOllamaConnection = React.useCallback(async () => {
    if (!ollamaUrl) return;
    
    try {
      const response = await fetch(`/api/ollama/health?ollama_url=${encodeURIComponent(ollamaUrl)}`);
      if (response.ok) {
        const data = await response.json();
        setOllamaConnected(data.status === "connected");
      } else {
        setOllamaConnected(false);
      }
    } catch (error) {
      setOllamaConnected(false);
    }
  }, [ollamaUrl]);

  // Effect to fetch models when URL changes
  React.useEffect(() => {
    if (ollamaUrl && useOllama) {
      fetchOllamaModels();
    }
  }, [ollamaUrl, useOllama, fetchOllamaModels]);

  // Effect to check connection periodically
  React.useEffect(() => {
    if (useOllama) {
      checkOllamaConnection();
      const interval = setInterval(checkOllamaConnection, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [useOllama, checkOllamaConnection]);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (input.trim()) {
      customSendMessage({ text: input });
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
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-500" />
                  {ollamaConnected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                </div>
              ) : (
                <Sparkles className="h-5 w-5 text-purple-500" />
              )}
              <span className="font-medium text-sm">
                {useOllama ? (
                  <span>
                    Ollama ({ollamaModel})
                    <span className={`ml-2 text-xs ${ollamaConnected ? 'text-green-600' : 'text-red-600'}`}>
                      {ollamaConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </span>
                ) : (
                  "OpenAI GPT-4"
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={!useOllama ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log("Switching to OpenAI");
                  setUseOllama(false);
                }}
                className="h-7 text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                OpenAI
              </Button>
              <Button
                variant={useOllama ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log("Switching to Ollama");
                  setUseOllama(true);
                }}
                className="h-7 text-xs"
              >
                <Bot className="h-3 w-3 mr-1" />
                Ollama
              </Button>
            </div>
          </div>
          
          {useOllama && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchOllamaModels}
                disabled={isLoadingModels}
                className="h-7"
                title="Refresh models"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="h-7"
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Ollama Settings Panel */}
        {useOllama && showSettings && (
          <div className="border-t bg-background p-4 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Model {isLoadingModels && <span className="text-xs">(Loading...)</span>}
                </label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md bg-background text-foreground text-sm"
                  disabled={isLoadingModels}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="deepseek-r1:8b">DeepSeek R1 8B (Default)</option>
                      <option value="llama3.2">Llama 3.2 (Default)</option>
                      <option value="phi4-mini">Phi 4 Mini (Default)</option>
                      <option value="mistral">Mistral (Default)</option>
                      <option value="qwen2.5">Qwen 2.5 (Default)</option>
                    </>
                  )}
                </select>
                {!ollamaConnected && (
                  <p className="text-xs text-red-500 mt-1">
                    Not connected - showing default models
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Ollama URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="flex-1 px-3 py-1.5 border rounded-md bg-background text-foreground text-sm"
                    placeholder="http://localhost:11434"
                  />
                  <Button
                    size="sm"
                    onClick={fetchOllamaModels}
                    disabled={isLoadingModels}
                    className="px-3 py-1.5 h-auto text-xs"
                  >
                    {isLoadingModels ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your Ollama server URL and click Test to connect
                </p>
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
          sendMessage={customSendMessage}
        />
      </form>
    </div>
  );
}
