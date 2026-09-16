const mongoose = require('mongoose');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const Task = require('./models/Task');
const authRoutes = require('./routes/authRoutes');
const { protect } = require('./middleware/authMiddleware');
const validateTask = require('./middleware/validateTask');

const app = express();

app.use(cors()); // React frontend se requests allow karne ke liye
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error(err));

// Logging middleware — sabhi requests ko log karta hai
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// ---------- AUTH ROUTES (public) ----------
app.use('/auth', authRoutes);

// ---------- TASK ROUTES (protected — JWT token zaroori hai) ----------

// GET /tasks — sab tasks dikhao (with filtering, sorting, pagination)
app.get('/tasks', protect, async (req, res, next) => {
  try {
    const { status, priority, sortBy, order, page, limit, search } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortOptions = sortBy ? { [sortBy]: sortOrder } : { createdAt: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tasks = await Task.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const total = await Task.countDocuments(filter);

    res.status(200).json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    next(err);
  }
});

// GET /tasks/:id — ek single task dikhao
app.get('/tasks/:id', protect, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json(task);
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }
    next(err);
  }
});

// POST /tasks — naya task banao
app.post('/tasks', protect, validateTask, async (req, res, next) => {
  try {
    const newTask = await Task.create(req.body);
    res.status(201).json(newTask);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// PUT /tasks/:id — task update karo
app.put('/tasks/:id', protect, validateTask, async (req, res, next) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

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

// DELETE /tasks/:id — task delete karo
app.delete('/tasks/:id', protect, async (req, res, next) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }
    next(err);
  }
});

// 404 handler — jab koi route match na ho
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — hamesha SABSE LAST hona chahiye
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});