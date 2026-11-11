import { fireEvent, render, screen } from '@testing-library/react';
import Certificate from './Certificate';

describe('Certificate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders the provided certificate details', () => {
    render(
      <Certificate
        courseTitle="FRONTEND DEVELOPER"
        enrollmentNumber="0131AD231067"
        issueDate="11 November 2026"
        studentName="SPARSH SHRIVASTAVA"
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Certificate of Completion' })
    ).toBeInTheDocument();
    expect(screen.getByText('SPARSH SHRIVASTAVA')).toBeInTheDocument();
    expect(screen.getByText('Enrollment Number: 0131AD231067')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FRONTEND DEVELOPER' })).toBeInTheDocument();
    expect(screen.getByText('11 November 2026')).toBeInTheDocument();
    expect(screen.getByText('Prof. Ravinder Tanwar')).toBeInTheDocument();
  });

  test('uses the sample certificate values when props are omitted', () => {
    render(<Certificate />);

    expect(screen.getByText('SPARSH SHRIVASTAVA')).toBeInTheDocument();
    expect(screen.getByText('Enrollment Number: 0131AD231067')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FRONTEND DEVELOPER' })).toBeInTheDocument();
    expect(screen.getByText('11 November 2026')).toBeInTheDocument();
  });

  test('prints the certificate from its action button', () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    render(<Certificate />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Download Certificate' })
    );

    expect(print).toHaveBeenCalledTimes(1);
  });
});
