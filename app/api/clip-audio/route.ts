import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import { clerkClient } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs";
import { getAuth } from "@clerk/nextjs/server";
import { format } from "date-fns";
import { fetchMutation, fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

async function getAuthToken() {
  return (await auth().getToken({ template: "convex" })) ?? undefined;
}

async function callCloudFunction(
  file: File,
  start: number,
  end: number
): Promise<Buffer> {
  console.log("Starting call to cloud function for audio clipping.");
  const cloudFunctionUrl = process.env.GCLOUD_FUNCTION_CLIP_AUDIO_URL;
  if (!cloudFunctionUrl) {
    throw new Error(
      "GCLOUD_COMPUTE_VM_ENDPOINT not found in environment variables"
    );
  }

  const formData = new FormData();
  console.log("Preparing file and timestamps for FormData.");
  formData.append("file", file, file.name);
  formData.append("start", start.toString());
  formData.append("end", end.toString());
  console.log(
    `FormData prepared with file: ${file.name}, start: ${start}, end: ${end}`
  );

  console.log("Sending request to cloud function.");
  const response = await fetch(cloudFunctionUrl, {
    method: "POST",
    body: formData,
  });

  console.log(`Response status: ${response.status}`);
  if (!response.ok) {
    console.error("Failed to extract audio clip from cloud function.");
    throw new Error("Failed to extract audio clip");
  }

  console.log("Extracting audio clip from response.");
  const clippedAudioBuffer = await response.arrayBuffer();
  console.log("Audio clip extracted successfully.");
  return Buffer.from(clippedAudioBuffer);
}

export async function POST(request: NextRequest) {
  console.log("Received request in clip-audio route");
  const token = await getAuthToken();

  console.log("received request inside POST handler");

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("passed authentication");

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

    console.log("Calling extractAudioClip function");
    const clippedAudioBuffer = await callCloudFunction(file, start, end);
    console.log("Clipped audio buffer:", clippedAudioBuffer);

    console.log("Uploading clipped audio buffer to storage...");

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
