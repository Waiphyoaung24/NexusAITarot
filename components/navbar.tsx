"use client";

import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { Settings, Wifi, WifiOff } from "lucide-react";

export const Navbar = () => {
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [showSettings, setShowSettings] = useState(false);

  const checkOllamaConnection = async () => {
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      setOllamaConnected(response.ok);
    } catch (error) {
      setOllamaConnected(false);
    }
  };

  useEffect(() => {
    checkOllamaConnection();
    const interval = setInterval(checkOllamaConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [ollamaUrl]);

  return (
    <div className="p-2 flex flex-row gap-2 justify-between items-center">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">NexusAI Tarot</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-card border">
          {ollamaConnected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm text-muted-foreground">
            Ollama {ollamaConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings className="h-4 w-4" />
        </Button>

        {showSettings && (
          <div className="absolute top-12 right-2 bg-card border rounded-md p-4 shadow-lg z-50 min-w-[300px]">
            <h3 className="font-medium mb-2">Ollama Settings</h3>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Ollama URL:</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full px-3 py-1 border rounded-md bg-background text-foreground"
                placeholder="http://localhost:11434"
              />
              <Button
                size="sm"
                onClick={checkOllamaConnection}
                className="w-full"
              >
                Test Connection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
