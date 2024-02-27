import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  finalizedSentences: defineTable({
    end: v.float64(),
    userId: v.optional(v.string()),
    meetingID: v.id("meetings"),
    speaker: v.number(),
    start: v.float64(),
    transcript: v.string(),
    sentenceEmbeddingId: v.optional(v.id("sentenceEmbeddings")),
    wordCount: v.optional(v.number()),
  }).index("by_meetingID", ["meetingID"]),
  meetings: defineTable({
    title: v.string(),
    userId: v.string(),
    duration: v.float64(),
    isFavorite: v.boolean(),
    isDeleted: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_isFavorite", ["userId", "isFavorite"]),

  messages: defineTable({
    aiModel: v.string(),
    aiResponse: v.string(),
    completionTokens: v.float64(),
    meetingID: v.id("meetings"),
    promptTokens: v.float64(),
    userId: v.string(),
    userMessage: v.string(),
  })
    .index("by_meetingID", ["meetingID"])
    .index("by_userId_meetingID", ["userId", "meetingID"]),
  speakers: defineTable({
    meetingID: v.id("meetings"),
    speakerNumber: v.number(),
    firstName: v.string(),
    lastName: v.string(),
    predictedNames: v.optional(
      v.array(
        v.object({
          name: v.string(),
          score: v.float64(),
          speakerId: v.optional(v.string()),
          embeddingId: v.optional(v.string()),
        })
      )
    ),
  }).index("by_meetingID", ["meetingID"]),
  meetingSummaries: defineTable({
    aiModel: v.string(),
    userId: v.string(),
    meetingID: v.id("meetings"),
    aiSummary: v.string(),
    completionTokens: v.float64(),
    promptTokens: v.float64(),
  })
    .index("by_meetingID", ["meetingID"])
    .index("by_userId_meetingID", ["userId", "meetingID"]),
  questions: defineTable({
    question: v.string(),
    timestamp: v.float64(),
    speaker: v.number(),
    meetingID: v.id("meetings"),
  }).index("by_meetingID", ["meetingID"]),
  wordDetails: defineTable({
    meetingID: v.id("meetings"),
    word: v.string(),
    start: v.float64(),
    end: v.float64(),
    confidence: v.float64(),
    speaker: v.number(),
    punctuated_word: v.string(),
    audio_embedding: v.optional(v.array(v.float64())),
  }).index("by_meetingID", ["meetingID"]),
  audioFiles: defineTable({
    storageId: v.id("_storage"),
    meetingID: v.id("meetings"),
    userId: v.string(),
  }).index("by_meetingID", ["meetingID"]),
  sentenceEmbeddings: defineTable({
    meetingID: v.id("meetings"),
    finalizedSentenceId: v.id("finalizedSentences"),
    userId: v.optional(v.string()),
    embedding: v.array(v.float64()),
  }).vectorIndex("embeddingVector", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["finalizedSentenceId", "meetingID", "userId"],
  }),
  userSettings: defineTable({
    language: v.string(),
  }),
  audioEmbeddings: defineTable({
    meetingID: v.id("meetings"),
    speakerNumber: v.optional(v.number()),
    speakerId: v.optional(v.id("speakers")),
    // finalizedSentenceId: v.id("finalizedSentences"),
    userId: v.optional(v.string()),
    audioEmbedding: v.array(v.float64()),
    storageId: v.id("_storage"),
    delayTime: v.float64(),
    executionTime: v.float64(),
    runPodId: v.string(),
  }).vectorIndex("embeddingVector", {
    vectorField: "audioEmbedding",
    dimensions: 512,
    filterFields: ["meetingID", "userId", "speakerId"], // finalizedSentenceId
  }),
});
