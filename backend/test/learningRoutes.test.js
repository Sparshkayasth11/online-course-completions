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

test('custom task route reports required-field validation errors as JSON', async (t) => {
  const previousValues = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  process.env.ADMIN_EMAIL = 'route-test-admin@example.com';
  process.env.ADMIN_PASSWORD = 'route-test-password';
  process.env.SESSION_SECRET = '01234567890123456789012345678901';

  t.after(() => {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const { app } = require('../../server');
  const server = app.listen(0);
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );
  await new Promise((resolve) => server.once('listening', resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const missingApiResponse = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(missingApiResponse.status, 404);
  assert.deepEqual(await missingApiResponse.json(), {
    error: 'API route not found: GET /unknown',
  });

  const malformedJsonResponse = await fetch(
    `${baseUrl}/api/admin/assign-custom-task`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"customTask":',
    }
  );
  assert.equal(malformedJsonResponse.status, 400);
  assert.deepEqual(await malformedJsonResponse.json(), {
    error: 'Request body must contain valid JSON.',
  });

  const invalidStudentLoginResponse = await fetch(
    `${baseUrl}/api/student/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'invalid' }),
    }
  );
  assert.equal(invalidStudentLoginResponse.status, 400);
  assert.deepEqual(await invalidStudentLoginResponse.json(), {
    error: 'A studentId or email and password are required.',
  });

  const { Course, Progress, User } = require('../../models');
  const mongoose = require('../../node_modules/mongoose');
  const { hashPassword, verifyPassword } = require('../../auth');
  assert.ok(
    Progress.schema.indexes().some(
      ([fields, options]) =>
        fields.studentId === 1 &&
        fields.courseId === 1 &&
        options.unique === true
    )
  );
  const generatedStudent = new User({
    name: 'Generated ID Student',
    email: 'generated-id@example.com',
    password: 'password-hash',
  });
  assert.equal(generatedStudent.studentId, generatedStudent._id.toString());
  await generatedStudent.validate();
  assert.equal(generatedStudent.branch, '');
  const customIdStudent = new User({
    name: 'Custom ID Student',
    email: 'custom-id@example.com',
    password: 'password-hash',
    studentId: '0131AD231067',
  });
  assert.equal(customIdStudent.studentId, '0131AD231067');
  await customIdStudent.validate();
  assert.equal(
    customIdStudent.branch,
    'Artificial Intelligence and Data Science (AIDS)'
  );
  const clStudent = new User({
    name: 'Machine Learning Student',
    email: 'aiml@example.com',
    password: 'password-hash',
    studentId: '0131CL231067',
  });
  await clStudent.validate();
  assert.equal(
    clStudent.branch,
    'Artificial Intelligence and Machine Learning (AIML)'
  );
  const csStudent = new User({
    name: 'Computer Science Student',
    email: 'cse@example.com',
    password: 'password-hash',
    studentId: '0131cs231067',
  });
  await csStudent.validate();
  assert.equal(csStudent.branch, 'Computer Science Engineering (CSE)');

  const originalFindOne = User.findOne;
  const studentPasswordHash = await hashPassword('student-password');
  User.findOne = (filter) => {
    return {
      select: async () => {
        if (filter.email !== undefined) {
          assert.equal(typeof filter.email, 'string');
          if (filter.email !== 'student@example.com') {
            return null;
          }
        } else if (filter.studentId !== undefined) {
          if (filter.studentId === '0131AD231067') {
            return {
              _id: '0123456789abcdef01234567',
              studentId: '0131AD231067',
              name: 'Test Student',
              email: 'student@example.com',
              role: 'student',
              password: studentPasswordHash,
            };
          }
          return null;
        } else {
          assert.fail('Expected a student ID or email lookup.');
        }
        return {
          _id: '0123456789abcdef01234567',
          studentId: '0131AD231067',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'student',
          password: studentPasswordHash,
        };
      },
    };
  };
  t.after(() => {
    User.findOne = originalFindOne;
  });

  const emailStudentLoginResponse = await fetch(
    `${baseUrl}/api/student/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ' Student@Example.com ',
        password: 'student-password',
      }),
    }
  );
  assert.equal(emailStudentLoginResponse.status, 200);
  assert.deepEqual(await emailStudentLoginResponse.json(), {
    success: true,
    student: {
      _id: '0123456789abcdef01234567',
      studentId: '0131AD231067',
      branch: 'Artificial Intelligence and Data Science (AIDS)',
      name: 'Test Student',
      email: 'student@example.com',
    },
  });

  const rollNumberLoginResponse = await fetch(
    `${baseUrl}/api/student/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: '0131AD231067',
        password: 'student-password',
      }),
    }
  );
  assert.equal(rollNumberLoginResponse.status, 200);
  assert.equal(
    (await rollNumberLoginResponse.json()).student.studentId,
    '0131AD231067'
  );

  const originalStudentProfileFindById = User.findById;
  const profileCourse = {
    _id: 'abcdef0123456789abcdef01',
    title: 'Profile course',
    description: 'Course description',
  };
  User.findById = (studentId) => {
    assert.equal(studentId, '0123456789abcdef01234567');
    const query = {
      select: (fields) => {
        assert.equal(
          fields,
          '_id studentId branch name email role assignedCourses'
        );
        return query;
      },
      populate: (options) => {
        assert.deepEqual(options, {
          path: 'assignedCourses',
          select: '_id title description',
        });
        return query;
      },
      lean: async () => ({
        _id: '0123456789abcdef01234567',
        studentId: '0131AD231067',
        name: 'Test Student',
        email: 'student@example.com',
        role: 'student',
        assignedCourses: [profileCourse],
      }),
    };
    return query;
  };
  try {
    const studentProfileResponse = await fetch(
      `${baseUrl}/api/student/me`,
      {
        headers: {
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
      }
    );
    assert.equal(studentProfileResponse.status, 200);
    assert.deepEqual(await studentProfileResponse.json(), {
      student: {
        _id: '0123456789abcdef01234567',
        studentId: '0131AD231067',
        branch: 'Artificial Intelligence and Data Science (AIDS)',
        name: 'Test Student',
        email: 'student@example.com',
        courses: [profileCourse],
        assignedCourses: ['abcdef0123456789abcdef01'],
        assignedCourseCount: 1,
      },
    });
  } finally {
    User.findById = originalStudentProfileFindById;
  }

  const invalidWeekResponse = await fetch(
    `${baseUrl}/api/student/courses/abcdef0123456789abcdef01/modules/8`,
    {
      headers: {
        Cookie: emailStudentLoginResponse.headers
          .get('set-cookie')
          .split(';')[0],
      },
    }
  );
  assert.equal(invalidWeekResponse.status, 400);
  assert.deepEqual(await invalidWeekResponse.json(), {
    error:
      'courseId must be a MongoDB ObjectId and weekIndex must be from 0 to 7.',
  });

  const invalidCourseIdResponse = await fetch(
    `${baseUrl}/api/student/courses/${encodeURIComponent('student@example.com')}/modules/0`,
    {
      headers: {
        Cookie: emailStudentLoginResponse.headers
          .get('set-cookie')
          .split(';')[0],
      },
    }
  );
  assert.equal(invalidCourseIdResponse.status, 400);
  assert.deepEqual(await invalidCourseIdResponse.json(), {
    error:
      'courseId must be a MongoDB ObjectId and weekIndex must be from 0 to 7.',
  });

  const malformedWeekIndexResponse = await fetch(
    `${baseUrl}/api/student/courses/abcdef0123456789abcdef01/modules/1.0`,
    {
      headers: {
        Cookie: emailStudentLoginResponse.headers
          .get('set-cookie')
          .split(';')[0],
      },
    }
  );
  assert.equal(malformedWeekIndexResponse.status, 400);
  assert.deepEqual(await malformedWeekIndexResponse.json(), {
    error:
      'courseId must be a MongoDB ObjectId and weekIndex must be from 0 to 7.',
  });

  const invalidWeekQuizResponse = await fetch(
    `${baseUrl}/api/student/courses/abcdef0123456789abcdef01/modules/8/quiz`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: emailStudentLoginResponse.headers
          .get('set-cookie')
          .split(';')[0],
      },
      body: JSON.stringify({ answers: [] }),
    }
  );
  assert.equal(invalidWeekQuizResponse.status, 400);
  assert.deepEqual(await invalidWeekQuizResponse.json(), {
    error:
      'courseId must be a MongoDB ObjectId, weekIndex must be from 0 to 7, and quiz answers must be integers.',
  });

  const invalidCourseQuizResponse = await fetch(
    `${baseUrl}/api/student/courses/${encodeURIComponent('custom-course-key')}/modules/0/quiz`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: emailStudentLoginResponse.headers
          .get('set-cookie')
          .split(';')[0],
      },
      body: JSON.stringify({ answers: [] }),
    }
  );
  assert.equal(invalidCourseQuizResponse.status, 400);
  assert.deepEqual(await invalidCourseQuizResponse.json(), {
    error:
      'courseId must be a MongoDB ObjectId, weekIndex must be from 0 to 7, and quiz answers must be integers.',
  });

  const originalUserFindById = User.findById;
  const originalCourseFindById = Course.findById;
  const originalProgressFindOne = Progress.findOne;
  const originalProgressFindOneAndUpdate = Progress.findOneAndUpdate;
  const moduleCourseId = 'abcdef0123456789abcdef01';
  const weeklyModule = {
    moduleIndex: 0,
    title: 'Week 1: Course basics',
    readingMaterial: 'Study the course basics.',
    defaultTask: 'Study the course basics.',
    contentSource: 'ai',
    lessons: [
      {
        day: 1,
        title: 'Introduction',
        content: 'Start with the fundamentals.',
        example: 'const answer = 42;',
      },
    ],
    quiz: [
      {
        question: 'Is this the first week?',
        options: ['No', 'Yes'],
        correctAnswer: 1,
      },
    ],
    toObject() {
      return {
        moduleIndex: this.moduleIndex,
        title: this.title,
        readingMaterial: this.readingMaterial,
        contentSource: this.contentSource,
        lessons: this.lessons,
        quiz: this.quiz,
      };
    },
  };
  const moduleCourse = {
    _id: moduleCourseId,
    title: 'Course basics',
    description: 'Learn the fundamentals.',
    modules: [
      weeklyModule,
      ...Array.from({ length: 7 }, (_, index) => ({
        moduleIndex: index + 1,
        title: `Week ${index + 2}`,
      })),
    ],
    save: async () => {},
  };
  User.findById = () => ({
    select: async () => ({
      _id: '0123456789abcdef01234567',
      role: 'student',
      assignedCourses: [
        { equals: (id) => id.toString() === moduleCourseId },
      ],
    }),
  });
  Course.findById = async () => moduleCourse;
  Progress.findOne = async () => ({ currentModuleIndex: 0 });
  try {
    for (const modulePath of [
      `/student/courses/${moduleCourseId}/modules/0`,
      `/api/student/courses/${moduleCourseId}/modules/0`,
    ]) {
      const moduleResponse = await fetch(`${baseUrl}${modulePath}`, {
        headers: {
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
      });
      assert.equal(moduleResponse.status, 200);
      const moduleBody = await moduleResponse.json();
      assert.equal(moduleBody.weekIndex, 0);
      assert.equal(moduleBody.module.title, 'Week 1: Course basics');
      assert.deepEqual(moduleBody.module.quiz, [
        {
          question: 'Is this the first week?',
          options: ['No', 'Yes'],
        },
      ]);
    }

    const missingWeekResponse = await fetch(
      `${baseUrl}/student/courses/${moduleCourseId}/modules/8`,
      {
        headers: {
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
      }
    );
    assert.equal(missingWeekResponse.status, 400);
    assert.deepEqual(await missingWeekResponse.json(), {
      error:
        'courseId must be a MongoDB ObjectId and weekIndex must be from 0 to 7.',
    });
  } finally {
    User.findById = originalUserFindById;
    Course.findById = originalCourseFindById;
    Progress.findOne = originalProgressFindOne;
  }

  User.findById = () => ({
    select: async () => ({
      _id: '0123456789abcdef01234567',
      role: 'student',
      assignedCourses: [],
    }),
  });
  Course.findById = async () => ({
    _id: 'abcdef0123456789abcdef01',
  });
  Progress.findOne = async () => null;
  Progress.findOneAndUpdate = () => {
    assert.fail('Progress must not be written for an unassigned course.');
  };
  try {
    const unassignedModuleResponse = await fetch(
      `${baseUrl}/api/student/courses/abcdef0123456789abcdef01/modules/0`,
      {
        headers: {
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
      }
    );
    assert.equal(unassignedModuleResponse.status, 403);
    assert.deepEqual(await unassignedModuleResponse.json(), {
      error: 'This course is not assigned to the student.',
    });
  } finally {
    User.findById = originalUserFindById;
    Course.findById = originalCourseFindById;
    Progress.findOne = originalProgressFindOne;
    Progress.findOneAndUpdate = originalProgressFindOneAndUpdate;
  }

  const courseObjectId = 'abcdef0123456789abcdef01';
  const progressBeforeQuiz = {
    currentModuleIndex: 0,
    completedWeeks: [],
    completedModuleIndices: [],
  };
  User.findById = () => ({
    select: async () => ({
      _id: '0123456789abcdef01234567',
      assignedCourses: [{ equals: (id) => id.toString() === courseObjectId }],
    }),
  });
  Course.findById = () => ({
    select: async () => ({
      _id: courseObjectId,
      modules: [
        {
          moduleIndex: 0,
          quiz: [
            {
              question: 'Which answer is correct?',
              options: ['No', 'Yes'],
              correctAnswer: 1,
            },
          ],
        },
      ],
    }),
  });
  Progress.findOne = async () => progressBeforeQuiz;
  Progress.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.currentModuleIndex, 0);
    assert.equal(update.$addToSet.completedWeeks, 0);
    assert.equal(update.$push.weekCompletionTimestamps.weekIndex, 0);
    assert.ok(update.$push.weekCompletionTimestamps.completedAt instanceof Date);
    const completedAt = update.$push.weekCompletionTimestamps.completedAt;
    return {
      ...progressBeforeQuiz,
      currentModuleIndex: 1,
      completedWeeks: [0],
      completedModuleIndices: [0],
      weekCompletionTimestamps: [{ weekIndex: 0, completedAt }],
    };
  };
  try {
    const quizResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/modules/0/quiz`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
        body: JSON.stringify({ answers: [1] }),
      }
    );
    assert.equal(quizResponse.status, 200);
    const quizBody = await quizResponse.json();
    assert.equal(quizBody.score, 100);
    assert.equal(quizBody.passed, true);
    assert.deepEqual(quizBody.completedWeeks, [0]);
    assert.equal(quizBody.currentWeekIndex, 1);
    const recordedCompletion = quizBody.progress.weekCompletionTimestamps[0];
    assert.equal(
      new Date(quizBody.nextWeekAvailableAt).getTime() -
        new Date(recordedCompletion.completedAt).getTime(),
      7 * 24 * 60 * 60 * 1000
    );

    const studentCookie = emailStudentLoginResponse.headers
      .get('set-cookie')
      .split(';')[0];
    User.findById = () => ({
      select: async () => ({
        _id: '0123456789abcdef01234567',
        studentId: '0131AD231067',
        name: 'Test Student',
        role: 'student',
        assignedCourses: [
          { equals: (id) => id.toString() === courseObjectId },
        ],
      }),
    });
    Course.findById = () => ({
      select: async () => ({ _id: courseObjectId, title: 'Course basics' }),
    });
    const fullyCompletedProgress = {
      completedWeeks: Array.from({ length: 8 }, (_, index) => index),
      completedModuleIndices: Array.from({ length: 8 }, (_, index) => index),
      completedAt: new Date('2026-11-11T00:00:00Z'),
      certificateIssued: false,
    };
    Progress.findOne = async () => fullyCompletedProgress;
    const revokedCertificateStatusResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/certificate/status`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(revokedCertificateStatusResponse.status, 200);
    assert.deepEqual(await revokedCertificateStatusResponse.json(), {
      certificateIssued: false,
      certificateStatus: 'In progress',
      certificateIssuedAt: null,
    });
    const notIssuedCertificateResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/certificate`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(notIssuedCertificateResponse.status, 403);

    fullyCompletedProgress.certificateIssued = true;
    const certificateResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/certificate`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(certificateResponse.status, 200);
    assert.match(
      certificateResponse.headers.get('content-type'),
      /application\/pdf/
    );
    const certificatePdf = Buffer.from(
      await certificateResponse.arrayBuffer()
    ).toString('ascii');
    assert.match(certificatePdf, /^%PDF-1\.4/);
    assert.match(certificatePdf, /\/MediaBox \[0 0 612 792\]/);
    assert.match(
      certificatePdf,
      /0\.05882353 0\.16862745 0\.36078431 RG 4 w 28 28 556 736 re S/
    );
    assert.match(
      certificatePdf,
      /0\.94117647 0\.95686275 0\.97647059 rg 78 482 456 50 re f/
    );
    assert.match(certificatePdf, /q 1 0 0 1 0 -18 cm/);
    assert.match(
      certificatePdf,
      /BT \/F2 13 Tf .* 1 0 0 1 .* 744 Tm \(JNCT\) Tj ET/
    );
    assert.match(certificatePdf, /\(JNCT\) Tj/);
    assert.match(certificatePdf, /\(LNCT GROUP OF COLLEGE\) Tj/);
    assert.match(certificatePdf, /\(ONLINE COURSE COMPLETION\) Tj/);
    assert.match(certificatePdf, /\(CERTIFICATE OF COMPLETION\) Tj/);
    assert.match(certificatePdf, /\(This certificate is proudly presented to\) Tj/);
    assert.match(certificatePdf, /\(TEST STUDENT\) Tj/);
    assert.match(certificatePdf, /\(Enrollment Number: 0131AD231067\) Tj/);
    assert.match(certificatePdf, /Computer Science & Engineering/);
    assert.match(certificatePdf, /Artificial Intelligence & Data Science/);
    assert.match(certificatePdf, /\(COURSE TITLE\) Tj/);
    assert.match(certificatePdf, /\(COURSE BASICS\) Tj/);
    assert.match(certificatePdf, /\(Course Duration\) Tj/);
    assert.match(certificatePdf, /\(8 Weeks\) Tj/);
    assert.match(certificatePdf, /\(Course Mode\) Tj/);
    assert.match(certificatePdf, /\(Online\) Tj/);
    assert.match(certificatePdf, /\(Issue Date\) Tj/);
    assert.match(certificatePdf, /\(11 November 2026\) Tj/);
    assert.match(certificatePdf, /\(Institution\) Tj/);
    assert.match(certificatePdf, /\(JNCT, Bhopal\) Tj/);
    assert.match(certificatePdf, /We appreciate the dedication/);
    assert.match(certificatePdf, /\(Prof. Ravinder Tanwar\) Tj/);
    assert.match(certificatePdf, /\(AUTHORIZED SIGNATORY\) Tj/);
    assert.ok(certificatePdf.includes('HOD, CSE \\(AI&DS\\)'));
    assert.ok(
      certificatePdf.indexOf('(Prof. Ravinder Tanwar)') <
        certificatePdf.indexOf('(AUTHORIZED SIGNATORY)')
    );
    assert.ok(
      certificatePdf.indexOf('(AUTHORIZED SIGNATORY)') <
        certificatePdf.indexOf('HOD, CSE \\(AI&DS\\)')
    );
    assert.ok(
      certificatePdf.indexOf('HOD, CSE \\(AI&DS\\)') <
        certificatePdf.lastIndexOf('(JNCT, Bhopal)')
    );
    assert.match(
      certificatePdf,
      /0\.55 0\.58 0\.62 RG 0\.7 w 392 140 m 536 140 l S Q/
    );
    assert.doesNotMatch(
      certificatePdf,
      /Verified Online Certification|JNCT Completions Portal/
    );

    Progress.findOne = async () => ({
      completedWeeks: [0, 1, 2, 3, 4, 5, 6],
      completedModuleIndices: [0, 1, 2, 3, 4, 5, 6],
      certificateIssued: false,
    });
    const incompleteCertificateResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/certificate`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(incompleteCertificateResponse.status, 403);

    Progress.findOne = async () => ({
      completedWeeks: [0],
      completedModuleIndices: [0],
      certificateIssued: true,
      certificateIssuedAt: new Date(),
    });
    const adminIssuedCertificateResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/certificate`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(adminIssuedCertificateResponse.status, 200);
    assert.match(
      adminIssuedCertificateResponse.headers.get('content-type'),
      /application\/pdf/
    );

    const recentCompletion = new Date(Date.now() - 24 * 60 * 60 * 1000);
    Progress.findOne = async () => ({
      currentModuleIndex: 1,
      completedWeeks: [0],
      completedModuleIndices: [0],
      weekCompletionTimestamps: [
        { weekIndex: 0, completedAt: recentCompletion },
      ],
    });
    const lockedCourseQuery = {
      select: async () => moduleCourse,
      then: (resolve, reject) => Promise.resolve(moduleCourse).then(resolve, reject),
    };
    Course.findById = () => lockedCourseQuery;
    Progress.findOneAndUpdate = () => {
      assert.fail('A quiz must not be evaluated before the seven-day wait ends.');
    };
    const lockedModuleResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/modules/1`,
      { headers: { Cookie: studentCookie } }
    );
    assert.equal(lockedModuleResponse.status, 403);
    const lockedModuleBody = await lockedModuleResponse.json();
    assert.equal(
      new Date(lockedModuleBody.nextAvailableAt).getTime() -
        recentCompletion.getTime(),
      7 * 24 * 60 * 60 * 1000
    );
    const lockedQuizResponse = await fetch(
      `${baseUrl}/api/student/courses/${courseObjectId}/modules/1/quiz`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: studentCookie,
        },
        body: JSON.stringify({ answers: [1] }),
      }
    );
    assert.equal(lockedQuizResponse.status, 403);
    assert.match(
      (await lockedQuizResponse.json()).error,
      /seven days after completing the previous week/
    );
  } finally {
    User.findById = originalUserFindById;
    Course.findById = originalCourseFindById;
    Progress.findOne = originalProgressFindOne;
    Progress.findOneAndUpdate = originalProgressFindOneAndUpdate;
  }

  const nonObjectIdStudentLoginResponse = await fetch(
    `${baseUrl}/api/student/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'custom-student-id',
        password: 'student-password',
      }),
    }
  );
  assert.equal(nonObjectIdStudentLoginResponse.status, 401);
  assert.deepEqual(await nonObjectIdStudentLoginResponse.json(), {
    error: 'Invalid student ID or password.',
  });

  const unauthorizedStudentDashboardResponse = await fetch(
    `${baseUrl}/api/student/dashboard`
  );
  assert.equal(unauthorizedStudentDashboardResponse.status, 401);

  const unauthorizedRecordsResponse = await fetch(
    `${baseUrl}/api/admin/records`
  );
  assert.equal(unauthorizedRecordsResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'route-test-admin@example.com',
      password: 'route-test-password',
    }),
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get('set-cookie').split(';')[0];

  const dashboardCourseId = 'abcdef0123456789abcdef01';
  const dashboardModules = Array.from({ length: 8 }, (_, moduleIndex) => ({
    moduleIndex,
    title: `Week ${moduleIndex + 1}`,
    lessons: [],
    quiz: [],
    toObject() {
      return {
        moduleIndex: this.moduleIndex,
        title: this.title,
        lessons: this.lessons,
        quiz: this.quiz,
      };
    },
  }));
  const dashboardCourse = {
    _id: dashboardCourseId,
    title: 'Dashboard course',
    description: 'Course description',
    modules: dashboardModules,
    createdAt: new Date(),
    toObject() {
      return {
        _id: this._id,
        title: this.title,
        description: this.description,
        modules: this.modules,
      };
    },
  };
  const originalDashboardUserFindById = User.findById;
  const originalDashboardCourseFind = Course.find;
  const originalDashboardProgressFindOneAndUpdate =
    Progress.findOneAndUpdate;
  User.findById = () => {
    const query = {
      select: () => query,
      populate: async (options) => {
        assert.deepEqual(options, {
          path: 'assignedCourses',
          select: '_id title description modules',
        });
        return {
          _id: '0123456789abcdef01234567',
          studentId: '0131AD231067',
          branch: 'Artificial Intelligence and Data Science (AIDS)',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'student',
          assignedCourses: [dashboardCourseId],
        };
      },
    };
    return query;
  };
  Course.find = (filter) => {
    assert.deepEqual(filter, { _id: { $in: [dashboardCourseId] } });
    return {
      select: async (fields) => {
        assert.equal(fields, '_id title description modules');
        return [dashboardCourse];
      },
    };
  };
  Progress.findOneAndUpdate = (filter) => {
    assert.deepEqual(filter, {
      studentId: '0123456789abcdef01234567',
      courseId: dashboardCourseId,
    });
    return {
      lean: async () => ({
        studentId: '0123456789abcdef01234567',
        courseId: dashboardCourseId,
        currentModuleIndex: 0,
        completedWeeks: [],
        completedModuleIndices: [],
        certificateIssued: false,
      }),
    };
  };
  try {
    const dashboardResponse = await fetch(
      `${baseUrl}/api/student/dashboard`,
      {
        headers: {
          Cookie: emailStudentLoginResponse.headers
            .get('set-cookie')
            .split(';')[0],
        },
      }
    );
    assert.equal(dashboardResponse.status, 200);
    const dashboardBody = await dashboardResponse.json();
    assert.equal(dashboardBody.courses.length, 1);
    assert.equal(dashboardBody.courses[0]._id, dashboardCourseId);
    assert.equal(dashboardBody.student.courses.length, 1);
    assert.deepEqual(dashboardBody.student.assignedCourses, [dashboardCourseId]);
    assert.equal(dashboardBody.student.assignedCourseCount, 1);
    assert.equal(
      dashboardBody.student.courses[0].progress.certificateIssued,
      false
    );
    assert.equal(
      dashboardBody.student.courses[0].progress.certificateStatus,
      'In progress'
    );
  } finally {
    User.findById = originalDashboardUserFindById;
    Course.find = originalDashboardCourseFind;
    Progress.findOneAndUpdate = originalDashboardProgressFindOneAndUpdate;
  }

  const originalStudentFind = User.find;
  const originalStudentFindOne = User.findOne;
  const originalRecordsCourseFind = Course.find;
  const originalRecordsProgressFind = Progress.find;
  User.find = (filter) => ({
    select(fields) {
      assert.equal(filter.role, 'student');
      assert.equal(fields, '_id studentId branch name email assignedCourses');
      assert.doesNotMatch(fields, /password/i);
      return {
        sort: () => ({
          lean: async () => [
            {
              _id: '0123456789abcdef01234567',
              studentId: '0131AD231067',
              branch:
                'Artificial Intelligence and Data Science (AIDS)',
              name: 'Test Student',
              email: 'student@example.com',
              assignedCourses: ['abcdef0123456789abcdef01'],
            },
          ],
        }),
      };
    },
  });
  Course.find = () => ({
    select: () => ({
      sort: () => ({
        lean: async () => [
          { _id: 'abcdef0123456789abcdef01', title: 'Course basics' },
        ],
      }),
    }),
  });
  Progress.find = (filter) => {
    assert.deepEqual(filter, {
      studentId: { $in: ['0123456789abcdef01234567'] },
    });
    return {
      select: (fields) => {
        assert.match(fields, /completedWeeks/);
        return {
          lean: async () => [
            {
              studentId: '0123456789abcdef01234567',
              courseId: 'abcdef0123456789abcdef01',
              currentModuleIndex: 8,
              completedWeeks: [],
              completedModuleIndices: [],
              courseCompleted: false,
            },
          ],
        };
      },
    };
  };
  try {
    const recordsResponse = await fetch(`${baseUrl}/api/admin/records`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(recordsResponse.status, 200);
    const recordsBody = await recordsResponse.json();
    assert.deepEqual(recordsBody.students, [
      {
        _id: '0123456789abcdef01234567',
        studentId: '0131AD231067',
        branch:
          'Artificial Intelligence and Data Science (AIDS)',
        name: 'Test Student',
        email: 'student@example.com',
        assignedCourses: ['abcdef0123456789abcdef01'],
        courseProgress: [
          {
            courseId: 'abcdef0123456789abcdef01',
            completedWeeks: [0, 1, 2, 3, 4, 5, 6, 7],
            completedWeekCount: 8,
            courseCompleted: true,
            certificateIssued: false,
            certificateStatus: 'In progress',
            certificateIssuedAt: null,
          },
        ],
      },
    ]);
    assert.equal(Object.hasOwn(recordsBody.students[0], 'password'), false);
  } finally {
    User.find = originalStudentFind;
    Course.find = originalRecordsCourseFind;
    Progress.find = originalRecordsProgressFind;
  }

  const originalIssueUserFindOne = User.findOne;
  const originalIssueProgressFindOneAndUpdate =
    Progress.findOneAndUpdate;
  let issueStudentFilter;
  let issueProgressFilter;
  let issueProgressUpdate;
  User.findOne = (filter) => {
    issueStudentFilter = filter;
    return {
      select: async () => ({ _id: filter._id }),
    };
  };
  Progress.findOneAndUpdate = async (filter, update) => {
    issueProgressFilter = filter;
    issueProgressUpdate = update;
    return {
      ...filter,
      ...update.$set,
    };
  };
  try {
    const issueResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01/certificate`,
      {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      }
    );
    assert.equal(issueResponse.status, 200);
    assert.equal((await issueResponse.json()).certificateIssued, true);
    assert.deepEqual(issueStudentFilter, {
      _id: '0123456789abcdef01234567',
      role: 'student',
      assignedCourses: 'abcdef0123456789abcdef01',
    });
    assert.deepEqual(issueProgressFilter, {
      studentId: '0123456789abcdef01234567',
      courseId: 'abcdef0123456789abcdef01',
    });
    assert.equal(issueProgressUpdate.$set.certificateIssued, true);
    assert.equal(issueProgressUpdate.$set.courseCompleted, true);
    assert.equal(issueProgressUpdate.$set.currentModuleIndex, 8);
    assert.deepEqual(issueProgressUpdate.$set.completedWeeks, [
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    assert.ok(issueProgressUpdate.$set.certificateIssuedAt instanceof Date);

    const revokeResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01/certificate`,
      {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ certificateIssued: false }),
      }
    );
    assert.equal(revokeResponse.status, 200);
    assert.equal((await revokeResponse.json()).certificateIssued, false);
    assert.equal(issueProgressUpdate.$set.certificateIssued, false);
    assert.equal(issueProgressUpdate.$set.courseCompleted, false);
    assert.equal(issueProgressUpdate.$set.currentModuleIndex, 0);
    assert.deepEqual(issueProgressUpdate.$set.completedWeeks, []);
    assert.deepEqual(issueProgressUpdate.$set.completedModuleIndices, []);
    assert.deepEqual(issueProgressUpdate.$set.weekCompletionTimestamps, []);
    assert.equal(issueProgressUpdate.$set.completedAt, null);
    assert.equal(issueProgressUpdate.$set.certificateIssuedAt, null);
  } finally {
    User.findOne = originalIssueUserFindOne;
    Progress.findOneAndUpdate = originalIssueProgressFindOneAndUpdate;
  }

  let studentLookupCount = 0;
  let updatedStudent;
  User.findOne = async (filter) => {
    studentLookupCount += 1;
    assert.deepEqual(filter, {
      _id: '0123456789abcdef01234567',
      role: 'student',
    });
    updatedStudent = {
      _id: '0123456789abcdef01234567',
      role: 'student',
      password: 'old-password-hash',
      save: async () => {},
    };
    return updatedStudent;
  };
  try {
    const shortPasswordResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567/password`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ password: 'too-short' }),
      }
    );
    assert.equal(shortPasswordResponse.status, 400);
    assert.deepEqual(await shortPasswordResponse.json(), {
      error: 'The new password must be at least 12 characters long.',
    });
    assert.equal(studentLookupCount, 0);

    const passwordUpdateResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567/password`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ password: 'new-secure-password' }),
      }
    );
    assert.equal(passwordUpdateResponse.status, 200);
    const passwordUpdateBody = await passwordUpdateResponse.json();
    assert.deepEqual(passwordUpdateBody, {
      success: true,
      message: 'Student password updated successfully.',
      studentId: '0123456789abcdef01234567',
    });
    assert.equal(Object.hasOwn(passwordUpdateBody, 'password'), false);
    assert.equal(studentLookupCount, 1);
    assert.notEqual(updatedStudent.password, 'new-secure-password');
    assert.equal(
      await verifyPassword('new-secure-password', updatedStudent.password),
      true
    );
  } finally {
    User.findOne = originalStudentFindOne;
  }

  const originalStartSession = mongoose.startSession;
  const originalStudentDeleteOne = User.deleteOne;
  const originalProgressDeleteMany = Progress.deleteMany;
  let deletedStudentFilter;
  let deletedProgressFilter;
  let transactionSession;
  let sessionEnded = false;
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => {
      await callback();
    },
    endSession: async () => {
      sessionEnded = true;
    },
  });
  User.deleteOne = async (filter, options) => {
    deletedStudentFilter = filter;
    transactionSession = options.session;
    return { deletedCount: 1 };
  };
  Progress.deleteMany = async (filter, options) => {
    deletedProgressFilter = filter;
    assert.equal(options.session, transactionSession);
    return { deletedCount: 3 };
  };
  try {
    const invalidDeleteResponse = await fetch(
      `${baseUrl}/api/admin/students/not-an-object-id`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(invalidDeleteResponse.status, 400);

    const deleteResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), {
      success: true,
      message: 'Student and associated progress deleted successfully.',
      studentId: '0123456789abcdef01234567',
    });
    assert.deepEqual(deletedStudentFilter, {
      _id: '0123456789abcdef01234567',
      role: 'student',
    });
    assert.deepEqual(deletedProgressFilter, {
      studentId: '0123456789abcdef01234567',
    });
    assert.equal(sessionEnded, true);
  } finally {
    mongoose.startSession = originalStartSession;
    User.deleteOne = originalStudentDeleteOne;
    Progress.deleteMany = originalProgressDeleteMany;
  }

  const originalCourseDeleteOne = Course.deleteOne;
  const originalCourseProgressDeleteMany = Progress.deleteMany;
  const originalAssignedCourseUpdateMany = User.updateMany;
  const originalCourseDeleteStartSession = mongoose.startSession;
  let deletedCourseFilter;
  let courseProgressFilter;
  let assignedCourseFilter;
  let courseDeletionSession;
  let courseDeletionSessionEnded = false;
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => {
      await callback();
    },
    endSession: async () => {
      courseDeletionSessionEnded = true;
    },
  });
  Course.deleteOne = async (filter, options) => {
    deletedCourseFilter = filter;
    courseDeletionSession = options.session;
    return { deletedCount: 1 };
  };
  Progress.deleteMany = async (filter, options) => {
    courseProgressFilter = filter;
    assert.equal(options.session, courseDeletionSession);
    return { deletedCount: 2 };
  };
  User.updateMany = async (filter, update, options) => {
    assignedCourseFilter = { filter, update };
    assert.equal(options.session, courseDeletionSession);
    return { modifiedCount: 1 };
  };
  try {
    const invalidCourseDeleteResponse = await fetch(
      `${baseUrl}/api/admin/courses/not-an-object-id`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(invalidCourseDeleteResponse.status, 400);

    const courseDeleteResponse = await fetch(
      `${baseUrl}/api/admin/courses/abcdef0123456789abcdef01`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(courseDeleteResponse.status, 200);
    assert.deepEqual(await courseDeleteResponse.json(), {
      success: true,
      message: 'Course and associated progress deleted successfully.',
      courseId: 'abcdef0123456789abcdef01',
    });
    assert.deepEqual(deletedCourseFilter, {
      _id: 'abcdef0123456789abcdef01',
    });
    assert.deepEqual(courseProgressFilter, {
      courseId: 'abcdef0123456789abcdef01',
    });
    assert.deepEqual(assignedCourseFilter, {
      filter: { assignedCourses: 'abcdef0123456789abcdef01' },
      update: { $pull: { assignedCourses: 'abcdef0123456789abcdef01' } },
    });
    assert.equal(courseDeletionSessionEnded, true);
  } finally {
    Course.deleteOne = originalCourseDeleteOne;
    Progress.deleteMany = originalCourseProgressDeleteMany;
    User.updateMany = originalAssignedCourseUpdateMany;
    mongoose.startSession = originalCourseDeleteStartSession;
  }

  const originalUnassignStartSession = mongoose.startSession;
  const originalUnassignUpdateOne = User.updateOne;
  const originalUnassignProgressDeleteMany = Progress.deleteMany;
  let unassignSessionEnded = false;
  let unassignFilter;
  let unassignUpdate;
  let unassignProgressFilter;
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => {
      await callback();
    },
    endSession: async () => {
      unassignSessionEnded = true;
    },
  });
  User.updateOne = async (filter, update) => {
    unassignFilter = filter;
    unassignUpdate = update;
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Progress.deleteMany = async (filter) => {
    unassignProgressFilter = filter;
    return { deletedCount: 1 };
  };
  try {
    const invalidUnassignResponse = await fetch(
      `${baseUrl}/api/admin/students/not-an-id/courses/abcdef0123456789abcdef01`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(invalidUnassignResponse.status, 400);

    const unassignResponse = await fetch(
      `${baseUrl}/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01`,
      { method: 'DELETE', headers: { Cookie: sessionCookie } }
    );
    assert.equal(unassignResponse.status, 200);
    assert.deepEqual(await unassignResponse.json(), {
      success: true,
      message: 'Course unassigned and student progress removed successfully.',
      studentId: '0123456789abcdef01234567',
      courseId: 'abcdef0123456789abcdef01',
    });
    assert.deepEqual(unassignFilter, {
      _id: '0123456789abcdef01234567',
      role: 'student',
    });
    assert.deepEqual(unassignUpdate, {
      $pull: { assignedCourses: 'abcdef0123456789abcdef01' },
    });
    assert.deepEqual(unassignProgressFilter, {
      studentId: '0123456789abcdef01234567',
      courseId: 'abcdef0123456789abcdef01',
    });
    assert.equal(unassignSessionEnded, true);
  } finally {
    mongoose.startSession = originalUnassignStartSession;
    User.updateOne = originalUnassignUpdateOne;
    Progress.deleteMany = originalUnassignProgressDeleteMany;
  }

  const assignCourseResponse = await fetch(
    `${baseUrl}/api/admin/assign-course`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        studentId: '0131AD231067',
        courseId: '12345',
      }),
    }
  );
  assert.equal(assignCourseResponse.status, 400);
  assert.deepEqual(await assignCourseResponse.json(), {
    error:
      'courseId must be a 24-character hexadecimal MongoDB ObjectId.',
    details: {
      courseId:
        'courseId must be a 24-character hexadecimal MongoDB ObjectId.',
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/assign-custom-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      studentId: 'invalid-id',
      courseId: '0123456789abcdef01234567',
      customTask: '   ',
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error:
      'A non-empty customTask is required.',
    details: {
      customTask: 'A non-empty customTask is required.',
    },
  });

  const missingCreationDetailsResponse = await fetch(
    `${baseUrl}/api/admin/assign-custom-task`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ customTask: 'Complete an extra exercise.' }),
    }
  );
  assert.equal(missingCreationDetailsResponse.status, 400);
  assert.deepEqual(await missingCreationDetailsResponse.json(), {
    error:
      'newStudentName, newStudentEmail, and newStudentPassword are required when creating a student. newCourseTitle is required when courseId is omitted.',
    details: {
      student:
        'newStudentName, newStudentEmail, and newStudentPassword are required when creating a student.',
      course: 'newCourseTitle is required when courseId is omitted.',
    },
  });

  const originalCourseFindOne = Course.findOne;
  const originalUserCreate = User.create;
  const originalDuplicateUserUpdateOne = User.updateOne;
  const originalDuplicateProgressUpdate = Progress.findOneAndUpdate;
  const reusedCourse = {
    _id: 'abcdef0123456789abcdef01',
    title: 'Existing Course',
    description: 'Existing course description',
    modules: Array.from({ length: 8 }, (_, moduleIndex) => ({
      moduleIndex,
      defaultTask: 'Complete the course work.',
    })),
  };
  const duplicateFlowStudent = {
    _id: '0123456789abcdef01234567',
    studentId: '0131AD231067',
    role: 'student',
  };
  let duplicateFlowAssignment;
  Course.findOne = async (filter) => {
    assert.deepEqual(filter, { title: 'Existing Course' });
    return reusedCourse;
  };
  User.create = async () => duplicateFlowStudent;
  User.updateOne = async (filter, update) => {
    duplicateFlowAssignment = { filter, update };
    return { modifiedCount: 1 };
  };
  Progress.findOneAndUpdate = async (filter) => ({
    studentId: filter.studentId,
    courseId: filter.courseId,
  });
  try {
    const duplicateCourseResponse = await fetch(
      `${baseUrl}/api/admin/assign-custom-task`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          newStudentName: 'New Student',
          newStudentEmail: 'new-student@example.com',
          newStudentPassword: 'new-student-password',
          newCourseTitle: ' Existing Course ',
          customTask: 'Complete an extra exercise.',
        }),
      }
    );
    assert.equal(duplicateCourseResponse.status, 200);
    const duplicateCourseBody = await duplicateCourseResponse.json();
    assert.equal(duplicateCourseBody.courseId, reusedCourse._id);
    assert.deepEqual(duplicateFlowAssignment, {
      filter: { _id: duplicateFlowStudent._id },
      update: { $addToSet: { assignedCourses: reusedCourse._id } },
    });
  } finally {
    Course.findOne = originalCourseFindOne;
    User.create = originalUserCreate;
    User.updateOne = originalDuplicateUserUpdateOne;
    Progress.findOneAndUpdate = originalDuplicateProgressUpdate;
  }

  const originalAssignFindOne = User.findOne;
  const originalAssignCourseFindById = Course.findById;
  const originalAssignUserUpdateOne = User.updateOne;
  const originalAssignProgressFindOneAndUpdate =
    Progress.findOneAndUpdate;
  const assignedStudent = {
    _id: '0123456789abcdef01234567',
    studentId: '0131AD231067',
    role: 'student',
  };
  const assignableCourse = {
    _id: 'abcdef0123456789abcdef01',
    title: 'Existing Course',
    description: 'Course description',
    modules: Array.from({ length: 8 }, (_, moduleIndex) => ({
      moduleIndex,
      defaultTask: 'Complete the course work.',
    })),
  };
  let assignedStudentFilter;
  let assignedStudentUpdateFilter;
  let createdProgressFilter;
  User.findOne = async (filter) => {
    assert.deepEqual(filter, { studentId: '0131AD231067' });
    assignedStudentFilter = filter;
    return assignedStudent;
  };
  Course.findById = async (courseId) => {
    assert.equal(courseId, 'abcdef0123456789abcdef01');
    return assignableCourse;
  };
  User.updateOne = async (filter, update) => {
    assignedStudentUpdateFilter = { filter, update };
    return { modifiedCount: 1 };
  };
  Progress.findOneAndUpdate = async (filter) => {
    createdProgressFilter = filter;
    return { studentId: assignedStudent._id, courseId: assignableCourse._id };
  };
  try {
    const customIdAssignmentResponse = await fetch(
      `${baseUrl}/api/admin/assign-course`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          studentId: '0131AD231067',
          courseId: 'abcdef0123456789abcdef01',
        }),
      }
    );
    assert.equal(customIdAssignmentResponse.status, 200);
    assert.equal((await customIdAssignmentResponse.json()).success, true);
    assert.deepEqual(assignedStudentFilter, {
      studentId: '0131AD231067',
    });
    assert.deepEqual(assignedStudentUpdateFilter, {
      filter: { _id: assignedStudent._id },
      update: { $addToSet: { assignedCourses: assignableCourse._id } },
    });
    assert.deepEqual(createdProgressFilter, {
      studentId: assignedStudent._id,
      courseId: assignableCourse._id,
    });
  } finally {
    User.findOne = originalAssignFindOne;
    Course.findById = originalAssignCourseFindById;
    User.updateOne = originalAssignUserUpdateOne;
    Progress.findOneAndUpdate = originalAssignProgressFindOneAndUpdate;
  }

  const originalLegacyAssignFindOne = User.findOne;
  const originalLegacyAssignCourseFindById = Course.findById;
  const originalLegacyAssignUserUpdateOne = User.updateOne;
  const originalLegacyAssignProgressUpdate =
    Progress.findOneAndUpdate;
  let legacyLookupFilter;
  User.findOne = async (filter) => {
    legacyLookupFilter = filter;
    return assignedStudent;
  };
  Course.findById = async () => assignableCourse;
  User.updateOne = async () => ({ modifiedCount: 1 });
  Progress.findOneAndUpdate = async () => ({
    studentId: assignedStudent._id,
    courseId: assignableCourse._id,
  });
  try {
    const legacyIdAssignmentResponse = await fetch(
      `${baseUrl}/api/admin/assign-course`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          studentId: assignedStudent._id,
          courseId: 'abcdef0123456789abcdef01',
        }),
      }
    );
    assert.equal(legacyIdAssignmentResponse.status, 200);
    assert.deepEqual(legacyLookupFilter, {
      $or: [
        { studentId: assignedStudent._id },
        { _id: assignedStudent._id },
      ],
    });
  } finally {
    User.findOne = originalLegacyAssignFindOne;
    Course.findById = originalLegacyAssignCourseFindById;
    User.updateOne = originalLegacyAssignUserUpdateOne;
    Progress.findOneAndUpdate = originalLegacyAssignProgressUpdate;
  }

  const originalCreateStudentFindOne = User.findOne;
  const originalCreateStudentCourseFindById = Course.findById;
  const originalCreateStudentUserCreate = User.create;
  const originalCreateStudentUserUpdateOne = User.updateOne;
  const originalCreateStudentProgressUpdate =
    Progress.findOneAndUpdate;
  let createdStudentInput;
  const createdStudent = {
    _id: '0123456789abcdef01234567',
    studentId: '0131AD231067',
    role: 'student',
  };
  User.findOne = async (filter) => {
    assert.deepEqual(filter, { studentId: '0131AD231067' });
    return null;
  };
  Course.findById = async () => assignableCourse;
  User.create = async (studentInput) => {
    createdStudentInput = studentInput;
    return createdStudent;
  };
  User.updateOne = async () => ({ modifiedCount: 1 });
  Progress.findOneAndUpdate = async () => ({
    studentId: createdStudent._id,
    courseId: assignableCourse._id,
  });
  try {
    const createStudentResponse = await fetch(
      `${baseUrl}/api/admin/assign-custom-task`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          studentId: '0131AD231067',
          courseId: 'abcdef0123456789abcdef01',
          newStudentName: 'New Student',
          newStudentEmail: 'new-student@example.com',
          newStudentPassword: 'new-student-password',
          customTask: 'Complete an extra exercise.',
        }),
      }
    );
    assert.equal(createStudentResponse.status, 200);
    const createStudentBody = await createStudentResponse.json();
    assert.equal(createStudentBody.studentId, '0131AD231067');
    assert.equal(createStudentBody.studentObjectId, createdStudent._id);
    assert.equal(createdStudentInput.studentId, '0131AD231067');
    assert.equal(createdStudentInput.name, 'New Student');
  } finally {
    User.findOne = originalCreateStudentFindOne;
    Course.findById = originalCreateStudentCourseFindById;
    User.create = originalCreateStudentUserCreate;
    User.updateOne = originalCreateStudentUserUpdateOne;
    Progress.findOneAndUpdate = originalCreateStudentProgressUpdate;
  }
});
