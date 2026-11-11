import './Certificate.css';

const DEFAULT_CERTIFICATE = {
  studentName: 'SPARSH SHRIVASTAVA',
  enrollmentNumber: '0131AD231067',
  courseTitle: 'FRONTEND DEVELOPER',
  issueDate: '11 November 2026',
};

function Certificate({
  studentName = DEFAULT_CERTIFICATE.studentName,
  enrollmentNumber = DEFAULT_CERTIFICATE.enrollmentNumber,
  courseTitle = DEFAULT_CERTIFICATE.courseTitle,
  issueDate = DEFAULT_CERTIFICATE.issueDate,
}) {
  return (
    <main className="certificate-shell min-h-screen px-4 py-8 sm:px-8 sm:py-10">
      <div className="certificate-toolbar mx-auto mb-5 flex max-w-[215.9mm] justify-end">
        <button
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          onClick={() => window.print()}
          type="button"
        >
          Download Certificate
        </button>
      </div>

      <article
        aria-label={`Certificate of completion for ${studentName}`}
        className="certificate-page mx-auto flex flex-col"
      >
        <header className="certificate-header flex flex-col items-center text-center">
          <svg
            aria-hidden="true"
            className="certificate-seal"
            viewBox="0 0 64 64"
          >
            <circle cx="32" cy="32" r="29" fill="#f7f1e4" stroke="#b48b47" strokeWidth="2" />
            <circle cx="32" cy="32" r="24" fill="none" stroke="#17334b" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="18" fill="#17334b" />
            <circle cx="32" cy="32" r="10" fill="#8a3d3d" />
            <path d="M32 22l2.8 7.2L42 32l-7.2 2.8L32 42l-2.8-7.2L22 32l7.2-2.8z" fill="#d4b77a" />
            <circle cx="10" cy="32" r="1.5" fill="#17334b" />
            <circle cx="54" cy="32" r="1.5" fill="#17334b" />
          </svg>
          <p className="certificate-institution mt-1 text-[10px] font-bold uppercase">
            JNCT
          </p>
          <p className="certificate-group text-[7px] font-semibold uppercase">
            LNCT GROUP OF COLLEGE
          </p>
          <p className="certificate-kicker mt-7 text-[10px] font-bold uppercase">
            ONLINE COURSE COMPLETION
          </p>
          <h1 className="certificate-heading mt-2 text-center text-2xl uppercase sm:text-3xl">
            Certificate of Completion
          </h1>
          <span aria-hidden="true" className="certificate-rule mt-4" />
        </header>

        <section className="certificate-recipient mt-5 text-center">
          <p className="certificate-body text-[13px]">
            This certificate is proudly presented to
          </p>
          <p className="certificate-recipient-name mt-4 break-words text-3xl font-bold uppercase sm:text-4xl">
            {studentName}
          </p>
          <p className="certificate-enrollment mt-2 text-[11px]">
            Enrollment Number: {enrollmentNumber}
          </p>
          <p className="certificate-body mx-auto mt-4 max-w-[175mm] text-[12px] leading-5">
            of the Department of Computer Science &amp; Engineering (Artificial
            Intelligence &amp; Data Science), JNCT, Bhopal, for successfully
            completing an 8-week online course.
          </p>
        </section>

        <section
          aria-label="Course title"
          className="certificate-course mx-auto mt-8 w-full max-w-[150mm] border border-[#bca77d] bg-[#f7f1e4] px-5 py-4 text-center"
        >
          <p className="certificate-course-label text-[9px] font-bold uppercase">
            Course Title
          </p>
          <h2 className="certificate-course-title mt-2 break-words text-2xl font-bold uppercase sm:text-3xl">
            {courseTitle}
          </h2>
        </section>

        <section aria-labelledby="certificate-details-heading" className="mt-6">
          <h2
            className="certificate-details-heading text-center text-sm font-bold"
            id="certificate-details-heading"
          >
            Course Details
          </h2>
          <table className="certificate-details mt-3 w-full table-fixed border-collapse text-left text-[10px]">
            <thead>
              <tr>
                <th className="w-1/3 px-2 py-2 font-bold" scope="col">
                  Course Detail
                </th>
                <th className="px-2 py-2 font-bold" scope="col">
                  Information
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="px-2 py-2 font-semibold" scope="row">
                  Course Duration
                </th>
                <td className="px-2 py-2">8 Weeks</td>
              </tr>
              <tr>
                <th className="px-2 py-2 font-semibold" scope="row">
                  Department
                </th>
                <td className="px-2 py-2">
                  Artificial Intelligence &amp; Data Science
                </td>
              </tr>
              <tr>
                <th className="px-2 py-2 font-semibold" scope="row">
                  Course Mode
                </th>
                <td className="px-2 py-2">Online</td>
              </tr>
              <tr>
                <th className="px-2 py-2 font-semibold" scope="row">
                  Issue Date
                </th>
                <td className="px-2 py-2">{issueDate}</td>
              </tr>
              <tr>
                <th className="px-2 py-2 font-semibold" scope="row">
                  Institution
                </th>
                <td className="px-2 py-2">JNCT, Bhopal</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p className="certificate-body mt-5 text-[11px] leading-5">
          We appreciate the dedication, commitment and enthusiasm demonstrated
          during the course and wish the student continued success in future
          academic and professional endeavors.
        </p>

        <footer className="certificate-signatory mt-auto pt-8 text-right">
          <span aria-hidden="true" className="certificate-signature-rule" />
          <p className="mt-2 text-[11px] font-semibold">Authorized Signatory</p>
          <p className="certificate-signatory-name mt-1 text-[12px] font-bold">
            Prof. Ravinder Tanwar
          </p>
          <p className="text-[10px]">HOD, CSE (AI&amp;DS)</p>
          <p className="text-[10px]">JNCT, Bhopal</p>
        </footer>
      </article>
    </main>
  );
}

export default Certificate;
