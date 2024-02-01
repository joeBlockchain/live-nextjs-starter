import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

import {
  ClerkProvider,
  SignInButton,
  SignOutButton,
  UserButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

import ConvexClientProvider from "@/components/convex-client-provider";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "AI Notetaker",
  description:
    "Generate notes using the latest in AI technology. Powered by Deepgram and OpenAI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Live transcription by Deepgram in Next.js</title>
      </head>
      <body className={inter.className}>
        <Providers>
          <div className="h-screen w-screen max-w-7xl mx-auto">
            <nav className="flex justify-between items-center h-16 shadow-md">
              <span className="text-xl font-bold">MeetingNotes-AI</span>
              <div className="flex items-center space-x-4">
                <SignedIn>
                  <UserButton afterSignOutUrl="/" />
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
                <ModeToggle />
              </div>
            </nav>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
