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
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET', 'PORT'];
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
// 3. CONFIGURACIÓN DE VISTAS Y MIDDLEWARES
// =============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares de seguridad
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Limitador de tasa
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por IP
  message: 'Demasiadas solicitudes desde esta IP, por favor intente más tarde'
}));

// Middlewares para parsear el cuerpo de las peticiones
app.use(express.json({ limit: '10mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html', 'htm'], // Para servir archivos .html directamente
  index: false // Deshabilitar index automático
}));

// Configuración de sesión mejorada
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // 1 día
    autoRemove: 'native' // Eliminación automática de sesiones expiradas
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 día
  },
  proxy: true // Necesario para HTTPS en producción
}));

// =============================================
// 4. RUTAS PRINCIPALES
// =============================================
// Redirección inteligente según estado de autenticación
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth/login');
});

// Importar rutas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

// Montar rutas
app.use('/auth', authRoutes);
app.use('/products', productRoutes);

// Rutas adicionales necesarias
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  res.render('dashboard', { 
    username: req.session.username,
    layout: 'layouts/main' // Si usas layouts
  });
});

// Ruta para contacto
app.get('/contact', (req, res) => {
  res.render('contact', { layout: false });
});

// Ruta para ayuda
app.get('/help', (req, res) => {
  res.render('help', { layout: false });
});

// =============================================
// 5. MANEJO DE ERRORES MEJORADO
// =============================================
// Middleware para 404
app.use((req, res, next) => {
  res.status(404).render('error', {
    error: 'Página no encontrada',
    message: 'La ruta solicitada no existe',
    layout: false
  });
});

// Middleware para errores 500
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
  
  // Respuesta según el tipo de aceptación
  if (req.accepts('html')) {
    res.status(500).render('error', {
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Por favor intente más tarde',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      layout: false
    });
  } else if (req.accepts('json')) {
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } else {
    res.type('txt').send('Error interno del servidor');
  }
});

// =============================================
// 6. INICIO DEL SERVIDOR
// =============================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Directorio de vistas: ${path.join(__dirname, 'views')}`);
});

// Manejo de cierre limpio
process.on('SIGTERM', () => {
  console.log('🛑 Apagando servidor...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Servidor y MongoDB cerrados');
      process.exit(0);
    });
  });
});

// Manejo de excepciones no capturadas
process.on('uncaughtException', (err) => {
  console.error('⚠️ Excepción no capturada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Rechazo no manejado en:', promise, 'razón:', reason);
});
