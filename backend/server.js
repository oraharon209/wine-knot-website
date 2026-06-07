const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');
const winesRouter = require('./routes/wines');
const categoriesRouter = require('./routes/categories');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wine-knot-api' });
});

app.use('/api/wines', winesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/admin', adminRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'שגיאת שרת פנימית' });
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
