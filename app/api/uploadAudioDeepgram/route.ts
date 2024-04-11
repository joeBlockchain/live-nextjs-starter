import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { createClient } from "@deepgram/sdk";
import { api } from "@/convex/_generated/api";
import { fetchMutation, fetchAction } from "convex/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // defaults to process.env["ANTHROPIC_API_KEY"]
});

async function proposeMeetingTitle(transcript: string): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      temperature: 0,
      system:
        "You are a helpful assistant tasked with proposing a meeting title based on the following transcript. Use JSON format with the key 'title'.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "here is my transcript\n " +
                transcript +
                "\n\nPropose a meeting title based on this transcript using JSON format with the key 'title'.",
            },
          ],
        },
      ],
    });

    if (!msg.content || msg.content.length === 0) {
      throw new Error("Anthropic response is empty or not in expected format");
    }

    // Assuming the 'text' property of the first object in the array contains the JSON string
    const jsonString = msg.content[0].text;

    // Now you can parse jsonString because it's a string
    const contentObj = JSON.parse(jsonString);
    if (!contentObj.title) {
      throw new Error(
        "Failed to extract meeting title from Anthropic response"
      );
    }

    // Return just the title string
    return contentObj.title;
  } catch (error) {
    console.error("Anthropic Error:", error);
    throw new Error("Failed to generate meeting title");
  }
}

async function getAuthToken() {
  return (await auth().getToken({ template: "convex" })) ?? undefined;
}

function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

const encoder = new TextEncoder();

async function* makeIterator(
  formData: FormData,
  userId: string,
  token: string
) {
  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Authenticating" })}\n\n`
  );
  await sleep(200);

  yield encoder.encode(`data: ${JSON.stringify({ status: "Initiating" })}\n\n`);
  await sleep(200);

  const file = formData.get("file") as File;

  const meetingIdParam = formData.get("meetingId") as string | null;
  let meetingID: Id<"meetings">;

  if (meetingIdParam) {
    meetingID = meetingIdParam as Id<"meetings">;
  } else {
    const meetingResponse = await fetchMutation(
      api.meetings.createMeeting,
      { title: file.name },
      { token }
    );
    meetingID = meetingResponse.meetingId;
  }

  yield encoder.encode(`data: ${JSON.stringify({ status: "Uploading" })}\n\n`);
  await sleep(200);

  if (!file) {
    throw new Error("No file uploaded");
  }

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Transcribing" })}\n\n`
  );
  await sleep(200);

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
  const fileBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(fileBuffer);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    buffer,
    {
      model: "nova-2",
      smart_format: true,
      diarize: true,
    }
  );

  if (error) {
    throw new Error("Deepgram API error");
  }

  const audioDurationInSeconds = Math.floor(result.metadata.duration);

  const updateDurationResponse = await fetchMutation(
    api.meetings.updateMeetingDetails,
    {
      meetingID,
      updates: {
        duration: Math.floor(audioDurationInSeconds),
      },
    },
    { token }
  );

  // Call proposeMeetingTitle without awaiting and store the promise
  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Propose Title" })}\n\n`
  );
  await sleep(200);

  // Extract the transcript from the result
  const completeTranscript =
    result.results.channels[0].alternatives[0].transcript;

  const proposeTitlePromise = proposeMeetingTitle(completeTranscript);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing speakers" })}\n\n`
  );
  await sleep(200);

  const uniqueSpeakers = new Set(
    result.results.channels[0].alternatives[0].words.map(
      (word: any) => word.speaker
    )
  );
  const speakerArray = Array.from(uniqueSpeakers);
  const speakerMap = new Map<number, string>();

  for (const speakerNumber of speakerArray) {
    const speakerID = await fetchMutation(
      api.meetings.addSpeaker,
      {
        meetingID,
        speakerNumber,
        firstName: "",
        lastName: "",
        voiceAnalysisStatus: "analyzing",
      },
      { token }
    );
    speakerMap.set(speakerNumber, speakerID);
  }

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing transcript" })}\n\n`
  );
  await sleep(200);

  const words = result.results.channels[0].alternatives[0].words;
  let currentSpeaker = words[0].speaker;
  let currentTranscript = "";
  let startTime = words[0].start;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentTranscript += word.punctuated_word + " ";

    if (i === words.length - 1 || word.speaker !== currentSpeaker) {
      const endTime = word.end;
      const speakerId = speakerMap.get(currentSpeaker as number);

      if (speakerId) {
        await fetchMutation(
          api.transcript.storeFinalizedSentence,
          {
            transcript: currentTranscript,
            end: endTime,
            meetingID,
            speaker: Number(currentSpeaker),
            speakerId: speakerId as Id<"speakers">,
            start: startTime,
          },
          { token }
        );
      }

      currentTranscript = "";
      startTime = word.start;
      currentSpeaker = word.speaker;
    }
  }

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Generate embeddings" })}\n\n`
  );
  await sleep(200);

  await fetchAction(
    api.generateEmbeddings.createEmbeddingsforFinalizedSentencesInMeetingID,
    { meetingId: meetingID },
    { token }
  );

  yield encoder.encode(`data: ${JSON.stringify({ status: "Save audio" })}\n\n`);
  await sleep(200);

  const uploadUrl = await fetchMutation(
    api.transcript.generateAudioUploadUrl,
    {},
    { token }
  );

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "audio/webm" },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    throw new Error("Failed to upload audio blob");
  }
  const { storageId } = await uploadResponse.json();

  await fetchMutation(
    api.transcript.sendAudio,
    {
      meetingID,
      storageId,
    },
    { token }
  );

  // Await the proposeTitlePromise to get the proposed title
  const proposedTitle = await proposeTitlePromise;

  // Update the meeting title
  const updateTitleResponse = await fetchMutation(
    api.meetings.updateMeetingDetails,
    {
      meetingID,
      updates: {
        newTitle: proposedTitle,
      },
    },
    { token }
  );

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Completed", meetingID })}\n\n`
  );
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    const token = (await getAuthToken()) ?? "";

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const formData = await request.formData();
    const iterator = makeIterator(formData, userId, token);
    const stream = iteratorToStream(iterator);

    return new NextResponse(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
