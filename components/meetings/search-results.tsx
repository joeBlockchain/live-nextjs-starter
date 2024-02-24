"use client";

//import react stuff
import React, { useState } from "react";

//import next stuff
import { useRouter } from "next/navigation"; // Changed from 'next/router' to 'next/navigation'

//import convex stuff
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

//import useful stuff
import { format, formatDistanceToNow } from "date-fns";

//impoe shadcnui stuff
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

//import icon stuff
import { User, CalendarIcon, Clock, Timer, X } from "lucide-react";

//import types
import type { SearchResult } from "@/lib/types";

interface SearchResultsProps {
  searchResults: SearchResult[];
  onClearSearch: () => void; // Add this line
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  searchResults,
  onClearSearch,
}) => {
  const router = useRouter();

  const [showHighWordCount, setShowHighWordCount] = useState(false);

  // Toggle function for showing sentences with high or low word count
  const toggleWordCountFilter = () => {
    setShowHighWordCount(!showHighWordCount);
  };

  const searchInput = searchResults[0]?.searchInput;
  const [selectedSpeaker, setSelectedSpeaker] = useState("");

  const handleRowClick = (meetingId: string) => {
    router.push(`/mymeetings/${meetingId}`);
  };

  // Extract sentenceIds from searchResults
  const sentenceIds = searchResults.map((result) => result.id);
  const meetingIds = searchResults.map((result) => result.meetingID);

  const sentenceDetails = useQuery(
    api.transcript.fetchMultipleFinalizedSentenceDetails,
    { sentenceIds }
  );

  const meetingDetails = useQuery(api.meetings.fetchMultipleMeetingDetails, {
    meetingIds,
  });

  const speakers = useQuery(api.meetings.fetchMultipleSpeakersByMeetingIds, {
    meetingIds,
  });

  // console.log(speakers, meetingDetails, sentenceDetails);

  // You can now also use other data from searchResults, like score, if needed
  if (!sentenceDetails) return <div>Loading...</div>;

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
    <div>
      {searchInput && (
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 font-semibold">
            <Button
              variant="outline"
              className="py-2 px-4 rounded-full"
              onClick={onClearSearch}
            >
              {searchInput}
              <div className="ml-4 rounded-full p-0.5 bg-primary text-primary-foreground">
                <X size={12} />
              </div>
            </Button>
          </div>
          <div className="flex items-center">
            <label
              htmlFor="wordCountSwitch"
              className="flex items-center cursor-pointer"
            >
              <span className="mr-2 text-sm">Exclude short phrases</span>
              <Switch
                id="wordCountSwitch"
                checked={showHighWordCount}
                onCheckedChange={setShowHighWordCount}
              />
            </label>
          </div>
        </div>
      )}

      {sentenceDetails
        .filter((detail) =>
          showHighWordCount ? detail?.wordCount! > 25 : detail?.wordCount! <= 25
        )
        .map((detail, index) => {
          // Find the corresponding search result to get the score
          const correspondingSearchResult = searchResults.find(
            (result) => result.id === detail?._id
          );

          // Safely access score, providing a default value (e.g., 0) if it's undefined
          const score = correspondingSearchResult?.score ?? 0;

          // Format the score as a percentage
          const scorePercentage = (score * 100).toFixed(1) + "%";

          // Use the getBadgeColor function to determine the badge color
          const badgeColor = getBadgeColor(score);

          // Find the corresponding meeting detail to get the title
          const correspondingMeetingDetail = meetingDetails?.find(
            (meeting) => meeting?._id === detail?.meetingID
          );

          // Find the corresponding speaker to get the first name
          const correspondingSpeaker = speakers?.find(
            (speaker) =>
              speaker.meetingID === detail?.meetingID &&
              speaker.speakerNumber === detail?.speaker
          );

          const formattedDate = format(
            new Date(detail?._creationTime ?? 0),
            "PPP"
          );
          const formattedDateSmall = detail?._creationTime
            ? format(detail?._creationTime, "MM/dd/yy")
            : "Invalid date";
          const timeAgo =
            formatDistanceToNow(new Date(detail?._creationTime ?? 0)) + " ago";
          const startTime = format(new Date((detail?.start ?? 0) * 1000), "p"); // Assuming detail.start is a timestamp in seconds
          const endTime = format(new Date((detail?.end ?? 0) * 1000), "p"); // Assuming detail.end is a timestamp in seconds
          const formattedDuration = correspondingMeetingDetail
            ? new Date(correspondingMeetingDetail.duration * 1000)
                .toISOString()
                .substr(11, 8)
            : "Unknown duration";

          return (
            <div
              key={index}
              className="flex flex-col hover:bg-muted-foreground/10 rounded-lg" // Added hover:bg-gray-100 for hover effect and rounded-lg for rounded large
              onClick={() => detail && handleRowClick(detail.meetingID)} // Ensure detail is not null before accessing meetingID
            >
              <div className="flex flex-row space-x-4 p-4 md:space-x-8 lg:space-x-20">
                <div className="flex flex-col">
                  {/* {index === 0 && (
                <div className="font-bold mb-4 border-b">
                  <span>Score</span>
                </div>
              )} */}
                  <Badge className={badgeColor}>{scorePercentage}</Badge>
                </div>
                {/* Use the meeting title instead of the meeting ID */}
                <div className="flex flex-col space-x-2">
                  {/* {index === 0 && (
                <div className="font-bold mb-4">
                  <span>Meeting</span>
                </div>
              )} */}
                  <div className="space-y-2">
                    <span className="font-bold">
                      {correspondingMeetingDetail?.title}
                    </span>
                    <div className="flex flex-row items-center tracking-wide space-x-2">
                      <div className="flex flex-row items-center space-x-2 text-sm">
                        <CalendarIcon className="h-4 w-4 flex-shrink-0" />
                        <span className="md:hidden">{formattedDateSmall}</span>
                        <span className="hidden md:block">{formattedDate}</span>
                      </div>
                    </div>
                    <div className="flex flex-row items-center space-x-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>{startTime}</span>
                    </div>
                    <div className="flex flex-row items-center space-x-2 text-sm">
                      <Timer className="h-4 w-4" />

                      <span>{formattedDuration}</span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {timeAgo}
                    </div>
                  </div>
                </div>
                <div>
                  {/* {index === 0 && (
                <div className="font-bold mb-4">
                  <span>Quote</span>
                </div>
              )} */}
                  <div className="flex flax-col m-5">
                    <div className="flex flex-row">
                      <Avatar className="mr-4">
                        <AvatarImage src="" />
                        <AvatarFallback>
                          <User />
                        </AvatarFallback>
                      </Avatar>

                      <div className="relative flex flex-col border rounded-lg p-4 ">
                        <span className="font-bold mb-4">
                          {correspondingSpeaker?.firstName}{" "}
                          {correspondingSpeaker?.lastName}
                        </span>
                        <p className="">{detail?.transcript}</p>
                        <div className="absolute -top-6 right-2 text-sm text-muted-foreground">
                          {detail?.start.toFixed(2)} - {detail?.end.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Now we can directly use the score from the corresponding search result */}
              </div>
              <Separator className="" />
            </div>
          );
        })}
    </div>
  );
};
