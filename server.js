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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error(err));

// Timing + logging middleware — har request ka method, URL, status, response time aur cache status print karta hai
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const cacheInfo = res.locals.cacheStatus ? ` | cache: ${res.locals.cacheStatus}` : '';
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms${cacheInfo}`);
  });
  next();
});

// Cache hit/miss counter (supplementary requirement)
const cacheStats = { hits: 0, misses: 0 };

// ---------- AUTH ROUTES ----------
app.use('/auth', authRoutes);

// ---------- TASK ROUTES ----------

// GET /tasks — filters ke bina "plain" request cache hoti hai. ?nocache=true se caching bypass ho sakta hai (comparison ke liye)
app.get('/tasks', protect, async (req, res, next) => {
  try {
    const { status, priority, sortBy, order, page, limit, search } = req.query;
    const hasFilters = status || priority || sortBy || order || page || limit || search;
    const bypassCache = req.query.nocache === 'true';

    if (!hasFilters && !bypassCache) {
      const cached = cache.get('all_tasks');
      if (cached) {
        cacheStats.hits++;
        res.locals.cacheStatus = 'HIT';
        return res.status(200).json({ ...cached, cacheStatus: 'HIT' });
      }
      cacheStats.misses++;
    }

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortOptions = sortBy ? { [sortBy]: sortOrder } : { createdAt: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tasks = await Task.find(filter).sort(sortOptions).skip(skip).limit(limitNum);
    const total = await Task.countDocuments(filter);

    const responseData = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: tasks.length,
      tasks,
    };

    if (!hasFilters && !bypassCache) {
      cache.set('all_tasks', responseData);
    }

    const status_ = bypassCache ? 'BYPASSED' : 'MISS';
    res.locals.cacheStatus = status_;
    res.status(200).json({ ...responseData, cacheStatus: status_ });
  } catch (err) {
    next(err);
  }
});

// GET /tasks/:id — single task ko alag se cache karo
app.get('/tasks/:id', protect, async (req, res, next) => {
  try {
    const cacheKey = `task_${req.params.id}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      cacheStats.hits++;
      res.locals.cacheStatus = 'HIT';
      return res.status(200).json({ ...cached, cacheStatus: 'HIT' });
    }
    cacheStats.misses++;

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    cache.set(cacheKey, task.toObject());
    res.locals.cacheStatus = 'MISS';
    res.status(200).json({ ...task.toObject(), cacheStatus: 'MISS' });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }
    next(err);
  }
});

// POST /tasks — create karke cache invalidate karo
app.post('/tasks', protect, validateTask, async (req, res, next) => {
  try {
    const newTask = await Task.create(req.body);
    cache.del('all_tasks');
    res.status(201).json(newTask);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// PUT /tasks/:id — update karke cache invalidate karo
app.put('/tasks/:id', protect, validateTask, async (req, res, next) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    cache.del('all_tasks');
    cache.del(`task_${req.params.id}`);

    res.status(200).json(updatedTask);
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /tasks/:id — delete karke cache invalidate karo
app.delete('/tasks/:id', protect, async (req, res, next) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    cache.del('all_tasks');
    cache.del(`task_${req.params.id}`);

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }
    next(err);
  }
});

// Debug endpoint — cache hit/miss counter (supplementary requirement)
app.get('/debug/cache-stats', (req, res) => {
  res.status(200).json({
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    activeKeys: cache.keys(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});