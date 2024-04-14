import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";

export async function POST(request: NextRequest) {
  try {
    console.log("Received POST request");

    const endpointUrl = process.env.GCLOUD_COMPUTE_VM_ENDPOINT;
    if (!endpointUrl) {
      throw new Error(
        "GCLOUD_COMPUTE_VM_ENDPOINT not found in environment variables"
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio_file") as File | null;
    if (!audioFile) {
      console.log("Audio file not found");
      return NextResponse.json(
        { error: "Audio file not found" },
        { status: 400 }
      );
    }

    console.log("Audio file received");

    const requestData = {
      key: process.env.GCLOUD_COMPUTE_VM_KEY,
    };

    const signature = await signRequestData(requestData);
    console.log("Request data signed");

    const vmResponse = await makePostRequest(
      endpointUrl,
      requestData,
      signature
    );
    console.log("VM response received");

    const { externalIP } = await vmResponse.json();
    console.log("External IP:", externalIP);

    const transcriptionServicePort = process.env.TRANSCRIPTION_SERVICE_PORT;
    if (!transcriptionServicePort) {
      throw new Error(
        "TRANSCRIPTION_SERVICE_PORT not found in environment variables"
      );
    }

    const transcriptionServiceUrl = `http://${externalIP}:${transcriptionServicePort}`;
    const indexUrl = `${transcriptionServiceUrl}/`;
    const transcriptionEndpoint = process.env.TRANSCRIPTION_ENDPOINT;
    if (!transcriptionEndpoint) {
      throw new Error(
        "TRANSCRIPTION_ENDPOINT not found in environment variables"
      );
    }

    const transcriptionUrl = `${transcriptionServiceUrl}${transcriptionEndpoint}`;

    await retryRequest(indexUrl);
    console.log("Index URL request successful");

    const transcriptionResponse = await transcribeAudio(
      transcriptionUrl,
      audioFile
    );
    console.log("Transcription response:", transcriptionResponse);

    return NextResponse.json({ transcript: transcriptionResponse });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

async function signRequestData(requestData: object): Promise<string> {
  const privateKey = process.env.GCLOUD_COMPUTE_VM_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) {
    throw new Error("Private key not found in environment variables");
  }

  const sign = createSign("SHA256");
  sign.update(JSON.stringify(requestData));
  sign.end();
  const signature = sign.sign(privateKey);
  return signature.toString("hex");
}

async function makePostRequest(
  endpointUrl: string,
  requestData: object,
  signature: string
): Promise<Response> {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body: JSON.stringify(requestData),
  });
  return response;
}

async function retryRequest(
  url: string,
  maxRetries = 60,
  retryDelay = 1000
): Promise<Response> {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.log(`Retry attempt ${retryCount + 1} failed`);
    }
    retryCount++;
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  throw new Error("Failed to connect to the URL after multiple retries.");
}

async function transcribeAudio(
  transcriptionUrl: string,
  audioFile: File
): Promise<string> {
  const formData = new FormData();
  formData.append("audio_file", audioFile);
  const response = await fetch(transcriptionUrl, {
    method: "POST",
    body: formData,
  });
  const transcriptionResponse = await response.text();
  return transcriptionResponse;
}
