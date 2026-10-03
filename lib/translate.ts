// Translator: one Claude call per page. Sends the page picture (plus a copy with the bubbles
// InkSwap found shaded and numbered) with the translation prompt, and gets back a checked
// list of bubbles. Runs in the background worker.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Box } from './geometry';
import type { Shape } from './pageimage';
import { prompt } from './prompt';
import type { Language } from './settings';

export const MODEL = 'claude-sonnet-5-5';
const EFFORT = 'medium';
const TIMEOUT_MS = 60_000;

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Spanish', fr: 'French' };

// Claude gives boxes in the image's own pixels (Sonnet 5.5's coordinates map 1:1 to pixels
// for images up to 2576px); we convert them to the 0–1000 page scale the overlay uses.
export const BubbleSchema = z.object({
  bubble: z
    .number()
    .int()
    .nullable()
    .describe('The number of the marked bubble (second image) this text sits in, or null if it is not inside one.'),
  box: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .describe(
      "The whole speech bubble's outline (not just the text inside it), in pixels of the page image as given: x and y are the top-left corner, w and h the width and height.",
    ),
  // The "leave this bubble alone" decisions come before the text, so they're made first, and
  // a bubble already in the target language costs almost nothing to report.
  inTargetLanguage: z
    .boolean()
    .describe('True if the text is already written in the target language and needs no translation.'),
  source: z.string().describe('The original text exactly as read in the bubble. Empty if already in the target language.'),
  readable: z.boolean().describe('False if the bubble could not be read with confidence.'),
  translation: z
    .string()
    .describe('The translation. Empty if the bubble is unreadable or already in the target language.'),
});
export const BubbleListSchema = z.object({
  bubbles: z.array(BubbleSchema).describe('Every bubble on the page, in reading order.'),
});

/** One line of text as Claude read it; `box` is on the 0–1000 page scale. */
export type ReadBubble = z.infer<typeof BubbleSchema>;

/** A translated bubble ready to draw: its box on the 0–1000 page scale, and its exact shape if InkSwap found it. */
export interface Bubble {
  box: Box;
  source: string;
  translation: string;
  readable: boolean;
  shape?: Shape;
}

export interface PageImage {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export type TranslateFailure = 'no-key' | 'bad-key' | 'refusal' | 'failed';

export class TranslateError extends Error {
  constructor(
    readonly kind: TranslateFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface PageTranslation {
  bubbles: ReadBubble[];
  usage: { input: number; output: number };
  ms: number;
}

/**
 * `clean` is the page as Claude reads it; `marked` (optional) is the same image with
 * `markedCount` bubbles shaded and numbered. The page occupies the top-left
 * `page.width × page.height` pixels of both (the rest is padding).
 */
export async function translatePage(
  images: { clean: PageImage; marked: PageImage | null; markedCount: number },
  page: { width: number; height: number },
  language: Language,
  apiKey: string,
): Promise<PageTranslation> {
  if (!apiKey) throw new TranslateError('no-key', 'No Claude API key saved');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: TIMEOUT_MS, maxRetries: 1 });
  const languageName = LANGUAGE_NAMES[language];
  const { clean, marked, markedCount } = images;
  const started = Date.now();

  const image = (img: PageImage) =>
    ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } }) as const;
  const howToRead = marked
    ? `Image 1 is the page (${clean.width}×${clean.height} pixels). Image 2 is the same page with the speech bubbles InkSwap detected shaded and numbered 1–${markedCount}; read the text from image 1. For each bubble, give the number of the marked bubble its text sits in (null if it isn't inside one, e.g. narration on the artwork) and its box in pixels. Touching bubbles can share one number: still list every separate bubble (each separately rounded lobe with its own block of text) as its own entry, with that shared number and its own box.`
    : `Page image: ${clean.width}×${clean.height} pixels. No bubbles were detected automatically, so give each bubble's box in pixels and use null for its number.`;

  let res;
  try {
    res = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: EFFORT, format: zodOutputFormat(BubbleListSchema) },
      system: prompt(languageName),
      messages: [
        {
          role: 'user',
          content: [
            image(clean),
            ...(marked ? [image(marked)] : []),
            { type: 'text', text: `${howToRead}\nTarget language: ${languageName}. A bubble already written in ${languageName} needs no translation: mark it as already in the target language and leave its translation empty.` },
          ],
        },
      ],
    },
    // About a minute in total, the SDK's one retry included; then the page counts as failed.
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw new TranslateError('failed', 'Timed out after 60 s');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new TranslateError('bad-key', e.message);
    }
    throw new TranslateError('failed', e instanceof Error ? e.message : String(e));
  }

  if (res.stop_reason === 'refusal') {
    throw new TranslateError('refusal', `Claude declined this page (${res.stop_details?.category ?? 'no category'})`);
  }
  if (res.stop_reason === 'max_tokens') throw new TranslateError('failed', 'Answer was cut off (max_tokens)');
  if (!res.parsed_output) throw new TranslateError('failed', 'Answer did not match the bubble format');

  const toScale = (v: number, size: number) => Math.round((v / size) * 1000);
  return {
    bubbles: res.parsed_output.bubbles.map((b) => ({
      ...b,
      bubble: b.bubble != null && b.bubble >= 1 && b.bubble <= markedCount ? b.bubble : null,
      box: {
        x: toScale(b.box.x, page.width),
        y: toScale(b.box.y, page.height),
        w: toScale(b.box.w, page.width),
        h: toScale(b.box.h, page.height),
      },
    })),
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    ms: Date.now() - started,
  };
}
