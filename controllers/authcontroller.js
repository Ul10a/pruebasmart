//controllers,productcontroller.js 
const User = require('../models/User');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
  res.render('login', { error: null }); // Siempre pasar 'error'
};

// Iniciar sesión
exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Usuario o contraseña requeridos' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Credenciales inválidas' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Credenciales inválidas' });
    }

    // Guarda la sesión explícitamente antes de redirigir
    req.session.userId = user._id;
    req.session.username = user.username;

    req.session.save(err => {  // ← Esto asegura que la sesión se guarde
      if (err) {
        console.error('Error al guardar sesión:', err);
        return res.render('login', { error: 'Error interno' });
      }
      return res.redirect('/dashboard');  // ← Redirige después de guardar
    });

  } catch (error) {
    console.error('Error en login:', error);
    return res.render('login', { error: 'Error del servidor' });
  }
};
// Cerrar sesión
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/login');
  });
};

// Mostrar formulario para recuperar contraseña
exports.getForgotPassword = (req, res) => {
  res.render('forgot-password');
};

// Procesar formulario y enviar correo de recuperación
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.send('Correo no registrado.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpires = Date.now() + 3600000; // 1 hora
  await user.save();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tu_correo@gmail.com',        // Cambiar por tu correo
      pass: 'tu_contraseña_app',          // Usa contraseña de aplicación de Gmail
    }
  });

  const mailOptions = {
    from: 'tu_correo@gmail.com',
    to: user.email,
    subject: 'Recuperación de contraseña',
    html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
           <a href="http://localhost:3000/auth/reset-password/${token}">Restablecer contraseña</a>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return res.send('Error al enviar el correo');
    }
    res.send('Se ha enviado un enlace de recuperación a tu correo.');
  });
};

// Mostrar formulario para establecer nueva contraseña
exports.getResetPassword = async (req, res) => {
  const { token } = req.params;
  const user = await User.findOne({
    resetToken: token,
    resetTokenExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.send('Token inválido o expirado.');
  }

  res.render('reset-password', { token });
};

// Procesar nueva contraseña
exports.postResetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.send('Token inválido o expirado.');
  }

  const hashed = await bcrypt.hash(password, 10);
  user.password = hashed;
  user.resetToken = undefined;
  user.resetTokenExpires = undefined;
  await user.save();

  res.send('Contraseña actualizada. Ahora puedes iniciar sesión.');
};

// Ruta protegida para el dashboard
exports.dashboard = (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  res.render('dashboard', { username: req.session.username });
};
