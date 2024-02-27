//inport react stuff
import React, { Dispatch, SetStateAction, useState } from "react";

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

interface CaptionDetail {
  words: string;
  isFinal: boolean;
}

interface TranscriptDisplayProps {
  speakerDetails: SpeakerDetail[];
  setSpeakerDetails: Dispatch<SetStateAction<SpeakerDetail[]>>;
  finalizedSentences: FinalizedSentence[];
  caption: CaptionDetail | null;
  setCaption?: Dispatch<SetStateAction<CaptionDetail | null>>; // Make it optional if it's not always needed
  removeFinalizedSentence: (index: number) => void;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  speakerDetails,
  setSpeakerDetails,
  finalizedSentences,
  caption,
  removeFinalizedSentence,
}) => {
  // Moved inside TranscriptDisplay
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

    // Filter records with the selected name
    const recordsWithName = predictedNames.filter(
      (predictedName) => predictedName.name === selectedName
    );

    if (recordsWithName.length === 0) {
      console.log("No matching predicted name found for the selected name.");
      return;
    }

    // Find the record with the maximum score among those with the selected name
    const selectedPredictedName = recordsWithName.reduce(
      (maxRecord, currentRecord) =>
        (maxRecord.score || 0) > (currentRecord.score || 0)
          ? maxRecord
          : currentRecord
    );

    // Update the speaker details with the selected predicted name
    setSpeakerDetails((prevSpeakers) => {
      const updatedSpeakers = prevSpeakers.map((speaker) => {
        if (speaker.speakerNumber === speakerNumber) {
          return { ...speaker, firstName: selectedPredictedName.name };
        }
        return speaker;
      });
      return updatedSpeakers;
    });
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
                        className="col-span-2 h-8"
                      />
                    </div>
                  </div>
                </div>
                <Separator className="my-5" />

                <h4 className="font-medium leading-none mb-2">
                  Predicted Names
                </h4>
                <p className="text-sm text-muted-foreground">
                  AI predictictions based on your previous meetings:
                </p>
                {speaker.predictedNames &&
                  speaker.predictedNames.length == 0 && (
                    <div className="flex flex-row items-end text-sm text-muted-foreground mt-2">
                      <p className="">Please speak a bit longer</p>
                      <PulseLoader color="#9CA3AF" size={3} />
                    </div>
                  )}
                {speaker.predictedNames &&
                  speaker.predictedNames.length > 0 &&
                  (speaker.predictedNames[0].name === "analyzing" &&
                  speaker.predictedNames[0].score === 1 ? (
                    <div className="flex flex-row items-end text-sm text-muted-foreground mt-2">
                      <p className="">Analyzing speaker</p>
                      <PulseLoader color="#9CA3AF" size={3} />
                    </div>
                  ) : (
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
                        <div key={idx} className="flex items-center space-x-4">
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
                  ))}
              </PopoverContent>
            </Popover>
          </div>
        ))}
      </div>
      <ScrollArea className="h-[calc(100vh-260px)] md:h-[calc(100vh-305px)]">
        {/* Display is_final responses */}
        {(finalizedSentences.length > 0 || caption) && (
          <div className="mt-5 my-4 space-y-4">
            {finalizedSentences.map((sentence, index) => (
              <div key={index} className="flex flex-row">
                <Avatar className="">
                  <AvatarImage src="" />
                  <AvatarFallback>
                    <User />
                  </AvatarFallback>
                </Avatar>
                <div className="relative flex flex-col ml-4 border rounded-lg p-4 group">
                  <div className="flex flex-row justify-between mb-3">
                    <div className="absolute -top-6 right-2 opacity-0 group-hover:opacity-100 text-sm text-muted-foreground">
                      {sentence.start.toFixed(2)} - {sentence.end.toFixed(2)}
                    </div>
                    <div className="font-bold mr-8">
                      {getSpeakerName(sentence.speaker)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-m-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                      onClick={() => removeFinalizedSentence(index)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <div>
                    {sentence.transcript}{" "}
                    {index === finalizedSentences.length - 1 && (
                      <div>
                        {caption && !caption.isFinal && (
                          <div className="text-blue-500">{caption.words}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
