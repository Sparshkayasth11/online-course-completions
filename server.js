const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { getStudentCourseModule } = require('./learningRoutes');
const { requireStudent, validateAuthConfig } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.get(
  '/student/courses/:courseId/modules/:weekIndex',
  requireStudent,
  getStudentCourseModule
);
app.use('/api', (req, res) => {
  return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    return next(error);
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  console.error('API request failed:', error.message);
  return res.status(500).json({ error: 'An unexpected API error occurred.' });
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

async function startServer() {
  const mongoUri = process.env.MONGO_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured.');
  }
  validateAuthConfig();

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB successfully.');

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB connection disconnected.');
  });

  return app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Unable to start server:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
