import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Angry, Laugh, Meh } from "lucide-react";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface Sentiment {
  label: string;
  score: number;
  category: string;
}

interface SentimentAnalysisProps {
  text: string;
  sentenceId?: Id<"finalizedSentences">;
  sentimentProp?: Sentiment[];
}

const SentimentAnalysis: React.FC<SentimentAnalysisProps> = ({
  text,
  sentenceId,
  sentimentProp,
}) => {
  const [topSentiments, setTopSentiments] = useState<Sentiment[]>([]);

  const updateSentenceWithSentimentEmotion = useMutation(
    api.transcript.updateSentenceWithSentimentEmotion
  );

  useEffect(() => {
    const fetchSentiment = async () => {
      try {
        const response = await fetch("/api/sentiment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze sentiment");
        }

        const result = await response.json();
        setTopSentiments(result.topSentiments);

        updateSentenceWithSentimentEmotion({
          finalizedSentenceId: sentenceId!,
          sentiment: result.topSentiments,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error:", error.message);
        } else {
          console.error("An unknown error occurred");
        }
      }
    };

    if (text && !sentimentProp?.length) {
      fetchSentiment();
    }
  }, [text, sentenceId, updateSentenceWithSentimentEmotion]);

  const getEmotionColor = (category: string) => {
    switch (category) {
      case "positive":
        return {
          text: "text-[hsl(var(--rag-green))]",
          background: "bg-[hsl(var(--rag-green))]",
        };
      case "negative":
        return {
          text: "text-[hsl(var(--rag-red))]",
          background: "bg-[hsl(var(--rag-red))]",
        };
      case "neutral":
        return {
          text: "text-gray-500",
          background: "bg-gray-500",
        };
      default:
        return {
          text: "text-black",
          background: "bg-black",
        };
    }
  };

  return (
    <div>
      {sentimentProp && sentimentProp.length > 0 && (
        <div className="flex flex-row mt-4">
          <div className="flex flex-row space-x-4">
            {sentimentProp.slice(0, 3).map((sentiment, index) => {
              const { text: textColor, background: bgColor } = getEmotionColor(
                sentiment.category
              );
              return (
                <div className="flex flex-col space-y-1" key={index}>
                  <div className="flex flex-row space-x-2">
                    <p className={`text-sm capitalize w-24 ${textColor}`}>
                      {sentiment.label}
                    </p>
                  </div>
                  <Progress
                    value={Number((sentiment.score * 100).toFixed(2))}
                    className="h-2"
                    indicatorColor={bgColor}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SentimentAnalysis;
