const User = require('../models/User');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

// Configuración del transporter para Namecheap Private Email
const transporter = nodemailer.createTransport({
  host: 'mail.smartshelft.com',
  port: 587,
  secure: false,
  auth: {
    user: 'administrador@smartshelft.com',
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  logger: true // Para debug
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

    req.session.userId = user._id;
    req.session.username = user.username;

    req.session.save(err => {
      if (err) {
        console.error('Error al guardar sesión:', err);
        return res.render('login', { error: 'Error interno' });
      }
      return res.redirect('/dashboard');
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

// Mostrar formulario para recuperar contraseña (ahora manejado en el frontend)
exports.getForgotPassword = async (req, res) => {
  res.status(404).send('Esta ruta no se usa directamente');
};

// Procesar formulario y enviar correo de recuperación
exports.postForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Solicitud recibida para email:', email); // Log de depuración

    const user = await User.findOne({ email });
    if (!user) {
      console.log('Email no encontrado:', email);
      return res.status(400).json({ 
        success: false, 
        message: 'Correo no registrado' 
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpires = Date.now() + 3600000;
    await user.save();

    const resetLink = `https://pruebasmart.onrender.com/reset-password/${token}`;

    const mailOptions = {
      from: '"SMARTSHELF" <administrador@smartshelft.com>',
      to: user.email,
      subject: 'Recuperación de contraseña - SMARTSHELF',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4a90e2;">Recuperación de contraseña</h2>
          <p>Hola ${user.username},</p>
          <p>Hemos recibido una solicitud para restablecer tu contraseña en SMARTSHELF.</p>
          <p>Por favor, haz clic en el siguiente enlace para continuar:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" 
               style="background-color: #4a90e2; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Restablecer contraseña
            </a>
          </p>
          <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
          <p>El enlace expirará en 1 hora.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #777;">
            © ${new Date().getFullYear()} SMARTSHELF. Todos los derechos reservados.
          </p>
        </div>
      `
    };

    // Envío del correo con verificación
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error al enviar correo:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Error al enviar el correo de recuperación',
          error: error.message
        });
      }
      console.log('Correo enviado:', info.response);
      res.json({ 
        success: true,
        message: 'Se han enviado instrucciones a tu correo'
      });
    });

  } catch (error) {
    console.error('Error en postForgotPassword:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar la solicitud',
      error: error.message
    });
  }
};

// Mostrar formulario para establecer nueva contraseña
exports.getResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render('error', { 
        error: 'Token inválido o expirado. Por favor, solicita un nuevo enlace.' 
      });
    }

    res.render('forgot-password', { 
      token,
      username: user.username 
    });

  } catch (error) {
    console.error('Error en getResetPassword:', error);
    res.render('error', { 
      error: 'Error al procesar la solicitud' 
    });
  }
};

// Procesar nueva contraseña
exports.postResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Las contraseñas no coinciden' 
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

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.json({ 
      success: true,
      message: 'Contraseña cambiada con éxito' 
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
