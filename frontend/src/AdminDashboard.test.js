import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';

jest.mock('jspdf', () => {
  const jsPDF = jest.fn().mockImplementation(function createPdfMock() {
    Object.assign(this, {
      internal: {
        pageSize: { getWidth: () => 297, getHeight: () => 210 },
      },
      setFillColor: jest.fn(),
      rect: jest.fn(),
      setDrawColor: jest.fn(),
      setLineWidth: jest.fn(),
      circle: jest.fn(),
      setTextColor: jest.fn(),
      setFont: jest.fn(),
      setFontSize: jest.fn(),
      text: jest.fn(),
      line: jest.fn(),
      save: jest.fn(),
    });
  });

  return { jsPDF };
});

const originalFetch = global.fetch;
const originalConfirm = global.confirm;

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
  global.confirm = originalConfirm;
});

test('displays existing student and course identifiers from the admin records API', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () =>
      Promise.resolve(
        JSON.stringify({
          students: [
            {
              _id: '0123456789abcdef01234567',
              studentId: '0131AD231067',
              name: 'Taylor Student',
              email: 'taylor@example.com',
              assignedCourses: ['abcdef0123456789abcdef01'],
            },
          ],
          courses: [
            { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
            { _id: 'abcdef0123456789abcdef02', title: ' python basics ' },
          ],
        })
      ),
  });

  render(<AdminDashboard />);

  expect(
    await screen.findByRole('tab', { name: 'Assign Course / New Student' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Assign Course to Student' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Add New Student / Custom Task' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Existing Students Directory' })
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Taylor Student')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('tab', { name: 'Existing Students Directory' })
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Existing Students Directory',
    })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Assign Course to Student' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Add New Student / Custom Task' })
  ).not.toBeInTheDocument();
  expect(await screen.findAllByText('Taylor Student')).not.toHaveLength(0);
  expect(screen.getByText('taylor@example.com')).toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: 'Remove Python Basics from Taylor Student',
    })
  ).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Password' })).toBeInTheDocument();
  expect(
    screen.getByLabelText('Password value hidden for security')
  ).toBeInTheDocument();
  expect(screen.getByRole('table').className).toContain('table-fixed');
  expect(screen.getAllByText('0131AD231067')).not.toHaveLength(0);
  fireEvent.click(screen.getByRole('tab', { name: 'Courses' }));
  expect(
    within(screen.getByRole('table')).getAllByText('Python Basics')
  ).toHaveLength(1);
  expect(screen.getByText('abcdef0123456789abcdef01')).toBeInTheDocument();
  expect(
    screen.queryByText('abcdef0123456789abcdef02')
  ).not.toBeInTheDocument();
});

test('assigns a course using a custom student ID', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(jsonResponse({ students: [], courses: [] }))
    .mockResolvedValueOnce(jsonResponse({ success: true }))
    .mockResolvedValueOnce(jsonResponse({ students: [], courses: [] }));
  render(<AdminDashboard />);
  fireEvent.change(await screen.findByLabelText('Student ID (Roll Number)'), {
    target: { value: '0131AD231067' },
  });
  fireEvent.change(screen.getByLabelText('Course ID'), {
    target: { value: 'abcdef0123456789abcdef01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Assign Course' }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/assign-course',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          studentId: '0131AD231067',
          courseId: 'abcdef0123456789abcdef01',
        }),
      })
    );
  });
  alert.mockRestore();
});

test('allows an admin to set a new password without exposing the current one', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        students: [
          {
            _id: '0123456789abcdef01234567',
            name: 'Taylor Student',
            email: 'taylor@example.com',
          },
        ],
        courses: [],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: 'Student password updated successfully.',
        studentId: '0123456789abcdef01234567',
      })
    );

  render(<AdminDashboard />);
  fireEvent.click(
    await screen.findByRole('tab', { name: 'Existing Students Directory' })
  );

  const passwordInput = await screen.findByLabelText(
    'New password for Taylor Student'
  );
  fireEvent.change(passwordInput, {
    target: { value: 'new-secure-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  expect(
    await screen.findByText('Student password updated successfully.')
  ).toBeInTheDocument();
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/admin/students/0123456789abcdef01234567/password',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ password: 'new-secure-password' }),
      })
    );
  });
  expect(passwordInput).toHaveValue('');
  expect(screen.queryByText('new-secure-password')).not.toBeInTheDocument();
});

