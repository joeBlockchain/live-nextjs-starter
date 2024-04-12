"use client";
import { useState } from "react";

const TestTranscriptionPage = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAudioFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append("audio_file", audioFile);

    try {
      const response = await fetch("/api/uploadAudio", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      // Parse the JSON string to an object
      const transcriptObject = JSON.parse(data.transcript);
      setTranscription(transcriptObject);
      console.log("Transcription:", transcriptObject);
    } catch (error) {
      console.error("Error:", error);
    }

    setIsLoading(false);
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
      <button className="relative inline-block px-4 py-2 bg-blue-500 text-white">
        <span className="relative z-10">Click me</span>
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[20px] border-t-transparent border-r-[20px] border-r-blue-500 border-b-[20px] border-b-transparent"></div>
      </button>
    </div>
  );
};

export default TestTranscriptionPage;
