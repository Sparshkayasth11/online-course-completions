import React from 'react';

const Certificate = ({ studentName, enrollmentNumber, courseTitle, issueDate }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      {/* Certificate Container */}
      <div className="w-full max-w-4xl bg-white border-8 border-double border-blue-900 p-8 md:p-12 shadow-2xl relative print:shadow-none print:border-blue-900">
        
        {/* Header */}
        <div className="text-center border-b-2 border-gray-200 pb-6 mb-6">
          <h2 className="text-sm font-semibold tracking-widest text-blue-800 uppercase">JNCT</h2>
          <h1 className="text-xl font-bold tracking-wider text-gray-800 uppercase">LNCT Group of College</h1>
          <p className="text-xs text-gray-500 tracking-widest mt-1">ONLINE COURSE COMPLETION</p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-blue-900 mt-2 uppercase tracking-wide">Certificate of Completion</h3>
        </div>

        {/* Body Content */}
        <div className="text-center my-6">
          <p className="text-gray-600 italic text-sm md:text-base">This certificate is proudly presented to</p>
          
          <div className="my-4">
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 uppercase tracking-wider border-b-2 border-blue-900 inline-block pb-1 px-6">
              {studentName || "SPARSH SHRIVASTAVA"}
            </h1>
          </div>

          <p className="text-gray-700 font-semibold text-sm md:text-base mt-2">
            Enrollment Number: <span className="text-gray-900">{enrollmentNumber || "0131AD231067"}</span>
          </p>

          <p className="text-gray-600 text-xs md:text-sm max-w-2xl mx-auto mt-3 leading-relaxed">
            of the Department of Computer Science & Engineering (Artificial Intelligence & Data Science), JNCT, Bhopal, for successfully completing an 8-week online course.
          </p>
        </div>

        {/* Course Title Section */}
        <div className="my-6 text-center bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-xl mx-auto">
          <p className="text-xs font-bold text-blue-800 tracking-widest uppercase">Course Title</p>
          <h2 className="text-xl md:text-2xl font-extrabold text-blue-950 mt-1 uppercase">
            {courseTitle || "Frontend Developer"}
          </h2>
        </div>

        {/* Course Details Grid */}
        <div className="my-6 max-w-xl mx-auto border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="grid grid-cols-2 bg-gray-50 px-4 py-2 border-b border-gray-200 font-semibold text-gray-700">
            <div>Course Detail</div>
            <div>Information</div>
          </div>
          <div className="grid grid-cols-2 px-4 py-1.5 border-b border-gray-100 text-gray-600">
            <div>Course Duration</div>
            <div className="font-medium text-gray-800">8 Weeks</div>
          </div>
          <div className="grid grid-cols-2 px-4 py-1.5 border-b border-gray-100 text-gray-600">
            <div>Department</div>
            <div className="font-medium text-gray-800">Artificial Intelligence & Data Science</div>
          </div>
          <div className="grid grid-cols-2 px-4 py-1.5 border-b border-gray-100 text-gray-600">
            <div>Course Mode</div>
            <div className="font-medium text-gray-800">Online</div>
          </div>
          <div className="grid grid-cols-2 px-4 py-1.5 border-b border-gray-100 text-gray-600">
            <div>Issue Date</div>
            <div className="font-medium text-gray-800">{issueDate || "11 November 2026"}</div>
          </div>
          <div className="grid grid-cols-2 px-4 py-1.5 text-gray-600">
            <div>Institution</div>
            <div className="font-medium text-gray-800">JNCT, Bhopal</div>
          </div>
        </div>

        {/* Closing Statement */}
        <p className="text-center text-gray-500 text-xs md:text-sm max-w-2xl mx-auto my-4 leading-relaxed">
          We appreciate the dedication, commitment and enthusiasm demonstrated during the course and wish the student continued success in future academic and professional endeavors.
        </p>

        {/* Footer / Signatory */}
        <div className="mt-8 flex justify-between items-end px-6">
          <div className="text-left text-xs text-gray-400">
            <p>Verified Online Certification</p>
            <p>JNCT Completions Portal</p>
          </div>
          <div className="text-right">
            <div className="mb-2 font-serif text-lg font-bold text-blue-900 tracking-wider">Prof. Ravinder Tanwar</div>
            <div className="border-t border-gray-400 pt-1 text-xs font-semibold text-gray-700 uppercase">
              Authorized Signatory
            </div>
            <div className="text-xs text-gray-500">HOD, CSE (AI&DS)</div>
            <div className="text-xs text-gray-500">JNCT, Bhopal</div>
          </div>
        </div>
      </div>

      {/* Print Button (Hidden on Print) */}
      <div className="mt-6 print:hidden">
        <button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg transition duration-200"
        >
          Download / Print Certificate
        </button>
      </div>
    </div>
  );
};

export default Certificate;
