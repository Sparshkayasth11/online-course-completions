import { useCallback, useEffect, useState } from 'react';
import {
  generateCertificatePdf,
  getBranchFromStudentId,
} from './utils/certificate';

const API_URL = process.env.REACT_APP_API_URL || '';

function apiUrl(endpoint) {
  return `${API_URL.replace(/\/+$/, '')}${endpoint}`;
}

const dashboardTabs = [
  { id: 'students', label: 'Students' },
  { id: 'courses', label: 'Courses' },
  { id: 'certificates', label: 'Certificates' },
];

const studentTabs = [
  { id: 'assignment', label: 'Assign Course / New Student' },
  { id: 'directory', label: 'Existing Students Directory' },
];

function getAssignedCourseProgress(student) {
  const progressByCourseId = new Map(
    (student.courseProgress || []).map((progress) => [
      String(progress.courseId),
      progress,
    ])
  );
  const assignedCourseIds = (student.assignedCourses || []).map((course) =>
    String(course?._id || course)
  );

  assignedCourseIds.forEach((courseId) => {
    if (!progressByCourseId.has(courseId)) {
      progressByCourseId.set(courseId, {
        courseId,
        completedWeekCount: 0,
        courseCompleted: false,
      });
    }
  });

  return [...progressByCourseId.values()];
}

async function readJsonResponse(response) {
  const responseText = await response.text();
  let responseBody = {};

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || /^\s*</.test(responseText)) {
        throw new Error(
          `Expected a JSON response but received HTML (HTTP ${response.status}). Check that the backend is running and the frontend API proxy targets it.`
        );
      }
      throw new Error(
        `The server returned an invalid JSON response (HTTP ${response.status}).`
      );
    }
  }

  if (!response.ok) {
    throw new Error(responseBody?.error || `Request failed (${response.status}).`);
  }

  return responseBody;
}

async function getJson(url) {
  return readJsonResponse(
    await fetch(apiUrl(url), { credentials: 'include' })
  );
}

async function postJson(url, payload) {
  const response = await fetch(apiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response);
}

async function patchJson(url, payload) {
  const response = await fetch(apiUrl(url), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response);
}

