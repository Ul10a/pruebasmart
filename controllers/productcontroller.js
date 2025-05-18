const Product = require('../models/Product');
const { listarPuertos } = require('../utils/serialManager');
const { SerialPort } = require('serialport');

exports.list = async (req, res) => {
  try {
    const productos = await Product.find({ user_id: req.session.userId }).sort({ createdAt: -1 });
    const puertos = await listarPuertos();
    res.render('Product', { productos, puertos });
  } catch (error) {
    console.error('Error al listar productos:', error);
    res.status(500).render('error', { message: 'Error al cargar los productos' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, price, promotion, promotion_enabled, available } = req.body;
    
    // Validación básica de campos requeridos
    if (!name || !price) {
      return res.status(400).render('error', { message: 'Nombre y precio son requeridos' });
    }

    await Product.create({
      user_id: req.session.userId,
      name,
      price: parseFloat(price),
      promotion,
      promotion_enabled: promotion_enabled === 'on',
      available: available === 'on'
    });
    res.redirect('/products');
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).render('error', { message: 'Error al crear el producto' });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await Product.deleteOne({ _id: req.params.id, user_id: req.session.userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).render('error', { message: 'Producto no encontrado' });
    }
    
    res.redirect('/products');
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).render('error', { message: 'Error al eliminar el producto' });
  }
};

exports.showEdit = async (req, res) => {
  try {
    const producto = await Product.findOne({ _id: req.params.id, user_id: req.session.userId });
    if (!producto) {
      return res.status(404).redirect('/products');
    }
    res.render('editproduct', { producto });
  } catch (error) {
    console.error('Error al mostrar edición:', error);
    res.status(500).render('error', { message: 'Error al cargar la edición' });
  }
};

exports.edit = async (req, res) => {
  try {
    const { name, price, promotion, promotion_enabled, available } = req.body;
    
    if (!name || !price) {
      return res.status(400).render('error', { message: 'Nombre y precio son requeridos' });
    }

    const result = await Product.updateOne(
      { _id: req.params.id, user_id: req.session.userId },
      {
        name,
        price: parseFloat(price),
        promotion,
        promotion_enabled: promotion_enabled === 'on',
        available: available === 'on'
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).render('error', { message: 'Producto no encontrado' });
    }

    res.redirect('/products');
  } catch (error) {
    console.error('Error al editar producto:', error);
    res.status(500).render('error', { message: 'Error al actualizar el producto' });
  }
};

exports.enviarAArduino = async (req, res) => {
  // Verificación profunda de req.body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Datos de solicitud no válidos'
    });
  }

  const { puerto = null } = req.body;
  const { id } = req.params;

  // Validación mejorada del puerto
  if (!puerto || typeof puerto !== 'string' || puerto.trim() === '') {
    return res.status(400).json({ 
      success: false, 
      message: 'Puerto serial no válido o no especificado' 
    });
  }

  try {
    const producto = await Product.findOne({ _id: id, user_id: req.session.userId });
    if (!producto) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }

    if (!producto.available) {
      return res.status(400).json({ 
        success: false, 
        message: 'El producto no está disponible' 
      });
    }

    // Verificación mejorada de puertos disponibles
    const puertosDisponibles = await listarPuertos();
    if (!Array.isArray(puertosDisponibles)) {
      throw new Error('Error al obtener puertos seriales');
    }

    const puertoValido = puertosDisponibles.some(p => p.path === puerto);
    if (!puertoValido) {
      return res.status(400).json({ 
        success: false, 
        message: 'Puerto serial no disponible o no encontrado',
        puertosDisponibles // Opcional: enviar lista de puertos disponibles para debugging
      });
    }

    const port = new SerialPort({ 
      path: puerto, 
      baudRate: 9600,
      autoOpen: false
    });

    // Manejador de errores mejorado
    port.on('error', (err) => {
      console.error('Error en puerto serial:', err);
      if (port.isOpen) {
        port.close();
      }
      return res.status(500).json({ 
        success: false, 
        message: `Error de conexión con Arduino: ${err.message}` 
      });
    });

    port.open(async (err) => {
      if (err) {
        console.error('Error al abrir puerto:', err);
        return res.status(500).json({ 
          success: false, 
          message: `No se pudo abrir el puerto serial: ${err.message}` 
        });
      }

      try {
        let mensaje = `${producto.name}, $${producto.price}`;
        if (producto.promotion_enabled && producto.promotion) {
          mensaje += ` | Promo: ${producto.promotion}`;
        }

        port.write(mensaje + '\n', (writeErr) => {
          if (writeErr) {
            console.error('Error al escribir en puerto:', writeErr);
            port.close();
            return res.status(500).json({ 
              success: false, 
              message: `Error al enviar datos a Arduino: ${writeErr.message}` 
            });
          }

          // Cierre controlado del puerto
          setTimeout(() => {
            port.close(() => {
              res.json({ 
                success: true, 
                message: 'Datos enviados correctamente a Arduino',
                data: {
                  nombre: producto.name,
                  precio: producto.price,
                  promocion: producto.promotion_enabled ? producto.promotion : null,
                  puertoUtilizado: puerto
                }
              });
            });
          }, 100);
        });
      } catch (error) {
        if (port.isOpen) {
          port.close();
        }
        throw error;
      }
    });

  } catch (error) {
    console.error('Error en enviarAArduino:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};