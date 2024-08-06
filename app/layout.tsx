import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

//import next stuff
import Link from "next/link";

//import clerk stuff
import {
  SignInButton,
  UserButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  useUser,
} from "@clerk/nextjs";
import { ReactNode } from "react";

//import shadcnui stuff
import { Toaster } from "@/components/ui/sonner";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

//import icons

//import custom stuff
import { Providers } from "@/components/providers";
//import logrocket stuff
import LogRocketInit from "@/components/LogRocketInit"; // Adjust the import path as necessary

export const metadata: Metadata = {
  title: "MeetingNotes-AI",
  description:
    "Revolutionary AI-powered meeting management application for enhanced productivity and decision-making",
  keywords: [
    "AI",
    "meeting management",
    "productivity",
    "transcription",
    "speaker diarization",
    "sentiment analysis",
    "meeting assistant",
    "automated summaries",
    "business intelligence",
  ],
  authors: [{ name: "MeetingNotes-AI Team" }],
  creator: "MeetingNotes-AI",
  publisher: "MeetingNotes-AI Inc.",
  openGraph: {
    title: "MeetingNotes-AI: Transform Your Meetings with AI",
    description:
      "Harness the power of AI for real-time transcription, sentiment analysis, and automated summaries",
    url: "https://MeetingNotes-AI.com",
    siteName: "MeetingNotes-AI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MeetingNotes-AI: Revolutionize Your Meeting Management",
    description:
      "AI-driven insights, real-time transcription, and intelligent summaries for more productive meetings",
    creator: "@MeetingMindAI",
  },
  viewport: "width=device-width, initial-scale=1",
  robots: "index, follow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AI Note Taker</title>
      </head>
      <body className={inter.className}>
        <LogRocketInit />
        <Providers>
          <div className="h-screen w-screen max-w-7xl mx-auto">
            <div className="sticky top-0 z-50 border-b border-border/40 backdrop-blur">
              <nav className="flex justify-between items-center h-16 mx-4 ">
                <Link
                  href="/"
                  className="flex flex-row items-center ml-4 font-semibold text-base sm:text-lg"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-captions"
                  >
                    <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
                    <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
                  </svg>
                  <span className="hidden md:block ml-3 text-xl font-bold">
                    MeetingNotes-AI
                  </span>
                </Link>

                <div className="flex items-center space-x-4">
                  <SignedIn>
                    <UserButton afterSignOutUrl="/" />
                  </SignedIn>
                  <SignedOut>
                    <div className="flex items-center space-x-4">
                      <Button variant="link">
                        <SignInButton afterSignInUrl="/" />
                      </Button>
                      <Button variant="default">
                        <SignUpButton afterSignUpUrl="/" />
                      </Button>
                    </div>
                  </SignedOut>
                  <ModeToggle />
                </div>
              </nav>
            </div>
            {children}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
