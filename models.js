const mongoose = require('mongoose');

const { Schema } = mongoose;

function getStudentBranch(studentId) {
  const rollNumber = typeof studentId === 'string' ? studentId : '';
  if (/AD/i.test(rollNumber)) {
    return 'Artificial Intelligence and Data Science (AIDS)';
  }
  if (/CL/i.test(rollNumber)) {
    return 'Artificial Intelligence and Machine Learning (AIML)';
  }
  if (/CS/i.test(rollNumber)) {
    return 'Computer Science Engineering (CSE)';
  }
  return '';
}

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'student'], default: 'student' },
    studentId: {
      type: String,
      trim: true,
      required() {
        return this.role === 'student';
      },
      unique: true,
      sparse: true,
      default() {
        return this.role === 'student' ? this._id.toString() : undefined;
      },
    },
    branch: { type: String, default: '' },
    assignedCourses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
  },
  { timestamps: true }
);

userSchema.pre('validate', function setBranchFromStudentId() {
  if (this.role === 'student' && this.studentId) {
    this.branch = getStudentBranch(this.studentId);
  }
});

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    modules: [
      {
        moduleIndex: { type: Number, required: true },
        title: { type: String, required: true },
        readingMaterial: { type: String, default: '' },
        defaultTask: { type: String, default: '' },
        lessons: [
          {
            day: { type: Number, required: true },
            title: { type: String, required: true },
            content: { type: String, required: true },
            example: { type: String, default: '' },
          },
        ],
        quiz: [
          {
            question: { type: String, required: true },
            options: [{ type: String, required: true }],
            correctAnswer: { type: Number, required: true },
            explanation: { type: String, default: '' },
          },
        ],
        contentSource: {
          type: String,
          enum: ['ai', 'starter', 'pending'],
          default: 'pending',
        },
      },
    ],
  },
  { timestamps: true }
);

const progressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    courseStartedAt: { type: Date, default: Date.now },
    currentModuleIndex: { type: Number, default: 0, min: 0, max: 8 },
    completedModuleIndices: [{ type: Number, min: 0, max: 7 }],
    completedWeeks: [{ type: Number, min: 0, max: 7 }],
    completedTopics: [
      {
        moduleIndex: { type: Number, required: true, min: 0, max: 7 },
        topicDay: { type: Number, required: true, min: 1 },
      },
    ],
    weekCompletionTimestamps: [
      {
        weekIndex: { type: Number, required: true, min: 0, max: 7 },
        completedAt: { type: Date, required: true, default: Date.now },
      },
    ],
    courseCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    certificateIssued: { type: Boolean, default: false },
    certificateIssuedAt: { type: Date, default: null },
    customTaskOverride: { type: String, default: null },
    quizAttempts: [
      {
        moduleIndex: { type: Number, required: true },
        score: { type: Number, required: true },
        passed: { type: Boolean, required: true },
        submittedAt: { type: Date, default: Date.now },
      },
    ],
    submissions: [
      {
        moduleIndex: { type: Number, required: true },
        submissionUrl: { type: String, required: true },
        score: { type: Number, default: null },
        aiFeedback: { type: String, default: '' },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending',
        },
      },
    ],
  },
  { timestamps: true }
);

progressSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Course: mongoose.models.Course || mongoose.model('Course', courseSchema),
  Progress: mongoose.models.Progress || mongoose.model('Progress', progressSchema),
  getStudentBranch,
};
