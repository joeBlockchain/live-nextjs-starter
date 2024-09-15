"use client";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogContent,
  Dialog,
} from "@/components/ui/dialog";
import {
  UploadIcon,
  AudioLines,
  Volume2,
  X,
  ArrowRightFromLine,
  ArrowRight,
} from "lucide-react";
import { Progress } from "../ui/progress";
import Spinner from "../ui/spinner";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface UploadAudioDialogProps {
  meetingId?: string;
  meetingSelectedLanguage?: string;
}

export default function UploadAudioDialog({
  meetingId,
  meetingSelectedLanguage,
}: UploadAudioDialogProps) {
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);

  const [uploadStatus, setUploadStatus] = useState<
    "pending" | "completed" | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const generateUploadUrl = useMutation(api.transcript.generateAudioUploadUrl);
  const router = useRouter();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      console.log(file.name); // Log the name of the file
    }
  };

  async function uploadFile() {
    if (!selectedFile) return; // Exit if no file is selected

    try {
      setUploadStatus("pending");
      setProgressStatus("Uploading audio");

      // Step 1: Get the upload URL from Convex
      const uploadUrl = await generateUploadUrl();

      // Step 2: Upload the file to Convex
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload audio to Convex");
      }

      const { storageId } = await uploadResponse.json();

      // Step 3: Send the storageId to our API for processing
      const formData = new FormData();
      formData.append("storageId", storageId);
      if (meetingId) {
        formData.append("meetingId", meetingId);
      }

      const response = await fetch("/api/uploadAudioDeepgram", {
        method: "POST",
        body: formData,
      });

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          console.log("Upload completed");

          if (value) {
            const decodedValue = decoder.decode(value);
            const eventData = decodedValue.trim().split("\n");
            console.log("Events received: ", eventData);

            for (const event of eventData) {
              console.log("Event received:", event);
              if (event.startsWith("data:")) {
                console.log("Event data:", event);
                const jsonString = event.substring(5).trim();
                try {
                  const data = JSON.parse(jsonString);
                  console.log("Parsed event data:", data);

                  if (data.status === "Completed") {
                    setUploadStatus("completed");
                    setCreatedMeetingId(data.meetingDetails.meetingId);
                    setProgressStatus(null);

                    // Sequentially process each speaker
                    for (const speaker of data.speakers) {
                      const { speakerId, speakerNumber, longestSegment } =
                        speaker;

                      // Await the completion of clipAudio before continuing to the next iteration
                      await clipAudio(
                        selectedFile,
                        speakerId,
                        speakerNumber,
                        longestSegment.start,
                        longestSegment.end,
                        data.meetingDetails.meetingId
                      );
                    }

                    console.log("All audio clips extracted successfully");
                  } else {
                    setProgressStatus(data.status);
                  }
                } catch (error) {
                  console.error("Error parsing event data:", jsonString, error);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadStatus(null);
      setProgressStatus(null);
    }
  }

  async function clipAudio(
    file: File,
    speakerId: string,
    speakerNumber: number,
    start: number,
    end: number,
    meetingID: string
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("speakerId", speakerId);
    formData.append("speakerNumber", speakerNumber.toString());
    formData.append("start", start.toString());
    formData.append("end", end.toString());
    formData.append("meetingID", meetingID);

    const response = await fetch("/api/clip-audio", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Failed to clip audio");
    }
  }

  // Call uploadFile when the selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      uploadFile();
    }
  }, [selectedFile]);

  const handleDeleteFile = () => {
    setSelectedFile(null); // Remove the selected file
  };

  const handleMeetingSelect = () => {
    console.log("handleMeetingSelect: ", createdMeetingId);
    if (createdMeetingId) {
      router.push(
        `/mymeetings/${createdMeetingId}?language=${meetingSelectedLanguage}`
      );
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      // Dialog is being closed
      setSelectedFile(null); // Remove the selected file
      setUploadStatus(null); // Reset the upload status
      setProgressStatus(null); // Reset the progress status
    }
  };

  return (
    <Dialog onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <UploadIcon className="mr-2 h-4 w-4" />
          Upload Audio
        </Button>
      </DialogTrigger>
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>Upload Audio File!</DialogTitle>
          <DialogDescription>
            Drag and drop your audio file here, or browse...
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center">
          {!selectedFile && (
            <div
              className={`border-dashed border-2 ${
                isDragging ? "border-blue-500" : "border-border"
              } rounded-lg p-10 flex flex-col items-center justify-center space-y-4`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {" "}
              <h1 className="text-2xl">Drag & Drop</h1>
              <AudioLines strokeWidth={1} className="h-20 w-20" />
              <p className="text-sm text-muted-foreground">
                AAC, MP3, M4A, WAV, WMA, MOV, MPEG, MP4, WMV
              </p>
              <span className="text-sm">or</span>
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="sr-only">Choose file</span>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="hidden"
                  accept="audio/*,video/*"
                  onChange={handleFileChange}
                />
                <Button className="">Browse files</Button>
              </label>
            </div>
          )}
          {/* component to display upload progress of file */}
          {selectedFile && (
            <div
              className="space-y-4 mt-4 w-full px-3 cursor-pointer"
              onClick={handleMeetingSelect}
            >
              <div className="flex flex-col border border-muted-background justify-between p-2 px-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <Volume2 className="w-6 h-6" />
                  <div className="flex-1 min-w-0 ml-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium truncate">
                          {selectedFile?.name || "No file selected"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {selectedFile
                            ? `${(selectedFile.size / 1024 / 1024).toFixed(
                                2
                              )} MB`
                            : ""}
                        </p>
                      </div>
                      {uploadStatus === "pending" && (
                        <span className="text-sm text-muted-foreground">
                          <Spinner className="mr-2" />
                          {progressStatus || "Calling the backend"}
                        </span>
                      )}
                      {uploadStatus === "completed" && (
                        <div className="flex flex-row items-center text-sm text-blue-500 dark:text-blue-400">
                          <span>Meeting Ready!</span>
                          <ArrowRight className="ml-2 w-5 h-5" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
