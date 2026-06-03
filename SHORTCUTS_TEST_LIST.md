# Menu Item Shortcuts - Test List

## Suggested Shortcuts for Common Items

Use these shortcuts when creating menu items. Type the shortcut code and press **ENTER** in the billing interface to instantly add items.

### Spirits
- **jd** - Jack Daniel's
- **rb** - Royal Brackley
- **vodka** - Vodka
- **rum** - Rum

### Beer
- **kf** - Kingfisher Ultra
- **corona** - Corona Extra
- **bud** - Budweiser
- **tuborg** - Tuborg

### Wine
- **rw** - Red Wine Glass
- **ww** - White Wine Glass
- **rosé** - Rosé Wine

### Food - Main Course
- **ct** - Chicken Tikka
- **pb** - Paneer Biryani
- **mt** - Mutton Tikka
- **ff** - French Fries
- **pc** - Paneer Chilli
- **mcn** - Chicken Noodles

### Appetizers
- **am** - Amritsari Kulcha
- **samosa** - Samosa
- **pakora** - Pakora
- **momos** - Momos

### Desserts
- **ic** - Ice Cream
- **kheer** - Kheer
- **gs** - Gulab Jamun
- **rasmalai** - Rasmalai

### Beverages & Mixers
- **coke** - Coca Cola
- **sprite** - Sprite
- **tonic** - Tonic Water
- **soda** - Soda Water
- **tea** - Tea
- **coffee** - Coffee
- **lassi** - Lassi

---

## How to Set Up Shortcuts

### In Menu Page:
1. Click "Add Item" or edit an existing item
2. Fill in Item Name, Category, Price
3. In the **Shortcut** field, enter a short code (1-10 characters, lowercase)
4. Click "Save Item"

### In Inventory Page:
1. Click "Add Item" or edit an existing item
2. Fill in Item Name, Category, Unit, Stock
3. In the **Shortcut** field, enter the same short code (optional)
4. Click "Save"

---

## Testing Shortcuts

### Quick Test Procedure:
1. Create 3 menu items with shortcuts:
   - Item A: shortcut = "a"
   - Item B: shortcut = "b"  
   - Item C: shortcut = "c"

2. Open a table in Billing page

3. Type shortcuts to test:
   - Press "a" then press ENTER → Item A should appear
   - Press "b" then press ENTER → Item B should appear
   - Press "c" then press ENTER → Item C should appear

4. Check that quantities increase when pressing the same shortcut again

### View All Available Shortcuts:
1. Open Browser Console (F12 → Console tab)
2. Copy and run this command:
```javascript
fetch('/api/menu/shortcuts/all', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('humtum_token_v2')}
}).then(r=>r.json()).then(data => {
  console.table(data.map(s => ({
    Shortcut: s.shortcut,
    Item: s.name,
    Category: s.category,
    Price: '₹' + s.price
  })));
});
```

---

## Production Ready Features

### ✅ Inventory Stock Updates (Real-time)
- Stock reduces instantly when bill is printed
- No refresh needed
- All connected clients see updates immediately

### ✅ Completed KOTs Hidden
- Kitchen Display only shows: PENDING, PREPARING, READY
- Completed orders don't clutter the display

### ✅ Full Keyboard Support
- **F2 or /** - Focus menu search
- **ENTER** - Add item from search or by shortcut
- **F8** - Print KOT
- **F9** - Print Bill & Settle
- **ESC** - Back/Cancel
- **Type code + ENTER** - Add item by shortcut

---

## Troubleshooting

### Shortcut not working?
1. Check if shortcut code contains only letters/numbers
2. Make sure you press ENTER (not just typing)
3. Verify item is set to "Available" (toggle status)
4. Open console to check for errors

### Inventory not updating after bill print?
1. Check that bill was actually printed (modal closed)
2. Refresh the inventory page to verify stock changed
3. Check network tab in browser console for API calls

### KOT not showing in Kitchen Display?
1. Verify KOT status is not "COMPLETED" or "SERVED"
2. Kitchen staff should be logged in with correct role
3. Refresh the page (Socket.IO should auto-update)

