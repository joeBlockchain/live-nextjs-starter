//import nextjs stuff
import { NextRequest, NextResponse } from "next/server";

//import clerk stuff
import { currentUser, auth } from "@clerk/nextjs";

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Please create an account to access this page", {
        status: 401,
      });
    }

    const user = await currentUser();
    const isPowerUser = user?.publicMetadata?.isPowerUser;

    if (!isPowerUser) {
      return new NextResponse(
        "Please reach out to your admin for additional entitlements as a power user",
        { status: 401 }
      );
    }

    const response = await fetch("https://api.clerk.dev/v1/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      // Include any query parameters you need
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const users = await response.json();
    return new NextResponse(JSON.stringify(users), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error(error);
    return new NextResponse(
      JSON.stringify({ error: "Failed to fetch users from Clerk" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
