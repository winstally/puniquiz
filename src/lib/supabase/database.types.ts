export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          answered_at: string
          awarded_points: number | null
          choice_key: string
          id: string
          is_correct: boolean | null
          player_id: string
          response_ms: number
          round_id: string
        }
        Insert: {
          answered_at?: string
          awarded_points?: number | null
          choice_key: string
          id?: string
          is_correct?: boolean | null
          player_id: string
          response_ms: number
          round_id: string
        }
        Update: {
          answered_at?: string
          awarded_points?: number | null
          choice_key?: string
          id?: string
          is_correct?: boolean | null
          player_id?: string
          response_ms?: number
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          current_position: number
          host_id: string
          host_secret: string
          id: string
          phase_deadline: string | null
          phase_started_at: string | null
          pin: string
          quiz_id: string
          registration_locked: boolean
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_position?: number
          host_id: string
          host_secret?: string
          id?: string
          phase_deadline?: string | null
          phase_started_at?: string | null
          pin: string
          quiz_id: string
          registration_locked?: boolean
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_position?: number
          host_id?: string
          host_secret?: string
          id?: string
          phase_deadline?: string | null
          phase_started_at?: string | null
          pin?: string
          quiz_id?: string
          registration_locked?: boolean
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar_color: string | null
          avatar_initial: string | null
          created_at: string
          game_id: string
          id: string
          is_connected: boolean
          last_seen_at: string
          nickname: string
          user_id: string
        }
        Insert: {
          avatar_color?: string | null
          avatar_initial?: string | null
          created_at?: string
          game_id: string
          id?: string
          is_connected?: boolean
          last_seen_at?: string
          nickname: string
          user_id: string
        }
        Update: {
          avatar_color?: string | null
          avatar_initial?: string | null
          created_at?: string
          game_id?: string
          id?: string
          is_connected?: boolean
          last_seen_at?: string
          nickname?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          choices: Json
          correct_key: string
          created_at: string
          eyebrow: string | null
          id: string
          points_base: number
          position: number
          quiz_id: string
          text: string
          time_limit_seconds: number
        }
        Insert: {
          choices: Json
          correct_key: string
          created_at?: string
          eyebrow?: string | null
          id?: string
          points_base?: number
          position: number
          quiz_id: string
          text: string
          time_limit_seconds?: number
        }
        Update: {
          choices?: Json
          correct_key?: string
          created_at?: string
          eyebrow?: string | null
          id?: string
          points_base?: number
          position?: number
          quiz_id?: string
          text?: string
          time_limit_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          description: string | null
          edit_token: string
          id: string
          is_demo: boolean
          is_published: boolean
          owner_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          edit_token?: string
          id?: string
          is_demo?: boolean
          is_published?: boolean
          owner_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          edit_token?: string
          id?: string
          is_demo?: boolean
          is_published?: boolean
          owner_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      rounds: {
        Row: {
          deadline: string
          game_id: string
          id: string
          opened_at: string
          position: number
          question_id: string
          revealed_at: string | null
        }
        Insert: {
          deadline: string
          game_id: string
          id?: string
          opened_at?: string
          position: number
          question_id: string
          revealed_at?: string | null
        }
        Update: {
          deadline?: string
          game_id?: string
          id?: string
          opened_at?: string
          position?: number
          question_id?: string
          revealed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          correct_count: number
          game_id: string
          player_id: string
          streak: number
          total_points: number
          updated_at: string
        }
        Insert: {
          correct_count?: number
          game_id: string
          player_id: string
          streak?: number
          total_points?: number
          updated_at?: string
        }
        Update: {
          correct_count?: number
          game_id?: string
          player_id?: string
          streak?: number
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      questions_public: {
        Row: {
          choices: Json | null
          created_at: string | null
          eyebrow: string | null
          id: string | null
          points_base: number | null
          position: number | null
          quiz_id: string | null
          text: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          choices?: Json | null
          created_at?: string | null
          eyebrow?: string | null
          id?: string | null
          points_base?: number | null
          position?: number | null
          quiz_id?: string | null
          text?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          choices?: Json | null
          created_at?: string | null
          eyebrow?: string | null
          id?: string | null
          points_base?: number | null
          position?: number | null
          quiz_id?: string | null
          text?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _leaderboard: { Args: { p_game_id: string }; Returns: Json }
      _question_public: {
        Args: { p_position: number; p_quiz_id: string }
        Returns: Json
      }
      _vote_payload: { Args: { p_round_id: string }; Returns: Json }
      create_game: {
        Args: { p_quiz_id: string }
        Returns: {
          game_id: string
          host_secret: string
          pin: string
        }[]
      }
      create_quiz: {
        Args: { p_description: string; p_title: string }
        Returns: {
          edit_token: string
          quiz_id: string
        }[]
      }
      end_game: {
        Args: { p_game_id: string; p_host_secret: string }
        Returns: undefined
      }
      get_game_snapshot: { Args: { p_game_id: string }; Returns: Json }
      get_quiz_for_edit: {
        Args: { p_edit_token: string; p_quiz_id: string }
        Returns: Json
      }
      host_advance: {
        Args: { p_game_id: string; p_host_secret: string }
        Returns: undefined
      }
      host_reset_to_lobby: {
        Args: { p_game_id: string; p_host_secret: string }
        Returns: undefined
      }
      is_game_member: { Args: { p_game_id: string }; Returns: boolean }
      join_game: {
        Args: {
          p_avatar_color?: string
          p_avatar_initial?: string
          p_nickname: string
          p_pin: string
        }
        Returns: string
      }
      leave_game: { Args: { p_game_id: string }; Returns: undefined }
      lookup_game: {
        Args: { p_pin: string }
        Returns: {
          game_id: string
          quiz_title: string
          state: string
        }[]
      }
      reveal_round: {
        Args: { p_game_id: string; p_host_secret: string }
        Returns: undefined
      }
      save_quiz: {
        Args: {
          p_description: string
          p_edit_token: string
          p_is_published: boolean
          p_questions: Json
          p_quiz_id: string
          p_title: string
        }
        Returns: undefined
      }
      set_registration_lock: {
        Args: { p_game_id: string; p_host_secret: string; p_locked: boolean }
        Returns: undefined
      }
      submit_answer: {
        Args: { p_choice_key: string; p_game_id: string }
        Returns: Json
      }
      tick: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ---------------------------------------------------------------------------
// Convenience row aliases (hand-added; re-add after each `gen types`).
// ---------------------------------------------------------------------------
export type PlayerRow = Tables<"players">;
export type QuizRow = Tables<"quizzes">;
export type QuestionRow = Tables<"questions">;
export type GameRow = Tables<"games">;
export type ScoreRow = Tables<"scores">;