test('confirms student deletion and removes the student from the table', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.confirm = jest.fn().mockReturnValue(true);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        students: [
          {
            _id: '0123456789abcdef01234567',
            name: 'Taylor Student',
            email: 'taylor@example.com',
          },
        ],
        courses: [],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: 'Student and associated progress deleted successfully.',
        studentId: '0123456789abcdef01234567',
      })
    );

  render(<AdminDashboard />);
  fireEvent.click(
    await screen.findByRole('tab', { name: 'Existing Students Directory' })
  );
  const deleteButton = await screen.findByRole('button', {
    name: 'Delete Student',
  });
  fireEvent.click(deleteButton);

  expect(global.confirm).toHaveBeenCalledWith(
    'Delete Taylor Student and all associated course progress? This cannot be undone.'
  );
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/admin/students/0123456789abcdef01234567',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(screen.queryByText('Taylor Student')).not.toBeInTheDocument();
  });
});

test('does not send a delete request when the admin cancels confirmation', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.confirm = jest.fn().mockReturnValue(false);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
      students: [
        {
          _id: '0123456789abcdef01234567',
          name: 'Taylor Student',
          email: 'taylor@example.com',
        },
      ],
      courses: [],
    })
  );

  render(<AdminDashboard />);
  fireEvent.click(
    await screen.findByRole('tab', { name: 'Existing Students Directory' })
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete Student' })
  );

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Taylor Student')).toBeInTheDocument();
});

test('confirms course deletion, sends the request, and removes the course row', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.confirm = jest.fn().mockReturnValue(true);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        students: [],
        courses: [
          { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: 'Course and associated progress deleted successfully.',
        courseId: 'abcdef0123456789abcdef01',
      })
    );

  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Courses' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete course Python Basics' })
  );

  expect(global.confirm).toHaveBeenCalledWith(
    'Delete "Python Basics" and all associated student progress? This cannot be undone.'
  );
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/admin/courses/abcdef0123456789abcdef01',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(
      within(screen.getByRole('table')).queryByText('Python Basics')
    ).not.toBeInTheDocument();
  });
});

test('shows course progress and generates a PDF certificate after eight weeks', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
      students: [
        {
          _id: '0123456789abcdef01234567',
          studentId: '0131AD231067',
          branch: 'Artificial Intelligence and Data Science (AIDS)',
          name: 'Taylor Student',
          assignedCourses: ['abcdef0123456789abcdef01'],
          courseProgress: [
            {
              courseId: 'abcdef0123456789abcdef01',
              completedWeeks: [0, 1, 2, 3, 4, 5, 6, 7],
              completedWeekCount: 8,
              courseCompleted: true,
            },
          ],
        },
      ],
      courses: [
        { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
      ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ success: true, certificateIssued: true })
    );

  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Certificates' }));

  expect(
    await screen.findByText('8/8', { exact: true })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Student Name' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Actions' })
  ).toBeInTheDocument();
  expect(
    screen.getByText('Completed / Eligible')
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Unlock / Issue Certificate' })
  );
  await screen.findByRole('button', { name: 'Download Certificate' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Download Certificate' })
  );

  const { jsPDF } = require('jspdf');
  expect(jsPDF).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    '/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01/certificate',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ certificateIssued: true }),
    })
  );
});

