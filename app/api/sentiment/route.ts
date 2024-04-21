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

async function querySentiment(inputText: string) {
  const gclouddata = {
    text: inputText,
  };

  try {
    const gcloudresponse = await fetch(
      process.env.GCLOUD_FUNCTION_SENTIMENT_EMOTIONS_URL as string,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GCLOUD_FUNCTION_KEY}`,
        },
        body: JSON.stringify(gclouddata),
      }
    );

    if (!gcloudresponse.ok) {
      throw new Error(`Error: ${gcloudresponse.status}`);
    }

    const responseData = await gcloudresponse.json();

    return responseData.results;
  } catch (error) {
    console.error("Error calling GCloud Function:", error);
    throw error; // Rethrow the error to handle it in the calling function
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
