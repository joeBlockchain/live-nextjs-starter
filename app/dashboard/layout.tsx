"use client";

import React, { ReactNode } from "react"; // Corrected import
import { useConvexAuth } from "convex/react"; // your auth hook

export default function RootLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <>
      {(() => {
        // If the user state is still loading, return a loading message.
        if (isLoading) {
          return <div>Loading...</div>;
        }

        // If the user is not logged in, show login button / redirect to login or show a message
        if (!isAuthenticated) {
          return <div>Please log in.</div>;
        }

        // If the user is logged in, render the provided children components
        return <div>{children}</div>;
      })()}
    </>
  );
}
