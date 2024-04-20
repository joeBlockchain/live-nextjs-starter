import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

export const runtime = "edge";

async function getAuthToken() {
  return (await auth().getToken({ template: "convex" })) ?? undefined;
}

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

async function querySentiment(text: string) {
  const data = {
    inputs: text,
    parameters: { top_k: 28 },
  };

  const makeRequest = async () => {
    const response = await fetch(
      process.env.SENTINMENT_URL_ENDPOINT as string,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const result = await response.json();
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${result.error}`
      );
    }

    return response.json();
  };

  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Sending sentiment analysis request.`);
      const result = await makeRequest();
      console.log("Sentiment analysis response received!", result);
      return result;
    } catch (error) {
      // Type guard to check if error is an instance of Error
      if (error instanceof Error) {
        console.log(`Attempt ${attempt} failed:`, error.message);
        if (attempt === 30 || !error.message.includes("503")) {
          throw error;
        }
      } else {
        // Handle the case where error is not an instance of Error
        console.log(`Attempt ${attempt} failed with an unknown error`);
        throw new Error("An unknown error occurred");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
    }
  }
}

const emotionCategories: {
  [key: string]: { category: string; label: string };
} = {
  admiration: { category: "positive", label: "admiring" },
  amusement: { category: "positive", label: "amused" },
  approval: { category: "positive", label: "approving" },
  caring: { category: "positive", label: "caring" },
  curiosity: { category: "positive", label: "curious" },
  desire: { category: "positive", label: "desiring" },
  excitement: { category: "positive", label: "excited" },
  gratitude: { category: "positive", label: "grateful" },
  joy: { category: "positive", label: "joyful" },
  love: { category: "positive", label: "loving" },
  optimism: { category: "positive", label: "optimistic" },
  pride: { category: "positive", label: "proud" },
  realization: { category: "positive", label: "realizing" },
  relief: { category: "positive", label: "relieved" },
  surprise: { category: "positive", label: "surprised" },
  anger: { category: "negative", label: "angry" },
  annoyance: { category: "negative", label: "annoyed" },
  confusion: { category: "negative", label: "confused" },
  disappointment: { category: "negative", label: "disappointed" },
  disapproval: { category: "negative", label: "disapproving" },
  disgust: { category: "negative", label: "disgusted" },
  embarrassment: { category: "negative", label: "embarrassed" },
  fear: { category: "negative", label: "afraid" },
  grief: { category: "negative", label: "grieving" },
  nervousness: { category: "negative", label: "nervous" },
  remorse: { category: "negative", label: "remorseful" },
  sadness: { category: "negative", label: "sad" },
  neutral: { category: "neutral", label: "neutral" },
};

interface Sentiment {
  label: string;
  score: number;
}

const getTopSentiments = (sentimentData: Sentiment[]) => {
  if (!sentimentData || sentimentData.length === 0) return [];

  const sortedData = sentimentData.sort(
    (a: Sentiment, b: Sentiment) => b.score - a.score
  );
  const topSentiments = sortedData.slice(0, 3);

  const remainingSum = sortedData
    .slice(3)
    .reduce((sum: number, sentiment: Sentiment) => sum + sentiment.score, 0);

  return [
    ...topSentiments.map((sentiment: Sentiment) => ({
      ...sentiment,
      ...emotionCategories[sentiment.label],
    })),
    {
      score: remainingSum,
      category: "neutral",
      label: "Others",
    },
  ];
};

export async function POST(request: NextRequest) {
  const token = await getAuthToken();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { text } = await request.json();
    if (!text) {
      return new NextResponse(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ status: "Initiating" })}\n\n`
          )
        );
        await sleep(100);

        for (let attempt = 1; attempt <= 30; attempt++) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ status: `Attempt ${attempt}` })}\n\n`
              )
            );
            await sleep(100);

            const sentiment = await querySentiment(text);
            const topSentiments = getTopSentiments(sentiment);

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  status: "Completed",
                  topSentiments,
                })}\n\n`
              )
            );
            controller.close();
            break;
          } catch (error) {
            if (error instanceof Error) {
              if (attempt === 30 || !error.message.includes("503")) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      status: "Error",
                      error: error.message,
                    })}\n\n`
                  )
                );
                controller.close();
                break;
              }
            } else {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "Error",
                    error: "An unknown error occurred",
                  })}\n\n`
                )
              );
              controller.close();
              break;
            }
            await sleep(1000);
          }
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Error analyzing sentiment:", error);
    return new NextResponse(
      JSON.stringify({ error: "Failed to analyze sentiment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
