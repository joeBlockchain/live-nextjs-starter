"use client";

//import convex stuff
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

//import next stuff
import Image from "next/image";
import Link from "next/link";

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
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";

//import icons
import { CalendarCheck2, ArrowRight, LayoutDashboard } from "lucide-react";

export default function Home() {
  const { user } = useUser();
  const isPowerUser = user?.publicMetadata?.isPowerUser === "true";

  return (
    <main className="flex flex-col h-full w-full">
      <div className="relative max-w-5xl mx-auto pt-20 sm:pt-24 lg:pt-32">
        <div className="flex justify-center">
          <Image
            src="/powered-by-openai-badge-outlined-on-light.svg"
            alt="Powered by OpenAI"
            width={166}
            height={32}
            className="dark:hidden"
          />
          <Image
            src="/powered-by-openai-badge-outlined-on-dark.svg"
            alt="Powered by OpenAI"
            width={166}
            height={32}
            className="hidden dark:block"
          />
          {/* <Image
            src="/deepgram-logo.svg"
            alt="Powered by Deepgram"
            width={84.5}
            height={19.5}
            className="border border-foreground rounded-md p-2 ml-4"
          /> */}
        </div>
        <div className="flex flex-col justify-center items-center">
          <h1 className="mt-8 font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight text-center">
            Anyone taking notes?
          </h1>
          <p className="mt-6 text-lg text-center max-w-3xl">
            Hi, I am just your friendly{" "}
            <code className="font-mono font-medium text-blue-500 dark:text-blue-400">
              Speech to Text, Audio Embedding, Diarization, Generative AI{" "}
            </code>
            note taking application here to help with your next meeting!
          </p>
        </div>
        <div className="mt-10 flex justify-center">
          <SignedIn>
            <Link href="/mymeetings">
              <Button className="mr-3 pr-6">
                <CalendarCheck2 className="mr-3" />
                Previous Meetings
              </Button>
            </Link>
            {isPowerUser && (
              <Link href="/dashboard">
                <Button variant="outline" className="">
                  <LayoutDashboard className="mr-3" /> Dashboard
                </Button>
              </Link>
            )}
          </SignedIn>
          <SignedOut>
            <div className="flex items-center space-x-4">
              <Button variant="link">
                <SignInButton afterSignInUrl="/mymeetings" />
              </Button>
              <Button variant="default">
                <SignUpButton afterSignUpUrl="/mymeetings" />
              </Button>
            </div>
          </SignedOut>
        </div>
        <div className="my-40 p-2 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-border w-7xl mx-auto">
          <Image
            src="/Light-1.png"
            alt="Screenshot of SaaS Application"
            width={2546}
            height={1796}
            layout="responsive"
            className="rounded-xl border border-border shadow-2xl dark:hidden"
          />
          <Image
            src="/Dark-1.png"
            alt="Screenshot of SaaS Application"
            width={2536}
            height={1794}
            layout="responsive"
            className="rounded-xl border border-border shadow-2xl hidden dark:block"
          />
          {/* Additional content */}
        </div>
      </div>
    </main>
  );
}
