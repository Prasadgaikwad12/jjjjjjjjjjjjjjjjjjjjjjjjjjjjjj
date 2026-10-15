import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize GoogleGenAI SDK
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/analyze-notes', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is available.',
      });
    }

    const { text, file, files, classGrade, subject, chapter, topic, difficultyLevel } = req.body;
    const resolvedChapter = (chapter || topic || '').trim();
    const validDifficultyLevels = ['Basic', 'Advanced (JEE/NEET)', 'Olympic'];
    const resolvedDifficulty = validDifficultyLevels.includes(difficultyLevel)
      ? difficultyLevel
      : 'Advanced (JEE/NEET)';

    if (!classGrade || typeof classGrade !== 'string' || !classGrade.trim()) {
      return res.status(400).json({
        error: 'Please select your Class before analyzing.',
      });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({
        error: 'Please select your Subject before analyzing.',
      });
    }

    if (!resolvedChapter) {
      return res.status(400).json({
        error: 'Please select your Chapter before analyzing.',
      });
    }

    const trimmedText = typeof text === 'string' ? text.trim() : '';
    const hasText = trimmedText.length > 0;

    // Support both single file and multiple files
    const rawFiles: any[] = Array.isArray(files)
      ? files
      : file && typeof file.data === 'string' && file.data.length > 0
      ? [file]
      : [];

    const validFiles = rawFiles.filter(
      (f) => f && typeof f.data === 'string' && f.data.length > 0
    );
    const hasFiles = validFiles.length > 0;

    if (!hasText && !hasFiles) {
      return res.status(400).json({
        error: 'Please type or upload your notes before analyzing.',
      });
    }

    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const parts: any[] = [];

    // Push all attached files (e.g. multiple notebook pages)
    for (let i = 0; i < validFiles.length; i++) {
      const currentFile = validFiles[i];
      let mimeType = currentFile.mimeType || 'image/jpeg';
      let base64Data = currentFile.data;

      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }

      if (!validMimeTypes.includes(mimeType)) {
        return res.status(400).json({
          error: `File #${i + 1} (${currentFile.fileName || 'file'}) is not a supported format. Please upload JPG, PNG, or PDF files.`,
        });
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const promptInstructions = `
You are NotesChecker AI, a fast, highly precise academic syllabus evaluator and study coach.
Your job is to thoroughly analyze student notes and benchmark them strictly against the curriculum expectations for the chosen Class, Subject, Chapter, and Difficulty Level.

Target Academic Benchmark (Compulsory Context):
- Class / Grade: ${classGrade}
- Subject: ${subject}
- Chapter / Topic: "${resolvedChapter}"
- Benchmark Difficulty Level: "${resolvedDifficulty}"

Difficulty Calibration:
${
  resolvedDifficulty === 'Basic'
    ? `* BASIC Level (CBSE & School Board Foundation): Benchmark notes against standard NCERT textbook requirements. Expect clear definitions, foundational laws, standard formulas, direct numerical setups, and neat structural diagrams. Do not penalize the student for omitting extreme competitive tricks or complex Olympiad-level derivations.`
    : resolvedDifficulty === 'Olympic'
    ? `* OLYMPIC Level (Olympiad & Research Standard): Apply the highest academic rigor (National & International Olympiads). Heavily scrutinize mathematical derivations, underlying theoretical assumptions, boundary conditions, edge cases, and cross-topic mastery. Grade strictly on conceptual depth and scientific elegance.`
    : `* ADVANCED (JEE/NEET) Level (Competitive Entrance Benchmark): Benchmark notes against high-yield JEE Main, JEE Advanced, and NEET UG entrance standards. Demand multi-concept synthesis, rapid problem shortcuts, reaction mechanisms, calculus derivations, and previous-year exam patterns. Flag omissions of recurring competitive question traps.`
}

${hasText ? `- Typed Notes Provided:\n"""\n${trimmedText}\n"""` : ''}
${hasFiles ? `- The student has uploaded ${validFiles.length} page(s)/image(s) of notes. Read, transcribe, and synthesize all content across all ${validFiles.length} uploaded pages using high-precision OCR.` : ''}

Scoring Criteria (Total = 100 points, calibrated to ${resolvedDifficulty} difficulty):
1. Completeness (max 30 points): Does the note cover the core definitions, formulas, derivations, and essential subtopics required at "${resolvedDifficulty}" expectations for "${resolvedChapter}"?
2. Accuracy (max 25 points): Are statements, scientific laws, chemical equations, mathematical steps, and units factually sound and scientifically precise?
3. Clarity & Organization (max 20 points): Are headings, bullet points, sub-sections, and diagrams organized effectively for rapid revision?
4. Important Concepts Covered (max 15 points): Are foundational theorems, laws, and key mechanisms present with appropriate depth for "${resolvedDifficulty}"?
5. Exam Relevance (max 10 points): Does it highlight high-yield exam points, typical questions, formulas, and common pitfalls?

Crucial Rules & Speed Directives:
- Analyze ONLY the notes actually provided by the student against the chosen Difficulty Level: "${resolvedDifficulty}".
- Base the score on how well the notes cover the actual syllabus of "${resolvedChapter}".
- Never invent information about what the student wrote.
- Be ultra-concise, academically authoritative, and rapid:
  * summary: 2 to 3 crisp, direct sentences.
  * category feedback: 1 to 2 punchy sentences per category.
  * strengths: exactly 3 high-impact bullets (under 12 words each).
  * missingTopics: exactly 3 specific syllabus subtopics or formulas omitted (under 10 words each).
  * improvements: exactly 3 clear action steps for mastering "${resolvedChapter}" (under 12 words each).
  * keyFormulasOrPoints: exactly 3 must-remember formulas or laws (under 10 words each).
  * extractedTextPreview: 1 brief sentence (under 12 words) summarizing notes detected.
- If the file is completely unreadable, blurry, blank, or has no legible text/content, set isUnreadableOrEmpty = true and set summary = "We couldn't read enough content from this file. Please upload a clearer image or type your notes."
- If the notes are extremely short (e.g. fewer than 2-3 sentences or trivial fragments like "f=ma"), set notEnoughContent = true and ensure summary = "Not enough content to accurately evaluate these notes."
`;

    parts.push({ text: promptInstructions });

    // Use low-latency gemini-3.1-flash-lite models for ultra-fast ~2-3s response time
    const candidateModels = [
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
    ];
    let textOutput: string | undefined;

    for (const model of candidateModels) {
      try {
        const generatePromise = ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 950,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isUnreadableOrEmpty: {
                  type: Type.BOOLEAN,
                  description:
                    'Set true only if the document/image is blank, unreadable, corrupted, or completely illegible.',
                },
                notEnoughContent: {
                  type: Type.BOOLEAN,
                  description: 'Set true if notes are too brief or fragmented to evaluate properly.',
                },
                overallScore: {
                  type: Type.INTEGER,
                  description: 'Total score from 0 to 100 (sum of category scores).',
                },
                chapterCoveragePercent: {
                  type: Type.INTEGER,
                  description:
                    'Estimated percentage (0 to 100) of chapter syllabus topics covered.',
                },
                summary: {
                  type: Type.STRING,
                  description:
                    'Short 2 to 4 sentence overall analysis explaining why the notes received this score based on the chapter syllabus.',
                },
                breakdown: {
                  type: Type.OBJECT,
                  properties: {
                    completeness: {
                      type: Type.OBJECT,
                      properties: {
                        score: { type: Type.INTEGER },
                        maxScore: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                      },
                      required: ['score', 'maxScore', 'feedback'],
                    },
                    accuracy: {
                      type: Type.OBJECT,
                      properties: {
                        score: { type: Type.INTEGER },
                        maxScore: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                      },
                      required: ['score', 'maxScore', 'feedback'],
                    },
                    clarity: {
                      type: Type.OBJECT,
                      properties: {
                        score: { type: Type.INTEGER },
                        maxScore: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                      },
                      required: ['score', 'maxScore', 'feedback'],
                    },
                    conceptCoverage: {
                      type: Type.OBJECT,
                      properties: {
                        score: { type: Type.INTEGER },
                        maxScore: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                      },
                      required: ['score', 'maxScore', 'feedback'],
                    },
                    examRelevance: {
                      type: Type.OBJECT,
                      properties: {
                        score: { type: Type.INTEGER },
                        maxScore: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                      },
                      required: ['score', 'maxScore', 'feedback'],
                    },
                  },
                  required: [
                    'completeness',
                    'accuracy',
                    'clarity',
                    'conceptCoverage',
                    'examRelevance',
                  ],
                },
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 positive points about what is good in the notes.',
                },
                missingTopics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Specific missing syllabus topics, formulas, or concepts from this chapter.',
                },
                improvements: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 actionable suggestions to improve notes for this chapter.',
                },
                keyFormulasOrPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 key must-know formulas, laws, or memory cues for this chapter.',
                },
                extractedTextPreview: {
                  type: Type.STRING,
                  description:
                    'A 1 to 2 sentence brief indication of the extracted/detected notes content.',
                },
              },
              required: [
                'overallScore',
                'summary',
                'breakdown',
                'strengths',
                'missingTopics',
                'improvements',
              ],
            },
          },
        });

        const response: any = await generatePromise;

        if (response.text) {
          textOutput = response.text;
          break;
        }
      } catch (modelErr) {
        console.warn(`Model ${model} attempt failed:`, modelErr);
        // Continue to secondary model fallback if necessary
      }
    }

    if (!textOutput) {
      return res.status(500).json({ error: 'Analysis failed. Please try again.' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(textOutput);
    } catch {
      // Clean possible markdown formatting wrapper if any
      const cleaned = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    // Validate unreadable file
    if (parsed.isUnreadableOrEmpty) {
      return res.status(422).json({
        error:
          "We couldn't read enough content from this file. Please upload a clearer image or type your notes.",
      });
    }

    // Ensure category maxScores are set correctly
    if (parsed.breakdown) {
      if (parsed.breakdown.completeness) parsed.breakdown.completeness.maxScore = 30;
      if (parsed.breakdown.accuracy) parsed.breakdown.accuracy.maxScore = 25;
      if (parsed.breakdown.clarity) parsed.breakdown.clarity.maxScore = 20;
      if (parsed.breakdown.conceptCoverage) parsed.breakdown.conceptCoverage.maxScore = 15;
      if (parsed.breakdown.examRelevance) parsed.breakdown.examRelevance.maxScore = 10;
    }

    // Ensure overallScore is calculated accurately
    const calculatedOverall =
      (parsed.breakdown?.completeness?.score || 0) +
      (parsed.breakdown?.accuracy?.score || 0) +
      (parsed.breakdown?.clarity?.score || 0) +
      (parsed.breakdown?.conceptCoverage?.score || 0) +
      (parsed.breakdown?.examRelevance?.score || 0);

    if (
      typeof parsed.overallScore !== 'number' ||
      Math.abs(parsed.overallScore - calculatedOverall) > 3
    ) {
      parsed.overallScore = Math.min(100, Math.max(0, calculatedOverall));
    }

    if (
      parsed.notEnoughContent &&
      !parsed.summary.includes('Not enough content to accurately evaluate these notes.')
    ) {
      parsed.summary =
        'Not enough content to accurately evaluate these notes. ' + parsed.summary;
    }

    parsed.difficultyLevel = resolvedDifficulty;

    return res.json(parsed);
  } catch (error) {
    console.error('Notes analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is available.',
      });
    }

    const { missingTopics, classGrade, subject, chapter, difficultyLevel } = req.body;

    if (!Array.isArray(missingTopics) || missingTopics.length === 0) {
      return res.status(400).json({
        error: 'No missing topics provided to generate flashcards.',
      });
    }

    const resolvedDifficulty = difficultyLevel || 'Advanced (JEE/NEET)';
    const cleanTopics = missingTopics
      .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      .slice(0, 6);

    const prompt = `You are NotesChecker AI, an expert STEM tutor and exam preparation coach.
Create interactive revision flashcards specifically to help a student master the syllabus topics that were MISSING from their notes.

Target Curriculum:
- Class/Exam: ${classGrade || 'Class 11/12'}
- Subject: ${subject || 'Science'}
- Chapter: "${chapter || 'Target Chapter'}"
- Difficulty Benchmark: "${resolvedDifficulty}"

Missing Syllabus Topics Identified:
${cleanTopics.map((topic: string, i: number) => `${i + 1}. ${topic}`).join('\n')}

Generate exactly 1 to 2 high-yield, engaging flashcards for EACH missing topic above (total 4 to 8 flashcards).
Each flashcard MUST contain:
- id: a unique short id (e.g. "fc-1", "fc-2")
- topic: the exact missing topic name it addresses
- question: a sharp, thought-provoking active recall question or formula derivation prompt
- answer: a clear, concise explanation (2 to 3 sentences maximum) explaining the concept simply and accurately
- keyFormulaOrPoint: the essential mathematical formula, chemical reaction, or scientific law to memorize
- mnemonicOrTip: a practical memory trick, mnemonic, or high-yield exam tip to avoid common pitfalls
`;

    const candidateModels = [
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
    ];
    let textOutput: string | undefined;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 1400,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      topic: { type: Type.STRING },
                      question: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      keyFormulaOrPoint: { type: Type.STRING },
                      mnemonicOrTip: { type: Type.STRING },
                    },
                    required: [
                      'id',
                      'topic',
                      'question',
                      'answer',
                      'keyFormulaOrPoint',
                      'mnemonicOrTip',
                    ],
                  },
                },
              },
              required: ['flashcards'],
            },
          },
        });

        if (response.text) {
          textOutput = response.text;
          break;
        }
      } catch (err) {
        console.warn(`Model ${model} flashcard generation failed:`, err);
      }
    }

    if (!textOutput) {
      // Fallback: generate high-quality synthesized flashcards from topics
      const fallbackCards = cleanTopics.map((topic: string, index: number) => ({
        id: `fc-fallback-${index + 1}`,
        topic,
        question: `What are the core principles, formulas, and definitions governing "${topic}" in ${chapter}?`,
        answer: `"${topic}" is a vital syllabus component of ${chapter} for ${classGrade}. Review standard NCERT definitions and practice 2-3 standard numerical applications.`,
        keyFormulaOrPoint: `Core formula & derivation for ${topic}`,
        mnemonicOrTip: `High-yield exam tip: Always state boundary conditions and verify SI units when solving problems on ${topic}.`,
      }));
      return res.json({ flashcards: fallbackCards });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(textOutput);
    } catch {
      const cleaned = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    return res.json(parsed);
  } catch (error) {
    console.error('Flashcard endpoint error:', error);
    return res.status(500).json({ error: 'Failed to generate flashcards.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const viteServer = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NotesChecker AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
