import { NextRequest } from "next/server";

import { auth } from "@clerk/nextjs";

import { fetchMutation, fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

async function getAuthToken() {
  return (await auth().getToken({ template: "convex" })) ?? undefined;
}

async function callCloudFunction(
  file: File,
  start: number,
  end: number
): Promise<Buffer> {
  const cloudFunctionUrl = process.env.GCLOUD_FUNCTION_CLIP_AUDIO_URL;
  if (!cloudFunctionUrl) {
    throw new Error(
      "GCLOUD_FUNCTION_CLIP_AUDIO_URL not found in environment variables"
    );
  }

  const formData = new FormData();

  formData.append("file", file, file.name);
  formData.append("start", start.toString());
  formData.append("end", end.toString());

  const response = await fetch(cloudFunctionUrl, {
    method: "POST",
    body: formData,
    headers: {
      // Include the API key in the Authorization header
      Authorization: `Bearer ${process.env.GCLOUD_FUNCTION_KEY}`,
    },
  });

  if (!response.ok) {
    console.error("Failed to extract audio clip from cloud function.");
    throw new Error("Failed to extract audio clip");
  }

  const clippedAudioBuffer = await response.arrayBuffer();
  return Buffer.from(clippedAudioBuffer);
}

export async function POST(request: NextRequest) {
  const token = await getAuthToken();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const speakerId = formData.get("speakerId") as Id<"speakers">;
    const speakerNumber = parseInt(
      formData.get("speakerNumber") as Id<"speakers">
    );
    const start = parseFloat(formData.get("start") as string);
    const end = parseFloat(formData.get("end") as string);
    const meetingID = formData.get("meetingID") as Id<"meetings">;

    const clippedAudioBuffer = await callCloudFunction(file, start, end);

    const uploadUrlClip = await fetchMutation(
      api.transcript.generateAudioUploadUrl,
      {},
      { token }
    );

    const uploadResponseClip = await fetch(uploadUrlClip, {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: clippedAudioBuffer,
    });

    if (!uploadResponseClip.ok) {
      throw new Error("Failed to upload audio clip");
    }

    const { storageId: storageIdClip } = await uploadResponseClip.json();

    await fetchMutation(
      api.transcript.sendAudio,
      { storageId: storageIdClip, meetingID },
      { token }
    );

    //populate predicted speakers
    await fetchAction(
      api.transcript.getNearestMatchingSpeakers,
      { speakerNumber, storageId: storageIdClip, meetingId: meetingID },
      { token }
    );

    //add audio embedding for speaker to db
    //i think we only should add this after we try to find a match - otherwise this segment will match to itself
    await fetchAction(
      api.transcript.processAudioEmbedding,
      { storageId: storageIdClip, meetingID, speakerNumber, speakerId },
      { token }
    );

    return new Response(clippedAudioBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/webm" },
    });
  } catch (error) {
    console.error("Error clipping audio!!:", error);
    return new Response(JSON.stringify({ error: "Failed to clip audio!!" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
