export const DEFAULT_QUIZ_SLUG = "desserts";

export type DemoQuizChoice = {
  key: "a" | "b" | "c" | "d";
  label: string;
  image_url: string;
};

export type DemoQuizQuestion = {
  position: number;
  text: string;
  media_url: string;
  choices: readonly DemoQuizChoice[];
  correct_key: DemoQuizChoice["key"];
  time_limit_seconds: number;
  points_base: number;
};

export type DemoQuizTemplate = {
  title: string;
  description: string;
  questions: readonly DemoQuizQuestion[];
};

const DEMO_DESSERT_CHOICES = [
  { key: "a", label: "ティラミス", image_url: "/desserts/tiramisu.jpg" },
  { key: "b", label: "プリン", image_url: "/desserts/pudding.jpg" },
  { key: "c", label: "ロールケーキ", image_url: "/desserts/shortcake.jpg" },
  { key: "d", label: "パンケーキ", image_url: "/desserts/pancake.jpg" },
] as const satisfies readonly DemoQuizChoice[];

export const DEMO_QUIZ_TEMPLATE = {
  title: DEFAULT_QUIZ_SLUG,
  description: "写真を見て答えるスイーツ早押しクイズ",
  questions: [
    {
      position: 0,
      text: "写真と同じスイーツはどれ？",
      media_url: "/desserts/tiramisu.jpg",
      choices: DEMO_DESSERT_CHOICES,
      correct_key: "a",
      time_limit_seconds: 20,
      points_base: 1000,
    },
    {
      position: 1,
      text: "写真と同じスイーツはどれ？",
      media_url: "/desserts/pudding.jpg",
      choices: DEMO_DESSERT_CHOICES,
      correct_key: "b",
      time_limit_seconds: 20,
      points_base: 1000,
    },
    {
      position: 2,
      text: "写真と同じスイーツはどれ？",
      media_url: "/desserts/shortcake.jpg",
      choices: DEMO_DESSERT_CHOICES,
      correct_key: "c",
      time_limit_seconds: 20,
      points_base: 1000,
    },
  ],
} as const satisfies DemoQuizTemplate;

export const QUIZ_TEMPLATES: Record<string, DemoQuizTemplate> = {
  [DEFAULT_QUIZ_SLUG]: DEMO_QUIZ_TEMPLATE,
};

export function getDemoQuestionMedia(question: DemoQuizQuestion): string {
  return question.media_url;
}
