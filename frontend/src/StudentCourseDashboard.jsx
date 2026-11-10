import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

function apiUrl(endpoint) {
  return `${API_URL.replace(/\/+$/, '')}${endpoint}`;
}

async function requestJson(url, options) {
  const response = await fetch(apiUrl(url), {
    ...options,
    credentials: 'include',
  });
  const responseText = await response.text();
  let responseBody = {};

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Expected a JSON response but received HTML or invalid data (HTTP ${response.status}).`
      );
    }
  }

  if (!response.ok) {
    throw new Error(responseBody.error || `Request failed (${response.status}).`);
  }
  return responseBody;
}

export default function StudentCourseDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleIndex, setSelectedModuleIndex] = useState(0);
  const [moduleContent, setModuleContent] = useState(null);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleRequestVersion, setModuleRequestVersion] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [certificateGenerating, setCertificateGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const loadDashboard = useCallback(async () => {
    setError('');
    try {
      const result = await requestJson('/api/student/dashboard');
      if (!result.student || typeof result.student !== 'object') {
        throw new Error('The student dashboard API returned an invalid response.');
      }
      const courseLists = [
        result.student.courses,
        result.courses,
        result.student.assignedCourses,
      ].filter(Array.isArray);
      if (courseLists.length === 0) {
        throw new Error('The student dashboard API returned an invalid course list.');
      }
      const courses =
        courseLists.find((courseList) =>
          courseList.some(
            (course) => course && typeof course.title === 'string'
          )
        ) ||
        courseLists[0];
      const student = {
        ...result.student,
        courses,
        assignedCourseCount: courses.length,
      };
      const normalizedResult = { ...result, student, courses };
      setDashboard(normalizedResult);
      setSelectedCourseId((currentId) =>
        courses.some((course) => course._id === currentId) ? currentId : ''
      );
    } catch (requestError) {
      setError(requestError.message || 'Unable to load your courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCertificateStatus = useCallback(async (courseId) => {
    try {
      const result = await requestJson(
        `/api/student/courses/${encodeURIComponent(
          courseId
        )}/certificate/status`
      );
      setDashboard((current) => {
        if (!current) {
          return current;
        }
        const courses = current.student.courses.map((course) =>
          course._id === courseId
            ? {
                ...course,
                progress: {
                  ...course.progress,
                  certificateIssued: result.certificateIssued,
                  certificateStatus: result.certificateStatus,
                  certificateIssuedAt: result.certificateIssuedAt,
                },
              }
            : course
        );
        return {
          ...current,
          courses,
          student: { ...current.student, courses },
        };
      });
    } catch (requestError) {
      setError(
        requestError.message || 'Unable to refresh certificate status.'
      );
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    window.addEventListener('focus', loadDashboard);
    return () => window.removeEventListener('focus', loadDashboard);
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedCourseId) {
      return undefined;
    }
    const interval = window.setInterval(
      () => refreshCertificateStatus(selectedCourseId),
      10000
    );
    return () => window.clearInterval(interval);
  }, [selectedCourseId, refreshCertificateStatus]);

  useEffect(() => {
    const upcomingUnlocks = (dashboard?.courses || [])
      .map((course) => course.progress.nextWeekAvailableAt)
      .filter(Boolean)
      .map((date) => new Date(date).getTime())
      .filter((time) => time > currentTime)
      .sort((left, right) => left - right);
    if (!upcomingUnlocks.length) {
      return undefined;
    }

    const timeout = setTimeout(
      () => setCurrentTime(Date.now()),
      upcomingUnlocks[0] - currentTime + 1
    );
    return () => clearTimeout(timeout);
  }, [dashboard, currentTime]);

  const selectedCourse = useMemo(
    () =>
      (dashboard?.courses || []).find(
        (course) => course._id === selectedCourseId
      ) ||
      null,
    [dashboard, selectedCourseId]
  );
  const assignedCourses = dashboard?.student?.courses || [];
  const assignedCourseCount = dashboard?.student?.courses?.length || 0;
  const currentModuleIndex = selectedCourse?.progress.currentModuleIndex || 0;
  const courseCompleted =
    Boolean(selectedCourse?.progress.courseCompleted) ||
    currentModuleIndex >= 8;
  const nextWeekAvailableAt = selectedCourse?.progress.nextWeekAvailableAt;
  const isCurrentWeekAvailable =
    !nextWeekAvailableAt ||
    new Date(nextWeekAvailableAt).getTime() <= currentTime;
  const completedModuleIndices = new Set([
    ...(selectedCourse?.progress.completedWeeks || []),
    ...(selectedCourse?.progress.completedModuleIndices || []),
    ...Array.from(
      { length: Math.min(currentModuleIndex, 8) },
      (_, index) => index
    ),
  ]);
  const allWeeksCompleted =
    courseCompleted &&
    Array.from({ length: 8 }, (_, weekIndex) =>
      completedModuleIndices.has(weekIndex)
    ).every(Boolean);
  const certificateIssued = Boolean(
    selectedCourse?.progress.certificateIssued
  );
  const isSelectedWeekWaiting =
    Boolean(selectedCourseId) &&
    selectedModuleIndex === currentModuleIndex &&
    !isCurrentWeekAvailable;
  useEffect(() => {
    if (!selectedCourseId) {
      setModuleContent(null);
      setModuleLoading(false);
      return undefined;
    }

    if (isSelectedWeekWaiting) {
      setModuleContent(null);
      setModuleLoading(false);
      return undefined;
    }

    let active = true;
    setError('');
    setModuleContent(null);
    setModuleLoading(true);
    requestJson(
      `/api/student/courses/${encodeURIComponent(selectedCourseId)}/modules/${selectedModuleIndex}`
    )
      .then((result) => {
        if (!result.module) {
          throw new Error('The weekly module API returned an invalid response.');
        }
        if (active) {
          setModuleContent({
            courseId: selectedCourseId,
            moduleIndex: selectedModuleIndex,
            module: result.module,
            unlockStatus: result.unlockStatus,
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || 'Unable to load weekly teaching content.');
        }
      })
      .finally(() => {
        if (active) {
          setModuleLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    selectedCourseId,
    selectedModuleIndex,
    moduleRequestVersion,
    isSelectedWeekWaiting,
  ]);

  const selectedModule =
    moduleContent?.courseId === selectedCourseId &&
    moduleContent.moduleIndex === selectedModuleIndex
      ? moduleContent.module
      : null;
  const isCurrentWeek =
    selectedModuleIndex === currentModuleIndex &&
    isCurrentWeekAvailable &&
    (moduleContent?.unlockStatus?.isUnlocked ?? true);
  const allQuizQuestionsAnswered = Boolean(
    selectedModule?.quiz?.length &&
      Array.from({ length: selectedModule.quiz.length }, (_, index) =>
        Number.isInteger(answers[index])
      ).every(Boolean)
  );
  const latestQuizAttempt = selectedModule
    ? [...(selectedCourse.progress.quizAttempts || [])]
        .reverse()
        .find((attempt) => attempt.moduleIndex === selectedModule.moduleIndex)
    : null;

  async function submitQuiz(event) {
    event.preventDefault();
    if (!selectedCourse || !selectedModule || !isCurrentWeek) {
      return;
    }

    setBusy(true);
    setError('');
    setQuizResult(null);
    try {
      const result = await requestJson(
        `/api/student/courses/${encodeURIComponent(selectedCourse._id)}/modules/${selectedModuleIndex}/quiz`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        }
      );
      setQuizResult(result);
      if (result.passed) {
        setAnswers([]);
        setQuizOpen(false);
      }
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit the quiz.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadCertificate() {
    if (!certificateIssued || !selectedCourse) {
      return;
    }

    setCertificateGenerating(true);
    setError('');
    try {
      const response = await fetch(
        apiUrl(`/api/student/courses/${encodeURIComponent(
          selectedCourse._id
        )}/certificate`),
        { credentials: 'include' }
      );
      if (!response.ok) {
        const responseBody = await response.json();
        if (response.status === 403) {
          await refreshCertificateStatus(selectedCourse._id);
        }
        throw new Error(
          responseBody.error || `Request failed (${response.status}).`
        );
      }

      const certificateBlob = await response.blob();
      const objectUrl = window.URL.createObjectURL(certificateBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = 'course-completion-certificate.pdf';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (generationError) {
      setError(
        generationError.message || 'Unable to download your certificate.'
      );
    } finally {
      setCertificateGenerating(false);
    }
  }

  if (loading) {
    return (
      <main className="px-4 py-10">
        <p className="mx-auto max-w-4xl text-sm text-slate-600" role="status">
          Loading your learning dashboard…
        </p>
      </main>
    );
  }

  return (
    <main className="student-portal min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            JNCT Completions · Student dashboard
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {dashboard?.student.name}
          </h1>
          <p className="mt-1 text-slate-600">{dashboard?.student.email}</p>
        </section>

        {error && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        {quizResult && (
          <p
            className={`rounded-lg p-4 text-sm ${
              quizResult.passed
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-900'
            }`}
            role="status"
          >
            {quizResult.message} Score: {quizResult.score}% (
            {quizResult.correctCount}/{quizResult.questionCount}).
          </p>
        )}

        {!selectedCourse && assignedCourseCount > 0 && (
          <section aria-label="Assigned courses" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">
                Your assigned courses
              </h2>
              <span className="status-badge border border-indigo-400/30 bg-indigo-950/60 px-3 py-1.5 text-indigo-200">
                {assignedCourseCount}{' '}
                {assignedCourseCount === 1 ? 'course' : 'courses'}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {assignedCourses.map((course) => {
                const currentWeek = Math.min(
                  course.progress.currentModuleIndex || 0,
                  8
                );
                const completed =
                  Boolean(course.progress.courseCompleted) || currentWeek === 8;
                const availableAt = course.progress.nextWeekAvailableAt;
                const waiting =
                  !completed &&
                  availableAt &&
                  new Date(availableAt).getTime() > Date.now();
                return (
                  <article
                    className="portal-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    key={course._id}
                  >
                    <h3 className="text-lg font-semibold text-slate-900">
                      {course.title}
                    </h3>
                    <span
                      className={`status-badge mt-2 px-3 py-1 ${
                        completed
                          ? 'bg-emerald-100 text-emerald-800'
                          : waiting
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {completed ? 'Completed' : waiting ? 'Locked' : 'Current'}
                    </span>
                    {course.description && (
                      <p className="mt-2 text-sm text-slate-600">
                        {course.description}
                      </p>
                    )}
                    <p className="mt-3 text-sm text-slate-600">
                      {currentWeek} of 8 weeks complete
                    </p>
                    <div
                      aria-label={`${currentWeek} of 8 weeks completed`}
                      aria-valuemax={8}
                      aria-valuemin={0}
                      aria-valuenow={currentWeek}
                      className="mt-2 h-2 rounded-full bg-slate-100"
                      role="progressbar"
                    >
                      <div
                        className="h-2 rounded-full bg-indigo-600"
                        style={{ width: `${(currentWeek / 8) * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-medium text-indigo-700">
                      {completed
                        ? 'Course completed'
                        : waiting
                          ? `Week ${currentWeek + 1} unlocks ${new Date(
                              availableAt
                            ).toLocaleDateString()}`
                          : `Week ${currentWeek + 1} in progress`}
                    </p>
                    <button
                      className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      onClick={() => {
                        setSelectedCourseId(course._id);
                        setSelectedModuleIndex(Math.min(currentWeek, 7));
                        setAnswers([]);
                        setQuizOpen(false);
                        setQuizResult(null);
                      }}
                      type="button"
                    >
                      Open course: {course.title}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!selectedCourse && assignedCourses.length === 0 && !error && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              No courses assigned yet
            </h2>
            <p className="mt-2 text-slate-600">
              Your courses and learning tasks will appear here after an admin
              assigns them.
            </p>
          </section>
        )}

        {selectedCourse && (
          <section className="space-y-6">
            <button
              className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
              onClick={() => setSelectedCourseId('')}
              type="button"
            >
              ← Back to my courses
            </button>

            <div className="portal-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedCourse.title}
                  </h2>
                  {selectedCourse.description && (
                    <p className="mt-2 text-slate-600">
                      {selectedCourse.description}
                    </p>
                  )}
                </div>
                <span
                  className={`status-badge px-3 py-2 text-sm ${
                    courseCompleted
                      ? 'bg-emerald-100 text-emerald-800'
                      : isCurrentWeekAvailable
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {courseCompleted
                    ? 'Completed'
                    : isCurrentWeekAvailable
                      ? `Week ${currentModuleIndex + 1} of 8`
                      : `Week ${currentModuleIndex + 1} locked`}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                {completedModuleIndices.size} of 8 weeks completed
              </p>
              <div
                aria-label={`${completedModuleIndices.size} of 8 weeks completed`}
                aria-valuemax={8}
                aria-valuemin={0}
                aria-valuenow={completedModuleIndices.size}
                className="mt-2 h-2 rounded-full bg-slate-100"
                role="progressbar"
              >
                <div
                  className="h-2 rounded-full bg-indigo-600"
                  style={{
                    width: `${(completedModuleIndices.size / 8) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
              <nav
                aria-label="Eight-week syllabus"
                className="syllabus-panel h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-slate-900">
                  8-week syllabus
                </h3>
                <ol className="mt-4 space-y-2">
                  {Array.from({ length: 8 }, (_, weekIndex) => {
                    const module = selectedCourse.modules.find(
                      (item) => item.moduleIndex === weekIndex
                    );
                    const completed = completedModuleIndices.has(weekIndex);
                    const isAvailableCurrentWeek =
                      weekIndex === currentModuleIndex &&
                      isCurrentWeekAvailable;
                    const unlocked = completed || isAvailableCurrentWeek;
                    return (
                      <li key={weekIndex}>
                        <button
                          aria-current={
                            selectedModuleIndex === weekIndex ? 'step' : undefined
                          }
                          className={`syllabus-week w-full rounded-lg border px-3 py-3 text-left text-sm ${
                            selectedModuleIndex === weekIndex
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                              : 'border-slate-200 text-slate-700'
                          } ${unlocked ? 'hover:bg-slate-50' : 'cursor-not-allowed opacity-50'}`}
                          disabled={!unlocked || !module}
                          onClick={() => {
                            setSelectedModuleIndex(weekIndex);
                            setAnswers([]);
                            setQuizOpen(false);
                            setQuizResult(null);
                          }}
                          type="button"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span>{module?.title || `Week ${weekIndex + 1}`}</span>
                            <span
                              className={`status-badge px-2.5 py-1 ${
                                completed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : unlocked
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {completed ? 'Completed' : unlocked ? 'Current' : 'Locked'}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {!isCurrentWeekAvailable && nextWeekAvailableAt && (
                  <p
                    className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                    role="status"
                  >
                    Week {currentModuleIndex + 1} unlocks on{' '}
                    {new Date(nextWeekAvailableAt).toLocaleString()} after the
                    seven-day study period.
                  </p>
                )}
                <section
                  aria-label="Course completion certificate"
                  className={`certificate-card mt-5 rounded-xl p-4 ${
                    allWeeksCompleted
                      ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                      : ''
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">
                    Course Completion Certificate
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {certificateIssued
                      ? 'Your certificate has been issued by the JNCT admin. Download it here.'
                      : allWeeksCompleted
                        ? 'All eight weeks are complete. Your certificate will be available after the JNCT admin issues it.'
                        : `${completedModuleIndices.size} of 8 weeks complete. Finish every week and wait for admin issuance to unlock your certificate.`}
                  </p>
                  {certificateIssued ? (
                    <button
                      className="certificate-action mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-800"
                      disabled={certificateGenerating}
                      onClick={handleDownloadCertificate}
                      type="button"
                    >
                      {certificateGenerating
                        ? 'Generating…'
                        : 'Download Certificate'}
                    </button>
                  ) : (
                    <button
                      aria-disabled="true"
                      className="certificate-action mt-3 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500"
                      disabled
                      type="button"
                    >
                      In progress
                    </button>
                  )}
                </section>
              </nav>

              {!isCurrentWeekAvailable &&
              selectedModuleIndex === currentModuleIndex ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm sm:p-8">
                  <h3 className="text-lg font-semibold text-amber-950">
                    Your next week is scheduled
                  </h3>
                  <p className="mt-2 text-amber-900">
                    Week {currentModuleIndex + 1} becomes available on{' '}
                    {new Date(nextWeekAvailableAt).toLocaleString()}. You can
                    continue then; your completed weeks remain available to
                    review.
                  </p>
                </div>
              ) : courseCompleted && !selectedModule ? (
                        moduleLoading ? (
                          <p className="rounded-lg bg-slate-50 p-4 text-slate-700" role="status">
                            Loading weekly teaching content…
                          </p>
                        ) : (
                          <p className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
                            You have completed all eight weeks of this course.
                          </p>
                        )
                      ) : selectedModule ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="space-y-7">
                    <section>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {selectedModule.title}
                      </h3>
                      {selectedModule.readingMaterial && (
                        <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">
                          {selectedModule.readingMaterial}
                        </p>
                      )}
                      {selectedModule.contentSource && (
                        <p className="mt-2 text-xs text-slate-500">
                          {selectedModule.contentSource === 'ai'
                            ? 'Gemini AI-generated teaching material and explanations'
                            : 'Starter study material (Gemini is unavailable)'}
                        </p>
                      )}
                      {selectedModule.lessons?.length > 0 && (
                        <ol className="mt-4 space-y-3">
                          {selectedModule.lessons.map((lesson) => (
                            <li
                              className="rounded-lg border border-slate-200 p-4"
                              key={lesson.day}
                            >
                              <h4 className="font-semibold text-slate-800">
                                Day {lesson.day}: {lesson.title}
                              </h4>
                              <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">
                                {lesson.content}
                              </p>
                              {lesson.example && (
                                <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                                  <span className="font-semibold">Example: </span>
                                  {lesson.example}
                                </pre>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>

                    {selectedModule.quiz?.length > 0 &&
                      isCurrentWeek &&
                      !quizOpen && (
                        <div className="border-t border-slate-200 pt-6">
                          <button
                            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                            onClick={() => {
                              setAnswers([]);
                              setQuizOpen(true);
                            }}
                            type="button"
                          >
                            Take Quiz
                          </button>
                        </div>
                      )}

                    {selectedModule.quiz?.length > 0 &&
                      isCurrentWeek &&
                      quizOpen && (
                        <form
                          className="space-y-4 border-t border-slate-200 pt-6"
                          onSubmit={submitQuiz}
                        >
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              Week {selectedModuleIndex + 1} progress quiz
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">
                              Answer each question. A score of 70% passes and
                              completes this week.
                            </p>
                          </div>
                          {selectedModule.quiz.map((question, questionIndex) => (
                            <fieldset
                              className="rounded-lg border border-slate-200 p-4"
                              key={`${questionIndex}-${question.question}`}
                            >
                              <legend className="px-1 font-medium text-slate-800">
                                {questionIndex + 1}. {question.question}
                              </legend>
                              <div className="mt-2 space-y-2">
                                {question.options.map((option, optionIndex) => (
                                  <label
                                    className="flex items-start gap-2 text-sm text-slate-700"
                                    key={optionIndex}
                                  >
                                    <input
                                      checked={answers[questionIndex] === optionIndex}
                                      name={`quiz-${questionIndex}`}
                                      onChange={() =>
                                        setAnswers((current) => {
                                          const next = [...current];
                                          next[questionIndex] = optionIndex;
                                          return next;
                                        })
                                      }
                                      required
                                      type="radio"
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                          {latestQuizAttempt && (
                            <p className="text-sm text-slate-600">
                              Latest attempt: {latestQuizAttempt.score}% —{' '}
                              {latestQuizAttempt.passed
                                ? 'Passed'
                                : 'Not passed yet'}
                            </p>
                          )}
                          <button
                            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                            disabled={busy || !allQuizQuestionsAnswered}
                            type="submit"
                          >
                            Submit quiz
                          </button>
                        </form>
                      )}

                    {!isCurrentWeek && (
                      <p className="border-t border-slate-200 pt-6 text-sm text-emerald-800">
                        This week is complete. You can revisit its study
                        materials.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                moduleLoading ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-slate-700" role="status">
                    Generating this week’s AI teaching content and quiz…
                  </p>
                ) : (
                  <div className="rounded-lg bg-amber-50 p-4 text-amber-900">
                    <p>
                      This week’s content could not be loaded. Check the error
                      above or try again.
                    </p>
                    <button
                      className="mt-3 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
                      onClick={() => setModuleRequestVersion((version) => version + 1)}
                      type="button"
                    >
                      Retry loading this week
                    </button>
                  </div>
                )
              )}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
