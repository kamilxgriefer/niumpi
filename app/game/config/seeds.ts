/**
 * Memory Seeds: light, never-sensitive either/or questions. Answers change
 * dialogue, decorations and small preferences — never a whole evolution.
 */
import type { VectorId } from "../types.ts";

export type SeedQuestion = {
  id: string;
  prompt: string;
  options: [SeedOption, SeedOption];
};

export type SeedOption = {
  label: string;
  art: string;
  /** Line Niumpi later repeats back on the discovery banner. */
  recall: string;
  vectors: Partial<Record<VectorId, number>>;
  /** Optional hidden trait signal this answer feeds. */
  signal?: string;
};

export const seedQuestions: SeedQuestion[] = [
  { id: "weather", prompt: "Which do you prefer?", options: [
    { label: "Rainy days", art: "rain", recall: "you love rainy days", vectors: { calm: 2, dream: 1 }, signal: "rain" },
    { label: "Sunny days", art: "sun", recall: "you love sunny days", vectors: { playful: 2, brave: 1 } }] },
  { id: "time", prompt: "Morning or night?", options: [
    { label: "Morning", art: "sun", recall: "mornings are yours", vectors: { brave: 2 } },
    { label: "Night", art: "moon", recall: "the night is yours", vectors: { dream: 2 }, signal: "night" }] },
  { id: "taste", prompt: "Sweet or sour?", options: [
    { label: "Sweet", art: "berry", recall: "you pick sweet every time", vectors: { loving: 2 } },
    { label: "Sour", art: "drop", recall: "you like a sharp taste", vectors: { curious: 2 } }] },
  { id: "evening", prompt: "How does a good evening end?", options: [
    { label: "Adventure", art: "path", recall: "you never want the day to end", vectors: { brave: 2, curious: 1 } },
    { label: "Cozy evening", art: "lamp", recall: "you love a quiet evening", vectors: { calm: 2 } }] },
  { id: "place", prompt: "Mountains or ocean?", options: [
    { label: "Mountains", art: "hill", recall: "you belong on a hill", vectors: { brave: 2, nature: 1 } },
    { label: "Ocean", art: "wave", recall: "you belong near water", vectors: { calm: 1, curious: 2 } }] },
  { id: "sound", prompt: "Music or silence?", options: [
    { label: "Music", art: "note", recall: "you keep music on", vectors: { creative: 2, social: 1 }, signal: "music" },
    { label: "Silence", art: "hush", recall: "you like it quiet", vectors: { calm: 3 }, signal: "calmVisit" }] },
  { id: "colour", prompt: "Purple or turquoise?", options: [
    { label: "Purple", art: "violet", recall: "purple is your colour", vectors: { dream: 2 } },
    { label: "Turquoise", art: "teal", recall: "turquoise is your colour", vectors: { curious: 2 } }] },
  { id: "story", prompt: "Books or movies?", options: [
    { label: "Books", art: "book", recall: "you read before sleeping", vectors: { dream: 1, creative: 2 } },
    { label: "Movies", art: "screen", recall: "you watch things together", vectors: { social: 2 } }] },
  { id: "season", prompt: "Snow or rain?", options: [
    { label: "Snow", art: "snow", recall: "snow makes you happy", vectors: { calm: 2, brave: 1 } },
    { label: "Rain", art: "rain", recall: "rain makes you happy", vectors: { calm: 2, dream: 1 }, signal: "rain" }] },
  { id: "sky", prompt: "Stars or clouds?", options: [
    { label: "Stars", art: "star", recall: "you count the stars", vectors: { dream: 3 }, signal: "stars" },
    { label: "Clouds", art: "cloud", recall: "you watch the clouds", vectors: { calm: 2, creative: 1 } }] },
  { id: "drink", prompt: "Tea or cocoa?", options: [
    { label: "Tea", art: "tea", recall: "tea is your answer to most things", vectors: { calm: 2 } },
    { label: "Cocoa", art: "cocoa", recall: "cocoa is your answer to most things", vectors: { loving: 2 } }] },
  { id: "pace", prompt: "Run ahead or wander slowly?", options: [
    { label: "Run ahead", art: "path", recall: "you always run ahead", vectors: { brave: 3 } },
    { label: "Wander", art: "leaf", recall: "you take the long way", vectors: { curious: 2, nature: 1 } }] },
  { id: "gift", prompt: "Give a gift or make one?", options: [
    { label: "Give", art: "gift", recall: "you give things away easily", vectors: { loving: 2, social: 1 } },
    { label: "Make", art: "craft", recall: "you'd rather make it yourself", vectors: { creative: 3 } }] },
  { id: "company", prompt: "A crowd or one friend?", options: [
    { label: "A crowd", art: "friends", recall: "you like a full room", vectors: { social: 3 }, signal: "social" },
    { label: "One friend", art: "heart", recall: "one good friend is enough", vectors: { loving: 3 } }] },
  { id: "room", prompt: "Tidy or full of things?", options: [
    { label: "Tidy", art: "tidy", recall: "you keep things tidy", vectors: { calm: 2 } },
    { label: "Full of things", art: "shelf", recall: "you collect everything", vectors: { creative: 2 }, signal: "items" }] },
  { id: "morningfood", prompt: "Big breakfast or slow start?", options: [
    { label: "Big breakfast", art: "bowl", recall: "you start the day hungry", vectors: { brave: 1, playful: 2 } },
    { label: "Slow start", art: "tea", recall: "you wake up slowly", vectors: { calm: 3 } }] },
  { id: "risk", prompt: "Try the strange door or the known one?", options: [
    { label: "Strange door", art: "door", recall: "you always try the strange door", vectors: { curious: 3, brave: 1 } },
    { label: "Known door", art: "home", recall: "you like knowing what's behind it", vectors: { calm: 2, loving: 1 } }] },
  { id: "garden", prompt: "Flowers or vegetables?", options: [
    { label: "Flowers", art: "flower", recall: "you plant things for looking at", vectors: { nature: 2, creative: 1 } },
    { label: "Vegetables", art: "root", recall: "you plant things for eating", vectors: { nature: 3 }, signal: "garden" }] },
  { id: "travel", prompt: "Map or no map?", options: [
    { label: "Map", art: "map", recall: "you always bring the map", vectors: { curious: 2, calm: 1 } },
    { label: "No map", art: "compass", recall: "you never bring a map", vectors: { brave: 3 } }] },
  { id: "animal", prompt: "Something that flies or something that swims?", options: [
    { label: "Flies", art: "wing", recall: "you'd rather fly", vectors: { dream: 2, brave: 1 } },
    { label: "Swims", art: "wave", recall: "you'd rather swim", vectors: { calm: 2, curious: 1 } }] },
  { id: "light", prompt: "Bright light or one small lamp?", options: [
    { label: "Bright", art: "sun", recall: "you keep the lights on", vectors: { playful: 2 } },
    { label: "One lamp", art: "lamp", recall: "one lamp is enough for you", vectors: { calm: 2, dream: 1 } }] },
  { id: "game", prompt: "Win fast or play long?", options: [
    { label: "Win fast", art: "spark", recall: "you play to win", vectors: { brave: 2, playful: 1 } },
    { label: "Play long", art: "loop", recall: "you play for the playing", vectors: { calm: 1, social: 2 } }] },
  { id: "surprise", prompt: "Surprises or plans?", options: [
    { label: "Surprises", art: "gift", recall: "you love a surprise", vectors: { playful: 2, curious: 1 } },
    { label: "Plans", art: "list", recall: "you like a plan", vectors: { calm: 2, creative: 1 } }] },
  { id: "sleepstyle", prompt: "Early to bed or late?", options: [
    { label: "Early", art: "moon", recall: "you sleep early", vectors: { calm: 3 } },
    { label: "Late", art: "star", recall: "you stay up late", vectors: { dream: 2, curious: 1 }, signal: "night" }] },
  { id: "help", prompt: "Ask for help or figure it out?", options: [
    { label: "Ask", art: "friends", recall: "you ask when you're stuck", vectors: { social: 3 } },
    { label: "Figure it out", art: "gear", recall: "you work it out alone", vectors: { curious: 2, brave: 1 } }] },
  { id: "memory", prompt: "Keep everything or keep a little?", options: [
    { label: "Everything", art: "shelf", recall: "you keep everything", vectors: { loving: 2, creative: 1 } },
    { label: "A little", art: "leaf", recall: "you keep only what matters", vectors: { calm: 2 } }] },
  { id: "walk", prompt: "Forest or city?", options: [
    { label: "Forest", art: "tree", recall: "the forest is yours", vectors: { nature: 3 } },
    { label: "City", art: "tower", recall: "the city is yours", vectors: { social: 2, curious: 1 } }] },
  { id: "weatherfun", prompt: "Puddles or fireplaces?", options: [
    { label: "Puddles", art: "puddle", recall: "you jump in puddles", vectors: { playful: 3 }, signal: "rain" },
    { label: "Fireplaces", art: "ember", recall: "you sit by the fire", vectors: { calm: 2, loving: 1 } }] },
  { id: "creature", prompt: "A loud friend or a quiet one?", options: [
    { label: "Loud", art: "note", recall: "you like loud company", vectors: { playful: 2, social: 2 } },
    { label: "Quiet", art: "hush", recall: "you like quiet company", vectors: { calm: 3 }, signal: "calmVisit" }] },
  { id: "dreamkind", prompt: "Flying dreams or floating dreams?", options: [
    { label: "Flying", art: "wing", recall: "you dream of flying", vectors: { brave: 2, dream: 2 } },
    { label: "Floating", art: "cloud", recall: "you dream of floating", vectors: { calm: 2, dream: 2 } }] },
  { id: "firstthing", prompt: "First thing you notice: colour or sound?", options: [
    { label: "Colour", art: "prism", recall: "you notice colour first", vectors: { creative: 3 } },
    { label: "Sound", art: "note", recall: "you notice sound first", vectors: { curious: 2, creative: 1 }, signal: "music" }] },
  { id: "kindness", prompt: "A long hug or a small gift?", options: [
    { label: "A hug", art: "heart", recall: "you'd rather have a hug", vectors: { loving: 3 }, signal: "gentle" },
    { label: "A gift", art: "gift", recall: "you'd rather have a small gift", vectors: { social: 2, creative: 1 } }] },
];

export const seedMap: Record<string, SeedQuestion> = Object.fromEntries(
  seedQuestions.map((q) => [q.id, q]),
);
