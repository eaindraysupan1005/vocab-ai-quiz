// Limits shared by the client and the server. Kept in their own module
// because the client needs them too, and the modules that enforce them
// (`gemini.ts`, `quiz/actions.ts`) read API keys at import time and must never
// be pulled into the browser bundle.

// Longest sentence the AI grader will accept. A sentence using one word
// doesn't need more than this, and the cap keeps a paste of arbitrary length
// out of the prompt — and off the Gemini bill.
export const MAX_SENTENCE_LENGTH = 400;
