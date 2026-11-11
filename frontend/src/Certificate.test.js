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
    expect(screen.getByLabelText('Course title')).toHaveClass('border');
    expect(screen.getByText('SPARSH SHRIVASTAVA')).toHaveClass('font-bold');
    expect(
      screen.getByText(
        'of the Department of Computer Science & Engineering (Artificial Intelligence & Data Science), JNCT, Bhopal, for successfully completing an 8-week online course.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'We appreciate the dedication, commitment and enthusiasm demonstrated during the course and wish the student continued success in future academic and professional endeavors.'
      )
    ).toBeInTheDocument();
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
