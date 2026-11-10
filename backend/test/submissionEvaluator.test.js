const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

process.env.NODE_PATH = [
  process.env.NODE_PATH,
  path.resolve(__dirname, '..', 'node_modules'),
]
  .filter(Boolean)
  .join(path.delimiter);
require('node:module')._initPaths();

const {
  createEightWeekSyllabus,
  generateEightWeekModules,
  generateLearningModule,
  generateWeeklyLearningModule,
} = require('../../submissionEvaluator');

test('creates a seven-day starter module and quiz when AI is not configured', async (t) => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  const learningModule = await generateLearningModule(
    'Python Basics',
    'Build a command-line quiz.'
  );

  assert.equal(learningModule.contentSource, 'starter');
  assert.equal(learningModule.lessons.length, 7);
  assert.equal(learningModule.quiz.length, 5);
  assert.ok(
    learningModule.quiz.every(
      (question) =>
        question.options.length === 4 &&
        Number.isInteger(question.correctAnswer)
    )
  );
});

test('creates an eight-week syllabus with lessons and quizzes when AI is not configured', async (t) => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  const modules = await generateEightWeekModules(
    'HTML and CSS',
    'Build a landing page.'
  );

  assert.equal(modules.length, 8);
  assert.deepEqual(
    modules.map((module) => module.moduleIndex),
    [0, 1, 2, 3, 4, 5, 6, 7]
  );
  assert.ok(
    modules.every(
      (module) =>
        module.contentSource === 'starter' &&
        module.lessons.length === 7 &&
        module.quiz.length === 5 &&
        module.readingMaterial.includes('HTML and CSS')
    )
  );
  assert.equal(modules[0].defaultTask, 'Build a landing page.');
});

test('creates a selected-week starter module with examples when AI is unavailable', async (t) => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  const syllabus = createEightWeekSyllabus('Java', 'Build a console app.');
  assert.equal(syllabus.length, 8);
  assert.equal(syllabus[0].contentSource, 'pending');
  assert.deepEqual(syllabus[0].lessons, []);

  const module = await generateWeeklyLearningModule(
    'Java',
    0,
    syllabus[0].title,
    'Build a console app.'
  );
  assert.equal(module.contentSource, 'starter');
  assert.equal(module.lessons.length, 7);
  assert.ok(module.lessons.every((lesson) => lesson.example));
  assert.equal(module.quiz.length, 5);
  assert.equal(module.defaultTask, 'Build a console app.');
});
