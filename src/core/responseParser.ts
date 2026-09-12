import { GrillRound, GrillRoundSchema } from '../types/grillRound';

export interface ParseResult {
  success: boolean;
  data?: GrillRound;
  rawText: string;
  extractedJson?: string;
  error?: string;
  canRepair: boolean;
}

/**
 * Robustly parses and validates an LLM response string according to Section 3.5:
 * 1. Text extraction
 * 2. Direct JSON parse
 * 3. Markdown code fence or outermost JSON object extraction
 * 4. Normalization and Zod re-validation
 * 5. Single-shot repair determination
 */
export function parseAndValidateGrillRound(rawText: string): ParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      success: false,
      rawText,
      error: 'AIからのレスポンスが空でした',
      canRepair: true,
    };
  }

  // Step 2: Try direct JSON parse
  let candidateJson = trimmed;
  let parsedObj: any = null;

  try {
    parsedObj = JSON.parse(candidateJson);
  } catch {
    // Step 3: Extract from Markdown code fence or outermost JSON object
    const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeFenceMatch && codeFenceMatch[1]) {
      candidateJson = codeFenceMatch[1].trim();
      try {
        parsedObj = JSON.parse(candidateJson);
      } catch {
        parsedObj = null;
      }
    }

    if (!parsedObj) {
      // Find outermost `{` and `}`
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidateJson = trimmed.slice(firstBrace, lastBrace + 1);
        try {
          parsedObj = JSON.parse(candidateJson);
        } catch {
          parsedObj = null;
        }
      }
    }
  }

  if (!parsedObj || typeof parsedObj !== 'object') {
    return {
      success: false,
      rawText,
      extractedJson: candidateJson !== trimmed ? candidateJson : undefined,
      error: '有効なJSONオブジェクトを抽出できませんでした',
      canRepair: true,
    };
  }

  // Step 4: Slight format normalization
  // Normalize string numbers to numbers for round & progressPercentage
  if (typeof parsedObj.round === 'string') {
    const r = parseInt(parsedObj.round, 10);
    if (!isNaN(r)) parsedObj.round = r;
  }
  if (typeof parsedObj.finished === 'string') {
    parsedObj.finished = parsedObj.finished.toLowerCase() === 'true';
  }
  if (parsedObj.completion) {
    if (typeof parsedObj.completion.progressPercentage === 'string') {
      const p = parseInt(parsedObj.completion.progressPercentage, 10);
      if (!isNaN(p)) parsedObj.completion.progressPercentage = p;
    }
  } else {
    parsedObj.completion = {
      progressPercentage: parsedObj.finished ? 100 : 50,
      reasoning: '',
    };
  }

  // Ensure questions is an array
  if (!Array.isArray(parsedObj.questions)) {
    parsedObj.questions = [];
  }

  // Ensure arrays
  if (!Array.isArray(parsedObj.decisions)) parsedObj.decisions = [];
  if (!Array.isArray(parsedObj.assumptions)) parsedObj.assumptions = [];
  if (!Array.isArray(parsedObj.conflicts)) parsedObj.conflicts = [];
  if (!Array.isArray(parsedObj.openIssues)) parsedObj.openIssues = [];

  // Step 4: Validate with Zod schema
  const validation = GrillRoundSchema.safeParse(parsedObj);
  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    return {
      success: false,
      rawText,
      extractedJson: candidateJson,
      error: `レスポンスのスキーマ検証エラー: ${errorMessages}`,
      canRepair: true,
    };
  }

  return {
    success: true,
    data: validation.data,
    rawText,
    extractedJson: candidateJson,
    canRepair: false,
  };
}

/**
 * Builds the repair request message for the LLM when validation fails.
 */
export function buildRepairMessage(rawResponse: string, errorMessage: string): string {
  return `【システム指示：形式修復要求】
直前の出力が指定されたJSONスキーマに適合していません。
検出された問題:
${errorMessage}

前回の出力内容:
${rawResponse.slice(0, 800)}

以下の必須フィールドを含む純粋な有効なJSONのみを出力してください（マークダウンコードブロックは不要、あるいは \`\`\`json で囲んでください）:
{
  "round": <数値>,
  "finished": <trueまたはfalse>,
  "completion": {
    "progressPercentage": <0〜100の数値>,
    "reasoning": "<進捗理由>"
  },
  "decisions": ["<確定事項>"],
  "assumptions": ["<仮定>"],
  "conflicts": ["<矛盾>"],
  "openIssues": ["<未解決>"],
  "questions": [
    {
      "id": "q1",
      "category": "カテゴリ",
      "question": "質問文",
      "options": ["選択肢1", "選択肢2"],
      "recommendedAnswer": "選択肢1",
      "explanation": "推奨理由"
    }
  ],
  "finalHandoff": "<finishedがtrueの場合のMarkdown成果物>"
}`;
}
