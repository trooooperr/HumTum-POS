const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 'dummy', role: 'admin' }, 'humtum_pos_production_secret_2026_safe_key', { expiresIn: '1d' });

fetch('http://127.0.0.1:3000/api/orders/table/5/open', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({ waiterName: "Staff", orderType: "dine-in" })
})
.then(async res => {
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
})
.catch(console.error);
