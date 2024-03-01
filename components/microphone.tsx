"use client";

//import react stuff
import {
  useState,
  useEffect,
  useCallback,
  Dispatch,
  SetStateAction,
  useRef,
} from "react";
import { useQueue } from "@uidotdev/usehooks";

//import nextjs stuff
import Image from "next/image";
import Link from "next/link";

// import convex stuff for db
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useConvex } from "convex/react";

//import deepgram stuff
import {
  CreateProjectKeyResponse,
  LiveClient,
  LiveTranscriptionEvents,
  createClient,
} from "@deepgram/sdk";

//import shadcnui stuff
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

//import icon stuff
import { Mic, Pause, Timer, Download } from "lucide-react";
import Dg from "@/app/dg.svg";

//import custom stuff
import TranscriptDisplay from "@/components/microphone/transcript";
import { extractSegment } from "@/lib/ffmpgUtils";

type SpeakerEmbeddingsCount = {
  [speakerNumber: number]: number;
};

interface CaptionDetail {
  words: string;
  isFinal: boolean;
}

export interface WordDetail {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuated_word: string;
}

export interface FinalizedSentence {
  id?: Id<"finalizedSentences">;
  speaker: number;
  transcript: string;
  start: number;
  end: number;
  meetingID: Id<"meetings">;
}

export interface StoredSentence {
  id: Id<"finalizedSentences">;
  speakerId?: Id<"speakers">;
}

export interface SpeakerDetail {
  speakerNumber: number;
  firstName: string;
  lastName: string;
  embeddingId?: Id<"audioEmbeddings">;
  meetingID: Id<"meetings">;
  speakerId?: Id<"speakers">;
  _id?: Id<"speakers">;
  voiceAnalysisStatus: "analyzing" | "completed" | "pending" | "failed";
  predictedNames?: {
    userSelected: boolean;
    name: string;
    score: number;
    speakerId: string;
    embeddingId: string;
  }[];
}

// Step 1: Define a QuestionDetail Interface
export interface QuestionDetail {
  question: string;
  timestamp: number; // You can choose to track the time the question was asked
  speaker: number; // Optional: track which speaker asked the question
  meetingID: Id<"meetings">; // Optional: track the meeting ID
}

interface MicrophoneProps {
  meetingID: Id<"meetings">;
  language: string;
  finalizedSentences: FinalizedSentence[];
  setFinalizedSentences: React.Dispatch<
    React.SetStateAction<FinalizedSentence[]>
  >;
  storedSentences: StoredSentence[]; // Add this line
  setStoredSentences: React.Dispatch<React.SetStateAction<StoredSentence[]>>; // Add this line
  speakerDetails: SpeakerDetail[];
  setSpeakerDetails: React.Dispatch<React.SetStateAction<SpeakerDetail[]>>;
  caption: CaptionDetail | null;
  setCaption: Dispatch<SetStateAction<CaptionDetail | null>>;
  finalCaptions: WordDetail[];
  setFinalCaptions: Dispatch<SetStateAction<WordDetail[]>>;

  initialDuration: number; // Add this line
  questions: QuestionDetail[]; // Add this line
  setQuestions: React.Dispatch<React.SetStateAction<QuestionDetail[]>>;
}

