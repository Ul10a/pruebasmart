const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors'); // Nuevo: Para manejar CORS
const helmet = require('helmet'); // Nuevo: Seguridad HTTP
const rateLimit = require('express-rate-limit'); // Nuevo: Limitar peticiones
const app = express();

// =============================================
// 1. CONFIGURACIÓN INICIAL (MEJORADO)
// =============================================
dotenv.config({ path: '.env' });

// Validación de variables de entorno críticas
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Falta la variable de entorno requerida: ${varName}`);
    process.exit(1);
  }
});

// =============================================
// 2. CONEXIÓN A MONGODB (CON RECONEXIÓN)
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

// Manejo de eventos de conexión
mongoose.connection.on('connected', () => console.log('Mongoose conectado'));
mongoose.connection.on('disconnected', () => console.log('Mongoose desconectado'));
mongoose.connection.on('error', err => console.error('Error en Mongoose:', err));

// =============================================
// 3. MIDDLEWARES ESENCIALES (ACTUALIZADO)
// =============================================
app.use(helmet()); // Seguridad HTTP
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Limitar peticiones (protección contra ataques DDoS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite por IP
});
app.use(limiter);

// Configuración mejorada de body-parser
app.use(express.json({
  limit: '10mb',
  strict: true
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// Configuración de sesión (seguridad mejorada)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    autoRemove: 'native'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
  proxy: true
}));

// Archivos estáticos con cache seguro
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
});

// =============================================
// 4. RUTAS PRINCIPALES (MEJORADO)
// =============================================
app.get('/healthcheck', (req, res) => {
  res.json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Importar rutas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

// Montar rutas con prefijos
app.use('/auth', authRoutes); // Cambiado a /auth para mejor estructura
app.use('/products', productRoutes);

// =============================================
// 5. MANEJO DE ERRORES (COMPLETO)
// =============================================
// Ruta no encontrada
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Error interno del servidor' : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// =============================================
// 6. INICIO DEL SERVIDOR (CON VALIDACIONES)
// =============================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
});

// Manejo de cierre elegante
process.on('SIGTERM', () => {
  console.log('🛑 Apagando servidor...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Servidor y MongoDB cerrados');
      process.exit(0);
    });
  });
});
