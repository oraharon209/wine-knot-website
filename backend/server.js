const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');
const winesRouter = require('./routes/wines');
const categoriesRouter = require('./routes/categories');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,https://wineknot.co.il')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wine-knot-api' });
});

app.use('/api/wines', winesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/admin', adminRouter);

app.use((err, _req, res, _next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'גישה נדחתה' });
  }
  console.error(err);
  return res.status(500).json({ error: 'שגיאת שרת פנימית' });
});

async function start() {
  try {
    await migrate();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Wine Knot API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
