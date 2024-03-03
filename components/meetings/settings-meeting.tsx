"use client";

// import react stuff
import { useState } from "react"; // Import useState

// import nextjs stuff

// import convex stuff for db

// import additional librarys

// import shadcnui stuff
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

//import icone stuff
import { MoreHorizontal } from "lucide-react";

//import custom stuff

interface MeetingSettingsProps {
  continuousSpeakerPredictionEnabled: boolean;
  setContinuousSpeakerPredictionEnabled: (value: boolean) => void;
}

export default function MeetingSettings({
  continuousSpeakerPredictionEnabled,
  setContinuousSpeakerPredictionEnabled,
}: MeetingSettingsProps) {
  const handleToggleChanged = (value: boolean) => {
    console.log("toggle changed", value);
  };

  return (
    <div className="relative flex flex-col">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="">
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="">
          <div className="grid gap-4">
            <div className="flex items-center justify-between space-x-4">
              <Label
                htmlFor="necessary"
                className="flex flex-col space-y-1 leading-normal"
              >
                <span>Continuous Speaker Prediction</span>
                <span className="text-xs font-normal leading-normal text-muted-foreground">
                  Enable to request updated speaker prediction after each
                  speaker change.
                </span>
              </Label>
              <Switch
                id="continuousSpeakerPrediction"
                defaultChecked={continuousSpeakerPredictionEnabled}
                onCheckedChange={setContinuousSpeakerPredictionEnabled}
                aria-label="Continuous Speaker Prediction"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
