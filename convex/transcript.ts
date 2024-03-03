import { v } from "convex/values";
import {
  query,
  action,
  internalMutation,
  mutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

interface EmbeddingDetail {
  meetingID: string;
  finalizedSentenceId: string;
}

interface Speaker {
  _creationTime: number;
  _id: string;
  firstName: string;
  lastName: string;
  meetingID: string;
  predictedNames?: PredictedName[];
  speakerNumber: number;
  voiceAnalysisStatus?: "analyzing" | "completed" | "pending" | "failed";
}

interface PredictedName {
  userSelected: boolean;
  name: string;
  score: number;
  speakerId?: string;
  embeddingId?: string;
}

interface AudioEmbeddingDetail {
  meetingID: string;
  score: number;
  speaker: Speaker[];
  speakerId: string;
  speakerNumber: number;
  embeddingId: string;
}

export const storeFinalizedSentence = mutation({
  args: {
    meetingID: v.id("meetings"),
    speaker: v.number(),
    speakerId: v.id("speakers"),
    transcript: v.string(),
    start: v.float64(),
    end: v.float64(),
  },
  async handler(
    { db, auth },
    { meetingID, speaker, speakerId, transcript, start, end }
  ) {
    const user = await auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Count the words in the transcript
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    const finalizedSentenceId = await db.insert("finalizedSentences", {
      meetingID,
      userId: user.subject,
      speaker,
      speakerId,
      transcript,
      start,
      end,
      wordCount,
    });
    // Schedule the action to generate and add embedding
    return finalizedSentenceId;
  },
});

export const generateAndSaveEmbedding = action({
  args: {
    finalizedSentenceId: v.id("finalizedSentences"),
    transcript: v.string(),
    meetingID: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    // Generate embedding
    const embedding = await generateTextEmbedding(args.transcript);
    // Store the embedding
    const embeddingId = await ctx.runMutation(
      internal.transcript.addEmbedding,
      {
        finalizedSentenceId: args.finalizedSentenceId,
        embedding: embedding,
        meetingID: args.meetingID,
      }
    );

    // Update the sentence with the embedding ID
    if (embeddingId === null) {
      // Handle the null case: log, throw an error, or take other appropriate action
      console.error("Failed to generate or save embedding.");
      throw new Error("Failed to generate or save embedding.");
    } else {
      // Proceed with using the embeddingId, now guaranteed to be non-null
      await ctx.runMutation(api.transcript.updateSentenceWithEmbedding, {
        finalizedSentenceId: args.finalizedSentenceId,
        embeddingId: embeddingId, // This is now guaranteed to be non-null
      });
    }

    return embedding;
  },
});

export const generateTextEmbedding = async (
  text: string
): Promise<number[]> => {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) {
    throw new Error("RUNPOD_API_KEY environment variable not set!");
  }
  const requestBody = {
    input: {
      sentence: text,
    },
  };

  const response = await fetch(`${process.env.RUNPOD_RUNSYNC_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`RunPod API error: ${msg}`);
  }

  const data = await response.json();
  // Adjusted to correctly access the embeddings array within the output object
  const embedding = data.output.embeddings;
  if (!Array.isArray(embedding) || embedding.some(isNaN)) {
    console.error("Invalid embedding format:", embedding);
    throw new Error(
      "Failed to generate a valid text embedding due to invalid format."
    );
  }

  // console.log(
  //   `Computed embedding of "${text}": ${embedding.length} dimensions`
  // );
  return embedding;
};

export const addEmbedding = internalMutation({
  args: {
    finalizedSentenceId: v.id("finalizedSentences"),
    embedding: v.array(v.float64()),
    meetingID: v.id("meetings"),
  },
  handler: async ({ db }, { finalizedSentenceId, embedding, meetingID }) => {
    const embeddingId = await db.insert("sentenceEmbeddings", {
      meetingID, // This needs to be included
      finalizedSentenceId,
      embedding,
    });
    return embeddingId;
  },
});

export const updateSentenceWithEmbedding = mutation({
  args: {
    finalizedSentenceId: v.id("finalizedSentences"),
    embeddingId: v.id("sentenceEmbeddings"), // This matches the corrected field name
  },
  handler: async ({ db }, { finalizedSentenceId, embeddingId }) => {
    await db.patch(finalizedSentenceId, {
      sentenceEmbeddingId: embeddingId, // Ensure this matches the field in your schema
    });
  },
});

//@ts-ignore
export const searchSentencesByEmbedding = action({
  args: {
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to create an embedding.");
    }

    const currentUserID = user.subject;

    // Generate an embedding from the search query
    const embedding = await generateTextEmbedding(args.searchQuery);

    // Perform a vector search with the generated embedding
    const results = await ctx.vectorSearch(
      "sentenceEmbeddings",
      "embeddingVector",
      {
        vector: embedding,
        limit: 10,
        filter: (q) => q.eq("userId", currentUserID),
      }
    );

    // Fetch additional details for each result using the internal query
    const resultsWithDetails: (EmbeddingDetail & { score: number })[] =
      await Promise.all(
        results.map(async (result) => {
          const details = await ctx.runQuery(
            internal.transcript.fetchEmbeddingDetails,
            {
              embeddingId: result._id,
            }
          );
          // Merge the score from the search result with the fetched details
          return { ...details, score: result._score };
        })
      );
    return resultsWithDetails;
  },
});

export const fetchEmbeddingDetails = internalQuery({
  args: { embeddingId: v.id("sentenceEmbeddings") },
  handler: async (ctx, { embeddingId }) => {
    const embeddingDetails = await ctx.db.get(embeddingId);
    if (!embeddingDetails) {
      throw new Error("Embedding details not found");
    }
    return {
      meetingID: embeddingDetails.meetingID,
      finalizedSentenceId: embeddingDetails.finalizedSentenceId,
    };
  },
});

export const fetchFinalizedSentences = internalQuery({
  args: { ids: v.array(v.id("finalizedSentences")) },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc === null) {
        continue;
      }
      results.push(doc);
    }
    return results;
  },
});

export const fetchMultipleFinalizedSentenceDetails = query({
  args: { sentenceIds: v.array(v.id("finalizedSentences")) },
  handler: async (ctx, { sentenceIds }) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error(
        "Please login to retrieve finalized sentences for a meeting"
      );
    }

    const sentences = await Promise.all(
      sentenceIds.map(async (id) => await ctx.db.get(id))
    );

    // console.log("Fetched sentences:", sentences);

    return sentences.filter((sentence) => sentence !== null);
  },
});

export const getFinalizedSentencesByMeeting = query({
  args: { meetingID: v.id("meetings") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error(
        "Please login to retrieve finalized sentences for a meeting"
      );
    }

    return await ctx.db
      .query("finalizedSentences")
      .filter((q) => q.eq(q.field("meetingID"), args.meetingID))
      .collect();
  },
});

export const getFinalizedSentencesByMeetingPagination = query({
  args: {
    meetingID: v.id("meetings"),
    paginationOpts: paginationOptsValidator, // pagination options
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error(
        "Please login to retrieve finalized sentences for a meeting"
      );
    }

    const result = await ctx.db
      .query("finalizedSentences")
      .filter((q) => q.eq(q.field("meetingID"), args.meetingID))
      .paginate(args.paginationOpts); // paginated query

    return result;
  },
});

// export const deleteFinalizedSentence = mutation({
//   args: {
//     sentenceId: v.id("finalizedSentences"), // Assuming "finalizedSentences" is the collection name
//   },
//   async handler({ db, auth }, { sentenceId }) {
//     const user = await auth.getUserIdentity();
//     if (!user) {
//       throw new Error("User not authenticated");
//     }
//     await db.delete(sentenceId); // Delete the sentence by its ID
//   },
// });

export const deleteFinalizedSentence = mutation({
  args: {
    sentenceId: v.id("finalizedSentences"),
  },
  async handler({ db, auth }, { sentenceId }) {
    const user = await auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Get the sentence before deletion to have access to its speakerId & meetingID
    const sentence = await db.get(sentenceId);

    const sentencesLeft = await db
      .query("finalizedSentences")
      .filter(
        (q) =>
          q.eq(q.field("speakerId"), sentence?.speakerId) &&
          q.eq(q.field("meetingID"), sentence?.meetingID)
      )
      .collect();

    //delete speaker if only 1 sentence left because after we delete this
    //sentence there will be 0 left
    if (sentencesLeft.length === 1) {
      await db.delete(sentence?.speakerId as Id<"speakers">);
    }

    // Delete the sentence
    await db.delete(sentenceId);
  },
});

export const storeQuestion = mutation({
  args: {
    meetingID: v.id("meetings"),
    question: v.string(),
    timestamp: v.float64(),
    speaker: v.number(),
  },
  async handler({ db, auth }, { meetingID, question, timestamp, speaker }) {
    const user = await auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }
    await db.insert("questions", {
      meetingID,
      question,
      timestamp,
      speaker,
    });
  },
});

export const storeWordDetail = mutation({
  args: {
    meetingID: v.id("meetings"),
    word: v.string(),
    start: v.float64(),
    end: v.float64(),
    confidence: v.float64(),
    speaker: v.number(),
    punctuated_word: v.string(),
    audio_embedding: v.optional(v.array(v.float64())),
  },
  async handler(
    { db, auth },
    {
      meetingID,
      word,
      start,
      end,
      confidence,
      speaker,
      punctuated_word,
      audio_embedding,
    }
  ) {
    const user = await auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }
    // await db.insert("wordDetails", {
    //   meetingID,
    //   word,
    //   start,
    //   end,
    //   confidence,
    //   speaker,
    //   punctuated_word,
    //   audio_embedding,
    // });
  },
});

export const generateAudioUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const sendAudio = mutation({
  args: {
    storageId: v.id("_storage"), // The ID of the uploaded file in Convex storage
    meetingID: v.id("meetings"), // Assuming you want to associate the audio with a meeting
  },
  handler: async ({ db, auth }, args) => {
    const user = await auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }
    const url = await db.insert("audioFiles", {
      storageId: args.storageId,
      meetingID: args.meetingID,
      userId: user.subject,
    });
  },
});

export const generateAudioFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

//Need to update this to sepnd predicted speakers to speakers table right now client does it on name change
export const getNearestMatchingSpeakers = action({
  args: {
    storageId: v.id("_storage"),
    meetingId: v.id("meetings"),
    speakerNumber: v.number(),
  },
  handler: async (ctx, args) => {
    let speakerId;
    try {
      const user = await ctx.auth.getUserIdentity();

      if (!user) {
        throw new Error("User not authenticated");
      }

      const currentUserID = user.subject;

      try {
        speakerId = await ctx.runQuery(
          internal.transcript.lookupSpeakerIdBySpeakerNumber,
          {
            meetingId: args.meetingId,
            speakerNumber: args.speakerNumber,
          }
        );
      } catch (error) {
        console.error("Error looking up speaker ID:", error);
        throw new Error("Failed to look up speaker ID.");
      }

      //retrieve the audio file from the storage
      let audioUrl;
      try {
        audioUrl = (await ctx.storage.getUrl(args.storageId)) as string;
      } catch (error) {
        console.error("Error retrieving audio URL:", error);
        throw new Error("Failed to retrieve audio URL.");
      }
      // post to runpod to get embedding
      let runpodResponse;
      try {
        runpodResponse = await postAudioToRunpod(audioUrl);
      } catch (error) {
        console.error("Error posting audio to Runpod:", error);
        throw new Error("Failed to post audio to Runpod.");
      }

      // Perform a vector search with the generated embedding
      let results;
      try {
        results = await ctx.vectorSearch("audioEmbeddings", "embeddingVector", {
          vector: runpodResponse.output.embedding,
          limit: 20,
          filter: (q) => q.eq("userId", currentUserID),
        });
      } catch (error) {
        console.error("Error performing vector search:", error);
        throw new Error("Failed to perform vector search.");
      }

      // Fetch additional details for each result using the internal query
      //trying to get the ability to select a predicted speaker by the user,
      //does not work
      const resultsWithDetails: (AudioEmbeddingDetail & { score: number })[] =
        await Promise.all(
          results.map(async (result) => {
            const details = await ctx.runQuery(
              internal.transcript.fetchAudioEmbeddingDetails,
              {
                embeddingId: result._id,
              }
            );
            // Fetch speaker detail here
            const speaker = await ctx.runQuery(
              api.meetings.getSpeakerDetailsById,

              { speakerId: details.speakerId as Id<"speakers"> }
            );

            // Ensure userSelected is always a boolean
            const speakerWithFixedPredictedNames = speaker.map((s) => ({
              ...s,
              predictedNames:
                s.predictedNames?.map((pn) => ({
                  ...pn,
                  userSelected: pn.userSelected ?? false, // Default to false if undefined
                })) ?? [],
            }));

            // Merge the score from the search result with the fetched details
            return {
              ...details,
              score: result._score,
              speaker: speakerWithFixedPredictedNames,
            };
          })
        );

      let allPredictedMatches: PredictedName[] = [];

      // Loop through resultsWithDetails to collect all predicted matches
      for (const detail of resultsWithDetails) {
        const matches = detail.speaker.map((speakerDetail) => ({
          userSelected: false, // Assuming you want to default to false
          name: speakerDetail.firstName, // Assuming you want to use firstName as the name
          score: detail.score,
          speakerId: speakerDetail._id, // This seems redundant since you're already updating this speaker, but included for completeness
          embeddingId: detail.embeddingId,
        }));

        // Add the matches from this iteration to the allPredictedMatches array
        allPredictedMatches = allPredictedMatches.concat(matches);
      }

      // Now, outside the loop, update the database with all collected predicted matches
      await ctx.runMutation(internal.transcript.updatePredictedMatches, {
        speakerId: speakerId!, // Ensure speakerId is defined and valid
        predictedMatches: allPredictedMatches as PredictedName[],
        voiceAnalysisStatus: "completed", // Assuming you want to update the status to "completed"
      });

      return resultsWithDetails;
      // return results;
    } catch (error) {
      console.error("Failed to getNearestMatchingSpeakers:", error);
      console.error("args", args);
      // If the process fails, update the status to "failed"
      if (speakerId) {
        await ctx.runMutation(internal.transcript.updatePredictedMatches, {
          speakerId: speakerId,
          predictedMatches: [], // Assuming no matches to update if the process failed
          voiceAnalysisStatus: "failed",
        });
      }
    }
  },
});

//this is only needed because we dont have speakerid in finalizedsentnces in the client as they are created
export const lookupSpeakerIdBySpeakerNumber = internalQuery({
  args: {
    meetingId: v.id("meetings"),
    speakerNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const speakerDoc = await ctx.db
      .query("speakers")
      .withIndex("by_meetingID", (q) => q.eq("meetingID", args.meetingId))
      .filter((q) => q.eq(q.field("speakerNumber"), args.speakerNumber))
      .unique();
    if (speakerDoc === null) {
      return null;
    }
    return speakerDoc._id;
  },
});

//update speaker table with predicted names
export const updatePredictedMatches = internalMutation({
  args: {
    speakerId: v.id("speakers"),
    predictedMatches: v.optional(
      v.array(
        v.object({
          userSelected: v.boolean(),
          name: v.string(),
          score: v.float64(),
          speakerId: v.optional(v.string()),
          embeddingId: v.optional(v.string()),
        })
      )
    ),
    voiceAnalysisStatus: v.union(
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("pending"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const { speakerId, predictedMatches } = args;
    // Use patch method to update existing document
    await ctx.db.patch(speakerId, {
      predictedNames: predictedMatches,
      voiceAnalysisStatus: args.voiceAnalysisStatus,
    });
  },
});

export const fetchAudioEmbeddingDetails = internalQuery({
  args: { embeddingId: v.id("audioEmbeddings") },
  handler: async (ctx, { embeddingId }) => {
    const embeddingDetails = await ctx.db.get(embeddingId);
    if (!embeddingDetails) {
      throw new Error("Embedding details not found");
    }
    return {
      meetingID: embeddingDetails.meetingID,
      speakerNumber: embeddingDetails.speakerNumber || -1, // provide a default value like 0
      speakerId: embeddingDetails.speakerId || "",
      embeddingId: embeddingDetails._id,
    };
  },
});

export const processAudioEmbedding = action({
  args: {
    storageId: v.id("_storage"), // The ID of the uploaded file in Convex storage
    meetingID: v.id("meetings"),
    speakerNumber: v.number(),
    speakerId: v.id("speakers"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }
    try {
      //retrieve the audio file from the storage
      const audioUrl = (await ctx.storage.getUrl(args.storageId)) as string;
      // post to runpod to get embedding
      const runpodResponse = await postAudioToRunpod(audioUrl);
      // store the embedding in the convex database
      const embeddingId = await ctx.runMutation(
        internal.transcript.addAudioEmbedding,
        {
          meetingID: args.meetingID,
          speakerNumber: args.speakerNumber,
          speakerId: args.speakerId,
          delayTime: runpodResponse.delayTime,
          executionTime: runpodResponse.executionTime,
          runPodId: runpodResponse.id,
          storageId: args.storageId,
          audioEmbedding: runpodResponse.output.embedding,
          userId: user.subject,
        }
      );

      // console.log("Runpod response data:", runpodResponse);
    } catch (error) {
      console.error("Failed to processAudioEmbedding:", error);
    }
  },
});

export const addAudioEmbedding = internalMutation({
  args: {
    meetingID: v.id("meetings"),
    speakerNumber: v.number(),
    speakerId: v.id("speakers"),
    delayTime: v.float64(),
    executionTime: v.float64(),
    runPodId: v.string(),
    storageId: v.id("_storage"),
    audioEmbedding: v.array(v.float64()),
    userId: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const embeddingId = await db.insert("audioEmbeddings", {
      meetingID: args.meetingID,
      speakerNumber: args.speakerNumber,
      speakerId: args.speakerId,
      storageId: args.storageId,
      audioEmbedding: args.audioEmbedding,
      delayTime: args.delayTime,
      executionTime: args.executionTime,
      runPodId: args.runPodId,
      userId: args.userId,
    });
    return embeddingId;
  },
});

async function uploadAudioSegment(blob: Blob, ctx: any): Promise<string> {
  // Use Convex's storage API to store the blob
  const storageId = await ctx.storage.store(blob);
  // Return the URL of the stored blob
  return await ctx.storage.getUrl(storageId);
}

async function postAudioToRunpod(audioUrl: string): Promise<any> {
  const requestBody = {
    input: {
      audio_file: audioUrl,
    },
  };

  const response = await fetch(`${process.env.RUNPOD_RUNSYNC_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`RunPod API responded with status: ${response.status}`);
  }

  return await response.json();
}
