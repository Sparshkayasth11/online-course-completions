const { GoogleGenerativeAI } = require('@google/generative-ai');

const FALLBACK_RESULT = {
  score: 0,
  feedback: 'The assignment could not be evaluated. Please try again later.',
  passed: false,
};
const WEEKLY_FOCUSES = [
  'foundations and learning goals',
  'core syntax and essential concepts',
  'working with data and common patterns',
  'functions, components, and reusable structure',
  'handling input, events, and user interaction',
  'connecting parts and managing state',
  'testing, debugging, and improving quality',
  'building and reviewing a complete project',
];

function createEightWeekSyllabus(courseTitle, customTask) {
  const topic = courseTitle.trim();
  return WEEKLY_FOCUSES.map((focus, moduleIndex) => {
    const week = moduleIndex + 1;
    return {
      moduleIndex,
      title: `Week ${week}: ${focus}`,
      readingMaterial: `This week explores ${focus} in ${topic}. Open the week to load its teaching content, examples, and quiz.`,
      defaultTask:
        week === 1
          ? customTask
          : `Apply week ${week}'s ${focus} to a small ${topic} exercise.`,
      lessons: [],
      quiz: [],
      contentSource: 'pending',
    };
  });
}

function createStarterLearningModule(courseTitle, customTask) {
  const topic = courseTitle.trim();
  return {
    contentSource: 'starter',
    lessons: [
      {
        day: 1,
        title: `Set goals for ${topic}`,
        content: `Review the course goals and the custom task: ${customTask}. Write down what you already know and what you want to be able to do by the end of the week.`,
      },
      {
        day: 2,
        title: 'Learn the core concepts',
        content: `Identify the foundational ideas behind ${topic}. Define unfamiliar terms in your own words and connect each idea to the course task.`,
      },
      {
        day: 3,
        title: 'Follow a worked example',
        content: `Study a small example related to ${topic}. Explain each step and note why the chosen approach works.`,
      },
      {
        day: 4,
        title: 'Practice one concept at a time',
        content: `Complete short exercises related to ${topic}. Check your work and correct misunderstandings before moving on.`,
      },
      {
        day: 5,
        title: 'Build a small solution',
        content: `Apply the week's concepts to a small, original example. Keep the scope focused and describe the decisions you made.`,
      },
      {
        day: 6,
        title: 'Review and improve',
        content: `Revisit your notes and practice work. Find one weak area, review it, and improve your small solution.`,
      },
      {
        day: 7,
        title: 'Prepare the course task',
        content: `Complete and review the assigned task: ${customTask}. Make sure you can explain how your work demonstrates what you learned about ${topic}.`,
      },
    ],
    quiz: [
      {
        question: 'What is the best first step when learning a new topic?',
        options: [
          'Memorize every detail before practicing',
          'Identify the learning goals and what you already know',
          'Skip examples and start with the hardest task',
          'Avoid reviewing mistakes',
        ],
        correctAnswer: 1,
        explanation: 'Clear goals and prior knowledge make study more focused.',
      },
      {
        question: 'How should you use a worked example?',
        options: [
          'Copy it without understanding it',
          'Skip the reasoning and remember only the result',
          'Explain each step and why it works',
          'Avoid comparing it with your own work',
        ],
        correctAnswer: 2,
        explanation: 'Explaining the reasoning helps transfer concepts to new tasks.',
      },
      {
        question: 'What is a useful way to practice a difficult concept?',
        options: [
          'Break it into smaller exercises and check your work',
          'Repeat the same unchecked answer',
          'Move on without reviewing it',
          'Only read the task title',
        ],
        correctAnswer: 0,
        explanation: 'Small, checked exercises make errors easier to understand.',
      },
      {
        question: 'What should you do after finding a mistake?',
        options: [
          'Ignore it if the result looks close',
          'Repeat the same approach immediately',
          'Review the reasoning and correct the misunderstanding',
          'Delete your notes',
        ],
        correctAnswer: 2,
        explanation: 'Reviewing the reasoning helps address the cause of the mistake.',
      },
      {
        question: 'How can you show that you understand a course task?',
        options: [
          'Submit without reviewing your work',
          'Explain how your solution applies the learned concepts',
          'Use an unrelated example',
          'Avoid describing your decisions',
        ],
        correctAnswer: 1,
        explanation: 'Connecting the solution to course concepts demonstrates understanding.',
      },
    ],
  };
}

function withExamples(learningModule) {
  return {
    ...learningModule,
    lessons: learningModule.lessons.map((lesson) => ({
      ...lesson,
      example:
        lesson.example ||
        `Create a small original ${lesson.title.toLowerCase()} example, then explain how it demonstrates the concept.`,
    })),
  };
}

