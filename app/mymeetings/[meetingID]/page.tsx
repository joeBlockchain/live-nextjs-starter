"use client";

//import react stuff
import { useState, Suspense, useEffect, useCallback } from "react"; // Import useEffect

import { format, isValid, formatDistanceToNow } from "date-fns";

//import nextjs stuff
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

//import clerk stuff
import { useUser } from "@clerk/nextjs";

//import convex stuff
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvexAuth } from "convex/react";

//import shadcnui stuff
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

//import icon stuff
import {
  PenLine,
  CalendarIcon,
  SparklesIcon,
  Clock,
  MoreHorizontal,
  Upload,
  Video,
} from "lucide-react";

// import custom stuff
import Microphone from "@/components/microphone";
import TranscriptDisplay from "@/components/microphone/transcript";
import Chat from "@/components/chat/chat";
import NoteContainer from "@/components/wysiwyg/noteContainer";
import { Breadcrumbs, BreadcrumbItem } from "@/components/ui/breadcrumbs";
import MeetingSettings from "@/components/meetings/settings-meeting";
import UploadAudioDialog from "@/components/meetings/upload-audio-dialog";

//import custom stuff
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const NoteContainerNoSSR = dynamic(
  () => import("@/components/wysiwyg/noteContainer"),
  {
    ssr: false,
  }
);

type Meeting = {
  title: string;
  userId: string;
  _creationTime: string;
  duration: number;
};

interface FinalizedSentence {
  speaker: number;
  speakerId?: Id<"speakers">;
  transcript: string;
  start: number;
  end: number;
  meetingID: Id<"meetings">;
}

interface StoredSentence {
  id: Id<"finalizedSentences">;
  // Include other properties of a stored sentence that you might need
}

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

export interface QuestionDetail {
  question: string;
  timestamp: number; // You can choose to track the time the question was asked
  speaker: number; // Optional: track which speaker asked the question
  meetingID: Id<"meetings">;
}