test('lists assigned students without progress and defaults their certificate progress to zero', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse({
      students: [
        {
          _id: '0123456789abcdef01234567',
          studentId: '0131AD231067',
          name: 'sanvi saahu',
          assignedCourses: ['abcdef0123456789abcdef01'],
          courseProgress: [],
        },
      ],
      courses: [
        { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
      ],
    })
  );

  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Certificates' }));

  expect(await screen.findByText('sanvi saahu')).toBeInTheDocument();
  expect(screen.getAllByText('0131AD231067')).not.toHaveLength(0);
  expect(
    screen.getByText('Artificial Intelligence and Data Science (AIDS)')
  ).toBeInTheDocument();
  expect(screen.getByText('0/8', { exact: true })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Unlock / Issue Certificate' })
  ).toBeInTheDocument();
});

test('issues a certificate for a student and exposes the download action', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
      students: [
        {
          _id: '0123456789abcdef01234567',
          studentId: '0131AD231067',
          branch: 'Artificial Intelligence and Data Science (AIDS)',
          name: 'Taylor Student',
          courseProgress: [
            {
              courseId: 'abcdef0123456789abcdef01',
              completedWeeks: [0, 1],
              completedWeekCount: 2,
              courseCompleted: false,
            },
          ],
        },
      ],
      courses: [
        { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
      ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ success: true, certificateIssued: true })
    );

  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Certificates' }));

  expect(
    await screen.findByText('2/8', { exact: true })
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Unlock / Issue Certificate' })
  );

  expect(
    await screen.findByRole('button', { name: 'Download Certificate' })
  ).toBeInTheDocument();
  expect(screen.getByText('Issued by admin')).toBeInTheDocument();
  expect(screen.getByText('8/8', { exact: true })).toBeInTheDocument();

  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    '/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01/certificate',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ certificateIssued: true }),
    })
  );
});

test('revokes a certificate and resets the student course progress', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        students: [
          {
            _id: '0123456789abcdef01234567',
            studentId: '0131AD231067',
            name: 'Taylor Student',
            assignedCourses: ['abcdef0123456789abcdef01'],
            courseProgress: [
              {
                courseId: 'abcdef0123456789abcdef01',
                completedWeeks: [0, 1, 2, 3, 4, 5, 6, 7],
                completedWeekCount: 8,
                courseCompleted: true,
                certificateIssued: true,
              },
            ],
          },
        ],
        courses: [
          { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ success: true, certificateIssued: false })
    );

  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Certificates' }));

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Revoke / Lock Certificate',
    })
  );

  expect(await screen.findByText('In progress')).toBeInTheDocument();
  expect(screen.getByText('0/8', { exact: true })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Unlock / Issue Certificate' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Download Certificate' })
  ).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    '/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01/certificate',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ certificateIssued: false }),
    })
  );
});

test('removes a course from a student after successful unassignment', async () => {
  const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.confirm = jest.fn().mockReturnValue(true);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        students: [
          {
            _id: '0123456789abcdef01234567',
            name: 'Taylor Student',
            email: 'taylor@example.com',
            assignedCourses: ['abcdef0123456789abcdef01'],
          },
        ],
        courses: [
          { _id: 'abcdef0123456789abcdef01', title: 'Python Basics' },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: 'Course unassigned and student progress removed successfully.',
        studentId: '0123456789abcdef01234567',
        courseId: 'abcdef0123456789abcdef01',
      })
    );

  render(<AdminDashboard />);
  fireEvent.click(
    await screen.findByRole('tab', { name: 'Existing Students Directory' })
  );
  const removeButton = await screen.findByRole('button', {
    name: 'Remove Python Basics from Taylor Student',
  });
  fireEvent.click(removeButton);

  expect(global.confirm).toHaveBeenCalledWith(
    'Remove "Python Basics" from this student and delete their progress for this course?'
  );
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/admin/students/0123456789abcdef01234567/courses/abcdef0123456789abcdef01',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(
      screen.queryByRole('button', {
        name: 'Remove Python Basics from Taylor Student',
      })
    ).not.toBeInTheDocument();
  });
  expect(screen.getByText('No courses assigned')).toBeInTheDocument();
});
