import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentAssignmentPortal from './StudentAssignmentPortal';

const originalFetch = global.fetch;
const originalCreateObjectURL = window.URL.createObjectURL;
const originalRevokeObjectURL = window.URL.revokeObjectURL;
const courseId = '0123456789abcdef01234567';
const firstModule = {
  moduleIndex: 0,
  title: 'Week 1: Python Basics',
  readingMaterial: 'Study variables, values, and expressions.',
  contentSource: 'ai',
  lessons: [
    { day: 1, title: 'Values', content: 'Use values to represent data.' },
  ],
  quiz: [
    {
      question: 'Which keyword defines a function in Python?',
      options: ['func', 'def'],
    },
  ],
  defaultTask: 'Create a small Python program.',
};
const course = {
  _id: courseId,
  title: 'Python Basics',
  modules: Array.from({ length: 8 }, (_, moduleIndex) =>
    moduleIndex === 0
      ? firstModule
      : {
          moduleIndex,
          title: `Week ${moduleIndex + 1}: Python Basics`,
          readingMaterial: 'Study the course material.',
          contentSource: 'starter',
          lessons: [],
          quiz: [],
          defaultTask: 'Complete a course exercise.',
        }
  ),
  progress: {
    currentModuleIndex: 0,
    completedModuleIndices: [],
    courseCompleted: false,
    customTaskOverride: null,
    quizAttempts: [],
    submissions: [],
  },
};

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalCreateObjectURL) {
    window.URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete window.URL.createObjectURL;
  }
  if (originalRevokeObjectURL) {
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  } else {
    delete window.URL.revokeObjectURL;
  }
});

test('loads course materials and submits quiz answers through the student session', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      apiResponse({
        student: { name: 'Student', email: 'student@example.com' },
        courses: [course],
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        weekIndex: 0,
        unlockStatus: {
          isUnlocked: true,
          isCompleted: false,
          currentWeekIndex: 0,
        },
        module: {
          ...firstModule,
          lessons: [
            {
              day: 1,
              title: 'Values',
              content: 'Use values to represent data.',
              example: 'name = "Ada"',
            },
          ],
        },
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        success: true,
        score: 100,
        passed: true,
        correctCount: 1,
        questionCount: 1,
        message: 'Quiz passed. Great work!',
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        student: { name: 'Student', email: 'student@example.com' },
        courses: [
          {
            ...course,
            progress: {
              ...course.progress,
              currentModuleIndex: 1,
              completedModuleIndices: [0],
              completedWeeks: [0],
              nextWeekAvailableAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
              quizAttempts: [{ moduleIndex: 0, score: 100, passed: true }],
            },
          },
        ],
      })
    );
  global.fetch = fetchMock;

  render(<StudentAssignmentPortal />);

  expect(
    await screen.findByRole('heading', { name: 'Your assigned courses' })
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open course: Python Basics' })
  );
  expect(
    await screen.findByRole('heading', { name: 'Week 1: Python Basics' })
  ).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Eight-week syllabus' }))
    .toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Week 8: Python Basics/ })).toBeDisabled();
  expect(
    screen.getByRole('region', { name: 'Course completion certificate' })
  ).toContainElement(
    screen.getByRole('button', { name: 'In progress' })
  );
  expect(
    screen.queryByRole('link', { name: 'Download Certificate' })
  ).not.toBeInTheDocument();
  expect(
    await screen.findByText('Gemini AI-generated teaching material and explanations')
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Repository or demo URL')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Submit quiz' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }));
  expect(screen.getByText('name = "Ada"')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/student/courses/${courseId}/modules/0`,
    undefined
  );
  fireEvent.click(screen.getByLabelText('def'));
  fireEvent.click(screen.getByRole('button', { name: 'Submit quiz' }));

  expect(await screen.findByText(/Quiz passed\. Great work!/)).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'Week 1: Python Basics' })
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Week 2 unlocks on/)
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Week 2: Python Basics/ })
  ).toBeDisabled();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/student/courses/${courseId}/modules/0/quiz`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ answers: [1] }),
      })
    );
  });
});

test('uses the student course list fallback and displays the assigned course count', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(
    apiResponse({
      student: {
        name: 'Student',
        email: 'student@example.com',
        courses: [course],
      },
      courses: [],
    })
  );

  render(<StudentAssignmentPortal />);

  expect(
    await screen.findByRole('heading', { name: 'Your assigned courses' })
  ).toBeInTheDocument();
  expect(screen.getByText('1 course')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Python Basics' })).toBeInTheDocument();
  expect(screen.queryByText('No courses assigned yet')).not.toBeInTheDocument();
});