export default function Page({
  params,
}: {
  params: { meetingID: Id<"meetings">; language: string };
}) {
  const { user } = useUser();
  const isPowerUser = user?.publicMetadata?.isPowerUser === "true";

  const { isLoading, isAuthenticated } = useConvexAuth();
  const [micOpen, setMicOpen] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  // Add a new local state for the editable title
  const [editableTitle, setEditableTitle] = useState("");

  const meetingDetails = useQuery(api.meetings.getMeetingByID, {
    meetingID: params.meetingID!,
  }) as Meeting[] | undefined;

  const searchParams = useSearchParams();
  const language = searchParams.get("language") || "defaultLanguage";

  // Now that date is declared, you can use it in useEffect or anywhere else
  useEffect(() => {
    if (meetingDetails && meetingDetails.length > 0) {
      const creationDate = new Date(meetingDetails[0]._creationTime);
      setDate(creationDate);
      // Set the editable title from the fetched meeting details
      setEditableTitle(meetingDetails[0].title);
    }
  }, [meetingDetails, setDate]);

  const meetingDate =
    meetingDetails && meetingDetails.length > 0
      ? new Date(meetingDetails[0]._creationTime)
      : new Date();
  const isValidDate = isValid(meetingDate);
  const formattedDate = isValidDate
    ? format(meetingDate, "MMMM do, yyyy")
    : "Invalid date";
  const timeAgo = isValidDate
    ? formatDistanceToNow(meetingDate, { addSuffix: true })
    : "Invalid date";
  const meetingTime = isValidDate
    ? format(meetingDate, "hh:mm a")
    : "Invalid time";

  // Lifted state
  const [finalizedSentences, setFinalizedSentences] = useState<
    FinalizedSentence[]
  >([]);
  const [storedSentences, setStoredSentences] = useState<StoredSentence[]>([]);

  const [speakerDetails, setSpeakerDetails] = useState<SpeakerDetail[]>([]);
  const [caption, setCaption] = useState<CaptionDetail | null>(null);
  const [finalCaptions, setFinalCaptions] = useState<WordDetail[]>([]);

  // State for managing the selected tab for smaller screens to just 1 component
  const [selectedTab, setSelectedTab] = useState<string>("Transcript");
  // Function to handle tab change
  const handleTabChange = (value: string) => {
    setSelectedTab(value);
  };

  // New state for managing selected content on larger screens
  const [selectedContentLargeScreen, setSelectedContentLargeScreen] =
    useState<string>("Transcript");

  const updateMeetingTitle = useMutation(api.meetings.updateMeetingTitle);
  // Adjust handleTitleChange to update local state
  const handleTitleChange = (newTitle: string) => {
    setEditableTitle(newTitle);
  };

  // New function to handle updating the title in Convex on blur or enter key press
  const updateTitleInConvex = async () => {
    try {
      await updateMeetingTitle({
        meetingID: params.meetingID,
        newTitle: editableTitle,
      });
      // Optionally, refresh the meeting details or show a success message
    } catch (error) {
      console.error("Failed to update meeting title:", error);
      // Optionally, show an error message
    }
  };

  // New state for managing questions
  const [questions, setQuestions] = useState<QuestionDetail[]>([]);

  const deleteFinalizedSentenceById = useMutation(
    api.transcript.deleteFinalizedSentence
  );
  const deleteSpeakerById = useMutation(api.meetings.deleteSpeaker);

  const removeFinalizedSentence = useCallback(
    async (index: number) => {
      // Retrieve the sentence to be deleted
      const sentenceToRemove = finalizedSentences[index];

      // Update finalizedSentences by removing the sentence at the specified index
      setFinalizedSentences((currentSentences) => {
        const updatedSentences = currentSentences.filter((_, i) => i !== index);

        // Check if there are any sentences left for the speaker of the removed sentence
        const speakerSentencesLeft = updatedSentences.some(
          (sentence) => sentence.speaker === sentenceToRemove.speaker
        );

        if (!speakerSentencesLeft) {
          // Use speakerNumber to find the speakerID from speakerDetails
          const speakerDetail = speakerDetails.find(
            (detail) => detail.speakerNumber === sentenceToRemove.speaker
          );
          if (speakerDetail && speakerDetail._id) {
            // If a matching speaker is found and has a speakerID, delete the speaker
            deleteSpeakerById({ speakerId: speakerDetail._id });
          }
        }
        return updatedSentences;
      });

      // Update finalCaptions by removing words that fall within the start and end time of the sentenceToRemove
      setFinalCaptions((currentCaptions) =>
        currentCaptions.filter(
          (caption) =>
            !(
              caption.start >= sentenceToRemove.start &&
              caption.end <= sentenceToRemove.end
            )
        )
      );

      // if sentence was stored in DB remove it
      deleteFinalizedSentenceById({
        sentenceId: storedSentences[index].id,
      }).catch(console.error);
      setStoredSentences((currentSentences) =>
        currentSentences.filter((_, i) => i !== index)
      );
    },
    [finalizedSentences, setFinalizedSentences, setFinalCaptions]
  );

  const [
    continuousSpeakerPredictionEnabled,
    setContinuousSpeakerPredictionEnabled,
  ] = useState(true);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] mx-5">
      <div className="mt-2 flex flex-row items-center justify-between">
        <Breadcrumbs className="">
          <BreadcrumbItem href="/mymeetings">All Meetings</BreadcrumbItem>
          <BreadcrumbItem>{meetingDetails?.[0]?.title}</BreadcrumbItem>
        </Breadcrumbs>
        {isPowerUser && (
          <MeetingSettings
            continuousSpeakerPredictionEnabled={
              continuousSpeakerPredictionEnabled
            }
            setContinuousSpeakerPredictionEnabled={
              setContinuousSpeakerPredictionEnabled
            }
          />
        )}
      </div>
      <div className="group flex flex-row items-center my-2">
        <Input
          type="text"
          placeholder="Untitled Meeting"
          value={editableTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={updateTitleInConvex} // Update Convex when the input loses focus
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Prevent form submission if wrapped in a form
              updateTitleInConvex(); // Update Convex when enter is pressed
            }
          }}
          className="text-3xl font-bold leading-none border-none focus:ring-0"
        />
        <div className="" />
        <Microphone
          meetingID={params.meetingID}
          language={language}
          micOpen={micOpen}
          setMicOpen={setMicOpen}
          continuousSpeakerPredictionEnabled={
            continuousSpeakerPredictionEnabled
          }
          finalizedSentences={finalizedSentences}
          setFinalizedSentences={setFinalizedSentences}
          storedSentences={storedSentences}
          setStoredSentences={setStoredSentences}
          speakerDetails={speakerDetails}
          setSpeakerDetails={setSpeakerDetails}
          setCaption={setCaption}
          caption={caption}
          finalCaptions={finalCaptions}
          setFinalCaptions={setFinalCaptions}
          initialDuration={meetingDetails?.[0]?.duration || 0}
          questions={questions} // Pass the questions state here
          setQuestions={setQuestions} // Pass the setQuestions state here
        />
      </div>
      <div className="flex justify-end sm:justify-between items-center text-sm md:mt-2 sm:ml-2">
        <div className="hidden sm:flex flex-row items-center">
          <div className="flex flex-row items-center tracking-wide space-x-6">
            <div className="flex flex-row items-center space-x-2">
              <CalendarIcon className="h-4 w-4" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex flex-row items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>{meetingTime}</span>
            </div>
            <span className="text-muted-foreground hidden md:block">
              ({timeAgo})
            </span>
          </div>
        </div>
        <Tabs
          defaultValue="Transcript"
          className="md:hidden"
          onValueChange={handleTabChange}
        >
          <TabsList>
            <TabsTrigger value="Transcript">Transcript</TabsTrigger>
            <TabsTrigger value="Notes">AI Summary</TabsTrigger>
            <TabsTrigger value="Chat">Chat</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Separator orientation="horizontal" className="mt-2 " />
      <div className=" flex-grow flex flex-row mt-3 h-[calc(100vh-255px)]">
        {/* Conditional rendering based on the selectedTab */}
        <div className="relative flex flex-col sm:flex-grow">
          <Tabs
            defaultValue="Transcript"
            className="hidden md:block"
            // onValueChange=
          >
            <TabsList id="tabs-list-large-screen" className="absolute right-0">
              <TabsTrigger value="Transcript">Transcript</TabsTrigger>
              <TabsTrigger value="Notes">AI Summary</TabsTrigger>
            </TabsList>
            <TabsContent value="Transcript" className="mt-12">
              <Suspense fallback={<div>Loading...</div>}>
                <TranscriptDisplay
                  micOpen={micOpen}
                  meetingId={params.meetingID}
                  speakerDetails={speakerDetails}
                  setSpeakerDetails={setSpeakerDetails} // Pass this prop to update the state
                  finalizedSentences={finalizedSentences}
                  caption={caption}
                  removeFinalizedSentence={removeFinalizedSentence} // Passing the function as a prop
                />
              </Suspense>
            </TabsContent>
            <TabsContent value="Notes" className="flex flex-col">
              <Suspense fallback={<div>Loading...</div>}>
                <NoteContainerNoSSR
                  meetingID={params.meetingID}
                  finalizedSentences={finalizedSentences}
                  speakerDetails={speakerDetails}
                  language={language}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
          <div
            className={` ${
              selectedTab === "Transcript" ? "md:hidden" : "hidden"
            }`}
          >
            <Suspense fallback={<div>Loading...</div>}>
              <TranscriptDisplay
                meetingId={params.meetingID}
                micOpen={micOpen}
                speakerDetails={speakerDetails}
                setSpeakerDetails={setSpeakerDetails} // Pass this prop to update the state
                finalizedSentences={finalizedSentences}
                caption={caption}
                removeFinalizedSentence={removeFinalizedSentence} // Passing the function as a prop
              />
            </Suspense>
          </div>
          <div
            className={` ${selectedTab === "Notes" ? "md:hidden" : "hidden"}`}
          >
            <Suspense fallback={<div>Loading...</div>}>
              <NoteContainerNoSSR
                meetingID={params.meetingID}
                finalizedSentences={finalizedSentences}
                speakerDetails={speakerDetails}
                language={language}
              />
            </Suspense>
          </div>
        </div>
        <Separator
          orientation="vertical"
          className="mx-4 h-full hidden md:block"
        ></Separator>
        <div
          className={`md:w-1/2 md:max-w-[448px] sm:min-w-[448px] ${
            selectedTab === "Chat" ? "" : "hidden md:block"
          }`}
        >
          <Chat
            meetingID={params.meetingID}
            finalizedSentences={finalizedSentences}
            speakerDetails={speakerDetails}
          />
        </div>
      </div>
    </div>
  );
}
