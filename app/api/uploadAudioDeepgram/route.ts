import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { createClient } from "@deepgram/sdk";
import { api } from "@/convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type { Doc, Id } from "@/convex/_generated/dataModel";

async function getAuthToken() {
  return (await auth().getToken({ template: "convex" })) ?? undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    const token = await getAuthToken();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const formData = await request.formData();
    const meetingIdParam = formData.get("meetingId") as string | null;

    let meetingID: Id<"meetings">;

    if (meetingIdParam) {
      meetingID = meetingIdParam as Id<"meetings">;
    } else {
      const meetingResponse = await fetchMutation(
        api.meetings.createMeeting,
        { title: "Untitled Meeting" },
        { token }
      );
      meetingID = meetingResponse.meetingId;
    }

    const file = formData.get("file") as File;

    if (!file) {
      return new NextResponse("No file uploaded", { status: 400 });
    }

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
      console.error("Deepgram API error:", error);
      return new NextResponse(JSON.stringify({ error: "Deepgram API error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract unique speaker numbers from the transcription result
    const uniqueSpeakers = new Set(
      result.results.channels[0].alternatives[0].words.map(
        (word: any) => word.speaker
      )
    );

    // Convert the Set to an array
    const speakerArray = Array.from(uniqueSpeakers);

    // Create a map to store speaker IDs
    const speakerMap = new Map<number, string>();

    // Iterate over unique speaker numbers and add them to the database
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

    // Process the words and create transcript sentences
    const words = result.results.channels[0].alternatives[0].words;
    let currentSpeaker = words[0].speaker;
    let currentTranscript = "";
    let startTime = words[0].start;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Concatenate the word to the current transcript
      currentTranscript += word.punctuated_word + " ";

      if (i === words.length - 1 || word.speaker !== currentSpeaker) {
        // Last word or speaker changed, save the current transcript sentence
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

        // Reset the current transcript and start time
        currentTranscript = "";
        startTime = word.start;
        currentSpeaker = word.speaker;
      }
    }

    return new NextResponse(
      JSON.stringify({ success: true, result, meetingID }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
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
