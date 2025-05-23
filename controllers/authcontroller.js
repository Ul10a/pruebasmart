const User = require('../models/User');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');

dotenv.config();

// Configuración del transporter para Namecheap Private Email
  const transporter = nodemailer.createTransport({
   host: 'mail.smartshelft.com',
  port: 587,
  secure: true,
  auth: {
    user: 'administrador@smartshelft.com',
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});
// Mostrar formulario de registro

exports.showRegister = (req, res) => {
  res.render('register');
};

// Registrar nuevo usuario
exports.register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.render('register', { error: 'Por favor, completa todos los campos.' });
  }

  const exists = await User.findOne({ $or: [{ username }, { email }] });
  if (exists) return res.render('register', { error: 'Usuario o email ya registrado' });

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, password: hash });
  req.session.userId = user._id;
  req.session.username = user.username;
  res.redirect('/dashboard');
};

// Mostrar formulario de login
exports.showLogin = (req, res) => {
  res.render('login', { error: null });
};

// Iniciar sesión
exports.login = async (req, res) => {
  try {
    // Verifica primero que el body exista
    if (!req.body) {
      return res.status(400).json({ 
        success: false,
        message: 'Datos de solicitud no proporcionados' 
      });
    }

    const { username, password } = req.body;

    // Validación básica
    if (!username || !password) {
      return res.status(400).render('login', { 
        error: 'Usuario y contraseña son requeridos' 
      });
    }

    // Resto de tu lógica de login...
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Credenciales inválidas' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Credenciales inválidas' });
    }

    req.session.userId = user._id;
    req.session.username = user.username;

    res.redirect('/dashboard');

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).render('login', { 
      error: 'Error interno del servidor' 
    });
  }
};

// Cerrar sesión
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/login');
  });
};

// Mostrar formulario para recuperar contraseña (ahora manejado en el frontend)
exports.getForgotPassword = async (req, res) => {
  res.status(404).send('Esta ruta no se usa directamente');
};

exports.postForgotPassword = async (req, res) => {
  console.log('Solicitud recibida:', req.body); // Debug
  
  try {
    // Validación mejorada
    if (!req.body || typeof req.body !== 'object') {
      console.error('Body no es objeto');
      return res.status(400).json({ 
        success: false, 
        message: 'Formato de datos inválido' 
      });
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email inválido' 
      });
    }

    // Buscar usuario
    const user = await User.findOne({ email }).maxTimeMS(10000);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email no registrado' 
      });
    }

    // Generar token (asegúrate de tener crypto requerido)
    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpires = Date.now() + 3600000; // 1 hora
    
    await user.save();

    // Configurar correo
    const resetLink = `https://pruebasmart.onrender.com/auth/reset-password/${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Restablece tu contraseña',
      html: `Haz clic <a href="${resetLink}">aquí</a> para restablecer tu contraseña`
    };

    // Enviar correo
    await transporter.sendMail(mailOptions);
    console.log('Correo enviado a:', user.email);

    return res.json({ 
      success: true,
      message: 'Instrucciones enviadas a tu correo' 
    });

  } catch (error) {
    console.error('Error crítico:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};

exports.getResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).render('error', { 
        error: 'Token inválido o expirado' 
      });
    }

    res.render('recover', { 
      token,
      username: user.username,
      layout: false  // Si usas layouts
    });

  } catch (error) {
    console.error('Error en getResetPassword:', error);
    res.status(500).render('error', { 
      error: 'Error al procesar la solicitud' 
    });
  }
};

exports.postResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // Validaciones
    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Las contraseñas no coinciden' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'La contraseña debe tener al menos 6 caracteres' 
      });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token inválido o expirado' 
      });
    }

    // Actualizar contraseña
    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.json({ 
      success: true,
      message: 'Contraseña actualizada correctamente',
      redirect: '/login'
    });

  } catch (error) {
    console.error('Error en postResetPassword:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar la contraseña' 
    });
  }
};

// Ruta protegida para el dashboard
exports.dashboard = (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('dashboard', { username: req.session.username });
};
