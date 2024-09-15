// uploadAuddioDeepgram/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { createClient } from "@deepgram/sdk";
import { api } from "@/convex/_generated/api";
import { fetchMutation, fetchAction, fetchQuery } from "convex/nextjs";
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

  console.log("Sending request to clip-audio with token:", authToken);
  console.log(
    "Request details:",
    JSON.stringify({
      buffer: buffer.toString("base64"),
      speakerId,
      speakerNumber,
      start,
      end,
      meetingID,
    })
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
    const errorDetails = await response.text(); // or response.json() if the response is in JSON format
    console.error(
      "Failed to clip audio! Response status:",
      response.status,
      "Details:",
      errorDetails
    );
    throw new Error(
      `Failed to clip audio! Response status: ${response.status} Details: ${errorDetails}`
    );
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
  storageId: string,
  meetingId: string | undefined,
  userId: string,
  token: string
) {
  console.log(
    "Starting makeIterator with storageId:",
    storageId,
    "meetingId:",
    meetingId,
    "userId:",
    userId
  );

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Authenticating" })}\n\n`
  );
  console.log("Status: Authenticating");
  await sleep(100);

  yield encoder.encode(`data: ${JSON.stringify({ status: "Initiating" })}\n\n`);
  console.log("Status: Initiating");
  await sleep(100);

  let meetingID: Id<"meetings">;

  if (meetingId) {
    meetingID = meetingId as Id<"meetings">;
    console.log("Using provided meetingId:", meetingID);
  } else {
    const meetingResponse = await fetchMutation(
      api.meetings.createMeeting,
      { title: "Untitled Meeting" },
      { token }
    );
    meetingID = meetingResponse.meetingId;
    console.log("Created new meeting with ID:", meetingID);
  }

  yield encoder.encode(`data: ${JSON.stringify({ status: "Uploading" })}\n\n`);
  console.log("Status: Uploading");
  await sleep(100);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Transcribing" })}\n\n`
  );
  console.log("Status: Transcribing");
  await sleep(100);

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

  // Fetch the audio file from Convex
  const audioUrl = await fetchQuery(
    api.transcript.getAudioFile,
    { storageId: storageId as Id<"_storage"> },
    { token }
  );
  if (!audioUrl) {
    console.error("Failed to fetch audio file URL from Convex");
    throw new Error("Failed to fetch audio file URL from Convex");
  }
  console.log("Fetched audio URL:", audioUrl);

  // Now you can use this URL to fetch the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    console.error("Failed to fetch audio file from URL");
    throw new Error("Failed to fetch audio file from URL");
  }
  const audioBuffer = await audioResponse.arrayBuffer();
  console.log(
    "Fetched audio file successfully, buffer size:",
    audioBuffer.byteLength
  );

  // Process with Deepgram
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    Buffer.from(audioBuffer),
    {
      model: "nova-2",
      smart_format: true,
      diarize: true,
    }
  );

  if (error) {
    console.error("Deepgram API error:", error);
    throw new Error("Deepgram API error");
  }

  const audioDurationInSeconds = Math.floor(result.metadata.duration);
  console.log("Audio duration in seconds:", audioDurationInSeconds);

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
  console.log("Status: Proposing Title");
  await sleep(100);

  const completeTranscript =
    result.results.channels[0].alternatives[0].transcript;
  console.log("Complete transcript:", completeTranscript);

  const proposeTitlePromise = proposeMeetingTitle(completeTranscript);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing speakers" })}\n\n`
  );
  console.log("Status: Processing speakers");
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
    console.log("Added speaker:", speakerNumber, "with ID:", speakerID);
  }

  // Find the longest spoken segment for each speaker
  const speakerSegments = new Map<number, { start: number; end: number }>();
  let segmentCurrentSpeaker: number | undefined = words[0].speaker;
  let segmentStart = words[0].start;
  let segmentEnd = words[0].end;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];

    if (word.speaker !== segmentCurrentSpeaker) {
      if (
        segmentCurrentSpeaker !== undefined &&
        (!speakerSegments.has(segmentCurrentSpeaker) ||
          segmentEnd - segmentStart >
            speakerSegments.get(segmentCurrentSpeaker)!.end -
              speakerSegments.get(segmentCurrentSpeaker)!.start)
      ) {
        speakerSegments.set(segmentCurrentSpeaker, {
          start: segmentStart,
          end: segmentEnd,
        });
        console.log(
          "Recorded segment for speaker:",
          segmentCurrentSpeaker,
          "from",
          segmentStart,
          "to",
          segmentEnd
        );
      }
      segmentCurrentSpeaker = word.speaker;
      segmentStart = word.start;
    }
    segmentEnd = word.end;
  }

  // Handle the last segment
  if (
    segmentCurrentSpeaker !== undefined &&
    (!speakerSegments.has(segmentCurrentSpeaker) ||
      segmentEnd - segmentStart >
        speakerSegments.get(segmentCurrentSpeaker)!.end -
          speakerSegments.get(segmentCurrentSpeaker)!.start)
  ) {
    speakerSegments.set(segmentCurrentSpeaker, {
      start: segmentStart,
      end: segmentEnd,
    });
    console.log(
      "Recorded last segment for speaker:",
      segmentCurrentSpeaker,
      "from",
      segmentStart,
      "to",
      segmentEnd
    );
  }

  console.log("Longest segments:", speakerSegments);

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Processing transcript" })}\n\n`
  );
  console.log("Status: Processing transcript");
  await sleep(100);

  let currentTranscript = "";
  let startTime = words[0].start;
  let endTime = words[0].end;
  let currentSpeaker = words[0].speaker;

  for (const word of words) {
    if (word.speaker !== currentSpeaker) {
      if (currentSpeaker !== undefined) {
        const speakerId = speakerMap.get(currentSpeaker as number);

        if (speakerId) {
          await fetchMutation(
            api.transcript.storeFinalizedSentence,
            {
              transcript: currentTranscript.trim(),
              end: endTime,
              meetingID,
              speaker: Number(currentSpeaker),
              speakerId: speakerId.speakerId,
              start: startTime,
            },
            { token }
          );
          console.log(
            "Stored finalized sentence for speaker:",
            currentSpeaker,
            "transcript:",
            currentTranscript.trim()
          );
        }
      }

      // Reset the transcript for the new speaker and do not prepend the first word again
      currentTranscript = ""; // Reset the transcript for the new speaker
      startTime = word.start;
    }
    currentSpeaker = word.speaker;
    currentTranscript += word.punctuated_word + " ";
    endTime = word.end;
  }

  // Handle the last segment
  if (currentSpeaker !== undefined) {
    const speakerId = speakerMap.get(currentSpeaker as number);

    if (speakerId) {
      await fetchMutation(
        api.transcript.storeFinalizedSentence,
        {
          transcript: currentTranscript.trim(),
          end: endTime,
          meetingID,
          speaker: Number(currentSpeaker),
          speakerId: speakerId.speakerId,
          start: startTime,
        },
        { token }
      );
      console.log(
        "Stored finalized sentence for last speaker:",
        currentSpeaker,
        "transcript:",
        currentTranscript.trim()
      );
    }
  }

  yield encoder.encode(
    `data: ${JSON.stringify({ status: "Text embeddings" })}\n\n`
  );
  console.log("Status: Text embeddings");
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
  console.log("Status: Predicting speakers");
  await sleep(100);

  yield encoder.encode(`data: ${JSON.stringify({ status: "Save audio" })}\n\n`);
  console.log("Status: Save audio");
  await sleep(100);

  // Instead of uploading audio again, use the existing storageId
  await fetchMutation(
    api.transcript.saveMeetingAudio,
    {
      meetingID,
      storageId: storageId as Id<"_storage">,
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
    `data: ${JSON.stringify({
      status: "Completed",
      meetingDetails: {
        meetingId: meetingID,
        title: proposedTitle,
        duration: audioDurationInSeconds,
      },
      speakers: Array.from(speakerSegments.entries()).map(
        ([speakerNumber, segment]) => {
          const speakerInfo = speakerMap.get(speakerNumber);
          return {
            speakerId: speakerInfo?.speakerId || "",
            speakerNumber,
            longestSegment: segment,
          };
        }
      ),
    })}\n\n`
  );
  console.log(
    "Completed processing for meeting ID:",
    meetingID,
    "with title:",
    proposedTitle
  );
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    const token = (await getAuthToken()) ?? "";

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    console.log("user id:", userId);

    const formData = await request.formData();

    console.log("formData:", formData);
    const storageId = formData.get("storageId") as string;
    const meetingId = formData.get("meetingId") as string | undefined;

    if (!storageId) {
      return new NextResponse("No storageId provided", { status: 400 });
    }

    const iterator = makeIterator(storageId, meetingId, userId, token);
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
