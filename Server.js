const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// =============================================
// 1. CONFIGURACIÓN INICIAL
// =============================================
dotenv.config({ path: '.env' });

// Validación de variables de entorno
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Falta la variable de entorno requerida: ${varName}`);
    process.exit(1);
  }
});

// =============================================
// 2. CONEXIÓN A MONGODB
// =============================================
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority',
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
};

mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => {
    console.error('❌ Error en MongoDB:', err.message);
    process.exit(1);
  });

mongoose.connection.on('connected', () => console.log('Mongoose conectado'));
mongoose.connection.on('disconnected', () => console.log('Mongoose desconectado'));
mongoose.connection.on('error', err => console.error('Error en Mongoose:', err));

// =============================================
// 3. MIDDLEWARES
// =============================================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

app.use(express.json({
  limit: '10mb',
  strict: true
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
  proxy: true
}));

// Configuración de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// 4. RUTAS
// =============================================
// Ruta raíz - Redirige a login
app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/healthcheck', (req, res) => {
  res.json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

app.use('/auth', authRoutes);
app.use('/products', productRoutes);

// =============================================
// 5. MANEJO DE ERRORES
// =============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// =============================================
// 6. INICIO DEL SERVIDOR
// =============================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Apagando servidor...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Servidor y MongoDB cerrados');
      process.exit(0);
    });
  });
});
