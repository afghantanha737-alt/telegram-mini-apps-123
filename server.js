require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/points', require('./routes/points'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/admin', require('./routes/admin'));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB وصل شد'))
  .catch(err => console.error('خطا در اتصال به MongoDB:', err.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`سرور روی پورت ${PORT} بالا آمد`));
