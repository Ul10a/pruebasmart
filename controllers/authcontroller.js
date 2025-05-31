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
  res.render('auth/register', { error: null });
};

// Registrar nuevo usuario
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.render('auth/register', { 
        error: 'Por favor, completa todos los campos.' 
      });
    }

    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) {
      return res.render('auth/register', { 
        error: 'Usuario o email ya registrado' 
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      username, 
      email, 
      password: hash 
    });
    
    req.session.userId = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).render('auth/register', {
      error: 'Error al registrar el usuario'
    });
  }
};

// Mostrar formulario de login
exports.showLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', { error: null });
};

// Iniciar sesión
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render('auth/login', {
        error: 'Usuario y contraseña son requeridos'
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.render('auth/login', { 
        error: 'Credenciales inválidas' 
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('auth/login', { 
        error: 'Credenciales inválidas' 
      });
    }

    req.session.userId = user._id;
    req.session.username = user.username;
    
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).render('auth/login', {
      error: 'Error interno del servidor'
    });
  }
};

// Cerrar sesión
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.redirect('/dashboard');
    }
    res.redirect('/auth/login');
  });
};

// Recuperación de contraseña
exports.showForgotPassword = (req, res) => {
  res.render('auth/forgot-password', { error: null });
};

exports.postForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Email inválido'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Email no registrado'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    const resetLink = `https://pruebasmart.onrender.com/auth/reset-password/${token}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Restablece tu contraseña',
      html: `Haz clic <a href="${resetLink}">aquí</a> para restablecer tu contraseña. El enlace expira en 1 hora.`
    });

    res.json({
      success: true,
      message: 'Instrucciones enviadas a tu correo'
    });

  } catch (error) {
    console.error('Error en postForgotPassword:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
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
      return res.render('auth/reset-password', {
        error: 'Token inválido o expirado',
        valid: false
      });
    }

    res.render('auth/reset-password', {
      token,
      username: user.username,
      valid: true,
      error: null
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

    if (password !== confirmPassword) {
      return res.render('auth/reset-password', {
        token,
        error: 'Las contraseñas no coinciden',
        valid: true
      });
    }

    if (password.length < 6) {
      return res.render('auth/reset-password', {
        token,
        error: 'La contraseña debe tener al menos 6 caracteres',
        valid: true
      });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('auth/reset-password', {
        error: 'Token inválido o expirado',
        valid: false
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.render('auth/reset-password-success');

  } catch (error) {
    console.error('Error en postResetPassword:', error);
    res.status(500).render('auth/reset-password', {
      error: 'Error al actualizar la contraseña',
      valid: true
    });
  }
};

// Dashboard
exports.dashboard = (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  res.render('dashboard', { 
    username: req.session.username 
  });
};
