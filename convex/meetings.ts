import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

export const createMeeting = mutation({
  args: {
    title: v.string(),
    // Additional arguments can be added here
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to create a meeting");
    }

    // Insert the new meeting and capture the returned ID
    const meetingId = await ctx.db.insert("meetings", {
      title: args.title,
      userId: user.subject,
      duration: 0,
      isFavorite: false,
      isDeleted: false,
      // Additional fields can be added here
    });

    // Return the meeting ID so it can be used by the client
    return { meetingId };
  },
});

export const getMeetingsForUser = query({
  args: {},
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to retrieve list of meetings");
    }

    return await ctx.db
      .query("meetings")
      .filter((q) => q.eq(q.field("userId"), user.subject))
      .order("desc")
      .collect();
  },
});

export const getMeetings = query({
  args: {},
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to retrieve list of meetings");
    }

    return await ctx.db.query("meetings").order("desc").collect();
  },
});

export const getMeetingByID = query({
  args: {
    meetingID: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to retrieve a meeting");
    }

    return await ctx.db
      .query("meetings")
      .filter((q) => q.eq(q.field("userId"), user.subject))
      .filter((q) => q.eq(q.field("_id"), args.meetingID)) // Add this line to filter by meetingID

      .collect();
  },
});

export const addSpeaker = mutation({
  args: {
    meetingID: v.id("meetings"),
    speakerNumber: v.number(),
    firstName: v.string(),
    lastName: v.string(),

    voiceAnalysisStatus: v.union(
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("pending"),
      v.literal("failed")
    ),
    predictedNames: v.optional(
      v.array(
        v.object({
          userSelected: v.boolean(),
          name: v.string(),
          score: v.float64(),
          speakerId: v.string(),
          embeddingId: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to create a speaker");
    }

    const newSpeaker = await ctx.db.insert("speakers", {
      meetingID: args.meetingID,
      speakerNumber: args.speakerNumber,
      firstName: args.firstName,
      lastName: args.lastName,
      voiceAnalysisStatus: args.voiceAnalysisStatus,
      predictedNames: args.predictedNames,
    });

    return newSpeaker;
  },
});

export const deleteSpeaker = mutation({
  args: { speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to delete a speaker");
    }

    await ctx.db.delete(args.speakerId);
  },
});

export const changeSpeakerDetailsByID = mutation({
  args: {
    speakerId: v.id("speakers"),
    speakerNumber: v.number(),
    firstName: v.string(),
    lastName: v.string(),
    voiceAnalysisStatus: v.union(
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("pending"),
      v.literal("failed")
    ),
    predictedNames: v.optional(
      v.array(
        v.object({
          userSelected: v.boolean(),
          name: v.string(),
          score: v.float64(),
          speakerId: v.string(),
          embeddingId: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to modify a speaker");
    }

    // Use db.patch to update the speaker details
    await ctx.db.patch(args.speakerId, {
      speakerNumber: args.speakerNumber,
      firstName: args.firstName,
      lastName: args.lastName,
      voiceAnalysisStatus: args.voiceAnalysisStatus,
      predictedNames: args.predictedNames,
    });
  },
});

export const getSpeakerDetailsById = query({
  args: {
    speakerId: v.id("speakers"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to retrieve a meeting");
    }

    return await ctx.db
      .query("speakers")
      // .filter((q) => q.eq(q.field("userId"), user.subject))  //put this in when we have the field added to the db
      .filter((q) => q.eq(q.field("_id"), args.speakerId)) // Add this line to filter by meetingID
      .collect();
  },
});

export const updateMeetingTitle = mutation({
  args: {
    meetingID: v.id("meetings"),
    newTitle: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to update the meeting");
    }

    // Use db.patch to update the meeting title
    await ctx.db.patch(args.meetingID, {
      title: args.newTitle,
    });
  },
});

export const getSpeakersByMeeting = query({
  args: { meetingID: v.id("meetings") },
  async handler({ db }, { meetingID }) {
    return await db
      .query("speakers")
      .filter((q) => q.eq(q.field("meetingID"), meetingID))
      .collect();
  },
});

export const fetchMultipleSpeakersByMeetingIds = query({
  args: { meetingIds: v.array(v.id("meetings")) },
  handler: async (ctx, { meetingIds }) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to retrieve speaker details");
    }

    // Initialize an empty array to hold all speakers from the specified meetings
    let speakers: any[] = [];

    // Iterate over each meetingId and fetch the corresponding speakers
    for (const meetingId of meetingIds) {
      const meetingSpeakers = await ctx.db
        .query("speakers")
        .filter((q) => q.eq(q.field("meetingID"), meetingId))
        .collect();

      // Concatenate the fetched speakers to the speakers array
      speakers = speakers.concat(meetingSpeakers);
    }

    // console.log("Fetched speakers:", speakers);

    return speakers;
  },
});

export const updateMeetingDetails = mutation({
  args: {
    meetingID: v.id("meetings"),
    updates: v.object({
      newTitle: v.optional(v.string()),
      duration: v.optional(v.float64()),
      isFavorite: v.optional(v.boolean()),
      isDeleted: v.optional(v.boolean()),
      date: v.optional(v.string()), // Add this line to include a date field
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to update the meeting");
    }

    const updates: {
      title?: string;
      duration?: number;
      isFavorite?: boolean;
      isDeleted?: boolean;
    } = {};
    if (args.updates.newTitle !== undefined) {
      updates.title = args.updates.newTitle;
    }
    if (args.updates.duration !== undefined) {
      updates.duration = args.updates.duration;
    }
    if (args.updates.isFavorite !== undefined) {
      updates.isFavorite = args.updates.isFavorite;
    }
    if (args.updates.isDeleted !== undefined) {
      updates.isDeleted = args.updates.isDeleted;
    }
    await ctx.db.patch(args.meetingID, updates);
  },
});

export const deleteMeetingAndRelatedRecords = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, { meetingId }) => {
    try {
      // Example for finalizedSentences, repeat for other related collections
      const collections = [
        "finalizedSentences",
        "messages",
        "speakers",
        "meetingSummaries",
        "wordDetails",
        "questions",
        "audioFiles",
        "meetingAudio",
        "sentenceEmbeddings",
        "audioEmbeddings",
      ];

      for (const collection of collections) {
        try {
          const records = await ctx.db
            .query(collection as any)
            .filter((q) => q.eq(q.field("meetingID"), meetingId))
            .collect();

          for (const record of records) {
            if (collection === "audioFiles" || collection === "meetingAudio") {
              // Special handling for audioFiles and meetingAudio to delete from storage
              try {
                await ctx.storage.delete(record.storageId);
              } catch (error) {
                console.error(
                  `Error deleting storage for ${record._id} in collection ${collection}:`,
                  error
                );
              }
            }
            await ctx.db.delete(record._id);
          }
        } catch (error) {
          console.error(`Error processing collection ${collection}:`, error);
        }
      }

      // Finally, delete the meeting itself
      try {
        await ctx.db.delete(meetingId);
      } catch (error) {
        console.error(`Error deleting meeting ${meetingId}:`, error);
      }
    } catch (error) {
      console.error(
        "Unexpected error in deleteMeetingAndRelatedRecords:",
        error
      );
    }
  },
});

export const fetchMultipleMeetingDetails = query({
  args: { meetingIds: v.array(v.id("meetings")) },
  handler: async (ctx, { meetingIds }) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error(
        "Please login to retrieve finalized sentences for a meeting"
      );
    }

    const meetings = await Promise.all(
      meetingIds.map(async (id) => await ctx.db.get(id))
    );

    // console.log("Fetched meetings:", meetings);

    return meetings.filter((meeting) => meeting !== null);
  },
});
