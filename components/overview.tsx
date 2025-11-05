import { motion } from "framer-motion";
import { Sparkles, Bot, Stars, Moon, Sun } from "lucide-react";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-8 flex flex-col gap-8 leading-relaxed text-center max-w-2xl mx-auto">
        <div className="flex flex-row justify-center gap-4 items-center mb-4">
          <div className="relative">
            <Stars className="h-8 w-8 text-purple-500" />
            <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" />
          </div>
          <span className="text-2xl">✨</span>
          <div className="relative">
            <Moon className="h-8 w-8 text-blue-400" />
            <Sun className="h-4 w-4 text-orange-400 absolute -top-1 -right-1" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            NexusAI Tarot
          </h1>
          <p className="text-lg text-muted-foreground">
            Your AI-powered tarot reading companion
          </p>
        </div>

        <div className="space-y-4 text-left">
          <div className="bg-card/50 rounded-lg p-4 border">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              What can I help you with?
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Perform tarot card readings for guidance</li>
              <li>• Interpret card meanings and symbolism</li>
              <li>• Explore different tarot spreads</li>
              <li>• Provide insights for personal growth</li>
            </ul>
          </div>

          <div className="bg-card/50 rounded-lg p-4 border">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-500" />
              AI Models Available
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>• OpenAI GPT-4</div>
              <div>• Ollama (Local)</div>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Start by asking for a tarot reading or choose your preferred AI model above.
        </p>
      </div>
    </motion.div>
  );
};
