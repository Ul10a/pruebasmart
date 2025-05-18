//routes/products.js

const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller');

function checkAuth(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

router.get('/', checkAuth, productController.list);
router.post('/', checkAuth, productController.create);
router.post('/:id/arduino', checkAuth, productController.enviarAArduino);
router.post('/:id/delete', checkAuth, productController.delete);
router.get('/:id/edit', checkAuth, productController.showEdit);
router.post('/:id/edit', checkAuth, productController.edit);

module.exports = router;