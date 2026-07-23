# HumTum POS System (V2.0 — Production ERP)

A **premium, enterprise POS & Inventory System** engineered specifically for **HumTum Bar & Restaurant**.  
Features **atomic bill numbering, real-time stock deduction, silent thermal desktop printing**, and **role-secured API protection**.

---

<p align="center">
  <img width="48%" alt="Table Management" src="https://github.com/user-attachments/assets/ae20b048-35cd-4558-b7f4-bff125f011c5" />
  <img width="48%" src="https://github.com/user-attachments/assets/568310af-b824-44fa-9786-b6aa041de85c" alt="Billing Dashboard" />
  <img width="48%" src="https://github.com/user-attachments/assets/a4599772-bdae-4d87-ae7f-cdd024de8547" alt="order history"/>
  <img width="48%" src="https://github.com/user-attachments/assets/621d111b-0233-4059-b4a9-59750787e537" alt="Inventory Management"/>
</p>

---

## ⚡ Quick Demo & Credentials

### 1. Local One-Command Startup
```bash
npm install
cd frontend && npm install && cd ..
npm run dev
```

### 2. Demo User Accounts
| Role | Username | Password | Permissions & Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full Access: Settings, User Management, Cache Clear |
| **Manager** | `manager` | `manager123` | Operational Access: Inventory, Workers, Sales Reports |
| **Staff** | `staff` | `staff123` | POS Operations: Billing & KOT Creation |

### 3. Zero-Setup Automated Audit (`npm test`)
```bash
npm test  # Executes all 56 automated test cases in ~6 seconds
```

---

## 🏗️ System Architecture

```mermaid
graph LR
    subgraph Devices [1. Client Devices]
        PHONE["📱 Customer Phone"]
        POS["💻 Cashier / Waiter POS"]
        KDS["📺 Kitchen Display (KDS)"]
    end

    subgraph Server [2. ERP Backend]
        API["⚙️ Express API"]
        KOT["🍳 KOT & Sockets"]
        STOCK["📦 Inventory & Tax Engine"]
    end

    subgraph Storage [3. Hardware & Data]
        PRINT["🖨️ Silent Print Agent"]
        DB[("🗄️ MongoDB & Redis")]
    end

    PHONE --> API
    POS --> API
    KDS <-->|WebSockets| KOT
    API --> KOT & STOCK
    POS --> PRINT
    API --> DB
```

---

## 🔄 End-to-End Workflow & Dataflow

### 1. Customer-to-Cashier Process Flow

```mermaid
flowchart TD
    A["📱 Customer Phone / Waiter POS"] -->|1. Place Order| B["⚙️ Express Backend API"]
    B -->|2. Check & Deduct Stock| C[("🗄️ Bar Inventory")]
    B -->|3. Live Order Broadcast| D["📺 Kitchen Display (KDS)"]
    B -->|4. Silent Print KOT| E["🖨️ Kitchen Printer"]
    
    D -->|5. Mark Food Served| F["💻 Cashier POS Terminal"]
    F -->|6. Settle Bill & Tax| G["⚡ Redis Atomic Bill #"]
    G -->|7. Silent Print Receipt| H["🖨️ Thermal Receipt Printer"]
    G -->|8. Sync Final Data| I["📈 Sales & Stock Reports"]
```

---

### 2. Order Settlement Sequence Dataflow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as 📱 Customer / Waiter
    actor Cashier as 💻 Cashier Terminal
    participant Server as ⚙️ Express Backend
    participant KDS as 📺 Kitchen (KDS)
    participant Printer as 🖨️ Thermal Printer
    participant DB as 🗄️ Database & Redis

    Customer->>Server: 1. Place Order (KOT)
    Server->>DB: 2. Deduct Bar Inventory Stock
    Server->>KDS: 3. Broadcast KOT via Socket.IO
    Server->>Printer: 4. Silent Print KOT Ticket
    
    KDS->>Server: 5. Update Status (Preparing → Served)
    
    Customer->>Cashier: 6. Request Bill Payment
    Cashier->>Server: 7. Settle Order
    Server->>DB: 8. Get Atomic Bill # & Deduct Delta Stock
    Server->>Printer: 9. Silent Print Customer Receipt
    Server->>DB: 10. Update Sales & Stock Reports
```

---

## 🚀 Key Features

1. **Decoupled Menu & Inventory:** Kitchen items bypass stock tracking for zero billing latency; Bar items track exact bottle-to-peg inventory.
2. **Delta Stock Protection:** Deducts inventory during KOT creation and only deducts newly added items upon final bill printing to prevent double-deduction.
3. **Atomic Bill Numbering:** Resilient daily sequential bill counter powered by Redis `INCR`.
4. **HumTum Silent Desktop Printing:** Native local agent running on port `5001` that spools PDFs silently to ESC/POS thermal printers.

---

## 🔒 Security & Role-Based Access Control (RBAC)

```mermaid
graph LR
    Request[Incoming API Call] --> JWT{Valid JWT?}
    JWT -- No --> Deny[401 Unauthorized]
    JWT -- Yes --> Role{Check User Role}
    
    Role -- Staff L1 --> StaffLimit[POS & KOT Access Only]
    Role -- Manager L2 --> MgrLimit[Inventory & Reports Access]
    Role -- Admin L3 --> FullAccess[Full System Control]
```

---

## 🧪 Automated Testing (`56/56 Passed`)

```
PASS  src/test/rigorous_pos_audit.test.js (24 tests)
PASS  src/test/orders.test.js              (6 tests)
PASS  src/test/tough_audit.test.js         (5 tests)
PASS  src/test/kots_management.test.js      (4 tests)
PASS  src/test/inventoryReport.test.js     (4 tests)
PASS  src/test/cors.test.js                (4 tests)
PASS  src/test/settings.test.js            (2 tests)
PASS  src/test/menu.test.js                (2 tests)
PASS  src/test/auth.test.js                (2 tests)
PASS  src/test/health.test.js              (1 test)
```

---

## 🛠️ Tech Stack & Installation

- **Frontend:** React 18, Vite, Tailwind CSS, Socket.IO Client
- **Backend:** Node.js, Express 4, Socket.IO, Mongoose
- **Database & Cache:** MongoDB Atlas, Upstash Redis
- **Silent Printing:** HumTum Silent Print Agent (Port 5001 + SumatraPDF)

```bash
# Backend Server Setup
npm install && npm run dev

# Frontend App Setup
cd frontend && npm install && npm run dev

# Silent Print Agent Setup (Client PC)
cd print-agent && npm install && npm start
```

---

## License

Built for **HumTum Bar & Restaurant**. All rights reserved.
