"use client";
import { useState } from "react";
import { format } from "date-fns";

const TestTranscriptionPage = () => {
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [audioLength, setAudioLength] = useState<number | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAudioFile(file);

    if (file) {
      const audio = new Audio(URL.createObjectURL(file));
      audio.onloadedmetadata = () => {
        const duration = Math.floor(audio.duration);
        setAudioLength(duration);
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) return;
    setIsLoading(true);

    const formData = new FormData();
    formData.append("audio_file", audioFile);

    const startTime = Date.now();

    try {
      const response = await fetch("/api/uploadAudio", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      const transcriptObject = JSON.parse(data.transcript);
      setTranscriptions((prevTranscriptions) => [
        ...prevTranscriptions,
        transcriptObject,
      ]);
      console.log("Transcription:", transcriptObject);

      const endTime = Date.now();
      const processingTimeInMs = endTime - startTime;
      setProcessingTime(processingTimeInMs);
    } catch (error) {
      console.error("Error:", error);
    }

    setIsLoading(false);
  };

  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const milliseconds = Math.floor((duration % 1) * 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}:${milliseconds
      .toString()
      .padStart(3, "0")
      .slice(0, 2)}`;
  };

  return (
    <div className="flex flex-col space-y-3 mx-4">
      <h1>Test Transcription</h1>
      <form onSubmit={handleSubmit}>
        <input type="file" accept="audio/*" onChange={handleFileChange} />
        <button type="submit" disabled={!audioFile || isLoading}>
          {isLoading ? "Transcribing..." : "Transcribe"}
        </button>
      </form>
      {transcription && (
        <div>
          {transcription.result && transcription.result.segments && (
            <div className="flex flex-col space-y-3">
              {transcription.result.segments.map(
                (segment: any, index: number) => (
                  <div key={index}>
                    <p>
                      <strong>{segment.speaker}:</strong> {segment.text}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
      {audioLength !== null && (
        <p>Audio duration: {formatDuration(audioLength)}</p>
      )}

      {processingTime !== null && (
        <p>Processing time: {formatDuration(processingTime / 1000)}</p>
      )}
    </div>
  );
};

export default TestTranscriptionPage;
