const mongoose = require('mongoose');
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const Task = require('./models/Task');
const authRoutes = require('./routes/authRoutes');
const { protect } = require('./middleware/authMiddleware');
const validateTask = require('./middleware/validateTask');
const cache = require('./cache');

const app = express();

app.use(cors());
app.use(express.json());

// ---------- HEALTH CHECK ROUTE ----------
// Used by automated tests and CI/CD pipeline
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Task Manager API is running'
  });
});

// ---------- TIMING + LOGGING MIDDLEWARE ----------
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const cacheInfo = res.locals.cacheStatus
      ? ` | cache: ${res.locals.cacheStatus}`
      : '';

    console.log(
      `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms${cacheInfo}`
    );
  });

  next();
});

// ---------- CACHE STATISTICS ----------
const cacheStats = {
  hits: 0,
  misses: 0
};

// ---------- AUTH ROUTES ----------
app.use('/auth', authRoutes);

// ---------- GET ALL TASKS ----------
app.get('/tasks', protect, async (req, res, next) => {
  try {
    const {
      status,
      priority,
      sortBy,
      order,
      page,
      limit,
      search
    } = req.query;

    const hasFilters =
      status || priority || sortBy || order || page || limit || search;

    const bypassCache = req.query.nocache === 'true';

    if (!hasFilters && !bypassCache) {
      const cached = cache.get('all_tasks');

      if (cached) {
        cacheStats.hits++;
        res.locals.cacheStatus = 'HIT';

        return res.status(200).json({
          ...cached,
          cacheStatus: 'HIT'
        });
      }

      cacheStats.misses++;
    }

    const filter = {};

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    if (search) {
      filter.title = {
        $regex: search,
        $options: 'i'
      };
    }

    const sortOrder = order === 'desc' ? -1 : 1;

    const sortOptions = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tasks = await Task.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const total = await Task.countDocuments(filter);

    const responseData = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: tasks.length,
      tasks
    };

    if (!hasFilters && !bypassCache) {
      cache.set('all_tasks', responseData);
    }

    const cacheStatus = bypassCache ? 'BYPASSED' : 'MISS';

    res.locals.cacheStatus = cacheStatus;

    res.status(200).json({
      ...responseData,
      cacheStatus
    });
  } catch (err) {
    next(err);
  }
});

// ---------- GET TASK BY ID ----------
app.get('/tasks/:id', protect, async (req, res, next) => {
  try {
    const cacheKey = `task_${req.params.id}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      cacheStats.hits++;
      res.locals.cacheStatus = 'HIT';

      return res.status(200).json({
        ...cached,
        cacheStatus: 'HIT'
      });
    }

    cacheStats.misses++;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    cache.set(cacheKey, task.toObject());

    res.locals.cacheStatus = 'MISS';

    res.status(200).json({
      ...task.toObject(),
      cacheStatus: 'MISS'
    });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'Invalid task ID format'
      });
    }

    next(err);
  }
});

// ---------- CREATE TASK ----------
app.post('/tasks', protect, validateTask, async (req, res, next) => {
  try {
    const newTask = await Task.create(req.body);

    cache.del('all_tasks');

    res.status(201).json(newTask);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: err.message
      });
    }

    next(err);
  }
});

// ---------- UPDATE TASK ----------
app.put('/tasks/:id', protect, validateTask, async (req, res, next) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedTask) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    cache.del('all_tasks');
    cache.del(`task_${req.params.id}`);

    res.status(200).json(updatedTask);
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'Invalid task ID format'
      });
    }

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: err.message
      });
    }

    next(err);
  }
});

// ---------- DELETE TASK ----------
app.delete('/tasks/:id', protect, async (req, res, next) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);

    if (!deletedTask) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    cache.del('all_tasks');
    cache.del(`task_${req.params.id}`);

    res.status(200).json({
      message: 'Task deleted successfully'
    });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'Invalid task ID format'
      });
    }

    next(err);
  }
});

// ---------- CACHE STATISTICS ----------
app.get('/debug/cache-stats', (req, res) => {
  res.status(200).json({
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    activeKeys: cache.keys()
  });
});

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

// ---------- GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    error: 'Something went wrong'
  });
});

// ---------- START SERVER ----------
// Start MongoDB and HTTP server only when executing server.js directly.
// Automated tests can import the Express app without connecting to MongoDB.

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not configured in the environment.');
    process.exitCode = 1;
  } else {
    mongoose
      .connect(process.env.MONGO_URI)
      .then(() => {
        console.log('MongoDB connected');

        app.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`);
        });
      })
      .catch((err) => {
        console.error(
          'MongoDB connection failed:',
          err.message
        );

        process.exitCode = 1;
      });
  }
}

// Export Express app for automated testing
module.exports = app;