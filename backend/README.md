# Backend setup

Set these environment variables before starting the server:

- `MONGO_URI`: MongoDB connection string.
- `ADMIN_EMAIL`: email used by the admin sign-in screen.
- `ADMIN_PASSWORD`: admin password.
- `SESSION_SECRET`: a randomly generated secret with at least 32 characters.
- `GEMINI_API_KEY`: enables on-demand AI-generated weekly teaching modules and AI assignment evaluation.
- `PORT`: optional; defaults to `5000`.

Run `npm start` from this directory. Admin API routes require a successful
sign-in and use an eight-hour, HttpOnly, SameSite=Strict cookie. In production,
serve the app over HTTPS so the cookie's Secure flag is enabled.

Student accounts sign in with their custom student ID (such as a roll number)
and password using
`POST /api/student/login`; the server issues a separate eight-hour HttpOnly
student session cookie. Student dashboard, quiz, and assignment-submission
routes require that session. New student passwords are stored as scrypt hashes.
MongoDB `_id` values remain internal references; student IDs are unique strings.
If an admin does not provide a custom ID when creating a student, the generated
MongoDB ID is used as the student's ID for backwards compatibility. Existing
students without a `studentId` can continue to sign in with their MongoDB ID.

`GET /api/admin/records` lists student names/emails/IDs and course titles/IDs.
Each student record includes their assigned course IDs, inferred branch, and
per-course completed-week progress for the admin dashboard and certificates.
It intentionally never returns student password values or password hashes.
`GET /api/student/dashboard` returns populated assigned courses in both the
top-level `courses` array and `student.courses`, with `student.assignedCourseCount`
for clients that need the current assignment count.
Admins can set a new student password using
`PATCH /api/admin/students/:studentId/password` with a `password` value of at
least 12 characters. The server stores only a salted password hash and never
returns the new password or hash.
Admins can delete a student and their associated progress using
`DELETE /api/admin/students/:studentId`; the operation is performed in a
MongoDB transaction.
Admins can delete a course using `DELETE /api/admin/courses/:courseId`. This
transaction also removes the course's student progress records and assignment
references.
Admins can unassign a course from a student using
`DELETE /api/admin/students/:studentId/courses/:courseId`; this also removes
that student's progress for the course in a MongoDB transaction.
`POST /api/admin/assign-course` accepts the student's custom `studentId` (or
legacy MongoDB ID) and a course `courseId`.
`POST /api/admin/assign-custom-task` accepts `studentId`, `courseId`, and
`customTask`. To create a student, omit `studentId` and provide `newStudentName`,
`newStudentEmail`, and `newStudentPassword`; provide `studentId` to use a custom
roll number, or omit it to use the generated MongoDB ID. To create a course, omit
`courseId` and provide `newCourseTitle`. Assigned courses receive an eight-week
syllabus. `GET /api/student/courses/:courseId/modules/:weekIndex` loads or
generates the selected unlocked week's seven lessons, explanations, examples,
and five-question quiz, along with its unlock status. The same authenticated
handler is also available at `GET /student/courses/:courseId/modules/:weekIndex`
for clients that do not use the `/api` prefix.
`POST /api/student/courses/:courseId/modules/:weekIndex/quiz` evaluates the
week's answers and saves passing weeks in the student's `completedWeeks`
progress and completion timestamp. Week 1 is available at course start; each
following week remains locked until seven days after the previous week is
passed. The API enforces this delay for both module retrieval and quiz
submission. Student progress and course completion are saved per student and
course. Once all eight weeks are complete,
`GET /api/student/courses/:courseId/certificate` downloads a course completion
PDF. Without `GEMINI_API_KEY`, the app uses
clearly labeled starter content. Only passing a weekly quiz marks the week
complete and unlocks the next one; passing Week 8 records course completion.
Assignment submissions may still be evaluated, but do not advance weekly progress.
