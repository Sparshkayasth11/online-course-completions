const express = require('express');
const mongoose = require('mongoose');
const { User, Course, Progress, getStudentBranch } = require('./models');
const {
  createEightWeekSyllabus,
  evaluateSubmission,
  generateWeeklyLearningModule,
} = require('./submissionEvaluator');
const {
  adminCredentialsMatch,
  clearSessionCookie,
  clearStudentSessionCookie,
  hashPassword,
  isAuthConfigured,
  requireAdmin,
  requireStudent,
  setSessionCookie,
  setStudentSessionCookie,
  verifyPassword,
} = require('./auth');

const router = express.Router();
const WEEK_UNLOCK_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

function isValidId(value) {
  return (
    typeof value === 'string' &&
    /^[a-f\d]{24}$/i.test(value) &&
    mongoose.Types.ObjectId.isValid(value)
  );
}

function findStudentByIdentifier(studentId) {
  if (isValidId(studentId)) {
    return User.findOne({
      $or: [{ studentId }, { _id: studentId }],
    });
  }
  return User.findOne({ studentId });
}

function parseWeekIndex(value) {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 7
  ) {
    return value;
  }
  if (typeof value === 'string' && /^[0-7]$/.test(value)) {
    return Number(value);
  }
  return null;
}

function getWeekCompletionDate(progress, weekIndex) {
  const recordedCompletion = (progress.weekCompletionTimestamps || []).find(
    (completion) => completion.weekIndex === weekIndex
  );
  if (recordedCompletion?.completedAt) {
    return new Date(recordedCompletion.completedAt);
  }

  const passedAttempt = [...(progress.quizAttempts || [])]
    .reverse()
    .find((attempt) => attempt.moduleIndex === weekIndex && attempt.passed);
  if (passedAttempt?.submittedAt) {
    return new Date(passedAttempt.submittedAt);
  }
  return progress.updatedAt || progress.courseStartedAt || progress.createdAt || null;
}

function getWeekAvailableAt(progress, weekIndex) {
  if (weekIndex === 0) {
    return progress.courseStartedAt || progress.createdAt || null;
  }

  const previousWeekCompletedAt = getWeekCompletionDate(progress, weekIndex - 1);
  return previousWeekCompletedAt
    ? new Date(previousWeekCompletedAt.getTime() + WEEK_UNLOCK_DELAY_MS)
    : null;
}

