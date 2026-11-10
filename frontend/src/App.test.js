import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

function apiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url === '/api/auth/me' || url === '/api/student/me') {
      return Promise.resolve(apiResponse({ error: 'Sign-in required.' }, 401));
    }
    if (url === '/api/admin/records') {
      return Promise.resolve(apiResponse({ students: [], courses: [] }));
    }
    if (url === '/api/student/dashboard') {
      return Promise.resolve(
        apiResponse({ student: { name: 'Student', email: 'student@example.com' }, courses: [] })
      );
    }
    return Promise.resolve(apiResponse({ authenticated: true }));
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('offers distinct admin and student sign-in forms', async () => {
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument();
  expect(screen.getByText('JNCT Completions')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Student' }));
  expect(screen.getByRole('heading', { name: 'Student sign-in' })).toBeInTheDocument();
  expect(screen.getByLabelText('Student ID or Email')).toBeInTheDocument();
});

test('signs in the admin before showing the dashboard', async () => {
  render(<App />);

  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(
    await screen.findByRole('heading', { name: 'Admin Dashboard' })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/auth/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'admin@example.com', password: 'password' }),
    })
  );
});

test('signs in students with their ID and password and loads their dashboard', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Student' }));
  fireEvent.change(screen.getByLabelText('Student ID or Email'), {
    target: { value: '0123456789abcdef01234567' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'student-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Welcome, Student')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/student/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        studentId: '0123456789abcdef01234567',
        password: 'student-password',
      }),
    })
  );
  expect(global.fetch).not.toHaveBeenCalledWith(
    '/api/admin/assign-course',
    expect.anything()
  );
});

test('signs in students with their email and password', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Student' }));
  fireEvent.change(screen.getByLabelText('Student ID or Email'), {
    target: { value: 'student@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'student-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Welcome, Student')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/student/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'student@example.com',
        password: 'student-password',
      }),
    })
  );
});