export default function Microphone({
  meetingID,
  language,
  finalizedSentences,
  setFinalizedSentences,
  storedSentences, // Add this
  setStoredSentences, // Add this
  speakerDetails,
  setSpeakerDetails,
  caption,
  setCaption,
  finalCaptions,
  setFinalCaptions,
  initialDuration,
}: MicrophoneProps) {
  const isInitialLoad = useRef(true); //use to stop functions from running if we are opeining a meeting from the db
  //detect when speakerchanges in finalized sentences and save the last sentence to the db
  const prevFinalizedSentencesLengthRef = useRef(finalizedSentences.length);

  const { add, remove, first, size, queue } = useQueue<any>([]);

  const [apiKey, setApiKey] = useState<CreateProjectKeyResponse | null>();
  const [connection, setConnection] = useState<LiveClient | null>();
  const [isListening, setListening] = useState(false);
  const [isLoadingKey, setLoadingKey] = useState(true);
  const [isLoading, setLoading] = useState(true);
  const [isProcessing, setProcessing] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [microphone, setMicrophone] = useState<MediaRecorder | null>();
  const [userMedia, setUserMedia] = useState<MediaStream | null>();
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  // const [finalCaptions, setFinalCaptions] = useState<WordDetail[]>([]);
  //used for detecting speaker changes in finalized sentences so we write to the db when the speaker finishes

  const retrieveSummary = useAction(api.meetingSummary.retrieveMeetingSummary);
  const changeSpeakerDetailsByID = useMutation(
    api.meetings.changeSpeakerDetailsByID
  );
  // State for the timer
  const [timer, setTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(
    null
  );
  const storeQuestion = useMutation(api.transcript.storeQuestion);
  const storeWordDetail = useMutation(api.transcript.storeWordDetail);

  const generateUploadUrl = useMutation(api.transcript.generateAudioUploadUrl);
  const sendAudio = useMutation(api.transcript.sendAudio);

  const runProcessAudioEmbedding = useAction(
    api.transcript.processAudioEmbedding
  );

  const runGetNearestMatchingSpeakers = useAction(
    api.transcript.getNearestMatchingSpeakers
  );

  // Refactored function to only upload the audio blob and return the storageId
  const uploadAudioToConvexFiles = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      try {
        // Step 1: Get a short-lived upload URL
        const uploadUrl = await generateUploadUrl();

        // Step 2: POST the file to the URL
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "audio/webm" },
          body: audioBlob,
        });
        if (!response.ok) {
          throw new Error("Failed to upload audio blob");
        }
        const { storageId } = await response.json();

        // Step 3: Save the newly allocated storage id to the database
        await sendAudio({ storageId, meetingID });

        return storageId as Id<"_storage">;
      } catch (error) {
        console.error("Error uploading audio blob:", error);
        throw error; // Rethrow the error to handle it in the calling function
      }
    },
    [generateUploadUrl, sendAudio, meetingID]
  );

  const uploadAudioBlob = useCallback(
    async (audioBlob: Blob, speaker: SpeakerDetail) => {
      try {
        const storageId: Id<"_storage"> = (await uploadAudioToConvexFiles(
          audioBlob
        )) as Id<"_storage">;

        // Call the generateEmebedding action
        runProcessAudioEmbedding({
          storageId,
          meetingID,
          speakerNumber: speaker.speakerNumber,
          //@ts-ignore
          speakerId: speaker._id!, //need to fix, convex is sending _id I think so should just update the type interface
        }).then(() => {
          // Handle the response as needed
        });
      } catch (error) {
        console.error("Error uploading audio blob:", error);
      }
    },
    [generateUploadUrl, sendAudio, meetingID, runProcessAudioEmbedding]
  );

  //disable re-recording until i fix the bug
  const [disableRecording, setDisableRecording] = useState(false);
  useEffect(() => {
    // Set the timer to the initial duration
    setTimer(initialDuration);
    // Disable recording if there is an initial duration
    if (initialDuration > 0) {
      setDisableRecording(true);
    }
  }, [initialDuration]);

  useEffect(() => {
    // This useEffect hook will run when the component mounts and anytime downloadUrl changes.
    // The cleanup function will run when the component unmounts or before the effect runs again due to a change in downloadUrl.
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null); // Optionally reset downloadUrl state here if needed
      }
    };
  }, [downloadUrl]);

  // Function to start the timer
  const startTimer = useCallback(() => {
    setTimer(0); // Reset timer
    const interval = setInterval(() => {
      setTimer((prevTimer) => prevTimer + 1);
    }, 1000); // Update timer every second
    setTimerInterval(interval);
  }, [setTimerInterval]); // Add dependencies if any

  // Function to stop the timer
  const stopTimer = useCallback(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  }, [timerInterval, setTimerInterval]);

  const addSpeakerToDB = useMutation(api.meetings.addSpeaker);

  // Function to handle new speakers
  const handleNewSpeaker = useCallback(
    async (speakerNumber: number) => {
      // Check if the speaker already exists
      if (
        !speakerDetails.some((detail) => detail.speakerNumber === speakerNumber)
      ) {
        // Call the addSpeakerToDB mutation
        const speakerId = await addSpeakerToDB({
          meetingID,
          speakerNumber,
          firstName: "",
          lastName: "",
          voiceAnalysisStatus: "pending",
          predictedNames: [],
        });

        // Add new speaker with default names
        const newSpeaker: SpeakerDetail = {
          speakerId: speakerId,
          voiceAnalysisStatus: "pending",
          speakerNumber,
          firstName: "",
          lastName: "",
          meetingID,
          predictedNames: [], // Add this line
        };

        // console.log("New Speaker:", newSpeaker);
        setSpeakerDetails((prevDetails) => [...prevDetails, newSpeaker]);
      }
    },
    [speakerDetails, meetingID, setSpeakerDetails]
  );

  const handleFirstNameChange = (id: number, newFirstName: string) => {
    setSpeakerDetails((prevSpeakers) =>
      prevSpeakers.map((speaker) =>
        speaker.speakerNumber === id
          ? { ...speaker, firstName: newFirstName }
          : speaker
      )
    );
  };

  const handleLastNameChange = (id: number, newLastName: string) => {
    setSpeakerDetails((prevSpeakers) =>
      prevSpeakers.map((speaker) =>
        speaker.speakerNumber === id
          ? { ...speaker, lastName: newLastName }
          : speaker
      )
    );
  };

  //this helper function handles the mapping of the speaker number in the sentences to the speaker names in the speaker table
  const getSpeakerName = (speakerNumber: number) => {
    const speaker = speakerDetails.find(
      (s) => s.speakerNumber === speakerNumber
    );
    return speaker
      ? `${speaker.firstName} ${speaker.lastName}`.trim()
      : `Speaker ${speakerNumber}`;
  };

  const createAndSaveEmbedding = useAction(
    api.generateEmbeddings.createEmbeddingsforFinalizedSentencesInMeetingID
  );
  //save finalised sentences
  const storeFinalizedSentence = useMutation(
    api.transcript.storeFinalizedSentence
  );

  // Fetch finalized sentences for the given meetingID when the component mounts
  useEffect(() => {
    async function fetchData() {
      try {
        const data = await fetchFinalizedSentences(meetingID);
        // console.log("Finalized Sentences from DB:", data);
        // Here you can set the state with the fetched data
        prevFinalizedSentencesLengthRef.current = data.length;
        setFinalizedSentences(data); // Assuming you have a state setter for finalized sentences

        // Map over the fetched finalized sentences to prepare storedSentences
        const storedSentencesData = data.map((sentence: FinalizedSentence) => ({
          //@ts-ignore
          id: sentence._id, // Assuming each sentence has an id field
          // Add any other fields from FinalizedSentence that should be in StoredSentence
        }));

        setStoredSentences(storedSentencesData);
      } catch (error) {
        console.error("Failed to fetch finalized sentences:", error);
      }
    }

    fetchData();
  }, [meetingID, setFinalizedSentences]);

  async function fetchFinalizedSentences(meetingID: Id<"meetings">) {
    const response = await fetch(`/api/meetingDetails?meetingID=${meetingID}`);
    if (!response.ok) {
      throw new Error("Failed to fetch finalized sentences");
    }

    const data = await response.json();
    return data;
  }

  const speakersFromDB = useQuery(api.meetings.getSpeakersByMeeting, {
    meetingID,
  });

  useEffect(() => {
    // Check if there are any speakers fetched from the database
    if (speakersFromDB && speakersFromDB.length > 0) {
      // Set the fetched speakers to your component's state
      setSpeakerDetails(speakersFromDB as SpeakerDetail[]);
    }
  }, [speakersFromDB, setSpeakerDetails]);

  const updateMeeting = useMutation(api.meetings.updateMeetingDetails);

  const handleGenerateSummary = useCallback(async () => {
    try {
      // Clean finalizedSentences as before
      const cleanedFinalizedSentences = finalizedSentences.map(
        ({ speaker, transcript, start, end, meetingID }) => ({
          speaker,
          transcript,
          start,
          end,
          meetingID,
        })
      );

      // Now also clean speakerDetails to remove any fields not expected by the validator
      const cleanedSpeakerDetails = speakerDetails.map(
        ({ firstName, lastName, speakerNumber }) => ({
          firstName,
          lastName,
          speakerNumber,
        })
      );

      // Call the action with the necessary arguments, including the cleaned data
      const summary = await retrieveSummary({
        message:
          "Please generate a summary for this meeting. Note that the meeting is in " +
          language,
        meetingID: meetingID,
        aiModel: "gpt-3",
        finalizedSentences: cleanedFinalizedSentences,
        speakerDetails: cleanedSpeakerDetails,
      });

      // console.log("Summary:", summary);
    } catch (error) {
      console.error("Failed to generate meeting summary:", error);
      // Optionally, show an error message
    }
  }, [
    retrieveSummary,
    meetingID,
    language,
    finalizedSentences,
    speakerDetails,
  ]);

  const toggleMicrophone = useCallback(async () => {
    if (microphone && userMedia) {
      setUserMedia(null);
      setMicrophone(null);

      setDisableRecording(true); //stop enabling the ability to record again until we fix the error/bug

      //retrieve the summary
      handleGenerateSummary();

      //console.log("finalCaptions:", finalCaptions); // Log the finalized

      microphone.stop();

      //save final words
      // console.log("Finalized Sentences:", finalizedSentences); // Log the finalized sentences when stopping the recording
      // finalCaptions.forEach(async (caption) => {
      //   try {
      //     const result = await storeWordDetail({
      //       meetingID: meetingID,
      //       word: caption.word,
      //       start: caption.start,
      //       end: caption.end,
      //       confidence: caption.confidence,
      //       speaker: caption.speaker,
      //       punctuated_word: caption.punctuated_word,
      //       // audio_embedding can be omitted if not available yet
      //     });
      //     // console.log("Word detail stored:", result);
      //   } catch (error) {
      //     console.error("Failed to store word detail:", error);
      //   }
      // });

      stopTimer(); // Stop the timer
      await updateMeeting({ meetingID, updates: { duration: timer } });

      //old code for saving the speaker details at and of meeting
      // const speakerDetailsWithIds = await Promise.all(
      //   speakerDetails.map(async (speaker) => {
      //     // Assuming addSpeakerToDB correctly returns the ID of the newly added speaker
      //     const speakerId = await addSpeakerToDB({
      //       meetingID: speaker.meetingID,
      //       speakerNumber: speaker.speakerNumber,
      //       firstName: speaker.firstName,
      //       lastName: speaker.lastName,
      //       predictedNames: speaker.predictedNames,
      //     });
      //     // Return a new object combining the original speaker details with the new speakerID
      //     return { ...speaker, speakerId };
      //   })
      // );

      // Store last finalized sentence in the database
      if (finalizedSentences.length > 0) {
        const lastSentence = finalizedSentences[finalizedSentences.length - 1];

        const sentenceID = await storeFinalizedSentence({
          meetingID: meetingID,
          speaker: lastSentence.speaker,
          transcript: lastSentence.transcript,
          start: lastSentence.start,
          end: lastSentence.end,
        });

        if (sentenceID) {
          //store the sentenceid in array of stored sentences ids
          setStoredSentences((prevStoredSentences) => [
            ...prevStoredSentences,
            {
              ...lastSentence,
              id: sentenceID,
            },
          ]);
          //generate and save transctript text embeddings
          const sentenceEmbeddings = await createAndSaveEmbedding({
            meetingId: meetingID,
          });

          //now we work on the audio embeddings
          const speakerEmbeddingsCount: SpeakerEmbeddingsCount = {}; //counter to limit max sentences for each speaker

          for (const sentence of finalizedSentences) {
            const sentenceDuration = sentence.end - sentence.start;

            // Skip sentences shorter than 5 seconds
            if (sentenceDuration < 5) {
              continue; // Move to the next iteration of the loop
            }

            const speakerDetailWithId = speakerDetails.find(
              (speakerDetail) =>
                speakerDetail.speakerNumber === sentence.speaker
            );

            // Initialize the count for this speaker if it hasn't been done yet
            if (!speakerEmbeddingsCount[sentence.speaker]) {
              speakerEmbeddingsCount[sentence.speaker] = 0;
            }

            // Check if we've already processed 10 embeddings for this speaker
            if (speakerEmbeddingsCount[sentence.speaker] >= 10) {
              continue; // Skip to the next iteration of the loop
            }

            // Check if speakerDetailWithId exists and either firstName or lastName is not empty or null
            if (
              speakerDetailWithId &&
              (speakerDetailWithId.firstName || speakerDetailWithId.lastName)
            ) {
              const sectionAudioBlob = generateAudioBlobForSentence(
                sentence,
                audioBlobs
              );

              // Now speakerDetailWithId includes the speakerID
              uploadAudioBlob(sectionAudioBlob, speakerDetailWithId);

              // Increment the count for this speaker
              speakerEmbeddingsCount[sentence.speaker]++;
            } else {
              console.error(
                "Speaker ID not found or speaker name is empty or null:",
                sentence.speaker
              );
            }
          }
        } else {
          console.error("Failed to store sentence, sentenceID is void.");
        }
      }

      //This was for saving the whole audio but now we are using audio clips to embed audio segments with the uploadAudioBlob function
      //revisit this if need to save full audio file
      // Combine audio blobs into a single Blob
      // const combinedAudioBlob = new Blob(audioBlobs, { type: "audio/webm" });
      // // Code to create a downloadable link for the combined audio
      // const audioURL = URL.createObjectURL(combinedAudioBlob);
      // setDownloadUrl(audioURL); // Set the URL for the download button to use

      // uploadAudioBlob(combinedAudioBlob);

      // handle next steps to initiate audio embedding
      // console.log("calling /api/embedding with audio blob:", combinedAudioBlob);
      // const formData = new FormData();
      // formData.append("audio_file", combinedAudioBlob, "audio.webm");

      // const response = await fetch("/api/embedding", {
      //   method: "POST",
      //   body: formData, // Send the form data
      // });
      // console.log("response from /api/embedding:", response);

      // Reset or handle state updates as necessary
      setAudioBlobs([]);
    } else {
      if (disableRecording) {
        toast("Were working on it", {
          description: "Woring on enabling ability to record again",
          action: {
            label: "Got it!",
            onClick: () => console.log("client attempted to rerecord"),
          },
        });
        return;
      } else {
        setAudioBlobs([]); // Reset audio blobs here

        const constraints = {
          audio: {
            echoCancellation: false, // Toggle echoCancellation as needed
            noiseSuppression: false, // Toggle noiseSuppression as needed
          },
        };

        const userMedia =
          await navigator.mediaDevices.getUserMedia(constraints);

        const microphone = new MediaRecorder(userMedia);
        microphone.start(500);

        startTimer(); // Start the timer

        microphone.onstart = () => {
          setMicOpen(true);
        };

        microphone.onstop = () => {
          setMicOpen(false);
        };

        microphone.ondataavailable = (e) => {
          add(e.data);
          setAudioBlobs((prevBlobs) => [...prevBlobs, e.data]);
          // console.log("Audio Blob Size:", e.data.size); // Log the size of the current audio blob
        };

        setUserMedia(userMedia);
        setMicrophone(microphone);
      }
    }
  }, [
    add,
    microphone,
    userMedia,
    finalizedSentences,
    startTimer,
    stopTimer,
    addSpeakerToDB,
    meetingID,
    speakerDetails,
    storeFinalizedSentence,
    timer,
    updateMeeting,
    disableRecording,
    audioBlobs,
    storeWordDetail,
    finalCaptions,
    setAudioBlobs,
    uploadAudioBlob,
    handleGenerateSummary,
    createAndSaveEmbedding,
  ]);

  //currently limititing to 5 second blob to reduce strain on gpu
  //need to implement sending rest of audio over 5 seconds
  function generateAudioBlobForSentence(
    sentence: FinalizedSentence,
    audioBlobs: Blob[]
  ): Blob {
    const startIndex = Math.ceil(sentence.start / 0.5);
    let endIndex = Math.floor(sentence.end / 0.5);

    // Ensure that the maximum number of blobs from startIndex is limited
    const maxBlobs = 100; // set to 100 for 500 ms = 50 seconds
    endIndex = Math.min(startIndex + maxBlobs - 1, endIndex);

    // Include the first blob for header information
    const headerBlob = audioBlobs[0];
    // Slice the section from startIndex to endIndex
    const sectionBlobs: Blob[] = audioBlobs.slice(startIndex, endIndex + 1);
    // Combine the header blob with the section blobs
    const combinedBlobs = [headerBlob, ...sectionBlobs];

    return new Blob(combinedBlobs, { type: "audio/webm" });
  }

  // Clear the interval when the component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      setAudioBlobs([]); // Reset audio blobs here
    };
  }, [timerInterval]);

  // Function to format the timer
  const formatTimer = () => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!apiKey) {
      // console.log("getting a new api key");
      fetch("/api", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          if (!("key" in object)) throw new Error("No api key returned");

          setApiKey(object);
          setLoadingKey(false);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [apiKey, setLoadingKey]);

  const connectToDeepgram = (
    apiKey: string,
    language: string,
    setListening: Function,
    setConnection: Function,
    setCaption: Function,
    setFinalCaptions: Function
  ) => {
    // console.log("Connecting to Deepgram:", language);
    const deepgram = createClient(apiKey);
    const connectionStartTime = Date.now(); // Start timing the connection

    const connection = deepgram.listen.live({
      model: "nova-2",
      diarize: true,
      interim_results: true,
      smart_format: true,
      language: language,
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      // console.log("Connection established with Deepgram.");
      setListening(true);
    });

    connection.on(LiveTranscriptionEvents.Close, async (event) => {
      const connectionDuration = Date.now() - connectionStartTime; // Calculate connection duration

      // console.log("Deepgram connection closed:", event);

      // console.log(
      //   "Deepgram connection closed:",
      //   JSON.stringify(
      //     {
      //       code: event.code, // The WebSocket close code
      //       reason: event.reason, // A string indicating the reason for the close
      //       wasClean: event.wasClean, // Boolean indicating whether the connection was closed cleanly
      //       connectionDuration: `${connectionDuration}ms`, // The duration of the connection
      //     },
      //     null,
      //     2
      //   )
      // );
      setListening(false);
      setApiKey(null);
      setConnection(null);
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const words = data.channel.alternatives[0].words
        .map((word: any) => word.punctuated_word ?? word.word)
        .join(" ");
      if (words !== "") {
        setCaption({ words, isFinal: data.is_final });

        if (data.is_final) {
          setFinalCaptions((prevCaptions: WordDetail[]) => [
            ...prevCaptions,
            ...data.channel.alternatives[0].words.map((word: any) => ({
              word: word.word,
              start: word.start,
              end: word.end,
              confidence: word.confidence,
              speaker: word.speaker,
              punctuated_word: word.punctuated_word,
            })),
          ]);
        }
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("Deepgram connection error:", error);
    });

    return connection;
  };

  useEffect(() => {
    if (apiKey && "key" in apiKey) {
      const connection = connectToDeepgram(
        apiKey.key,
        language,
        setListening,
        setConnection,
        setCaption,
        setFinalCaptions
      );
      setConnection(connection);
      setLoading(false);

      // Set up an interval to send keepAlive every 6 seconds
      // const keepAliveInterval = setInterval(() => {
      //   if (connection.getReadyState() === WebSocket.OPEN) {
      //     console.log("Sending keepAlive to Deepgram.");
      //     connection.keepAlive();
      //   }
      // }, 1000);

      return () => {
        //console.log("Disconnecting from Deepgram.");
        if (connection.getReadyState() === WebSocket.OPEN) {
          connection.finish();
        } else {
          // console.log(
          //   `Connection not open. State: ${connection.getReadyState()}`
          // );
        }
      };
    }
  }, [apiKey, language, setCaption, setFinalCaptions, setLoading]);

  useEffect(() => {
    const processQueue = async () => {
      if (size > 0 && !isProcessing) {
        setProcessing(true);

        if (isListening) {
          const blob = first;
          connection?.send(blob);
          remove();
        }

        const waiting = setTimeout(() => {
          clearTimeout(waiting);
          setProcessing(false);
        }, 250);
      }
    };

    processQueue();
  }, [connection, queue, remove, first, size, isProcessing, isListening]);

  // Function to process final captions and construct finalized sentences
  const processFinalCaptions = useCallback(
    async (finalCaptions: WordDetail[]) => {
      const sentences: FinalizedSentence[] = [];
      let currentSpeaker = finalCaptions[0]?.speaker;
      let currentText = "";
      let startTime = finalCaptions[0]?.start;
      let endTime = finalCaptions[0]?.end;

      // Track if we have already handled the current speaker
      let handledSpeakers: number[] = [];

      // New logic for capturing full questions
      let currentSentence = ""; // Track the current sentence being formed
      const detectedQuestions: QuestionDetail[] = []; // Array to hold detected questions

      for (const wordDetail of finalCaptions) {
        // Append the current word to the sentence being formed
        currentSentence += wordDetail.punctuated_word + " ";

        // Check if the current word ends with a question mark
        if (wordDetail.punctuated_word.endsWith("?")) {
          // If so, capture the entire current sentence as a question

          const currentQuestion: QuestionDetail = {
            question: currentSentence.trim(),
            timestamp: startTime,
            speaker: currentSpeaker,
            meetingID: meetingID,
          };

          detectedQuestions.push(currentQuestion);
          // Reset currentSentence for the next sentence
          currentSentence = "";
        }

        if (
          wordDetail.speaker !== currentSpeaker ||
          wordDetail === finalCaptions[finalCaptions.length - 1]
        ) {
          if (wordDetail === finalCaptions[finalCaptions.length - 1]) {
            currentText += wordDetail.punctuated_word + " ";
            endTime = wordDetail.end;
          }

          // If we haven't handled this speaker yet, do so now
          if (!handledSpeakers.includes(currentSpeaker)) {
            handleNewSpeaker(currentSpeaker);
            handledSpeakers.push(currentSpeaker);
          }

          sentences.push({
            speaker: currentSpeaker,
            transcript: currentText.trim(),
            start: startTime,
            end: endTime,
            meetingID: meetingID,
          });

          currentSpeaker = wordDetail.speaker;
          currentText = wordDetail.punctuated_word + " ";
          startTime = wordDetail.start;
          endTime = wordDetail.end;
        } else {
          currentText += wordDetail.punctuated_word + " ";
          endTime = wordDetail.end;
        }
      }
      // console.log("Finalized Sentences:", sentences);
      // console.log("Detected Questions:", detectedQuestions); // Log detected questions
      setFinalizedSentences(sentences);
      setQuestions(detectedQuestions);
    },
    [meetingID, handleNewSpeaker, setFinalizedSentences]
  );

  const processedSpeakersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Check if there are any finalized sentences
    if (finalizedSentences.length > 0) {
      // Get the last sentence from the finalizedSentences array
      const lastSentence = finalizedSentences[finalizedSentences.length - 1];
      // Calculate the duration of the last sentence
      const sentenceDuration = lastSentence.end - lastSentence.start;

      // Check if the duration is greater than 5 seconds and the speaker hasn't been processed yet
      if (
        sentenceDuration > 5 &&
        !processedSpeakersRef.current.has(lastSentence.speaker)
      ) {
        // Call updateSpeakerPredictedNames with the last sentence and audioBlobs
        updateSpeakerPredictedNames(lastSentence, audioBlobs).catch(
          console.error
        );

        console.log("speakerdetails", speakerDetails);
        // update chanceSpeakerDetailsByID with status "analyzing"
        // Find the speaker detail by speaker number
        const speakerDetail = speakerDetails.find(
          (detail) => detail.speakerNumber === lastSentence.speaker
        );

        if (speakerDetail) {
          const result = changeSpeakerDetailsByID({
            speakerId: speakerDetail._id as Id<"speakers">,
            speakerNumber: speakerDetail.speakerNumber,
            firstName: speakerDetail.firstName,
            lastName: speakerDetail.lastName,
            voiceAnalysisStatus: "analyzing",
            predictedNames: speakerDetail.predictedNames,
          });

          // Mark the speaker as processed by adding their number to the set
          processedSpeakersRef.current.add(lastSentence.speaker);
        }
      }
    }
  }, [finalizedSentences, audioBlobs]); // Depend on finalizedSentences and audioBlobs to re-run this effect when they change

  const updateSpeakerPredictedNames = async (
    lastSentence: FinalizedSentence,
    audioBlobs: Blob[]
  ) => {
    try {
      const sectionAudioBlob = generateAudioBlobForSentence(
        lastSentence,
        audioBlobs
      );
      const storageId = await uploadAudioToConvexFiles(sectionAudioBlob);

      const matches = await runGetNearestMatchingSpeakers({
        storageId: storageId as Id<"_storage">,
        meetingId: meetingID,
        speakerNumber: lastSentence.speaker,
      });
    } catch (error) {
      console.error("Error updating speaker predicted names:", error);
    }
  };

  useEffect(() => {
    //only run if we are adding to the length of finalizedsentencse not if we are removing from it (ie: deleting)
    if (finalizedSentences.length > prevFinalizedSentencesLengthRef.current) {
      const handleFinalizedSentencesChange = async () => {
        let currentLength = finalizedSentences.length;

        // Your logic here to handle changes in finalizedSentences
        if (currentLength > 1) {
          // if greater than 2 then we have our first complete sentence from our first speaker
          const lastSentenceIndex = currentLength - 2;
          const lastSentence = finalizedSentences[lastSentenceIndex];
          //step 1
          const sentenceID = await storeFinalizedSentence({
            meetingID: meetingID,
            speaker: lastSentence.speaker,
            transcript: lastSentence.transcript,
            start: lastSentence.start,
            end: lastSentence.end,
          });

          // When updating storedSentences, ensure all properties match the StoredSentence interface
          if (sentenceID) {
            setStoredSentences((prevStoredSentences) => [
              ...prevStoredSentences,
              {
                ...lastSentence,
                id: sentenceID, // Ensure this is never undefined
                // Add any missing properties here to match the StoredSentence interface
              },
            ]);
          } else {
            console.error("Failed to store sentence, sentenceID is void.");
          }
        }
      };

      handleFinalizedSentencesChange();
    }

    prevFinalizedSentencesLengthRef.current = finalizedSentences.length;
  }, [finalizedSentences.length]);

  //function to request predicted speakername based on speakernumber first time speaking
  //doesnt do anything but works weel, need to investigate how existing workflow works and if better than this one or not
  //then delete this one or the other

  useEffect(() => {
    // Extract speaker numbers from finalizedSentences
    const speakerNumbers = new Set(
      finalizedSentences.map((sentence) => sentence.speaker)
    );

    // Check if there's a new speaker number by comparing with the previous state
    const newSpeakers = Array.from(speakerNumbers).filter(
      (speakerNumber) => !prevSpeakerNumbers.current.has(speakerNumber)
    );

    if (newSpeakers.length > 0) {
      // Handle new speakers (e.g., log to console or update state)
      // console.log("New speaker(s) arrived:", newSpeakers);
      // Optionally, perform actions like updating state or calling a function
      // For example, you could call a function to handle new speakers:
      // newSpeakers.forEach(speakerNumber => handleNewSpeakerArrival(speakerNumber));

      // Update the ref with the current set of speaker numbers
      prevSpeakerNumbers.current = speakerNumbers;
    }
  }, [finalizedSentences]); // Depend on finalizedSentences to re-run this effect when it changes

  // Use a ref to keep track of the previous set of speaker numbers without triggering re-renders
  const prevSpeakerNumbers = useRef(
    new Set(finalizedSentences.map((sentence) => sentence.speaker))
  );

  const [questions, setQuestions] = useState<QuestionDetail[]>([]);
  // Inside your component
  const prevQuestionsLengthRef = useRef(questions.length);
  useEffect(() => {
    // Check if the questions array has grown
    if (questions.length > prevQuestionsLengthRef.current) {
      // A new question was added, handle it here
      const newQuestion = questions[questions.length - 1];
      // console.log("New question added:", newQuestion);
      storeQuestion(newQuestion);
    }
    // Update the ref to the current length after handling
    prevQuestionsLengthRef.current = questions.length;
  }, [questions, storeQuestion]);

  // Call processFinalCaptions whenever finalCaptions is updated
  useEffect(() => {
    if (finalCaptions.length > 0) {
      processFinalCaptions(finalCaptions);
    }
  }, [finalCaptions, processFinalCaptions]);

  // if (isLoadingKey)
  //   return <span className="">Loading temporary API key...</span>;
  // if (isLoading) return <span className="">Loading the app...</span>;

  return (
    <div className="flex flex-col">
      <div className="flex flex-row">
        <div className="flex flex-row items-center space-x-2 mr-4">
          {initialDuration === 0 && timer === 0 ? (
            <></>
          ) : (
            <>
              <Timer className="w-6 h-6" />
              <span>{formatTimer()}</span>
            </>
          )}
        </div>
        {/* toggle microphone */}
        {!downloadUrl && (
          <Button
            variant={
              !!userMedia && !!microphone && micOpen
                ? "destructive"
                : "secondary"
            }
            size="icon"
            onClick={() => toggleMicrophone()}
            disabled={isLoadingKey} // Button is disabled if isLoadingKey is true
            className={
              !!userMedia && !!microphone && micOpen
                ? "" // recording enabled
                : "" // recording disabled
            }
          >
            {!!userMedia && !!microphone && micOpen ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </Button>
        )}
        {/* toggle download */}

        {downloadUrl && (
          <Button size="icon" className="">
            <Link href={downloadUrl} download="recorded_audio.webm">
              <Download />
            </Link>
          </Button>
        )}
      </div>
      {/* connection indicator for deepgram via socket and temp api key */}
      {/* <div
        className="z-20 flex shrink-0 grow-0 justify-around items-center 
                  fixed bottom-0 right-0 rounded-lg mr-1 mb-5 lg:mr-5 lg:mb-5 xl:mr-10 xl:mb-10 gap-5"
      >
        <Button
          variant={isListening ? "secondary" : "outline"}
          className="space-x-2"
        >
          <Dg
            id="dg"
            width="24"
            height="24"
            className={isListening ? "" : ""}
          />
          <Label htmlFor="dg" className="">
            {isListening ? "connected" : "connecting"}
          </Label>
        </Button>
      </div> */}
    </div>
  );
}
