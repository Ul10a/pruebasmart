// models/User.js

const mongoose = require('mongoose');

// Definir el esquema del usuario
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  resetToken: {  // Campo para almacenar el token de restablecimiento
    type: String
  },
  resetTokenExpires: {  // Campo para almacenar la fecha de expiración del token
    type: Date
  }
}, { timestamps: true });

// Crear el modelo a partir del esquema y exportarlo
module.exports = mongoose.model('User', userSchema);
