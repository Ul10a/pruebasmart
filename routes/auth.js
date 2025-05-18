//routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authcontroller');

// Mostrar formularios de registro e inicio de sesión
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/contact', (req, res) => { res.render('contact'); });
router.get('/help', (req, res) => { res.render('help'); });

// Recuperación de contraseña (nuevo)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Correo no registrado' 
      });
    }

    // Resto de tu lógica para generar token y enviar email...
    
    res.json({ 
      success: true,
      message: 'Instrucciones enviadas al correo' 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error del servidor' 
    });
  }
});
router.get('/reset-password/:token', authController.getResetPassword);
router.post('/reset-password/:token', authController.postResetPassword);

// Ruta protegida para el dashboard
router.get('/dashboard', (req, res, next) => {
  if (!req.session.userId) {
    console.log("No hay sesión - Redirigiendo a login");
    return res.redirect('/login');
  }
  next();
}, authController.dashboard);

module.exports = router;
