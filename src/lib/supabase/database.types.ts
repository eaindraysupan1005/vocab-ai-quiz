// Hand-written to match supabase/schema.sql. Once the Supabase CLI is set up,
// regenerate with `supabase gen types typescript` and replace this file.

export type WordStatus = "new" | "learning" | "learned";
export type QuizType = "daily" | "weekly";
export type QuestionType = "mcq" | "fill_blank" | "sentence";

export interface Database {
  public: {
    Tables: {
      words: {
        Row: {
          id: string;
          word: string;
          definition: string;
          example_sentence: string | null;
          topic: string | null;
          band_level: number | null;
          synonyms: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          word: string;
          definition: string;
          example_sentence?: string | null;
          topic?: string | null;
          band_level?: number | null;
          synonyms?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["words"]["Insert"]>;
        Relationships: [];
      };
      user_words: {
        Row: {
          id: string;
          user_id: string;
          word_id: string;
          status: WordStatus;
          times_seen: number;
          times_correct: number;
          times_wrong: number;
          next_review_date: string | null;
          last_reviewed_at: string | null;
          learned_at: string | null;
          created_at: string;
          batch_date: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          word_id: string;
          status?: WordStatus;
          times_seen?: number;
          times_correct?: number;
          times_wrong?: number;
          next_review_date?: string | null;
          last_reviewed_at?: string | null;
          learned_at?: string | null;
          created_at?: string;
          batch_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_words"]["Insert"]>;
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          user_id: string;
          type: QuizType;
          quiz_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: QuizType;
          quiz_date: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Insert"]>;
        Relationships: [];
      };
      quiz_answers: {
        Row: {
          id: string;
          quiz_id: string;
          user_id: string;
          word_id: string;
          question_type: QuestionType;
          user_answer: string | null;
          is_correct: boolean | null;
          ai_feedback: string | null;
          ai_suggestion: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          user_id: string;
          word_id: string;
          question_type: QuestionType;
          user_answer?: string | null;
          is_correct?: boolean | null;
          ai_feedback?: string | null;
          ai_suggestion?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_answers"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
