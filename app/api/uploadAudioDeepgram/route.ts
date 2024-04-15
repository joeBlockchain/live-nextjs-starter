// uploadAuddioDeepgram/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { createClient } from "@deepgram/sdk";
import { api } from "@/convex/_generated/api";
import { fetchMutation, fetchAction } from "convex/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function extractAudioClip(
  buffer: Buffer,
  speakerId: Id<"speakers">,
  speakerNumber: number,
  start: number,
  end: number,
  meetingID: Id<"meetings">,
  authToken: string
): Promise<Buffer> {
  console.log("Extracting audio clip...");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const clipAudioUrl = `${baseUrl}/api/clip-audio`;
  console.log(
    "Extracting audio clip and sending to Deepgram at url path:",
    clipAudioUrl
  );

  const response = await fetch(clipAudioUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      buffer: buffer.toString("base64"),
      speakerId,
      speakerNumber,
      start,
      end,
      meetingID,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to clip audio!");
  }

  const clippedAudioBuffer = await response.arrayBuffer();
  return Buffer.from(clippedAudioBuffer);
}

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

    const jsonString = msg.content[0].text;
    const contentObj = JSON.parse(jsonString);
    if (!contentObj.title) {
      throw new Error(
        "Failed to extract meeting title from Anthropic response"
      );
    }

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
  await sleep(100);

  yield encoder.encode(`data: ${JSON.stringify({ status: "Initiating" })}\n\n`);
  await sleep(100);

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
  await sleep(100);

  if (!file) {
    throw new Error("No file uploaded");
  }

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Transcribing" })}\n\n`
  );
  await sleep(100);

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

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Propose Title" })}\n\n`
  );
  await sleep(100);

  const completeTranscript =
    result.results.channels[0].alternatives[0].transcript;

  const proposeTitlePromise = proposeMeetingTitle(completeTranscript);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing speakers" })}\n\n`
  );
  await sleep(100);

  const words = result.results.channels[0].alternatives[0].words;
  const uniqueSpeakers = new Set(words.map((word: any) => word.speaker));
  const speakerArray = Array.from(uniqueSpeakers);
  const speakerMap = new Map<
    number,
    { speakerId: Id<"speakers">; storageId: string }
  >();

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
    speakerMap.set(speakerNumber, { speakerId: speakerID, storageId: "" });
  }

  // Find the longest spoken segment for each speaker
  const speakerSegments = new Map<number, { start: number; end: number }>();
  let currentSpeaker: number | undefined = words[0].speaker;
  let segmentStart = words[0].start;
  let segmentEnd = words[0].end;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];

    if (word.speaker !== currentSpeaker) {
      if (
        currentSpeaker !== undefined &&
        (!speakerSegments.has(currentSpeaker) ||
          segmentEnd - segmentStart >
            speakerSegments.get(currentSpeaker)!.end -
              speakerSegments.get(currentSpeaker)!.start)
      ) {
        speakerSegments.set(currentSpeaker, {
          start: segmentStart,
          end: segmentEnd,
        });
      }
      currentSpeaker = word.speaker;
      segmentStart = word.start;
    }
    segmentEnd = word.end;
  }

  // Handle the last segment
  if (
    currentSpeaker !== undefined &&
    (!speakerSegments.has(currentSpeaker) ||
      segmentEnd - segmentStart >
        speakerSegments.get(currentSpeaker)!.end -
          speakerSegments.get(currentSpeaker)!.start)
  ) {
    speakerSegments.set(currentSpeaker, {
      start: segmentStart,
      end: segmentEnd,
    });
  }

  console.log("Longest segments:", speakerSegments);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing transcript" })}\n\n`
  );
  await sleep(100);

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
            speakerId: speakerId.speakerId,
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
    `data: ${JSON.stringify({ status: "Text embeddings" })}\n\n`
  );
  await sleep(100);

  await fetchAction(
    api.generateEmbeddings.createEmbeddingsforFinalizedSentencesInMeetingID,
    { meetingId: meetingID },
    { token }
  );

  //save the audio clip for the longest part for each speaker
  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Predicting speakers" })}\n\n`
  );
  await sleep(100);

  // for (const [speakerNumber, segment] of Array.from(
  //   speakerSegments.entries()
  // )) {
  //   const speakerClip = await extractAudioClip(
  //     buffer,
  //     segment.start,
  //     segment.end,
  //     meetingID,
  //     token
  //   );
  // }

  const clipPromises = Array.from(speakerSegments.entries()).map(
    async ([speakerNumber, segment]) => {
      const speakerInfo = speakerMap.get(speakerNumber);
      if (!speakerInfo) {
        throw new Error(
          `Speaker ID not found for speaker number ${speakerNumber}`
        );
      }
      return extractAudioClip(
        buffer,
        speakerInfo.speakerId,
        speakerNumber,
        segment.start,
        segment.end,
        meetingID,
        token
      );
    }
  );

  // Wait for all clip extraction promises to resolve
  const speakerClips = await Promise.all(clipPromises);

  yield encoder.encode(`data: ${JSON.stringify({ status: "Save audio" })}\n\n`);
  await sleep(100);

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
    api.transcript.saveMeetingAudio,
    {
      meetingID,
      storageId,
    },
    { token }
  );

  const proposedTitle = await proposeTitlePromise;

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
