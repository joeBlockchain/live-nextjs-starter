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

async function extractAudioClip(
  file: File,
  start: number,
  end: number
): Promise<Buffer> {
  console.log("Inside extractAudioClip function");
  const timestamp = format(new Date(), "yyyyMMdd-HHmmss-SSS");
  const tempInputFile = path.join("/tmp", `audio-input-${timestamp}.webm`);
  const tempOutputFile = path.join("/tmp", `audio-output-${timestamp}.webm`);

  // Write the input file to a temporary file
  console.log("Writing input file to temporary file:", tempInputFile);
  await fs.promises.writeFile(
    tempInputFile,
    new Uint8Array(await file.arrayBuffer())
  );
  console.log("Input file written to temporary file");

  // Calculate the duration of the clip
  const duration = end - start;

  try {
    // Use FFmpeg to extract the audio clip and convert it to Opus format
    await new Promise<void>((resolve, reject) => {
      console.log("Starting FFmpeg process");
      const ffmpegProcess = spawn(
        "ffmpeg",
        [
          "-i",
          tempInputFile,
          "-ss",
          start.toString(),
          "-t",
          duration.toString(),
          "-c:a",
          "libopus",
          "-b:a",
          "128k",
          "-y",
          tempOutputFile,
          "-v",
          "error",
          "-loglevel",
          "error",
        ],
        { stdio: ["pipe", "pipe", "pipe"] }
      );

      ffmpegProcess.stderr.on("data", (data) => {
        console.error(`FFmpeg error: ${data}`);
      });

      ffmpegProcess.on("close", (code: number) => {
        if (code === 0) {
          console.log("FFmpeg process completed successfully");
          resolve();
        } else {
          console.error(`FFmpeg process exited with code ${code}`);
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
    });

    // Read the output file and return the clipped audio buffer
    const clippedAudioBuffer = await fs.promises.readFile(tempOutputFile);
    return clippedAudioBuffer;
  } catch (error) {
    throw error;
  } finally {
    // Clean up temporary files
    await fs.promises.unlink(tempInputFile);
    await fs.promises.unlink(tempOutputFile);
  }
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
    const clippedAudioBuffer = await extractAudioClip(file, start, end);
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