async function generateWeeklyLearningModule(
  courseTitle,
  moduleIndex,
  moduleTitle,
  customTask
) {
  const week = moduleIndex + 1;
  const starter = withExamples(
    createStarterLearningModule(
      `${courseTitle} — ${moduleTitle}`,
      customTask
    )
  );
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ...starter,
      title: moduleTitle,
      moduleIndex,
      readingMaterial: `Week ${week} focuses on ${moduleTitle} for ${courseTitle}. Study each explanation and example, then complete the quiz and task.`,
      defaultTask: customTask,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = `Teach week ${week} of an eight-week course titled "${courseTitle}". This week's syllabus topic is "${moduleTitle}". The assigned task is "${customTask}".
Return only JSON with exactly these fields:
{
  "readingMaterial": "a structured introduction with headings or clear paragraphs",
  "lessons": [{"day": 1, "title": "short title", "content": "accurate explanation", "example": "a concrete, runnable or inspectable example with a brief explanation"}],
  "quiz": [{"question": "question based on this week's teaching", "options": ["four choices"], "correctAnswer": 0, "explanation": "why the answer is correct"}]
}
Include exactly 7 lessons numbered day 1 through day 7 and exactly 5 multiple-choice quiz questions, each with four options. Make explanations and examples specific to the course technology and this week's topic. Ensure every quiz question tests material taught in these lessons. Keep examples beginner-friendly and do not assume prior weeks beyond the listed topic.`;
    const result = await model.generateContent(prompt);
    const generated = JSON.parse(result.response.text());
    const validLessons =
      Array.isArray(generated.lessons) &&
      generated.lessons.length === 7 &&
      generated.lessons.every(
        (lesson, index) =>
          lesson.day === index + 1 &&
          typeof lesson.title === 'string' &&
          lesson.title.trim() &&
          typeof lesson.content === 'string' &&
          lesson.content.trim() &&
          typeof lesson.example === 'string' &&
          lesson.example.trim()
      );
    const validQuiz =
      Array.isArray(generated.quiz) &&
      generated.quiz.length === 5 &&
      generated.quiz.every(
        (question) =>
          typeof question.question === 'string' &&
          question.question.trim() &&
          Array.isArray(question.options) &&
          question.options.length === 4 &&
          question.options.every(
            (option) => typeof option === 'string' && option.trim()
          ) &&
          Number.isInteger(question.correctAnswer) &&
          question.correctAnswer >= 0 &&
          question.correctAnswer < 4 &&
          typeof question.explanation === 'string' &&
          question.explanation.trim()
      );
    if (
      typeof generated.readingMaterial !== 'string' ||
      !generated.readingMaterial.trim() ||
      !validLessons ||
      !validQuiz
    ) {
      throw new Error('AI returned an invalid weekly teaching module.');
    }

    return {
      ...generated,
      title: moduleTitle,
      moduleIndex,
      defaultTask: customTask,
      contentSource: 'ai',
    };
  } catch (error) {
    console.error('Weekly teaching module generation failed:', error.message);
    return {
      ...starter,
      title: moduleTitle,
      moduleIndex,
      readingMaterial: `Week ${week} focuses on ${moduleTitle} for ${courseTitle}. Study each explanation and example, then complete the quiz and task.`,
      defaultTask: customTask,
    };
  }
}

async function generateLearningModule(courseTitle, customTask) {
  const starterModule = createStarterLearningModule(courseTitle, customTask);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return starterModule;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = `Create a useful seven-day beginner learning module for this course.
Return only JSON with exactly these fields:
{
  "lessons": [{"day": 1, "title": "short title", "content": "clear study material"}],
  "quiz": [{"question": "question", "options": ["four choices"], "correctAnswer": 0, "explanation": "why this answer is correct"}]
}
Include exactly 7 lessons, one for each day, and exactly 5 multiple-choice quiz questions. Each question must have exactly four options and a correctAnswer from 0 to 3. Make the material specific to the course, accurate, and appropriate for a beginner.
Course: ${courseTitle}
Assigned task: ${customTask}`;
    const result = await model.generateContent(prompt);
    const generated = JSON.parse(result.response.text());
    const validLessons =
      Array.isArray(generated.lessons) &&
      generated.lessons.length === 7 &&
      generated.lessons.every(
        (lesson, index) =>
          lesson.day === index + 1 &&
          typeof lesson.title === 'string' &&
          lesson.title.trim() &&
          typeof lesson.content === 'string' &&
          lesson.content.trim()
      );
    const validQuiz =
      Array.isArray(generated.quiz) &&
      generated.quiz.length === 5 &&
      generated.quiz.every(
        (question) =>
          typeof question.question === 'string' &&
          question.question.trim() &&
          Array.isArray(question.options) &&
          question.options.length === 4 &&
          question.options.every(
            (option) => typeof option === 'string' && option.trim()
          ) &&
          Number.isInteger(question.correctAnswer) &&
          question.correctAnswer >= 0 &&
          question.correctAnswer < 4 &&
          typeof question.explanation === 'string'
      );

    if (!validLessons || !validQuiz) {
      throw new Error('AI returned an invalid learning module format.');
    }

    return { ...generated, contentSource: 'ai' };
  } catch (error) {
    console.error('Learning module generation failed:', error.message);
    return starterModule;
  }
}

