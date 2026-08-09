const mongoose = require('mongoose');
require('dotenv').config();
const Task = require('./models/Task');

const express = require('express');
const app = express();

app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error(err));

// Logging middleware — sabhi requests ko log karta hai
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// GET /tasks — sab tasks dikhao
app.get('/tasks', async (req, res) => {
  const tasks = await Task.find();
  res.status(200).json(tasks);
});

// POST /tasks — naya task banao
app.post('/tasks', async (req, res) => {
  const newTask = await Task.create(req.body);
  res.status(201).json(newTask);
});

// PUT /tasks/:id — task update karo
app.put('/tasks/:id', async (req, res) => {
  const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  if (!updatedTask) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(200).json(updatedTask);
});

// DELETE /tasks/:id — task delete karo
app.delete('/tasks/:id', async (req, res) => {
  const deletedTask = await Task.findByIdAndDelete(req.params.id);

  if (!deletedTask) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(200).json({ message: 'Task deleted successfully' });
});

// 404 handler — jab koi route match na ho (supplementary requirement)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — hamesha SABSE LAST hona chahiye
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(5000, () => {
  console.log('Server running on port 5000');
});