function createCertificatePdf(student, courseTitle, completedAt) {
  const escapePdfText = (value) =>
    String(value)
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[\\()]/g, '\\$&');
  const completionDate = new Date(completedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const studentName = (student.name || 'Student').toUpperCase();
  const enrollmentNumber = student.studentId || student._id.toString();
  const pageWidth = 612;
  const pageHeight = 792;
  const commands = [];
  const colors = {
    navy: [15 / 255, 43 / 255, 92 / 255],
    blue: [0.08, 0.25, 0.48],
    gray: [0.32, 0.36, 0.4],
    lightGray: [0.9, 0.92, 0.94],
    paleBlue: [240 / 255, 244 / 255, 249 / 255],
    white: [1, 1, 1],
  };
  const colorCommand = (color, operator) =>
    `${color.map((channel) => Number(channel.toFixed(8))).join(' ')} ${operator}`;
  const rect = (x, y, width, height, { fill, stroke, lineWidth = 1 } = {}) => {
    if (fill) {
      commands.push(
        `q ${colorCommand(fill, 'rg')} ${x} ${y} ${width} ${height} re f Q`
      );
    }
    if (stroke) {
      commands.push(
        `q ${colorCommand(stroke, 'RG')} ${lineWidth} w ${x} ${y} ${width} ${height} re S Q`
      );
    }
  };
  const line = (x1, y1, x2, y2, color = colors.lightGray, lineWidth = 0.7) => {
    commands.push(
      `q ${colorCommand(color, 'RG')} ${lineWidth} w ${x1} ${y1} m ${x2} ${y2} l S Q`
    );
  };
  const characterWidth = (character) => {
    if (' ilI.,:;\'!|'.includes(character)) return 0.25;
    if ('MW@%'.includes(character)) return 0.85;
    if (character === ' ') return 0.28;
    if (/[A-Z]/.test(character)) return 0.65;
    if (/[0-9]/.test(character)) return 0.56;
    return 0.52;
  };
  const measureText = (value, fontSize) =>
    [...String(value)].reduce(
      (width, character) => width + characterWidth(character) * fontSize,
      0
    );
  const drawText = (
    value,
    x,
    y,
    fontSize,
    { font = 'F1', color = colors.gray, align = 'left' } = {}
  ) => {
    const textValue = escapePdfText(value);
    const textX =
      align === 'center'
        ? x - measureText(textValue, fontSize) / 2
        : align === 'right'
          ? x - measureText(textValue, fontSize)
          : x;
    commands.push(
      `BT /${font} ${fontSize} Tf ${colorCommand(color, 'rg')} 1 0 0 1 ${textX.toFixed(2)} ${y} Tm (${textValue}) Tj ET`
    );
  };
  const wrapText = (value, maxWidth, fontSize) => {
    const words = String(value).split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (currentLine && measureText(candidate, fontSize) > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };
  const drawWrappedText = (value, x, y, maxWidth, fontSize, lineHeight, options) => {
    const lines = wrapText(value, maxWidth, fontSize);
    lines.forEach((lineText, index) =>
      drawText(lineText, x, y - index * lineHeight, fontSize, options)
    );
    return lines.length;
  };
  const centerX = pageWidth / 2;

  rect(0, 0, pageWidth, pageHeight, { fill: colors.white });
  rect(28, 28, pageWidth - 56, pageHeight - 56, {
    stroke: colors.navy,
    lineWidth: 4,
  });
  rect(36, 36, pageWidth - 72, pageHeight - 72, {
    stroke: colors.navy,
    lineWidth: 1,
  });

  commands.push('q 1 0 0 1 0 -18 cm');

  drawText('JNCT', centerX, 744, 13, {
    font: 'F2',
    color: colors.blue,
    align: 'center',
  });
  drawText('LNCT GROUP OF COLLEGE', centerX, 725, 15, {
    font: 'F2',
    color: colors.navy,
    align: 'center',
  });
  drawText('ONLINE COURSE COMPLETION', centerX, 707, 9, {
    color: colors.gray,
    align: 'center',
  });
  drawText('CERTIFICATE OF COMPLETION', centerX, 679, 22, {
    font: 'F2',
    color: colors.navy,
    align: 'center',
  });
  line(70, 666, pageWidth - 70, 666, colors.lightGray, 1.2);

  drawText('This certificate is proudly presented to', centerX, 644, 12, {
    color: colors.gray,
    align: 'center',
  });
  const studentNameFontSize = Math.min(
    24,
    (492 / measureText(studentName, 24)) * 24
  );
  drawText(studentName, centerX, 613, studentNameFontSize, {
    font: 'F2',
    color: colors.navy,
    align: 'center',
  });
  line(
    Math.max(
      90,
      centerX - measureText(studentName, studentNameFontSize) / 2 - 12
    ),
    605,
    Math.min(
      pageWidth - 90,
      centerX + measureText(studentName, studentNameFontSize) / 2 + 12
    ),
    605,
    colors.blue,
    1.4
  );
  drawText(`Enrollment Number: ${enrollmentNumber}`, centerX, 585, 11, {
    color: colors.gray,
    align: 'center',
  });
  drawWrappedText(
    'of the Department of Computer Science & Engineering (Artificial Intelligence & Data Science), JNCT, Bhopal, for successfully completing an 8-week online course.',
    centerX,
    564,
    492,
    10,
    14,
    { color: colors.gray, align: 'center' }
  );

  rect(78, 466, pageWidth - 156, 50, {
    fill: colors.paleBlue,
    stroke: [0.72, 0.81, 0.9],
    lineWidth: 0.8,
  });
  drawText('COURSE TITLE', centerX, 498, 9, {
    font: 'F2',
    color: colors.blue,
    align: 'center',
  });
  const certificateCourseTitle = (courseTitle || 'Course').toUpperCase();
  const courseTitleFontSize = Math.min(
    16,
    ((pageWidth - 190) / measureText(certificateCourseTitle, 16)) * 16
  );
  drawText(certificateCourseTitle, centerX, 477, courseTitleFontSize, {
    font: 'F2',
    color: colors.navy,
    align: 'center',
  });

  const tableX = 70;
  const tableWidth = pageWidth - 140;
  const tableTop = 458;
  const labelColumnWidth = 164;
  const headerHeight = 26;
  const rowHeight = 25;
  const tableRows = [
    ['Course Duration', '8 Weeks'],
    ['Department', 'Artificial Intelligence & Data Science'],
    ['Course Mode', 'Online'],
    ['Issue Date', completionDate],
    ['Institution', 'JNCT, Bhopal'],
  ];
  const tableHeight = headerHeight + rowHeight * tableRows.length;
  rect(tableX, tableTop - tableHeight, tableWidth, tableHeight, {
    stroke: colors.lightGray,
    lineWidth: 0.9,
  });
  rect(tableX, tableTop - headerHeight, tableWidth, headerHeight, {
    fill: [0.96, 0.97, 0.98],
  });
  drawText('Course Detail', tableX + 12, tableTop - 17, 10, {
    font: 'F2',
    color: colors.gray,
  });
  drawText('Information', tableX + labelColumnWidth + 12, tableTop - 17, 10, {
    font: 'F2',
    color: colors.gray,
  });
  line(
    tableX + labelColumnWidth,
    tableTop - tableHeight,
    tableX + labelColumnWidth,
    tableTop,
    colors.lightGray,
    0.7
  );
  tableRows.forEach(([label, information], index) => {
    const rowTop = tableTop - headerHeight - index * rowHeight;
    const baseline = rowTop - 17;
    drawText(label, tableX + 12, baseline, 9.5, { color: colors.gray });
    drawText(information, tableX + labelColumnWidth + 12, baseline, 9.5, {
      font: 'F2',
      color: colors.navy,
    });
    if (index < tableRows.length - 1) {
      line(
        tableX,
        rowTop - rowHeight,
        tableX + tableWidth,
        rowTop - rowHeight,
        colors.lightGray,
        0.6
      );
    }
  });

  drawWrappedText(
    'We appreciate the dedication, commitment and enthusiasm demonstrated during the course and wish the student continued success in future academic and professional endeavors.',
    centerX,
    243,
    480,
    9,
    13,
    { color: colors.gray, align: 'center' }
  );

  commands.push('Q');

  line(pageWidth - 220, 140, pageWidth - 76, 140, [0.55, 0.58, 0.62], 0.7);
  drawText('AUTHORIZED SIGNATORY', pageWidth - 76, 126, 8, {
    font: 'F2',
    color: colors.gray,
    align: 'right',
  });
  drawText('Prof. Ravinder Tanwar', pageWidth - 76, 109, 13, {
    font: 'F2',
    color: colors.navy,
    align: 'right',
  });
  drawText('HOD, CSE (AI&DS)', pageWidth - 76, 93, 8, {
    color: colors.gray,
    align: 'right',
  });
  drawText('JNCT, Bhopal', pageWidth - 76, 80, 8, {
    color: colors.gray,
    align: 'right',
  });

  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function sendServerError(res, error) {
  console.error('Learning platform request failed:', error);
  return res.status(500).json({ error: 'An unexpected error occurred.' });
}

async function ensureEightWeekModules(course, taskDescription) {
  const task =
    typeof taskDescription === 'string' && taskDescription.trim()
      ? taskDescription.trim()
      : `Complete the weekly learning activities for ${course.title}.`;
  const existingModules = Array.from(course.modules || []);
  const syllabus = createEightWeekSyllabus(course.title, task);
  const hasCompleteSyllabus = syllabus.every((template) =>
    existingModules.some(
      (module) => module.moduleIndex === template.moduleIndex
    )
  );
  if (hasCompleteSyllabus && existingModules.length === 8) {
    return;
  }

  const existingByIndex = new Map(
    existingModules.map((module) => [module.moduleIndex, module])
  );
  course.modules = syllabus.map((template) => {
    const existing = existingByIndex.get(template.moduleIndex);
    if (existing) {
      return existing;
    }
    return template;
  });
  await course.save();
}

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'Admin authentication is not configured.' });
  }
  if (!adminCredentialsMatch(email, password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  setSessionCookie(res);
  return res.status(200).json({ authenticated: true });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  return res.status(200).json({ authenticated: false });
});