async function deleteJson(url) {
  return readJsonResponse(
    await fetch(apiUrl(url), {
      method: 'DELETE',
      credentials: 'include',
    })
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('students');
  const [activeStudentTab, setActiveStudentTab] = useState('assignment');
  const [courseAssignment, setCourseAssignment] = useState({
    studentId: '',
    courseId: '',
  });
  const [customTaskForm, setCustomTaskForm] = useState({
    studentId: '',
    courseId: '',
    studentName: '',
    studentEmail: '',
    studentPassword: '',
    courseTitle: '',
    customTask: '',
  });
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [assigningTask, setAssigningTask] = useState(false);
  const [error, setError] = useState('');
  const [records, setRecords] = useState({ students: [], courses: [] });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [passwordInputs, setPasswordInputs] = useState({});
  const [passwordUpdate, setPasswordUpdate] = useState({
    studentId: '',
    message: '',
    error: '',
  });
  const [deletingStudentId, setDeletingStudentId] = useState('');
  const [deleteStudentError, setDeleteStudentError] = useState({
    studentId: '',
    message: '',
  });
  const [deletingCourseId, setDeletingCourseId] = useState('');
  const [deleteCourseError, setDeleteCourseError] = useState({
    courseId: '',
    message: '',
  });
  const [unassigningCourseKey, setUnassigningCourseKey] = useState('');
  const [unassignCourseError, setUnassignCourseError] = useState({
    key: '',
    message: '',
  });
  const [certificateError, setCertificateError] = useState('');
  const [generatingCertificateKey, setGeneratingCertificateKey] = useState('');
  const [issuingCertificateKey, setIssuingCertificateKey] = useState('');

  const refreshRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const result = await getJson('/api/admin/records');
      if (!Array.isArray(result.students) || !Array.isArray(result.courses)) {
        throw new Error('The records API returned an invalid response.');
      }
      setRecords(result);
    } catch (requestError) {
      setRecordsError(requestError.message || 'Unable to load records.');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRecords();
  }, [refreshRecords]);

  async function handleAssignCourse(event) {
    event.preventDefault();
    setError('');
    setAssigningCourse(true);

    try {
      await postJson('/api/admin/assign-course', courseAssignment);
      await refreshRecords();
      window.alert('Course assigned successfully.');
      setCourseAssignment({ studentId: '', courseId: '' });
    } catch (requestError) {
      setError(requestError.message || 'Unable to assign the course.');
    } finally {
      setAssigningCourse(false);
    }
  }

  async function handleAssignCustomTask(event) {
    event.preventDefault();
    setError('');
    setAssigningTask(true);

    try {
      const studentId = customTaskForm.studentId.trim();
      const courseId = customTaskForm.courseId.trim();
      const taskDescription = customTaskForm.customTask.trim();
      if (!taskDescription) {
        setError('A non-empty custom task description is required.');
        return;
      }

      const studentName = customTaskForm.studentName.trim();
      const studentEmail = customTaskForm.studentEmail.trim();
      const studentPassword = customTaskForm.studentPassword;
      const courseTitle = customTaskForm.courseTitle.trim();
      const payload = {
        ...(studentId ? { studentId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(studentName ? { newStudentName: studentName } : {}),
        ...(studentEmail ? { newStudentEmail: studentEmail } : {}),
        ...(studentPassword.trim()
          ? { newStudentPassword: studentPassword }
          : {}),
        ...(courseTitle ? { newCourseTitle: courseTitle } : {}),
        customTask: taskDescription,
      };

      await postJson('/api/admin/assign-custom-task', payload);
      await refreshRecords();
      window.alert('Custom task override assigned successfully.');
      setCustomTaskForm({
        studentId: '',
        courseId: '',
        studentName: '',
        studentEmail: '',
        studentPassword: '',
        courseTitle: '',
        customTask: '',
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to assign the custom task.');
    } finally {
      setAssigningTask(false);
    }
  }

  async function handleChangeStudentPassword(event, studentId) {
    event.preventDefault();
    setPasswordUpdate({ studentId, message: '', error: '' });
    const password = passwordInputs[studentId] || '';
    if (password.length < 12) {
      setPasswordUpdate({
        studentId,
        message: '',
        error: 'Use at least 12 characters for the new password.',
      });
      return;
    }

    try {
      const result = await patchJson(
        `/api/admin/students/${encodeURIComponent(studentId)}/password`,
        { password }
      );
      setPasswordInputs((current) => ({ ...current, [studentId]: '' }));
      setPasswordUpdate({
        studentId,
        message: result.message || 'Password changed successfully.',
        error: '',
      });
    } catch (requestError) {
      setPasswordUpdate({
        studentId,
        message: '',
        error: requestError.message || 'Unable to change this password.',
      });
    }
  }

  async function handleDeleteStudent(studentId, studentName) {
    if (
      !window.confirm(
        `Delete ${studentName} and all associated course progress? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingStudentId(studentId);
    setDeleteStudentError({ studentId: '', message: '' });
    try {
      await deleteJson(
        `/api/admin/students/${encodeURIComponent(studentId)}`
      );
      setRecords((current) => ({
        ...current,
        students: current.students.filter(
          (student) => student._id !== studentId
        ),
      }));
      setPasswordInputs((current) => {
        const next = { ...current };
        delete next[studentId];
        return next;
      });
      setPasswordUpdate((current) =>
        current.studentId === studentId
          ? { studentId: '', message: '', error: '' }
          : current
      );
    } catch (requestError) {
      setDeleteStudentError({
        studentId,
        message: requestError.message || 'Unable to delete this student.',
      });
    } finally {
      setDeletingStudentId('');
    }
  }

  async function handleDeleteCourse(courseId, courseTitle) {
    if (
      !window.confirm(
        `Delete "${courseTitle}" and all associated student progress? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingCourseId(courseId);
    setDeleteCourseError({ courseId: '', message: '' });
    try {
      await deleteJson(
        `/api/admin/courses/${encodeURIComponent(courseId)}`
      );
      setRecords((current) => ({
        ...current,
        courses: current.courses.filter((course) => course._id !== courseId),
      }));
    } catch (requestError) {
      setDeleteCourseError({
        courseId,
        message: requestError.message || 'Unable to delete this course.',
      });
    } finally {
      setDeletingCourseId('');
    }
  }

  async function handleUnassignCourse(studentId, courseId, courseTitle) {
    const assignmentKey = `${studentId}:${courseId}`;
    if (
      !window.confirm(
        `Remove "${courseTitle}" from this student and delete their progress for this course?`
      )
    ) {
      return;
    }

    setUnassigningCourseKey(assignmentKey);
    setUnassignCourseError({ key: '', message: '' });
    try {
      await deleteJson(
        `/api/admin/students/${encodeURIComponent(
          studentId
        )}/courses/${encodeURIComponent(courseId)}`
      );
      setRecords((current) => ({
        ...current,
        students: current.students.map((student) =>
          student._id === studentId
            ? {
                ...student,
                assignedCourses: (student.assignedCourses || []).filter(
                  (assignedCourseId) =>
                    String(assignedCourseId) !== String(courseId)
                ),
              }
            : student
        ),
      }));
    } catch (requestError) {
      setUnassignCourseError({
        key: assignmentKey,
        message: requestError.message || 'Unable to remove this course.',
      });
    } finally {
      setUnassigningCourseKey('');
    }
  }

  function handleGenerateCertificate(student, course) {
    const key = `${student._id}:${course._id}`;
    setGeneratingCertificateKey(key);
    setCertificateError('');

    try {
      generateCertificatePdf(student, course);
    } catch (generationError) {
      setCertificateError(
        generationError.message || 'Unable to generate this certificate.'
      );
    } finally {
      setGeneratingCertificateKey('');
    }
  }

  async function handleToggleCertificate(student, course, currentlyIssued) {
    const key = `${student._id}:${course._id}`;
    setCertificateError('');
    setIssuingCertificateKey(key);
    try {
      const nextIssuedState = !currentlyIssued;
      const response = await postJson(
        `/api/admin/students/${encodeURIComponent(
          student._id
        )}/courses/${encodeURIComponent(course._id)}/certificate`,
        { certificateIssued: nextIssuedState }
      );
      const completedWeeks = nextIssuedState
        ? Array.from({ length: 8 }, (_, index) => index)
        : [];
      const updatedAt = response.progress?.completedAt || null;
      setRecords((current) => ({
        ...current,
        students: current.students.map((record) =>
          record._id === student._id
            ? {
                ...record,
                courseProgress: (record.courseProgress || []).map((progress) =>
                  String(progress.courseId) === String(course._id)
                    ? {
                        ...progress,
                        completedWeeks,
                        completedModuleIndices: completedWeeks,
                        completedWeekCount: completedWeeks.length,
                        currentModuleIndex: completedWeeks.length,
                        courseCompleted: nextIssuedState,
                        completedAt: updatedAt,
                        certificateIssued: nextIssuedState,
                        certificateIssuedAt: nextIssuedState
                          ? response.progress?.certificateIssuedAt ||
                            new Date().toISOString()
                          : null,
                      }
                    : progress
                ),
              }
            : record
        ),
      }));
    } catch (requestError) {
      setCertificateError(
        requestError.message || 'Unable to update this certificate.'
      );
    } finally {
      setIssuingCertificateKey('');
    }
  }

  const inputClassName =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  const labelClassName = 'block text-sm font-medium text-slate-700';
  const buttonClassName =
    'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
  const seenCourseTitles = new Set();
  const uniqueCourses = records.courses.filter((course) => {
    const title = (course.title || '').trim().toLocaleLowerCase();
    if (seenCourseTitles.has(title)) {
      return false;
    }
    seenCourseTitles.add(title);
    return true;
  });

  return (
    <main className="admin-dashboard min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            JNCT Course Completions
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Manage student course assignments and custom task overrides.
          </p>
        </header>

        {error && (
          <div
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}

        <div
          aria-label="Admin dashboard sections"
          className="admin-tabs mb-6 flex w-full flex-wrap gap-2 rounded-xl border border-slate-700/70 bg-slate-900/80 p-2"
          role="tablist"
        >
          {dashboardTabs.map((tab) => (
            <button
              aria-controls={
                tab.id === 'certificates'
                  ? 'admin-panel-certificates'
                  : tab.id === 'students'
                    ? `admin-panel-students-${activeStudentTab}`
                    : 'admin-panel-courses'
              }
              aria-selected={activeTab === tab.id}
              className="admin-tab-button min-h-11 flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
              id={`admin-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'students' && (
          <div
            aria-label="Student management sections"
            className="admin-tabs mb-6 flex w-full flex-wrap gap-2 rounded-xl border border-slate-700/70 bg-slate-900/80 p-2"
            role="tablist"
          >
            {studentTabs.map((tab) => (
              <button
                aria-controls={`admin-panel-students-${tab.id}`}
                aria-selected={activeStudentTab === tab.id}
                className="admin-tab-button min-h-11 flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition"
                id={`admin-tab-students-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveStudentTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'students' && activeStudentTab === 'assignment' && (
          <div
            aria-labelledby="admin-tab-students-assignment"
            className="grid gap-6 md:grid-cols-2"
            id="admin-panel-students-assignment"
            role="tabpanel"
          >
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Assign Course to Student
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Enroll a student and initialize their course progress.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleAssignCourse}>
                <div>
                  <label className={labelClassName} htmlFor="assign-student-id">
                    Student ID (Roll Number)
                  </label>
                  <input
                    className={inputClassName}
                    id="assign-student-id"
                    name="studentId"
                    onChange={(event) =>
                      setCourseAssignment({
                        ...courseAssignment,
                        studentId: event.target.value,
                      })
                    }
                    placeholder="Enter student roll number"
                    required
                    value={courseAssignment.studentId}
                  />
                </div>

                <div>
                  <label className={labelClassName} htmlFor="assign-course-id">
                    Course ID
                  </label>
                  <input
                    className={inputClassName}
                    id="assign-course-id"
                    name="courseId"
                    onChange={(event) =>
                      setCourseAssignment({
                        ...courseAssignment,
                        courseId: event.target.value,
                      })
                    }
                    placeholder="Enter course ID"
                    required
                    value={courseAssignment.courseId}
                  />
                </div>

                <button
                  className={buttonClassName}
                  disabled={assigningCourse}
                  type="submit"
                >
                  {assigningCourse ? 'Assigning…' : 'Assign Course'}
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Add New Student / Custom Task
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Add a student while assigning a custom task, or set a task for
                an existing student.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleAssignCustomTask}>
                <div>
                  <label className={labelClassName} htmlFor="task-student-id">
                    Student ID (Roll Number; optional for new students)
                  </label>
                  <input
                    className={inputClassName}
                    id="task-student-id"
                    name="studentId"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        studentId: event.target.value,
                      })
                    }
                    placeholder="Roll number or existing MongoDB ID"
                    value={customTaskForm.studentId}
                  />
                </div>

                <div>
                  <label className={labelClassName} htmlFor="task-course-id">
                    Course ID (optional for new courses)
                  </label>
                  <input
                    className={inputClassName}
                    id="task-course-id"
                    name="courseId"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        courseId: event.target.value,
                      })
                    }
                    placeholder="MongoDB course ID, or leave blank to create"
                    value={customTaskForm.courseId}
                  />
                </div>

                <p className="text-sm text-slate-500">
                  Use a student roll number or legacy MongoDB ID for an existing
                  student. For a new student, enter a roll number here (or leave
                  it blank to generate one) and provide a name, email, and
                  password. New courses need a title.
                </p>

                <div>
                  <label className={labelClassName} htmlFor="task-student-name">
                    New student name
                  </label>
                  <input
                    className={inputClassName}
                    id="task-student-name"
                    name="studentName"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        studentName: event.target.value,
                      })
                    }
                    value={customTaskForm.studentName}
                  />
                </div>

                <div>
                  <label className={labelClassName} htmlFor="task-student-email">
                    New student email
                  </label>
                  <input
                    className={inputClassName}
                    autoComplete="email"
                    id="task-student-email"
                    name="studentEmail"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        studentEmail: event.target.value,
                      })
                    }
                    type="email"
                    value={customTaskForm.studentEmail}
                  />
                </div>

                <div>
                  <label
                    className={labelClassName}
                    htmlFor="task-student-password"
                  >
                    New student password
                  </label>
                  <input
                    className={inputClassName}
                    autoComplete="new-password"
                    id="task-student-password"
                    name="studentPassword"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        studentPassword: event.target.value,
                      })
                    }
                    type="password"
                    value={customTaskForm.studentPassword}
                  />
                </div>

                <div>
                  <label className={labelClassName} htmlFor="task-course-title">
                    New course title
                  </label>
                  <input
                    className={inputClassName}
                    id="task-course-title"
                    name="courseTitle"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        courseTitle: event.target.value,
                      })
                    }
                    value={customTaskForm.courseTitle}
                  />
                </div>

                <div>
                  <label
                    className={labelClassName}
                    htmlFor="custom-task-description"
                  >
                    Custom task description
                  </label>
                  <textarea
                    className={inputClassName}
                    id="custom-task-description"
                    name="customTask"
                    onChange={(event) =>
                      setCustomTaskForm({
                        ...customTaskForm,
                        customTask: event.target.value,
                      })
                    }
                    placeholder="Describe the task for this student"
                    required
                    rows={5}
                    value={customTaskForm.customTask}
                  />
                </div>

                <button
                  className={buttonClassName}
                  disabled={assigningTask}
                  type="submit"
                >
                  {assigningTask ? 'Assigning…' : 'Assign Custom Task'}
                </button>
              </form>
            </section>
          </div>
        )}

        <section
          aria-labelledby={
            activeTab === 'students'
              ? 'admin-tab-students-directory'
              : 'admin-tab-courses'
          }
          className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          hidden={
            activeTab === 'students'
              ? activeStudentTab !== 'directory'
              : activeTab !== 'courses'
          }
          id={
            activeTab === 'students'
              ? 'admin-panel-students-directory'
              : 'admin-panel-courses'
          }
          role="tabpanel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                <span
                  id={
                    activeTab === 'students'
                      ? 'admin-panel-students-directory-heading'
                      : 'admin-panel-courses-heading'
                  }
                >
                  {activeTab === 'students'
                    ? 'Existing Students Directory'
                    : 'Existing Courses'}
                </span>
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeTab === 'students'
                  ? 'Review registered students, their assigned courses, and account actions.'
                  : 'Review and manage registered courses.'}
              </p>
            </div>
            <button
              className={buttonClassName}
              disabled={recordsLoading}
              onClick={refreshRecords}
              type="button"
            >
              {recordsLoading ? 'Refreshing…' : 'Refresh records'}
            </button>
          </div>

          {recordsError && (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {recordsError}
            </p>
          )}

          <div className="mt-6 grid gap-6">
            {activeTab === 'students' && <div className="min-w-0">
              <h3 className="mb-2 font-semibold text-slate-800">Students</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full table-fixed text-left text-xs sm:text-sm">
                  <colgroup>
                    <col className="w-[19%]" />
                    <col className="w-[27%]" />
                    <col className="w-[29%]" />
                    <col className="w-[25%]" />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="break-words px-2 py-3 font-semibold sm:px-4">Name</th>
                      <th className="break-words px-2 py-3 font-semibold sm:px-4">Email</th>
                      <th className="break-words px-2 py-3 font-semibold sm:px-4">Password</th>
                      <th className="break-words px-2 py-3 font-semibold sm:px-4">Student ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {records.students.map((student) => (
                      <tr key={student._id}>
                        <td className="break-words px-2 py-3 align-top font-medium text-slate-800 sm:px-4">
                          {student.name}
                          <div className="mt-2 space-y-2 font-normal">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                              Assigned courses
                            </p>
                            {(student.assignedCourses || []).length === 0 ? (
                              <p className="text-xs text-slate-500">
                                No courses assigned
                              </p>
                            ) : (
                              (student.assignedCourses || []).map(
                                (assignedCourseId) => {
                                  const courseId = String(assignedCourseId);
                                  const course = records.courses.find(
                                    (item) => String(item._id) === courseId
                                  );
                                  const courseTitle =
                                    course?.title || 'Unavailable course';
                                  const assignmentKey = `${student._id}:${courseId}`;
                                  return (
                                    <div
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5"
                                      key={courseId}
                                    >
                                      <span className="break-words text-xs font-medium text-slate-300">
                                        {courseTitle}
                                      </span>
                                      <button
                                        aria-label={`Remove ${courseTitle} from ${student.name}`}
                                        className="admin-action-button admin-action-danger"
                                        disabled={
                                          unassigningCourseKey === assignmentKey
                                        }
                                        onClick={() =>
                                          handleUnassignCourse(
                                            student._id,
                                            courseId,
                                            courseTitle
                                          )
                                        }
                                        type="button"
                                      >
                                        {unassigningCourseKey === assignmentKey
                                          ? 'Removing…'
                                          : 'Remove Course'}
                                      </button>
                                      {unassignCourseError.key ===
                                        assignmentKey && (
                                        <p
                                          className="w-full break-words text-xs text-red-300"
                                          role="alert"
                                        >
                                          {unassignCourseError.message}
                                        </p>
                                      )}
                                    </div>
                                  );
                                }
                              )
                            )}
                          </div>
                        </td>
                        <td className="break-all px-2 py-3 align-top text-slate-600 sm:px-4">
                          {student.email}
                        </td>
                        <td className="break-words px-2 py-3 align-top sm:px-4">
                          <span
                            aria-label="Password value hidden for security"
                            className="inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold leading-tight text-slate-600 sm:px-2.5 sm:text-xs"
                            title="Password values are not available in the records API"
                          >
                            Hidden
                          </span>
                          <form
                            className="mt-3 space-y-2 font-sans"
                            onSubmit={(event) =>
                              handleChangeStudentPassword(event, student._id)
                            }
                          >
                            <label
                              className="sr-only"
                              htmlFor={`new-password-${student._id}`}
                            >
                              New password for {student.name}
                            </label>
                            <input
                              autoComplete="new-password"
                              className="block w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 font-sans text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              id={`new-password-${student._id}`}
                              minLength={12}
                              onChange={(event) =>
                                setPasswordInputs((current) => ({
                                  ...current,
                                  [student._id]: event.target.value,
                                }))
                              }
                              placeholder="Set new password"
                              type="password"
                              value={passwordInputs[student._id] || ''}
                            />
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                className="admin-action-button admin-action-primary min-w-0 flex-1"
                                disabled={
                                  !passwordInputs[student._id] ||
                                  deletingStudentId === student._id
                                }
                                type="submit"
                              >
                                Change Password
                              </button>
                              <button
                                className="admin-action-button admin-action-danger min-w-0 flex-1"
                                disabled={deletingStudentId === student._id}
                                onClick={() =>
                                  handleDeleteStudent(student._id, student.name)
                                }
                                type="button"
                              >
                                {deletingStudentId === student._id
                                  ? 'Deleting…'
                                  : 'Delete Student'}
                              </button>
                            </div>
                            {passwordUpdate.studentId === student._id &&
                              (passwordUpdate.error || passwordUpdate.message) && (
                                <p
                                  className={`break-words text-xs ${
                                    passwordUpdate.error
                                      ? 'text-red-700'
                                      : 'text-emerald-700'
                                  }`}
                                  role={passwordUpdate.error ? 'alert' : 'status'}
                                >
                                  {passwordUpdate.error || passwordUpdate.message}
                                </p>
                              )}
                            {deleteStudentError.studentId === student._id && (
                              <p className="break-words text-xs text-red-700" role="alert">
                                {deleteStudentError.message}
                              </p>
                            )}
                          </form>
                        </td>
                        <td className="select-all break-all px-2 py-3 align-top font-mono text-[10px] leading-5 text-slate-600 sm:px-4 sm:text-xs">
                          {student.studentId || student._id}
                        </td>
                      </tr>
                    ))}
                    {records.students.length === 0 && !recordsLoading && (
                      <tr>
                        <td
                          className="px-3 py-4 text-slate-500"
                          colSpan={4}
                        >
                          No students found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>}

            {activeTab === 'courses' && <div className="min-w-0 lg:max-w-3xl">
              <h3 className="mb-2 font-semibold text-slate-800">Courses</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[45%]" />
                    <col className="w-[25%]" />
                  </colgroup>
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold sm:px-4">Title</th>
                      <th className="px-3 py-3 font-semibold sm:px-4">Course ID</th>
                      <th className="px-3 py-3 font-semibold sm:px-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {uniqueCourses.map((course) => (
                      <tr key={course._id}>
                        <td className="break-words px-3 py-3 align-top font-medium text-slate-800 sm:px-4">
                          {course.title}
                        </td>
                        <td className="select-all break-all px-3 py-3 align-top font-mono text-xs text-slate-600 sm:px-4">
                          {course._id}
                        </td>
                        <td className="px-2 py-3 align-top sm:px-4">
                          <button
                            aria-label={`Delete course ${course.title}`}
                            className="admin-action-button admin-action-danger"
                            disabled={deletingCourseId === course._id}
                            onClick={() =>
                              handleDeleteCourse(course._id, course.title)
                            }
                            type="button"
                          >
                            {deletingCourseId === course._id
                              ? 'Deleting…'
                              : 'Delete Course'}
                          </button>
                          {deleteCourseError.courseId === course._id && (
                            <p className="mt-2 break-words text-xs text-red-300" role="alert">
                              {deleteCourseError.message}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                    {uniqueCourses.length === 0 && !recordsLoading && (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={3}>
                          No courses found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>
        </section>

        <section
          aria-labelledby="admin-panel-certificates-heading"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          hidden={activeTab !== 'certificates'}
          id="admin-panel-certificates"
          role="tabpanel"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2
                className="text-lg font-semibold text-slate-900"
                id="admin-panel-certificates-heading"
              >
                Course certificates
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review each student’s course completion and generate a
                certificate after all eight weeks are complete.
              </p>
            </div>
          </div>

          {certificateError && (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {certificateError}
            </p>
          )}

          <div className="certificate-table-wrap mt-6 overflow-x-auto rounded-xl border border-slate-700/70">
            <table className="certificate-table w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col">Student Name</th>
                  <th scope="col">Roll Number</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Course Title</th>
                  <th scope="col">Weeks Completed</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
            {records.students.flatMap((student) =>
              getAssignedCourseProgress(student).map((progress) => {
                const courseId = String(progress.courseId);
                const course = records.courses.find(
                  (item) => String(item._id) === courseId
                );
                const courseTitle = course?.title || 'Unavailable course';
                const certificateKey = `${student._id}:${courseId}`;
                const recordedWeekCount = progress.courseCompleted
                  ? 8
                  : Number(progress.completedWeekCount) ||
                    (progress.completedWeeks || []).length;
                const completedWeekCount = recordedWeekCount;
                const issued = Boolean(progress.certificateIssued);
                const courseCompleted =
                  Boolean(progress.courseCompleted) ||
                  recordedWeekCount >= 8;
                return (
                  <tr key={certificateKey}>
                    <td className="certificate-table-name">{student.name}</td>
                    <td className="font-mono">
                      {student.studentId || student._id}
                    </td>
                    <td>
                      {student.branch ||
                        getBranchFromStudentId(student.studentId || '')}
                    </td>
                    <td>{courseTitle}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span>{completedWeekCount}/8</span>
                        <div
                          aria-label={`${completedWeekCount} of 8 weeks completed`}
                          aria-valuemax={8}
                          aria-valuemin={0}
                          aria-valuenow={completedWeekCount}
                          className="h-2 w-24 overflow-hidden rounded-full bg-slate-700"
                          role="progressbar"
                        >
                          <span
                            className="block h-full rounded-full bg-indigo-400"
                            style={{
                              width: `${Math.min(
                                (completedWeekCount / 8) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`certificate-status-badge ${
                          issued || courseCompleted
                            ? 'certificate-status-completed'
                            : 'certificate-status-progress'
                        }`}
                      >
                        {issued
                          ? 'Issued by admin'
                          : courseCompleted
                            ? 'Completed / Eligible'
                            : 'In progress'}
                      </span>
                    </td>
                    <td>
                      <div className="flex min-w-48 flex-col items-start gap-2">
                        {issued ? (
                          <>
                            <button
                              className="admin-action-button admin-action-primary"
                              disabled={
                                generatingCertificateKey === certificateKey
                              }
                              onClick={() =>
                                handleGenerateCertificate(student, {
                                  _id: courseId,
                                  title: courseTitle,
                                })
                              }
                              type="button"
                            >
                              {generatingCertificateKey === certificateKey
                                ? 'Generating…'
                                : 'Download Certificate'}
                            </button>
                            <button
                              className="admin-action-button admin-action-danger"
                              disabled={
                                issuingCertificateKey === certificateKey
                              }
                              onClick={() =>
                                handleToggleCertificate(
                                  student,
                                  { _id: courseId, title: courseTitle },
                                  issued
                                )
                              }
                              type="button"
                            >
                              {issuingCertificateKey === certificateKey
                                ? 'Revoking…'
                                : 'Revoke / Lock Certificate'}
                            </button>
                          </>
                        ) : (
                          <button
                            className="admin-action-button admin-action-primary"
                            disabled={
                              issuingCertificateKey === certificateKey
                            }
                            onClick={() =>
                              handleToggleCertificate(
                                student,
                                { _id: courseId, title: courseTitle },
                                issued
                              )
                            }
                            type="button"
                          >
                            {issuingCertificateKey === certificateKey
                              ? 'Issuing…'
                              : 'Unlock / Issue Certificate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            {records.students.every(
              (student) => getAssignedCourseProgress(student).length === 0
            ) && (
              <tr>
                <td className="certificate-table-empty" colSpan={7}>
                  No assigned student courses are available yet.
                </td>
              </tr>
            )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
