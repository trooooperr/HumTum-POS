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

  it('should reduce only extra inventory added after KOT when final bill is printed', async () => {
    await Inventory.findOneAndUpdate({ name: 'Test Soda' }, { stock: 10 });

    const sessionRes = await request(app)
      .post('/api/orders/table/2/open')
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
        tableNo: 2,
        items: [{
          menuItemId: menuItem._id,
          name: 'Test Soda',
          quantity: 2,
          price: 50,
          department: 'bar'
        }]
      });

    expect(kotRes.statusCode).toBe(201);
    let item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(8);

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

  it('should generate sequential bill numbers correctly, handle manual updates and reset on a new business day', async () => {
    // 1. Create a finalized order on July 4th
    const orderData1 = {
      tableNo: 5,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-04T12:00:00Z').toISOString()
    };

    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData1);
    
    expect(res1.statusCode).toBe(201);
    expect(res1.body.billNo).toMatch(/^HTB-\d+$/);
    const billNum1 = parseInt(res1.body.billNo.match(/HTB-(\d+)/)[1], 10);

    // 2. Create another finalized order on the same day (July 4th) and verify sequential increment
    const orderData2 = {
      tableNo: 6,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-04T13:00:00Z').toISOString()
    };

    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData2);
    
    expect(res2.statusCode).toBe(201);
    const billNum2 = parseInt(res2.body.billNo.match(/HTB-(\d+)/)[1], 10);
    expect(billNum2).toBe(billNum1 + 1);

    // 3. Create an order on a different business day (July 5th) and verify it resets to HTB-001
    const orderData3 = {
      tableNo: 7,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-05T12:00:00Z').toISOString()
    };

    const res3 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData3);

    expect(res3.statusCode).toBe(201);
    expect(res3.body.billNo).toBe('HTB-001');
  });
});
