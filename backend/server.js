const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// تجربة السيرفر
app.get('/', (req, res) => {
  res.send('سيرفر نظام المقاولات يعمل بنجاح! 🚀');
});

// تشغيل السيرفر على منفذ 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});