test('keeps certificate download locked until an admin issues it', async () => {
  const completedCourse = {
    ...course,
    progress: {
      ...course.progress,
      currentModuleIndex: 8,
      completedWeeks: Array.from({ length: 8 }, (_, index) => index),
      completedModuleIndices: Array.from({ length: 8 }, (_, index) => index),
      courseCompleted: true,
    },
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      apiResponse({
        student: { name: 'Student', email: 'student@example.com' },
        courses: [completedCourse],
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        weekIndex: 7,
        unlockStatus: {
          isUnlocked: true,
          isCompleted: true,
          currentWeekIndex: 8,
        },
        module: {
          ...course.modules[7],
          title: 'Week 8: Python Basics',
          lessons: [
            {
              day: 1,
              title: 'Final lesson',
              content: 'Review the complete course.',
              example: 'print("finished")',
            },
          ],
        },
      })
    );
  global.fetch = fetchMock;

  render(<StudentAssignmentPortal />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open course: Python Basics' })
  );

  expect(
    await screen.findByRole('button', { name: 'In progress' })
  ).toBeDisabled();
  const syllabus = screen.getByRole('navigation', {
    name: 'Eight-week syllabus',
  });
  const certificateCard = screen.getByRole('region', {
    name: 'Course completion certificate',
  });
  expect(syllabus).toContainElement(certificateCard);
  expect(syllabus.lastElementChild).toBe(certificateCard);
  expect(
    screen.queryByRole('button', { name: 'Download Certificate' })
  ).not.toBeInTheDocument();
});

test('refreshes and shows a certificate when an admin issues it before completion', async () => {
  const issuedCourse = {
    ...course,
    progress: {
      ...course.progress,
      certificateIssued: true,
    },
  };
  const student = {
    name: 'Student',
    studentId: '0131AD231067',
    branch: 'Artificial Intelligence and Data Science (AIDS)',
    email: 'student@example.com',
  };
  const createObjectURL = jest.fn().mockReturnValue('blob:certificate');
  const revokeObjectURL = jest.fn();
  const anchorClick = jest
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  Object.defineProperty(window.URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
  });
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      apiResponse({
        student,
        courses: [course],
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        weekIndex: 0,
        unlockStatus: {
          isUnlocked: true,
          isCompleted: false,
          currentWeekIndex: 0,
        },
        module: firstModule,
      })
    )
    .mockResolvedValueOnce(
      apiResponse({
        student,
        courses: [issuedCourse],
      })
    )
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'])),
    });
  global.fetch = fetchMock;

  render(<StudentAssignmentPortal />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open course: Python Basics' })
  );
  await screen.findByRole('heading', { name: 'Week 1: Python Basics' });
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

  expect(
    await screen.findByText(
      'Your certificate has been issued by the JNCT admin. Download it here.'
    )
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Download Certificate' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download Certificate' }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/student/courses/0123456789abcdef01234567/certificate'
    );
  });
  expect(createObjectURL).toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:certificate');
  expect(anchorClick).toHaveBeenCalled();
});

test('refreshes and locks a certificate after an admin revokes it', async () => {
  const issuedCourse = {
    ...course,
    progress: {
      ...course.progress,
      certificateIssued: true,
      certificateStatus: 'Issued',
    },
  };
  const revokedCourse = {
    ...course,
    progress: {
      ...course.progress,
      certificateIssued: false,
      certificateStatus: 'In progress',
    },
  };
  const student = {
    name: 'Student',
    email: 'student@example.com',
  };
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      apiResponse({ student, courses: [issuedCourse] })
    )
    .mockResolvedValueOnce(
      apiResponse({
        weekIndex: 0,
        unlockStatus: {
          isUnlocked: true,
          isCompleted: false,
          currentWeekIndex: 0,
        },
        module: firstModule,
      })
    )
    .mockResolvedValueOnce(
      apiResponse({ student, courses: [revokedCourse] })
    );

  render(<StudentAssignmentPortal />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open course: Python Basics' })
  );
  expect(
    await screen.findByRole('button', { name: 'Download Certificate' })
  ).toBeInTheDocument();

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

  expect(
    await screen.findByRole('button', { name: 'In progress' })
  ).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Download Certificate' })
  ).not.toBeInTheDocument();
});

test('allows retrying weekly module loads after an API error', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(
      apiResponse({
        student: { name: 'Student', email: 'student@example.com' },
        courses: [course],
      })
    )
    .mockResolvedValueOnce(apiResponse({ error: 'Course temporarily unavailable.' }, 503))
    .mockResolvedValueOnce(
      apiResponse({
        weekIndex: 0,
        unlockStatus: {
          isUnlocked: true,
          isCompleted: false,
          currentWeekIndex: 0,
        },
        module: firstModule,
      })
    );
  global.fetch = fetchMock;

  render(<StudentAssignmentPortal />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open course: Python Basics' })
  );

  expect(
    await screen.findByText('Course temporarily unavailable.')
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading this week' })
  );

  expect(
    await screen.findByRole('heading', { name: 'Week 1: Python Basics' })
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    `/api/student/courses/${courseId}/modules/0`,
    undefined
  );
});
