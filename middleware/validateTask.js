    // Task create/update se pehle input validate karta hai
const validateTask = (req, res, next) => {
  const { title, status, priority } = req.body;

  const errors = [];

  // POST ke liye title zaroori hai, PUT me optional (partial update allowed)
  if (req.method === 'POST') {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      errors.push('Title is required and must be a non-empty string');
    }
  } else if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      errors.push('Title must be a non-empty string');
    }
  }

  const allowedStatus = ['pending', 'in-progress', 'completed'];
  if (status !== undefined && !allowedStatus.includes(status)) {
    errors.push(`Status must be one of: ${allowedStatus.join(', ')}`);
  }

  const allowedPriority = ['low', 'medium', 'high'];
  if (priority !== undefined && !allowedPriority.includes(priority)) {
    errors.push(`Priority must be one of: ${allowedPriority.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  next();
};

module.exports = validateTask;