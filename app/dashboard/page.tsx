"use client";

// import react stuff
import { useEffect, useState } from "react";

//import next stuff
import { NextPage } from "next";

//import convex stuff
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

//import clerk stuff
import {
  ClerkProvider,
  SignInButton,
  SignOutButton,
  UserButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  useUser,
} from "@clerk/nextjs";

//import shadcnui stuff
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

//import icon stuff
import {
  Users,
  Calendar,
  Text,
  File,
  MessageSquare,
  FileDigit,
  CircleUserRound,
  HelpCircle,
} from "lucide-react";

//import types
import type { Meeting, ClerkUser } from "@/lib/types";

//import custom stuff
import { MeetingsDataTable } from "@/app/dashboard/meetings-data-table";
import { UsersDataTable } from "@/app/dashboard/users-data-table";

const DashboardPage: NextPage = () => {
  const { user } = useUser();
  const isPowerUser = user?.publicMetadata?.isPowerUser === "true";

  const meetings = useQuery(api.meetings.getMeetings);

  const totalMeetings = useQuery(api.dashboard.totalMeetings);
  const totalSentences = useQuery(api.dashboard.totalFinalizedSentences);
  const totalSummaries = useQuery(api.dashboard.totalMeetingSummaries);
  const totalChats = useQuery(api.dashboard.totalMessages);
  const totalTranscriptEmbeddings = useQuery(
    api.dashboard.totalSentenceEmbeddings
  );
  const totalSpeakers = useQuery(api.dashboard.totalSpeakers);
  const totalQuestions = useQuery(api.dashboard.totalQuestions);

  const [users, setUsers] = useState<ClerkUser[]>([]);

  const addUserIdToEmbeddings = useAction(
    api.cleanUpFunctions.addUserIdToSentenceEmbeddings
  );

  const handleClick = async () => {
    try {
      const response = await addUserIdToEmbeddings();
      console.log(response); // log updated embeddings for debugging
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const fetchUsers = async () => {
      const response = await fetch("/api/users");
      if (!response.ok) {
        console.error("Failed to fetch users");
        return;
      }
      const data = await response.json();
      console.log(data);
      setUsers(data); // Assuming the API returns an array of users
    };

    fetchUsers();
  }, []);

  if (!isPowerUser) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold">
          You are not entitled to view this page.
        </h1>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <Button onClick={handleClick}>Add Userids to Sentence Embeddings</Button>
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">All users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meetings</CardTitle>
            <Calendar />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMeetings}</div>
            <p className="text-xs text-muted-foreground">
              Meetings across users
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sentences</CardTitle>
            <Text />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSentences}</div>
            <p className="text-xs text-muted-foreground">
              Total sentences in transcripts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Summaries</CardTitle>
            <File />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSummaries}</div>
            <p className="text-xs text-muted-foreground">
              Total meeting summaries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chats</CardTitle>
            <MessageSquare />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChats}</div>
            <p className="text-xs text-muted-foreground">Total chat messages</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Transcript Embeddings
            </CardTitle>
            <FileDigit />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTranscriptEmbeddings}
            </div>
            <p className="text-xs text-muted-foreground">
              Total transcript embeddings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speakers</CardTitle>
            <CircleUserRound />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSpeakers}</div>
            <p className="text-xs text-muted-foreground">
              Total speakers detected in meetings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Questions</CardTitle>
            <HelpCircle />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuestions}</div>
            <p className="text-xs text-muted-foreground">
              Total questions detected in meetings
            </p>
          </CardContent>
        </Card>
      </div>
      {users && <UsersDataTable data={users} />}
      {meetings && <MeetingsDataTable data={meetings} />}
    </div>
  );
};

export default DashboardPage;
