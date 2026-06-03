const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('Orders API', () => {
  let token;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    
    const user = await User.create({
      name: 'Admin',
      username: 'admin',
      passwordHash: 'admin123',
      role: 'admin'
    });
    token = generateToken(user);
    
    await Inventory.create({
      name: 'Test Soda',
      category: 'General',
      unit: 'Bottles',
      stock: 10,
      minStock: 2,
      price: 50
    });
    await MenuItem.create({
      name: 'Test Soda',
      category: 'General',
      price: 50,
      department: 'bar',
      shortcut: 'ts'
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  it('should create an order and reduce inventory', async () => {
    const orderData = {
      billNo: '9999',
      tableNo: 1,
      items: [{ name: 'Test Soda', quantity: 2, price: 50 }],
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      discount: 0,
      grandTotal: 105,
      paidAmount: 105,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date().toISOString()
    };

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData);
    
    expect(res.statusCode).toBe(201);
    const item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(8);
  });

  it('should reduce inventory on KOT and not double reduce on final bill', async () => {
    await Inventory.findOneAndUpdate({ name: 'Test Soda' }, { stock: 10 });

    const sessionRes = await request(app)
      .post('/api/orders/table/1/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sessionRes.statusCode).toBe(201);
    const orderId = sessionRes.body.activeOrderId._id;
    const menuItem = await MenuItem.findOne({ name: 'Test Soda' });

    const kotRes = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        tableNo: 1,
        items: [{
          menuItemId: menuItem._id,
          name: 'Test Soda',
          quantity: 3,
          price: 50,
          department: 'bar'
        }]
      });

    expect(kotRes.statusCode).toBe(201);
    let item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(7);

    const finalRes = await request(app)
      .patch(`/api/orders/${orderId}/finalize-bill`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ name: 'Test Soda', quantity: 3, price: 50 }],
        subtotal: 150,
        sgst: 3.75,
        cgst: 3.75,
        discount: 0,
        roundOff: -0.5,
        grandTotal: 157
      });

    expect(finalRes.statusCode).toBe(200);
    item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(7);
  });
});