router.get('/auth/me', requireAdmin, (req, res) => {
  return res.status(200).json({
    authenticated: true,
    admin: {
      email: process.env.ADMIN_EMAIL,
      role: 'admin',
    },
  });
});

router.post('/student/login', async (req, res) => {
  const { studentId, email, password } = req.body || {};
  const studentIdentifier =
    typeof studentId === 'string' && studentId.trim()
      ? studentId.trim()
      : typeof email === 'string'
        ? email.trim()
        : '';
  const isEmail = studentIdentifier.includes('@');
  if (
    !studentIdentifier ||
    typeof password !== 'string' ||
    !password
  ) {
    return res.status(400).json({
      error: 'A studentId or email and password are required.',
    });
  }

  try {
    if (!isAuthConfigured()) {
      return res.status(503).json({ error: 'Student authentication is not configured.' });
    }
    let student = isEmail
      ? await User.findOne({ email: studentIdentifier.toLowerCase() }).select(
          '_id studentId name email role password'
        )
      : await User.findOne({ studentId: studentIdentifier }).select(
          '_id studentId name email role password'
        );
    if (!student && isValidId(studentIdentifier)) {
      student = await User.findById(studentIdentifier).select(
        '_id studentId name email role password'
      );
    }
    if (
      !student ||
      student.role !== 'student' ||
      !(await verifyPassword(password, student.password))
    ) {
      return res.status(401).json({ error: 'Invalid student ID or password.' });
    }

    setStudentSessionCookie(res, student._id.toString());
    return res.status(200).json({
      success: true,
      student: {
        _id: student._id,
        studentId: student.studentId || student._id.toString(),
        branch: student.branch || getStudentBranch(student.studentId),
        name: student.name,
        email: student.email,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.post('/student/logout', (req, res) => {
  clearStudentSessionCookie(res);
  return res.status(200).json({ authenticated: false });
});

router.get('/student/me', requireStudent, async (req, res) => {
  try {
    const student = await User.findById(req.studentId)
        .select('_id studentId branch name email role assignedCourses')
      .populate({
        path: 'assignedCourses',
        select: '_id title description',
      })
      .lean();
    if (!student || student.role !== 'student') {
      clearStudentSessionCookie(res);
      return res.status(401).json({ error: 'Student sign-in is required.' });
    }

    const courses = Array.isArray(student.assignedCourses)
      ? student.assignedCourses.filter(
          (course) => course && typeof course.title === 'string'
        )
      : [];
    return res.status(200).json({
      student: {
        _id: student._id,
        studentId: student.studentId || student._id.toString(),
        branch: student.branch || getStudentBranch(student.studentId),
        name: student.name,
        email: student.email,
        courses,
        assignedCourses: courses.map((course) => course._id),
        assignedCourseCount: courses.length,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.use('/student', requireStudent);

async function getStudentCourseModule(req, res) {
  const { courseId } = req.params;
  const weekIndex = parseWeekIndex(req.params.weekIndex);
  if (
    !isValidId(courseId) ||
    !Number.isInteger(weekIndex) ||
    weekIndex < 0 ||
    weekIndex > 7
  ) {
    return res.status(400).json({
      error: 'courseId must be a MongoDB ObjectId and weekIndex must be from 0 to 7.',
    });
  }

  try {
    const [student, course] = await Promise.all([
      User.findById(req.studentId).select('_id role assignedCourses'),
      Course.findById(courseId),
    ]);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    if (!student.assignedCourses.some((id) => id.equals(course._id))) {
      return res.status(403).json({
        error: 'This course is not assigned to the student.',
      });
    }
    let progress = await Progress.findOne({
      studentId: req.studentId,
      courseId,
    });
    if (!progress) {
      progress = await Progress.findOneAndUpdate(
        { studentId: req.studentId, courseId },
        { $setOnInsert: { studentId: req.studentId, courseId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }
    const currentWeekIndex = progress?.currentModuleIndex || 0;
    const completedWeeks = new Set([
      ...(progress?.completedWeeks || []),
      ...(progress?.completedModuleIndices || []),
    ]);
    const weekCompleted = completedWeeks.has(weekIndex);
    if (weekIndex > currentWeekIndex && !weekCompleted) {
      return res.status(403).json({
        error: 'Complete the current week before opening this module.',
      });
    }
    const availableAt = getWeekAvailableAt(progress, weekIndex);
    if (
      weekIndex === currentWeekIndex &&
      !weekCompleted &&
      availableAt &&
      new Date(availableAt).getTime() > Date.now()
    ) {
      return res.status(403).json({
        error: 'This week unlocks seven days after the previous week is completed.',
        nextAvailableAt: new Date(availableAt).toISOString(),
      });
    }

    await ensureEightWeekModules(
      course,
      course.modules.find((module) => module.moduleIndex === 0)?.defaultTask ||
        course.description
    );
    const module = course.modules.find(
      (item) => item.moduleIndex === weekIndex
    );
    if (!module) {
      return res.status(404).json({ error: 'Weekly module not found.' });
    }
    if (
      module.contentSource === 'pending' ||
      !module.lessons?.length ||
      !module.quiz?.length ||
      !module.lessons.every(
        (lesson) => typeof lesson.example === 'string' && lesson.example.trim()
      )
    ) {
      const task =
        weekIndex === progress.currentModuleIndex &&
        progress.customTaskOverride
          ? progress.customTaskOverride
          : module.defaultTask;
      const generatedModule = await generateWeeklyLearningModule(
        course.title,
        weekIndex,
        module.title,
        task
      );
      module.readingMaterial = generatedModule.readingMaterial;
      module.lessons = generatedModule.lessons;
      module.quiz = generatedModule.quiz;
      module.contentSource = generatedModule.contentSource;
      await course.save();
    }

    const moduleContent = module.toObject();
    moduleContent.quiz = moduleContent.quiz.map(
      ({ question, options }) => ({ question, options })
    );
    return res.status(200).json({
      weekIndex,
      module: moduleContent,
      unlockStatus: {
        isUnlocked: weekIndex <= currentWeekIndex || weekCompleted,
        isCompleted: weekCompleted,
        currentWeekIndex,
        availableAt: availableAt ? new Date(availableAt).toISOString() : null,
      },
    });
  } catch (error) {
    return sendServerError(res, error);
  }
}

router.get(
  '/student/courses/:courseId/modules/:weekIndex',
  getStudentCourseModule
);

router.get('/student/dashboard', async (req, res) => {
  try {
    const student = await User.findById(req.studentId)
      .select('_id studentId branch name email role assignedCourses')
      .populate({
        path: 'assignedCourses',
        select: '_id title description modules',
      });
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const assignedCourseRecords = Array.isArray(student.assignedCourses)
      ? student.assignedCourses
      : [];
    const courses = assignedCourseRecords.filter(
      (course) => course && typeof course.title === 'string'
    );
    const unresolvedCourseIds = assignedCourseRecords
      .filter((course) => !course || typeof course.title !== 'string')
      .map((course) => course?._id || course)
      .filter((courseId) => mongoose.Types.ObjectId.isValid(courseId));
    if (unresolvedCourseIds.length > 0) {
      const unresolvedCourses = await Course.find({
        _id: { $in: unresolvedCourseIds },
      }).select('_id title description modules');
      const coursesById = new Map(
        courses.map((course) => [course._id.toString(), course])
      );
      unresolvedCourses.forEach((course) => {
        coursesById.set(course._id.toString(), course);
      });
      courses.splice(0, courses.length, ...coursesById.values());
    }
    await Promise.all(
      courses.map((course) =>
        ensureEightWeekModules(
          course,
          course.modules.find((module) => module.moduleIndex === 0)
            ?.defaultTask || course.description
        )
      )
    );
    const courseIds = courses.map((course) => course._id);
    const progressRecords = courseIds.length
      ? await Promise.all(
          courseIds.map((courseId) =>
            Progress.findOneAndUpdate(
              { studentId: student._id, courseId },
              { $setOnInsert: { studentId: student._id, courseId } },
              { new: true, upsert: true, setDefaultsOnInsert: true }
            ).lean()
          )
        )
      : [];
    const progressByCourseId = new Map(
      progressRecords.map((progress) => [progress.courseId.toString(), progress])
    );
    const dashboardCourses = courses.map((course) => {
      const progress = progressByCourseId.get(course._id.toString()) || {
        courseStartedAt: course.createdAt,
        currentModuleIndex: 0,
        completedModuleIndices: [],
        completedWeeks: [],
        weekCompletionTimestamps: [],
        courseCompleted: false,
        completedAt: null,
        customTaskOverride: null,
        quizAttempts: [],
        submissions: [],
      };
      const completedModuleIndices = [
        ...new Set([
          ...(progress.completedModuleIndices || []),
          ...Array.from(
            { length: Math.min(progress.currentModuleIndex || 0, 8) },
            (_, index) => index
          ),
        ]),
      ];
      const completedWeeks = [
        ...new Set([
          ...(progress.completedWeeks || []),
          ...completedModuleIndices,
        ]),
      ];
      return {
        ...course.toObject(),
        modules: (course.modules || []).map((module) => {
          const moduleObject = module.toObject();
          if (module.moduleIndex > progress.currentModuleIndex) {
            return {
              moduleIndex: module.moduleIndex,
              title: module.title,
              lessons: [],
              quiz: [],
              contentSource: 'pending',
            };
          }
          return {
            ...moduleObject,
            quiz: (moduleObject.quiz || []).map(
              ({ question, options }) => ({ question, options })
            ),
          };
        }),
        progress: {
          ...progress,
          completedModuleIndices,
          completedWeeks,
          certificateIssued: Boolean(progress.certificateIssued),
          certificateStatus: progress.certificateIssued
            ? 'Issued'
            : 'In progress',
          certificateIssuedAt: progress.certificateIssued
            ? progress.certificateIssuedAt
            : null,
          courseStartedAt:
            progress.courseStartedAt || progress.createdAt || course.createdAt,
          nextWeekAvailableAt:
            (progress.currentModuleIndex || 0) < 8
              ? getWeekAvailableAt(progress, progress.currentModuleIndex || 0)
              : null,
          courseCompleted:
            Boolean(progress.courseCompleted) ||
            progress.currentModuleIndex >= 8,
        },
      };
    });

    return res.status(200).json({
      student: {
        _id: student._id,
        studentId: student.studentId || student._id.toString(),
        name: student.name,
        email: student.email,
        courses: dashboardCourses,
        assignedCourses: dashboardCourses.map((course) => course._id),
        assignedCourseCount: dashboardCourses.length,
      },
      courses: dashboardCourses,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.post(
  [
    '/student/quiz',
    '/student/courses/:courseId/modules/:weekIndex/quiz',
  ],
  async (req, res) => {
  const { answers } = req.body || {};
  const courseId = req.params.courseId || req.body?.courseId;
  const rawWeekIndex = req.params.weekIndex ?? req.body?.moduleIndex;
  const moduleIndex = parseWeekIndex(rawWeekIndex);
  const normalizedCourseId =
    typeof courseId === 'string' ? courseId.trim() : courseId;
  if (
    !isValidId(normalizedCourseId) ||
    !Number.isInteger(moduleIndex) ||
    moduleIndex < 0 ||
    moduleIndex > 7 ||
    !Array.isArray(answers) ||
    !Array.from({ length: answers.length }, (_, index) =>
      Number.isInteger(answers[index])
    ).every(Boolean)
  ) {
    return res.status(400).json({
      error:
        'courseId must be a MongoDB ObjectId, weekIndex must be from 0 to 7, and quiz answers must be integers.',
    });
  }

  try {
    const [student, course, currentProgress] = await Promise.all([
      User.findById(req.studentId).select('_id assignedCourses'),
      Course.findById(normalizedCourseId).select('_id modules'),
      Progress.findOne({
        studentId: req.studentId,
        courseId: normalizedCourseId,
      }),
    ]);
    if (!student) {
      return res.status(401).json({ error: 'Student sign-in is required.' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    if (
      !student.assignedCourses.some((assignedCourseId) =>
        assignedCourseId.equals(course._id)
      )
    ) {
      return res.status(403).json({
        error: 'This course is not assigned to the student.',
      });
    }
    if (!currentProgress) {
      return res.status(404).json({ error: 'Progress record not found.' });
    }
    if (currentProgress.currentModuleIndex !== moduleIndex) {
      return res.status(409).json({ error: 'moduleIndex is not the active module.' });
    }
    const weekAvailableAt = getWeekAvailableAt(currentProgress, moduleIndex);
    if (weekAvailableAt && new Date(weekAvailableAt).getTime() > Date.now()) {
      return res.status(403).json({
        error: 'This week is not available yet. Wait seven days after completing the previous week.',
        nextAvailableAt: new Date(weekAvailableAt).toISOString(),
      });
    }

    const module = course.modules.find(
      (item) => item.moduleIndex === moduleIndex
    );
    if (!module || !module.quiz || module.quiz.length === 0) {
      return res.status(404).json({ error: 'Quiz not found for this module.' });
    }
    if (
      answers.length !== module.quiz.length ||
      !Array.from({ length: answers.length }, (_, index) => {
        const answer = answers[index];
        return (
          Number.isInteger(answer) &&
          answer >= 0 &&
          answer < module.quiz[index].options.length
        );
      }).every(Boolean)
    ) {
      return res.status(400).json({
        error: 'Submit one valid answer for each quiz question.',
      });
    }

    const correctCount = module.quiz.reduce(
      (count, question, index) =>
        count + (answers[index] === question.correctAnswer ? 1 : 0),
      0
    );
    const score = Math.round((correctCount / module.quiz.length) * 100);
    const passed = score >= 70;
    const submittedAt = new Date();
    const quizUpdate = {
      $push: {
        quizAttempts: { moduleIndex, score, passed, submittedAt },
      },
    };
    if (passed) {
      quizUpdate.$push.weekCompletionTimestamps = {
        weekIndex: moduleIndex,
        completedAt: submittedAt,
      };
      quizUpdate.$addToSet = {
        completedModuleIndices: moduleIndex,
        completedWeeks: moduleIndex,
      };
      quizUpdate.$inc = { currentModuleIndex: 1 };
      quizUpdate.$set = { customTaskOverride: null };
      if (moduleIndex === 7) {
        quizUpdate.$set.courseCompleted = true;
        quizUpdate.$set.completedAt = new Date();
      }
    }
    const progress = await Progress.findOneAndUpdate(
      {
        studentId: student._id,
        courseId: course._id,
        currentModuleIndex: moduleIndex,
      },
      quizUpdate,
      { new: true, runValidators: true }
    );
    if (!progress) {
      return res.status(409).json({
        error: 'Progress changed while the quiz was being submitted. Please retry.',
      });
    }

    return res.status(200).json({
      success: true,
      score,
      passed,
      correctCount,
      questionCount: module.quiz.length,
      completedWeeks: progress.completedWeeks,
      currentWeekIndex: progress.currentModuleIndex,
      nextWeekAvailableAt:
        progress.currentModuleIndex < 8
          ? new Date(submittedAt.getTime() + WEEK_UNLOCK_DELAY_MS).toISOString()
          : null,
      courseCompleted: progress.courseCompleted,
      message: passed
        ? 'Quiz passed. Great work!'
        : 'Review the study material and try the quiz again.',
      progress,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
  }
);

router.get('/student/courses/:courseId/certificate/status', async (req, res) => {
  const { courseId } = req.params;
  if (!isValidId(courseId)) {
    return res.status(400).json({
      error: 'courseId must be a MongoDB ObjectId.',
    });
  }

  try {
    const student = await User.findById(req.studentId).select(
      '_id role assignedCourses'
    );
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!student.assignedCourses.some((id) => id.equals(courseId))) {
      return res.status(403).json({
        error: 'This course is not assigned to the student.',
      });
    }

    const progress = await Progress.findOne({
      studentId: req.studentId,
      courseId,
    });
    const certificateIssued = Boolean(progress?.certificateIssued);
    return res.status(200).json({
      certificateIssued,
      certificateStatus: certificateIssued ? 'Issued' : 'In progress',
      certificateIssuedAt: certificateIssued
        ? progress.certificateIssuedAt
        : null,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.get('/student/courses/:courseId/certificate', async (req, res) => {
  const { courseId } = req.params;
  if (!isValidId(courseId)) {
    return res.status(400).json({
      error: 'courseId must be a MongoDB ObjectId.',
    });
  }

  try {
    const [student, course, progress] = await Promise.all([
      User.findById(req.studentId).select(
        '_id studentId branch name role assignedCourses'
      ),
      Course.findById(courseId).select('_id title'),
      Progress.findOne({ studentId: req.studentId, courseId }),
    ]);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    if (!student.assignedCourses.some((id) => id.equals(course._id))) {
      return res.status(403).json({
        error: 'This course is not assigned to the student.',
      });
    }
    if (!progress || !progress.certificateIssued) {
      return res.status(403).json({
        error: 'An admin must issue this certificate before it can be downloaded.',
      });
    }

    const completedAt =
      progress.certificateIssuedAt ||
      progress.completedAt ||
      getWeekCompletionDate(progress, 7) ||
      new Date();
    const certificate = createCertificatePdf(
      student,
      course.title,
      completedAt
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="course-completion-certificate.pdf"',
      'Cache-Control': 'no-store',
    });
    return res.status(200).send(certificate);
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.use('/admin', requireAdmin);

router.post(
  '/admin/students/:studentId/courses/:courseId/certificate',
  async (req, res) => {
    const { studentId, courseId } = req.params;
    const { certificateIssued = true } = req.body || {};
    if (!isValidId(studentId) || !isValidId(courseId)) {
      return res.status(400).json({
        error: 'studentId and courseId must be valid MongoDB ObjectIds.',
      });
    }
    if (typeof certificateIssued !== 'boolean') {
      return res.status(400).json({
        error: 'certificateIssued must be a boolean.',
      });
    }

    try {
      const student = await User.findOne({
        _id: studentId,
        role: 'student',
        assignedCourses: courseId,
      }).select('_id');
      if (!student) {
        return res.status(404).json({
          error: 'Student or assigned course was not found.',
        });
      }

      const completedAt = certificateIssued ? new Date() : null;
      const completedWeekIndices = certificateIssued
        ? Array.from({ length: 8 }, (_, index) => index)
        : [];
      const progress = await Progress.findOneAndUpdate(
        { studentId, courseId },
        {
          $set: {
            currentModuleIndex: completedWeekIndices.length,
            completedModuleIndices: completedWeekIndices,
            completedWeeks: completedWeekIndices,
            weekCompletionTimestamps: certificateIssued
              ? completedWeekIndices.map((weekIndex) => ({
                  weekIndex,
                  completedAt,
                }))
              : [],
            courseCompleted: certificateIssued,
            completedAt,
            certificateIssued,
            certificateIssuedAt: completedAt,
          },
          $setOnInsert: { studentId, courseId },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return res.status(200).json({
        success: true,
        message: certificateIssued
          ? 'Certificate issued to the student.'
          : 'Certificate revoked and locked for the student.',
        certificateIssued,
        progress,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  }
);

router.get('/admin/records', async (req, res) => {
  try {
    const [students, courses] = await Promise.all([
      User.find({ role: 'student' })
        .select('_id studentId branch name email assignedCourses')
        .sort({ name: 1 })
        .lean(),
      Course.find().select('_id title').sort({ title: 1 }).lean(),
    ]);
    const progressRecords = students.length
      ? await Progress.find({
          studentId: { $in: students.map((student) => student._id) },
        })
          .select(
            'studentId courseId currentModuleIndex completedWeeks completedModuleIndices courseCompleted certificateIssued certificateIssuedAt'
          )
          .lean()
      : [];
    const progressByAssignment = new Map(
      progressRecords.map((progress) => [
        `${progress.studentId}:${progress.courseId}`,
        progress,
      ])
    );
    const studentsWithProgress = students.map((student) => {
      const courseProgress = (student.assignedCourses || []).map((courseId) => {
        const progress = progressByAssignment.get(
          `${student._id}:${courseId}`
        );
        const completedWeeks = new Set([
          ...(progress?.completedWeeks || []),
          ...(progress?.completedModuleIndices || []),
          ...(progress?.courseCompleted
            ? Array.from({ length: 8 }, (_, index) => index)
            : []),
          ...Array.from(
            { length: Math.min(progress?.currentModuleIndex || 0, 8) },
            (_, index) => index
          ),
        ]);
        const completedWeekIndices = [...completedWeeks]
          .filter((weekIndex) => weekIndex >= 0 && weekIndex < 8)
          .sort((left, right) => left - right);
        return {
          courseId,
          completedWeeks: completedWeekIndices,
          completedWeekCount: completedWeekIndices.length,
          courseCompleted:
            Boolean(progress?.courseCompleted) ||
            (progress?.currentModuleIndex || 0) >= 8 ||
            completedWeekIndices.length === 8,
          certificateIssued: Boolean(progress?.certificateIssued),
          certificateStatus: progress?.certificateIssued
            ? 'Issued'
            : 'In progress',
          certificateIssuedAt: progress?.certificateIssued
            ? progress.certificateIssuedAt
            : null,
        };
      });
      return {
        ...student,
        branch: student.branch || getStudentBranch(student.studentId),
        courseProgress,
      };
    });

    return res.status(200).json({
      students: studentsWithProgress,
      courses,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.patch('/admin/students/:studentId/password', async (req, res) => {
  const { studentId } = req.params;
  const { password } = req.body || {};
  if (!isValidId(studentId)) {
    return res.status(400).json({
      error: 'studentId must be a valid MongoDB ObjectId.',
    });
  }
  if (typeof password !== 'string' || password.length < 12) {
    return res.status(400).json({
      error: 'The new password must be at least 12 characters long.',
    });
  }

  try {
    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    student.password = await hashPassword(password);
    await student.save();
    return res.status(200).json({
      success: true,
      message: 'Student password updated successfully.',
      studentId: student._id,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.delete(
  '/admin/students/:studentId/courses/:courseId',
  async (req, res) => {
    const { studentId, courseId } = req.params;
    if (!isValidId(studentId) || !isValidId(courseId)) {
      return res.status(400).json({
        error:
          'studentId and courseId must be valid MongoDB ObjectIds.',
      });
    }

    let session;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const studentUpdate = await User.updateOne(
          { _id: studentId, role: 'student' },
          { $pull: { assignedCourses: courseId } },
          { session }
        );
        if (studentUpdate.matchedCount !== 1) {
          const error = new Error('Student not found.');
          error.code = 'STUDENT_NOT_FOUND';
          throw error;
        }
        if (studentUpdate.modifiedCount !== 1) {
          const error = new Error('Course assignment not found.');
          error.code = 'COURSE_ASSIGNMENT_NOT_FOUND';
          throw error;
        }

        await Progress.deleteMany({ studentId, courseId }, { session });
      });

      return res.status(200).json({
        success: true,
        message: 'Course unassigned and student progress removed successfully.',
        studentId,
        courseId,
      });
    } catch (error) {
      if (
        error.code === 'STUDENT_NOT_FOUND' ||
        error.code === 'COURSE_ASSIGNMENT_NOT_FOUND'
      ) {
        return res.status(404).json({ error: error.message });
      }
      return sendServerError(res, error);
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
);

router.delete('/admin/students/:studentId', async (req, res) => {
  const { studentId } = req.params;
  if (!isValidId(studentId)) {
    return res.status(400).json({
      error: 'studentId must be a valid MongoDB ObjectId.',
    });
  }

  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const deletion = await User.deleteOne(
        { _id: studentId, role: 'student' },
        { session }
      );
      if (deletion.deletedCount !== 1) {
        const error = new Error('Student not found.');
        error.code = 'STUDENT_NOT_FOUND';
        throw error;
      }

      await Progress.deleteMany({ studentId }, { session });
    });

    return res.status(200).json({
      success: true,
      message: 'Student and associated progress deleted successfully.',
      studentId,
    });
  } catch (error) {
    if (error.code === 'STUDENT_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return sendServerError(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

router.delete('/admin/courses/:courseId', async (req, res) => {
  const { courseId } = req.params;
  if (!isValidId(courseId)) {
    return res.status(400).json({
      error: 'courseId must be a valid MongoDB ObjectId.',
    });
  }

  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const deletion = await Course.deleteOne({ _id: courseId }, { session });
      if (deletion.deletedCount !== 1) {
        const error = new Error('Course not found.');
        error.code = 'COURSE_NOT_FOUND';
        throw error;
      }

      await Progress.deleteMany({ courseId }, { session });
      await User.updateMany(
        { assignedCourses: courseId },
        { $pull: { assignedCourses: courseId } },
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      message: 'Course and associated progress deleted successfully.',
      courseId,
    });
  } catch (error) {
    if (error.code === 'COURSE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    return sendServerError(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

router.post('/admin/assign-course', async (req, res) => {
  const { studentId, courseId } = req.body || {};
  const normalizedStudentId =
    typeof studentId === 'string' ? studentId.trim() : studentId;
  const normalizedCourseId =
    typeof courseId === 'string' ? courseId.trim() : courseId;
  const validationErrors = {};
  if (
    typeof normalizedStudentId !== 'string' ||
    !normalizedStudentId
  ) {
    validationErrors.studentId = 'A studentId is required.';
  }
  if (!isValidId(normalizedCourseId)) {
    validationErrors.courseId =
      'courseId must be a 24-character hexadecimal MongoDB ObjectId.';
  }
  if (Object.keys(validationErrors).length > 0) {
    return res.status(400).json({
      error: Object.values(validationErrors).join(' '),
      details: validationErrors,
    });
  }

  try {
    const [student, course] = await Promise.all([
      findStudentByIdentifier(normalizedStudentId),
      Course.findById(normalizedCourseId),
    ]);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const weekOneModule = course.modules.find(
      (module) => module.moduleIndex === 0
    );
    await ensureEightWeekModules(
      course,
      weekOneModule?.defaultTask || course.description
    );

    await User.updateOne(
      { _id: student._id },
      { $addToSet: { assignedCourses: normalizedCourseId } }
    );
    const progress = await Progress.findOneAndUpdate(
      { studentId: student._id, courseId: normalizedCourseId },
      {
        $setOnInsert: {
          studentId: student._id,
          courseId: normalizedCourseId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Course assigned successfully.',
      progress,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

router.post('/admin/assign-custom-task', async (req, res) => {
  const {
    studentId,
    courseId,
    customTask,
    newStudentName,
    newStudentEmail,
    newStudentPassword,
    newCourseTitle,
  } = req.body || {};
  const normalizedStudentId =
    typeof studentId === 'string' ? studentId.trim() : studentId;
  const normalizedCourseId =
    typeof courseId === 'string' ? courseId.trim() : courseId;
  const hasStudentId =
    normalizedStudentId !== undefined &&
    normalizedStudentId !== null &&
    normalizedStudentId !== '';
  const hasCourseId =
    normalizedCourseId !== undefined &&
    normalizedCourseId !== null &&
    normalizedCourseId !== '';
  const validationErrors = {};
  if (hasStudentId && typeof normalizedStudentId !== 'string') {
    validationErrors.studentId = 'studentId must be a string.';
  }
  if (hasCourseId && !isValidId(normalizedCourseId)) {
    validationErrors.courseId =
      'courseId must be a valid MongoDB ObjectId, or be omitted to create a course.';
  }
  if (typeof customTask !== 'string' || !customTask.trim()) {
    validationErrors.customTask = 'A non-empty customTask is required.';
  }
  const hasAnyNewStudentDetails = [
    newStudentName,
    newStudentEmail,
    newStudentPassword,
  ].some((value) => typeof value === 'string' && value.trim());
  const hasNewStudentDetails = [
    newStudentName,
    newStudentEmail,
    newStudentPassword,
  ].every((value) => typeof value === 'string' && value.trim());
  if ((!hasStudentId || hasAnyNewStudentDetails) && !hasNewStudentDetails) {
    validationErrors.student =
      'newStudentName, newStudentEmail, and newStudentPassword are required when creating a student.';
  }
  if (
    !hasCourseId &&
    (typeof newCourseTitle !== 'string' || !newCourseTitle.trim())
  ) {
    validationErrors.course =
      'newCourseTitle is required when courseId is omitted.';
  }
  if (Object.keys(validationErrors).length > 0) {
    return res.status(400).json({
      error: Object.values(validationErrors).join(' '),
      details: validationErrors,
    });
  }

  try {
    let [student, course] = await Promise.all([
      hasStudentId ? findStudentByIdentifier(normalizedStudentId) : null,
      hasCourseId ? Course.findById(normalizedCourseId) : null,
    ]);

    if (hasStudentId && !student && !hasNewStudentDetails) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (hasCourseId && !course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    if (student && student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const createStudent = !student && hasNewStudentDetails;
    const passwordHash = createStudent
      ? await hashPassword(newStudentPassword)
      : null;
    if (createStudent) {
      student = await User.create({
        name: newStudentName.trim(),
        email: newStudentEmail.trim().toLowerCase(),
        password: passwordHash,
        role: 'student',
        ...(hasStudentId ? { studentId: normalizedStudentId } : {}),
      });
    }
    if (!course) {
      course = await Course.findOne({ title: newCourseTitle.trim() });
    }
    if (!course) {
      course = await Course.create({
        title: newCourseTitle.trim(),
      });
    }
    await ensureEightWeekModules(course, customTask);

    await User.updateOne(
      { _id: student._id },
      { $addToSet: { assignedCourses: course._id } }
    );
    const progress = await Progress.findOneAndUpdate(
      { studentId: student._id, courseId: course._id },
      {
        $set: { customTaskOverride: customTask.trim() },
        $setOnInsert: { studentId: student._id, courseId: course._id },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Custom task assigned successfully!',
      studentId: student.studentId || student._id.toString(),
      studentObjectId: student._id,
      courseId: course._id,
      progress,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern) {
      if (error.keyPattern.email) {
        return res.status(409).json({
          error: 'A student with that email address already exists.',
        });
      }
      if (error.keyPattern.studentId) {
        return res.status(409).json({
          error: 'A student with that student ID already exists.',
        });
      }
    }
    return sendServerError(res, error);
  }
});

router.post('/student/submit', async (req, res) => {
  const { courseId, moduleIndex, submissionUrl } = req.body || {};
  const studentId = req.studentId;
  const normalizedCourseId =
    typeof courseId === 'string' ? courseId.trim() : courseId;
  if (
    !isValidId(normalizedCourseId) ||
    !Number.isInteger(moduleIndex) ||
    moduleIndex < 0 ||
    typeof submissionUrl !== 'string' ||
    !submissionUrl.trim()
  ) {
    return res.status(400).json({
      error: 'A valid courseId, moduleIndex, and submissionUrl are required.',
    });
  }

  try {
    const [student, course, progress] = await Promise.all([
      User.findById(studentId),
      Course.findById(normalizedCourseId),
      Progress.findOne({ studentId, courseId: normalizedCourseId }),
    ]);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    if (
      !student.assignedCourses.some((assignedCourseId) =>
        assignedCourseId.equals(normalizedCourseId)
      )
    ) {
      return res.status(403).json({ error: 'Student is not assigned to this course.' });
    }
    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found.' });
    }
    if (progress.currentModuleIndex !== moduleIndex) {
      return res.status(409).json({ error: 'moduleIndex is not the active module.' });
    }

    const courseModule = course.modules.find((item) => item.moduleIndex === moduleIndex);
    if (!courseModule) {
      return res.status(404).json({ error: 'Module not found.' });
    }

    const taskDescription =
      typeof progress.customTaskOverride === 'string' &&
      progress.customTaskOverride.trim()
        ? progress.customTaskOverride
        : courseModule.defaultTask;

    if (typeof taskDescription !== 'string' || !taskDescription.trim()) {
      return res.status(400).json({ error: 'No task is configured for this module.' });
    }

    const evaluation = await evaluateSubmission(taskDescription, submissionUrl.trim());
    const update = {
      $push: {
        submissions: {
          moduleIndex,
          submissionUrl: submissionUrl.trim(),
          score: evaluation.score,
          aiFeedback: evaluation.feedback,
          status: evaluation.passed ? 'approved' : 'rejected',
        },
      },
    };

    const updatedProgress = await Progress.findOneAndUpdate(
      {
        studentId,
        courseId: normalizedCourseId,
        currentModuleIndex: moduleIndex,
      },
      update,
      { new: true, runValidators: true }
    );

    if (!updatedProgress) {
      return res.status(409).json({
        error: 'Progress changed while the submission was being evaluated. Please retry.',
      });
    }

    return res.status(200).json({
      ...evaluation,
      evaluation,
      progress: updatedProgress,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

module.exports = router;
module.exports.getStudentCourseModule = getStudentCourseModule;
