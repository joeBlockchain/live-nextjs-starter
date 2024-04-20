//inport react stuff
import React, {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  useRef,
} from "react";

//import convex stuff
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

//import icon stuff
import { User, X } from "lucide-react";
import type { SpeakerDetail, FinalizedSentence } from "../microphone"; // Assuming these types are exported from microphone.tsx

//import spinner stuff
import PulseLoader from "react-spinners/PulseLoader";

//import custom stuff
import SentimentAnalysisComponent from "@/components/microphone/sentiment";

interface CaptionDetail {
  words: string;
  isFinal: boolean;
}

interface TranscriptDisplayProps {
  meetingId: Id<"meetings">;
  micOpen: boolean;
  speakerDetails: SpeakerDetail[];
  setSpeakerDetails: Dispatch<SetStateAction<SpeakerDetail[]>>;
  finalizedSentences: FinalizedSentence[];
  caption: CaptionDetail | null;
  setCaption?: Dispatch<SetStateAction<CaptionDetail | null>>; // Make it optional if it's not always needed
  removeFinalizedSentence: (index: number) => void;
  // Assuming meetingID is required
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  meetingId,
  micOpen,
  speakerDetails,
  setSpeakerDetails,
  finalizedSentences,
  caption,
  removeFinalizedSentence,
}) => {
  const changeSpeakerDetailsByID = useMutation(
    api.meetings.changeSpeakerDetailsByID
  );

  const deleteFinalizedSentenceByIdKeep = useMutation(
    api.transcript.deleteFinalizedSentence
  );

  const handleDeleteFinalizedSentence = async (id: string) => {
    try {
      await deleteFinalizedSentenceByIdKeep({
        sentenceId: id as Id<"finalizedSentences">,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleFirstNameChange = (id: number, newFirstName: string) => {
    setSpeakerDetails((prevSpeakers) =>
      prevSpeakers.map((speaker) =>
        speaker.speakerNumber === id
          ? { ...speaker, firstName: newFirstName }
          : speaker
      )
    );
  };

  const updateFirstNameInDatabase = async (
    id: number,
    newFirstName: string
  ) => {
    const speaker = speakerDetails.find(
      (speaker) => speaker.speakerNumber === id
    ) as SpeakerDetail;
    if (speaker) {
      try {
        await changeSpeakerDetailsByID({
          speakerId: speaker._id!, // need to fix this as we added _id latter and should update the interface
          speakerNumber: id,
          firstName: newFirstName,
          lastName: speaker.lastName,
          predictedNames: speaker.predictedNames,
          voiceAnalysisStatus: speaker.voiceAnalysisStatus,
        });
      } catch (error) {
        console.error(error);
      }
    }
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

  const updateLastNameInDatabase = async (id: number, newLastName: string) => {
    const speaker = speakerDetails.find(
      (speaker) => speaker.speakerNumber === id
    ) as SpeakerDetail;

    if (speaker) {
      try {
        await changeSpeakerDetailsByID({
          speakerId: speaker._id!, // Assuming speakerID is the correct identifier
          speakerNumber: id,
          firstName: speaker.firstName,
          lastName: newLastName,
          predictedNames: speaker.predictedNames,
          voiceAnalysisStatus: speaker.voiceAnalysisStatus,
        });
      } catch (error) {
        console.error(error);
      }
    }
  };

  const getSpeakerName = (speakerNumber: number) => {
    const speaker = speakerDetails.find(
      (s) => s.speakerNumber === speakerNumber
    );
    return speaker && (speaker.firstName || speaker.lastName)
      ? `${speaker.firstName} ${speaker.lastName}`.trim()
      : `Speaker ${speakerNumber}`;
  };

  const handlePredictedNameSelection = (
    speakerNumber: number,
    predictedNames:
      | {
          name: string;
          speakerId: string;
          embeddingId: string;
          score?: number;
        }[]
      | undefined,
    selectedName: string
  ) => {
    if (!predictedNames) {
      console.log("Predicted names are undefined.");
      return; // Guard clause to handle undefined predictedNames
    }

    // Directly use handleFirstNameChange to update the local state
    handleFirstNameChange(speakerNumber, selectedName);

    // Then, use updateFirstNameInDatabase to persist the change
    updateFirstNameInDatabase(speakerNumber, selectedName);
  };

  const groupPredictedNamesAndMaxScores = (
    predictedNames: {
      name: string;
      speakerId: string;
      embeddingId: string;
      score?: number;
    }[]
  ) => {
    const grouped = predictedNames.reduce(
      (acc, { name, score = 0 }) => {
        if (!acc[name]) {
          acc[name] = { maxScore: score };
        } else {
          acc[name].maxScore = Math.max(acc[name].maxScore, score);
        }
        return acc;
      },
      {} as Record<string, { maxScore: number }>
    );

    return Object.entries(grouped).map(([name, { maxScore }]) => ({
      name,
      maxScore,
    }));
  };

  // Function to determine badge color based on score
  const getBadgeColor = (score: number | undefined) => {
    // Provide a default score (e.g., 0) if score is undefined
    const finalScore = score ?? 0;
    if (finalScore > 0.75) {
      return "bg-emerald-500 dark:bg-emerald-600 dark:text-emerald-200 hover:bg-emerald-600 dark:hover:bg-emerald-700";
    } else if (finalScore > 0.5) {
      return "bg-amber-500 dark:bg-amber-600 dark:text-amber-200 hover:bg-amber-600 dark:hover:bg-amber-700";
    } else {
      return "bg-red-500 dark:bg-red-600 dark:text-red-200 hover:bg-red-600 dark:hover:bg-red-700";
    }
  };

  const { results, status, loadMore } = usePaginatedQuery(
    api.transcript.getFinalizedSentencesByMeetingPagination,
    { meetingID: meetingId },
    { initialNumItems: 5 }
  );

  const loader = useRef(null);

  useEffect(() => {
    if (status !== "CanLoadMore") return;

    const observer = new IntersectionObserver(handleObserver, { threshold: 1 });
    if (loader.current) {
      observer.observe(loader.current);
    }

    function handleObserver(entities: any) {
      const target = entities[0];
      if (target.isIntersecting) {
        loadMore(5);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [status, loadMore]);

  return (
    <div className="flex flex-col">
      {/* Display Speakers */}
      <div className="flex flex-wrap gap-2">
        {speakerDetails.map((speaker, index) => (
          <div key={index} className="flex flex-row gap-3">
            <Popover>
              <PopoverTrigger>
                <Badge variant="outline" className="h-8">
                  {speaker.firstName || speaker.lastName
                    ? `${speaker.firstName} ${speaker.lastName}`.trim()
                    : `Speaker ${speaker.speakerNumber}`}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">
                      Speaker Details
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Update speaker details below:
                    </p>
                  </div>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor={`firstName-${speaker.speakerNumber}`}>
                        First Name
                      </Label>
                      <Input
                        id={`firstName-${speaker.speakerNumber}`}
                        value={speaker.firstName}
                        onChange={(e) =>
                          handleFirstNameChange(
                            speaker.speakerNumber,
                            e.target.value
                          )
                        }
                        onBlur={() =>
                          updateFirstNameInDatabase(
                            speaker.speakerNumber,
                            speaker.firstName
                          )
                        }
                        onKeyUp={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault(); // Prevent form submission if wrapped in a form
                            updateFirstNameInDatabase(
                              speaker.speakerNumber,
                              speaker.firstName
                            );
                          }
                        }}
                        className="col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor={`lastName-${speaker.speakerNumber}`}>
                        Last Name
                      </Label>
                      <Input
                        id={`lastName-${speaker.speakerNumber}`}
                        value={speaker.lastName}
                        onChange={(e) =>
                          handleLastNameChange(
                            speaker.speakerNumber,
                            e.target.value
                          )
                        }
                        onBlur={() =>
                          updateLastNameInDatabase(
                            speaker.speakerNumber,
                            speaker.lastName
                          )
                        }
                        onKeyUp={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault(); // Prevent form submission if wrapped in a form
                            updateLastNameInDatabase(
                              speaker.speakerNumber,
                              speaker.lastName
                            );
                          }
                        }}
                        className="col-span-2 h-8"
                      />
                    </div>
                  </div>
                </div>
                <Separator className="my-5" />
                <div className="relative">
                  <h4 className="font-medium leading-none mb-3">
                    Predicted Names
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    AI predictictions based on your previous meetings:
                  </p>
                  {speaker.predictedNames &&
                    speaker.predictedNames.length == 0 && (
                      <div className="flex flex-row items-end text-sm text-muted-foreground mt-2">
                        <Badge
                          variant="outline"
                          className="absolute -top-1.5 right-0 py-1.5"
                        >
                          <p>
                            {speaker.voiceAnalysisStatus
                              .charAt(0)
                              .toUpperCase() +
                              speaker.voiceAnalysisStatus.slice(1)}
                          </p>
                        </Badge>
                        {/* <PulseLoader color="#9CA3AF" size={3} className="mb-.5" /> */}
                      </div>
                    )}
                  {speaker.predictedNames &&
                    speaker.predictedNames.length > 0 && (
                      <div>
                        <div className="flex flex-row items-end text-sm text-muted-foreground mt-2">
                          <Badge
                            variant="outline"
                            className="absolute -top-1.5 right-0 py-1.5"
                          >
                            <p>
                              {speaker.voiceAnalysisStatus
                                .charAt(0)
                                .toUpperCase() +
                                speaker.voiceAnalysisStatus.slice(1)}
                            </p>
                          </Badge>
                          {/* <PulseLoader color="#9CA3AF" size={3} className="mb-.5" /> */}
                        </div>
                        <RadioGroup
                          className="space-y-4 mt-5"
                          defaultValue={speaker.predictedNames[0].embeddingId} // Adjust if necessary
                          onValueChange={(newValue) =>
                            handlePredictedNameSelection(
                              speaker.speakerNumber,
                              speaker.predictedNames, // This might need adjustment
                              newValue
                            )
                          }
                        >
                          {groupPredictedNamesAndMaxScores(
                            speaker.predictedNames
                          ).map((predictedName, idx) => (
                            <div
                              key={idx}
                              className="flex items-center space-x-4"
                            >
                              <RadioGroupItem
                                value={predictedName.name} // Using name as value; ensure it's unique or adjust
                                id={`speaker-${speaker.speakerNumber}-name-${idx}`} // Adjust ID to use index or another unique identifier
                              />
                              <Label
                                className="flex flex-row items-center space-x-2 cursor-pointer"
                                htmlFor={`speaker-${speaker.speakerNumber}-name-${idx}`} // Adjust htmlFor to match
                              >
                                <Badge
                                  className={`mr-1 ${getBadgeColor(
                                    predictedName.maxScore
                                  )}`}
                                >
                                  {(predictedName.maxScore * 100).toFixed(0)}%
                                </Badge>
                                <span>{predictedName.name}</span>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ))}
      </div>
      <ScrollArea className="mt-4 h-[calc(100vh-260px)] md:h-[calc(100vh-305px)]">
        <div className="flex flex-col space-y-4">
          {results?.map(
            (
              result // Keep the full result object here
            ) => (
              <div key={result._id} className="flex flex-row">
                <Avatar className="">
                  <AvatarImage src="" />
                  <AvatarFallback>
                    <User />
                  </AvatarFallback>
                </Avatar>
                <div className="relative flex flex-col ml-4 border rounded-lg p-4 group">
                  <div className="flex flex-row justify-between mb-3">
                    <div className="absolute -top-6 right-2 opacity-0 group-hover:opacity-100 text-sm text-muted-foreground">
                      {result.start.toFixed(2)} - {result.end.toFixed(2)}
                    </div>
                    <div className="font-bold mr-8">
                      {getSpeakerName(result.speaker)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-m-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                      onClick={() => handleDeleteFinalizedSentence(result._id)} // Pass the full result object here
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <div className="">{result.transcript} </div>
                  {/* <div className="absolute bottom-2 right-2"> */}
                  <SentimentAnalysisComponent
                    text={result.transcript}
                    sentenceId={result._id}
                    sentimentProp={result.sentiment}
                  />
                  {/* </div> */}
                </div>
              </div>
            )
          )}
          <div ref={loader} className="text-center">
            {/* {status === "Exhausted" ? (
              <Badge variant="outline" className="text-muted-foreground p-2">
                End of Transcript
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground p-2">
                Loading More
              </Badge>
            )} */}
          </div>
        </div>
        {/* Display is_final responses */}
        {/* Display is_final responses */}
        {micOpen && (finalizedSentences.length > 0 || caption) && (
          <div className="space-y-4">
            {finalizedSentences.length > 0 && (
              <div className="flex flex-row">
                <Avatar className="">
                  <AvatarImage src="" />
                  <AvatarFallback>
                    <User />
                  </AvatarFallback>
                </Avatar>
                <div className="relative flex flex-col ml-4 border rounded-lg p-4 group">
                  <div className="flex flex-row justify-between mb-3">
                    <div className="absolute -top-6 right-2 opacity-0 group-hover:opacity-100 text-sm text-muted-foreground">
                      {finalizedSentences[
                        finalizedSentences.length - 1
                      ].start.toFixed(2)}{" "}
                      -{" "}
                      {finalizedSentences[
                        finalizedSentences.length - 1
                      ].end.toFixed(2)}
                    </div>
                    <div className="font-bold mr-8">
                      {getSpeakerName(
                        finalizedSentences[finalizedSentences.length - 1]
                          .speaker
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-m-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                      onClick={() =>
                        removeFinalizedSentence(finalizedSentences.length - 1)
                      }
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <div>
                    {
                      finalizedSentences[finalizedSentences.length - 1]
                        .transcript
                    }{" "}
                    {caption && !caption.isFinal && (
                      <span className="text-blue-500">{caption.words}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {caption && finalizedSentences.length === 0 && (
              <div className="flex flex-row">
                <Avatar className="">
                  <AvatarFallback>
                    <User />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col ml-4 border rounded-lg p-4">
                  <div>
                    {caption && !caption.isFinal && (
                      <div className="text-blue-500">{caption.words}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default TranscriptDisplay;
