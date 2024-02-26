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
    return speaker
      ? `${speaker.firstName} ${speaker.lastName}`.trim()
      : `Speaker ${speakerNumber}`;
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
                  {speaker.firstName} {speaker.lastName}
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
                  Predicted Names:
                </h4>
                {speaker.predictedNames &&
                  speaker.predictedNames.length == 0 && (
                    <p className="text-sm text-muted-foreground">
                      No predictions found... yet!
                    </p>
                  )}
                {speaker.predictedNames &&
                  speaker.predictedNames.length > 0 && (
                    <RadioGroup
                      className=" space-y-4 mt-5"
                      defaultValue={speaker.predictedNames[0].name}
                      // onChange={(newValue) =>
                      //   handlePredictedNameChange(
                      //     speaker.speakerNumber,
                      //     newValue
                      //   )
                      // }
                    >
                      {speaker.predictedNames.map((predictedName, idx) => (
                        <div key={idx} className="flex items-center space-x-4">
                          <RadioGroupItem
                            value={predictedName.name}
                            id={`speaker-${speaker.speakerNumber}-name-${idx}`}
                          />
                          <Label
                            className="flex flex-row items-center space-x-2 cursor-pointer"
                            htmlFor={`speaker-${speaker.speakerNumber}-name-${idx}`}
                          >
                            <Badge
                              className={`mr-1 ${getBadgeColor(
                                predictedName.score
                              )}`}
                            >
                              {(predictedName.score * 100).toFixed(0)}
                            </Badge>
                            <span>{predictedName.name.slice(0, 10)}...</span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
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
