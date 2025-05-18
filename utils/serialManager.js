//utils/serialManeger.js
const { SerialPort } = require('serialport');

const listarPuertos = async () => {
  try {
    const puertos = await SerialPort.list();
    return puertos.filter(p => p.path); // Filtra puertos válidos
  } catch (err) {
    console.error('Error al listar puertos:', err);
    return [];
  }
};

module.exports = { listarPuertos };