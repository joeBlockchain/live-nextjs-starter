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
import { UploadIcon, AudioLines, Volume2, X } from "lucide-react";
import { Progress } from "../ui/progress";
import Spinner from "../ui/spinner";
import { useRouter } from "next/navigation";

interface UploadAudioDialogProps {
  meetingId?: string;
  meetingSelectedLanguage?: string;
}

export default function UploadAudioDialog({
  meetingId,
  meetingSelectedLanguage,
}: UploadAudioDialogProps) {
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "pending" | "completed" | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  // Function to upload the file
  const uploadFile = async () => {
    if (!selectedFile) return; // Exit if no file is selected

    const formData = new FormData();
    formData.append("file", selectedFile); // Append the file under the key 'file'

    // Include the meetingId in the form data if provided
    if (meetingId) {
      formData.append("meetingId", meetingId);
    }

    try {
      setUploadStatus("pending");

      const response = await fetch("/api/uploadAudioDeepgram", {
        // Your API endpoint
        method: "POST",
        body: formData,
        // Do not set 'Content-Type' header here, as the browser will set it with the correct boundary
      });

      const result = await response.json();
      if (response.ok) {
        console.log("Upload successful", result);
        setUploadStatus("completed");
        const meetingId = result.meetingID;
        setCreatedMeetingId(meetingId);
        // Handle success scenario (e.g., showing a success message)
      } else {
        console.error("Upload failed", result);
        setUploadStatus(null);
        // Handle failure scenario (e.g., showing an error message)
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadStatus(null);
      // Handle error scenario
    }
  };

  // Call uploadFile when the selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      uploadFile();
    }
  }, [selectedFile]);

  const handleDeleteFile = () => {
    setSelectedFile(null); // Remove the selected file
  };

  const router = useRouter();

  const handleMeetingSelect = () => {
    console.log("handleMeetingSelect: ", createdMeetingId);
    if (createdMeetingId) {
      router.push(
        `/mymeetings/${createdMeetingId}?language=${meetingSelectedLanguage}`
      );
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <UploadIcon className="mr-2 h-4 w-4" />
          Upload Audio
        </Button>
      </DialogTrigger>
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>Upload Audio File</DialogTitle>
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
                          Processing...
                        </span>
                      )}
                      {uploadStatus === "completed" && (
                        <span className="text-sm text-green-500">
                          Transcription Complete
                        </span>
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