function createStarterEightWeekModules(courseTitle, customTask) {
  const topic = courseTitle.trim();
  return WEEKLY_FOCUSES.map((focus, index) => {
    const week = index + 1;
    const task =
      week === 1
        ? customTask
        : `Apply week ${week}'s ${focus} to a small ${topic} exercise.`;
    const starter = createStarterLearningModule(
      `${topic}: ${focus}`,
      task
    );
    return {
      moduleIndex: index,
      title: `Week ${week}: ${focus}`,
      readingMaterial: `Week ${week} focuses on ${focus} in ${topic}. Study the daily explanations, practice each idea, and use the quiz to check your understanding.`,
      defaultTask: task,
      ...starter,
    };
  });
}

async function generateEightWeekModules(courseTitle, customTask) {
  const starterModules = createStarterEightWeekModules(courseTitle, customTask);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return starterModules;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = `Create an eight-week beginner-to-project course for "${courseTitle}". Follow this sequence: ${WEEKLY_FOCUSES.join('; ')}.
Return only JSON with a "modules" array containing exactly 8 objects. Each object must have:
{"title":"Week N: topic","readingMaterial":"clear explanation","defaultTask":"weekly practical task","lessons":[{"day":1,"title":"short title","content":"accurate explanation"}],"quiz":[{"question":"question","options":["four choices"],"correctAnswer":0,"explanation":"why correct"}]}
Include exactly 7 lessons per week, with day values 1 through 7, and exactly 5 multiple-choice questions per week, each with exactly 4 options and correctAnswer 0 through 3. Make every week distinct, specific to the course, accurate, and suitable for beginners. Week 1 must incorporate this assigned task: ${customTask}`;
    const result = await model.generateContent(prompt);
    const generated = JSON.parse(result.response.text());
    const validModules =
      Array.isArray(generated.modules) &&
      generated.modules.length === 8 &&
      generated.modules.every(
        (module, index) =>
          typeof module.title === 'string' &&
          module.title.trim() &&
          typeof module.readingMaterial === 'string' &&
          module.readingMaterial.trim() &&
          typeof module.defaultTask === 'string' &&
          module.defaultTask.trim() &&
          Array.isArray(module.lessons) &&
          module.lessons.length === 7 &&
          module.lessons.every(
            (lesson, lessonIndex) =>
              lesson.day === lessonIndex + 1 &&
              typeof lesson.title === 'string' &&
              lesson.title.trim() &&
              typeof lesson.content === 'string' &&
              lesson.content.trim()
          ) &&
          Array.isArray(module.quiz) &&
          module.quiz.length === 5 &&
          module.quiz.every(
            (question) =>
              typeof question.question === 'string' &&
              question.question.trim() &&
              Array.isArray(question.options) &&
              question.options.length === 4 &&
              question.options.every(
                (option) => typeof option === 'string' && option.trim()
              ) &&
              Number.isInteger(question.correctAnswer) &&
              question.correctAnswer >= 0 &&
              question.correctAnswer < 4 &&
              typeof question.explanation === 'string'
          )
      );

    if (!validModules) {
      throw new Error('AI returned an invalid eight-week course format.');
    }

    return generated.modules.map((module, moduleIndex) => ({
      ...module,
      moduleIndex,
      contentSource: 'ai',
    }));
  } catch (error) {
    console.error('Eight-week course generation failed:', error.message);
    return starterModules;
  }
}

async function evaluateSubmission(taskDescription, studentSubmission) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Act as a Senior Tech Lead evaluating a student's assignment.
Evaluate the submission against the task description. Give a score from 0 to 100 and detailed, constructive feedback.
Return only a valid JSON object with exactly these fields:
{
  "score": number,
  "feedback": "detailed review string",
  "passed": boolean
}
Set passed to true if and only if score is at least 70.

Task description:
${taskDescription}

Student submission:
${studentSubmission}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const evaluation = JSON.parse(responseText);

    if (
      typeof evaluation.score !== 'number' ||
      !Number.isFinite(evaluation.score) ||
      evaluation.score < 0 ||
      evaluation.score > 100 ||
      typeof evaluation.feedback !== 'string' ||
      typeof evaluation.passed !== 'boolean'
    ) {
      throw new Error('AI returned an invalid evaluation format');
    }

    return {
      score: evaluation.score,
      feedback: evaluation.feedback,
      passed: evaluation.score >= 70,
    };
  } catch (error) {
    console.error('Submission evaluation failed:', error.message);
    return { ...FALLBACK_RESULT };
  }
}

module.exports = {
  createEightWeekSyllabus,
  evaluateSubmission,
  generateEightWeekModules,
  generateLearningModule,
  generateWeeklyLearningModule,
};
