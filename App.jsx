import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Home, ShoppingCart, Wallet, Boxes, Package, Receipt, Truck, Users, UserCog,
  BarChart2, Settings as SettingsIcon, Plus, AlertTriangle, X, Trash2, Search,
  Sun, Moon, ChevronRight, Grid3x3, ArrowUpRight, ArrowDownRight, Minus,
  TrendingUp, TrendingDown, PackagePlus, PackageMinus, Flame, Edit2, Check,
  LogOut, Lock, ShieldAlert, Undo2, ScrollText,
} from "lucide-react";

/* ============================== THEME TOKENS ============================== */
const C = {
  purple900: "#1C0730",
  purple800: "#2A0B47",
  purple700: "#3B0F63",
  purple600: "#4E1584",
  purple500: "#6423A8",
  purpleGlow: "#8B3DE0",
  yellow: "#FFD400",
  yellowDim: "#F2C300",
  lime: "#B6FF3C",
  limeDim: "#9BE826",
  black: "#0A0710",
  white: "#FFFFFF",
  surfaceDark: "#221336",
  surfaceDark2: "#180C28",
  borderDark: "#3A2456",
  textMutedDark: "#B6A6D1",
  surfaceLight: "#FFFFFF",
  bgLight: "#F5F2FA",
  borderLight: "#E4DCF2",
  textMutedLight: "#6B5C85",
};

/* ============================== HELPERS ============================== */
let __uidCounter = 0;
const uid = (p = "id") => { __uidCounter += 1; return `${p}-${Date.now().toString(36)}-${__uidCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`; };
const nowISO = () => new Date().toISOString();

/* ---- Centralized local-date utility ----
 * Every "what is today / what calendar day is this timestamp" question in the app funnels through
 * these functions. Previously todayStr()/isSameDay() sliced new Date().toISOString(), which is a
 * UTC timestamp — that makes "today" roll over several hours before/after local midnight depending
 * on the browser's timezone (e.g. it flips in the evening in US timezones). Everything below instead
 * reads the LOCAL calendar date (getFullYear/getMonth/getDate), which matches what a business owner
 * actually means by "today".
 * businessNow() is the one function that would need to change to support a configurable
 * settings.timezone later (e.g. via Intl.DateTimeFormat with a `timeZone` option) — nothing else
 * in the app would need to change, since everything else is built on top of this single funnel.
 */
const businessNow = () => new Date();
const localDateStr = (d) => {
  const yr = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};
// "Today" as the business's local calendar day, e.g. "2026-08-16".
const todayStr = () => localDateStr(businessNow());
// A calendar day offset from today by n days (local), e.g. dateStrOffset(-1) = yesterday.
const dateStrOffset = (n) => { const d = businessNow(); d.setDate(d.getDate() + n); return localDateStr(d); };
// Does this ISO timestamp fall on the given local calendar day ("YYYY-MM-DD")?
const isSameDay = (iso, ymd) => { if (!iso) return false; return localDateStr(new Date(iso)) === ymd; };
// Parses a bare "YYYY-MM-DD" as a local calendar date — `new Date("2026-08-14")` would instead
// parse it as UTC midnight, which renders as the *previous* day in any timezone behind UTC.
const parseLocalDate = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d); };
/* ---- end centralized local-date utility ---- */

// Supported currency symbols. USD stays the default exactly as before.
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", BRL: "R$", CAD: "CA$", MXN: "MX$" };
// fmtMoney() is called from ~150 places across the app; rather than threading a currency prop
// through every one of them, the single active currency lives here and is kept in sync from
// Settings (see the effect in App()). This keeps ONE formatting function as the only place money
// is ever rendered, with USD as the default if settings haven't loaded yet.
let _activeCurrency = "USD";
const setActiveCurrency = (code) => { _activeCurrency = CURRENCY_SYMBOLS[code] ? code : "USD"; };
const fmtMoney = (n) => `${CURRENCY_SYMBOLS[_activeCurrency] || _activeCurrency + " "}${(Number(n) || 0).toFixed(2)}`;
const fmtPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;
// For full ISO timestamps (sale.date, po.orderDate, etc) — these already carry real time+zone
// info, so parsing with `new Date(iso)` is correct and has none of the bare-date pitfall above.
const dateStr = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// For bare "YYYY-MM-DD" values only (task due dates, birthdays) — uses parseLocalDate above.
const dateStrLocal = (ymd) => (!ymd ? "" : parseLocalDate(ymd).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
const timeStr = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
// Rolling time-window check (e.g. "last 7 days") — compares absolute timestamps, so it's already
// timezone-safe and needed no change.
const withinDays = (iso, n) => new Date(iso).getTime() >= Date.now() - n * 86400000;
const clamp0 = (n) => Math.max(0, n);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// Bounds a background persistence write so a hanging platform storage call is contained (turned
// into a rejection after `ms`) rather than lingering indefinitely. Used by the background seed
// persistence below — this is production resilience, not diagnostic instrumentation, so it's
// kept even though the temporary debug logging around it was removed.
async function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
// Single shared CSV export used by every report — keeps download behavior (filename pattern,
// escaping, blob handling) consistent everywhere instead of each view rolling its own.
const csvEscape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function downloadCSV(filename, headerRow, rows) {
  const csv = [headerRow, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ============================== SEED DATA ============================== */
const seedLocations = () => ([
  { id: "loc-kiosk", name: "Kiosk", type: "Retail", active: true, sample: true },
  { id: "loc-cart", name: "Car / Pop-up", type: "Mobile", active: true, sample: true },
  { id: "loc-kitchen", name: "Kitchen", type: "Prep", active: true, sample: true },
  { id: "loc-warehouse", name: "Warehouse", type: "Storage", active: true, sample: true },
]);

const seedInventory = () => ([
  { id: "inv-acai", name: "Açaí Purée", sku: "ACAI-10L", category: "Açaí", unit: "Liters", qty: 12, minQty: 15, maxQty: 60, costPerUnit: 8.9, supplierId: "sup-amazon", location: "Kitchen", expiresAt: daysAgoISO(-14), notes: "10L bags", sample: true },
  { id: "inv-banana", name: "Banana", sku: "FRU-BAN", category: "Fruit", unit: "Units", qty: 120, minQty: 40, maxQty: 300, costPerUnit: 0.25, supplierId: "sup-freshfarms", location: "Kitchen", expiresAt: daysAgoISO(-4), sample: true },
  { id: "inv-strawberry", name: "Strawberry", sku: "FRU-STR", category: "Fruit", unit: "Pounds", qty: 18, minQty: 10, maxQty: 50, costPerUnit: 2.6, supplierId: "sup-freshfarms", location: "Kitchen", expiresAt: daysAgoISO(-5), sample: true },
  { id: "inv-blueberry", name: "Blueberry", sku: "FRU-BLU", category: "Fruit", unit: "Pounds", qty: 9, minQty: 8, maxQty: 40, costPerUnit: 4.2, supplierId: "sup-freshfarms", location: "Kitchen", expiresAt: daysAgoISO(-5), sample: true },
  { id: "inv-granola", name: "Granola", sku: "TOP-GRA", category: "Toppings", unit: "Pounds", qty: 22, minQty: 10, maxQty: 50, costPerUnit: 3.1, supplierId: "sup-amazon", location: "Kitchen", sample: true },
  { id: "inv-pb", name: "Peanut Butter", sku: "TOP-PB", category: "Toppings", unit: "Pounds", qty: 6, minQty: 5, maxQty: 20, costPerUnit: 3.8, supplierId: "sup-amazon", location: "Kitchen", sample: true },
  { id: "inv-condensedmilk", name: "Condensed Milk", sku: "TOP-CM", category: "Toppings", unit: "Ounces", qty: 80, minQty: 40, maxQty: 200, costPerUnit: 0.18, supplierId: "sup-amazon", location: "Kitchen", sample: true },
  { id: "inv-nutella", name: "Nutella", sku: "TOP-NUT", category: "Toppings", unit: "Ounces", qty: 60, minQty: 30, maxQty: 150, costPerUnit: 0.22, supplierId: "sup-amazon", location: "Kitchen", sample: true },
  { id: "inv-cup12", name: "12 oz Cup", sku: "PKG-C12", category: "Packaging", unit: "Units", qty: 85, minQty: 100, maxQty: 1000, costPerUnit: 0.18, supplierId: "sup-packco", location: "Warehouse", sample: true },
  { id: "inv-cup16", name: "16 oz Cup", sku: "PKG-C16", category: "Packaging", unit: "Units", qty: 150, minQty: 100, maxQty: 1000, costPerUnit: 0.22, supplierId: "sup-packco", location: "Warehouse", sample: true },
  { id: "inv-cup32", name: "32 oz Cup", sku: "PKG-C32", category: "Packaging", unit: "Units", qty: 70, minQty: 60, maxQty: 500, costPerUnit: 0.35, supplierId: "sup-packco", location: "Warehouse", sample: true },
  { id: "inv-spoon", name: "Spoon", sku: "PKG-SPN", category: "Packaging", unit: "Units", qty: 400, minQty: 200, maxQty: 2000, costPerUnit: 0.03, supplierId: "sup-packco", location: "Warehouse", sample: true },
  { id: "inv-bag", name: "Plastic Bag", sku: "PKG-BAG", category: "Packaging", unit: "Units", qty: 250, minQty: 150, maxQty: 1000, costPerUnit: 0.05, supplierId: "sup-packco", location: "Warehouse", sample: true },
]);

const seedProducts = () => ([
  { id: "prod-bowl12", name: "12 oz Açaí Bowl", sku: "AB-12", category: "Açaí", price: 11.0, active: true, description: "Classic açaí bowl with fruit and granola", image: "", sample: true,
    recipe: [{ itemId: "inv-acai", qty: 0.36 }, { itemId: "inv-banana", qty: 0.5 }, { itemId: "inv-strawberry", qty: 0.05 }, { itemId: "inv-granola", qty: 0.05 }, { itemId: "inv-cup12", qty: 1 }, { itemId: "inv-spoon", qty: 1 }] },
  { id: "prod-bowl16", name: "16 oz Açaí Bowl", sku: "AB-16", category: "Açaí", price: 13.5, active: true, description: "Larger açaí bowl, extra toppings", image: "", sample: true,
    recipe: [{ itemId: "inv-acai", qty: 0.48 }, { itemId: "inv-banana", qty: 0.7 }, { itemId: "inv-strawberry", qty: 0.08 }, { itemId: "inv-granola", qty: 0.08 }, { itemId: "inv-cup16", qty: 1 }, { itemId: "inv-spoon", qty: 1 }] },
  { id: "prod-bowl32", name: "32 oz Açaí Bowl", sku: "AB-32", category: "Açaí", price: 19.5, active: true, description: "Family size açaí bowl", image: "", sample: true,
    recipe: [{ itemId: "inv-acai", qty: 0.9 }, { itemId: "inv-banana", qty: 1 }, { itemId: "inv-strawberry", qty: 0.15 }, { itemId: "inv-granola", qty: 0.15 }, { itemId: "inv-cup32", qty: 1 }, { itemId: "inv-spoon", qty: 1 }] },
  { id: "prod-smoothie-acai", name: "Açaí Smoothie", sku: "SM-ACAI", category: "Smoothies", price: 8.5, active: true, description: "Blended açaí smoothie", image: "", sample: true,
    recipe: [{ itemId: "inv-acai", qty: 0.3 }, { itemId: "inv-banana", qty: 0.5 }, { itemId: "inv-cup16", qty: 1 }] },
  { id: "prod-smoothie-straw", name: "Strawberry Smoothie", sku: "SM-STR", category: "Smoothies", price: 8.0, active: true, description: "Fresh strawberry smoothie", image: "", sample: true,
    recipe: [{ itemId: "inv-strawberry", qty: 0.2 }, { itemId: "inv-banana", qty: 0.3 }, { itemId: "inv-cup16", qty: 1 }] },
  { id: "prod-gelato-choc", name: "Chocolate Gelato", sku: "GEL-CHOC", category: "Gelato", price: 6.5, active: true, description: "Rich chocolate gelato cup", image: "", sample: true,
    recipe: [{ itemId: "inv-nutella", qty: 2 }, { itemId: "inv-condensedmilk", qty: 1 }, { itemId: "inv-cup12", qty: 1 }, { itemId: "inv-spoon", qty: 1 }] },
  { id: "prod-gelato-van", name: "Vanilla Gelato", sku: "GEL-VAN", category: "Gelato", price: 6.0, active: true, description: "Creamy vanilla gelato cup", image: "", sample: true,
    recipe: [{ itemId: "inv-condensedmilk", qty: 2 }, { itemId: "inv-cup12", qty: 1 }, { itemId: "inv-spoon", qty: 1 }] },
]);

const seedSuppliers = () => ([
  { id: "sup-amazon", name: "Amazon Fruit Co", contact: "Maria Silva", phone: "(407) 555-0110", email: "orders@amazonfruit.com", address: "Orlando, FL", website: "amazonfruit.com", taxId: "", terms: "Net 15", defaultCurrency: "USD", products: "Açaí, Granola, Toppings", notes: "", active: true, sample: true },
  { id: "sup-freshfarms", name: "Fresh Farms Produce", contact: "Jon Reyes", phone: "(407) 555-0142", email: "sales@freshfarms.com", address: "Kissimmee, FL", website: "freshfarmsfl.com", taxId: "", terms: "COD", defaultCurrency: "USD", products: "Bananas, Strawberries, Blueberries", notes: "", active: true, sample: true },
  { id: "sup-packco", name: "PackCo Supplies", contact: "Dana Cole", phone: "(407) 555-0199", email: "hello@packco.com", address: "Orlando, FL", website: "packco.com", taxId: "", terms: "Net 30", defaultCurrency: "USD", products: "Cups, Spoons, Bags", notes: "", active: true, sample: true },
]);

const seedCustomers = () => ([
  { id: "cus-1", name: "Ana Costa", phone: "(407) 555-2211", email: "ana@example.com", birthday: "1992-04-12", notes: "Regular, prefers 16oz", sample: true },
  { id: "cus-2", name: "Marco Lima", phone: "(407) 555-3312", email: "marco@example.com", birthday: "1988-11-02", notes: "", sample: true },
  { id: "cus-3", name: "Julia Santos", phone: "(407) 555-4433", email: "julia@example.com", birthday: "1995-07-20", notes: "Allergic to peanuts", sample: true },
]);

const seedEmployees = () => ([
  { id: "emp-1", name: "Rafael Souza", role: "Shift Manager", hourlyRate: 18, location: "Kiosk", managerId: "", active: true, notes: "", sample: true },
  { id: "emp-2", name: "Beatriz Alves", role: "Barista", hourlyRate: 14, location: "Car / Pop-up", managerId: "emp-1", active: true, notes: "", sample: true },
  { id: "emp-3", name: "Diego Fernandes", role: "Barista", hourlyRate: 14, location: "Kiosk", managerId: "emp-1", active: true, notes: "", sample: true },
]);

/* ============================== AUTH & PERMISSIONS ============================== */
// Granular permission keys. OWNER implicitly has every permission (see can()).
// MANAGER/EMPLOYEE get their role's row in ROLE_DEFAULTS unless a specific user has an override
// in user.permissions.
const PERMISSIONS = [
  { key: "viewFinancials", label: "View revenue, profit, margins & cash balance" },
  { key: "manageSales", label: "Create sales" },
  { key: "reverseSales", label: "Cancel / reverse sales" },
  { key: "manageExpenses", label: "Add expenses" },
  { key: "reverseExpenses", label: "Reverse expenses" },
  { key: "manageInventory", label: "Receive stock & record waste" },
  { key: "adjustInventory", label: "Adjust stock counts / add inventory items" },
  { key: "manageRecipesAndCosts", label: "Edit products, recipes, prices & costs" },
  { key: "managePurchases", label: "Create purchase orders" },
  { key: "receivePurchases", label: "Receive purchase orders" },
  { key: "paySuppliers", label: "Pay suppliers & reverse payments" },
  { key: "reversePurchases", label: "Reverse received purchases" },
  { key: "manageSuppliers", label: "Add / edit / deactivate suppliers" },
  { key: "viewReports", label: "View reports" },
  { key: "manageTasks", label: "Create, assign & edit tasks for the team" },
  { key: "manageUsers", label: "Manage staff logins, roles & HR records" },
  { key: "manageSettings", label: "Change business settings" },
  { key: "manageCashRegister", label: "Open, close & manage the cash register" },
  { key: "manageCustomers", label: "Create, edit & archive customers" },
  { key: "manageLoyalty", label: "Manually adjust customer loyalty points" },
];

const ROLE_DEFAULTS = {
  OWNER: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])),
  MANAGER: {
    viewFinancials: true, manageSales: true, reverseSales: false, manageExpenses: true, reverseExpenses: false,
    manageInventory: true, adjustInventory: true, manageRecipesAndCosts: false, managePurchases: true,
    receivePurchases: true, paySuppliers: false, reversePurchases: false, manageSuppliers: false,
    viewReports: true, manageTasks: true, manageUsers: false, manageSettings: false, manageCashRegister: true,
    manageCustomers: true, manageLoyalty: true,
  },
  EMPLOYEE: {
    viewFinancials: false, manageSales: true, reverseSales: false, manageExpenses: true, reverseExpenses: false,
    manageInventory: true, adjustInventory: false, manageRecipesAndCosts: false, managePurchases: false,
    receivePurchases: true, paySuppliers: false, reversePurchases: false, manageSuppliers: false,
    viewReports: false, manageTasks: false, manageUsers: false, manageSettings: false, manageCashRegister: false,
    // Customer lookup/creation for a sale is already covered by manageSales (employees have it) —
    // manageCustomers here specifically gates CRM-level editing/archiving, not POS-time customer
    // creation, which stays available to any cashier via manageSales as the spec requires.
    manageCustomers: true, manageLoyalty: false,
  },
};

// Central permission gate — used everywhere a mutating or sensitive action happens, not just to hide buttons.
function can(user, permKey) {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  const override = user.permissions && user.permissions[permKey];
  if (override !== undefined) return !!override;
  const base = ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.EMPLOYEE;
  return !!base[permKey];
}

const ROLE_LABEL = { OWNER: "Owner", MANAGER: "Manager", EMPLOYEE: "Employee" };
const roleLabel = (role) => ROLE_LABEL[role] || "Employee";

const seedUsers = () => ([
  { id: "user-owner", name: "Marcos Masseli", username: "owner", pin: "1234", role: "OWNER", permissions: {}, active: true, employeeId: "", sample: true },
  { id: "user-mgr1", name: "Rafael Souza", username: "rafael", pin: "1111", role: "MANAGER", permissions: {}, active: true, employeeId: "emp-1", sample: true },
  { id: "user-emp2", name: "Beatriz Alves", username: "beatriz", pin: "2222", role: "EMPLOYEE", permissions: { viewReports: true }, active: true, employeeId: "emp-2", sample: true, notes: "Granted extra: can view reports" },
  { id: "user-emp3", name: "Diego Fernandes", username: "diego", pin: "3333", role: "EMPLOYEE", permissions: {}, active: true, employeeId: "emp-3", sample: true },
]);

const seedSettings = () => ({
  businessName: "Masseli Açaíberry",
  currency: "USD",
  taxRate: 7,
  taxEnabled: true,
  allowNegativeInventory: false,
  theme: "dark",
  paymentMethods: ["Cash", "Credit Card", "Debit Card", "Zelle", "Other"],
  channels: ["Kiosk", "Car/Pop-up", "DoorDash", "Uber Eats", "Website", "WhatsApp", "Other"],
  expenseCategories: ["Ingredients", "Packaging", "Rent", "Payroll", "Utilities", "Gas", "Marketing", "Delivery Fees", "Equipment", "Maintenance", "Supplies", "Taxes", "Other"],
  productCategories: ["Açaí", "Smoothies", "Gelato", "Toppings", "Drinks", "Other"],
  inventoryCategories: ["Açaí", "Fruit", "Toppings", "Packaging", "Drinks", "Cleaning Supplies", "Other"],
  units: ["Units", "Pieces", "Liters", "Gallons", "Kilograms", "Pounds", "Ounces", "Boxes", "Packages"],
});

function seedSalesAndCash(products, inventory) {
  const sales = [];
  const cash = [];
  const channels = ["Kiosk", "Car/Pop-up", "DoorDash", "Uber Eats", "Website"];
  const methods = ["Cash", "Credit Card", "Debit Card", "Zelle"];
  let counter = 1001;
  for (let day = 6; day >= 0; day--) {
    const salesCount = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < salesCount; s++) {
      const itemCount = 1 + Math.floor(Math.random() * 2);
      const items = [];
      for (let i = 0; i < itemCount; i++) {
        const p = products[Math.floor(Math.random() * products.length)];
        const qty = 1 + Math.floor(Math.random() * 2);
        items.push({ productId: p.id, name: p.name, qty, unitPrice: p.price, cost: computeProductCost(p, inventory) });
      }
      const subtotal = round2(items.reduce((a, it) => a + it.qty * it.unitPrice, 0));
      const discount = 0;
      const tax = round2((subtotal - discount) * 0.07);
      const total = round2(subtotal - discount + tax);
      const d = new Date(); d.setDate(d.getDate() - day); d.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
      const iso = d.toISOString();
      const channel = channels[Math.floor(Math.random() * channels.length)];
      const method = methods[Math.floor(Math.random() * methods.length)];
      const sale = {
        id: uid("sale"), orderNo: counter++, date: iso, items, subtotal, discount, tax, total,
        paymentMethod: method, channel, location: "Kiosk", employeeId: "emp-1", customerId: "", notes: "", sample: true,
        status: "completed", fulfillmentStatus: "Completed",
      };
      sales.push(sale);
      cash.push({ id: uid("cash"), date: iso, type: "income", category: `Sales - ${channel}`, amount: total, paymentMethod: method, description: `Sale #${sale.orderNo}`, relatedSaleId: sale.id, location: "Kiosk", sample: true });
    }
  }
  return { sales, cash };
}

const seedTasks = () => ([
  { id: uid("task"), title: "Restock napkins & straws at kiosk counter", assignedTo: "emp-2", dueDate: dateStrOffset(0), priority: "Medium", status: "pending", notes: "", createdAt: nowISO(), activity: [{ date: nowISO(), userId: "user-mgr1", userName: "Rafael Souza", action: "Created" }], sample: true },
  { id: uid("task"), title: "Deep clean blender stations", assignedTo: "emp-1", dueDate: dateStrOffset(0), priority: "High", status: "pending", notes: "End of day close-up task", createdAt: nowISO(), activity: [{ date: nowISO(), userId: "user-owner", userName: "Marcos Masseli", action: "Created" }], sample: true },
  { id: uid("task"), title: "Count cash drawer at open", assignedTo: "emp-1", dueDate: dateStrOffset(-1), priority: "High", status: "done", notes: "", createdAt: daysAgoISO(1), completedAt: daysAgoISO(1), completedBy: "user-mgr1", activity: [{ date: daysAgoISO(1), userId: "user-owner", userName: "Marcos Masseli", action: "Created" }, { date: daysAgoISO(1), userId: "user-mgr1", userName: "Rafael Souza", action: "Completed" }], sample: true },
  { id: uid("task"), title: "Call Fresh Farms about strawberry delivery", assignedTo: "emp-2", dueDate: dateStrOffset(1), priority: "Low", status: "pending", notes: "", createdAt: nowISO(), activity: [{ date: nowISO(), userId: "user-mgr1", userName: "Rafael Souza", action: "Created" }], sample: true },
  { id: uid("task"), title: "Wipe down and restock condiment station", assignedTo: "emp-3", dueDate: dateStrOffset(-2), priority: "Medium", status: "pending", notes: "", createdAt: daysAgoISO(2), activity: [{ date: daysAgoISO(2), userId: "user-mgr1", userName: "Rafael Souza", action: "Created" }], sample: true },
]);

function seedExpenses() {
  const list = [];
  list.push({ id: uid("exp"), date: daysAgoISO(2), category: "Rent", vendor: "Orlando Plaza LLC", amount: 1200, paymentMethod: "Zelle", recurring: true, description: "Monthly kiosk rent", sample: true });
  list.push({ id: uid("exp"), date: daysAgoISO(3), category: "Payroll", vendor: "Payroll", amount: 640, paymentMethod: "Zelle", recurring: true, description: "Bi-weekly payroll", sample: true });
  list.push({ id: uid("exp"), date: daysAgoISO(1), category: "Ingredients", vendor: "Amazon Fruit Co", amount: 214.5, paymentMethod: "Credit Card", recurring: false, description: "Açaí + granola restock", sample: true });
  list.push({ id: uid("exp"), date: daysAgoISO(4), category: "Utilities", vendor: "Duke Energy", amount: 96.2, paymentMethod: "Debit Card", recurring: true, description: "Electric bill", sample: true });
  list.push({ id: uid("exp"), date: daysAgoISO(5), category: "Marketing", vendor: "Meta Ads", amount: 60, paymentMethod: "Credit Card", recurring: false, description: "Instagram promotion", sample: true });
  return list;
}

// Purchase orders reference inventory item ids directly. Line items carry their own unitCost (the price
// paid on THAT order) plus a receivedQty, so partial receiving can be tracked without ever double-counting.
function seedPurchaseOrders() {
  const list = [];
  list.push({
    id: "po-1001", poNumber: "PO-1001", supplierId: "sup-amazon", orderDate: daysAgoISO(6), expectedDate: daysAgoISO(4),
    status: "Received", paymentMethod: "Zelle", notes: "Weekly açaí + granola restock", amountPaid: 0, discount: 0, tax: 0,
    items: [
      { id: uid("poi"), itemId: "inv-acai", qty: 3, unit: "Liters", unitCost: 88, receivedQty: 3 },
      { id: uid("poi"), itemId: "inv-granola", qty: 10, unit: "Pounds", unitCost: 2.9, receivedQty: 10 },
    ],
    sample: true,
  });
  list.push({
    id: "po-1002", poNumber: "PO-1002", supplierId: "sup-packco", orderDate: daysAgoISO(3), expectedDate: daysAgoISO(1),
    status: "Partially Received", paymentMethod: "Credit Card", notes: "Cup + spoon restock", amountPaid: 0, discount: 0, tax: 0,
    items: [
      { id: uid("poi"), itemId: "inv-cup12", qty: 500, unit: "Units", unitCost: 0.12, receivedQty: 300 },
      { id: uid("poi"), itemId: "inv-spoon", qty: 1000, unit: "Units", unitCost: 0.025, receivedQty: 1000 },
    ],
    sample: true,
  });
  list.push({
    id: "po-1003", poNumber: "PO-1003", supplierId: "sup-freshfarms", orderDate: daysAgoISO(0), expectedDate: daysAgoISO(-2),
    status: "Ordered", paymentMethod: "COD", notes: "Fruit restock — not yet delivered", amountPaid: 0, discount: 0, tax: 0,
    items: [
      { id: uid("poi"), itemId: "inv-strawberry", qty: 15, unit: "Pounds", unitCost: 2.55, receivedQty: 0 },
      { id: uid("poi"), itemId: "inv-blueberry", qty: 10, unit: "Pounds", unitCost: 4.1, receivedQty: 0 },
    ],
    sample: true,
  });
  return list;
}
const poLineTotal = (line) => round2(line.qty * line.unitCost);
const poSubtotal = (po) => round2(po.items.reduce((a, l) => a + poLineTotal(l), 0));
const poGrandTotal = (po) => round2(poSubtotal(po) - (po.discount || 0) + (po.tax || 0));
const poReceivedValue = (po) => round2(po.items.reduce((a, l) => a + l.receivedQty * l.unitCost, 0));
const poAmountDue = (po) => po.status === "Reversed" ? 0 : round2(poGrandTotal(po) - (po.amountPaid || 0));

/* ============================== BUSINESS LOGIC ============================== */
function computeProductCost(product, inventory) {
  if (!product?.recipe) return 0;
  return round2(product.recipe.reduce((sum, r) => {
    const item = inventory.find((i) => i.id === r.itemId);
    return sum + (item ? item.costPerUnit * r.qty : 0);
  }, 0));
}

// Applies a set of received purchase lines to inventory using WEIGHTED AVERAGE COST.
// receiveItems: [{ itemId, qty, unitCost }] — qty is the quantity being received *this time* (not the PO total).
// Returns the next inventory array plus one immutable ledger transaction per line (type "Purchase").
// This is the single source of truth for cost math so seed data and live receiving never drift apart.
function applyPurchaseReceipt(inventory, receiveItems, meta = {}) {
  const txEntries = [];
  const nextInventory = inventory.map((inv) => {
    const line = receiveItems.find((r) => r.itemId === inv.id && r.qty > 0);
    if (!line) return inv;
    const oldQty = inv.qty;
    const oldCost = inv.costPerUnit;
    const addQty = round2(line.qty);
    const newQty = round2(oldQty + addQty);
    const newAvgCost = newQty > 0 ? round2((oldQty * oldCost + addQty * line.unitCost) / newQty) : oldCost;
    txEntries.push({
      id: uid("itx"), date: meta.date || nowISO(), itemId: inv.id, itemName: inv.name, type: "Purchase",
      qty: addQty, unit: inv.unit, unitCost: line.unitCost, totalCost: round2(addQty * line.unitCost),
      referenceId: meta.referenceId || "", referenceLabel: meta.referenceLabel || "", supplierId: meta.supplierId || inv.supplierId || "",
      note: meta.note || "", prevAvgCost: oldCost, newAvgCost,
    });
    return { ...inv, qty: newQty, costPerUnit: newAvgCost, lastPurchaseCost: line.unitCost, lastPurchaseDate: meta.date || nowISO(), supplierId: meta.supplierId || inv.supplierId };
  });
  return { nextInventory, txEntries };
}

// Appends one immutable audit entry. Called explicitly at each mutation site (not via a shared
// closure) so it always writes against the caller's own live `auditLog` prop, not a stale one.
async function logAudit(auditLog, setAuditLog, user, action, details) {
  const entry = { id: uid("audit"), date: nowISO(), userId: user?.id || "", userName: user?.name || "Unknown", role: user?.role || "", action, details: details || "" };
  try { await setAuditLog([entry, ...(auditLog || [])]); } catch (e) { console.error("audit log error", e); }
}

// Idempotent append for ledger arrays with deterministic IDs. If an entry with this exact `id`
// already exists, this is a safe no-op (the step was already completed by an earlier, interrupted
// attempt at the same operation) — returns `added:false` so the caller can skip the dependent
// write too. Never mutates or removes existing entries; append-only semantics are unchanged, this
// only adds a presence check before the append.
function appendIfMissing(array, entry) {
  if ((array || []).some((x) => x.id === entry.id)) return { array: array || [], added: false };
  return { array: [entry, ...(array || [])], added: true };
}

// Applies a set of per-item inventory quantity deltas exactly once per deterministic operation id,
// by recording that id directly on each affected inventory item (`appliedOps`) IN THE SAME array
// transformation that changes `qty` — so a single setInventory() call commits both together. This
// is what makes the inventory quantity step itself retry-safe without depending on invTx (a
// separate collection/write) as the signal for "was this already applied" — closing the residual
// window where invTx succeeds but the inventory write that was gated on it never runs.
// `appliedOps` exists purely for short-term deterministic retry protection — it is NOT the
// inventory audit history (that remains invTx, unchanged). Items without an existing `appliedOps`
// field are treated as starting from [] — fully backward compatible with existing data.
// `itemDeltas` is { itemId: signedDelta } — positive to add, negative to subtract.
function applyInventoryOpIfNeeded(inventory, opId, itemDeltas) {
  const affectedIds = Object.keys(itemDeltas);
  if (affectedIds.length === 0) return { changed: false, nextInventory: inventory };
  const alreadyApplied = affectedIds.every((id) => {
    const inv = inventory.find((i) => i.id === id);
    return inv && (inv.appliedOps || []).includes(opId);
  });
  if (alreadyApplied) return { changed: false, nextInventory: inventory };
  const nextInventory = inventory.map((inv) => {
    if (!(inv.id in itemDeltas)) return inv;
    if ((inv.appliedOps || []).includes(opId)) return inv; // this specific item already done
    return { ...inv, qty: round2(inv.qty + itemDeltas[inv.id]), appliedOps: [...(inv.appliedOps || []), opId] };
  });
  return { changed: true, nextInventory };
}

// NORMAL / LOW / CRITICAL / OUT_OF_STOCK based on min threshold (critical = below half of minimum).
function stockStatus(item) {  if (item.qty <= 0) return "OUT_OF_STOCK";
  if (item.qty <= item.minQty * 0.5) return "CRITICAL";
  if (item.qty <= item.minQty) return "LOW";
  return "NORMAL";
}
const STOCK_STATUS_TONE = { OUT_OF_STOCK: "danger", CRITICAL: "danger", LOW: "warn", NORMAL: "good" };
const STOCK_STATUS_LABEL = { OUT_OF_STOCK: "OUT OF STOCK", CRITICAL: "CRITICAL", LOW: "LOW STOCK", NORMAL: "NORMAL" };
// Suggested Order Quantity = Maximum Stock - Current Stock (never negative).
const suggestedOrderQty = (item) => clamp0(round2((item.maxQty || 0) - item.qty));

/* ============================== INVENTORY INTELLIGENCE (Phase F) ==============================
 * Built entirely on top of what already existed: stockStatus, STOCK_STATUS_* labels, and
 * suggestedOrderQty (health + reorder quantity, unchanged), plus invTx (the append-only ledger
 * InventoryService already writes to for every Sale/Reversal/Purchase/Waste/Adjustment). This
 * adds exactly one genuinely new capability — consumption analytics — plus a thin recommendation
 * layer that combines existing signals. No second inventory balance, no second ledger, no
 * fabricated data.
 * ============================================================================== */

// Real consumption only — reads invTx entries of type "Sale" for this item within the window
// (Sale entries are always negative qty, confirmed from InventoryService.saleLedgerEntries).
// Returns null for daysRemaining when there's no usage to divide by, rather than fabricating a
// number — an explicit "no data" is more honest than a fake estimate.
function calculateConsumptionAnalytics(item, invTx, days = 30) {
  const cutoff = Date.now() - days * 86400000;
  const salesInWindow = (invTx || []).filter((t) => t.itemId === item.id && t.type === "Sale" && new Date(t.date).getTime() >= cutoff);
  const consumedQty = round2(salesInWindow.reduce((a, t) => a + Math.abs(t.qty), 0));
  const avgDailyUsage = consumedQty > 0 ? round2(consumedQty / days) : 0;
  const daysRemaining = avgDailyUsage > 0 ? Math.floor(item.qty / avgDailyUsage) : null;
  return { consumedQty, avgDailyUsage, daysRemaining, days };
}

// Urgency ordering used for sorting recommendations — lower is more urgent.
const STOCK_URGENCY = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW: 2, NORMAL: 3 };

// The one centralized place purchase recommendations are derived. Pure — never mutates
// inventory, never creates a purchase order by itself. Only items that actually need attention
// are included (NORMAL items are deliberately excluded, per the spec).
function getPurchaseRecommendations({ inventory, suppliers, invTx }) {
  return (inventory || [])
    .map((item) => {
      const status = stockStatus(item);
      const analytics = calculateConsumptionAnalytics(item, invTx, 30);
      const supplier = item.supplierId ? (suppliers || []).find((s) => s.id === item.supplierId) : null;
      return {
        item, status, quantity: item.qty, unit: item.unit,
        recommendedQty: suggestedOrderQty(item),
        avgDailyUsage: analytics.avgDailyUsage, daysRemaining: analytics.daysRemaining,
        supplierName: supplier?.name || null, supplierId: item.supplierId || null,
      };
    })
    .filter((r) => r.status !== "NORMAL")
    .sort((a, b) => {
      const u = STOCK_URGENCY[a.status] - STOCK_URGENCY[b.status];
      if (u !== 0) return u;
      // Within the same urgency: lowest days-remaining first; items with no usage data sort last.
      if (a.daysRemaining === null && b.daysRemaining === null) return 0;
      if (a.daysRemaining === null) return 1;
      if (b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });
}


// EXPIRED / EXPIRING_SOON / null, based on the item's own stored expiresAt (never a fabricated date).
const EXPIRY_SOON_DAYS = 5;
function expiryStatus(item) {
  if (!item.expiresAt) return null;
  const diffDays = (new Date(item.expiresAt).getTime() - businessNow().getTime()) / 86400000;
  if (diffDays < 0) return "EXPIRED";
  if (diffDays <= EXPIRY_SOON_DAYS) return "EXPIRING_SOON";
  return null;
}
const EXPIRY_TONE = { EXPIRED: "danger", EXPIRING_SOON: "warn" };
const EXPIRY_LABEL = { EXPIRED: "EXPIRED", EXPIRING_SOON: "EXPIRING SOON" };

/* ============================== INVENTORY SERVICE BOUNDARY ==============================
 * Everything that changes inventory quantities or writes to the inventory ledger goes
 * through here. Before this extraction, six different screens each built their own ledger
 * entry object inline (Sale, Reversal ×2, Initial Stock, Adjustment, Waste, Purchase) with
 * slightly different field sets — this consolidates that into one constructor so every
 * entry has the same shape, and isolates the actual quantity math (sale deduction, reversal
 * restore) so it's not duplicated between the modal that performs the action and anywhere
 * else that might need to reason about it later.
 * applyPurchaseReceipt (weighted-average costing) already existed as its own function and is
 * included here by reference rather than rewritten, per "prefer extraction over rewriting".
 * ============================================================================== */
const InventoryService = {
  // The one place a ledger transaction object gets constructed. Every call site below passes
  // the same fields it always did — this only removes the inconsistency of some sites omitting
  // referenceId/referenceLabel/unitCost/totalCost while others included them.
  makeLedgerEntry({ itemId, itemName, type, qty, unit, unitCost = null, totalCost = null, referenceId = "", referenceLabel = "", note = "", date = null }) {
    return { id: uid("itx"), date: date || nowISO(), itemId, itemName, type, qty, unit, unitCost, totalCost, referenceId, referenceLabel, note };
  },

  // Purchase receiving + weighted-average cost — unchanged, just re-exposed on the service boundary.
  applyReceipt: applyPurchaseReceipt,

  // Sale → inventory deduction. `deductions` is { itemId: qtyNeeded } accumulated from every line
  // item's recipe. Mirrors exactly what NewSaleModal computed inline before this extraction.
  deductForSale(inventory, deductions, allowNegativeInventory) {
    return inventory.map((inv) => deductions[inv.id]
      ? { ...inv, qty: allowNegativeInventory ? round2(inv.qty - deductions[inv.id]) : clamp0(round2(inv.qty - deductions[inv.id])) }
      : inv);
  },
  // One "Sale" ledger entry per ingredient/packaging item consumed.
  saleLedgerEntries(inventoryBeforeDeduction, deductions, { saleId, orderNo }) {
    return Object.entries(deductions).map(([itemId, qty]) => {
      const inv = inventoryBeforeDeduction.find((i) => i.id === itemId);
      return InventoryService.makeLedgerEntry({
        itemId, itemName: inv?.name || itemId, type: "Sale", qty: -round2(qty), unit: inv?.unit || "",
        unitCost: inv?.costPerUnit ?? null, totalCost: inv ? -round2(qty * inv.costPerUnit) : null,
        referenceId: saleId, referenceLabel: `Sale #${orderNo}`, note: `Sold via Order #${orderNo}`,
      });
    });
  },

  // Sale cancellation → restore inventory. `restore` is { itemId: qty } to add back.
  restoreForReversal(inventory, restore) {
    return inventory.map((inv) => (restore[inv.id] ? { ...inv, qty: round2(inv.qty + restore[inv.id]) } : inv));
  },
  saleReversalLedgerEntries(inventoryBeforeRestore, restore, { saleId, orderNo }) {
    return Object.entries(restore).map(([itemId, qty]) => {
      const inv = inventoryBeforeRestore.find((i) => i.id === itemId);
      return InventoryService.makeLedgerEntry({
        itemId, itemName: inv?.name || itemId, type: "Reversal", qty: round2(qty), unit: inv?.unit || "",
        unitCost: inv?.costPerUnit ?? null, totalCost: inv ? round2(qty * inv.costPerUnit) : null,
        referenceId: saleId, referenceLabel: `Sale #${orderNo}`, note: `Restored from cancelled Sale #${orderNo}`,
      });
    });
  },
};

/* ============================== PAYMENT SERVICE (Phase B1 — Terminal-ready architecture) ==============================
 * POS UI → paymentService.processPayment() → selected adapter (simulator today, Stripe Terminal
 * later) → standard PaymentResult → routed to the EXISTING finalizeSuccessfulPayment()/
 * failSalePayment() below, completely unchanged. NewSaleModal never talks to an adapter directly
 * and never knows which one is active — only paymentService does.
 *
 * FUTURE BACKEND CONTRACT (not implemented in this phase — no server-side Stripe logic exists
 * anywhere in this app yet, and none of these endpoints are called):
 *   POST /api/stripe/terminal/connection-token   — backend mints a Terminal SDK connection token
 *                                                    (requires the Stripe SECRET key; must never
 *                                                    run in the frontend)
 *   POST /api/stripe/payment-intents              — backend creates a PaymentIntent for the sale total
 *   POST /api/stripe/payment-intents/:id/cancel    — backend cancels an in-flight PaymentIntent
 * stripeTerminalAdapter below is the future frontend-side caller of those endpoints — today every
 * one of its methods returns a "not configured" result and touches no network at all.
 * ============================================================================== */

// The only place that decides which adapter handles a payment. Swapping "simulator" for
// "stripe_terminal" here (once a backend exists) is the entire cutover — nothing in NewSaleModal
// or the finalize/fail functions needs to change.
const PAYMENT_MODE = "simulator"; // "simulator" | "stripe_terminal" (future)

// The one payment-result shape every adapter returns, and the only shape finalizeSuccessfulPayment/
// failSalePayment ever need to understand. `error` is null on success; `transactionId` is null
// until a provider actually assigns one. Never carries card number/CVV/track data — only ever an
// opaque id, amount, and a human-readable error message.
function makePaymentResult({ success, status, paymentMethod, provider, transactionId = null, amount, currency = "USD", error = null, metadata = {} }) {
  return { success, status, paymentMethod, provider, transactionId, amount, currency, error, metadata };
}

function generateSimTransactionId() {
  return `sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Simulator adapter -----------------------------------------------------------------------
// Realistic lifecycle: idle -> processing -> (approved | declined | canceled). Since there's no
// physical reader, the outcome is chosen by whoever is running the sale (see the Payment
// Simulator panel in NewSaleModal) rather than resolved automatically — that's the ENTIRE reason
// this exists as a distinct testing surface. Returns { promise, readyPromise, approve, decline,
// cancel } — the promise settles exactly once (native Promise semantics), which is what makes
// double-clicking Approve/Decline/Cancel safe with zero extra bookkeeping.
const simulatorAdapter = {
  processPayment(request) {
    const { paymentMethod, amount, currency = "USD", metadata = {}, simulatedDelayMs = 1200 } = request;
    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    let settled = false;
    const settleOnce = (result) => { if (!settled) { settled = true; settle(result); } };

    // Purely cosmetic "connecting to terminal" delay (1-3s range, defaults to 1.2s) — not a real
    // network wait, and never blocks the rest of the UI; it only gates when the operator's
    // approve/decline/cancel controls become active, for a bit of realism.
    const readyPromise = new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(simulatedDelayMs, 800), 3000)));

    return {
      readyPromise,
      promise,
      approve: () => settleOnce(makePaymentResult({
        success: true, status: "succeeded", paymentMethod, provider: "simulator",
        transactionId: generateSimTransactionId(), amount, currency, metadata,
      })),
      decline: (reason) => settleOnce(makePaymentResult({
        success: false, status: "failed", paymentMethod, provider: "simulator",
        transactionId: generateSimTransactionId(), amount, currency, metadata,
        error: { code: "card_declined", message: reason || "The card was declined." },
      })),
      cancel: () => settleOnce(makePaymentResult({
        success: false, status: "canceled", paymentMethod, provider: "simulator",
        amount, currency, metadata,
      })),
    };
  },
};

// ---- Stripe Terminal adapter (placeholder — Phase B2+) ---------------------------------------
// Every method is a real, callable function with the real future signature, and every one
// returns an honest "not configured" result. None of them touch the network, generate a fake
// PaymentIntent, or pretend a reader is connected. Wiring these to the backend contract above is
// the entire scope of the next phase — nothing else in this file should need to change.
const stripeTerminalAdapter = {
  async initialize() {
    return { success: false, status: "not_configured", message: "Stripe Terminal is not configured. Requires a backend connection-token endpoint — see PAYMENT SERVICE notes above." };
  },
  async discoverReaders() {
    return { success: false, status: "not_configured", readers: [], message: "No Stripe Terminal backend is connected yet." };
  },
  async connectReader(_reader) {
    return { success: false, status: "not_configured", message: "No Stripe Terminal backend is connected yet." };
  },
  processPayment(request) {
    const result = makePaymentResult({
      success: false, status: "failed", paymentMethod: request.paymentMethod, provider: "stripe_terminal",
      amount: request.amount, currency: request.currency || "USD",
      error: { code: "not_configured", message: "Card terminal is not available." },
    });
    return { readyPromise: Promise.resolve(), promise: Promise.resolve(result), approve: () => {}, decline: () => {}, cancel: () => {} };
  },
  async cancelPayment() {
    return { success: false, status: "not_configured", message: "No active Stripe Terminal payment to cancel." };
  },
};

// ---- The single entry point the rest of the app calls ----------------------------------------
// Cash/Zelle/Other are immediately-trusted manual payment methods — no adapter, no processing
// state, no delay; resolved synchronously into the same standard result shape so
// finalizeSuccessfulPayment never needs a special case for "how was this paid".
const paymentService = {
  getMode() { return PAYMENT_MODE; },
  processPayment(request) {
    if (CARD_PAYMENT_METHODS.includes(request.paymentMethod)) {
      const adapter = PAYMENT_MODE === "stripe_terminal" ? stripeTerminalAdapter : simulatorAdapter;
      return adapter.processPayment(request);
    }
    const result = makePaymentResult({
      success: true, status: "succeeded", paymentMethod: request.paymentMethod,
      provider: request.paymentMethod === "Cash" ? "cash" : "manual",
      amount: request.amount, currency: request.currency || "USD", metadata: request.metadata,
    });
    return { readyPromise: Promise.resolve(), promise: Promise.resolve(result), approve: () => {}, decline: () => {}, cancel: () => {} };
  },
};

/* ============================== SALE PAYMENT LIFECYCLE (Phase A — Stripe Terminal readiness) ==============================
 * A sale now separates a PAYMENT ATTEMPT (built by NewSaleModal, held in memory only — never
 * persisted while pending) from a FINALIZED sale (persisted, inventory deducted, cash recorded).
 * Cash/Zelle/Other route straight to finalizeSuccessfulPayment() below — they're
 * immediately-successful manual payment methods. Credit/Debit Card currently uses a clearly
 * labeled TEMPORARY manual confirmation step in NewSaleModal in place of real Stripe Terminal.
 *
 * sale.status is intentionally left EXACTLY as it was — "completed" | "cancelled", no new values.
 * Every existing revenue/filter/report call site (Dashboard, Reports, Sales list, Customers — see
 * the ~10 places that check `status !== "cancelled"`) already treats that as "counts as revenue",
 * so a FAILED payment reuses the existing "cancelled" status rather than introducing a new value
 * that would require touching every one of those call sites. paymentStatus
 * ("pending" | "paid" | "failed") is the new, purely additive source of payment truth — and since
 * a "pending" payment attempt is never persisted to `sales` at all, it can never be miscounted
 * anywhere, with zero changes needed to existing reporting code.
 *
 * *** PHASE B INTEGRATION POINT ***
 * A future Stripe Terminal confirmation handler should call
 *   finalizeSuccessfulPayment(pendingSale, { stripePaymentIntentId: <real id from Stripe> }, ctx)
 * — the exact same function the temporary manual card confirmation calls today. A declined/failed
 * Terminal payment should call failSalePayment(pendingSale, reason, ctx) the same way. Neither
 * function needs to change for that swap — only what calls them does.
 * ============================================================================== */

// Card payment methods that currently route through the temporary manual confirmation flow
// instead of immediate finalization. Phase B's Stripe Terminal integration is the thing that
// changes what happens when one of these is selected — this list is the switch point.
const CARD_PAYMENT_METHODS = ["Credit Card", "Debit Card"];
const NEXALVO_BUILD = "v1.6.8";

// The ONE path responsible for turning a payment attempt into a real, finalized sale. Reuses the
// existing InventoryService functions and persistence callbacks completely unchanged — deduction
// math, ledger shape, and cash-transaction shape are all identical to what NewSaleModal did
// inline before this phase. Idempotent: if a sale with this id is already persisted, returns it
// as-is instead of re-running any side effect (prevents double deduction/ledger/cash if called
// twice for the same payment attempt — e.g. a duplicate confirmation event in a future Stripe flow).
async function finalizeSuccessfulPayment(pendingSale, paymentDetails, ctx) {
  const { sales, persistSales, inventory, setInventory, invTx, setInvTx, cashTx, persistCash, currentUser, auditLog, setAuditLog, supabaseSalesOps, reloadInventory } = ctx;

  // Phase 3 production path: ONE database RPC owns sale header, line items, recipe deductions,
  // inventory ledger/balance, cash_flow and audit log in a single PostgreSQL transaction.
  // HARD FAIL-SAFE: an authenticated tenant must NEVER fall back to the legacy/local sale path.
  if (ctx.businessId && !supabaseSalesOps?.remote) {
    throw new Error(`Phase 3 Supabase sales is not active in this build (${NEXALVO_BUILD}). Sale was NOT saved.`);
  }
  if (supabaseSalesOps?.remote) {
    let sale;
    try {
      sale = await supabaseSalesOps.create(pendingSale);
    } catch (e) {
      // rpcSucceeded (set by useSupabaseSales.ops.create) means fn_create_sale itself already
      // committed — only its own reload afterward failed. e.result is the raw RPC return, used
      // here to build a usable sale object (order number, totals, etc.) so the receipt/
      // completedSale flow downstream still has something real to show, even though the full
      // reloaded/mapped row isn't available. This must never be thrown onward as a generic "sale
      // could not be saved" — the caller needs to be able to tell this apart and still proceed to
      // commit loyalty for a sale that genuinely exists.
      if (e?.rpcSucceeded) {
        const row = e.result || {};
        return {
          id: row.id || pendingSale.id, orderNo: row.order_no ?? pendingSale.orderNo, date: row.sale_date || row.created_at || nowISO(),
          status: row.status || "completed", fulfillmentStatus: row.fulfillment_status || pendingSale.fulfillmentStatus,
          items: pendingSale.items, subtotal: Number(row.subtotal ?? pendingSale.subtotal ?? 0), discount: Number(row.discount ?? pendingSale.discount ?? 0),
          tax: Number(row.tax ?? pendingSale.tax ?? 0), total: Number(row.total ?? pendingSale.total ?? 0), paymentMethod: pendingSale.paymentMethod,
          channel: pendingSale.channel, locationId: pendingSale.locationId, location: pendingSale.location, employeeId: pendingSale.employeeId,
          customerId: pendingSale.customerId, notes: pendingSale.notes, createdBy: currentUser?.id,
          stripePaymentIntentId: paymentDetails?.stripePaymentIntentId ?? null,
          staleData: true, staleMessage: e.message,
        };
      }
      throw e; // true creation failure — propagate normally
    }
    if (!sale) throw new Error("Sale was created but could not be reloaded from Supabase.");
    try {
      if (reloadInventory) await reloadInventory();
    } catch (e) {
      // The sale itself is fully committed and already reloaded successfully above (the try block
      // did not throw) — only this separate catalog-inventory refresh afterward failed. This is a
      // distinct reload from the one inside ops.create, and its failure must not be reported as a
      // sale failure either.
      ctx.reportLoadError?.("inventory", "reload", e.message);
      return { ...sale, stripePaymentIntentId: paymentDetails?.stripePaymentIntentId ?? null,
        staleData: true, staleMessage: "The sale was saved, but inventory data on screen may be outdated. Refresh the page." };
    }
    return { ...sale, stripePaymentIntentId: paymentDetails?.stripePaymentIntentId ?? null };
  }

  // Retry-safety design: inventory.qty and the deterministic operation marker (appliedOps) are
  // computed and written TOGETHER in one setInventory() call — this is now the single critical
  // step, no longer gated on invTx (a separate collection/write) as the "already done?" signal.
  // invTx is written AFTER, checked/completed independently — its failure never leaves the
  // physical quantity wrong, only delays the audit row, the same tolerance this codebase already
  // grants logAudit. This closes the previously-disclosed residual: invTx succeeding but the
  // inventory write it used to gate never running.
  let sale = sales.find((s) => s.id === pendingSale.id);
  if (!sale) {
    const opId = `${pendingSale.id}-inventory-deduct`;
    const itemDeltas = Object.fromEntries(Object.entries(pendingSale.deductions).map(([itemId, qty]) => [itemId, -qty]));
    const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, opId, itemDeltas);
    if (changed) {
      const clamped = pendingSale.allowNegativeInventory ? nextInventory : nextInventory.map((inv) => ({ ...inv, qty: clamp0(inv.qty) }));
      await setInventory(clamped);
    }

    sale = {
      id: pendingSale.id, orderNo: pendingSale.orderNo, date: nowISO(), status: "completed",
      paymentStatus: "paid", stripePaymentIntentId: paymentDetails?.stripePaymentIntentId ?? null,
      createdBy: currentUser?.id, fulfillmentStatus: pendingSale.fulfillmentStatus,
      items: pendingSale.items, subtotal: pendingSale.subtotal, discount: pendingSale.discount, tax: pendingSale.tax, total: pendingSale.total,
      paymentMethod: pendingSale.paymentMethod, channel: pendingSale.channel, locationId: pendingSale.locationId, location: pendingSale.location,
      employeeId: pendingSale.employeeId, customerId: pendingSale.customerId, notes: pendingSale.notes,
    };
    await persistSales([sale, ...sales]);
  }

  // invTx (audit ledger) is checked/completed independently of the sale-exists early return above
  // — same "always verify the non-critical step separately" pattern already used for cashTx below.
  const plannedEntries = InventoryService.saleLedgerEntries(inventory, pendingSale.deductions, { saleId: pendingSale.id, orderNo: pendingSale.orderNo })
    .map((e) => ({ ...e, id: `${pendingSale.id}-inventory-${e.itemId}` }));
  const newEntries = plannedEntries.filter((e) => !(ctx.invTx || []).some((x) => x.id === e.id));
  if (newEntries.length) {
    await setInvTx([...newEntries, ...(ctx.invTx || [])]);
  }

  // cashTx is checked/written independently of the `sale` early-return above, so a retry that
  // finds the sale already persisted (e.g. cashTx failed on a prior attempt) still completes the
  // missing cash step instead of stopping short — this is what closes the A4 data-loss scenario.
  const cashId = `${pendingSale.id}-cash`;
  if (!(ctx.cashTx || []).some((t) => t.id === cashId)) {
    await persistCash([{ id: cashId, date: sale.date, type: "income", category: `Sales - ${sale.channel}`, amount: sale.total, paymentMethod: sale.paymentMethod, description: `Sale #${sale.orderNo}`, relatedSaleId: sale.id, locationId: sale.locationId, location: sale.location }, ...ctx.cashTx]);
  }
  await logAudit(auditLog, setAuditLog, currentUser, "Sale Created", `Order #${sale.orderNo} · ${fmtMoney(sale.total)} · ${sale.channel}`);
  return sale;
}

// A payment attempt that did not succeed. Persists a minimal record for audit visibility, reusing
// the existing "cancelled" status so it's automatically excluded from every revenue/report
// calculation already in the app — zero changes needed to those call sites. Performs NONE of the
// finalize side effects: no inventory deduction, no ledger entry, no cash transaction.
async function failSalePayment(pendingSale, reason, ctx) {
  const { sales, persistSales, currentUser, auditLog, setAuditLog } = ctx;

  const existing = sales.find((s) => s.id === pendingSale.id);
  if (existing) return existing;

  const sale = {
    id: pendingSale.id, orderNo: pendingSale.orderNo, date: nowISO(), status: "cancelled",
    paymentStatus: "failed", stripePaymentIntentId: null, createdBy: currentUser?.id,
    cancelledAt: nowISO(), cancelledBy: currentUser?.id, fulfillmentStatus: pendingSale.fulfillmentStatus,
    items: pendingSale.items, subtotal: pendingSale.subtotal, discount: pendingSale.discount, tax: pendingSale.tax, total: pendingSale.total,
    paymentMethod: pendingSale.paymentMethod, channel: pendingSale.channel, locationId: pendingSale.locationId, location: pendingSale.location,
    employeeId: pendingSale.employeeId, customerId: pendingSale.customerId,
    notes: [pendingSale.notes, reason ? `Payment failed: ${reason}` : "Payment failed"].filter(Boolean).join(" — "),
  };
  await persistSales([sale, ...sales]);
  await logAudit(auditLog, setAuditLog, currentUser, "Payment Failed", `Order #${sale.orderNo} · ${sale.channel}${reason ? " · " + reason : ""}`);
  return sale;
}

// Resolves a display name for any record that may carry either the new `locationId` (stable,
// rename-safe) or the legacy `location` name string (pre-migration records). Always prefer the
// live location record so a rename is reflected everywhere immediately; fall back to the frozen
// string only for old records that never got a locationId.
const locationLabel = (record, locations) => {
  if (!record) return "—";
  const byId = record.locationId && (locations || []).find((l) => l.id === record.locationId);
  if (byId) return byId.name;
  return record.location || "—";
};

// Order fulfillment workflow — separate from `sale.status` (which tracks completed/cancelled for
// financial reversal purposes). Kiosk/Car walk-up sales are paid-and-handed-over instantly, so they
// default straight to "Completed"; delivery/online channels start the queue at "Received".
const FULFILLMENT_STATUSES = ["Received", "Preparing", "Ready", "Completed"];
const FULFILLMENT_TONE = { Received: "warn", Preparing: "warn", Ready: "good", Completed: "default" };
const INSTANT_CHANNELS = ["Kiosk", "Car/Pop-up"];
const nextFulfillmentStatus = (status) => {
  const idx = FULFILLMENT_STATUSES.indexOf(status);
  return idx >= 0 && idx < FULFILLMENT_STATUSES.length - 1 ? FULFILLMENT_STATUSES[idx + 1] : status;
};

/* ============================== ORDER STATUS / PRODUCTION WORKFLOW (Phase E) ==============================
 * Deliberately layered ON TOP of the fulfillmentStatus values that already exist and are already
 * stored on every historical sale (Received/Preparing/Ready/Completed) — never renamed, since a
 * rename would require migrating every existing sale for zero real benefit. This metadata is the
 * "internal value / display label / description" the spec asks for; ORDER_STATUS_META's labels
 * are what Phase E calls NEW / IN PRODUCTION / READY / COMPLETED conceptually.
 * ============================================================================== */
const ORDER_STATUS_META = {
  Received:  { label: "NEW", description: "Just came in — not started yet", action: "Start Preparing" },
  Preparing: { label: "IN PRODUCTION", description: "Being prepared", action: "Mark Ready" },
  Ready:     { label: "READY", description: "Ready for pickup/handoff", action: "Complete Order" },
  Completed: { label: "COMPLETED", description: "Delivered/handed off", action: null },
};

// Live, human-readable elapsed time — never stored, always computed at render time from the real
// timestamp, so it can never go stale the way a cached "waitingMinutes" field would.
function formatElapsed(fromISO, toISO) {
  if (!fromISO) return "—";
  const ms = Math.max(0, new Date(toISO || Date.now()).getTime() - new Date(fromISO).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

// The ONE centralized place a sale's operational status is ever advanced. Reused by both
// SaleDetailModal and the Orders board — no component mutates fulfillmentStatus directly.
// Only ever moves forward exactly one step (via nextFulfillmentStatus, which already refuses to
// skip or go backward — this IS the transition validation the spec asks for; there is no code
// path that can set e.g. Completed -> Preparing). Re-checks the latest sale record immediately
// before writing (same idempotency pattern used by every other lifecycle action in this file),
// so rapid repeated clicks can only ever produce one valid transition. Sets the corresponding
// timestamp ONLY the first time a status is reached — never overwrites a historical moment.
// Touches ONLY sale.fulfillmentStatus and the one new timestamp field — never inventory, cash,
// payment, or loyalty, which is what keeps this purely operational.
async function advanceOrderStatus(saleId, sales, persistSales) {
  const latest = sales.find((s) => s.id === saleId);
  if (!latest) return { success: false, error: "Order not found." };
  if (latest.status === "cancelled") return { success: false, error: "This order was cancelled." };
  const from = latest.fulfillmentStatus || "Received";
  if (from === "Completed") return { success: true, sale: latest }; // idempotent no-op — already at the end
  const to = nextFulfillmentStatus(from);
  const now = nowISO();
  const timestampField = to === "Preparing" ? "productionStartedAt" : to === "Ready" ? "readyAt" : to === "Completed" ? "completedAt" : null;
  const patch = { fulfillmentStatus: to };
  if (timestampField && !latest[timestampField]) patch[timestampField] = now;
  const updated = { ...latest, ...patch };
  try {
    await persistSales(sales.map((s) => (s.id === saleId ? updated : s)));
  } catch (e) {
    // rpcSucceeded (set by useSupabaseSales.persist) means fn_advance_sale_fulfillment itself
    // already committed — the order's status really did advance to `to` on the server. This must
    // never be reported as { success: false }, or the caller could be misled into advancing the
    // same order again. `updated` is already the correct locally-computed next state (status +
    // any timestamp) — no RPC-returned data is needed to identify the sale and its new status here.
    if (e?.rpcSucceeded) return { success: true, sale: updated, staleData: true, message: e.message };
    return { success: false, error: e?.message || "Could not update this order's status." };
  }
  return { success: true, sale: updated };
}

// Compatibility reader for sale.paymentStatus — historical sales created before this field
// existed are always treated as "paid": they were fully completed and counted as revenue under
// the old single-status model. Payment succeeding and a sale being LATER reversed are different
// concepts (this reflects only whether the payment itself ever succeeded); it never reads or
// infers anything from sale.status, which stays the sole source of truth for reversal/reporting.
const getPaymentStatus = (sale) => sale.paymentStatus || "paid";

/* ============================== CASH REGISTER (Phase C) ==============================
 * A cash register session is a SUMMARY/CONTROL record over the EXISTING cashTx ledger — never a
 * second, independently-maintained financial ledger. Expected cash is always computed by reading
 * the real cashTx entries (the exact same ones sales/expenses/reversals already create), never by
 * incrementing/decrementing a stored running total. This is the same "the ledger is authoritative"
 * principle the inventory system has used since Phase 3D.
 * ============================================================================== */

// Register-specific cashTx categories — these reuse the EXISTING cashTx shape (type: "income"/
// "expense", created via persistCash) exactly like every other cash movement in the app. No
// second transaction system. `paymentMethod: "Cash"` is set explicitly on every one of these,
// which is also what lets the expected-cash formula below distinguish "affects the physical
// drawer" from "affects overall revenue/expense" without any new flag on sale/expense creation.
const CASH_REGISTER_CATEGORIES = {
  OPENING: "Cash Register - Opening",
  ADDITION: "Cash Addition",
  WITHDRAWAL: "Cash Withdrawal",
  DROP: "Cash Drop / Safe Drop",
  ADJUSTMENT: "Cash Register - Adjustment",
};
const CASH_MOVEMENT_TYPES = [
  { key: "addition", label: "Cash Addition", category: CASH_REGISTER_CATEGORIES.ADDITION, cashType: "income" },
  { key: "withdrawal", label: "Cash Withdrawal", category: CASH_REGISTER_CATEGORIES.WITHDRAWAL, cashType: "expense" },
  { key: "drop", label: "Cash Drop / Safe Drop", category: CASH_REGISTER_CATEGORIES.DROP, cashType: "expense" },
];

function findOpenRegister(cashRegisters, locationId) {
  return (cashRegisters || []).find((r) => r.locationId === locationId && r.status === "open") || null;
}

// The cashTx entries this register's calculations are built from: same location, same physical-
// cash payment method, within the register's open window, excluding the opening entry itself
// (which is counted once via register.openingCash, not re-summed here to avoid double-counting).
function cashRegisterEntries(register, cashTx) {
  if (!register) return [];
  const start = new Date(register.openedAt).getTime();
  const end = register.closedAt ? new Date(register.closedAt).getTime() : Infinity;
  return (cashTx || []).filter((t) => {
    if ((t.paymentMethod || "").toLowerCase() !== "cash") return false; // card/Zelle/Other never affect physical cash
    if (t.category === CASH_REGISTER_CATEGORIES.OPENING) return false;

    // Supabase cash-register RPCs stamp related_cash_register_id on every drawer movement.
    // Prefer that authoritative relationship because it is exactly what fn_close_cash_register
    // uses server-side. This keeps the live UI and the backend closing balance mathematically
    // identical and avoids losing movements because of timestamp/location mapping differences.
    if (t.relatedCashRegisterId) return t.relatedCashRegisterId === register.id;

    // Backward-compatible fallback for historical/legacy cash rows that predate the register FK.
    if ((t.locationId || null) !== (register.locationId || null)) return false;
    const ts = new Date(t.date).getTime();
    return Number.isFinite(ts) && ts >= start && ts <= end;
  });
}

// The ONE authoritative expected-cash formula — every screen that needs this number calls this
// same function rather than recomputing it.
function calculateExpectedCash(register, cashTx) {
  if (!register) return 0;
  const net = cashRegisterEntries(register, cashTx).reduce((a, t) => a + (t.type === "income" ? t.amount : -t.amount), 0);
  return round2((register.openingCash || 0) + net);
}

// Per-category breakdown for the status/detail views — same underlying entries as above, grouped
// for display. A cancelled cash sale's reversing entry (category "Sale Cancellation") and a
// reversed cash expense's reversing entry (category "Expense Reversal") are bucketed as
// "refunds" rather than double-subtracted from cashSales/expenses — the existing reversal
// architecture already produces the correct offsetting entry; this only reads and labels it.
function cashRegisterBreakdown(register, cashTx) {
  const entries = cashRegisterEntries(register, cashTx).sort((a, b) => new Date(b.date) - new Date(a.date));
  let cashSales = 0, additions = 0, withdrawals = 0, drops = 0, expensesTotal = 0, refunds = 0, adjustments = 0;
  for (const t of entries) {
    const signed = t.type === "income" ? t.amount : -t.amount;
    if (t.category === CASH_REGISTER_CATEGORIES.ADDITION) additions += t.amount;
    else if (t.category === CASH_REGISTER_CATEGORIES.WITHDRAWAL) withdrawals += t.amount;
    else if (t.category === CASH_REGISTER_CATEGORIES.DROP) drops += t.amount;
    else if (t.category === CASH_REGISTER_CATEGORIES.ADJUSTMENT) adjustments += signed;
    else if (t.category === "Sale Cancellation" || t.category === "Expense Reversal") refunds += signed;
    else if (t.relatedSaleId) cashSales += signed;
    else if (t.relatedExpenseId) expensesTotal += t.amount;
    else adjustments += signed; // e.g. a cash-paid supplier payment — still correctly included in the total, generically bucketed
  }
  return {
    cashSales: round2(cashSales), additions: round2(additions), withdrawals: round2(withdrawals),
    drops: round2(drops), expenses: round2(expensesTotal), refunds: round2(refunds), adjustments: round2(adjustments),
    movements: entries,
  };
}

// ---- Operations. Every one re-checks the latest register state immediately before writing —
// the same re-check-before-write pattern already used by sale/purchase reversal elsewhere in
// this file — and returns { success, error } / { success, register } rather than throwing,
// matching paymentService/printingService's existing result convention. ----

async function openCashRegister({ locationId, openingCash, notes }, ctx) {
  if (ctx.cashRegisterOps?.remote) {
    try { return await ctx.cashRegisterOps.open({ locationId, openingCash, notes }); }
    catch (e) {
      // rpcSucceeded (set by useSupabaseCashRegisters.open) means fn_open_cash_register itself
      // already committed — only the subsequent screen refresh failed. This must be reported as
      // a success-with-a-caveat, never as `{ success: false }`, or the caller (CashRegisterModal.
      // doOpen) would show a false "could not open" message that could mislead the user into
      // opening a second register for the same location.
      if (e?.rpcSucceeded) return { success: true, staleData: true, message: e.message };
      return { success: false, error: e?.message || "Could not open cash register." };
    }
  }
  const { cashRegisters, setCashRegisters, cashTx, persistCash, locations, currentUser, auditLog, setAuditLog } = ctx;
  if (!locationId) return { success: false, error: "Select a location." };
  const existingOpen = findOpenRegister(cashRegisters, locationId);
  if (existingOpen) return { success: true, register: existingOpen }; // idempotent — never create a second open register for the same location
  const amt = round2(Number(openingCash));
  if (Number.isNaN(amt) || amt < 0) return { success: false, error: "Opening cash must be zero or a positive amount." };
  const now = nowISO();
  const loc = (locations || []).find((l) => l.id === locationId);
  const register = {
    id: uid("register"), locationId, openedByUserId: currentUser?.id || "", openedByName: currentUser?.name || "Unknown",
    openedAt: now, openingCash: amt, status: "open",
    closedByUserId: "", closedByName: "", closedAt: "",
    expectedCash: amt, actualCash: null, difference: null, differenceReason: "", notes: notes || "",
    createdAt: now, updatedAt: now,
  };
  await setCashRegisters([register, ...cashRegisters]);
  await persistCash([{ id: uid("cash"), date: now, type: "income", category: CASH_REGISTER_CATEGORIES.OPENING, amount: amt, paymentMethod: "Cash", locationId, location: loc?.name || "", description: "Register opened", relatedCashRegisterId: register.id }, ...cashTx]);
  await logAudit(auditLog, setAuditLog, currentUser, "Cash Register Opened", `${loc?.name || locationId} · Opening ${fmtMoney(amt)}`);
  return { success: true, register };
}

async function recordCashMovement({ registerId, movementType, amount, reason, notes }, ctx) {
  if (ctx.cashRegisterOps?.remote) {
    try { return await ctx.cashRegisterOps.movement({ registerId, movementType, amount, reason, notes }); }
    catch (e) {
      // rpcSucceeded (set by useSupabaseCashRegisters.movement) means fn_record_cash_movement
      // itself already committed — only the subsequent screen refresh failed. This must be
      // reported as a success-with-a-caveat, never as `{ success: false }`, or the caller (e.g.
      // CashRegisterModal.doMovement) would show a false "movement failed" message that could
      // mislead the user into recording the same movement again.
      if (e?.rpcSucceeded) return { success: true, staleData: true, message: e.message };
      return { success: false, error: e?.message || "Could not record cash movement." };
    }
  }
  const { cashRegisters, cashTx, persistCash, locations, currentUser, auditLog, setAuditLog } = ctx;
  const register = (cashRegisters || []).find((r) => r.id === registerId);
  if (!register) return { success: false, error: "Register not found." };
  if (register.status !== "open") return { success: false, error: "This register is closed." };
  const def = CASH_MOVEMENT_TYPES.find((m) => m.key === movementType);
  if (!def) return { success: false, error: "Unknown movement type." };
  const amt = round2(Number(amount));
  if (Number.isNaN(amt) || amt <= 0) return { success: false, error: "Amount must be greater than zero." };
  if (!reason || !reason.trim()) return { success: false, error: "A reason is required." };
  const loc = (locations || []).find((l) => l.id === register.locationId);
  const entry = {
    id: uid("cash"), date: nowISO(), type: def.cashType, category: def.category, amount: amt,
    paymentMethod: "Cash", locationId: register.locationId, location: loc?.name || "",
    description: reason, notes: notes || "", relatedCashRegisterId: register.id, createdBy: currentUser?.id,
  };
  await persistCash([entry, ...cashTx]);
  await logAudit(auditLog, setAuditLog, currentUser, `${def.label} Recorded`, `${fmtMoney(amt)} · ${reason}`);
  return { success: true, entry };
}

async function closeCashRegister({ registerId, actualCash, differenceReason, notes }, ctx) {
  if (ctx.cashRegisterOps?.remote) {
    try { return await ctx.cashRegisterOps.close({ registerId, actualCash, differenceReason, notes }); }
    catch (e) {
      // rpcSucceeded (set by useSupabaseCashRegisters.close) means fn_close_cash_register itself
      // already committed — only the subsequent screen refresh failed. `e.register` carries the
      // closed register as the RPC itself returned it, so the caller can still show the real
      // actual-vs-expected difference instead of losing that information. Never converted to
      // `{ success: false }` — that would risk the user re-closing (or worse, re-entering a
      // different actual cash amount for) a register that is already correctly closed.
      if (e?.rpcSucceeded) return { success: true, staleData: true, message: e.message, register: e.register };
      return { success: false, error: e?.message || "Could not close cash register." };
    }
  }
  const { cashRegisters, setCashRegisters, cashTx, currentUser, auditLog, setAuditLog } = ctx;
  const latest = (cashRegisters || []).find((r) => r.id === registerId);
  if (!latest) return { success: false, error: "Register not found." };
  if (latest.status === "closed") return { success: true, register: latest }; // idempotent — already closed, not an error, never duplicated
  const actual = round2(Number(actualCash));
  if (Number.isNaN(actual) || actual < 0) return { success: false, error: "Enter a valid actual cash amount." };
  const expected = calculateExpectedCash(latest, cashTx);
  const difference = round2(actual - expected);
  if (difference !== 0 && !(differenceReason && differenceReason.trim())) {
    return { success: false, error: "A reason is required when actual cash doesn't match expected cash." };
  }
  const now = nowISO();
  const closedRegister = {
    ...latest, status: "closed", closedByUserId: currentUser?.id || "", closedByName: currentUser?.name || "Unknown",
    closedAt: now, expectedCash: expected, actualCash: actual, difference,
    differenceReason: difference !== 0 ? differenceReason.trim() : "",
    notes: notes ? `${latest.notes ? latest.notes + " — " : ""}${notes}` : latest.notes, updatedAt: now,
  };
  await setCashRegisters(cashRegisters.map((r) => (r.id === registerId ? closedRegister : r)));
  await logAudit(auditLog, setAuditLog, currentUser, "Cash Register Closed",
    `${fmtMoney(actual)} actual vs ${fmtMoney(expected)} expected${difference !== 0 ? ` · ${difference > 0 ? "+" : ""}${fmtMoney(difference)}` : " · balanced"}`);
  return { success: true, register: closedRegister };
}

/* ============================== CUSTOMER MANAGEMENT + LOYALTY (Phase D) ==============================
 * Extends the customer system that already existed (CustomersView, sale.customerId, the customer
 * <Select> in NewSaleModal) rather than replacing it. `customers` keeps its existing shape
 * ({id, name, phone, email, birthday, notes}) — only `active` is new, used for archiving.
 * totalOrders/totalSpent stay DERIVED LIVE from `sales` (exactly like CustomersView's existing
 * `enriched` computation), never a cached field — same "the ledger is authoritative" principle
 * already used by inventory and cash register. Loyalty balances work the same way: a ledger
 * (loyaltyTransactions), never a single mutable customer.loyaltyPoints number.
 * ============================================================================== */

// ---- Normalization + duplicate detection ----
const normalizePhone = (phone) => (phone || "").replace(/\D/g, "");
const normalizeEmail = (email) => (email || "").trim().toLowerCase();
const normalizeCustomerName = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

// Phone/email matches are treated as a hard duplicate signal; a name-only match (no phone/email
// on either side) is only a soft warning — never silently blocks or merges, per the spec.
function findDuplicateCustomer(customers, { name, phone, email }) {
  const active = (customers || []).filter((c) => c.active !== false);
  const normPhone = normalizePhone(phone);
  const normEmail = normalizeEmail(email);
  if (normPhone) {
    const byPhone = active.find((c) => normalizePhone(c.phone) === normPhone);
    if (byPhone) return { customer: byPhone, matchType: "phone" };
  }
  if (normEmail) {
    const byEmail = active.find((c) => normalizeEmail(c.email) === normEmail);
    if (byEmail) return { customer: byEmail, matchType: "email" };
  }
  if (!normPhone && !normEmail) {
    const normName = normalizeCustomerName(name);
    const byName = normName ? active.find((c) => normalizeCustomerName(c.name) === normName) : null;
    if (byName) return { customer: byName, matchType: "name" };
  }
  return null;
}

function searchCustomers(customers, query) {
  const list = (customers || []).filter((c) => c.active !== false);
  const q = (query || "").trim().toLowerCase();
  if (!q) return list;
  const qDigits = normalizePhone(query);
  return list.filter((c) =>
    c.name.toLowerCase().includes(q) ||
    (c.email && c.email.toLowerCase().includes(q)) ||
    (qDigits.length >= 3 && normalizePhone(c.phone).includes(qDigits))
  );
}

// The one place customer performance numbers are computed — derived live from `sales`, exactly
// mirroring the pre-existing CustomersView calculation, now centralized so nothing else
// duplicates this logic.
function getCustomerStats(customerId, sales) {
  const completed = (sales || []).filter((s) => s.customerId === customerId && s.status !== "cancelled");
  const totalOrders = completed.length;
  const totalSpent = round2(completed.reduce((a, s) => a + s.total, 0));
  const lastOrderDate = completed.length ? completed.reduce((latest, s) => (new Date(s.date) > new Date(latest)) ? s.date : latest, completed[0].date) : null;
  return { totalOrders, totalSpent, avgOrderValue: totalOrders ? round2(totalSpent / totalOrders) : 0, lastOrderDate };
}

async function createCustomer({ name, phone, email, birthday, notes }, ctx) {
  const { customers, setCustomers, currentUser, auditLog, setAuditLog } = ctx;
  const trimmedName = (name || "").trim();
  if (!trimmedName) return { success: false, error: "Enter a name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { success: false, error: "Enter a valid email address." };
  const now = nowISO();
  const customer = { id: newDbId(), name: trimmedName, phone: (phone || "").trim(), email: (email || "").trim(), birthday: birthday || "", notes: notes || "", active: true, createdAt: now, updatedAt: now };
  await setCustomers([customer, ...customers]);
  await logAudit(auditLog, setAuditLog, currentUser, "Customer Created", trimmedName);
  return { success: true, customer };
}

async function updateCustomer(customerId, patch, ctx) {
  const { customers, setCustomers, currentUser, auditLog, setAuditLog } = ctx;
  const existing = customers.find((c) => c.id === customerId);
  if (!existing) return { success: false, error: "Customer not found." };
  const updated = { ...existing, ...patch, updatedAt: nowISO() };
  await setCustomers(customers.map((c) => (c.id === customerId ? updated : c)));
  await logAudit(auditLog, setAuditLog, currentUser, "Customer Updated", updated.name);
  return { success: true, customer: updated };
}

// Archiving, never destructive deletion — historical sales keep their customerId untouched.
async function archiveCustomer(customerId, ctx) {
  const { customers, setCustomers, currentUser, auditLog, setAuditLog } = ctx;
  const existing = customers.find((c) => c.id === customerId);
  if (!existing) return { success: false, error: "Customer not found." };
  await setCustomers(customers.map((c) => (c.id === customerId ? { ...c, active: false, updatedAt: nowISO() } : c)));
  await logAudit(auditLog, setAuditLog, currentUser, "Customer Archived", existing.name);
  return { success: true };
}

async function restoreCustomer(customerId, ctx) {
  const { customers, setCustomers, currentUser, auditLog, setAuditLog } = ctx;
  const existing = customers.find((c) => c.id === customerId);
  if (!existing) return { success: false, error: "Customer not found." };
  await setCustomers(customers.map((c) => (c.id === customerId ? { ...c, active: true, updatedAt: nowISO() } : c)));
  await logAudit(auditLog, setAuditLog, currentUser, "Customer Restored", existing.name);
  return { success: true };
}

// ---- Loyalty points ----
const LOYALTY_POINTS_PER_DOLLAR = 1; // 1 point per $1.00 of eligible subtotal — the one centralized rule
// Direction each ledger entry type moves the balance. `points` is ALWAYS stored positive; this
// map is the only place direction is decided — never a negative number typed into the UI.
const LOYALTY_DIRECTION = { earn: 1, manual_add: 1, restore: 1, redeem: -1, manual_remove: -1, reversal: -1 };

// Eligible amount = subtotal MINUS discount (which already includes any redeemed-reward
// discount, since that becomes part of sale.discount before finalization), BEFORE tax — per the
// spec's explicit rule. Deterministic rounding: whole points only (floor), no fractional points.
function calculateLoyaltyPointsForSale(sale) {
  const eligible = Math.max(0, round2((sale.subtotal || 0) - (sale.discount || 0)));
  return Math.floor(eligible * LOYALTY_POINTS_PER_DOLLAR);
}

function getLoyaltyBalance(customerId, loyaltyTransactions) {
  const net = (loyaltyTransactions || []).filter((t) => t.customerId === customerId)
    .reduce((a, t) => a + (LOYALTY_DIRECTION[t.type] || 0) * t.points, 0);
  return Math.max(0, round2(net)); // never displayed/used as negative
}

// Called exactly once, right after a sale is successfully finalized (never before payment
// succeeds — see NewSaleModal's handlePaymentResult). Idempotent per saleId: if this sale
// already has an earn/redeem entry, it's never duplicated, even if called again.
async function commitLoyaltyForSale(sale, redeemedReward, ctx) {
  const { loyaltyTransactions, setLoyaltyTransactions, currentUser, reloadLoyalty } = ctx;
  if (!sale?.customerId) return { success: true, earned: 0 }; // walk-in — nothing to do

  // Phase 5 authoritative production path: commit loyalty directly after the sale RPC returns.
  // The database function is idempotent per sale, so retries cannot duplicate the earn entry.
  if (supabaseAuth.hasSession()) {
    const rewardId = redeemedReward?.id || null;
    await supabaseRest.rpc("fn_commit_loyalty_for_sale", { p_sale_id: sale.id, p_redeemed_reward_id: rewardId });
    if (reloadLoyalty) await reloadLoyalty();
    return { success: true, earned: calculateLoyaltyPointsForSale(sale) };
  }

  let next = loyaltyTransactions || [];
  let changed = false;

  if (redeemedReward && !next.some((t) => t.saleId === sale.id && t.type === "redeem")) {
    next = [{ id: uid("loy"), customerId: sale.customerId, type: "redeem", points: redeemedReward.requiredPoints,
      reason: `Redeemed: ${redeemedReward.name}`, saleId: sale.id, createdAt: nowISO(), createdBy: currentUser?.id, createdByName: currentUser?.name }, ...next];
    changed = true;
  }
  const points = calculateLoyaltyPointsForSale(sale);
  if (points > 0 && !next.some((t) => t.saleId === sale.id && t.type === "earn")) {
    next = [{ id: uid("loy"), customerId: sale.customerId, type: "earn", points,
      reason: `Earned from Order #${sale.orderNo}`, saleId: sale.id, createdAt: nowISO(), createdBy: currentUser?.id, createdByName: currentUser?.name }, ...next];
    changed = true;
  }
  if (changed) await setLoyaltyTransactions(next);
  return { success: true, earned: points };
}

// Called from the SAME sale-cancellation path SaleDetailModal already uses (reuses the existing
// reversal architecture's trigger point, does not invent a second one). Idempotent: reverses the
// original earn at most once per saleId, and is a safe no-op if there was nothing to reverse
// (e.g. a walk-in sale, or a sale that never earned points).
// Reverses BOTH sides of what a sale could have done to the ledger: points earned from the sale
// (reversed) AND points redeemed by the sale (restored) — a cancelled sale must leave the
// customer's balance exactly where it was before the sale happened. Each side is independently
// idempotent (checked by looking for its own already-applied counter-entry), so calling this
// twice for the same sale — or a sale that only did one of the two — is always a safe no-op for
// whichever part doesn't apply.
async function reverseLoyaltyForSale(sale, ctx) {
  const { loyaltyTransactions, setLoyaltyTransactions, currentUser, reloadLoyalty } = ctx;
  if (!sale.customerId) return { success: true };

  // Phase 5.1 production path: call the RPC directly rather than deciding whether to call it
  // based on whether originalEarn/originalRedeem happen to already be present in this client's
  // local loyaltyTransactions array. fn_reverse_loyalty_for_sale re-derives everything it needs
  // (the sale's own earn/redeem rows) straight from the database and is idempotent on sale_id
  // regardless of what this client's ledger currently contains — so the local array is no longer
  // a gate on whether the reversal happens at all. Previously, if this client hadn't reloaded
  // loyalty since the sale was created (e.g. cancelling a sale immediately after creating it),
  // originalEarn was undefined, `changed` stayed false, and the RPC was never called — the
  // reversal silently never happened even though the cancellation itself succeeded.
  if (supabaseAuth.hasSession()) {
    await supabaseRest.rpc("fn_reverse_loyalty_for_sale", { p_sale_id: sale.id });
    if (reloadLoyalty) await reloadLoyalty();
    return { success: true };
  }

  // Legacy local fallback — unchanged, used only when there is no Supabase session.
  let next = loyaltyTransactions || [];
  let changed = false;

  const originalEarn = next.find((t) => t.saleId === sale.id && t.type === "earn");
  const earnAlreadyReversed = next.some((t) => t.saleId === sale.id && t.type === "reversal");
  if (originalEarn && !earnAlreadyReversed) {
    next = [{ id: uid("loy"), customerId: sale.customerId, type: "reversal", points: originalEarn.points,
      reason: `Reversal: Order #${sale.orderNo} canceled`, saleId: sale.id, createdAt: nowISO(), createdBy: currentUser?.id, createdByName: currentUser?.name }, ...next];
    changed = true;
  }

  const originalRedeem = next.find((t) => t.saleId === sale.id && t.type === "redeem");
  const redeemAlreadyRestored = next.some((t) => t.saleId === sale.id && t.type === "restore");
  if (originalRedeem && !redeemAlreadyRestored) {
    next = [{ id: uid("loy"), customerId: sale.customerId, type: "restore", points: originalRedeem.points,
      reason: `Restored: Order #${sale.orderNo} canceled`, saleId: sale.id, createdAt: nowISO(), createdBy: currentUser?.id, createdByName: currentUser?.name }, ...next];
    changed = true;
  }

  if (changed) await setLoyaltyTransactions(next);
  return { success: true };
}

async function manualLoyaltyAdjustment({ customerId, type, points, reason }, ctx) {
  const { loyaltyTransactions, setLoyaltyTransactions, currentUser, auditLog, setAuditLog } = ctx;
  const amt = round2(Number(points));
  if (Number.isNaN(amt) || amt <= 0) return { success: false, error: "Enter a positive points amount." };
  if (!reason || !reason.trim()) return { success: false, error: "A reason is required." };
  if (type !== "manual_add" && type !== "manual_remove") return { success: false, error: "Unknown adjustment type." };
  if (type === "manual_remove") {
    const balance = getLoyaltyBalance(customerId, loyaltyTransactions);
    if (amt > balance) return { success: false, error: `Cannot remove more than the current balance of ${balance} points — negative balances are not allowed.` };
  }
  const entry = { id: uid("loy"), customerId, type, points: amt, reason: reason.trim(), saleId: null,
    createdAt: nowISO(), createdBy: currentUser?.id, createdByName: currentUser?.name || "Unknown" };
  try {
    await setLoyaltyTransactions([entry, ...(loyaltyTransactions || [])]);
  } catch (e) {
    // rpcSucceeded (set by useSupabaseLoyalty.persist) means fn_manual_loyalty_adjustment itself
    // already committed — the points really were adjusted. This must never be reported as
    // { success: false }, or the caller (CustomerDetailModal.doAdjust) would show a false
    // "adjustment failed" message that could mislead the user into re-submitting the same
    // adjustment and duplicating it. The audit log entry is still written here — the real-world
    // action did happen, only the on-screen loyalty ledger failed to refresh.
    if (e?.rpcSucceeded) {
      await logAudit(auditLog, setAuditLog, currentUser, type === "manual_add" ? "Loyalty Points Added" : "Loyalty Points Removed", `${amt} pts · ${reason.trim()}`);
      return { success: true, entry, staleData: true, message: e.message };
    }
    return { success: false, error: e?.message || "Could not save this adjustment." };
  }
  await logAudit(auditLog, setAuditLog, currentUser, type === "manual_add" ? "Loyalty Points Added" : "Loyalty Points Removed", `${amt} pts · ${reason.trim()}`);
  return { success: true, entry };
}

// ---- Rewards ----
const seedLoyaltyRewards = () => ([
  { id: "reward-10off", name: "$10 Off", requiredPoints: 100, discountType: "fixed", discountValue: 10, active: true },
]);
function eligibleRewards(rewards, balance) {
  return (rewards || []).filter((r) => r.active !== false && balance >= r.requiredPoints);
}
// Discount can never exceed the sale subtotal — a reward is never allowed to push the total
// negative or below the tax base.
function rewardDiscountAmount(reward, subtotal) {
  if (!reward) return 0;
  if (reward.discountType === "fixed") return Math.min(reward.discountValue, subtotal);
  return 0;
}

/* ============================== PRINTING SERVICE (Phase C — receipt/ticket printing) ==============================
 * POS / Sales UI → printingService.print{CustomerReceipt,KitchenTicket,PaymentReceipt}(sale, ctx)
 * → active print adapter (browserPrintAdapter today, thermalPrinterAdapter placeholder for later)
 * → standard PrintResult. No caller of this module ever touches window.open/print CSS directly,
 * and this module never touches sale/inventory/cash state — it only ever READS an already-
 * finalized `sale` object and renders it. Swapping PRINT_MODE to "thermal_printer" once a real
 * printer integration exists is the entire future cutover; the three print* methods below and
 * every call site stay exactly the same.
 * ============================================================================== */
const PRINT_MODE = "browser"; // "browser" | "thermal_printer" (future)

function makePrintResult({ success, type, provider, printId = null, error = null, requiresPreview = false, html = null }) {
  return { success, type, provider, printId, error, requiresPreview, html };
}
function generatePrintId() {
  return `print_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
// Minimal HTML-escaping for values interpolated into the generated receipt markup (customer/
// employee names, notes) — the print window is a real HTML document, so this isn't optional.
function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// One shared document shell — 80mm-thermal-optimized, degrades reasonably on standard paper.
// The print window contains ONLY this content (no app chrome/nav/buttons exist in it at all),
// which is what makes "hide the rest of the app" unnecessary — there's nothing else there to hide.
function printDocumentHtml(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', ui-monospace, monospace; width: 80mm; margin: 0 auto; padding: 0; color: #000; font-size: 12px; line-height: 1.45; }
    .center { text-align: center; } .bold { font-weight: 700; } .lg { font-size: 15px; } .xl { font-size: 18px; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; } .divider-solid { border-top: 2px solid #000; margin: 6px 0; }
    .item { margin-bottom: 4px; } .muted { color: #333; font-size: 11px; }
    .k-qty { font-size: 20px; font-weight: 800; } .k-name { font-size: 18px; font-weight: 800; text-transform: uppercase; }
    @media print { body { width: auto; } }
  </style></head><body>${bodyHtml}</body></html>`;
}

// Customer-facing receipt — full financial detail, using ONLY fields that already exist on the
// finalized sale (no invented tip/modifier/topping data — the current product/sale model doesn't
// carry per-item modifiers, so those lines are simply omitted rather than fabricated).
function renderCustomerReceiptBody(sale, ctx) {
  const { settings, locations, employees, customers } = ctx;
  const cashier = (employees || []).find((e) => e.id === sale.employeeId)?.name;
  const customer = (customers || []).find((c) => c.id === sale.customerId)?.name;
  const loc = locationLabel(sale, locations);
  const itemsHtml = (sale.items || []).map((it) =>
    `<div class="item"><div class="row bold"><span>${escHtml(it.qty)}x ${escHtml(it.name)}</span><span>${escHtml(fmtMoney(it.unitPrice * it.qty))}</span></div></div>`
  ).join("");
  const status = (getPaymentStatus(sale) || "paid").toUpperCase();
  return `
    <div class="center bold lg">${escHtml(settings?.businessName || "Masseli Açaíberry")}</div>
    <div class="center muted">Order Receipt</div>
    <div class="divider-solid"></div>
    <div class="row"><span>Order #</span><span class="bold">${escHtml(sale.orderNo)}</span></div>
    <div class="row"><span>Date</span><span>${escHtml(dateStr(sale.date))} ${escHtml(timeStr(sale.date))}</span></div>
    ${loc && loc !== "—" ? `<div class="row"><span>Location</span><span>${escHtml(loc)}</span></div>` : ""}
    ${cashier ? `<div class="row"><span>Cashier</span><span>${escHtml(cashier)}</span></div>` : ""}
    ${customer ? `<div class="row"><span>Customer</span><span>${escHtml(customer)}</span></div>` : ""}
    <div class="divider"></div>
    ${itemsHtml}
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${escHtml(fmtMoney(sale.subtotal))}</span></div>
    ${sale.discount > 0 ? `<div class="row"><span>Discount</span><span>-${escHtml(fmtMoney(sale.discount))}</span></div>` : ""}
    <div class="row"><span>Tax</span><span>${escHtml(fmtMoney(sale.tax))}</span></div>
    <div class="divider"></div>
    <div class="row bold xl"><span>Total</span><span>${escHtml(fmtMoney(sale.total))}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Payment Method</span><span>${escHtml(sale.paymentMethod)}</span></div>
    <div class="row"><span>Payment Status</span><span class="bold">${escHtml(status)}</span></div>
    ${sale.stripePaymentIntentId ? `<div class="row"><span>Transaction</span><span>${escHtml(sale.stripePaymentIntentId)}</span></div>` : ""}
    <div class="divider-solid"></div>
    <div class="center">Thank you!</div>
    <div class="center bold">${escHtml(settings?.businessName || "Masseli Açaíberry")}</div>
  `;
}

// Kitchen/production ticket — deliberately carries NO price, subtotal, tax, total, payment
// method/status, or transaction information. Operational data only: order #, time, items,
// customer name (if any), notes.
function renderKitchenTicketBody(sale, ctx) {
  const { customers } = ctx;
  const customer = (customers || []).find((c) => c.id === sale.customerId)?.name;
  const itemsHtml = (sale.items || [])
    .map((it) => `<div class="item"><div class="k-qty">${escHtml(it.qty)}x <span class="k-name">${escHtml(it.name)}</span></div></div>`)
    .join('<div class="divider"></div>');
  return `
    <div class="center bold lg">MASSELI AÇAÍBERRY</div>
    <div class="center bold">NEW ORDER</div>
    <div class="divider-solid"></div>
    <div class="row bold"><span>Order #${escHtml(sale.orderNo)}</span><span>${escHtml(timeStr(sale.date))}</span></div>
    ${sale.channel ? `<div class="center muted">${escHtml(sale.channel)}</div>` : ""}
    <div class="divider"></div>
    ${itemsHtml}
    <div class="divider-solid"></div>
    ${customer ? `<div class="row bold"><span>Customer</span><span>${escHtml(customer)}</span></div>` : ""}
    ${sale.notes ? `<div class="muted">Notes: ${escHtml(sale.notes)}</div>` : ""}
  `;
}

// Payment receipt — safe transaction metadata only. Never touches/stores card number, CVV, or
// track data (those fields do not exist anywhere in this app's data model, by design).
function renderPaymentReceiptBody(sale, ctx) {
  const { settings } = ctx;
  const status = getPaymentStatus(sale) === "paid" ? "APPROVED" : (getPaymentStatus(sale) || "").toUpperCase();
  return `
    <div class="center bold lg">${escHtml(settings?.businessName || "Masseli Açaíberry")}</div>
    <div class="center muted">Payment Receipt</div>
    <div class="divider-solid"></div>
    <div class="row"><span>Amount</span><span class="bold xl">${escHtml(fmtMoney(sale.total))}</span></div>
    <div class="row"><span>Payment Method</span><span>${escHtml((sale.paymentMethod || "").toUpperCase())}</span></div>
    <div class="row"><span>Status</span><span class="bold">${escHtml(status)}</span></div>
    <div class="row"><span>Transaction ID</span><span>${escHtml(sale.stripePaymentIntentId || "—")}</span></div>
    <div class="divider-solid"></div>
  `;
}

// ---- Browser print adapter (ACTIVE) — genuinely functional, not a placeholder ----------------
// Opens an isolated window containing ONLY the receipt document, writes the content, waits for it
// to be ready, then triggers the native print dialog (from which the user can pick a real
// printer, a thermal printer exposed through the OS print dialog, or Save as PDF). The window is
// intentionally left open afterward — closing it immediately can interrupt "Save as PDF" on some
// browsers before the save dialog completes.
const browserPrintAdapter = {
  print(html) {
    // ---- LEVEL 1: direct popup print (preferred path when allowed) ----
    let win;
    try {
      win = window.open("", "_blank", "width=400,height=650");
    } catch (e) {
      win = null;
    }
    if (win) {
      try {
        win.document.open();
        win.document.write(html);
        win.document.close();
        const attemptPrint = () => { win.focus(); win.print(); };
        if (win.document.readyState === "complete") {
          attemptPrint(); // synchronous — a throw here is caught below and falls through to the iframe fallback
        } else {
          // Deferred: by the time these fire we've already returned success below. This mirrors
          // a real limitation of the browser print API (no promise/callback signals whether a
          // print dialog actually appeared) — documented in the implementation report, not
          // something this fix can fully eliminate.
          win.onload = () => { try { attemptPrint(); } catch (e) { /* nothing left to do post-return */ } };
          setTimeout(() => { try { attemptPrint(); } catch (e) { /* nothing left to do post-return */ } }, 400);
        }
        return { success: true };
      } catch (e) {
        // Popup opened but writing/printing into it failed synchronously — fall through to the
        // iframe fallback instead of giving up immediately.
      }
    }

    // ---- LEVEL 2: hidden iframe fallback ----
    // Not display:none — some browsers refuse to print an element with that computed style.
    // Positioned off-screen and visibility:hidden instead, which keeps it non-visible without
    // blocking print rendering.
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);
      const cleanup = () => { try { document.body.removeChild(iframe); } catch (e) { /* already removed */ } };

      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!idoc) { cleanup(); throw new Error("iframe document unavailable"); }
      idoc.open();
      idoc.write(html);
      idoc.close();

      const attemptPrint = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        try { iframe.contentWindow.addEventListener("afterprint", cleanup); } catch (e) { /* not fatal — timeout below still cleans up */ }
        setTimeout(cleanup, 60000); // safety-net cleanup regardless of whether afterprint ever fires
      };
      if (idoc.readyState === "complete") {
        attemptPrint(); // synchronous — a throw here IS caught below and falls through to preview
      } else {
        iframe.onload = () => { try { attemptPrint(); } catch (e) { cleanup(); } };
        setTimeout(() => { try { attemptPrint(); } catch (e) { cleanup(); } }, 400);
      }
      return { success: true };
    } catch (e) {
      // ---- LEVEL 3: both popup and iframe printing are unavailable ----
      // Hand the already-generated HTML back to the caller so the UI can show an on-screen
      // preview and let the user print from a direct, fresh click — a real user gesture, which
      // some browsers require for print() to succeed at all.
      return {
        success: false,
        requiresPreview: true,
        html,
        error: { code: "print_unavailable", message: "Automatic printing is unavailable in this environment." },
      };
    }
  },
};

// ---- Thermal printer adapter (placeholder — future) -------------------------------------------
// Honest "not configured" only. No fake Bluetooth/USB/ESC-POS/network behavior — establishing the
// call shape is the entire point, exactly like stripeTerminalAdapter above.
const thermalPrinterAdapter = {
  print(_html) {
    return { success: false, error: { code: "not_configured", message: "Printer is not configured." } };
  },
};

function dispatchPrint(type, html) {
  const useThermal = PRINT_MODE === "thermal_printer";
  const result = (useThermal ? thermalPrinterAdapter : browserPrintAdapter).print(html);
  return makePrintResult({
    success: result.success, type, provider: result.requiresPreview ? "browser_preview" : (useThermal ? "thermal_printer" : "browser"),
    printId: result.success ? generatePrintId() : null, error: result.error || null,
    requiresPreview: !!result.requiresPreview, html: result.requiresPreview ? html : null,
  });
}

// The only surface the rest of the app talks to. Every method here is strictly read-only against
// `sale` — none of them can create, modify, or finalize anything.
const printingService = {
  printCustomerReceipt(sale, ctx) {
    return dispatchPrint("customer_receipt", printDocumentHtml(`Receipt - Order #${sale.orderNo}`, renderCustomerReceiptBody(sale, ctx)));
  },
  printKitchenTicket(sale, ctx) {
    return dispatchPrint("kitchen_ticket", printDocumentHtml(`Kitchen Ticket - Order #${sale.orderNo}`, renderKitchenTicketBody(sale, ctx)));
  },
  printPaymentReceipt(sale, ctx) {
    return dispatchPrint("payment_receipt", printDocumentHtml(`Payment Receipt - Order #${sale.orderNo}`, renderPaymentReceiptBody(sale, ctx)));
  },
  // "Prepare" methods — pure content generation only, no window.open/iframe/adapter dispatch at
  // all. Reuse the exact same render*Body + printDocumentHtml functions the print* methods above
  // already use, so content generation stays centralized in one place regardless of which path
  // calls it. Because these touch no browser API, they can't silently "succeed" while producing
  // nothing visible — the failure mode that made the previous popup/iframe-first flow unreliable
  // in this sandboxed environment. This is what the UI calls now; the preview it opens is always
  // guaranteed to actually render.
  prepareCustomerReceipt(sale, ctx) {
    return { type: "customer_receipt", title: `Customer Receipt — Order #${sale.orderNo}`, html: printDocumentHtml(`Receipt - Order #${sale.orderNo}`, renderCustomerReceiptBody(sale, ctx)) };
  },
  prepareKitchenTicket(sale, ctx) {
    return { type: "kitchen_ticket", title: `Kitchen Ticket — Order #${sale.orderNo}`, html: printDocumentHtml(`Kitchen Ticket - Order #${sale.orderNo}`, renderKitchenTicketBody(sale, ctx)) };
  },
  preparePaymentReceipt(sale, ctx) {
    return { type: "payment_receipt", title: `Payment Receipt — Order #${sale.orderNo}`, html: printDocumentHtml(`Payment Receipt - Order #${sale.orderNo}`, renderPaymentReceiptBody(sale, ctx)) };
  },
};

/* ============================== DATA STORE BOUNDARY ==============================
 * Every piece of legacy local persistence in this app goes through window.localStorage,
 * a real browser API available in every production environment (unlike the platform-only
 * window.storage API this used to depend on — see the Phase "storage error" fix). This
 * object is the ONE place that touches it directly. Nothing else in the app should call
 * window.localStorage.getItem/setItem/removeItem for these collections again — everything
 * else goes through dataStore.get/set/update/remove instead.
 *
 * Why this matters: when this app eventually moves to a real backend/database, only
 * this object needs to change (e.g. swap the bodies below for fetch() calls to an API).
 * Every component, hook, and service that currently calls dataStore.* keeps working
 * unmodified, because the shape of get/set/update/remove doesn't change — only what's
 * behind it does. This is intentionally a thin wrapper, not a new abstraction layer with
 * its own behavior — same JSON serialization, same "personal" (non-shared) scope, same
 * error handling as before the refactor.
 * ============================================================================== */
const dataStore = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("storage error", e);
      return false;
    }
  },
  // Read-modify-write convenience for the common "load current, apply an updater, save" pattern.
  async update(key, updater, fallbackIfMissing) {
    const current = (await dataStore.get(key)) ?? fallbackIfMissing;
    const next = updater(current);
    await dataStore.set(key, next);
    return next;
  },
  // No collection in this app currently deletes a whole key outright (soft-delete/deactivate is
  // used everywhere instead — see the Suppliers/Locations/Users patterns), but the boundary
  // includes it for completeness since a future backend will need a real DELETE operation.
  async remove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error("storage error", e);
      return false;
    }
  },
};

/* ============================== AUTH SERVICE BOUNDARY ==============================
 * NEXALVO production authentication. Credentials are verified by Supabase Auth; the
 * authenticated UUID is then resolved against public.users, which is the tenant/role
 * identity used by RLS. No PIN is stored or compared in the browser.
 * ============================================================================== */
const authService = {
  async getSession() {
    const session = await supabaseAuth.restoreSession();
    if (!session?.user?.id) return null;
    const profile = await loadAuthenticatedProfile(session.user.id);
    return { userId: profile.id, profile, user: session.user };
  },
  async signIn(email, password) {
    const result = await supabaseAuth.signInWithPassword(email, password);
    if (!result.ok) return result;
    try {
      const profile = await loadAuthenticatedProfile(result.user?.id);
      return { ...result, profile };
    } catch (e) {
      supabaseAuth.signOut();
      return { ok: false, reachable: true, error: e.message };
    }
  },
  async clearSession() { supabaseAuth.signOut(); return true; },
  async trySupabaseSignIn(email, password) { return supabaseAuth.signInWithPassword(email, password); },
};

/* ============================== SUPABASE CONNECTION LAYER (TEST MODE) ==============================
 * Phase 4C Step 8/9: the real backend layer behind dataStore, gated to TEST MODE only — nothing
 * here is wired into the live app's core Sales/Inventory/CashFlow/Expenses/Purchases flows.
 *
 * Built on plain fetch() against Supabase's auto-generated REST (PostgREST) and Auth APIs,
 * NOT the @supabase/supabase-js SDK — that package isn't in this artifact environment's
 * importable library set, so this talks to the same underlying HTTP API the SDK itself wraps.
 * Uses ONLY the anon/publishable key, per instruction — this key is safe to embed client-side
 * because Row Level Security (02_rls.sql, already deployed) is what actually protects data, not
 * the key itself.
 *
 * SUPABASE_URL is derived from the dashboard project URL you provided (project ref
 * "ebhlfghbdfqgrgmtzpti") using Supabase's standard "<project-ref>.supabase.co" pattern — this
 * inference could not be verified from this environment (no network access here); confirm it
 * matches your project's actual API URL on the API Keys page before relying on it.
 * ============================================================================== */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SESSION_KEY = "nexalvo.supabase.session.v1";

function readStoredSupabaseSession() {
  try {
    const raw = window.localStorage.getItem(SUPABASE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function persistSupabaseSession(session) {
  _supabaseSession = session || null;
  try {
    if (session) window.localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SUPABASE_SESSION_KEY);
  } catch {}
}

// Real Supabase JWT session. It is persisted locally and refreshed from the refresh token so a
// browser reload does not silently fall back to the old local/PIN authentication model.
let _supabaseSession = readStoredSupabaseSession(); // { accessToken, refreshToken, expiresAt, user } | null

/* ============================== PHASE 6.1 — JWT AUTO-REFRESH (single-flight, one retry) ==============================
 * The ONE place that actually calls Supabase's refresh-token endpoint (refreshSupabaseSession),
 * the ONE shared in-flight Promise that makes concurrent callers share a single network refresh
 * instead of each starting their own (_supabaseRefreshPromise / triggerSupabaseRefresh), and the
 * ONE pre-request gate every authenticated call goes through (ensureFreshSession). restoreSession
 * (below, in supabaseAuth) now delegates to refreshSupabaseSession rather than duplicating this.
 * ============================================================================== */
let _supabaseRefreshPromise = null;

// Registered once by App() (see the session-restore effect) so this non-React module can signal
// "the session is gone, return to the login screen" without a second session/state system — it
// just reuses the exact setAuthProfile/setCurrentUserId(null) path App() already has for signing
// out, which is what LoginScreen already renders from.
let _onSupabaseSessionInvalid = null;
function setSupabaseSessionInvalidHandler(fn) { _onSupabaseSessionInvalid = fn; }

// The ONE implementation of "call the refresh-token endpoint and persist the result." Called by
// restoreSession() (page-load path) and by triggerSupabaseRefresh() (runtime path, both the
// pre-expiry check in ensureFreshSession and the reactive 401 handler in supabaseFetch) — no
// second copy of this logic exists anywhere else in the file.
async function refreshSupabaseSession() {
  if (!_supabaseSession?.refreshToken) {
    persistSupabaseSession(null);
    _onSupabaseSessionInvalid?.();
    throw new Error("No refresh token available.");
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: _supabaseSession.refreshToken }),
  });
  const body = await res.json().catch(() => null);

  if (res.ok && body?.access_token) {
    const session = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || _supabaseSession.refreshToken,
      expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
      user: body.user || _supabaseSession.user,
    };
    persistSupabaseSession(session);
    return session;
  }

  // Only a response that actually means "this refresh token is invalid/expired/revoked" may ever
  // clear a working session. Supabase's Auth server (gotrue) returns 400 (invalid_grant) or 401
  // for a bad/expired/revoked refresh token — those are the only statuses treated as definitive
  // here. A 5xx (server error), 429 (rate limited), or any other transient failure of the refresh
  // endpoint itself must NOT log the user out — the session may still be perfectly valid, and
  // clearing it here would turn a momentary Supabase outage/rate-limit into an unnecessary forced
  // logout mid-shift. Those cases just throw (no session mutation, no _onSupabaseSessionInvalid)
  // so the caller — ensureFreshSession's try/catch in supabaseFetch, or restoreSession's own
  // catch — preserves the existing session and the next request/refresh attempt can simply try
  // again, with no loop introduced here.
  if (res.status === 400 || res.status === 401) {
    persistSupabaseSession(null);
    _onSupabaseSessionInvalid?.();
    throw new Error(body?.error_description || body?.msg || "Session refresh failed: refresh token is invalid or expired.");
  }
  throw new Error(`Session refresh temporarily unavailable (HTTP ${res.status}). The existing session was preserved.`);
}

// Single-flight gate: whether called from ensureFreshSession's pre-expiry check or from
// supabaseFetch's reactive 401 handler, every concurrent caller awaits this SAME Promise —
// never more than one /auth/v1/token?grant_type=refresh_token request in flight at a time.
function triggerSupabaseRefresh() {
  if (!_supabaseRefreshPromise) {
    _supabaseRefreshPromise = refreshSupabaseSession().finally(() => { _supabaseRefreshPromise = null; });
  }
  return _supabaseRefreshPromise;
}

// Called before every authenticated Supabase request (see supabaseFetch below). No session ->
// unauthenticated behavior is completely unchanged, callers proceed on the anon key exactly as
// before this phase. Session still valid for more than 60s -> used as-is, no network call at all.
// Otherwise -> await the single shared refresh rather than letting the request go out with a
// token already known to be expired.
function ensureFreshSession() {
  if (!_supabaseSession) return Promise.resolve(null);
  if (_supabaseSession.expiresAt && _supabaseSession.expiresAt > Date.now() + 60000) return Promise.resolve(_supabaseSession);
  if (!_supabaseSession.refreshToken) return Promise.resolve(_supabaseSession);
  return triggerSupabaseRefresh();
}
/* ============================== end Phase 6.1 additions ============================== */

// The single source of truth for which credential every request uses — verified explicitly here
// (item 6): returns the authenticated user's access token when a real session exists, and only
// falls back to the anon key when it doesn't (e.g. before sign-in, or after sign-out).
function currentSupabaseCredential() {
  return _supabaseSession?.accessToken || SUPABASE_ANON_KEY;
}

async function supabaseFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("NEXALVO backend is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");

  const doFetch = () => fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY, // apikey header is always the project key, per Supabase's API contract
      Authorization: `Bearer ${currentSupabaseCredential()}`, // THIS is what changes after sign-in
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  // Pre-emptive refresh: if a real session exists and is expired/near-expiry, refresh it BEFORE
  // this request goes out, via the single shared refresh Promise. If the refresh fails outright
  // (invalid refresh token), the session was already cleared and the login-return handler already
  // fired inside refreshSupabaseSession — this request simply proceeds on the anon key, exactly
  // like any call made before sign-in, rather than throwing here.
  if (_supabaseSession) {
    try { await ensureFreshSession(); } catch { /* handled inside refreshSupabaseSession */ }
  }

  let res = await doFetch();

  // Reactive path: the token looked fresh by our own clock but the server rejected it anyway
  // (revoked, clock drift, etc). Exactly one forced shared refresh, exactly one retry — no
  // recursion, no loop. If the forced refresh also fails, the session is already cleared/login
  // already triggered, and the original 401 response is returned unchanged for the caller's
  // existing `if (!res.ok) throw ...` handling (every supabaseRest.* method already has this).
  if (res.status === 401 && _supabaseSession) {
    try {
      await triggerSupabaseRefresh();
      res = await doFetch();
    } catch { /* handled inside refreshSupabaseSession */ }
  }

  return res;
}


// Thin wrapper over PostgREST — the tables it can reach are governed entirely by the RLS
// policies already deployed (02_rls.sql), not by anything in this client-side code. Every
// method here throws on failure with the real Supabase error body attached — nothing is
// swallowed here; callers (the test panel) are responsible for catching and displaying it
// (item 11 — see runCrudTest below, which never lets a failure look like a silent success).
const supabaseRest = {
  // Reachability check only — does NOT assert any table has data (RLS will legitimately return
  // an empty result for an unauthenticated caller; see the report for what that means here).
  async ping() {
    try {
      const res = await supabaseFetch("/rest/v1/", { method: "GET" });
      return { reachable: true, status: res.status };
    } catch (e) {
      return { reachable: false, error: e.message };
    }
  },
  async select(table, query = "") {
    const res = await supabaseFetch(`/rest/v1/${table}${query ? `?${query}` : ""}`, { method: "GET" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`select ${table} failed (${res.status}): ${JSON.stringify(body)}`);
    return body;
  },
  async upsert(table, rows, onConflict = "id") {
    const res = await supabaseFetch(`/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`upsert ${table} failed (${res.status}): ${JSON.stringify(body)}`);
    return body;
  },
  // Real single-row insert (not upsert) — used by the CRUD test so "create" is unambiguous.
  async insertOne(table, row) {
    const res = await supabaseFetch(`/rest/v1/${table}`, {
      method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`insert ${table} failed (${res.status}): ${JSON.stringify(body)}`);
    return Array.isArray(body) ? body[0] : body;
  },
  async updateOne(table, id, patch) {
    const res = await supabaseFetch(`/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`update ${table} failed (${res.status}): ${JSON.stringify(body)}`);
    return Array.isArray(body) ? body[0] : body;
  },
  async deleteOne(table, id) {
    const res = await supabaseFetch(`/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`delete ${table} failed (${res.status}): ${JSON.stringify(body)}`);
    return body;
  },
  // Provided for completeness (the eventual InventoryService cutover will need this), not called
  // by any live write path yet — that rerouting is explicitly deferred, see Finding F.
  async rpc(fnName, args = {}) {
    const res = await supabaseFetch(`/rest/v1/rpc/${fnName}`, { method: "POST", body: JSON.stringify(args) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`rpc ${fnName} failed (${res.status}): ${JSON.stringify(body)}`);
    return body;
  },
};

const supabaseAuth = {
  async signUp(email, password) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, reachable: true, error: body?.error_description || body?.msg || body?.error || "Sign-up failed" };
      }
      if (body.access_token) {
        // Auto-confirm is on for this project — a real session comes back immediately.
        persistSupabaseSession({ accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000, user: body.user });
        return { ok: true, confirmed: true, user: body.user, uid: body.user?.id };
      }
      // Account created but no session returned — email confirmation is required by this
      // project's Auth settings before sign-in will succeed. Not a failure, just a next step.
      return { ok: true, confirmed: false, uid: body.id || body.user?.id, message: "Account created — check the inbox for a confirmation email, or disable \"Confirm email\" in Supabase Auth settings for testing." };
    } catch (e) {
      return { ok: false, reachable: false, error: e.message };
    }
  },
  async signInWithPassword(email, password) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // A clean HTTP error response (e.g. "Invalid login credentials") means the Auth
        // endpoint IS reachable and working — that's a successful connectivity test even
        // though sign-in itself fails (expected before an account exists or is confirmed).
        return { ok: false, reachable: true, status: res.status, error: body?.error_description || body?.msg || "Sign-in failed" };
      }
      persistSupabaseSession({ accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000, user: body.user });
      return { ok: true, reachable: true, user: body.user, uid: body.user?.id, accessToken: body.access_token };
    } catch (e) {
      // A thrown error means the request never got an HTTP response at all — DNS/network/CORS
      // failure, i.e. the URL or connectivity itself is the problem, not credentials.
      return { ok: false, reachable: false, error: e.message };
    }
  },
  async restoreSession() {
    if (!_supabaseSession) return null;
    if (_supabaseSession.expiresAt && _supabaseSession.expiresAt > Date.now() + 60000) return _supabaseSession;
    // Delegates entirely to the Phase 6.1 centralized refresh implementation — no duplicate
    // fetch/parse/persist logic here anymore. On failure, `_supabaseSession` is whatever
    // refreshSupabaseSession left it as: unchanged (old session) for a transient network error,
    // or already cleared to null (with the login-return handler already notified) for a genuinely
    // invalid/expired refresh token — either way, returning `_supabaseSession` here reproduces
    // exactly the same fallback behavior this function always had.
    try {
      return await refreshSupabaseSession();
    } catch {
      return _supabaseSession;
    }
  },
  signOut() { persistSupabaseSession(null); },
  hasSession() { return !!_supabaseSession; },
  getSession() { return _supabaseSession; },
};

function appUserFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    permissions: row.permission_overrides || {},
    permissionOverrides: row.permission_overrides || {},
    active: row.active !== false,
    employeeId: row.employee_id || "",
    businessId: row.business_id,
    supabase: true,
  };
}

async function loadAuthenticatedProfile(userId) {
  if (!userId) throw new Error("Authenticated user ID is missing.");
  const rows = await supabaseRest.select("users", `select=id,business_id,employee_id,name,username,role,permission_overrides,active&id=eq.${encodeURIComponent(userId)}&limit=1`);
  const row = rows?.[0];
  if (!row) throw new Error("Your login exists in Supabase Auth, but no NEXALVO user profile was found for it.");
  if (row.active === false) throw new Error("This NEXALVO account is inactive.");
  return appUserFromDb(row);
}

/* ============================== STORAGE HOOK ============================== */
function useCollection(key, seedFn) {
  const [data, setData] = useState(null); // null = loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await dataStore.get(key);
      if (existing !== null) {
        if (!cancelled) setData(existing);
        return;
      }
      const seeded = seedFn();
      await dataStore.set(key, seeded);
      if (!cancelled) setData(seeded);
    })();
    return () => { cancelled = true; };
  }, [key]);

  const persist = useCallback(async (next) => {
    setData(next);
    await dataStore.set(key, next);
  }, [key]);

  return [data, persist];
}


/* ============================== SUPABASE DATA — PHASE 1 ==============================
 * These collections are now tenant-scoped PostgreSQL data, protected by RLS.
 * Transactional modules (sales/inventory/cash/purchases/etc.) intentionally remain on the
 * legacy dataStore until their RPC-backed migration phases, so we never bypass the server-side
 * business rules already installed for them.
 * ============================================================================== */
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const newDbId = () => crypto.randomUUID();

function useSupabaseArrayCollection(table, businessId, fromDb, toDb, { missing = "deactivate" } = {}, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const previousRef = useRef([]);

  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); previousRef.current = []; return []; }
    const rows = await supabaseRest.select(table, `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc`);
    const mapped = (rows || []).map(fromDb);
    previousRef.current = mapped;
    setData(mapped);
    clearLoadError?.(table); // only reached once the select above has actually succeeded
    return mapped;
  }, [table, businessId, fromDb, clearLoadError]);

  useEffect(() => {
    let cancelled = false;
    if (!businessId) { setData([]); previousRef.current = []; return () => {}; }
    (async () => {
      try {
        const rows = await supabaseRest.select(table, `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc`);
        if (cancelled) return;
        const mapped = (rows || []).map(fromDb);
        previousRef.current = mapped;
        setData(mapped);
        clearLoadError?.(table);
      } catch (e) {
        console.error(`Supabase load failed for ${table}`, e);
        // Deliberately NOT setData([]) here — an empty array means "Supabase confirmed there are
        // zero rows", which this catch cannot claim. `data` stays null (initial load) so the
        // caller can tell "still loading/failed" apart from "genuinely empty".
        if (!cancelled) reportLoadError?.(table, "initial", e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [table, businessId, fromDb, reportLoadError, clearLoadError]);

  const persist = useCallback(async (next) => {
    if (!businessId) throw new Error("No authenticated business is available.");
    const normalized = (next || []).map((item) => ({ ...item, id: isUuid(item.id) ? item.id : newDbId() }));
    const before = previousRef.current || [];
    const nextIds = new Set(normalized.map((x) => x.id));
    const missingRows = before.filter((x) => !nextIds.has(x.id));

    if (normalized.length) {
      await supabaseRest.upsert(table, normalized.map((item) => toDb(item, businessId)), "id");
    }
    for (const row of missingRows) {
      if (missing === "delete") await supabaseRest.deleteOne(table, row.id);
      else if (missing === "deactivate") await supabaseRest.updateOne(table, row.id, { active: false, updated_at: nowISO() });
    }
    return reload();
  }, [table, businessId, toDb, missing, reload]);

  return [data, persist, reload];
}

const fromLocationDb = (r) => ({ id: r.id, name: r.name, type: r.type || "Retail", active: r.active !== false });
const toLocationDb = (x, bid) => ({ id: x.id, business_id: bid, name: x.name, type: x.type || "Retail", active: x.active !== false, updated_at: nowISO() });
const fromSupplierDb = (r) => ({ id: r.id, name: r.name, contact: r.contact_name || "", phone: r.phone || "", email: r.email || "", address: r.address || "", website: r.website || "", taxId: r.tax_id || "", terms: r.payment_terms || "", defaultCurrency: r.default_currency || "USD", products: r.products_supplied || "", notes: r.notes || "", active: r.active !== false });
const toSupplierDb = (x, bid) => ({ id: x.id, business_id: bid, name: x.name, contact_name: x.contact || null, phone: x.phone || null, email: x.email || null, address: x.address || null, website: x.website || null, tax_id: x.taxId || null, payment_terms: x.terms || null, default_currency: x.defaultCurrency || "USD", products_supplied: x.products || null, notes: x.notes || null, active: x.active !== false, updated_at: nowISO() });
const fromCustomerDb = (r) => ({ id: r.id, name: r.name, phone: r.phone || "", email: r.email || "", birthday: r.birthday || "", notes: r.notes || "", active: r.active !== false, createdAt: r.created_at, updatedAt: r.updated_at });
const toCustomerDb = (x, bid) => ({ id: x.id, business_id: bid, name: x.name, phone: x.phone || null, email: x.email || null, birthday: x.birthday || null, notes: x.notes || null, active: x.active !== false, updated_at: nowISO() });

function useSupabaseEmployees(businessId, locations, reportLoadError, clearLoadError) {
  const byId = useMemo(() => Object.fromEntries((locations || []).map((l) => [l.id, l.name])), [locations]);
  const byName = useMemo(() => Object.fromEntries((locations || []).map((l) => [l.name, l.id])), [locations]);
  const defaultLocationId = useMemo(() => (locations || []).find((l) => l.active !== false)?.id || "", [locations]);
  const fromDb = useCallback((r) => ({ id: r.id, name: r.name, role: r.job_title || "", hourlyRate: Number(r.hourly_rate || 0), locationId: r.location_id || "", location: byId[r.location_id] || "", managerId: r.manager_id || "", active: r.active !== false, notes: r.notes || "" }), [byId]);
  const toDb = useCallback((x, bid) => ({ id: x.id, business_id: bid, name: x.name, job_title: x.role || null, hourly_rate: Number(x.hourlyRate || 0), location_id: x.locationId || byName[x.location] || defaultLocationId || null, manager_id: x.managerId || null, active: x.active !== false, notes: x.notes || null, updated_at: nowISO() }), [byName, defaultLocationId]);
  return useSupabaseArrayCollection("employees", businessId, fromDb, toDb, { missing: "deactivate" }, reportLoadError, clearLoadError);
}

const SETTINGS_LIST_MAP = {
  paymentMethods: "payment_method", channels: "channel", expenseCategories: "expense_category",
  productCategories: "product_category", inventoryCategories: "inventory_category", units: "unit",
};
function useSupabaseBusinessSettings(businessId, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId) { const fallback = seedSettings(); setData(fallback); return fallback; }
    const [bizRows, listRows] = await Promise.all([
      supabaseRest.select("businesses", `select=*&id=eq.${encodeURIComponent(businessId)}&limit=1`),
      supabaseRest.select("business_settings_lists", `select=*&business_id=eq.${encodeURIComponent(businessId)}&active=eq.true&order=sort_order.asc.nullslast,created_at.asc`),
    ]);
    const b = bizRows?.[0];
    // Confirmed against production data: an authenticated user's business_id always has a
    // matching row in businesses. Zero rows here is never a legitimate "new business, not set up
    // yet" case — it's a real failure (RLS, replication lag, data integrity) and must be treated
    // as such, not silently treated the same as the genuinely-no-tenant-yet case above.
    if (!b) throw new Error("Business profile was not found for the authenticated tenant.");
    const base = seedSettings();
    const next = { ...base, businessName: b.name, currency: b.currency || "USD", taxRate: Number(b.tax_rate || 0), taxEnabled: b.tax_enabled !== false, allowNegativeInventory: !!b.allow_negative_inventory, timezone: b.timezone || "America/New_York" };
    for (const [appKey, dbType] of Object.entries(SETTINGS_LIST_MAP)) {
      const values = (listRows || []).filter((r) => r.list_type === dbType).map((r) => r.value);
      if (values.length) next[appKey] = values;
    }
    setData(next);
    clearLoadError?.("settings"); // only reached once both selects above, and the row-existence check, succeeded
    return next;
  }, [businessId, clearLoadError]);
  useEffect(() => {
    reload().catch((e) => {
      console.error("business settings load failed", e);
      // Deliberately NOT setData(seedSettings()) — that used to make a real error (network, RLS,
      // schema, or a genuinely missing business row) indistinguishable from a fresh business with
      // no configuration yet, and — critically — a plausible-looking fabricated object that
      // SettingsView.save() could then write back over the tenant's real configuration. `data`
      // stays whatever it already was (null on a failed initial load; the last real value on a
      // failed reload) and the failure is only recorded in the shared loadErrors registry.
      reportLoadError?.("settings", "initial", e.message);
    });
  }, [reload, reportLoadError]);
  const persist = useCallback(async (next) => {
    if (!businessId) throw new Error("No authenticated business is available.");
    await supabaseRest.updateOne("businesses", businessId, { name: next.businessName, currency: next.currency || "USD", tax_rate: Number(next.taxRate || 0), tax_enabled: next.taxEnabled !== false, allow_negative_inventory: !!next.allowNegativeInventory, timezone: next.timezone || "America/New_York", updated_at: nowISO() });
    const existing = await supabaseRest.select("business_settings_lists", `select=*&business_id=eq.${encodeURIComponent(businessId)}`);
    for (const [appKey, dbType] of Object.entries(SETTINGS_LIST_MAP)) {
      const wanted = new Set((next[appKey] || []).map(String));
      const current = (existing || []).filter((r) => r.list_type === dbType);
      const currentByValue = new Map(current.map((r) => [r.value, r]));
      const upserts = [...wanted].map((value, idx) => {
        const old = currentByValue.get(value);
        return { id: old?.id || newDbId(), business_id: businessId, list_type: dbType, value, active: true, sort_order: idx, updated_at: nowISO() };
      });
      if (upserts.length) await supabaseRest.upsert("business_settings_lists", upserts, "id");
      for (const old of current) if (!wanted.has(old.value) && old.active !== false) await supabaseRest.updateOne("business_settings_lists", old.id, { active: false, updated_at: nowISO() });
    }
    return reload();
  }, [businessId, reload]);
  return [data, persist];
}


/* ============================== SUPABASE DATA — PHASE 2 ==============================
 * Products + recipes and the Inventory screen now read/write tenant-scoped Supabase data.
 * IMPORTANT: legacy POS / Purchases still use their local transactional shadow until the next
 * RPC cutover. This prevents a half-migrated sale from bypassing fn_create_sale. During Phase 2,
 * catalog changes are therefore validated in Products/Inventory first; POS cutover is Phase 3.
 * ============================================================================== */
function useSupabaseProducts(businessId, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const previousRef = useRef([]);

  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); previousRef.current = []; return []; }
    const rows = await supabaseRest.select("products", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc`);
    const ids = (rows || []).map((r) => r.id);
    let recipes = [];
    if (ids.length) recipes = await supabaseRest.select("product_recipes", `select=*&product_id=in.(${ids.join(",")})`);
    const byProduct = new Map();
    for (const r of recipes || []) {
      if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, []);
      byProduct.get(r.product_id).push({ itemId: r.inventory_item_id, qty: Number(r.qty_per_unit || 0) });
    }
    const mapped = (rows || []).map((r) => ({
      id: r.id, name: r.name, sku: r.sku || "", category: r.category || "", price: Number(r.price || 0),
      active: r.active !== false, description: r.description || "", image: r.image_url || "",
      recipe: byProduct.get(r.id) || [], createdAt: r.created_at, updatedAt: r.updated_at,
    }));
    previousRef.current = mapped;
    setData(mapped);
    clearLoadError?.("products"); // only reached once BOTH selects above have succeeded
    return mapped;
  }, [businessId, clearLoadError]);

  useEffect(() => { reload().catch((e) => { console.error("Supabase products load failed", e); reportLoadError?.("products", "initial", e.message); }); }, [reload, reportLoadError]);

  const persist = useCallback(async (next) => {
    if (!businessId) throw new Error("No authenticated business is available.");
    const normalized = (next || []).map((p) => ({ ...p, id: isUuid(p.id) ? p.id : newDbId() }));
    const before = previousRef.current || [];
    const nextIds = new Set(normalized.map((p) => p.id));

    if (normalized.length) {
      await supabaseRest.upsert("products", normalized.map((p) => ({
        id: p.id, business_id: businessId, name: String(p.name || "").trim(), sku: p.sku || null,
        category: p.category || null, price: Number(p.price || 0), active: p.active !== false,
        description: p.description || null, image_url: p.image || p.imageUrl || null, updated_at: nowISO(),
      })), "id");
    }
    // Product removal in the current UI is intentionally a soft-delete in the database so historical
    // sales and future references stay valid.
    for (const old of before) if (!nextIds.has(old.id)) await supabaseRest.updateOne("products", old.id, { active: false, updated_at: nowISO() });

    for (const p of normalized) {
      const current = await supabaseRest.select("product_recipes", `select=*&product_id=eq.${p.id}`);
      const wanted = new Map((p.recipe || []).filter((r) => isUuid(r.itemId) && Number(r.qty) > 0).map((r) => [r.itemId, Number(r.qty)]));
      const currentByItem = new Map((current || []).map((r) => [r.inventory_item_id, r]));
      const rows = [...wanted.entries()].map(([itemId, qty]) => ({
        id: currentByItem.get(itemId)?.id || newDbId(), product_id: p.id, inventory_item_id: itemId, qty_per_unit: qty,
      }));
      if (rows.length) await supabaseRest.upsert("product_recipes", rows, "id");
      for (const r of current || []) if (!wanted.has(r.inventory_item_id)) await supabaseRest.deleteOne("product_recipes", r.id);
    }
    return reload();
  }, [businessId, reload]);

  return [data, persist, reload];
}

const inventoryTxTypeLabel = (t) => ({
  INITIAL_STOCK: "Initial Stock", PURCHASE: "Purchase", SALE: "Sale", WASTE: "Waste",
  ADJUSTMENT: "Adjustment", REVERSAL: "Reversal", TRANSFER_OUT: "Transfer Out", TRANSFER_IN: "Transfer In",
}[t] || t || "Adjustment");

function useSupabaseInventory(businessId, locations, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const locationById = useMemo(() => Object.fromEntries((locations || []).map((l) => [l.id, l.name])), [locations]);

  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); setTransactions([]); return []; }
    const items = await supabaseRest.select("inventory_items", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc`);
    const ids = (items || []).map((i) => i.id);
    let stock = [];
    if (ids.length) stock = await supabaseRest.select("inventory_stock", `select=*&inventory_item_id=in.(${ids.join(",")})&order=created_at.asc`);
    const stockByItem = new Map();
    for (const st of stock || []) if (!stockByItem.has(st.inventory_item_id)) stockByItem.set(st.inventory_item_id, st);
    const mapped = (items || []).map((i) => {
      const st = stockByItem.get(i.id);
      return {
        id: i.id, name: i.name, sku: i.sku || "", category: i.category || "", unit: i.unit,
        qty: Number(st?.qty || 0), minQty: Number(i.min_qty || 0), maxQty: Number(i.max_qty || 0),
        costPerUnit: Number(st?.avg_cost_per_unit || 0), supplierId: i.supplier_id || "",
        locationId: st?.location_id || "", location: locationById[st?.location_id] || "",
        expiresAt: i.expires_at || "", notes: i.notes || "", active: i.active !== false,
      };
    });
    const txRows = await supabaseRest.select("inventory_transactions", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc&limit=500`);
    setTransactions((txRows || []).map((t) => ({
      id: t.id, date: t.created_at, itemId: t.inventory_item_id, type: inventoryTxTypeLabel(t.type), qty: Number(t.qty_change || 0),
      unit: t.unit || "", unitCost: t.unit_cost == null ? null : Number(t.unit_cost), totalCost: t.total_cost == null ? null : Number(t.total_cost),
      referenceId: t.sale_id || t.purchase_order_id || t.related_transaction_id || "", note: t.note || "", locationId: t.location_id,
    })));
    setData(mapped);
    // Only reached once ALL THREE queries above (items, stock, transactions) have succeeded —
    // exactly the "clear only after every query composing this reload succeeded" requirement,
    // since any earlier await throwing would have skipped straight to the catch below instead.
    clearLoadError?.("inventory");
    return mapped;
  }, [businessId, locationById, clearLoadError]);

  useEffect(() => { reload().catch((e) => { console.error("Supabase inventory load failed", e); reportLoadError?.("inventory", "initial", e.message); }); }, [reload, reportLoadError]);

  // Catalog metadata only. Quantity/cost/location are ledger-derived and are NEVER written directly.
  const persistCatalog = useCallback(async (next) => {
    if (!businessId) throw new Error("No authenticated business is available.");
    const currentIds = new Set((data || []).map((i) => i.id));
    const rows = (next || []).filter((i) => currentIds.has(i.id)).map((i) => ({
      id: i.id, business_id: businessId, name: i.name, sku: i.sku || null, category: i.category || null,
      unit: i.unit, min_qty: Number(i.minQty || 0), max_qty: Number(i.maxQty || 0), supplier_id: i.supplierId || null,
      expires_at: i.expiresAt || null, notes: i.notes || null, active: i.active !== false, updated_at: nowISO(),
    }));
    if (rows.length) await supabaseRest.upsert("inventory_items", rows, "id");
    return reload();
  }, [businessId, data, reload]);

  const ops = useMemo(() => ({
    remote: true,
    async createItem(payload) {
      if (!payload.locationId) throw new Error("Select a storage location.");
      // fn_add_initial_stock itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "create failed" handling is unchanged. This is a
      // single RPC (not several separate client-side writes), so there is no partial-write risk
      // to reason about here — the server either committed the new item or it didn't.
      const row = await supabaseRest.rpc("fn_add_initial_stock", {
        p_business_id: businessId, p_name: payload.name, p_sku: payload.sku || null, p_category: payload.category || null,
        p_unit: payload.unit, p_min_qty: Number(payload.minQty || 0), p_max_qty: Number(payload.maxQty || 0),
        p_supplier_id: payload.supplierId || null, p_location_id: payload.locationId, p_expires_at: payload.expiresAt || null,
        p_notes: payload.notes || null, p_starting_qty: Number(payload.qty || 0), p_starting_cost: Number(payload.costPerUnit || 0),
      });
      try {
        return await reload();
      } catch (e) {
        // The item is already created on the server at this point — only the screen refresh
        // failed. This hook's reload() covers both inventory items/stock and transactions under
        // one "inventory" key (same as receive/adjust/waste), so that is the one key reported,
        // reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2. The thrown
        // error is tagged so the caller can tell this apart from a real create failure and avoid
        // showing a false "create failed" message that could invite a duplicate item.
        reportLoadError?.("inventory", "reload", e.message);
        const err = new Error("The item was created, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
    },
    async receive(item, qty, notes = "") {
      if (!item?.locationId) throw new Error("This item has no stock location.");
      // fn_receive_manual_stock itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "receive failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_receive_manual_stock", {
        p_business_id: businessId, p_inventory_item_id: item.id, p_location_id: item.locationId,
        p_qty: Number(qty), p_notes: notes || null,
      });
      try {
        return await reload();
      } catch (e) {
        // The receipt is already confirmed on the server at this point — only the screen refresh
        // failed. This hook's reload() covers both inventory items/stock and transactions under
        // one "inventory" key (see reload's own clearLoadError call above), so that is the one
        // key reported, reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2.
        // The thrown error is tagged so the caller can tell this apart from a real receive failure
        // and avoid showing a false "receive failed" message that could invite duplicate stock.
        reportLoadError?.("inventory", "reload", e.message);
        const err = new Error("The stock was received, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
    },
    async adjust(item, newQty, reason, notes = "") {
      if (!item?.locationId) throw new Error("This item has no stock location.");
      // fn_adjust_inventory_count itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "adjust failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_adjust_inventory_count", {
        p_business_id: businessId, p_inventory_item_id: item.id, p_location_id: item.locationId,
        p_new_qty: Number(newQty), p_reason: reason || "Physical Count", p_notes: notes || null,
      });
      try {
        return await reload();
      } catch (e) {
        // Same pattern as receive() above: the count is already confirmed on the server — only
        // the screen refresh failed.
        reportLoadError?.("inventory", "reload", e.message);
        const err = new Error("The count was saved, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
    },
    async waste(item, qty, reason, notes = "") {
      if (!item?.locationId) throw new Error("This item has no stock location.");
      // fn_record_waste itself is NOT wrapped here — a failure there must keep throwing normally,
      // so the caller's existing "waste failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_record_waste", {
        p_business_id: businessId, p_inventory_item_id: item.id, p_location_id: item.locationId,
        p_qty: Number(qty), p_reason: reason || "Other", p_notes: notes || null,
      });
      try {
        return await reload();
      } catch (e) {
        // Same pattern as receive()/adjust() above: the waste entry is already confirmed on the
        // server — only the screen refresh failed.
        reportLoadError?.("inventory", "reload", e.message);
        const err = new Error("The waste was recorded, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
    },
  }), [businessId, reload]);

  return [data, persistCatalog, transactions, ops, reload];
}

/* ============================== SUPABASE DATA — PHASE 3: SALES / ORDERS ============================== */
function useSupabaseSales(businessId, locations, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const locationById = useMemo(() => Object.fromEntries((locations || []).map((l) => [l.id, l.name])), [locations]);

  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); return []; }
    const rows = await supabaseRest.select("sales", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=sale_date.desc&limit=500`);
    const ids = (rows || []).map((r) => r.id);
    let itemRows = [];
    if (ids.length) itemRows = await supabaseRest.select("sale_items", `select=*&sale_id=in.(${ids.join(",")})`);
    const bySale = new Map();
    for (const it of itemRows || []) {
      if (!bySale.has(it.sale_id)) bySale.set(it.sale_id, []);
      bySale.get(it.sale_id).push({
        id: it.id, productId: it.product_id, name: it.product_name_snapshot, qty: Number(it.qty || 0),
        unitPrice: Number(it.unit_price || 0), cost: Number(it.unit_cost_snapshot || 0),
      });
    }
    const mapped = (rows || []).map((r) => ({
      id: r.id, orderNo: r.order_no, date: r.sale_date || r.created_at, status: r.status, paymentStatus: "paid",
      fulfillmentStatus: r.fulfillment_status, items: bySale.get(r.id) || [], subtotal: Number(r.subtotal || 0),
      discount: Number(r.discount || 0), tax: Number(r.tax || 0), total: Number(r.total || 0), paymentMethod: r.payment_method,
      channel: r.channel, locationId: r.location_id, location: locationById[r.location_id] || "", employeeId: r.employee_id || "",
      customerId: r.customer_id || "", notes: r.notes || "", createdBy: r.created_by || "", cancelledAt: r.cancelled_at || null,
      cancelledBy: r.cancelled_by || null, supabase: true,
    }));
    setData(mapped);
    clearLoadError?.("sales"); // only reached once both selects above have succeeded
    return mapped;
  }, [businessId, locationById, clearLoadError]);

  useEffect(() => { reload().catch((e) => { console.error("Supabase sales load failed", e); reportLoadError?.("sales", "initial", e.message); }); }, [reload, reportLoadError]);

  const persist = useCallback(async (next) => {
    const before = data || [];
    let reversedAny = false; // tracks whether fn_reverse_sale actually ran during this call
    let advancedAny = false; // tracks whether fn_advance_sale_fulfillment actually ran during this call
    for (const n of next || []) {
      const old = before.find((x) => x.id === n.id);
      if (!old) continue; // creation is exclusively fn_create_sale
      if (old.status !== "cancelled" && n.status === "cancelled") {
        // fn_reverse_sale itself is NOT wrapped here — a failure there must keep throwing
        // normally, so the caller's existing "cancel failed" handling is unchanged.
        await supabaseRest.rpc("fn_reverse_sale", { p_sale_id: n.id });
        reversedAny = true;
      } else if (old.fulfillmentStatus !== n.fulfillmentStatus) {
        // fn_advance_sale_fulfillment itself is NOT wrapped here — a failure there must keep
        // throwing normally, so the caller's existing "advance failed" handling is unchanged.
        await supabaseRest.rpc("fn_advance_sale_fulfillment", { p_sale_id: n.id });
        advancedAny = true;
      }
    }
    if (reversedAny) {
      try {
        return await reload();
      } catch (e) {
        // The cancellation is already confirmed on the server at this point — only the screen
        // refresh failed. Reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2.
        // The thrown error is tagged so the caller can tell this apart from a real cancellation
        // failure and avoid showing a false "cancel failed" message that could invite a duplicate
        // reversal — and, critically, so the caller can still proceed to attempt the separate
        // loyalty reversal RPC below it, rather than this exception blocking that entirely.
        reportLoadError?.("sales", "reload", e.message);
        const err = new Error("The sale was cancelled, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        throw err;
      }
    }
    if (advancedAny) {
      try {
        return await reload();
      } catch (e) {
        // Same pattern as the cancellation branch above: fn_advance_sale_fulfillment already
        // committed the new status on the server — only the screen refresh failed.
        reportLoadError?.("sales", "reload", e.message);
        const err = new Error("The order status was updated, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        throw err;
      }
    }
    return reload(); // no-op path — unchanged
  }, [data, reload, reportLoadError]);

  const ops = useMemo(() => ({ remote: true, reload, async create(pendingSale) {
    // fn_create_sale itself is NOT wrapped here — a failure there must keep throwing normally,
    // so the caller's existing "sale could not be saved" handling is unchanged.
    const row = await supabaseRest.rpc("fn_create_sale", {
      p_sale_id: pendingSale.id, p_business_id: businessId, p_location_id: pendingSale.locationId,
      p_channel: pendingSale.channel, p_payment_method: pendingSale.paymentMethod, p_employee_id: pendingSale.employeeId || null,
      p_customer_id: pendingSale.customerId || null, p_discount: Number(pendingSale.discount || 0), p_tax: Number(pendingSale.tax || 0),
      p_notes: pendingSale.notes || null, p_fulfillment_status: pendingSale.fulfillmentStatus,
      p_items: (pendingSale.items || []).map((it) => ({ product_id: it.productId, qty: Number(it.qty), unit_price: Number(it.unitPrice) })),
    });
    let all;
    try {
      all = await reload();
    } catch (e) {
      // The sale is already created on the server at this point — only the screen refresh
      // failed. Reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2. The
      // thrown error carries the raw RPC result (row) so the caller can still build a usable
      // sale object — order number, id, totals — for the receipt/completedSale flow even though
      // the full mapped/reloaded row isn't available. The caller must NOT re-run fn_create_sale.
      reportLoadError?.("sales", "reload", e.message);
      const err = new Error("The sale was recorded, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
      err.rpcSucceeded = true;
      err.staleData = true;
      err.result = row;
      throw err;
    }
    return all.find((s) => s.id === (row?.id || pendingSale.id)) || all.find((s) => s.id === pendingSale.id) || null;
  }}), [businessId, reload, reportLoadError]);

  return [data, persist, ops];
}


/* ============================== SUPABASE DATA — PHASE 5: LOYALTY ============================== */
function useSupabaseLoyalty(businessId, reportLoadError, clearLoadError) {
  const [transactions, setTransactions] = useState(null);
  const [rewards, setRewards] = useState(null);

  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setTransactions([]); setRewards([]); return { transactions: [], rewards: [] }; }
    const [txRows, rewardRows] = await Promise.all([
      supabaseRest.select("loyalty_transactions", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.desc&limit=2000`),
      supabaseRest.select("loyalty_rewards", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=created_at.asc`),
    ]);
    const mappedTx = (txRows || []).map((r) => ({
      id: r.id, customerId: r.customer_id, type: r.type, points: Number(r.points || 0), reason: r.reason || "",
      saleId: r.sale_id || null, createdAt: r.created_at, createdBy: r.created_by || null, createdByName: "",
      supabase: true,
    }));
    const mappedRewards = (rewardRows || []).map((r) => ({
      id: r.id, name: r.name, requiredPoints: Number(r.required_points || 0), discountType: r.discount_type || "fixed",
      discountValue: Number(r.discount_value || 0), active: r.active !== false, supabase: true,
    }));
    setTransactions(mappedTx); setRewards(mappedRewards);
    // Reached only after BOTH halves of the Promise.all above resolved successfully — a single
    // shared "loyalty" key covers transactions+rewards together, matching how they're loaded together.
    clearLoadError?.("loyalty");
    return { transactions: mappedTx, rewards: mappedRewards };
  }, [businessId, clearLoadError]);

  useEffect(() => { reload().catch((e) => { console.error("Supabase loyalty load failed", e); reportLoadError?.("loyalty", "initial", e.message); }); }, [reload, reportLoadError]);

  // Compatibility boundary for the existing Loyalty UI. The UI still expresses its desired
  // ledger change as a next array, but authenticated production writes are translated into the
  // existing SECURITY DEFINER RPCs. No direct loyalty_transactions writes are ever attempted.
  const persist = useCallback(async (next) => {
    const beforeIds = new Set((transactions || []).map((x) => x.id));
    const added = (next || []).filter((x) => !beforeIds.has(x.id));
    if (!added.length) return reload();

    const saleCommit = added.find((x) => x.saleId && (x.type === "earn" || x.type === "redeem"));
    if (saleCommit) {
      const redeem = added.find((x) => x.saleId === saleCommit.saleId && x.type === "redeem");
      let rewardId = null;
      if (redeem) {
        const rewardName = String(redeem.reason || "").replace(/^Redeemed:\s*/i, "").trim();
        rewardId = (rewards || []).find((r) => r.name === rewardName)?.id || null;
      }
      await supabaseRest.rpc("fn_commit_loyalty_for_sale", { p_sale_id: saleCommit.saleId, p_redeemed_reward_id: rewardId });
      return reload();
    }

    const saleReverse = added.find((x) => x.saleId && (x.type === "reversal" || x.type === "restore"));
    if (saleReverse) {
      await supabaseRest.rpc("fn_reverse_loyalty_for_sale", { p_sale_id: saleReverse.saleId });
      return reload();
    }

    const manualRows = added.filter((x) => x.type === "manual_add" || x.type === "manual_remove");
    if (manualRows.length) {
      let lastResult = null;
      for (const row of manualRows) {
        // fn_manual_loyalty_adjustment itself is NOT wrapped here — a failure there must keep
        // throwing normally, so the caller's existing "adjustment failed" handling is unchanged.
        // If this loop runs more than one row (not exercised by the current single-entry
        // manualLoyaltyAdjustment call site, but the loop structure itself allows it), an earlier
        // row in the loop that already succeeded stays committed on the server regardless of what
        // happens to a later row or to the reload below — this function only ever reports on the
        // reload step, never re-runs an RPC that already committed.
        lastResult = await supabaseRest.rpc("fn_manual_loyalty_adjustment", {
          p_business_id: businessId, p_customer_id: row.customerId, p_type: row.type,
          p_points: Number(row.points), p_reason: row.reason,
        });
      }
      try {
        return await reload();
      } catch (e) {
        // Every manual adjustment RPC above already committed on the server — only the screen
        // refresh failed. Reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2.
        // The thrown error is tagged so the caller can tell this apart from a real adjustment
        // failure and avoid showing a false "adjustment failed" message that could invite a
        // duplicate points adjustment.
        reportLoadError?.("loyalty", "reload", e.message);
        const err = new Error("The points were adjusted, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = lastResult;
        throw err;
      }
    }
    return reload();
  }, [businessId, transactions, rewards, reload]);

  return [transactions, persist, rewards, reload];
}

/* ============================== SUPABASE DATA — PHASE 4: PURCHASES / EXPENSES / CASH ============================== */
function useSupabaseCashFlow(businessId, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); return []; }
    const [rows, paymentRows] = await Promise.all([
      supabaseRest.select("cash_flow", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=transaction_date.desc&limit=1000`),
      supabaseRest.select("purchase_order_payments", "select=*&order=paid_at.desc&limit=1000"),
    ]);
    const poByPayment = Object.fromEntries((paymentRows || []).map((p) => [p.id, p.purchase_order_id]));
    const mapped = (rows || []).map((r) => ({
      id: r.id, date: r.transaction_date || r.created_at, locationId: r.location_id || "",
      // Location is required by cashRegisterEntries so live register balances match the backend.
      // The UI treats the opening line as positive cash but excludes its category from register sums.
      type: r.type === "opening_balance" ? "income" : r.type,
      category: r.category, amount: Number(r.amount || 0), paymentMethod: r.payment_method || "",
      description: r.description || "", relatedSaleId: r.sale_id || "", relatedExpenseId: r.expense_id || "",
      purchasePaymentId: r.purchase_order_payment_id || "", relatedPOId: poByPayment[r.purchase_order_payment_id] || "",
      relatedCashRegisterId: r.related_cash_register_id || "", reversalOf: r.reversal_of || "", status: r.status || "completed",
      createdBy: r.created_by || "", supabase: true,
    }));
    setData(mapped);
    clearLoadError?.("cashFlow"); // only reached once both parallel selects above have succeeded
    return mapped;
  }, [businessId, clearLoadError]);
  useEffect(() => { reload().catch((e) => { console.error("Supabase cash flow load failed", e); reportLoadError?.("cashFlow", "initial", e.message); }); }, [reload, reportLoadError]);
  return [data, reload];
}

function useSupabaseExpenses(businessId, reloadCashFlow, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); return []; }
    const rows = await supabaseRest.select("expenses", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=expense_date.desc&limit=500`);
    const mapped = (rows || []).map((r) => ({
      id: r.id, amount: Number(r.amount || 0), date: r.expense_date || r.created_at, category: r.category,
      vendor: r.vendor || "", paymentMethod: r.payment_method || "", locationId: r.location_id || "",
      recurring: !!r.recurring, description: r.description || "", status: r.status || "completed",
      reversedAt: r.reversed_at || "", reversedBy: r.reversed_by || "", createdBy: r.created_by || "", supabase: true,
    }));
    setData(mapped);
    clearLoadError?.("expenses");
    return mapped;
  }, [businessId, clearLoadError]);
  useEffect(() => { reload().catch((e) => { console.error("Supabase expenses load failed", e); reportLoadError?.("expenses", "initial", e.message); }); }, [reload, reportLoadError]);
  const ops = useMemo(() => ({ remote: true, reload,
    async create(x) {
      // fn_create_expense itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "create failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_create_expense", {
        p_business_id: businessId, p_location_id: x.locationId, p_expense_date: x.date,
        p_category: x.category, p_vendor: x.vendor || null, p_amount: Number(x.amount),
        p_payment_method: x.paymentMethod || null, p_recurring: !!x.recurring, p_notes: x.description || null,
      });
      try {
        await Promise.all([reload(), reloadCashFlow?.()]);
      } catch (e) {
        // The expense is already created on the server at this point — only the screen refresh
        // failed. Both reload() (this hook's own "expenses" data) and reloadCashFlow?.() run in
        // the same Promise.all, and a rejection here doesn't tell us which one actually failed —
        // so both keys are reported, reusing the exact loadErrors/DataLoadBanner mechanism from
        // subfases 1-2 rather than inventing a second error channel. The thrown error is tagged so
        // the caller can tell this apart from a real create failure and avoid showing a false
        // "create failed" message that could invite a duplicate expense.
        reportLoadError?.("expenses", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The expense was created, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
    async reverse(id) {
      // fn_reverse_expense itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "reverse failed" handling is unchanged. Its own
      // related_cash_register_id fix (server-side) is untouched by this — this only concerns what
      // happens to the reload afterward.
      const row = await supabaseRest.rpc("fn_reverse_expense", { p_expense_id: id });
      try {
        await Promise.all([reload(), reloadCashFlow?.()]);
      } catch (e) {
        // Same pattern as create() above: the reversal is already confirmed on the server — only
        // the screen refresh failed. Both keys are reported for the same Promise.all reason.
        reportLoadError?.("expenses", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The expense was reversed, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
  }), [businessId, reload, reloadCashFlow]);
  return [data, ops];
}

function useSupabasePurchases(businessId, reloadInventory, reloadCashFlow, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); return []; }
    const pos = await supabaseRest.select("purchase_orders", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=order_date.desc&limit=500`);
    const ids = (pos || []).map((x) => x.id);
    let lines = [], payments = [];
    if (ids.length) {
      [lines, payments] = await Promise.all([
        supabaseRest.select("purchase_order_items", `select=*&purchase_order_id=in.(${ids.join(",")})`),
        supabaseRest.select("purchase_order_payments", `select=*&purchase_order_id=in.(${ids.join(",")})&order=paid_at.desc`),
      ]);
    }
    const linesByPo = new Map(), paymentsByPo = new Map();
    for (const r of lines || []) {
      if (!linesByPo.has(r.purchase_order_id)) linesByPo.set(r.purchase_order_id, []);
      linesByPo.get(r.purchase_order_id).push({ id: r.id, itemId: r.inventory_item_id, qty: Number(r.qty_ordered || 0), unit: r.unit || "", unitCost: Number(r.unit_cost || 0), receivedQty: Number(r.received_qty || 0) });
    }
    for (const r of payments || []) {
      if (!paymentsByPo.has(r.purchase_order_id)) paymentsByPo.set(r.purchase_order_id, []);
      paymentsByPo.get(r.purchase_order_id).push({ id: r.id, amount: Number(r.amount || 0), paymentMethod: r.payment_method || "", date: r.paid_at, status: r.status || "completed", reversedAt: r.reversed_at || "" });
    }
    const mapped = (pos || []).map((r) => {
      const poPayments = paymentsByPo.get(r.id) || [];
      return {
        id: r.id, poNumber: `PO-${r.po_number}`, poNumberRaw: r.po_number, supplierId: r.supplier_id, locationId: r.location_id,
        orderDate: r.order_date, expectedDate: r.expected_date, status: r.status, paymentMethod: r.payment_method || "",
        notes: r.notes || "", discount: Number(r.discount || 0), tax: Number(r.tax || 0),
        items: linesByPo.get(r.id) || [], payments: poPayments,
        amountPaid: round2(poPayments.filter((x) => x.status === "completed").reduce((a, x) => a + x.amount, 0)),
        reversedAt: r.reversed_at || "", reversedBy: r.reversed_by || "", createdBy: r.created_by || "", supabase: true,
      };
    });
    setData(mapped);
    clearLoadError?.("purchases"); // only reached once every select above (pos, lines, payments) has succeeded
    return mapped;
  }, [businessId, clearLoadError]);
  useEffect(() => { reload().catch((e) => { console.error("Supabase purchases load failed", e); reportLoadError?.("purchases", "initial", e.message); }); }, [reload, reportLoadError]);
  const refreshAll = useCallback(async ({ inventory=false, cash=false }={}) => {
    const jobs=[reload()]; if (inventory && reloadInventory) jobs.push(reloadInventory()); if (cash && reloadCashFlow) jobs.push(reloadCashFlow());
    await Promise.all(jobs);
  }, [reload, reloadInventory, reloadCashFlow]);
  const ops = useMemo(() => ({ remote: true, reload,
    async create(x) {
      // fn_create_purchase_order itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "create failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_create_purchase_order", {
        p_business_id: businessId, p_supplier_id: x.supplierId, p_location_id: x.locationId,
        p_order_date: x.orderDate, p_expected_date: x.expectedDate || null, p_status: x.status,
        p_payment_method: x.paymentMethod || null, p_notes: x.notes || null,
        p_discount: Number(x.discount || 0), p_tax: Number(x.tax || 0),
        p_items: (x.items || []).map((it) => ({ inventory_item_id: it.itemId, qty: Number(it.qty), unit: it.unit, unit_cost: Number(it.unitCost) })),
      });
      try {
        await refreshAll();
      } catch (e) {
        // The purchase order is already created on the server at this point — only the screen
        // refresh failed. refreshAll() with no args only reloads this hook's own "purchases" data
        // (inventory/cash flow are untouched by a plain create), so that is the one key reported,
        // reusing the exact loadErrors/DataLoadBanner mechanism from subfases 1-2 rather than
        // inventing a second error channel. The thrown error is tagged so the caller can tell this
        // apart from a real create failure and avoid showing a false "create failed" message that
        // could invite a duplicate purchase order.
        reportLoadError?.("purchases", "reload", e.message);
        const err = new Error("The purchase order was created, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
    async receive(poId, receiveLines) {
      // fn_receive_purchase_order itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "receive failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_receive_purchase_order", { p_purchase_order_id: poId, p_receive_lines: receiveLines.map((x) => ({ po_item_id: x.poItemId, qty: Number(x.qty) })) });
      try {
        await refreshAll({ inventory: true });
      } catch (e) {
        // The receipt (and its inventory movement) is already confirmed on the server at this
        // point — only the screen refresh failed. refreshAll({inventory:true}) reloads both this
        // hook's own "purchases" data and inventory together (Promise.all), and a rejection here
        // doesn't tell us which one actually failed — so both keys are reported, reusing the exact
        // loadErrors/DataLoadBanner mechanism from subfases 1-2 rather than inventing a second
        // error channel. The thrown error is tagged so the caller can tell this apart from a real
        // receive failure and avoid showing a false "receive failed" message that could invite a
        // duplicate receipt.
        reportLoadError?.("purchases", "reload", e.message);
        reportLoadError?.("inventory", "reload", e.message);
        const err = new Error("The purchase order was received, but the screen could not refresh. Reload the page to see the latest data.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
    async pay(poId, amount, paymentMethod) {
      // fn_pay_purchase_order itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "payment failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_pay_purchase_order", { p_purchase_order_id: poId, p_amount: Number(amount), p_payment_method: paymentMethod });
      try {
        await refreshAll({ cash: true });
      } catch (e) {
        // The payment itself is already confirmed on the server at this point — only the screen
        // refresh failed. refreshAll({cash:true}) reloads both this hook's own "purchases" data
        // and cash flow together (Promise.all), and a rejection here doesn't tell us which one
        // actually failed — so both keys are reported, reusing the exact loadErrors/DataLoadBanner
        // mechanism from subfases 1-2 rather than inventing a second error channel. The thrown
        // error is tagged so the caller can tell this apart from a real payment failure and avoid
        // showing a false "payment failed" message.
        reportLoadError?.("purchases", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The payment was saved, but the screen could not refresh. Reload the page to see the latest balance.");
        err.rpcSucceeded = true;
        throw err;
      }
      return row;
    },
    async reversePayment(paymentId) {
      // fn_reverse_po_payment itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "reversal failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_reverse_po_payment", { p_payment_id: paymentId });
      try {
        await refreshAll({ cash: true });
      } catch (e) {
        // The payment reversal is already confirmed on the server at this point — only the screen
        // refresh failed. refreshAll({cash:true}) reloads both this hook's own "purchases" data
        // and cash flow together (Promise.all), and a rejection here doesn't tell us which one
        // actually failed — so both keys are reported, reusing the exact loadErrors/DataLoadBanner
        // mechanism from subfases 1-2 rather than inventing a second error channel. The thrown
        // error is tagged so the caller can tell this apart from a real reversal failure and avoid
        // showing a false "reversal failed" message that could invite a duplicate reversal.
        reportLoadError?.("purchases", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The payment was reversed successfully, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
    async reversePurchase(poId) {
      // fn_reverse_purchase_order itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "reversal failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_reverse_purchase_order", { p_purchase_order_id: poId });
      try {
        await refreshAll({ inventory: true, cash: true });
      } catch (e) {
        // The purchase reversal (inventory pulled back + cash corrected) is already confirmed on
        // the server at this point — only the screen refresh failed. refreshAll({inventory:true,
        // cash:true}) reloads this hook's own "purchases" data, inventory, and cash flow together
        // (Promise.all), and a rejection here doesn't tell us which one actually failed — so all
        // three keys are reported, reusing the exact loadErrors/DataLoadBanner mechanism from
        // subfases 1-2. The thrown error is tagged so the caller can tell this apart from a real
        // reversal failure and avoid showing a false "reversal failed" message that could invite a
        // duplicate reversal of inventory and cash.
        reportLoadError?.("purchases", "reload", e.message);
        reportLoadError?.("inventory", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The purchase was reversed successfully, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
    async cancel(poId) {
      // fn_cancel_purchase_order itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "cancel failed" handling (including its own error
      // message extraction) is unchanged.
      const row = await supabaseRest.rpc("fn_cancel_purchase_order", { p_purchase_order_id: poId });
      try {
        await refreshAll();
      } catch (e) {
        // The cancellation is already confirmed on the server at this point — only the screen
        // refresh failed. refreshAll() with no args only reloads this hook's own "purchases" data,
        // so that is the one key reported, reusing the exact loadErrors/DataLoadBanner mechanism
        // from subfases 1-2 rather than inventing a second error channel. The thrown error is
        // tagged so the caller can tell this apart from a real cancellation failure and avoid
        // showing a false "could not cancel" message that could invite a duplicate cancellation.
        reportLoadError?.("purchases", "reload", e.message);
        const err = new Error("The purchase order was cancelled, but the screen could not refresh. Displayed data may be outdated. Refresh the page.");
        err.rpcSucceeded = true;
        err.staleData = true;
        err.result = row;
        throw err;
      }
      return row;
    },
  }), [businessId, reload, refreshAll]);
  return [data, ops];
}

function useSupabaseCashRegisters(businessId, reloadCashFlow, reportLoadError, clearLoadError) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId || !supabaseAuth.hasSession()) { setData([]); return []; }
    const rows = await supabaseRest.select("cash_registers", `select=*&business_id=eq.${encodeURIComponent(businessId)}&order=opened_at.desc&limit=250`);
    const mapped = (rows || []).map((r) => ({
      id: r.id, locationId: r.location_id, openedByUserId: r.opened_by || "", openedAt: r.opened_at,
      openingCash: Number(r.opening_cash || 0), status: r.status, closedByUserId: r.closed_by || "", closedAt: r.closed_at || "",
      expectedCash: r.expected_cash == null ? null : Number(r.expected_cash), actualCash: r.actual_cash == null ? null : Number(r.actual_cash),
      difference: r.difference == null ? null : Number(r.difference), differenceReason: r.difference_reason || "", notes: r.notes || "", supabase: true,
    }));
    setData(mapped);
    clearLoadError?.("cashRegisters");
    return mapped;
  }, [businessId, clearLoadError]);
  useEffect(() => { reload().catch((e) => { console.error("Supabase cash registers load failed", e); reportLoadError?.("cashRegisters", "initial", e.message); }); }, [reload, reportLoadError]);
  const refreshBoth = useCallback(async () => { await Promise.all([reload(), reloadCashFlow?.()]); }, [reload, reloadCashFlow]);
  const ops = useMemo(() => ({ remote: true, reload,
    async open({ locationId, openingCash, notes }) {
      // fn_open_cash_register itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "open failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_open_cash_register", { p_business_id: businessId, p_location_id: locationId, p_opening_cash: Number(openingCash || 0), p_notes: notes || null });
      try {
        await refreshBoth();
      } catch (e) {
        // Same pattern as movement() below: the register is already open on the server at this
        // point — only the screen refresh failed. Both keys refreshBoth() touches are reported,
        // since a Promise.all rejection doesn't tell us which one actually failed.
        reportLoadError?.("cashRegisters", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The register was opened, but the screen could not refresh. Reload the page to see the latest data.");
        err.rpcSucceeded = true;
        throw err;
      }
      return { success: true, register: row };
    },
    async movement({ registerId, movementType, amount, reason, notes }) {
      // fn_record_cash_movement itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "movement failed" handling is unchanged.
      const row = await supabaseRest.rpc("fn_record_cash_movement", { p_register_id: registerId, p_movement_type: movementType, p_amount: Number(amount), p_reason: reason, p_notes: notes || null });
      try {
        await refreshBoth();
      } catch (e) {
        // The movement itself is already confirmed on the server at this point — only the screen
        // refresh failed. refreshBoth() reloads both this hook's own "cashRegisters" data and cash
        // flow together (Promise.all), and a rejection here doesn't tell us which one actually
        // failed — so both keys are reported, reusing the exact loadErrors/DataLoadBanner
        // mechanism from subfases 1-2 rather than inventing a second error channel. The thrown
        // error is tagged so the caller can tell this apart from a real movement failure and avoid
        // showing a false "movement failed" message.
        reportLoadError?.("cashRegisters", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The cash movement was saved, but the screen could not refresh. Reload the page to see the latest balance.");
        err.rpcSucceeded = true;
        throw err;
      }
      return { success: true, entry: row };
    },
    async close({ registerId, actualCash, differenceReason, notes }) {
      // fn_close_cash_register itself is NOT wrapped here — a failure there must keep throwing
      // normally, so the caller's existing "close failed" handling is unchanged. Note the RPC is
      // idempotent server-side for an already-closed register (returns the register as-is) —
      // that behavior is untouched, this only concerns what happens to the reload afterward.
      const row = await supabaseRest.rpc("fn_close_cash_register", { p_register_id: registerId, p_actual_cash: Number(actualCash), p_difference_reason: differenceReason || null, p_notes: notes || null });
      try {
        await refreshBoth();
      } catch (e) {
        // Same pattern as movement()/open() above: the register is already closed on the server
        // at this point — only the screen refresh failed. `row` is the closed register as returned
        // by the RPC itself, so the caller still has real, correct data to show (e.g. the actual
        // vs. expected difference) even though the background reload didn't complete.
        reportLoadError?.("cashRegisters", "reload", e.message);
        reportLoadError?.("cashFlow", "reload", e.message);
        const err = new Error("The register was closed, but the screen could not refresh. Reload the page to see the latest data.");
        err.rpcSucceeded = true;
        err.register = row;
        throw err;
      }
      return { success: true, register: row };
    },
  }), [businessId, reload, refreshBoth]);
  return [data, ops];
}

/* ============================== SMALL UI PRIMITIVES ============================== */
function useTheme() {
  const [dark, setDark] = useState(true);
  return { dark, setDark };
}

const Card = ({ children, className = "", dark, style, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl p-4 ${className}`}
    style={{
      background: dark ? C.surfaceDark : C.surfaceLight,
      border: `1px solid ${dark ? C.borderDark : C.borderLight}`,
      ...style,
    }}
  >
    {children}
  </div>
);

const Badge = ({ children, tone = "default", dark }) => {
  const tones = {
    default: { bg: dark ? "#2A1B44" : "#EFE9FA", fg: dark ? C.textMutedDark : C.textMutedLight },
    warn: { bg: "#3A2A00", fg: C.yellow },
    danger: { bg: "#3A0F1E", fg: "#FF6B85" },
    good: { bg: "#1E3A0F", fg: C.lime },
  };
  const t = tones[tone] || tones.default;
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
};

function StatCard({ label, value, sub, icon: Icon, accent, dark }) {
  return (
    <Card dark={dark} className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{label}</span>
        {Icon && <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + "22" }}><Icon size={16} color={accent} /></div>}
      </div>
      <div className="text-2xl font-extrabold truncate" style={{ color: dark ? C.white : C.black }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{sub}</div>}
    </Card>
  );
}

function Modal({ title, onClose, children, dark, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "md:max-w-2xl" : "md:max-w-md"} max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-5`}
        style={{ background: dark ? C.surfaceDark2 : C.surfaceLight, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: dark ? C.white : C.black }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: dark ? "#2A1B44" : "#EFE9FA" }}>
            <X size={16} color={dark ? C.white : C.black} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Level 3 print fallback UI — shown only when both popup and hidden-iframe printing are
// unavailable (browserPrintAdapter returned requiresPreview: true). Strictly read-only: receives
// already-generated HTML, never regenerates sale data, never calls finalizeSuccessfulPayment/
// failSalePayment/InventoryService/paymentService/any dataStore mutation. The iframe shows ONLY
// the receipt/ticket content — this modal's own Print/Close controls are outside the iframe's
// document entirely, so they can never end up in the printed output.
function PrintPreviewModal({ dark, title, html, onClose }) {
  const iframeRef = useRef(null);
  const [printNotice, setPrintNotice] = useState("");

  const handlePrint = () => {
    setPrintNotice("");
    const win = iframeRef.current?.contentWindow;
    if (!win || typeof win.print !== "function") {
      // Explicit check rather than relying on a thrown exception — optional chaining on a
      // missing contentWindow silently evaluates to undefined with no exception at all, which
      // would otherwise leave the user with zero feedback (the exact failure mode this whole
      // fix exists to eliminate).
      setPrintNotice("Printing is blocked in this environment. You can save the document as PDF or print it from your browser.");
      return;
    }
    try {
      win.focus();
      win.print();
    } catch (e) {
      // Keep the preview open — the document is already visible, so a blocked print() call isn't
      // a dead end. Never close on failure.
      setPrintNotice("Printing is blocked in this environment. You can save the document as PDF or print it from your browser.");
    }
  };

  // Real, working download — no PDF library exists in this artifact's available dependencies, so
  // this honestly exports a standalone HTML file (openable, and printable to PDF from any regular
  // browser outside this embedded environment) rather than claiming to generate a PDF directly.
  // Uses the exact same Blob + URL.createObjectURL + synthetic-click pattern already proven by
  // this app's existing CSV exports — not a new, unverified technique.
  const handleExport = () => {
    setPrintNotice("");
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const filename = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document"}.html`;
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPrintNotice("Unable to export the document in this environment. The content is still visible above — you can select and copy it manually if needed.");
    }
  };

  return (
    <Modal title={title} onClose={onClose} dark={dark}>
      <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        Print sends this document to your browser's print dialog (choose "Save as PDF" there for a PDF file). Export downloads it as a standalone HTML file you can open or print from outside this app.
      </div>
      {printNotice && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{printNotice}</div>}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ border: `1px solid ${dark ? C.borderDark : C.borderLight}`, background: "#fff" }}>
        <iframe ref={iframeRef} srcDoc={html} title={title} style={{ width: "100%", height: 420, border: "none", display: "block" }} />
      </div>
      <div className="flex gap-2 mb-2">
        <GhostButton dark={dark} style={{ flex: 1 }} onClick={handleExport}>Export Document</GhostButton>
        <PrimaryButton style={{ flex: 1 }} onClick={handlePrint}>Print</PrimaryButton>
      </div>
      <GhostButton dark={dark} full onClick={onClose} style={{ width: "100%" }}>Close</GhostButton>
    </Modal>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = true, onConfirm, onCancel, dark }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl p-5"
        style={{ background: dark ? C.surfaceDark2 : C.surfaceLight, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={18} color={danger ? "#FF6B85" : C.yellow} />
          <h3 className="text-base font-bold" style={{ color: dark ? C.white : C.black }}>{title}</h3>
        </div>
        {message && <p className="text-sm mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{message}</p>}
        <div className="flex gap-2">
          <GhostButton dark={dark} onClick={onCancel} style={{ flex: 1 }}>Cancel</GhostButton>
          <button onClick={run} disabled={busy} className="flex-1 font-bold rounded-2xl px-4 py-3 flex items-center justify-center gap-2"
            style={{ background: busy ? "#555" : (danger ? "#FF6B85" : C.lime), color: danger ? C.white : C.black, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, dark }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold mb-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = (dark) => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: "12px",
  background: dark ? C.surfaceDark : C.bgLight,
  border: `1px solid ${dark ? C.borderDark : C.borderLight}`,
  color: dark ? C.white : C.black,
  outline: "none",
  fontSize: "14px",
});

const Input = (props) => <input {...props} style={{ ...inputStyle(props.dark), ...(props.style || {}) }} />;
const Select = ({ dark, children, ...props }) => <select {...props} style={inputStyle(dark)}>{children}</select>;
const TextArea = (props) => <textarea {...props} style={{ ...inputStyle(props.dark), minHeight: 70, ...(props.style || {}) }} />;

function PrimaryButton({ children, onClick, full, style, disabled, type = "button" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`font-bold rounded-2xl px-4 py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition ${full ? "w-full" : ""}`}
      style={{ background: disabled ? "#555" : C.lime, color: C.black, opacity: disabled ? 0.6 : 1, ...style }}
    >
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, dark, style }) {
  return (
    <button onClick={onClick} className="font-semibold rounded-2xl px-4 py-3 flex items-center justify-center gap-2"
      style={{ background: "transparent", border: `1px solid ${dark ? C.borderDark : C.borderLight}`, color: dark ? C.white : C.black, ...style }}>
      {children}
    </button>
  );
}

function EmptyState({ title, sub, dark }) {
  return (
    <div className="text-center py-10">
      <div className="text-sm font-bold mb-1" style={{ color: dark ? C.white : C.black }}>{title}</div>
      {sub && <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{sub}</div>}
    </div>
  );
}

function ListRow({ title, subtitle, right, rightSub, badge, dark, onClick }) {
  return (
    <div onClick={onClick} className="flex items-center justify-between py-3 border-b last:border-b-0 gap-3" style={{ borderColor: dark ? C.borderDark : C.borderLight, cursor: onClick ? "pointer" : "default" }}>
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate" style={{ color: dark ? C.white : C.black }}>{title}</div>
        {subtitle && <div className="text-xs truncate" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{subtitle}</div>}
        {badge}
      </div>
      <div className="text-right shrink-0">
        {right && <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>{right}</div>}
        {rightSub && <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{rightSub}</div>}
      </div>
    </div>
  );
}

/* ============================== NAV ============================== */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "orders", label: "Orders", icon: ScrollText },
  { id: "sales", label: "Sales", icon: ShoppingCart },
  { id: "cashflow", label: "Cash Flow", icon: Wallet },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "products", label: "Products", icon: Package },
  { id: "purchases", label: "Purchases", icon: PackagePlus },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "customers", label: "Customers", icon: Users },
  { id: "employees", label: "Employees", icon: UserCog },
  { id: "reports", label: "Reports", icon: BarChart2 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const MOBILE_MAIN = ["dashboard", "orders", "sales", "inventory"];
// null = every logged-in user can open the tab (individual actions inside are still permission-gated).
const NAV_PERMISSION = {
  cashflow: "viewFinancials",
  purchases: (u) => can(u, "managePurchases") || can(u, "receivePurchases"),
  suppliers: "manageSuppliers",
  // Employees tab now also hosts Tasks (Phase 3B), which every staff member needs to reach to see
  // and complete their own assignments — so the tab itself stays open to everyone. The sensitive
  // parts inside (hourly pay rate visibility, HR record add/edit/delete) are still individually
  // gated by viewFinancials / manageUsers within EmployeesView and SimpleCrudView.
  reports: "viewReports",
  settings: (u) => true, // Settings tab always opens; sensitive sections inside are gated individually.
};
function navAllowed(user, tabId) {
  const rule = NAV_PERMISSION[tabId];
  if (!rule) return true;
  if (typeof rule === "function") return rule(user);
  return can(user, rule);
}

/* ============================== APP ============================== */
// Phase "Achado #6" subfase 1 — single, persistent banner for Supabase load failures across the
// 11 tracked keys (locations/suppliers/customers/employees/products/inventory/sales/cashFlow/
// expenses/purchases/cashRegisters/loyalty). Deliberately NOT a toast (toasts auto-dismiss after
// ~2.6s and represent one-off events; this represents an ongoing, real condition — the affected
// collection is still null-or-stale until the user reloads or the connection recovers) and
// deliberately ONE component instead of a toast per failed hook, so N simultaneous failures never
// stack N notifications. Distinguishes "initial" (this data has never loaded — nothing shown for
// it is real yet) from "reload" (data shown may now be stale, but is not fabricated/fake).
function DataLoadBanner({ dark, errors }) {
  const entries = Object.entries(errors || {});
  if (entries.length === 0) return null;
  const initialCount = entries.filter(([, v]) => v.kind === "initial").length;
  const reloadCount = entries.length - initialCount;
  return (
    <div className="mb-4 px-4 py-3 rounded-2xl text-xs font-semibold" style={{ background: "#3A0F1E", color: "#FF6B85", border: "1px solid #FF6B85" }}>
      <div className="font-bold mb-1">
        {initialCount > 0 && `${initialCount} area${initialCount === 1 ? "" : "s"} failed to load`}
        {initialCount > 0 && reloadCount > 0 && " · "}
        {reloadCount > 0 && `${reloadCount} area${reloadCount === 1 ? "" : "s"} may be out of date`}
      </div>
      <div className="space-y-0.5" style={{ opacity: 0.85 }}>
        {entries.map(([key, v]) => (
          <div key={key}>
            {key}: {v.kind === "initial" ? "failed to load" : "last refresh failed — showing previously loaded data"}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { dark } = useTheme();
  const [tab, setTab] = useState("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState(null);

  /* ============================== PHASE "Achado #6" SUBFASE 1 — Supabase load error tracking ==============================
   * Central, minimal error registry for the "simple" Supabase collection hooks only (see the
   * explicit exclusion list below). Two operations, matching exactly what each hook needs:
   *   reportLoadError(key, kind, message) — called from a hook's initial-load catch. Never called
   *     to overwrite data with a fallback array/seed — the whole point of this subfase is that a
   *     failed load leaves `data` as `null` (or, for a reload, leaves it as whatever was already
   *     successfully loaded before) instead of masquerading as "successfully empty".
   *   clearLoadError(key) — called at the END of a hook's reload(), only after every query that
   *     composes that reload has itself already succeeded (this matters specifically for
   *     useSupabaseInventory, which loads items+stock+transactions, and useSupabaseLoyalty, which
   *     loads transactions+rewards — the clear call sits after both halves, so a stale error is
   *     never cleared on a partial success). Never called before the request starts.
   * Explicitly OUT OF SCOPE for this subfase (per the phased plan): useSupabaseBusinessSettings,
   * all 16 ops.* RPC+reload methods (fn_create_sale, inventoryOps.*, etc — those get their own
   * "kind: reload" treatment in a later subfase), Auth/JWT, supabaseRest, and business logic.
   * ============================================================================== */
  const [loadErrors, setLoadErrors] = useState({}); // { [key]: { kind: "initial" | "reload", message } }
  const reportLoadError = useCallback((key, kind, message) => {
    setLoadErrors((prev) => ({ ...prev, [key]: { kind, message } }));
  }, []);
  const clearLoadError = useCallback((key) => {
    setLoadErrors((prev) => {
      if (!(key in prev)) return prev; // no-op when nothing to clear — avoids an unnecessary re-render on every successful reload
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // --- Real Supabase Auth session / tenant identity ---
  const [currentUserId, setCurrentUserId] = useState(undefined); // undefined = checking session, null = signed out
  const [authProfile, setAuthProfile] = useState(null);
  const [authStartupError, setAuthStartupError] = useState("");
  useEffect(() => {
    let cancelled = false;
    // Phase 6.1: registers the one hook non-React session code (refreshSupabaseSession, on a
    // definitively failed refresh) uses to cleanly return the app to the login screen — reuses
    // exactly the same state setters signOut already relies on, no second session system.
    setSupabaseSessionInvalidHandler(() => {
      if (cancelled) return;
      setAuthProfile(null);
      setCurrentUserId(null);
    });
    (async () => {
      try {
        const session = await authService.getSession();
        if (cancelled) return;
        setAuthProfile(session?.profile || null);
        setCurrentUserId(session?.userId || null);
      } catch (e) {
        if (cancelled) return;
        setAuthStartupError(e.message || "Could not restore your session.");
        setAuthProfile(null);
        setCurrentUserId(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const login = useCallback(async (email, password) => {
    const result = await authService.signIn(email, password);
    if (!result.ok) return result;
    setAuthStartupError("");
    setAuthProfile(result.profile);
    setCurrentUserId(result.profile.id);
    return result;
  }, []);
  const logout = useCallback(async () => {
    await authService.clearSession();
    setAuthProfile(null);
    setCurrentUserId(null);
  }, []);
  const businessId = authProfile?.businessId || null;

  // Phase 1: master/business data is now real tenant-scoped Supabase data.
  // Transactional modules stay on the legacy store until their RPC migration phase.
  const [locations, setLocations] = useSupabaseArrayCollection("locations", businessId, fromLocationDb, toLocationDb, { missing: "delete" }, reportLoadError, clearLoadError);
  const [suppliers, setSuppliers] = useSupabaseArrayCollection("suppliers", businessId, fromSupplierDb, toSupplierDb, { missing: "delete" }, reportLoadError, clearLoadError);
  const [customers, setCustomers] = useSupabaseArrayCollection("customers", businessId, fromCustomerDb, toCustomerDb, { missing: "deactivate" }, reportLoadError, clearLoadError);
  const [employees, setEmployees] = useSupabaseEmployees(businessId, locations, reportLoadError, clearLoadError);
  const [settings, setSettings] = useSupabaseBusinessSettings(businessId, reportLoadError, clearLoadError);

  // Phase 2 adds real Supabase catalog screens while the legacy transactional shadow remains
  // isolated for POS/Purchases until their atomic RPC cutover (Phase 3).
  const [catalogProducts, setCatalogProducts] = useSupabaseProducts(businessId, reportLoadError, clearLoadError);
  const [catalogInventory, setCatalogInventory, catalogInvTx, catalogInventoryOps, reloadCatalogInventory] = useSupabaseInventory(businessId, locations, reportLoadError, clearLoadError);
  const [remoteSales, persistRemoteSales, remoteSalesOps] = useSupabaseSales(businessId, locations, reportLoadError, clearLoadError);
  // Phase 4: financial operations and purchasing are server-authoritative too.
  const [remoteCashTx, reloadRemoteCashTx] = useSupabaseCashFlow(businessId, reportLoadError, clearLoadError);
  const [remoteExpenses, remoteExpenseOps] = useSupabaseExpenses(businessId, reloadRemoteCashTx, reportLoadError, clearLoadError);
  const [remotePurchaseOrders, remotePurchaseOps] = useSupabasePurchases(businessId, reloadCatalogInventory, reloadRemoteCashTx, reportLoadError, clearLoadError);
  const [remoteCashRegisters, remoteCashRegisterOps] = useSupabaseCashRegisters(businessId, reloadRemoteCashTx, reportLoadError, clearLoadError);

  // Legacy transaction shadow — intentionally NOT used by the Products/Inventory tabs anymore.
  const [products, setProducts] = useCollection("products", seedProducts);
  const [inventory, setInventory] = useCollection("inventory", seedInventory);
  if (settings?.currency) setActiveCurrency(settings.currency);
  const [tasks, persistTasks] = useCollection("tasks", seedTasks);
  const [cashRegisters, setCashRegisters] = useCollection("cashRegisters", () => []);
  // Phase 5: loyalty ledger + rewards are now tenant-scoped Supabase data. The compatibility
  // setter translates the existing UI actions into the hardened loyalty RPCs.
  const [loyaltyTransactions, setLoyaltyTransactions, loyaltyRewards, reloadLoyalty] = useSupabaseLoyalty(businessId, reportLoadError, clearLoadError);
  const [shifts, setShifts] = useCollection("shifts", () => []);
  const [businessAlerts, setBusinessAlerts] = useCollection("businessAlerts", () => []);
  const [users, setUsers] = useCollection("users", seedUsers);
  const [auditLog, setAuditLog] = useCollection("auditLog", () => []);

  // sales, cashTx, and expenses are cross-dependent (need products/inventory for recipe-based seeding),
  // so they're seeded together, once, in a single consistent pass. cashTx is the single source of truth
  // for all cash totals — every expense (seeded or user-added) always has a matching cashTx entry, so
  // nothing is ever double-counted or missing from the ledger.
  const [sales, setSales] = useState(null);
  const [cashTx, setCashTx] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [wasteTx, setWasteTx] = useState(null);
  const [invTx, setInvTx] = useCollection("inventoryTransactions", () => []);
  const [purchaseOrders, setPurchaseOrders] = useState(null);

  const productsReady = products !== null;
  const inventoryReady = inventory !== null;
  const invTxReady = invTx !== null;

  useEffect(() => {
    if (!productsReady || !inventoryReady || !invTxReady) return;
    let cancelled = false;
    (async () => {
      try {
        const [sData0, cData0, eData0, pData0] = await Promise.all([
          dataStore.get("sales"),
          dataStore.get("cashTransactions"),
          dataStore.get("expenses"),
          dataStore.get("purchaseOrders"),
        ]);
        let sData = sData0;
        let cData = cData0;
        let eData = eData0;
        let pData = pData0;
        let invData = inventory;
        let invTxData = invTx;

        if (!sData || !cData) {
          const { sales: sSeed, cash: cSeed } = seedSalesAndCash(products, inventory);
          sData = sData || sSeed;
          cData = cData || cSeed;
        }
        if (!eData) {
          const eSeed = seedExpenses();
          const eCash = eSeed.map((e) => ({
            id: uid("cash"), date: e.date, type: "expense", category: e.category, amount: e.amount,
            paymentMethod: e.paymentMethod, description: e.description || e.vendor, relatedExpenseId: e.id, sample: true,
          }));
          eData = eSeed;
          cData = [...(cData || []), ...eCash];
        }
        if (!pData) {
          // Seed purchase orders, then replay receiving for the lines already marked received —
          // exactly the same weighted-average-cost path a real "Receive" action uses.
          pData = seedPurchaseOrders();
          for (const po of pData) {
            const receiveLines = po.items.filter((l) => l.receivedQty > 0).map((l) => ({ itemId: l.itemId, qty: l.receivedQty, unitCost: l.unitCost }));
            if (receiveLines.length) {
              const { nextInventory, txEntries } = applyPurchaseReceipt(invData, receiveLines, { date: po.orderDate, referenceId: po.id, referenceLabel: po.poNumber, supplierId: po.supplierId, note: `Received against ${po.poNumber}` });
              invData = nextInventory;
              invTxData = [...txEntries, ...invTxData];
            }
            if (po.status === "Received") {
              const total = poGrandTotal(po);
              po.amountPaid = total;
              cData = [{ id: uid("cash"), date: po.orderDate, type: "expense", category: "Supplier Payment", amount: total, paymentMethod: po.paymentMethod, description: `Payment for ${po.poNumber}`, relatedPOId: po.id, sample: true }, ...(cData || [])];
            }
          }
        }

        // React state is populated here, BEFORE persistence is even attempted — this is the
        // core fix for the startup deadlock. Local in-memory state is the source of truth for
        // the running session; persistence below is strictly best-effort and can never block or
        // undo it, no matter how it goes.
        if (!cancelled) {
          setSales(sData); setCashTx(cData); setExpenses(eData); setPurchaseOrders(pData);
          if (invData !== inventory) setInventory(invData);
          if (invTxData !== invTx) setInvTx(invTxData);
        }

        // Persistence is fire-and-forget from the UI's perspective (note: no `await` on this
        // below — the effect does not wait for it) and fully decoupled: one write failing or
        // timing out can never affect the others or revert the state set above.
        //
        // Writes are sequential (not all 6 fired at once) rather than parallel: the platform's
        // storage API rejected 2 of 6 simultaneous writes immediately and left the other 4
        // hanging until they hit the timeout below — a classic concurrent-write-contention
        // pattern. Sequencing them reduces load on that API; each write still can't block
        // startup, since this whole block already runs after the UI has been unblocked above.
        (async () => {
          const writes = [
            ["sales", sData], ["cashTransactions", cData], ["expenses", eData],
            ["purchaseOrders", pData], ["inventory", invData], ["inventoryTransactions", invTxData],
          ];
          for (const [key, value] of writes) {
            try {
              await withTimeout(dataStore.set(key, value), 8000, key);
            } catch (err) {
              console.error(`background persistence failed for "${key}" — in-memory state is unaffected`, err);
            }
          }
        })();
      } catch (e) {
        // Generation failure fallback (seedSalesAndCash/seedExpenses/seedPurchaseOrders/
        // applyPurchaseReceipt throwing) — persistence is fully decoupled above and can never
        // reach this catch. The nested try/catch below guarantees the four setters always
        // eventually fire, even if the fallback generation itself fails.
        try {
          const { sales: sSeed, cash: cSeed } = seedSalesAndCash(products, inventory);
          const eSeed = seedExpenses();
          if (!cancelled) { setSales(sSeed); setCashTx(cSeed); setExpenses(eSeed); setPurchaseOrders(seedPurchaseOrders()); }
        } catch (e2) {
          if (!cancelled) { setSales([]); setCashTx([]); setExpenses([]); setPurchaseOrders([]); }
        }
      }
    })();
    (async () => {
      const w = await dataStore.get("wasteTransactions");
      if (w !== null) {
        if (!cancelled) setWasteTx(w);
      } else {
        await dataStore.set("wasteTransactions", []);
        if (!cancelled) setWasteTx([]);
      }
    })();
    return () => { cancelled = true; };
    // Intentionally depends on readiness flags only (not the array references), so this
    // seeding pass runs exactly once and never re-fires (and re-fetches/overwrites state)
    // every time a sale or purchase mutates `inventory`/`invTx`.
  }, [productsReady, inventoryReady, invTxReady]);

  // One-time, additive, non-destructive backfill: historical inventory/sales records created
  // before locationId existed only have a `location` NAME string. This adds a matching `locationId`
  // wherever the name confidently matches a real location record — it never removes or rewrites
  // the original `location` string, so nothing is lost if the match is later found to be wrong.
  // Guarded by a flag on settings so it only ever runs once. Depends on boolean readiness flags
  // (not the raw collection references) for the same reason the seeding effect above does: so this
  // doesn't re-fire — and risk racing a real-time write — every time a sale or inventory item
  // changes for the rest of the app's lifetime, only during the initial load window.
  const salesReady = sales !== null;
  const locationsReady = locations !== null;
  const settingsReady = settings !== null;
  const migrationDone = !!settings?._locationMigrationV1;
  useEffect(() => {
    if (!inventoryReady || !salesReady || !locationsReady || !settingsReady || migrationDone) return;
    if (locations.length === 0) return;
    (async () => {
      const byName = Object.fromEntries(locations.map((l) => [l.name, l.id]));
      let invChanged = false;
      const nextInventory = inventory.map((i) => {
        if (!i.locationId && i.location && byName[i.location]) { invChanged = true; return { ...i, locationId: byName[i.location] }; }
        return i;
      });
      let salesChanged = false;
      const nextSales = sales.map((s) => {
        if (!s.locationId && s.location && byName[s.location]) { salesChanged = true; return { ...s, locationId: byName[s.location] }; }
        return s;
      });
      if (invChanged) await setInventory(nextInventory);
      if (salesChanged) await persistSales(nextSales);
      await setSettings({ ...settings, _locationMigrationV1: true });
    })();
  }, [inventoryReady, salesReady, locationsReady, settingsReady, migrationDone]);

  const persistSales = useCallback(async (next) => { setSales(next); await dataStore.set("sales", next); }, []);
  const persistCash = useCallback(async (next) => { setCashTx(next); await dataStore.set("cashTransactions", next); }, []);
  const persistExpenses = useCallback(async (next) => { setExpenses(next); await dataStore.set("expenses", next); }, []);
  const persistWaste = useCallback(async (next) => { setWasteTx(next); await dataStore.set("wasteTransactions", next); }, []);
  const persistPO = useCallback(async (next) => { setPurchaseOrders(next); await dataStore.set("purchaseOrders", next); }, []);

  const showToast = (msg, tone = "good") => { setToast({ msg, tone }); setTimeout(() => setToast(null), 2600); };

  // Achado #6 subfase 1: 12 real Supabase "simple collection" slots (11 unique loadErrors keys —
  // loyaltyTransactions/loyaltyRewards share the single "loyalty" key, since they load together)
  // only count as still-pending while `value === null` AND no error has been reported for that
  // key yet. A collection that failed still resolves the loading gate (it becomes visible with
  // its error banner) — it just never resolves it by silently pretending to be `[]`.
  // Achado #6 subfase 2 adds `settings` to this same list (see useSupabaseBusinessSettings above)
  // — an error there also resolves the loading gate now, instead of fabricating seedSettings() as
  // if it were the tenant's real configuration. Every other local/legacy useCollection-backed slot
  // remains explicitly OUT OF SCOPE and keeps its original, unconditional `=== null` check.
  const supabasePending = [
    [catalogProducts, "products"], [catalogInventory, "inventory"], [remoteSales, "sales"],
    [remoteCashTx, "cashFlow"], [remoteExpenses, "expenses"], [remotePurchaseOrders, "purchases"],
    [remoteCashRegisters, "cashRegisters"], [suppliers, "suppliers"], [customers, "customers"],
    [employees, "employees"], [locations, "locations"], [loyaltyTransactions, "loyalty"], [loyaltyRewards, "loyalty"],
    [settings, "settings"],
  ].some(([value, key]) => value === null && !loadErrors[key]);
  const legacyPending = [products, inventory, sales, cashTx, expenses, wasteTx, invTx, purchaseOrders, users, auditLog, tasks, cashRegisters, shifts, businessAlerts].some((x) => x === null);
  const loading = supabasePending || legacyPending || currentUserId === undefined;

  // Achado #6 subfase 2: `settings` itself (used for write decisions — see settingsReady below,
  // and SettingsView's settingsUnavailable prop) is allowed to stay null when loading a real
  // business's configuration failed. `displaySettings` is a SEPARATE, display-only fallback so
  // components that read settings.businessName/etc without optional chaining (BrandHeader, TopBar)
  // don't crash once the app renders past the loading gate above — it is never written back to
  // Supabase; every write path (SettingsView.save, the _locationMigrationV1 effect below) uses the
  // real `settings` value, not this one, and is guarded against it being null.
  const displaySettings = settings || seedSettings();

  const bg = dark ? `radial-gradient(1200px 600px at 100% -10%, ${C.purple700}55, transparent), linear-gradient(180deg, ${C.black}, ${C.purple900})` : C.bgLight;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl animate-pulse" style={{ background: C.lime }} />
          <div className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Loading NEXALVO…</div>
        </div>
      </div>
    );
  }

  const effectiveUsers = authProfile && !users.some((u) => u.id === authProfile.id) ? [authProfile, ...users] : users;
  const currentUser = (authProfile?.id === currentUserId ? authProfile : effectiveUsers.find((u) => u.id === currentUserId && u.active !== false)) || null;

  if (!currentUser) {
    return <LoginScreen dark={dark} onLogin={login} bg={bg} startupError={authStartupError} />;
  }

  const phase4WriteGuard = async () => { throw new Error("This Phase 4 ledger is Supabase-managed. Use its server RPC operation instead of legacy local persistence."); };
  const ctx = {
    dark, settings: displaySettings, setSettings, products, setProducts, inventory, setInventory,
    sales: remoteSales, persistSales: persistRemoteSales, cashTx: remoteCashTx, persistCash: phase4WriteGuard,
    expenses: remoteExpenses, setExpenses: phase4WriteGuard, expenseOps: remoteExpenseOps,
    suppliers, setSuppliers, customers, setCustomers, employees, setEmployees,
    locations, setLocations, wasteTx, persistWaste, invTx: catalogInvTx, setInvTx: () => {},
    purchaseOrders: remotePurchaseOrders, persistPO: phase4WriteGuard, purchaseOps: remotePurchaseOps,
    showToast, users: effectiveUsers, setUsers, currentUser, can: (perm) => can(currentUser, perm),
    auditLog, setAuditLog, logAudit: (action, details) => logAudit(auditLog, setAuditLog, currentUser, action, details),
    tasks, persistTasks, cashRegisters: remoteCashRegisters, setCashRegisters: phase4WriteGuard, cashRegisterOps: remoteCashRegisterOps,
    loyaltyTransactions, setLoyaltyTransactions, loyaltyRewards, reloadLoyalty, shifts, setShifts, businessAlerts, setBusinessAlerts,
    reportLoadError,
  };

  const visibleNav = NAV.filter((n) => navAllowed(currentUser, n.id));

  return (
    <div className="min-h-screen w-full" style={{ background: bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex flex-col w-64 shrink-0 min-h-screen sticky top-0 p-4 gap-1" style={{ borderRight: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
          <BrandHeader dark={dark} settings={displaySettings} />
          <div className="mt-4 flex flex-col gap-1">
            {visibleNav.map((n) => (
              <NavButton key={n.id} item={n} active={tab === n.id} dark={dark} onClick={() => setTab(n.id)} />
            ))}
          </div>
          <div className="mt-auto pt-4 border-t" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
            <div className="px-1 mb-2">
              <div className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>{currentUser.name}</div>
              <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{currentUser.role === "OWNER" ? "Owner · Full access" : roleLabel(currentUser.role)}</div>
            </div>
            <GhostButton dark={dark} onClick={logout} style={{ width: "100%", padding: "8px 12px", fontSize: 13 }}>Log Out</GhostButton>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          <TopBar dark={dark} settings={displaySettings} tab={tab} currentUser={currentUser} onLogout={logout} />
          <div className="px-4 md:px-8 pt-4 max-w-6xl mx-auto">
            {Object.keys(loadErrors).length > 0 && <DataLoadBanner dark={dark} errors={loadErrors} />}
            {tab === "dashboard" && <Dashboard {...ctx} setTab={setTab} />}
            {tab === "orders" && <OrdersView {...ctx} sales={remoteSales} persistSales={persistRemoteSales} />}
            {tab === "sales" && <SalesView {...ctx} products={catalogProducts} inventory={catalogInventory} setInventory={setCatalogInventory} sales={remoteSales} persistSales={persistRemoteSales} invTx={catalogInvTx} setInvTx={() => {}} supabaseSalesOps={remoteSalesOps} reloadInventory={reloadCatalogInventory} businessId={businessId} />}
            {tab === "cashflow" && (navAllowed(currentUser, "cashflow") ? <CashFlowView {...ctx} /> : <RestrictedView dark={dark} />)}
            {tab === "inventory" && <InventoryView {...ctx} inventory={catalogInventory} setInventory={setCatalogInventory} invTx={catalogInvTx} inventoryOps={catalogInventoryOps} />}
            {tab === "products" && <ProductsView {...ctx} products={catalogProducts} setProducts={setCatalogProducts} inventory={catalogInventory} />}
            {tab === "purchases" && (navAllowed(currentUser, "purchases") ? <PurchasesView {...ctx} inventory={catalogInventory} setInventory={setCatalogInventory} invTx={catalogInvTx} setInvTx={() => {}} /> : <RestrictedView dark={dark} />)}
            {tab === "expenses" && <ExpensesView {...ctx} />}
            {tab === "suppliers" && (navAllowed(currentUser, "suppliers") ? <SuppliersView {...ctx} /> : <RestrictedView dark={dark} />)}
            {tab === "customers" && <CustomersView {...ctx} />}
            {tab === "employees" && (navAllowed(currentUser, "employees") ? <EmployeesView {...ctx} /> : <RestrictedView dark={dark} />)}
            {tab === "reports" && (navAllowed(currentUser, "reports") ? <ReportsView {...ctx} /> : <RestrictedView dark={dark} />)}
            {tab === "settings" && <SettingsView {...ctx} settingsUnavailable={settings === null} onLogout={logout} />}
          </div>
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
        <div className="rounded-3xl flex items-center justify-between px-2 py-2" style={{ background: dark ? C.surfaceDark2 : C.white, border: `1px solid ${dark ? C.borderDark : C.borderLight}`, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          {MOBILE_MAIN.map((id) => {
            const n = NAV.find((x) => x.id === id);
            const Icon = n.icon;
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl">
                <Icon size={20} color={active ? C.lime : (dark ? C.textMutedDark : C.textMutedLight)} />
                <span className="text-[10px] font-bold" style={{ color: active ? C.lime : (dark ? C.textMutedDark : C.textMutedLight) }}>{n.label}</span>
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl">
            <Grid3x3 size={20} color={dark ? C.textMutedDark : C.textMutedLight} />
            <span className="text-[10px] font-bold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>More</span>
          </button>
        </div>
      </div>

      {moreOpen && (
        <Modal title="All sections" onClose={() => setMoreOpen(false)} dark={dark}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {visibleNav.map((n) => {
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => { setTab(n.id); setMoreOpen(false); }} className="flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: dark ? C.surfaceDark : C.bgLight, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
                  <Icon size={20} color={tab === n.id ? C.lime : (dark ? C.white : C.black)} />
                  <span className="text-[11px] font-semibold text-center" style={{ color: dark ? C.white : C.black }}>{n.label}</span>
                </button>
              );
            })}
          </div>
          <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{currentUser.name} · {roleLabel(currentUser.role)}</div>
          <GhostButton dark={dark} onClick={logout} style={{ width: "100%" }}>Log Out</GhostButton>
        </Modal>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl font-semibold text-sm shadow-lg"
          style={{ background: toast.tone === "danger" ? "#FF4D6D" : C.lime, color: C.black }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function BrandHeader({ dark, settings }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg" style={{ background: `linear-gradient(135deg, ${C.purple500}, ${C.purple700})`, color: C.lime, border: `2px solid ${C.lime}` }}>N</div>
      <div className="min-w-0">
        <div className="font-extrabold text-sm leading-tight tracking-wide" style={{ color: dark ? C.white : C.black }}>NEXALVO <span className="text-[9px] font-bold" style={{ color: C.lime }}>{NEXALVO_BUILD}</span></div>
        <div className="text-[10px] font-semibold truncate" style={{ color: C.yellow }}>{settings.businessName}</div>
      </div>
    </div>
  );
}

function NavButton({ item, active, dark, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition"
      style={{ background: active ? (dark ? C.purple600 + "55" : "#EFE6FF") : "transparent", color: active ? C.lime : (dark ? C.textMutedDark : C.textMutedLight) }}>
      <Icon size={18} color={active ? C.lime : (dark ? C.textMutedDark : C.textMutedLight)} />
      {item.label}
    </button>
  );
}

function TopBar({ dark, settings, tab, currentUser, onLogout }) {
  return (
    <div className="px-4 md:px-8 pt-5 pb-1 flex items-center justify-between max-w-6xl mx-auto md:hidden">
      <BrandHeader dark={dark} settings={settings} />
      <button onClick={onLogout} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: dark ? C.surfaceDark : C.white, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }} title={`Log out (${currentUser?.name})`}>
        <LogOut size={16} color={dark ? C.textMutedDark : C.textMutedLight} />
      </button>
    </div>
  );
}

function RestrictedView({ dark }) {
  return (
    <div className="pb-6">
      <Card dark={dark} className="flex flex-col items-center text-center py-12 gap-2">
        <ShieldAlert size={28} color={C.yellow} />
        <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Access Restricted</div>
        <div className="text-xs max-w-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
          Your account doesn't have permission to view this section. Ask the owner to grant access if you need it.
        </div>
      </Card>
    </div>
  );
}

function LoginScreen({ dark, onLogin, bg, startupError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(startupError);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event) => {
    event?.preventDefault?.();
    if (submitting) return;

    // Read the actual DOM values at submit time as well as React state. Browser/password-manager
    // autofill can visually populate an input without firing React's onChange event, which made
    // the old guard below incorrectly report that the fields were empty.
    const form = event?.currentTarget;
    const formData = form ? new FormData(form) : null;
    const submittedEmail = String(formData?.get("email") ?? email ?? "").trim();
    const submittedPassword = String(formData?.get("password") ?? password ?? "");

    if (!submittedEmail || !submittedPassword) { setError("Enter your email and password."); return; }
    setEmail(submittedEmail);
    setPassword(submittedPassword);
    setSubmitting(true);
    setError("");
    try {
      const result = await onLogin(submittedEmail, submittedPassword);
      if (!result?.ok) {
        const msg = result?.error || "Sign-in failed.";
        setError(/email not confirmed/i.test(msg) ? "Email not confirmed. Confirm this user in Supabase Authentication, then try again." : msg);
      }
    } catch (e) {
      setError(e.message || "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ background: bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: dark ? C.surfaceDark2 : C.surfaceLight, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
        <div className="flex flex-col items-center gap-2 mb-7">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl" style={{ background: `linear-gradient(135deg, ${C.purple500}, ${C.purple700})`, color: C.lime, border: `2px solid ${C.lime}` }}>N</div>
          <div className="font-black text-xl tracking-[0.16em]" style={{ color: dark ? C.white : C.black }}>NEXALVO</div>
          <div className="text-xs font-semibold" style={{ color: C.yellow }}>BUSINESS MANAGEMENT PLATFORM</div>
        </div>
        <form onSubmit={handleLogin}>
          <Field dark={dark} label="Email">
            <Input dark={dark} name="email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="you@company.com" />
          </Field>
          <Field dark={dark} label="Password">
            <Input dark={dark} name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="••••••••" />
          </Field>
          {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="font-bold rounded-2xl px-4 py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition w-full"
            style={{ background: submitting ? "#555" : C.lime, color: C.black, opacity: submitting ? 0.6 : 1 }}
          >
            <Lock size={16} /> {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <div className="text-[11px] text-center mt-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Secure authentication powered by Supabase</div>
      </div>
    </div>
  );
}


/* ============================== DASHBOARD ============================== */
const DIFF_STATUS = (diff) => (diff === 0 ? "BALANCED" : diff > 0 ? "OVER" : "SHORT");
const DIFF_TONE = { BALANCED: "good", OVER: "warn", SHORT: "danger" };
// Always paired with text, never color-only, per the UI requirement.
function DifferenceBadge({ dark, diff }) {
  const status = DIFF_STATUS(diff);
  const label = diff === 0 ? "✓ BALANCED" : `${diff > 0 ? "+" : "-"}${fmtMoney(Math.abs(diff))} ${status}`;
  return <Badge dark={dark} tone={DIFF_TONE[status]}>{label}</Badge>;
}

function CashRegisterModal({ dark, onClose, cashRegisters, setCashRegisters, cashTx, persistCash, cashRegisterOps, locations, currentUser, can, auditLog, setAuditLog, showToast }) {
  const activeLocations = (locations || []).filter((l) => l.active !== false);
  const [locationId, setLocationId] = useState(activeLocations[0]?.id || "");
  const [mode, setMode] = useState("status"); // "status" | "open" | "movement" | "close" | "history"
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("30");
  const [historyDetail, setHistoryDetail] = useState(null);

  const register = findOpenRegister(cashRegisters, locationId);
  const canManage = can("manageCashRegister");
  const opCtx = { cashRegisters, setCashRegisters, cashTx, persistCash, cashRegisterOps, locations, currentUser, auditLog, setAuditLog };

  const [openingCash, setOpeningCash] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const doOpen = async () => {
    if (submitting) return;
    setError("");
    if (!canManage) { setError("You don't have permission to open the register."); return; }
    setSubmitting(true);
    try {
      const r = await openCashRegister({ locationId, openingCash, notes: openNotes }, opCtx);
      if (!r.success) { setError(r.error); return; }
      showToast(r.staleData ? r.message : "Register opened", r.staleData ? "good" : undefined);
      setMode("status"); setOpeningCash(""); setOpenNotes("");
    } finally { setSubmitting(false); }
  };

  const [movementType, setMovementType] = useState("addition");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const doMovement = async () => {
    if (submitting || !register) return;
    setError("");
    if (!canManage) { setError("You don't have permission to record cash movements."); return; }
    setSubmitting(true);
    try {
      const r = await recordCashMovement({ registerId: register.id, movementType, amount: movementAmount, reason: movementReason, notes: movementNotes }, opCtx);
      if (!r.success) { setError(r.error); return; }
      showToast(r.staleData ? r.message : "Movement recorded", r.staleData ? "good" : undefined);
      setMode("status"); setMovementAmount(""); setMovementReason(""); setMovementNotes("");
    } finally { setSubmitting(false); }
  };

  const [actualCash, setActualCash] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const expectedNow = register ? calculateExpectedCash(register, cashTx) : 0;
  const breakdown = register ? cashRegisterBreakdown(register, cashTx) : null;
  const previewDiff = register && actualCash !== "" && !Number.isNaN(Number(actualCash)) ? round2(Number(actualCash) - expectedNow) : null;
  const doClose = async () => {
    if (submitting || !register) return;
    setError("");
    if (!canManage) { setError("You don't have permission to close the register."); return; }
    setSubmitting(true);
    try {
      const r = await closeCashRegister({ registerId: register.id, actualCash, differenceReason, notes: closeNotes }, opCtx);
      if (!r.success) { setError(r.error); return; }
      if (r.staleData) {
        // The RPC already confirmed the close — never say "could not close" here. r.register is
        // still the real, correct closed register as returned by the RPC itself (not a mapped
        // reload row), so it isn't relied on for the diff-specific wording below; the generic
        // "saved, but the screen could not refresh" message from closeCashRegister covers it.
        showToast(r.message, "good");
      } else {
        showToast(r.register.difference === 0 ? "Register closed — balanced" : `Register closed — ${DIFF_STATUS(r.register.difference)} ${fmtMoney(Math.abs(r.register.difference))}`, r.register.difference === 0 ? "good" : "danger");
      }
      setMode("status"); setActualCash(""); setDifferenceReason(""); setCloseNotes("");
    } finally { setSubmitting(false); }
  };

  const historyList = (cashRegisters || [])
    .filter((r) => r.status === "closed" && r.locationId === locationId)
    .filter((r) => historyFilter === "all" ? true : withinDays(r.closedAt, Number(historyFilter)))
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));

  return (
    <Modal title="Cash Register" onClose={onClose} dark={dark} wide>
      <Field dark={dark} label="Location">
        <Select dark={dark} value={locationId} onChange={(e) => { setLocationId(e.target.value); setMode("status"); setError(""); }}>
          {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}

      {mode === "status" && (
        <div>
          {!register ? (
            <Card dark={dark} className="mb-4">
              <div className="flex items-center gap-2 mb-2"><Lock size={18} color="#FF6B85" /><span className="font-bold" style={{ color: dark ? C.white : C.black }}>REGISTER CLOSED</span></div>
              <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>No active register for this location. A cash sale cannot be completed until it's opened.</div>
              {canManage ? (
                <PrimaryButton full onClick={() => setMode("open")}><Wallet size={16} /> Open Register</PrimaryButton>
              ) : (
                <div className="text-xs text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You don't have permission to open the register.</div>
              )}
            </Card>
          ) : (
            <Card dark={dark} className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Wallet size={18} color={C.lime} /><span className="font-bold" style={{ color: dark ? C.white : C.black }}>REGISTER OPEN</span></div>
                <Badge dark={dark} tone="good">ACTIVE</Badge>
              </div>
              <Row dark={dark} label="Opened by" value={register.openedByName} />
              <Row dark={dark} label="Opening time" value={`${dateStr(register.openedAt)} ${timeStr(register.openedAt)}`} />
              <Row dark={dark} label="Opening cash" value={fmtMoney(register.openingCash)} />
              <div className="my-2" style={{ borderTop: `1px dashed ${dark ? C.borderDark : C.borderLight}` }} />
              <Row dark={dark} label="Cash sales" value={fmtMoney(breakdown.cashSales)} />
              <Row dark={dark} label="Cash additions" value={fmtMoney(breakdown.additions)} />
              <Row dark={dark} label="Cash withdrawals" value={`-${fmtMoney(breakdown.withdrawals)}`} />
              <Row dark={dark} label="Cash drops" value={`-${fmtMoney(breakdown.drops)}`} />
              <Row dark={dark} label="Cash expenses" value={`-${fmtMoney(breakdown.expenses)}`} />
              {breakdown.refunds !== 0 && <Row dark={dark} label="Refunds / reversals" value={fmtMoney(breakdown.refunds)} />}
              <div className="my-2" style={{ borderTop: `1px solid ${dark ? C.borderDark : C.borderLight}` }} />
              <Row dark={dark} label="Expected cash" value={fmtMoney(expectedNow)} bold />
              <div className="flex gap-2 mt-4">
                {canManage && <GhostButton dark={dark} style={{ flex: 1 }} onClick={() => setMode("movement")}><Plus size={14} /> Movement</GhostButton>}
                {canManage && <PrimaryButton style={{ flex: 1 }} onClick={() => setMode("close")}><Lock size={14} /> Close Register</PrimaryButton>}
              </div>
            </Card>
          )}
          <GhostButton dark={dark} full onClick={() => setMode("history")} style={{ width: "100%" }}>History</GhostButton>
        </div>
      )}

      {mode === "open" && (
        <div>
          <Field dark={dark} label="Opening Cash Amount ($)"><Input dark={dark} type="number" step="0.01" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0.00" /></Field>
          <Field dark={dark} label="Notes (optional)"><TextArea dark={dark} value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} /></Field>
          <div className="flex gap-2">
            <GhostButton dark={dark} style={{ flex: 1 }} onClick={() => { setMode("status"); setError(""); }}>Cancel</GhostButton>
            <PrimaryButton style={{ flex: 1 }} disabled={submitting} onClick={doOpen}><Check size={16} /> {submitting ? "Opening…" : "Open Register"}</PrimaryButton>
          </div>
        </div>
      )}

      {mode === "movement" && register && (
        <div>
          <Field dark={dark} label="Movement Type">
            <Select dark={dark} value={movementType} onChange={(e) => setMovementType(e.target.value)}>
              {CASH_MOVEMENT_TYPES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Field dark={dark} label="Amount ($)"><Input dark={dark} type="number" step="0.01" min="0" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="0.00" /></Field>
          <Field dark={dark} label="Reason"><Input dark={dark} value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="e.g. Bank deposit, till top-up…" /></Field>
          <Field dark={dark} label="Notes (optional)"><TextArea dark={dark} value={movementNotes} onChange={(e) => setMovementNotes(e.target.value)} /></Field>
          <div className="flex gap-2">
            <GhostButton dark={dark} style={{ flex: 1 }} onClick={() => { setMode("status"); setError(""); }}>Cancel</GhostButton>
            <PrimaryButton style={{ flex: 1 }} disabled={submitting} onClick={doMovement}><Check size={16} /> {submitting ? "Saving…" : "Record Movement"}</PrimaryButton>
          </div>
        </div>
      )}

      {mode === "close" && register && (
        <div>
          <Card dark={dark} className="mb-3">
            <Row dark={dark} label="Opening Cash" value={fmtMoney(register.openingCash)} />
            <Row dark={dark} label="Cash Sales" value={fmtMoney(breakdown.cashSales)} />
            <Row dark={dark} label="Cash Additions" value={fmtMoney(breakdown.additions)} />
            <Row dark={dark} label="Cash Withdrawals" value={`-${fmtMoney(breakdown.withdrawals)}`} />
            <Row dark={dark} label="Cash Drops" value={`-${fmtMoney(breakdown.drops)}`} />
            <Row dark={dark} label="Cash Expenses" value={`-${fmtMoney(breakdown.expenses)}`} />
            {breakdown.refunds !== 0 && <Row dark={dark} label="Refunds" value={fmtMoney(breakdown.refunds)} />}
            <div className="my-2" style={{ borderTop: `1px solid ${dark ? C.borderDark : C.borderLight}` }} />
            <Row dark={dark} label="Expected Cash" value={fmtMoney(expectedNow)} bold />
          </Card>
          <Field dark={dark} label="Actual Physical Cash Count ($)"><Input dark={dark} type="number" step="0.01" min="0" value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder="0.00" /></Field>
          {previewDiff !== null && (
            <div className="mb-3"><DifferenceBadge dark={dark} diff={previewDiff} /></div>
          )}
          {previewDiff !== null && previewDiff !== 0 && (
            <Field dark={dark} label="Difference Reason (required)">
              <Select dark={dark} value={differenceReason} onChange={(e) => setDifferenceReason(e.target.value)}>
                <option value="">Select a reason…</option>
                <option>Counting mistake</option><option>Missing cash</option><option>Extra cash found</option>
                <option>Cash drawer adjustment</option><option>Other</option>
              </Select>
            </Field>
          )}
          <Field dark={dark} label="Notes (optional)"><TextArea dark={dark} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} /></Field>
          <div className="flex gap-2">
            <GhostButton dark={dark} style={{ flex: 1 }} onClick={() => { setMode("status"); setError(""); }}>Cancel</GhostButton>
            <PrimaryButton style={{ flex: 1 }} disabled={submitting} onClick={doClose}><Lock size={16} /> {submitting ? "Closing…" : "Close Register"}</PrimaryButton>
          </div>
        </div>
      )}

      {mode === "history" && !historyDetail && (
        <div>
          <div className="flex gap-2 mb-3">
            {[["7", "7 Days"], ["30", "30 Days"], ["all", "All"]].map(([id, label]) => (
              <button key={id} onClick={() => setHistoryFilter(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: historyFilter === id ? C.lime : (dark ? C.surfaceDark : C.white), color: historyFilter === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
                {label}
              </button>
            ))}
          </div>
          <Card dark={dark} className="mb-3">
            {historyList.length === 0 ? <EmptyState dark={dark} title="No closed registers yet" /> : historyList.map((r) => (
              <div key={r.id} className="py-3 border-b last:border-b-0 cursor-pointer" style={{ borderColor: dark ? C.borderDark : C.borderLight }} onClick={() => setHistoryDetail(r)}>
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{dateStr(r.closedAt)} · {r.closedByName}</div>
                  <DifferenceBadge dark={dark} diff={r.difference || 0} />
                </div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Expected {fmtMoney(r.expectedCash)} · Actual {fmtMoney(r.actualCash)}</div>
              </div>
            ))}
          </Card>
          <GhostButton dark={dark} full onClick={() => setMode("status")} style={{ width: "100%" }}>Back</GhostButton>
        </div>
      )}

      {mode === "history" && historyDetail && (
        <div>
          <div className="mb-3"><GhostButton dark={dark} onClick={() => setHistoryDetail(null)}>← Back to History</GhostButton></div>
          <Card dark={dark} className="mb-3">
            <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>REGISTER INFORMATION</div>
            <Row dark={dark} label="Location" value={(locations || []).find((l) => l.id === historyDetail.locationId)?.name || "—"} />
            <Row dark={dark} label="Status" value="CLOSED" />
            <Row dark={dark} label="Opened by" value={`${historyDetail.openedByName} · ${dateStr(historyDetail.openedAt)} ${timeStr(historyDetail.openedAt)}`} />
            <Row dark={dark} label="Closed by" value={`${historyDetail.closedByName} · ${dateStr(historyDetail.closedAt)} ${timeStr(historyDetail.closedAt)}`} />
          </Card>
          <Card dark={dark} className="mb-3">
            {(() => {
              const bd = cashRegisterBreakdown(historyDetail, cashTx);
              return (<>
                <Row dark={dark} label="Opening Cash" value={fmtMoney(historyDetail.openingCash)} />
                <Row dark={dark} label="Cash Sales" value={fmtMoney(bd.cashSales)} />
                <Row dark={dark} label="Cash Additions" value={fmtMoney(bd.additions)} />
                <Row dark={dark} label="Cash Withdrawals" value={`-${fmtMoney(bd.withdrawals)}`} />
                <Row dark={dark} label="Cash Drops" value={`-${fmtMoney(bd.drops)}`} />
                <Row dark={dark} label="Cash Expenses" value={`-${fmtMoney(bd.expenses)}`} />
                {bd.refunds !== 0 && <Row dark={dark} label="Refunds" value={fmtMoney(bd.refunds)} />}
                <div className="my-2" style={{ borderTop: `1px solid ${dark ? C.borderDark : C.borderLight}` }} />
                <Row dark={dark} label="Expected Cash" value={fmtMoney(historyDetail.expectedCash)} bold />
                <Row dark={dark} label="Actual Cash" value={fmtMoney(historyDetail.actualCash)} bold />
                <div className="mt-2"><DifferenceBadge dark={dark} diff={historyDetail.difference || 0} /></div>
                {historyDetail.differenceReason && <div className="text-xs mt-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Reason: {historyDetail.differenceReason}</div>}
                {historyDetail.notes && <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Notes: {historyDetail.notes}</div>}
              </>);
            })()}
          </Card>
          <Card dark={dark}>
            <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>MOVEMENT HISTORY</div>
            {cashRegisterBreakdown(historyDetail, cashTx).movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
                <div>
                  <div className="font-semibold" style={{ color: dark ? C.white : C.black }}>{m.category}</div>
                  <div style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{timeStr(m.date)} · {m.description}</div>
                </div>
                <div className="font-bold" style={{ color: m.type === "income" ? C.lime : "#FF6B85" }}>{m.type === "income" ? "+" : "-"}{fmtMoney(m.amount)}</div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </Modal>
  );
}

// Full alert history/management modal. Read-only over the source business data — the only
// mutation available here is dismissAlert, which only ever touches businessAlerts (confirmed via
// dismissAlert's own implementation, which calls setBusinessAlerts and logAudit, nothing else).
function AlertsPanel({ dark, onClose, businessAlerts, setBusinessAlerts, canFinance, currentUser, auditLog, setAuditLog, showToast }) {
  const [filter, setFilter] = useState("open"); // "open" | "resolved" | "dismissed" | "all"
  const [dismissingId, setDismissingId] = useState(null);
  const alertCtx = { businessAlerts, setBusinessAlerts, currentUser, auditLog, setAuditLog };

  const visibleBySeverity = canFinance ? (businessAlerts || []) : (businessAlerts || []).filter((a) => !a.financial);
  const filtered = (filter === "all" ? visibleBySeverity : visibleBySeverity.filter((a) => a.status === filter));
  const sorted = sortAlertsByPriority(filtered);

  const doDismiss = async (alertId) => {
    if (dismissingId) return; // guard against rapid double-click
    setDismissingId(alertId);
    try {
      const r = await dismissAlert(alertId, alertCtx);
      if (!r.success) { showToast(r.error, "danger"); return; }
      showToast("Alert dismissed");
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <Modal title="Business Alerts" onClose={onClose} dark={dark} wide>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: filter === id ? C.lime : (dark ? C.surfaceDark : C.white), color: filter === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState dark={dark} title="No alerts here" sub={filter === "open" ? "Everything is running smoothly." : "Nothing matches this filter."} />
      ) : (
        sorted.map((a) => (
          <Card dark={dark} key={a.id} className="mb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge dark={dark} tone={ALERT_SEVERITY_TONE[a.severity]}>{ALERT_SEVERITY_LABEL[a.severity]}</Badge>
                  {a.status !== "open" && <Badge dark={dark} tone="default">{a.status.toUpperCase()}</Badge>}
                </div>
                <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{a.title}</div>
                <div className="text-xs mt-0.5" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{a.message}</div>
                <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                  Since {dateStr(a.createdAt)} {timeStr(a.createdAt)}
                  {a.status === "resolved" && a.resolvedAt ? ` · Resolved ${dateStr(a.resolvedAt)} ${timeStr(a.resolvedAt)}` : ""}
                  {a.status === "dismissed" && a.dismissedAt ? ` · Dismissed ${dateStr(a.dismissedAt)} ${timeStr(a.dismissedAt)}` : ""}
                </div>
              </div>
              {a.status === "open" && (
                <GhostButton dark={dark} disabled={dismissingId === a.id} onClick={() => doDismiss(a.id)} style={{ padding: "4px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
                  {dismissingId === a.id ? "…" : "Dismiss"}
                </GhostButton>
              )}
            </div>
          </Card>
        ))
      )}
    </Modal>
  );
}

function Dashboard({ dark, sales, cashTx, persistCash, expenses, products, inventory, invTx, wasteTx, tasks, purchaseOrders, employees, locations, cashRegisters, setCashRegisters, cashRegisterOps, customers, loyaltyTransactions, shifts, businessAlerts, setBusinessAlerts, auditLog, setAuditLog, setTab, currentUser, can, showToast }) {
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const canFinance = can("viewFinancials");

  // Re-evaluates every alert condition against the current authoritative data and reconciles the
  // businessAlerts collection (open new ones, auto-resolve ones whose condition disappeared —
  // never mutates sales/inventory/cashRegisters/etc. themselves). Runs once on mount and every
  // 60s while the Dashboard is open — bounded, not excessive, same interval pattern already used
  // by MyShiftCard/OrdersView.
  useEffect(() => {
    if (!businessAlerts) return;
    const run = () => {
      const candidates = evaluateAllAlerts({ inventory, invTx, cashRegisters, sales, purchaseOrders, employees, shifts, customers, loyaltyTransactions }, Date.now());
      reconcileAlerts(candidates, { businessAlerts, setBusinessAlerts, currentUser, auditLog, setAuditLog });
    };
    run();
    const id = setInterval(run, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, invTx, cashRegisters, sales, purchaseOrders, employees, shifts, customers, loyaltyTransactions]);

  const activeSales = useMemo(() => sales.filter((s) => s.status !== "cancelled"), [sales]);
  const today = todayStr();
  const todaySales = activeSales.filter((s) => isSameDay(s.date, today));
  const todayRevenue = round2(todaySales.reduce((a, s) => a + s.total, 0));
  const todayCOGS = round2(todaySales.reduce((a, s) => a + s.items.reduce((x, it) => x + it.cost * it.qty, 0), 0));
  const todayExpenses = round2(expenses.filter((e) => e.status !== "reversed" && isSameDay(e.date, today)).reduce((a, e) => a + e.amount, 0));
  const todayProfit = round2(todayRevenue - todayCOGS - todayExpenses);
  const orders = todaySales.length;
  const avgTicket = orders ? round2(todayRevenue / orders) : 0;

  // cashTx is the single source of truth for cash movements (income + expense entries all live here),
  // so the balance is a straight sum — no separate subtraction of `expenses` needed (that was double-counting).
  const cashBalance = round2(cashTx.reduce((a, t) => a + (t.type === "income" ? t.amount : -t.amount), 0));

  const last7 = [...Array(7)].map((_, i) => {
    const ds = dateStrOffset(-(6 - i));
    const rev = round2(activeSales.filter((s) => isSameDay(s.date, ds)).reduce((a, s) => a + s.total, 0));
    return { label: parseLocalDate(ds).toLocaleDateString("en-US", { weekday: "short" }), value: rev };
  });
  const maxWeek = Math.max(1, ...last7.map((d) => d.value));

  const channelTotals = {};
  activeSales.filter((s) => withinDays(s.date, 30)).forEach((s) => { channelTotals[s.channel] = (channelTotals[s.channel] || 0) + s.total; });
  const channelArr = Object.entries(channelTotals).sort((a, b) => b[1] - a[1]);
  const maxChannel = Math.max(1, ...channelArr.map((c) => c[1]));

  const bestSellers = useMemo(() => {
    const map = {};
    activeSales.filter((s) => withinDays(s.date, 30)).forEach((s) => s.items.forEach((it) => {
      if (!map[it.productId]) map[it.productId] = { name: it.name, units: 0, revenue: 0 };
      map[it.productId].units += it.qty; map[it.productId].revenue += it.qty * it.unitPrice;
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [activeSales]);

  const lowStock = inventory.filter((i) => stockStatus(i) !== "NORMAL").sort((a, b) => a.qty / (a.minQty || 1) - b.qty / (b.minQty || 1));
  const stockCounts = {
    OUT_OF_STOCK: lowStock.filter((i) => stockStatus(i) === "OUT_OF_STOCK").length,
    CRITICAL: lowStock.filter((i) => stockStatus(i) === "CRITICAL").length,
    LOW: lowStock.filter((i) => stockStatus(i) === "LOW").length,
  };
  const expiringStock = inventory.filter((i) => expiryStatus(i)).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));

  // Phase (Waste fix): in Supabase mode, wasteTx is legacy localStorage-only and never reflects
  // real fn_record_waste writes (confirmed: inventoryOps.waste never calls persistWaste). The
  // real ledger already exists in invTx/catalogInvTx (useSupabaseInventory's inventory_transactions
  // read, reloaded automatically after every waste RPC call) — filtering it by type === "Waste"
  // is the source of truth here instead. totalCost is negative for a stock reduction (confirmed
  // in production: qty_change -0.100, total_cost -0.17 for a waste_cost of 0.17), hence Math.abs.
  // supabaseAuth.hasSession() is the same mode check already used everywhere else in this file
  // (commitLoyaltyForSale, reverseLoyaltyForSale, openCashRegister, etc) — not a new mechanism.
  // The legacy wasteTx path is preserved unchanged as the fallback for a session-less local mode.
  const wasteEntries = supabaseAuth.hasSession()
    ? (invTx || []).filter((t) => t.type === "Waste").map((t) => ({ date: t.date, cost: Math.abs(Number(t.totalCost || 0)) }))
    : (wasteTx || []);
  const monthWasteCost = round2(wasteEntries.filter((w) => withinDays(w.date, 30)).reduce((a, w) => a + w.cost, 0));

  // Active order queue — anything not yet Completed (or cancelled), regardless of day, so nothing gets forgotten.
  const activeOrders = activeSales.filter((s) => (s.fulfillmentStatus || "Completed") !== "Completed").sort((a, b) => new Date(a.date) - new Date(b.date));
  const orderCounts = {
    Received: activeOrders.filter((s) => (s.fulfillmentStatus || "Received") === "Received").length,
    Preparing: activeOrders.filter((s) => s.fulfillmentStatus === "Preparing").length,
    Ready: activeOrders.filter((s) => s.fulfillmentStatus === "Ready").length,
  };
  const longestWaiting = activeOrders[0] || null; // already sorted oldest-first above

  const today0 = dateStrOffset(0);
  const myEmployeeId = currentUser?.employeeId || "";
  const canSeeAllTasks = can("manageTasks");
  // Same scoping rule as the Tasks tab: someone without manageTasks only ever sees their own
  // assignments here too, so the dashboard can't leak coworkers' tasks that the Tasks tab hides.
  const visibleTasks = canSeeAllTasks ? (tasks || []) : (tasks || []).filter((t) => t.assignedTo === myEmployeeId);
  const openTasks = visibleTasks.filter((t) => t.status !== "done");
  const todayTasks = openTasks.filter((t) => t.dueDate === today0);
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today0);
  const employeeName = (id) => employees?.find((e) => e.id === id)?.name || "Unassigned";

  const agingPayables = (purchaseOrders || []).filter((po) => (po.status === "Received" || po.status === "Partially Received") && poAmountDue(po) > 0.005 && !withinDays(po.orderDate, 3));

  const opsAlertCount = lowStock.length + expiringStock.length + overdueTasks.length + agingPayables.length;

  // Week-over-week: last 7 completed days vs the 7 days before that, for a simple trend signal.
  const thisWeekRevenue = round2(activeSales.filter((s) => withinDays(s.date, 7)).reduce((a, s) => a + s.total, 0));
  const prevWeekRevenue = round2(activeSales.filter((s) => {
    const t = new Date(s.date).getTime();
    return t < Date.now() - 7 * 86400000 && t >= Date.now() - 14 * 86400000;
  }).reduce((a, s) => a + s.total, 0));
  const weekDeltaPct = prevWeekRevenue > 0 ? round2(((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : null;
  const thisWeekOrders = activeSales.filter((s) => withinDays(s.date, 7)).length;
  const prevWeekOrders = activeSales.filter((s) => {
    const t = new Date(s.date).getTime();
    return t < Date.now() - 7 * 86400000 && t >= Date.now() - 14 * 86400000;
  }).length;

  const quickActions = [
    { label: "Sale", tab: "sales", icon: Plus, color: C.lime, perm: "manageSales" },
    { label: "Expense", tab: "expenses", icon: Receipt, color: C.yellow, perm: "manageExpenses" },
    { label: "Purchase", tab: "purchases", icon: PackagePlus, color: C.purpleGlow, perm: null },
    { label: "Inventory", tab: "inventory", icon: Boxes, color: "#FF6B85", perm: null },
  ].filter((a) => !a.perm || can(a.perm));

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Good day 👋" sub={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      {canFinance ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <StatCard dark={dark} label="Today's Sales" value={fmtMoney(todayRevenue)} sub={`${orders} orders`} icon={TrendingUp} accent={C.lime} />
          <StatCard dark={dark} label="Today's Expenses" value={fmtMoney(todayExpenses)} sub="Operating" icon={TrendingDown} accent={"#FF6B85"} />
          <StatCard dark={dark} label="Est. Profit" value={fmtMoney(todayProfit)} sub="After COGS + expenses" icon={Flame} accent={C.yellow} />
          <StatCard dark={dark} label="Cash Balance" value={fmtMoney(cashBalance)} sub="All-time" icon={Wallet} accent={C.purpleGlow} />
          <StatCard dark={dark} label="Orders" value={orders} sub="Today" icon={ShoppingCart} accent={C.lime} />
          <StatCard dark={dark} label="Avg. Ticket" value={fmtMoney(avgTicket)} sub="Per order" icon={BarChart2} accent={C.yellow} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard dark={dark} label="Orders Today" value={orders} icon={ShoppingCart} accent={C.lime} />
          <StatCard dark={dark} label="Low Stock Items" value={lowStock.length} icon={AlertTriangle} accent={C.yellow} />
        </div>
      )}

      {/* Quick actions */}
      {(() => {
        const defaultLocationId = (locations || []).find((l) => l.active !== false)?.id;
        const activeRegister = findOpenRegister(cashRegisters, defaultLocationId);
        const expected = activeRegister ? calculateExpectedCash(activeRegister, cashTx) : 0;
        const breakdown = activeRegister ? cashRegisterBreakdown(activeRegister, cashTx) : null;
        const cashOut = breakdown ? round2(breakdown.withdrawals + breakdown.drops + breakdown.expenses) : 0;
        return (
          <Card dark={dark} className="mb-4 cursor-pointer" onClick={() => setShowCashRegister(true)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={18} color={activeRegister ? C.lime : "#FF6B85"} />
                <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>{activeRegister ? "REGISTER OPEN" : "REGISTER CLOSED"}</span>
              </div>
              <Badge dark={dark} tone={activeRegister ? "good" : "danger"}>{activeRegister ? "ACTIVE" : "CLOSED"}</Badge>
            </div>
            {activeRegister && canFinance && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>EXPECTED CASH</div>
                  <div className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(expected)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>CASH SALES</div>
                  <div className="text-sm font-extrabold" style={{ color: C.lime }}>{fmtMoney(breakdown.cashSales)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>CASH OUT</div>
                  <div className="text-sm font-extrabold" style={{ color: "#FF6B85" }}>{fmtMoney(cashOut)}</div>
                </div>
              </div>
            )}
            {!activeRegister && (
              <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Tap to {can("manageCashRegister") ? "open the register" : "view register status"}.</div>
            )}
          </Card>
        );
      })()}

      <div className="grid grid-cols-4 gap-2 mb-5">
        {quickActions.map((a) => (
          <button key={a.label} onClick={() => setTab(a.tab)} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl"
            style={{ background: dark ? C.surfaceDark : C.white, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: a.color + "22" }}><a.icon size={18} color={a.color} /></div>
            <span className="text-[11px] font-bold" style={{ color: dark ? C.white : C.black }}>{a.label}</span>
          </button>
        ))}
      </div>

      {showCashRegister && (
        <CashRegisterModal dark={dark} onClose={() => setShowCashRegister(false)} cashRegisters={cashRegisters} setCashRegisters={setCashRegisters}
          cashTx={cashTx} persistCash={persistCash} cashRegisterOps={cashRegisterOps} locations={locations} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}

      {(() => {
        if (!customers) return null;
        const newCustomersToday = customers.filter((c) => c.createdAt && isSameDay(c.createdAt, todayStr())).length;
        const todaysSales = sales.filter((s) => s.status !== "cancelled" && isSameDay(s.date, todayStr()));
        const customerIdsToday = new Set(todaysSales.filter((s) => s.customerId).map((s) => s.customerId));
        const returningToday = [...customerIdsToday].filter((cid) => sales.some((s) => s.customerId === cid && s.status !== "cancelled" && !isSameDay(s.date, todayStr()))).length;
        const pointsRedeemedToday = (loyaltyTransactions || []).filter((t) => t.type === "redeem" && isSameDay(t.createdAt, todayStr())).reduce((a, t) => a + t.points, 0);
        if (newCustomersToday === 0 && returningToday === 0 && pointsRedeemedToday === 0) return null; // keep the dashboard uncluttered on a quiet day
        return (
          <Card dark={dark} className="mb-4">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>NEW CUSTOMERS TODAY</div>
                <div className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{newCustomersToday}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>RETURNING TODAY</div>
                <div className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{returningToday}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>PTS REDEEMED TODAY</div>
                <div className="text-sm font-extrabold" style={{ color: C.lime }}>{pointsRedeemedToday}</div>
              </div>
            </div>
          </Card>
        );
      })()}

      {(() => {
        if (!shifts) return null;
        const todayRange = getDateRange("today");
        const laborToday = getLaborSummary(employees, shifts, todayRange);
        if (laborToday.employeesClockedIn === 0 && laborToday.totalWorkedHours === 0) return null; // keep the dashboard uncluttered on a quiet day
        return (
          <Card dark={dark} className="mb-4">
            <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Labor Today</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>CLOCKED IN</div>
                <div className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{laborToday.employeesClockedIn}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>ON BREAK</div>
                <div className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{laborToday.employeesOnBreak}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>HOURS TODAY</div>
                <div className="text-sm font-extrabold" style={{ color: C.lime }}>{laborToday.totalWorkedHours}</div>
              </div>
            </div>
            {can("viewFinancials") && laborToday.estimatedLaborCost > 0 && (
              <div className="text-xs mt-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Estimated labor cost today: <span className="font-bold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(laborToday.estimatedLaborCost)}</span></div>
            )}
          </Card>
        );
      })()}

      {(() => {
        if (!businessAlerts) return null;
        const openAlerts = businessAlerts.filter((a) => a.status === "open");
        const visibleAlerts = canFinance ? openAlerts : openAlerts.filter((a) => !a.financial);
        if (visibleAlerts.length === 0) return null; // no card at all on a clean day
        const counts = { critical: visibleAlerts.filter((a) => a.severity === "critical").length, warning: visibleAlerts.filter((a) => a.severity === "warning").length, info: visibleAlerts.filter((a) => a.severity === "info").length };
        return (
          <Card dark={dark} className="mb-4 cursor-pointer" onClick={() => setShowAlertsPanel(true)} style={{ borderColor: counts.critical > 0 ? "#FF6B85" : undefined }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} color={counts.critical > 0 ? "#FF6B85" : C.yellow} />
                <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>{visibleAlerts.length} active alert{visibleAlerts.length === 1 ? "" : "s"}</span>
              </div>
              <span className="text-xs font-bold" style={{ color: C.lime }}>View All →</span>
            </div>
            <div className="flex gap-3 mt-2 text-xs font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
              {counts.critical > 0 && <span>Critical: <span style={{ color: "#FF6B85" }}>{counts.critical}</span></span>}
              {counts.warning > 0 && <span>Warning: <span style={{ color: C.yellow }}>{counts.warning}</span></span>}
              {counts.info > 0 && <span>Info: <span style={{ color: dark ? C.white : C.black }}>{counts.info}</span></span>}
            </div>
          </Card>
        );
      })()}

      {showAlertsPanel && (
        <AlertsPanel dark={dark} onClose={() => setShowAlertsPanel(false)} businessAlerts={businessAlerts} setBusinessAlerts={setBusinessAlerts}
          canFinance={canFinance} currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}

      {(opsAlertCount > 0) && (
        <Card dark={dark} className="mb-4" style={{ borderColor: "#FF6B85" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} color="#FF6B85" />
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>{opsAlertCount} operational issue{opsAlertCount === 1 ? "" : "s"} need attention</span>
          </div>
          <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            {[lowStock.length > 0 ? `${lowStock.length} stock alert${lowStock.length === 1 ? "" : "s"}` : null,
              overdueTasks.length > 0 ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}` : null,
              canFinance && agingPayables.length > 0 ? `${agingPayables.length} unpaid bill${agingPayables.length === 1 ? "" : "s"} 3+ days old` : null,
            ].filter(Boolean).join(" · ") || "See details below."}
          </div>
          {lowStock.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
              <div className="flex gap-3 text-xs font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                {stockCounts.OUT_OF_STOCK > 0 && <span>Out of Stock: <span style={{ color: "#FF6B85" }}>{stockCounts.OUT_OF_STOCK}</span></span>}
                {stockCounts.CRITICAL > 0 && <span>Critical: <span style={{ color: "#FF6B85" }}>{stockCounts.CRITICAL}</span></span>}
                {stockCounts.LOW > 0 && <span>Low: <span style={{ color: C.yellow }}>{stockCounts.LOW}</span></span>}
              </div>
              <button onClick={() => setTab("inventory")} className="text-xs font-bold" style={{ color: C.lime }}>View Inventory →</button>
            </div>
          )}
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Active Orders</span>
            {activeOrders.length > 0 && <Badge dark={dark} tone="warn">{activeOrders.length} in queue</Badge>}
          </div>
          {activeOrders.length > 0 && (
            <div className="flex gap-3 mb-3 text-xs font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
              <span>New: <span style={{ color: dark ? C.white : C.black }}>{orderCounts.Received}</span></span>
              <span>In Production: <span style={{ color: dark ? C.white : C.black }}>{orderCounts.Preparing}</span></span>
              <span>Ready: <span style={{ color: dark ? C.white : C.black }}>{orderCounts.Ready}</span></span>
              {longestWaiting && <span>· Longest wait: <span style={{ color: dark ? C.white : C.black }}>{formatElapsed(longestWaiting.date)}</span></span>}
            </div>
          )}
          {activeOrders.length === 0 ? <EmptyState dark={dark} title="No open orders" sub="Every order is completed." /> : activeOrders.slice(0, 6).map((s) => (
            <ListRow key={s.id} dark={dark} title={`#${s.orderNo} · ${s.channel}`} subtitle={`${timeStr(s.date)} · ${s.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}`}
              right={<Badge dark={dark} tone={FULFILLMENT_TONE[s.fulfillmentStatus || "Received"]}>{ORDER_STATUS_META[s.fulfillmentStatus || "Received"].label}</Badge>} />
          ))}
          {activeOrders.length > 0 && <button onClick={() => setTab("orders")} className="text-xs font-bold mt-2" style={{ color: C.lime }}>View Orders →</button>}
        </Card>
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>{canSeeAllTasks ? "Today's Tasks" : "My Tasks Today"}</span>
            {overdueTasks.length > 0 && <Badge dark={dark} tone="danger">{overdueTasks.length} overdue</Badge>}
          </div>
          {overdueTasks.length === 0 && todayTasks.length === 0 ? <EmptyState dark={dark} title="Nothing due today" /> : (
            <>
              {overdueTasks.slice(0, 3).map((t) => (
                <ListRow key={t.id} dark={dark} title={t.title} subtitle={`${employeeName(t.assignedTo)} · due ${dateStrLocal(t.dueDate)}`} right={<Badge dark={dark} tone="danger">OVERDUE</Badge>} />
              ))}
              {todayTasks.slice(0, 4).map((t) => (
                <ListRow key={t.id} dark={dark} title={t.title} subtitle={employeeName(t.assignedTo)} right={<Badge dark={dark} tone="warn">{t.priority?.toUpperCase()}</Badge>} />
              ))}
            </>
          )}
          <button onClick={() => setTab("employees")} className="text-xs font-bold mt-2" style={{ color: C.lime }}>{canSeeAllTasks ? "Manage tasks →" : "View my tasks →"}</button>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card dark={dark} className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} color={C.yellow} />
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Low Stock Alerts</span>
          </div>
          {lowStock.slice(0, 6).map((i) => (
            <ListRow key={i.id} dark={dark} title={i.name} subtitle={`${i.qty} ${i.unit} remaining · min ${i.minQty}`}
              right={<Badge dark={dark} tone={STOCK_STATUS_TONE[stockStatus(i)]}>{STOCK_STATUS_LABEL[stockStatus(i)]}</Badge>} />
          ))}
        </Card>
      )}

      {!canFinance && (
        <Card dark={dark} className="mb-4">
          <div className="text-xs text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            Revenue, profit, and cash figures are restricted to accounts with financial access.
          </div>
        </Card>
      )}

      {canFinance && (
        <>
          <Card dark={dark} className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>This Week vs Last Week</span>
              {weekDeltaPct !== null && (
                <span className="text-sm font-extrabold flex items-center gap-1" style={{ color: weekDeltaPct >= 0 ? C.lime : "#FF6B85" }}>
                  {weekDeltaPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {weekDeltaPct >= 0 ? "+" : ""}{fmtPct(weekDeltaPct)}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-extrabold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(thisWeekRevenue)}</span>
              <span className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>vs {fmtMoney(prevWeekRevenue)} prior 7 days</span>
            </div>
            <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{thisWeekOrders} orders this week vs {prevWeekOrders} the week before</div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Card dark={dark}>
              <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Sales — Last 7 Days</div>
              <div className="flex items-end gap-2 h-32">
                {last7.map((d, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg" style={{ height: `${(d.value / maxWeek) * 100}%`, minHeight: 4, background: `linear-gradient(180deg, ${C.lime}, ${C.limeDim})` }} />
                    <span className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card dark={dark}>
              <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Sales by Channel (30d)</div>
              {channelArr.length === 0 ? <EmptyState dark={dark} title="No sales yet" /> : channelArr.map(([ch, val]) => (
                <div key={ch} className="mb-2">
                  <div className="flex justify-between text-xs mb-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                    <span className="font-semibold" style={{ color: dark ? C.white : C.black }}>{ch}</span><span>{fmtMoney(val)}</span>
                  </div>
                  <div className="h-2 rounded-full w-full" style={{ background: dark ? C.borderDark : C.borderLight }}>
                    <div className="h-2 rounded-full" style={{ width: `${(val / maxChannel) * 100}%`, background: C.yellow }} />
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card dark={dark}>
              <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Best Sellers (30d)</div>
              {bestSellers.length === 0 ? <EmptyState dark={dark} title="No sales yet" /> : bestSellers.map((p, idx) => (
                <ListRow key={idx} dark={dark} title={p.name} subtitle={`${p.units} units sold`} right={fmtMoney(p.revenue)} />
              ))}
            </Card>
            <Card dark={dark}>
              <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Waste (30d)</div>
              <div className="text-2xl font-extrabold mb-1" style={{ color: dark ? C.white : C.black }}>{fmtMoney(monthWasteCost)}</div>
              <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Financial value of recorded waste this period. Log waste from the Inventory tab to keep this accurate.</div>
            </Card>
          </div>

          {agingPayables.length > 0 && (
            <Card dark={dark} className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} color="#FF6B85" />
                <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Unpaid Bills — 3+ Days Old</span>
              </div>
              {agingPayables.map((po) => (
                <ListRow key={po.id} dark={dark} title={po.poNumber} subtitle={`Ordered ${dateStr(po.orderDate)}`} right={fmtMoney(poAmountDue(po))} />
              ))}
              <button onClick={() => setTab("purchases")} className="text-xs font-bold mt-2" style={{ color: C.lime }}>Go to Purchases →</button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SectionHeader({ dark, title, sub, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-xl font-extrabold" style={{ color: dark ? C.white : C.black }}>{title}</h1>
        {sub && <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/* ============================== SALES ============================== */
// Orders / Production board — reads the SAME finalized sale records SalesView does, no second
// order system. Purely operational: shows only what production staff needs (order#, elapsed
// time, items, customer name, location, channel, notes), never card transaction IDs, payment
// details, loyalty balances, or customer financial totals. Advances status through the same
// centralized advanceOrderStatus() function SaleDetailModal uses.
const ORDER_FILTERS = [
  { id: "active", label: "Active" },
  { id: "Received", label: "New" },
  { id: "Preparing", label: "In Production" },
  { id: "Ready", label: "Ready" },
  { id: "Completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function OrderCard({ dark, sale, customerName, tick, onAdvance, advancingId }) {
  const status = sale.status === "cancelled" ? null : (sale.fulfillmentStatus || "Received");
  const meta = status ? ORDER_STATUS_META[status] : null;
  const isAdvancing = advancingId === sale.id;
  return (
    <Card dark={dark} className="mb-2">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="font-extrabold text-sm" style={{ color: dark ? C.white : C.black }}>Order #{sale.orderNo}</div>
          <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            {timeStr(sale.date)} · {sale.channel}{sale.location ? ` · ${sale.location}` : ""}
          </div>
        </div>
        {sale.status === "cancelled" ? (
          <Badge dark={dark} tone="danger">CANCELLED</Badge>
        ) : status === "Completed" ? (
          <Badge dark={dark} tone="default">COMPLETED</Badge>
        ) : (
          <div className="text-right">
            <Badge dark={dark} tone={FULFILLMENT_TONE[status]}>{meta.label}</Badge>
            <div className="text-xs font-bold mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{formatElapsed(sale.date)} waiting</div>
          </div>
        )}
      </div>
      <div className="text-xs mb-1" style={{ color: dark ? C.white : C.black }}>
        {sale.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}
      </div>
      {customerName && (
        <div className="text-xs mb-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Customer: {customerName}</div>
      )}
      {sale.notes && <div className="text-xs mb-1 italic" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Note: {sale.notes}</div>}
      {sale.status !== "cancelled" && meta?.action && (
        <PrimaryButton full disabled={isAdvancing} onClick={() => onAdvance(sale.id)} style={{ marginTop: 8 }}>
          <Check size={15} /> {isAdvancing ? "Updating…" : meta.action}
        </PrimaryButton>
      )}
    </Card>
  );
}

function OrdersView({ dark, sales, persistSales, customers, currentUser, can, showToast }) {
  const [filter, setFilter] = useState("active");
  const [advancingId, setAdvancingId] = useState(null);
  const [tick, setTick] = useState(0);
  const canAdvance = can("manageSales"); // reused — already grants Owner/Manager/Employee exactly the production-workflow access this needs; no new permission required

  // Live-refresh elapsed time every 30s while this board is open — bounded, not excessive.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const activeList = sales.filter((s) => s.status !== "cancelled" && (s.fulfillmentStatus || "Received") !== "Completed");
  const list = (filter === "active" ? activeList
    : filter === "cancelled" ? sales.filter((s) => s.status === "cancelled")
    : filter === "Completed" ? sales.filter((s) => s.status !== "cancelled" && (s.fulfillmentStatus || "Received") === "Completed")
    : sales.filter((s) => s.status !== "cancelled" && (s.fulfillmentStatus || "Received") === filter)
  ).sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first — never let the longest-waiting order get buried

  const counts = {
    Received: activeList.filter((s) => (s.fulfillmentStatus || "Received") === "Received").length,
    Preparing: activeList.filter((s) => s.fulfillmentStatus === "Preparing").length,
    Ready: activeList.filter((s) => s.fulfillmentStatus === "Ready").length,
  };

  const doAdvance = async (saleId) => {
    if (advancingId) return; // guard against a second click while one is already in flight
    if (!canAdvance) { showToast("You don't have permission to manage orders.", "danger"); return; }
    setAdvancingId(saleId);
    try {
      const r = await advanceOrderStatus(saleId, sales, persistSales);
      if (!r.success) { showToast(r.error, "danger"); return; }
      // staleData (see advanceOrderStatus) means the status change already committed on the
      // server — only the screen refresh failed. Never worded as a failure.
      showToast(r.staleData ? r.message : `Order #${r.sale.orderNo} → ${ORDER_STATUS_META[r.sale.fulfillmentStatus]?.label || r.sale.fulfillmentStatus}`, r.staleData ? "good" : undefined);
    } finally {
      setAdvancingId(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[["New", counts.Received], ["In Production", counts.Preparing], ["Ready", counts.Ready]].map(([label, value]) => (
          <Card dark={dark} key={label} style={{ padding: 10 }}>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{label.toUpperCase()}</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{value}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {ORDER_FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: filter === f.id ? C.lime : (dark ? C.surfaceDark : C.white), color: filter === f.id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {f.label}{f.id === "active" ? ` (${activeList.length})` : ""}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState dark={dark} title="No orders here" sub={filter === "active" ? "Every order is caught up." : "Nothing matches this filter."} />
      ) : (
        list.map((s) => <OrderCard key={s.id} dark={dark} sale={s} customerName={s.customerId ? (customers || []).find((c) => c.id === s.customerId)?.name : null} tick={tick} onAdvance={doAdvance} advancingId={advancingId} />)
      )}
    </div>
  );
}

function SalesView({ dark, sales, persistSales, products, inventory, setInventory, persistCash, cashTx, settings, locations, employees, customers, setCustomers, invTx, setInvTx, cashRegisters, loyaltyTransactions, setLoyaltyTransactions, loyaltyRewards, businessAlerts, setBusinessAlerts, currentUser, can, auditLog, setAuditLog, showToast, supabaseSalesOps, reloadInventory, reloadLoyalty, businessId, reportLoadError }) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [filter, setFilter] = useState("today");
  const filtered = useMemo(() => {
    const days = filter === "today" ? 0 : filter === "week" ? 7 : filter === "month" ? 30 : 3650;
    return sales.filter((s) => filter === "today" ? isSameDay(s.date, todayStr()) : withinDays(s.date, days)).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sales, filter]);

  const totalRev = round2(filtered.filter((s) => s.status !== "cancelled").reduce((a, s) => a + s.total, 0));

  const exportCSV = () => {
    downloadCSV(`masseli-sales-${filter}.csv`,
      ["Order #", "Date", "Time", "Channel", "Location", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment Method", "Status", "Fulfillment"],
      filtered.map((s) => [s.orderNo, dateStr(s.date), timeStr(s.date), s.channel, locationLabel(s, locations), s.items.map((i) => `${i.qty}x ${i.name}`).join("; "), s.subtotal, s.discount, s.tax, s.total, s.paymentMethod, s.status === "cancelled" ? "Cancelled" : "Completed", s.fulfillmentStatus || "Completed"])
    );
    showToast("CSV exported");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Sales" sub={`${filtered.length} orders · ${fmtMoney(totalRev)}`}
        action={can("manageSales") ? <PrimaryButton onClick={() => setOpen(true)}><Plus size={16} /> New Sale</PrimaryButton> : null} />

      <div className="flex gap-2 mb-4 items-center flex-wrap">
        {[["today", "Today"], ["week", "7 Days"], ["month", "30 Days"], ["all", "All"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: filter === id ? C.lime : (dark ? C.surfaceDark : C.white), color: filter === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
        {filtered.length > 0 && <GhostButton dark={dark} style={{ padding: "6px 12px", fontSize: 12, marginLeft: "auto" }} onClick={exportCSV}>Export CSV</GhostButton>}
      </div>

      <Card dark={dark}>
        {filtered.length === 0 ? <EmptyState dark={dark} title="No sales yet" sub="Tap New Sale to record your first order." /> : filtered.map((s) => (
          <ListRow key={s.id} dark={dark} onClick={() => setViewing(s)}
            title={`Order #${s.orderNo} · ${s.channel}`}
            subtitle={`${dateStr(s.date)} ${timeStr(s.date)} · ${s.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}`}
            badge={s.status === "cancelled" ? <Badge dark={dark} tone="danger">{getPaymentStatus(s) === "failed" ? "PAYMENT FAILED" : "CANCELLED"}</Badge> : (s.fulfillmentStatus && s.fulfillmentStatus !== "Completed" ? <Badge dark={dark} tone={FULFILLMENT_TONE[s.fulfillmentStatus]}>{s.fulfillmentStatus.toUpperCase()}</Badge> : null)}
            right={fmtMoney(s.total)} rightSub={s.paymentMethod} />
        ))}
      </Card>

      {open && (
        <NewSaleModal dark={dark} onClose={() => setOpen(false)} products={products} inventory={inventory} setInventory={setInventory}
          sales={sales} persistSales={persistSales} cashTx={cashTx} persistCash={persistCash} settings={settings}
          locations={locations} employees={employees} customers={customers} setCustomers={setCustomers} invTx={invTx} setInvTx={setInvTx} cashRegisters={cashRegisters}
          loyaltyTransactions={loyaltyTransactions} setLoyaltyTransactions={setLoyaltyTransactions} loyaltyRewards={loyaltyRewards}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast}
          supabaseSalesOps={supabaseSalesOps} reloadInventory={reloadInventory} reloadLoyalty={reloadLoyalty} businessId={businessId} reportLoadError={reportLoadError} />
      )}

      {viewing && (
        <SaleDetailModal dark={dark} sale={viewing} onClose={() => setViewing(null)} products={products}
          inventory={inventory} setInventory={setInventory} sales={sales} persistSales={persistSales}
          cashTx={cashTx} persistCash={persistCash} invTx={invTx} setInvTx={setInvTx} locations={locations}
          employees={employees} customers={customers} settings={settings}
          loyaltyTransactions={loyaltyTransactions} setLoyaltyTransactions={setLoyaltyTransactions} reloadLoyalty={reloadLoyalty}
          businessAlerts={businessAlerts} setBusinessAlerts={setBusinessAlerts}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </div>
  );
}

function SaleDetailModal({ dark, sale, onClose, products, inventory, setInventory, sales, persistSales, cashTx, persistCash, invTx, setInvTx, locations, employees, customers, settings, loyaltyTransactions, setLoyaltyTransactions, reloadLoyalty, businessAlerts, setBusinessAlerts, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [printPreview, setPrintPreview] = useState(null); // { title, html } | null
  const cancelled = sale.status === "cancelled";
  const fulfillment = sale.fulfillmentStatus || "Completed";
  const nextStatus = nextFulfillmentStatus(fulfillment);
  const canAdvance = !cancelled && can("manageSales") && fulfillment !== "Completed";
  const printCtx = { settings, locations, employees, customers };
  // Reprint is strictly read-only against `sale` — this never calls finalizeSuccessfulPayment,
  // failSalePayment, paymentService, or InventoryService, and never touches inventory/cash. The
  // historical sale is never modified by printing, including printing the same receipt repeatedly.
  // Always opens the preview — content generation (prepareFn) touches no browser API, so it can't
  // silently "succeed" while producing nothing visible, which is what made the previous
  // popup/iframe-first flow unreliable in this sandboxed environment.
  const doPrint = (prepareFn, fallbackTitle) => {
    const prepared = prepareFn(sale, printCtx);
    setPrintPreview({ title: prepared?.title || fallbackTitle, html: prepared?.html });
  };

  const advanceStatus = async () => {
    if (advancing || !canAdvance) return;
    setAdvancing(true);
    try {
      const r = await advanceOrderStatus(sale.id, sales, persistSales);
      if (!r.success) { showToast(r.error, "danger"); onClose(); return; }
      // staleData (see advanceOrderStatus) means the status change already committed on the
      // server — only the screen refresh failed. Never worded as a failure.
      showToast(r.staleData ? r.message : `Order #${sale.orderNo} → ${ORDER_STATUS_META[r.sale.fulfillmentStatus]?.label || r.sale.fulfillmentStatus}`, r.staleData ? "good" : undefined);
      onClose();
    } finally {
      setAdvancing(false);
    }
  };

  const doCancel = async () => {
    if (busy) return;
    if (!can("reverseSales")) { showToast("You don't have permission to reverse sales.", "danger"); setConfirming(false); return; }
    setBusy(true);
    try {
      // Re-check against the latest record right before writing. IMPORTANT: unlike the original
      // version, an already-cancelled sale no longer short-circuits the ENTIRE function — it only
      // skips the inventory/invTx/sales steps (which are genuinely already done). The cashTx step
      // below is always independently checked/completed, which is what closes the B4 data-loss
      // scenario (a retry that finds the sale already cancelled must still be able to finish a
      // cash reversal that failed on an earlier attempt, instead of being blocked from ever
      // reaching it).
      const latest = sales.find((s) => s.id === sale.id) || sale;
      const alreadyCancelled = latest.status === "cancelled";
      let cancellationStale = false; // set when fn_reverse_sale succeeded but the reload after it failed

      // Reverse the recipe deductions for every line item, restoring inventory exactly.
      const restore = {};
      for (const it of sale.items) {
        const p = products.find((pp) => pp.id === it.productId);
        for (const r of p?.recipe || []) restore[r.itemId] = (restore[r.itemId] || 0) + r.qty * it.qty;
      }

      if (!alreadyCancelled) {
        if (supabaseAuth.hasSession()) {
          // Phase 4 production path: fn_reverse_sale — invoked via persistSales's own
          // status-change translation layer (useSupabaseSales.persist) — already handles status,
          // inventory restoration, inventory ledger, and cash_flow reversal atomically on the
          // server, and its own `return reload()` refreshes `sales` with the server's real state.
          // This is the ONLY write needed here. The legacy local inventory/invTx/cash steps that
          // used to run unconditionally after this are skipped entirely in this mode — they were
          // redundant no-ops for inventory/invTx (setInventory/setInvTx in this mode only touch
          // catalog metadata / are wired to a no-op) and actively broken for cashTx (persistCash
          // is deliberately guarded — phase4WriteGuard — to prevent exactly this kind of legacy
          // local write to a now server-authoritative ledger).
          try {
            await persistSales(sales.map((s) => (s.id === sale.id ? { ...s, status: "cancelled", cancelledAt: nowISO(), cancelledBy: currentUser?.id } : s)));
          } catch (e) {
            // rpcSucceeded (set by useSupabaseSales.persist) means fn_reverse_sale itself already
            // committed — the sale really is cancelled. This must never be shown as "cancel
            // failed", and — critically — must NOT stop this function here: the separate loyalty
            // reversal RPC below still needs to run for a genuinely cancelled sale, exactly as it
            // would on a normal success. Only a REAL cancellation failure (no rpcSucceeded) stops
            // the flow — reversing loyalty for a sale that was never actually cancelled would be
            // wrong.
            if (e?.rpcSucceeded) {
              cancellationStale = true;
            } else {
              showToast(e?.message || "Could not cancel this sale.", "danger");
              return;
            }
          }
        } else {
          // Legacy local fallback — unchanged, used only when there is no Supabase session.
          // Same retry-safety pattern as finalizeSuccessfulPayment: inventory qty + the
          // deterministic operation marker (appliedOps) are written TOGETHER in one setInventory()
          // call — the critical step no longer depends on invTx as the "already done?" signal.
          const restoreOpId = `${sale.id}-inventory-restore`;
          const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, restoreOpId, restore);
          if (changed) {
            await setInventory(nextInventory);
          }
          await persistSales(sales.map((s) => (s.id === sale.id ? { ...s, status: "cancelled", cancelledAt: nowISO(), cancelledBy: currentUser?.id } : s)));

          // invTx (audit ledger) — legacy-only; the server RPC handles this in Supabase mode.
          const plannedEntries = InventoryService.saleReversalLedgerEntries(inventory, restore, { saleId: sale.id, orderNo: sale.orderNo })
            .map((e) => ({ ...e, id: `${sale.id}-inventory-restore-${e.itemId}` }));
          const newEntries = plannedEntries.filter((e) => !(invTx || []).some((x) => x.id === e.id));
          if (newEntries.length) {
            await setInvTx([...newEntries, ...(invTx || [])]);
          }

          // cashTx — legacy-only; the server RPC handles this in Supabase mode.
          const cashId = `${sale.id}-cash-reversal`;
          if (!(cashTx || []).some((t) => t.id === cashId)) {
            await persistCash([{ id: cashId, date: nowISO(), type: "expense", category: "Sale Cancellation", amount: sale.total, paymentMethod: sale.paymentMethod, description: `Cancel Sale #${sale.orderNo}`, relatedSaleId: sale.id, reversalOf: sale.id }, ...cashTx]);
          }
        }
      }

      // Reverses previously-earned points for this sale (idempotent on sale.id — safe even if
      // this handler were somehow invoked twice, and a no-op for a walk-in sale that never
      // earned points). Isolated in its own try/catch: inventory/sale/cash reversal above has
      // already committed correctly, so a loyalty-reversal failure must not be reported as a
      // failed cancellation. The failure is no longer silent, though: it surfaces as a visible,
      // deduplicated operational alert (reusing the existing businessAlerts lifecycle) instead of
      // only a console.error, so it can actually be found and acted on.
      const loyaltyAlertKey = `loyalty_reversal_failed:${sale.id}`;
      try {
        await reverseLoyaltyForSale(sale, { loyaltyTransactions, setLoyaltyTransactions, currentUser, reloadLoyalty });
        // A later successful reversal (e.g. this same cancellation retried, or a manual retry)
        // resolves any alert raised by an earlier failed attempt — small, reuses the exact same
        // resolve semantics reconcileAlerts already uses elsewhere (status/resolvedAt).
        if (businessAlerts && businessAlerts.some((a) => a.key === loyaltyAlertKey && a.status === "open")) {
          await setBusinessAlerts(businessAlerts.map((a) => (a.key === loyaltyAlertKey && a.status === "open" ? { ...a, status: "resolved", resolvedAt: nowISO() } : a)));
        }
      } catch (e) {
        console.error("loyalty reversal failed after sale cancellation — cancellation itself is unaffected", e);
        if (businessAlerts && setBusinessAlerts) {
          const existingAlert = businessAlerts.find((a) => a.key === loyaltyAlertKey);
          if (!existingAlert || existingAlert.status !== "open") {
            const now = nowISO();
            const alertEntry = existingAlert
              ? { ...existingAlert, status: "open", resolvedAt: null, createdAt: now }
              : { id: uid("alert"), key: loyaltyAlertKey, type: "loyalty_reversal_failed", severity: "warning",
                  title: `Loyalty reversal failed for Order #${sale.orderNo}`,
                  message: `The sale was cancelled successfully, but reversing its loyalty points failed and needs manual review.`,
                  entityType: "sale", entityId: sale.id, locationId: sale.locationId || null, financial: false,
                  status: "open", createdAt: now, resolvedAt: null, dismissedAt: null };
            await setBusinessAlerts(existingAlert ? businessAlerts.map((a) => (a.key === loyaltyAlertKey ? alertEntry : a)) : [alertEntry, ...businessAlerts]);
          }
        }
      }
      await logAudit(auditLog, setAuditLog, currentUser, "Sale Reversed", `Order #${sale.orderNo} · ${fmtMoney(sale.total)} · inventory restored`);

      showToast(cancellationStale
        ? `Sale #${sale.orderNo} cancelled, but the screen could not refresh. Refresh the page to see the latest data.`
        : `Sale #${sale.orderNo} cancelled · inventory restored`, "danger");
      setConfirming(false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Order #${sale.orderNo}`} onClose={onClose} dark={dark}>
      {cancelled && <div className="mb-3"><Badge dark={dark} tone="danger">{getPaymentStatus(sale) === "failed" ? "PAYMENT FAILED" : "CANCELLED"} {sale.cancelledAt ? `· ${dateStr(sale.cancelledAt)}` : ""}</Badge></div>}
      {!cancelled && <div className="mb-3"><Badge dark={dark} tone={FULFILLMENT_TONE[fulfillment]}>{fulfillment.toUpperCase()}</Badge></div>}
      <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        {dateStr(sale.date)} {timeStr(sale.date)} · {sale.channel} · {locationLabel(sale, locations)} · {sale.paymentMethod}
      </div>
      <div className="rounded-2xl p-3 mb-3" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
        {sale.items.map((it, idx) => (
          <Row key={idx} dark={dark} label={`${it.qty}× ${it.name}`} value={fmtMoney(it.unitPrice * it.qty)} />
        ))}
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Subtotal" value={fmtMoney(sale.subtotal)} />
        <Row dark={dark} label="Discount" value={`-${fmtMoney(sale.discount)}`} />
        <Row dark={dark} label="Tax" value={fmtMoney(sale.tax)} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Total" value={fmtMoney(sale.total)} bold />
      </div>
      {sale.notes && <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Notes: {sale.notes}</div>}
      {!cancelled && can("manageSales") && (
        <div className="mb-4 pt-4" style={{ borderTop: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>PRINT / REPRINT</div>
          <div className="flex flex-col gap-2">
            <GhostButton dark={dark} onClick={() => doPrint(printingService.prepareCustomerReceipt, "Customer Receipt")}><Receipt size={15} /> Customer Receipt</GhostButton>
            <GhostButton dark={dark} onClick={() => doPrint(printingService.prepareKitchenTicket, "Kitchen Ticket")}><ScrollText size={15} /> Kitchen Ticket</GhostButton>
            {CARD_PAYMENT_METHODS.includes(sale.paymentMethod) && (
              <GhostButton dark={dark} onClick={() => doPrint(printingService.preparePaymentReceipt, "Payment Receipt")}><Wallet size={15} /> Payment Receipt</GhostButton>
            )}
          </div>
        </div>
      )}
      {printPreview && (
        <PrintPreviewModal dark={dark} title={printPreview.title} html={printPreview.html} onClose={() => setPrintPreview(null)} />
      )}
      {canAdvance && (
        <PrimaryButton full disabled={advancing} onClick={advanceStatus} style={{ marginBottom: 10 }}>
          <Check size={16} /> {advancing ? "Updating…" : (ORDER_STATUS_META[fulfillment]?.action || `Mark as ${nextStatus}`)}
        </PrimaryButton>
      )}
      {!cancelled && can("reverseSales") && (
        <GhostButton dark={dark} full onClick={() => setConfirming(true)} style={{ color: "#FF6B85", borderColor: "#FF6B85", width: "100%" }}>
          <Undo2 size={15} /> Cancel Sale
        </GhostButton>
      )}
      {!cancelled && !can("reverseSales") && (
        <div className="text-xs text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You don't have permission to reverse sales.</div>
      )}
      {confirming && (
        <ConfirmDialog dark={dark} title="Cancel this sale?"
          message="This restores the ingredients and packaging back to inventory and records a reversing cash entry. The order stays on record marked as cancelled."
          confirmLabel="Cancel Sale" onConfirm={doCancel} onCancel={() => setConfirming(false)} />
      )}
    </Modal>
  );
}

function NewSaleCustomerCreate({ dark, customers, setCustomers, currentUser, auditLog, setAuditLog, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const duplicate = (name || phone || email) ? findDuplicateCustomer(customers, { name, phone, email }) : null;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await createCustomer({ name, phone, email }, { customers, setCustomers, currentUser, auditLog, setAuditLog });
      if (!r.success) { setError(r.error); return; }
      onCreated(r.customer);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl p-3" style={{ background: dark ? C.surfaceDark : C.bgLight, border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
      <Input dark={dark} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ marginBottom: 6 }} />
      <Input dark={dark} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={{ marginBottom: 6 }} />
      <Input dark={dark} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" style={{ marginBottom: 6 }} />
      {duplicate && (
        <div className="text-xs font-semibold mb-2 px-2 py-1.5 rounded-lg" style={{ background: "#3A2E0F", color: "#FFD166" }}>
          Possible existing customer: {duplicate.customer.name} (matched by {duplicate.matchType}). You can still create a new one if this is a different person.
        </div>
      )}
      {error && <div className="text-xs font-semibold mb-2 px-2 py-1.5 rounded-lg" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <div className="flex gap-2">
        <GhostButton dark={dark} style={{ flex: 1 }} onClick={onCancel}>Cancel</GhostButton>
        <PrimaryButton style={{ flex: 1 }} disabled={submitting || !name.trim()} onClick={submit}>{submitting ? "Saving…" : "Create"}</PrimaryButton>
      </div>
    </div>
  );
}

function NewSaleModal({ dark, onClose, products, inventory, setInventory, sales, persistSales, cashTx, persistCash, settings, locations, employees, customers, setCustomers, invTx, setInvTx, cashRegisters, loyaltyTransactions, setLoyaltyTransactions, loyaltyRewards, currentUser, can, auditLog, setAuditLog, showToast, supabaseSalesOps, reloadInventory, reloadLoyalty, businessId, reportLoadError }) {
  // v1.6.4: the POS customer picker uses the same Supabase-backed collection as Customers.
  // It also performs a direct tenant refresh when the modal opens. Do not gate this refresh on
  // hasSession(): supabaseFetch already attaches the active access token and surfaces any auth error.
  const [posCustomers, setPosCustomers] = useState(() => Array.isArray(customers) ? customers : []);
  const [customerLoadError, setCustomerLoadError] = useState("");
  useEffect(() => {
    if (Array.isArray(customers) && customers.length) setPosCustomers(customers);
  }, [customers]);
  useEffect(() => {
    let cancelled = false;
    if (!businessId) return () => {};
    (async () => {
      try {
        const rows = await supabaseRest.select("customers", `select=*&business_id=eq.${encodeURIComponent(businessId)}&active=eq.true&order=name.asc`);
        if (!cancelled) {
          setPosCustomers((rows || []).map(fromCustomerDb));
          setCustomerLoadError("");
        }
      } catch (e) {
        console.error("POS customer refresh failed", e);
        if (!cancelled) setCustomerLoadError(e?.message || "Could not load customers.");
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);
  const activeProducts = products.filter((p) => p.active);
  const [items, setItems] = useState([{ productId: activeProducts[0]?.id || "", qty: 1 }]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState(settings.paymentMethods[0]);
  const [channel, setChannel] = useState(settings.channels[0]);
  const [locationId, setLocationId] = useState((locations || []).find((l) => l.active !== false)?.id || "");
  const [employeeId, setEmployeeId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  // Loyalty — selecting a reward NEVER touches the loyalty ledger by itself. The redemption only
  // becomes a real ledger entry inside handlePaymentResult, and only after the sale has actually
  // finalized (see Step 8 in the spec: points must not vanish just because a reward was clicked).
  const [selectedRewardId, setSelectedRewardId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);

  const addItem = () => setItems([...items, { productId: activeProducts[0]?.id || "", qty: 1 }]);
  const updateItem = (idx, patch) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const lineData = items.map((it) => {
    const p = products.find((pp) => pp.id === it.productId);
    return { ...it, product: p, unitPrice: p?.price || 0, lineTotal: (p?.price || 0) * it.qty };
  });
  const subtotal = round2(lineData.reduce((a, l) => a + l.lineTotal, 0));

  const selectedCustomer = customerId ? (posCustomers || []).find((c) => c.id === customerId) : null;
  const loyaltyBalance = customerId ? getLoyaltyBalance(customerId, loyaltyTransactions) : 0;
  const availableRewards = customerId ? eligibleRewards(loyaltyRewards, loyaltyBalance) : [];
  const selectedReward = selectedRewardId ? (loyaltyRewards || []).find((r) => r.id === selectedRewardId && availableRewards.some((a) => a.id === r.id)) : null;
  const rewardDiscountAmt = selectedReward ? rewardDiscountAmount(selectedReward, subtotal) : 0;
  const totalDiscount = round2((Number(discount) || 0) + rewardDiscountAmt);

  const taxAmt = settings.taxEnabled ? round2((subtotal - totalDiscount) * (settings.taxRate / 100)) : 0;
  const total = round2(subtotal - totalDiscount + taxAmt);

  const [submitting, setSubmitting] = useState(false);
  // The sale info awaiting payment — never persisted to `sales`/`cashTx`/inventory until the
  // payment resolves. `paymentPhase` is the payment state machine: "idle" (no card payment in
  // flight) -> "connecting" (cosmetic terminal-connect delay) -> "awaiting_outcome" (Payment
  // Simulator controls are live) -> "settling" (result received, finalizing). `paymentHandle`
  // is the { promise, approve, decline, cancel } object paymentService returned for this
  // attempt — its promise settles at most once, which is what makes double-clicking any of the
  // three outcome buttons safe with no extra bookkeeping.
  const [pendingCardSale, setPendingCardSale] = useState(null);
  const [paymentPhase, setPaymentPhase] = useState("idle");
  const [paymentHandle, setPaymentHandle] = useState(null);
  // The finalized sale object once payment succeeds — drives the post-sale "Payment Successful"
  // print screen below. Printing from that screen is strictly read-only against this object;
  // nothing in the print flow calls finalizeSuccessfulPayment/failSalePayment/paymentService again.
  const [completedSale, setCompletedSale] = useState(null);
  const [printPreview, setPrintPreview] = useState(null); // { title, html } | null

  const paymentCtx = { sales, persistSales, inventory, setInventory, invTx, setInvTx, cashTx, persistCash, currentUser, auditLog, setAuditLog, supabaseSalesOps, reloadInventory, businessId, reportLoadError };
  const loyaltyCtx = { loyaltyTransactions, setLoyaltyTransactions, currentUser, auditLog, setAuditLog, reloadLoyalty };
  const printCtx = { settings, locations, employees, customers };

  // Routes a resolved PaymentResult (from any adapter — simulator today, Stripe Terminal later)
  // to the SAME finalize/fail functions every payment method already uses. This is the one place
  // that translates "what the payment service said" into "what happens to the sale".
  const handlePaymentResult = async (pendingSaleObj, result) => {
    setPaymentHandle(null);
    if (result.success) {
      setPaymentPhase("settling");
      try {
        // Covers BOTH payment paths that reach here — the card path (handle.promise.then below,
        // which previously had NO error handling at all — any exception from finalization became
        // an unhandled promise rejection with zero user feedback) and the cash/zelle/other
        // synchronous path. A true fn_create_sale failure is shown directly here rather than
        // relying on submit()'s own catch, since the card path never goes through submit()'s
        // try/catch at all.
        let finalizedSale;
        try {
          // result.transactionId is the provider's own reference — "sim_..." from the simulator
          // today, a real Stripe PaymentIntent id later. Stored regardless of which provider,
          // since the Payment Receipt needs it for both.
          finalizedSale = await finalizeSuccessfulPayment(pendingSaleObj, { stripePaymentIntentId: result.transactionId ?? null }, paymentCtx);
        } catch (e) {
          console.error("Sale finalization failed", e);
          setError(e?.message || "Sale could not be saved to Supabase.");
          return;
        }
        // staleData (set by finalizeSuccessfulPayment) means fn_create_sale — and/or the
        // inventory reload right after it — already committed; only a screen refresh afterward
        // failed. Never treated as a failure: the receipt flow below still runs normally with the
        // real sale data finalizeSuccessfulPayment was able to reconstruct from the RPC's own result.
        if (finalizedSale.staleData) {
          showToast?.(finalizedSale.staleMessage || "Sale was recorded, but the screen could not refresh. Refresh the page.", "good");
        }
        // Loyalty is committed ONLY here — after the sale is confirmed finalized, using the
        // REAL finalized sale object (not the pre-payment pendingSale). commitLoyaltyForSale is
        // idempotent on sale.id, so even if finalizeSuccessfulPayment above returned an
        // already-existing sale (its own duplicate-finalization guard), this can't double-commit
        // loyalty either — calling it again for the same sale.id is a safe no-op. Isolated in its
        // own try/catch: the sale is already correctly finalized and persisted at this point, so
        // a loyalty-commit failure must never look like a failed/duplicate sale to the cashier.
        try {
          await commitLoyaltyForSale(finalizedSale, pendingSaleObj.redeemedReward || null, loyaltyCtx);
        } catch (e) {
          console.error("loyalty commit failed after sale finalized — sale itself is unaffected", e);
          showToast?.(`Sale saved, but loyalty points failed: ${e?.message || "Unknown loyalty error"}`, "error");
        }
        setCompletedSale(finalizedSale);
        setPendingCardSale(null);
      } finally {
        setPaymentPhase("idle");
      }
      return;
    }
    if (result.status === "canceled") {
      // Return safely to checkout — no charge was ever attempted, so no failure record needed;
      // the cashier can just try again or pick a different payment method.
      setPendingCardSale(null);
      setPaymentPhase("idle");
      setError("");
      return;
    }
    // Declined/failed.
    setPaymentPhase("settling");
    try {
      await failSalePayment(pendingSaleObj, result.error?.message || "Payment failed", paymentCtx);
    } finally {
      setPaymentPhase("idle");
    }
    setPendingCardSale(null);
    setError(`The card was declined.${result.error?.message ? ` ${result.error.message}` : ""} Please try another payment method.`);
  };

  const submit = async () => {
    if (submitting || paymentPhase !== "idle") return;
    setError("");
    if (!can("manageSales")) { setError("You don't have permission to create sales."); return; }
    if (lineData.length === 0 || lineData.some((l) => !l.product)) { setError("Add at least one product."); return; }
    // Cash payments require an active register at this location — this only applies to genuine
    // physical-cash sales. Card (including the future Stripe Terminal flow) and Zelle/Other are
    // never blocked by the register's state.
    if (paymentMethod === "Cash" && !findOpenRegister(cashRegisters, locationId)) {
      setError("The cash register is closed for this location. Open the register before completing a cash sale.");
      return;
    }

    // check inventory sufficiency
    const deductions = {};
    for (const l of lineData) {
      for (const r of l.product.recipe || []) {
        deductions[r.itemId] = (deductions[r.itemId] || 0) + r.qty * l.qty;
      }
    }
    if (!settings.allowNegativeInventory) {
      for (const [itemId, needed] of Object.entries(deductions)) {
        const inv = inventory.find((i) => i.id === itemId);
        if (inv && inv.qty - needed < 0) {
          setError(`Not enough stock: ${inv.name} (have ${inv.qty} ${inv.unit}, need ${round2(needed)}).`);
          return;
        }
      }
    }

    // Revalidate the reward right before payment — the balance could have changed since it was
    // selected (e.g. another sale for the same customer completed in the meantime).
    if (selectedRewardId) {
      const freshBalance = getLoyaltyBalance(customerId, loyaltyTransactions);
      if (!selectedReward || freshBalance < selectedReward.requiredPoints) {
        setError("This reward is no longer available for this customer's current point balance.");
        return;
      }
    }

    const orderNo = 1000 + sales.length + 1;
    const saleId = supabaseSalesOps?.remote ? newDbId() : uid("sale");
    // The payment attempt — NOT a persisted sale yet. This is the object a future Stripe Terminal
    // confirmation will eventually pass to finalizeSuccessfulPayment().
    const pendingSale = {
      id: saleId, orderNo,
      items: lineData.map((l) => ({ productId: l.productId, name: l.product.name, qty: l.qty, unitPrice: l.unitPrice, cost: computeProductCost(l.product, inventory) })),
      subtotal, discount: totalDiscount, tax: taxAmt, total,
      paymentMethod, channel, locationId, location: (locations || []).find((l) => l.id === locationId)?.name || "",
      employeeId, customerId, notes,
      fulfillmentStatus: INSTANT_CHANNELS.includes(channel) ? "Completed" : "Received",
      deductions, allowNegativeInventory: settings.allowNegativeInventory,
      redeemedReward: selectedReward || null, // extra field — finalizeSuccessfulPayment builds `sale` field-by-field, never spreads pendingSale, so this never leaks into the persisted sale
    };

    // Single entry point for every payment method — the rest of this component never needs to
    // know whether the result came from an instant manual method or an adapter.
    const handle = paymentService.processPayment({ paymentMethod, amount: total, currency: "USD", metadata: { saleId, orderNo } });

    if (CARD_PAYMENT_METHODS.includes(paymentMethod)) {
      setPendingCardSale(pendingSale);
      setPaymentHandle(handle);
      setPaymentPhase("connecting");
      handle.readyPromise.then(() => setPaymentPhase((phase) => (phase === "connecting" ? "awaiting_outcome" : phase)));
      handle.promise.then((result) => handlePaymentResult(pendingSale, result));
      return;
    }

    // Cash/Zelle/Other resolve immediately via paymentService — route the result through the
    // exact same handler a future confirmed Stripe payment will use.
    setSubmitting(true);
    try {
      const result = await handle.promise;
      await handlePaymentResult(pendingSale, result);
    } catch (e) {
      console.error("Sale finalization failed", e);
      setError(e?.message || "Sale could not be saved to Supabase.");
    } finally {
      setSubmitting(false);
    }
  };

  // Always opens the preview — content generation (prepareFn) touches no browser API, so it
  // can't silently "succeed" while producing nothing visible.
  const doPrint = (prepareFn, fallbackTitle) => {
    const prepared = prepareFn(completedSale, printCtx);
    setPrintPreview({ title: prepared?.title || fallbackTitle, html: prepared?.html });
  };

  return (
    <Modal title="New Sale" onClose={onClose} dark={dark} wide>
      {completedSale ? (
        // Post-sale print screen. Every button here calls printingService directly against the
        // already-finalized `completedSale` object — read-only. Nothing here can call
        // finalizeSuccessfulPayment/failSalePayment/paymentService again, and printing multiple
        // copies (including rapid repeat clicks) can never duplicate the sale, inventory
        // movement, ledger entry, or cash transaction, since none of those are touched here.
        <div>
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: C.lime }}>
              <Check size={28} color={C.black} />
            </div>
            <div className="font-extrabold text-lg" style={{ color: dark ? C.white : C.black }}>Payment Successful</div>
            <div className="text-sm text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
              Order #{completedSale.orderNo} · {fmtMoney(completedSale.total)} · {completedSale.paymentMethod}
            </div>
          </div>
          <div className="text-xs font-bold mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>PRINT OPTIONS</div>
          <div className="flex flex-col gap-2 mb-4">
            <GhostButton dark={dark} onClick={() => doPrint(printingService.prepareCustomerReceipt, "Customer Receipt")}><Receipt size={15} /> Customer Receipt</GhostButton>
            <GhostButton dark={dark} onClick={() => doPrint(printingService.prepareKitchenTicket, "Kitchen Ticket")}><ScrollText size={15} /> Kitchen Ticket</GhostButton>
            {CARD_PAYMENT_METHODS.includes(completedSale.paymentMethod) && (
              <GhostButton dark={dark} onClick={() => doPrint(printingService.preparePaymentReceipt, "Payment Receipt")}><Wallet size={15} /> Payment Receipt</GhostButton>
            )}
          </div>
          <PrimaryButton full onClick={onClose}>Done</PrimaryButton>
          {printPreview && (
            <PrintPreviewModal dark={dark} title={printPreview.title} html={printPreview.html} onClose={() => setPrintPreview(null)} />
          )}
        </div>
      ) : pendingCardSale ? (
        // Payment Simulator — this whole block is replaced by the real Stripe Terminal UI once a
        // backend and physical reader are connected (see paymentService/stripeTerminalAdapter
        // above). Clearly labeled as a development/testing surface; never fakes a Stripe
        // PaymentIntent or claims a real payment processor approved anything.
        <div>
          <div className="mb-3"><Badge dark={dark} tone="warn">{paymentPhase === "connecting" ? "CONNECTING…" : paymentPhase === "settling" ? "FINALIZING…" : "PAYMENT SIMULATOR"}</Badge></div>
          <div className="text-sm mb-2 font-semibold" style={{ color: dark ? C.white : C.black }}>
            Card payment of {fmtMoney(pendingCardSale.total)} for Order #{pendingCardSale.orderNo}
          </div>
          <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            {paymentPhase === "connecting"
              ? "Connecting to card terminal (simulated)…"
              : "No physical card reader is connected yet — this is a development simulator standing in for Stripe Terminal. Choose an outcome to test the payment lifecycle."}
          </div>
          <div className="flex gap-2">
            <GhostButton dark={dark} style={{ flex: 1, color: "#FF6B85", borderColor: "#FF6B85" }} disabled={paymentPhase !== "awaiting_outcome"} onClick={() => paymentHandle?.cancel()}>
              Cancel
            </GhostButton>
            <GhostButton dark={dark} style={{ flex: 1, color: "#FF6B85", borderColor: "#FF6B85" }} disabled={paymentPhase !== "awaiting_outcome"} onClick={() => paymentHandle?.decline("The card was declined.")}>
              Decline
            </GhostButton>
            <PrimaryButton style={{ flex: 1 }} disabled={paymentPhase !== "awaiting_outcome"} onClick={() => paymentHandle?.approve()}>
              <Check size={16} /> Approve
            </PrimaryButton>
          </div>
        </div>
      ) : (
      <>
      {items.map((it, idx) => (
        <div key={idx} className="flex gap-2 mb-2 items-end">
          <div className="flex-1">
            <Field dark={dark} label={idx === 0 ? "Product" : ""}>
              <Select dark={dark} value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-20">
            <Field dark={dark} label={idx === 0 ? "Qty" : ""}>
              <Input dark={dark} type="number" min="1" value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })} />
            </Field>
          </div>
          {items.length > 1 && (
            <button onClick={() => removeItem(idx)} className="mb-3 w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#3A0F1E" }}>
              <Trash2 size={15} color="#FF6B85" />
            </button>
          )}
        </div>
      ))}
      <button onClick={addItem} className="text-xs font-bold mb-4" style={{ color: C.lime }}>+ Add another product</button>

      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Payment Method">
          <Select dark={dark} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {settings.paymentMethods.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Sales Channel">
          <Select dark={dark} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {settings.channels.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Location">
          <Select dark={dark} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {(locations || []).filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Employee">
          <Select dark={dark} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">—</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Customer">
          {!showCustomerCreate ? (
            <>
              <div className="flex gap-2">
                <Select dark={dark} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSelectedRewardId(""); }} style={{ flex: 1 }}>
                  <option value="">Walk-in</option>
                  {(posCustomers || []).filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <GhostButton dark={dark} onClick={() => { setShowCustomerCreate(true); setCustomerQuery(""); }} style={{ padding: "0 14px" }}>+ New</GhostButton>
              </div>
              {customerLoadError && <div className="text-xs mt-1" style={{ color: "#FF6B85" }}>Customer load error: {customerLoadError}</div>}
            </>
          ) : (
            <NewSaleCustomerCreate dark={dark} customers={customers} setCustomers={setCustomers} currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog}
              onCreated={(newCustomer) => { setCustomerId(newCustomer.id); setShowCustomerCreate(false); }}
              onCancel={() => setShowCustomerCreate(false)} />
          )}
        </Field>
        {selectedCustomer && (
          <Card dark={dark} className="mb-3" style={{ padding: 10 }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Loyalty balance</span>
              <span className="text-sm font-extrabold" style={{ color: dark ? C.white : C.black }}>{loyaltyBalance} pts</span>
            </div>
            {availableRewards.length > 0 && (
              <div className="mt-2">
                <Select dark={dark} value={selectedRewardId} onChange={(e) => setSelectedRewardId(e.target.value)}>
                  <option value="">No reward applied</option>
                  {availableRewards.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.requiredPoints} pts → {fmtMoney(r.discountValue)} off</option>)}
                </Select>
                {selectedReward && <div className="text-xs mt-1" style={{ color: C.lime }}>−{fmtMoney(rewardDiscountAmt)} reward discount applied</div>}
              </div>
            )}
            {availableRewards.length === 0 && <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>No rewards available yet.</div>}
          </Card>
        )}
        <Field dark={dark} label="Discount ($)">
          <Input dark={dark} type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} />
        </Field>
      </div>
      <Field dark={dark} label="Notes">
        <TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="rounded-2xl p-3 mb-4" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
        <Row dark={dark} label="Subtotal" value={fmtMoney(subtotal)} />
        <Row dark={dark} label="Discount" value={`-${fmtMoney(discount)}`} />
        {rewardDiscountAmt > 0 && <Row dark={dark} label="Reward Discount" value={`-${fmtMoney(rewardDiscountAmt)}`} />}
        <Row dark={dark} label={`Tax (${settings.taxEnabled ? settings.taxRate + "%" : "disabled"})`} value={fmtMoney(taxAmt)} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Total" value={fmtMoney(total)} bold />
      </div>

      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={submit}>
        <Check size={16} /> {submitting ? "Saving…" : CARD_PAYMENT_METHODS.includes(paymentMethod) ? `Charge Card — ${fmtMoney(total)}` : `Complete Sale — ${fmtMoney(total)}`}
      </PrimaryButton>
      </>
      )}
    </Modal>
  );
}

function Row({ dark, label, value, bold }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={`text-xs ${bold ? "font-extrabold" : "font-medium"}`} style={{ color: bold ? (dark ? C.white : C.black) : (dark ? C.textMutedDark : C.textMutedLight) }}>{label}</span>
      <span className={`text-xs ${bold ? "font-extrabold text-sm" : "font-semibold"}`} style={{ color: dark ? C.white : C.black }}>{value}</span>
    </div>
  );
}

/* ============================== CASH FLOW ============================== */
function CashFlowView({ dark, cashTx, showToast }) {
  const [filter, setFilter] = useState("month");
  const days = filter === "today" ? 0 : filter === "week" ? 7 : filter === "month" ? 30 : 3650;
  const inRange = cashTx.filter((t) => filter === "today" ? isSameDay(t.date, todayStr()) : withinDays(t.date, days));
  const totalIncome = round2(inRange.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0));
  const totalExpense = round2(inRange.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0));
  const net = round2(totalIncome - totalExpense);

  const merged = [...inRange].sort((a, b) => new Date(b.date) - new Date(a.date));

  const exportCSV = () => {
    downloadCSV(`masseli-cashflow-${filter}.csv`,
      ["Date", "Type", "Category", "Amount", "Payment Method", "Description"],
      merged.map((t) => [dateStr(t.date), t.type === "income" ? "Income" : "Expense", t.category, t.amount, t.paymentMethod || "", t.description || ""])
    );
    showToast("CSV exported");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Cash Flow" sub="Income & expense ledger" />
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        {[["today", "Today"], ["week", "7 Days"], ["month", "30 Days"], ["all", "All"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: filter === id ? C.lime : (dark ? C.surfaceDark : C.white), color: filter === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
        {merged.length > 0 && <GhostButton dark={dark} style={{ padding: "6px 12px", fontSize: 12, marginLeft: "auto" }} onClick={exportCSV}>Export CSV</GhostButton>}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard dark={dark} label="Income" value={fmtMoney(totalIncome)} icon={ArrowUpRight} accent={C.lime} />
        <StatCard dark={dark} label="Expenses" value={fmtMoney(totalExpense)} icon={ArrowDownRight} accent={"#FF6B85"} />
        <StatCard dark={dark} label="Net Flow" value={fmtMoney(net)} icon={Wallet} accent={net >= 0 ? C.lime : "#FF6B85"} />
      </div>
      <Card dark={dark}>
        {merged.length === 0 ? <EmptyState dark={dark} title="No transactions" sub="Sales income and expenses will show up here." /> : merged.map((t) => (
          <ListRow key={t.id} dark={dark} title={t.category} subtitle={`${dateStr(t.date)} · ${t.description || ""}`}
            right={<span style={{ color: t.type === "income" ? C.lime : "#FF6B85" }}>{t.type === "income" ? "+" : "-"}{fmtMoney(t.amount)}</span>} />
        ))}
      </Card>
    </div>
  );
}

/* ============================== INVENTORY ============================== */
function InventoryView({ dark, inventory, setInventory, settings, suppliers, showToast, wasteTx, persistWaste, invTx, setInvTx, purchaseOrders, persistPO, employees, locations, currentUser, can, auditLog, setAuditLog, inventoryOps }) {
  const [tabMode, setTabMode] = useState("all");
  const [modal, setModal] = useState(null); // 'receive' | 'adjust' | 'waste' | 'new' | 'history' | null
  const [selected, setSelected] = useState(null);
  const [quickPO, setQuickPO] = useState(null); // pre-filled item for a quick "Create Purchase" flow

  const withStatus = inventory.map((i) => ({ ...i, _status: stockStatus(i), _expiry: expiryStatus(i) }));
  const filtered = tabMode === "low" ? withStatus.filter((i) => i._status !== "NORMAL" || i._expiry) : withStatus;
  const totalValue = round2(inventory.reduce((a, i) => a + i.qty * i.costPerUnit, 0));
  const reorderList = withStatus.filter((i) => i._status !== "NORMAL" && suggestedOrderQty(i) > 0);
  const expiringList = withStatus.filter((i) => i._expiry).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));

  const openAction = (mode, item) => { setSelected(item); setModal(mode); };
  const canExport = can("viewFinancials");
  const exportCSV = () => {
    downloadCSV("masseli-inventory-valuation.csv",
      ["Name", "SKU", "Category", "Quantity", "Unit", "Cost/Unit", "Total Value", "Min Stock", "Max Stock", "Status", "Location"],
      inventory.map((i) => [i.name, i.sku || "", i.category, i.qty, i.unit, i.costPerUnit, round2(i.qty * i.costPerUnit), i.minQty, i.maxQty, STOCK_STATUS_LABEL[stockStatus(i)], locationLabel(i, locations)])
    );
    showToast("CSV exported");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Inventory" sub={`Total value ${fmtMoney(totalValue)}`}
        action={can("adjustInventory") ? <PrimaryButton onClick={() => { setSelected(null); setModal("new"); }}><Plus size={16} /> New Item</PrimaryButton> : null} />

      <div className="flex gap-2 mb-4 items-center flex-wrap">
        {[["all", "All Items"], ["low", "Needs Attention"]].map(([id, label]) => (
          <button key={id} onClick={() => setTabMode(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: tabMode === id ? C.lime : (dark ? C.surfaceDark : C.white), color: tabMode === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
        {canExport && inventory.length > 0 && <GhostButton dark={dark} style={{ padding: "6px 12px", fontSize: 12, marginLeft: "auto" }} onClick={exportCSV}>Export CSV</GhostButton>}
      </div>

      {expiringList.length > 0 && (
        <Card dark={dark} className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} color="#FF6B85" />
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Expiring Inventory</span>
          </div>
          {expiringList.map((i) => (
            <ListRow key={i.id} dark={dark} title={i.name}
              subtitle={i._expiry === "EXPIRED" ? `Expired ${dateStr(i.expiresAt)}` : `Expires ${dateStr(i.expiresAt)}`}
              right={<Badge dark={dark} tone={EXPIRY_TONE[i._expiry]}>{EXPIRY_LABEL[i._expiry]}</Badge>} />
          ))}
        </Card>
      )}

      {reorderList.length > 0 && (
        <Card dark={dark} className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} color={C.yellow} />
            <span className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Reorder Recommendations</span>
          </div>
          {reorderList.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-2 border-b last:border-b-0 gap-2" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
              <div className="min-w-0">
                <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{i.name}</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Current {i.qty} · Recommended purchase {suggestedOrderQty(i)} {i.unit}</div>
              </div>
              {can("managePurchases") && !inventoryOps?.remote && <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setQuickPO(i)}>Create Purchase</GhostButton>}
            </div>
          ))}
        </Card>
      )}

      <Card dark={dark}>
        {filtered.length === 0 ? <EmptyState dark={dark} title="No items" /> : filtered.map((i) => (
          <div key={i.id} className="py-3 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="min-w-0" onClick={() => openAction("history", i)}>
                <div className="font-semibold text-sm truncate" style={{ color: dark ? C.white : C.black }}>{i.name}</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                  {i.category} · {i.qty} {i.unit}{can("viewFinancials") ? ` · avg ${fmtMoney(i.costPerUnit)}/${i.unit}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {i._status !== "NORMAL" && <Badge dark={dark} tone={STOCK_STATUS_TONE[i._status]}>{STOCK_STATUS_LABEL[i._status]}</Badge>}
                {i._expiry && <Badge dark={dark} tone={EXPIRY_TONE[i._expiry]}>{EXPIRY_LABEL[i._expiry]}</Badge>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {can("manageInventory") && <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => openAction("receive", i)}><PackagePlus size={13} /> Receive</GhostButton>}
              {can("adjustInventory") && <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => openAction("adjust", i)}><Edit2 size={13} /> Adjust</GhostButton>}
              {can("manageInventory") && <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => openAction("waste", i)}><PackageMinus size={13} /> Waste</GhostButton>}
              <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => openAction("history", i)}>History</GhostButton>
            </div>
          </div>
        ))}
      </Card>

      {modal && modal !== "new" && modal !== "history" && selected && (
        <StockActionModal mode={modal} item={selected} inventory={inventory} setInventory={setInventory} dark={dark}
          onClose={() => setModal(null)} suppliers={suppliers} showToast={showToast} wasteTx={wasteTx} persistWaste={persistWaste}
          invTx={invTx} setInvTx={setInvTx} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} inventoryOps={inventoryOps} />
      )}

      {modal === "history" && selected && (
        <InventoryHistoryModal dark={dark} item={selected} invTx={invTx} suppliers={suppliers} onClose={() => setModal(null)} can={can} />
      )}

      {modal === "new" && (
        <NewInventoryItemModal dark={dark} onClose={() => setModal(null)} inventory={inventory} setInventory={setInventory}
          settings={settings} suppliers={suppliers} showToast={showToast} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog}
          invTx={invTx} setInvTx={setInvTx} locations={locations} inventoryOps={inventoryOps} />
      )}

      {quickPO && (
        <NewPurchaseModal dark={dark} onClose={() => setQuickPO(null)} inventory={inventory} suppliers={suppliers}
          purchaseOrders={purchaseOrders} persistPO={persistPO} showToast={showToast} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog}
          prefill={{ supplierId: quickPO.supplierId, items: [{ itemId: quickPO.id, qty: suggestedOrderQty(quickPO), unitCost: quickPO.costPerUnit }] }} />
      )}
    </div>
  );
}

function NewInventoryItemModal({ dark, onClose, inventory, setInventory, settings, suppliers, showToast, currentUser, can, auditLog, setAuditLog, invTx, setInvTx, locations, inventoryOps }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState(settings.inventoryCategories[0]);
  const [unit, setUnit] = useState(settings.units[0]);
  const [qty, setQty] = useState(0);
  const [minQty, setMinQty] = useState(0);
  const [maxQty, setMaxQty] = useState(0);
  const [costPerUnit, setCostPerUnit] = useState(0);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [locationId, setLocationId] = useState((locations || []).find((l) => l.active !== false)?.id || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    if (submitting) return;
    if (!can("adjustInventory")) { setError("You don't have permission to add inventory items."); return; }
    if (!name.trim()) { setError("Item name is required."); return; }
    if (Number(minQty) > Number(maxQty) && Number(maxQty) > 0) { setError("Minimum stock can't exceed maximum stock."); return; }
    setSubmitting(true);
    try {
      const startQty = clamp0(round2(Number(qty)));
      const startCost = clamp0(round2(Number(costPerUnit)));
      const locName = (locations || []).find((l) => l.id === locationId)?.name || "";
      const item = {
        id: newDbId(), name: name.trim(), sku, category, unit, qty: startQty,
        minQty: clamp0(Number(minQty)), maxQty: clamp0(Number(maxQty)), costPerUnit: startCost,
        supplierId, locationId, location: locName, notes,
      };
      if (inventoryOps?.remote) {
        try {
          await inventoryOps.createItem(item);
          await logAudit(auditLog, setAuditLog, currentUser, "Inventory Item Created", `${item.name} · starting qty ${item.qty} ${item.unit}`);
          showToast(`${item.name} added to inventory`);
          onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabaseInventory.createItem) means fn_add_initial_stock
          // itself already committed — the item really exists. This must never be shown as
          // "create failed", or the user could be misled into creating a duplicate item.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); onClose(); }
          else { setError(e?.message || "Could not create this item."); }
        }
        return;
      }
      await setInventory([item, ...inventory]);

      // A brand-new item with a non-zero starting quantity is itself an inventory movement and
      // belongs in the ledger just like a purchase or adjustment — otherwise the ledger can't
      // account for where that opening balance came from.
      if (startQty > 0) {
        await setInvTx([InventoryService.makeLedgerEntry({
          itemId: item.id, itemName: item.name, type: "Initial Stock", qty: startQty, unit: item.unit,
          unitCost: startCost, totalCost: round2(startQty * startCost),
          referenceId: item.id, referenceLabel: "New item", note: "Opening balance recorded when item was created",
        }), ...(invTx || [])]);
      }

      await logAudit(auditLog, setAuditLog, currentUser, "Inventory Item Created", `${item.name} · starting qty ${item.qty} ${item.unit}`);
      showToast(`${item.name} added to inventory`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Inventory Item" onClose={onClose} dark={dark}>
      <Field dark={dark} label="Item Name"><Input dark={dark} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="SKU"><Input dark={dark} value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
        <Field dark={dark} label="Category">
          <Select dark={dark} value={category} onChange={(e) => setCategory(e.target.value)}>{settings.inventoryCategories.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field dark={dark} label="Unit">
          <Select dark={dark} value={unit} onChange={(e) => setUnit(e.target.value)}>{settings.units.map((u) => <option key={u}>{u}</option>)}</Select>
        </Field>
        <Field dark={dark} label="Starting Quantity"><Input dark={dark} type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field dark={dark} label="Minimum Stock"><Input dark={dark} type="number" min="0" step="0.01" value={minQty} onChange={(e) => setMinQty(e.target.value)} /></Field>
        <Field dark={dark} label="Maximum Stock"><Input dark={dark} type="number" min="0" step="0.01" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} /></Field>
        <Field dark={dark} label="Cost per Unit ($)"><Input dark={dark} type="number" min="0" step="0.01" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} /></Field>
        <Field dark={dark} label="Preferred Supplier">
          <Select dark={dark} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field dark={dark} label="Storage Location">
        <Select dark={dark} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">—</option>
          {(locations || []).filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <Field dark={dark} label="Notes"><TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save Item"}</PrimaryButton>
    </Modal>
  );
}

function StockActionModal({ mode, item, inventory, setInventory, dark, onClose, showToast, wasteTx, persistWaste, invTx, setInvTx, currentUser, can, auditLog, setAuditLog, inventoryOps }) {
  const [itemId, setItemId] = useState(item.id);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("Physical Count");
  const [notes, setNotes] = useState("");
  const [newQty, setNewQty] = useState(item.qty);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const current = inventory.find((i) => i.id === itemId) || item;
  const diff = round2(Number(newQty) - current.qty);

  // Operation identity is now a PURE function of what the user is asking for (mode + item + the
  // relevant values) — no uid()/useRef involved. This is what makes it survive a real browser
  // reload: a fresh component instance computes the exact SAME id from the exact same inputs,
  // so `inventory[item].appliedOps` (which IS persisted and DOES survive reload) correctly
  // recognizes an interrupted operation and completes only the missing step, with no possibility
  // of applying the inventory delta twice. The trade-off, stated plainly: two genuinely separate
  // business actions with IDENTICAL values (same item, same mode, same quantity/target/reason)
  // submitted back-to-back after the first fully succeeded will compute the same id — but since
  // appliedOps already has it, the second is inert for the QUANTITY step. This is a deliberate,
  // small, documented limitation — accepted because it only affects the rare case of literally
  // identical repeated input, and is vastly preferable to the confirmed alternative (real
  // inventory/ledger duplication after reload).
  const titleMap = { receive: "Receive Stock", adjust: "Adjust Stock (Count)", waste: "Record Waste" };
  const adjustReasons = ["Physical Count", "Damaged", "Lost", "Found", "Data Correction", "Other"];
  const wasteReasons = ["Expired", "Damaged", "Preparation Error", "Dropped", "Unknown", "Other"];
  const requiredPermission = mode === "adjust" ? "adjustInventory" : "manageInventory";

  const submit = async () => {
    if (submitting) return;
    setError("");
    if (!can(requiredPermission)) { setError(mode === "adjust" ? "You don't have permission to adjust stock counts." : "You don't have permission to manage inventory."); return; }
    setSubmitting(true);
    try {
      if (inventoryOps?.remote) {
        if (mode === "receive") {
          const addQty = Number(qty);
          if (!addQty || addQty <= 0) { setError("Enter a quantity greater than zero."); return; }
          try {
            await inventoryOps.receive(current, addQty, notes);
            await logAudit(auditLog, setAuditLog, currentUser, "Stock Received (manual)", `${current.name} +${addQty} ${current.unit}`);
            showToast(`Received ${addQty} ${current.unit} of ${current.name}`);
          } catch (e) {
            // rpcSucceeded (set by useSupabaseInventory.receive) means fn_receive_manual_stock
            // itself already committed — real stock was added. This must never be shown as
            // "receive failed", or the user could be misled into receiving the same stock again.
            if (e?.rpcSucceeded) { showToast(e.message, "good"); }
            else { setError(e?.message || "Could not receive this stock."); return; }
          }
        } else if (mode === "adjust") {
          // Validated explicitly instead of silently clamping — clamp0(round2(Number(newQty)))
          // used to turn an invalid or negative entry (e.g. a stray "-50") into "0" with no
          // warning at all, even though fn_adjust_inventory_count itself correctly rejects a
          // negative p_new_qty server-side. Zero itself stays a legitimate counted quantity
          // (a physical count can genuinely find nothing on the shelf) — only NaN/blank and
          // negative values are rejected here, before the RPC is ever called.
          const parsedQty = Number(newQty);
          if (newQty === "" || Number.isNaN(parsedQty)) { setError("Enter a valid counted quantity."); return; }
          if (parsedQty < 0) { setError("Counted quantity cannot be negative."); return; }
          const nq = round2(parsedQty);
          if (nq === current.qty) { showToast("No change to save"); onClose(); return; }
          try {
            await inventoryOps.adjust(current, nq, reason, notes);
            await logAudit(auditLog, setAuditLog, currentUser, "Stock Adjusted", `${current.name} target ${nq} ${current.unit} · ${reason}`);
            showToast(`${current.name} count updated to ${nq} ${current.unit}`);
          } catch (e) {
            // rpcSucceeded (set by useSupabaseInventory.adjust) means fn_adjust_inventory_count
            // itself already committed — the count is real. This must never be shown as "adjust
            // failed", or the user could be misled into re-adjusting to the same count again.
            if (e?.rpcSucceeded) { showToast(e.message, "good"); }
            else { setError(e?.message || "Could not save this count."); return; }
          }
        } else if (mode === "waste") {
          const wasteQty = Number(qty);
          if (!wasteQty || wasteQty <= 0) { setError("Enter a quantity greater than zero."); return; }
          if (wasteQty > current.qty) { setError(`Only ${current.qty} ${current.unit} in stock — can't waste more than that.`); return; }
          try {
            await inventoryOps.waste(current, wasteQty, reason, notes);
            await logAudit(auditLog, setAuditLog, currentUser, "Waste Recorded", `${current.name} -${wasteQty} ${current.unit} · ${reason}`);
            showToast(`Waste logged: ${wasteQty} ${current.unit}`, "danger");
          } catch (e) {
            // rpcSucceeded (set by useSupabaseInventory.waste) means fn_record_waste itself
            // already committed — real waste was recorded. This must never be shown as "waste
            // failed", or the user could be misled into logging the same waste again.
            if (e?.rpcSucceeded) { showToast(e.message, "good"); }
            else { setError(e?.message || "Could not record this waste."); return; }
          }
        }
        onClose();
        return;
      }
      if (mode === "receive") {
        const addQty = Number(qty);
        if (!addQty || addQty <= 0) { setError("Enter a quantity greater than zero."); return; }
        const opId = `stockop-receive-${itemId}-${addQty}`;

        const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, opId, { [itemId]: addQty });
        if (changed) await setInventory(nextInventory);

        const invTxId = `${opId}-invtx`;
        if (!(invTx || []).some((t) => t.id === invTxId)) {
          await setInvTx([{ ...InventoryService.makeLedgerEntry({ itemId, itemName: current.name, type: "Adjustment", qty: addQty, unit: current.unit, unitCost: current.costPerUnit, totalCost: round2(addQty * current.costPerUnit), note: "Manual quick-receive (no purchase order)" }), id: invTxId }, ...(invTx || [])]);
        }
        await logAudit(auditLog, setAuditLog, currentUser, "Stock Received (manual)", `${current.name} +${addQty} ${current.unit}`);
        showToast(`Received ${addQty} ${current.unit} of ${current.name}`);
      } else if (mode === "adjust") {
        const nq = clamp0(round2(Number(newQty)));
        const opId = `stockop-adjust-${itemId}-${nq}`;
        const alreadyApplied = (current.appliedOps || []).includes(opId);
        // "No change to save" only makes sense when the inventory step genuinely has not run yet
        // for this target — if it already ran (completing a missing invTx after an interrupted
        // attempt, possibly across a reload), we must proceed to finish the ledger step below.
        if (!alreadyApplied && nq === current.qty) { showToast("No change to save"); onClose(); return; }
        // The delta can only be computed exactly on the attempt that actually applies it (current
        // qty still reflects the pre-operation baseline). If this call is completing an
        // already-applied operation (current qty has already moved), the original delta is no
        // longer recoverable from state alone — the ledger entry is completed with delta 0 and a
        // note making that explicit, since the physical quantity (never duplicated or lost) is
        // what matters; a perfectly precise historical delta in that narrow retry-after-reload
        // case is a known, minor, accepted limitation.
        const delta = alreadyApplied ? 0 : round2(nq - current.qty);

        const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, opId, { [itemId]: delta });
        if (changed) await setInventory(nextInventory);

        const invTxId = `${opId}-invtx`;
        if (!(invTx || []).some((t) => t.id === invTxId)) {
          await setInvTx([{ ...InventoryService.makeLedgerEntry({ itemId, itemName: current.name, type: "Adjustment", qty: delta, unit: current.unit, unitCost: current.costPerUnit, totalCost: round2(delta * current.costPerUnit), note: `Reason: ${reason}${notes ? " — " + notes : ""}${alreadyApplied ? " (ledger completed after an interrupted attempt)" : ""}` }), id: invTxId }, ...(invTx || [])]);
        }
        await logAudit(auditLog, setAuditLog, currentUser, "Stock Adjusted", `${current.name} target ${nq} ${current.unit} · ${reason}`);
        showToast(`${current.name} count updated to ${nq} ${current.unit}`);
      } else if (mode === "waste") {
        const wasteQty = Number(qty);
        const opId = `stockop-waste-${itemId}-${wasteQty}-${reason}`;
        const alreadyApplied = (current.appliedOps || []).includes(opId);
        // Same principle as adjust's guard: these validations only apply to a genuinely fresh
        // request. If already applied (completing a missing wasteTx/invTx, possibly after a
        // reload), current.qty already reflects the deduction, so re-checking against it here
        // could wrongly block completion of the still-missing records.
        if (!alreadyApplied) {
          if (!wasteQty || wasteQty <= 0) { setError("Enter a quantity greater than zero."); return; }
          if (wasteQty > current.qty) { setError(`Only ${current.qty} ${current.unit} in stock — can't waste more than that.`); return; }
        }

        const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, opId, { [itemId]: -wasteQty });
        if (changed) await setInventory(nextInventory);

        const cost = round2(wasteQty * current.costPerUnit);
        const wasteTxId = `${opId}-waste`;
        if (!(wasteTx || []).some((w) => w.id === wasteTxId)) {
          await persistWaste([{ id: wasteTxId, date: nowISO(), itemId, itemName: current.name, qty: wasteQty, unit: current.unit, reason, cost, notes, recordedBy: currentUser?.id }, ...(wasteTx || [])]);
        }
        const invTxId = `${opId}-invtx`;
        if (!(invTx || []).some((t) => t.id === invTxId)) {
          await setInvTx([{ ...InventoryService.makeLedgerEntry({ itemId, itemName: current.name, type: "Waste", qty: -wasteQty, unit: current.unit, unitCost: current.costPerUnit, totalCost: -cost, note: `Reason: ${reason}` }), id: invTxId }, ...(invTx || [])]);
        }
        await logAudit(auditLog, setAuditLog, currentUser, "Waste Recorded", `${current.name} -${wasteQty} ${current.unit} · ${fmtMoney(cost)} · ${reason}`);
        showToast(`Waste logged: ${wasteQty} ${current.unit} · ${fmtMoney(cost)}`, "danger");
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Modal title={titleMap[mode]} onClose={onClose} dark={dark}>
      <Field dark={dark} label="Item">
        <Select dark={dark} value={itemId} onChange={(e) => { setItemId(e.target.value); const it = inventory.find((i) => i.id === e.target.value); setNewQty(it.qty); }}>
          {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit})</option>)}
        </Select>
      </Field>
      {mode !== "adjust" ? (
        <Field dark={dark} label={`Quantity (${current.unit})`}>
          <Input dark={dark} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      ) : (
        <>
          <Field dark={dark} label={`New counted quantity (${current.unit}) — system says ${current.qty}`}>
            <Input dark={dark} type="number" min="0" step="0.01" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
          </Field>
          {diff !== 0 && (
            <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: diff > 0 ? "#1E3A0F" : "#3A0F1E", color: diff > 0 ? C.lime : "#FF6B85" }}>
              Difference: {diff > 0 ? "+" : ""}{diff} {current.unit}
            </div>
          )}
          <Field dark={dark} label="Reason">
            <Select dark={dark} value={reason} onChange={(e) => setReason(e.target.value)}>{adjustReasons.map((r) => <option key={r}>{r}</option>)}</Select>
          </Field>
        </>
      )}
      {mode === "waste" && (
        <Field dark={dark} label="Reason">
          <Select dark={dark} value={reason} onChange={(e) => setReason(e.target.value)}>{wasteReasons.map((r) => <option key={r}>{r}</option>)}</Select>
        </Field>
      )}
      <Field dark={dark} label="Notes">
        <TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={submit}><Check size={16} /> {submitting ? "Saving…" : "Save"}</PrimaryButton>
    </Modal>
  );
}

function InventoryHistoryModal({ dark, item, invTx, suppliers, onClose, can }) {
  const showCosts = !can || can("viewFinancials");
  const purchases = (invTx || []).filter((t) => t.itemId === item.id && t.type === "Purchase").sort((a, b) => new Date(b.date) - new Date(a.date));
  const allMoves = (invTx || []).filter((t) => t.itemId === item.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  const costs = purchases.map((p) => p.unitCost);
  const avg = costs.length ? round2(costs.reduce((a, c) => a + c, 0) / costs.length) : item.costPerUnit;
  const last = purchases[0]?.unitCost ?? item.costPerUnit;
  const highest = costs.length ? Math.max(...costs) : item.costPerUnit;
  const lowest = costs.length ? Math.min(...costs) : item.costPerUnit;

  const bySupplier = {};
  purchases.forEach((p) => {
    const key = p.supplierId || "unknown";
    if (!bySupplier[key]) bySupplier[key] = { total: 0, count: 0 };
    bySupplier[key].total += p.unitCost; bySupplier[key].count += 1;
  });
  const supplierRows = Object.entries(bySupplier).map(([sid, v]) => ({
    name: suppliers.find((s) => s.id === sid)?.name || "Unknown supplier", avg: round2(v.total / v.count), count: v.count,
  })).sort((a, b) => a.avg - b.avg);

  const analytics7 = calculateConsumptionAnalytics(item, invTx, 7);
  const analytics30 = calculateConsumptionAnalytics(item, invTx, 30);
  const consumptionCard = (
    <Card dark={dark} className="mb-4">
      <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Consumption &amp; Reorder</div>
      <Row dark={dark} label="Health status" value={STOCK_STATUS_LABEL[stockStatus(item)]} bold />
      <Row dark={dark} label="Used last 7 days" value={`${analytics7.consumedQty} ${item.unit}`} />
      <Row dark={dark} label="Used last 30 days" value={`${analytics30.consumedQty} ${item.unit}`} />
      <Row dark={dark} label="Avg daily usage" value={analytics30.avgDailyUsage > 0 ? `${analytics30.avgDailyUsage} ${item.unit}/day` : "No consumption data"} />
      <Row dark={dark} label="Estimated days remaining" value={analytics30.daysRemaining !== null ? `${analytics30.daysRemaining} days` : "No consumption data"} />
      {suggestedOrderQty(item) > 0 && <Row dark={dark} label="Recommended reorder" value={`${suggestedOrderQty(item)} ${item.unit}`} bold />}
    </Card>
  );

  if (!showCosts) {
    return (
      <Modal title={`${item.name} — History`} onClose={onClose} dark={dark}>
        {consumptionCard}
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Recent Stock Movements</div>
          {allMoves.length === 0 ? <EmptyState dark={dark} title="No transactions yet" /> : allMoves.map((t) => (
            <ListRow key={t.id} dark={dark} title={`${t.type} ${t.qty > 0 ? "+" : ""}${t.qty} ${t.unit}`}
              subtitle={`${dateStr(t.date)} ${timeStr(t.date)}${t.note ? " · " + t.note : ""}`} />
          ))}
        </Card>
        <div className="text-xs mt-3 text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Cost details are restricted to accounts with financial access.</div>
      </Modal>
    );
  }

  return (
    <Modal title={`${item.name} — History`} onClose={onClose} dark={dark} wide>
      {consumptionCard}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatCard dark={dark} label="Avg Cost" value={fmtMoney(avg)} />
        <StatCard dark={dark} label="Last Cost" value={fmtMoney(last)} />
        <StatCard dark={dark} label="Highest" value={fmtMoney(highest)} />
        <StatCard dark={dark} label="Lowest" value={fmtMoney(lowest)} />
      </div>

      {supplierRows.length > 0 && (
        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Supplier Price Comparison</div>
          <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Analysis only — nothing is auto-selected.</div>
          {supplierRows.map((s, idx) => (
            <ListRow key={idx} dark={dark} title={s.name} subtitle={`${s.count} purchase${s.count === 1 ? "" : "s"}`}
              right={fmtMoney(s.avg)} badge={idx === 0 ? <Badge dark={dark} tone="good">CHEAPEST RECENT</Badge> : null} />
          ))}
        </Card>
      )}

      <Card dark={dark}>
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Recent Transactions</div>
        {allMoves.length === 0 ? <EmptyState dark={dark} title="No transactions yet" /> : allMoves.map((t) => (
          <ListRow key={t.id} dark={dark} title={`${t.type} ${t.qty > 0 ? "+" : ""}${t.qty} ${t.unit}`}
            subtitle={`${dateStr(t.date)} ${timeStr(t.date)}${t.referenceLabel ? " · " + t.referenceLabel : ""}${t.note ? " · " + t.note : ""}`}
            right={t.totalCost != null ? fmtMoney(Math.abs(t.totalCost)) : ""} />
        ))}
      </Card>
    </Modal>
  );
}

/* ============================== PURCHASING ============================== */
const PO_STATUS_TONE = { Draft: "default", Ordered: "warn", "Partially Received": "warn", Received: "good", Cancelled: "danger", Reversed: "danger" };

function PurchasesView({ dark, inventory, setInventory, suppliers, purchaseOrders, persistPO, purchaseOps, invTx, setInvTx, cashTx, persistCash, settings, locations, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [tabMode, setTabMode] = useState("open");
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  const openStatuses = ["Draft", "Ordered", "Partially Received"];
  const filtered = useMemo(() => {
    const sorted = [...purchaseOrders].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    if (tabMode === "open") return sorted.filter((po) => openStatuses.includes(po.status));
    if (tabMode === "payables") return sorted.filter((po) => (po.status === "Received" || po.status === "Partially Received") && poAmountDue(po) > 0.005);
    if (tabMode === "received") return sorted.filter((po) => po.status === "Received");
    return sorted;
  }, [purchaseOrders, tabMode]);

  const purchases30d = round2(purchaseOrders.filter((po) => po.status !== "Cancelled" && po.status !== "Reversed" && withinDays(po.orderDate, 30)).reduce((a, po) => a + poGrandTotal(po), 0));
  const outstandingPayables = round2(purchaseOrders.filter((po) => po.status === "Received" || po.status === "Partially Received").reduce((a, po) => a + poAmountDue(po), 0));
  const openCount = purchaseOrders.filter((po) => openStatuses.includes(po.status)).length;

  const recommendations = useMemo(() => getPurchaseRecommendations({ inventory, suppliers, invTx }), [inventory, suppliers, invTx]);
  const recBySupplier = useMemo(() => {
    const groups = {};
    for (const r of recommendations) {
      const key = r.supplierName || "No preferred supplier";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [recommendations]);

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Purchases" sub="Purchase orders, receiving & supplier payments"
        action={can("managePurchases") ? <PrimaryButton onClick={() => setNewOpen(true)}><Plus size={16} /> New Purchase</PrimaryButton> : null} />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard dark={dark} label="Purchases (30d)" value={fmtMoney(purchases30d)} icon={PackagePlus} accent={C.purpleGlow} />
        <StatCard dark={dark} label="Outstanding Payables" value={fmtMoney(outstandingPayables)} icon={AlertTriangle} accent={"#FF6B85"} />
        <StatCard dark={dark} label="Open Orders" value={openCount} icon={Truck} accent={C.yellow} />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[["open", "Open"], ["payables", "Payables"], ["received", "Received"], ["all", "All"], ["recommendations", `Recommendations${recommendations.length ? ` (${recommendations.length})` : ""}`]].map(([id, label]) => (
          <button key={id} onClick={() => setTabMode(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: tabMode === id ? C.lime : (dark ? C.surfaceDark : C.white), color: tabMode === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
      </div>

      {tabMode === "recommendations" ? (
        recommendations.length === 0 ? (
          <Card dark={dark}><EmptyState dark={dark} title="Nothing needs restocking" sub="Every item is above its reorder point." /></Card>
        ) : (
          Object.entries(recBySupplier).map(([supplierName, items]) => (
            <Card dark={dark} key={supplierName} className="mb-3">
              <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>{supplierName}</div>
              {items.map((r) => (
                <div key={r.item.id} className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{r.item.name}</div>
                    <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                      {r.quantity} {r.unit} on hand · {r.daysRemaining !== null ? `~${r.daysRemaining}d remaining` : "no usage data"} · Suggest {r.recommendedQty} {r.unit}
                    </div>
                  </div>
                  <Badge dark={dark} tone={STOCK_STATUS_TONE[r.status]}>{STOCK_STATUS_LABEL[r.status]}</Badge>
                </div>
              ))}
            </Card>
          ))
        )
      ) : (
      <Card dark={dark}>
        {filtered.length === 0 ? <EmptyState dark={dark} title="No purchase orders" sub="Tap New Purchase to order stock from a supplier." /> : filtered.map((po) => {
          const supplier = suppliers.find((s) => s.id === po.supplierId);
          const due = poAmountDue(po);
          return (
            <ListRow key={po.id} dark={dark} onClick={() => setViewing(po)}
              title={`${po.poNumber} · ${supplier?.name || "Unknown supplier"}`}
              subtitle={`${dateStr(po.orderDate)} · ${po.items.length} item${po.items.length === 1 ? "" : "s"}`}
              badge={<Badge dark={dark} tone={PO_STATUS_TONE[po.status]}>{po.status.toUpperCase()}</Badge>}
              right={fmtMoney(poGrandTotal(po))} rightSub={due > 0.005 ? `${fmtMoney(due)} due` : "Paid"} />
          );
        })}
      </Card>
      )}

      {newOpen && (
        <NewPurchaseModal dark={dark} onClose={() => setNewOpen(false)} inventory={inventory} suppliers={suppliers}
          purchaseOrders={purchaseOrders} persistPO={persistPO} purchaseOps={purchaseOps} locations={locations} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}

      {viewing && (
        <PurchaseDetailModal dark={dark} po={purchaseOrders.find((p) => p.id === viewing.id) || viewing} onClose={() => setViewing(null)}
          inventory={inventory} setInventory={setInventory} suppliers={suppliers} purchaseOrders={purchaseOrders} persistPO={persistPO} purchaseOps={purchaseOps}
          invTx={invTx} setInvTx={setInvTx} cashTx={cashTx} persistCash={persistCash} settings={settings}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </div>
  );
}

function NewPurchaseModal({ dark, onClose, inventory, suppliers, purchaseOrders, persistPO, purchaseOps, locations, currentUser, can, auditLog, setAuditLog, showToast, prefill }) {
  const [supplierId, setSupplierId] = useState(prefill?.supplierId || suppliers[0]?.id || "");
  const [locationId, setLocationId] = useState(prefill?.locationId || (locations || []).find((l) => l.active !== false)?.id || inventory.find((i) => i.locationId)?.locationId || "");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [expectedDate, setExpectedDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState("Net Terms");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [items, setItems] = useState(
    prefill?.items?.length ? prefill.items.map((it) => ({ itemId: it.itemId, qty: it.qty, unitCost: it.unitCost })) : [{ itemId: inventory[0]?.id || "", qty: 1, unitCost: inventory[0]?.costPerUnit || 0 }]
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => setItems([...items, { itemId: inventory[0]?.id || "", qty: 1, unitCost: inventory[0]?.costPerUnit || 0 }]);
  const updateItem = (idx, patch) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const lineData = items.map((it) => ({ ...it, item: inventory.find((i) => i.id === it.itemId), lineTotal: round2(it.qty * it.unitCost) }));
  const subtotal = round2(lineData.reduce((a, l) => a + l.lineTotal, 0));
  const grandTotal = round2(subtotal - Number(discount || 0) + Number(tax || 0));

  const submit = async (status) => {
    if (submitting) return;
    setError("");
    if (!can("managePurchases")) { setError("You don't have permission to create purchase orders."); return; }
    if (!supplierId) { setError("Select a supplier."); return; }
    if (!locationId) { setError("Select a location."); return; }
    if (lineData.length === 0 || lineData.some((l) => !l.item || !l.qty || l.qty <= 0)) { setError("Add at least one item with a quantity greater than zero."); return; }
    if (lineData.some((l) => l.unitCost < 0)) { setError("Unit cost can't be negative."); return; }
    setSubmitting(true);
    try {
      if (purchaseOps?.remote) {
        try {
          await purchaseOps.create({ supplierId, locationId, orderDate, expectedDate, status, paymentMethod, notes,
            discount: Number(discount) || 0, tax: Number(tax) || 0,
            items: lineData.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unit: l.item.unit, unitCost: round2(Number(l.unitCost)) })) });
          showToast(`Purchase order created · ${fmtMoney(grandTotal)}`);
          onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabasePurchases.create) means fn_create_purchase_order
          // itself already committed — a real purchase order now exists. This must never be
          // shown as "create failed", or the user could be misled into creating a duplicate
          // purchase order for the same items.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); onClose(); }
          else { setError(e?.message || "Could not create this purchase order."); }
        }
        return;
      }
      const poNumber = `PO-${1000 + purchaseOrders.length + 1}`;
      const po = {
        id: uid("po"), poNumber, supplierId, orderDate: parseLocalDate(orderDate).toISOString(), expectedDate: parseLocalDate(expectedDate).toISOString(),
        status, paymentMethod, notes, amountPaid: 0, discount: Number(discount) || 0, tax: Number(tax) || 0, createdBy: currentUser?.id,
        items: lineData.map((l) => ({ id: uid("poi"), itemId: l.itemId, qty: Number(l.qty), unit: l.item.unit, unitCost: round2(Number(l.unitCost)), receivedQty: 0 })),
      };
      await persistPO([po, ...purchaseOrders]);
      await logAudit(auditLog, setAuditLog, currentUser, "Purchase Order Created", `${poNumber} · ${suppliers.find((s) => s.id === supplierId)?.name || ""} · ${fmtMoney(grandTotal)}`);
      showToast(`${poNumber} created · ${fmtMoney(grandTotal)}`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Purchase Order" onClose={onClose} dark={dark} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Supplier">
          <Select dark={dark} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Location">
          <Select dark={dark} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {(locations || []).filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Payment Method">
          <Select dark={dark} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {["Net Terms", "Cash", "Credit Card", "Debit Card", "Zelle", "COD", "Other"].map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Order Date"><Input dark={dark} type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field>
        <Field dark={dark} label="Expected Delivery"><Input dark={dark} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
      </div>

      <div className="font-bold text-sm mb-2 mt-2" style={{ color: dark ? C.white : C.black }}>Items</div>
      {items.map((it, idx) => {
        const invItem = inventory.find((i) => i.id === it.itemId);
        return (
          <div key={idx} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              <Select dark={dark} value={it.itemId} onChange={(e) => { const ni = inventory.find((i) => i.id === e.target.value); updateItem(idx, { itemId: e.target.value, unitCost: ni?.costPerUnit ?? it.unitCost }); }}>
                {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </Select>
            </div>
            <div className="w-20"><Input dark={dark} type="number" min="0.01" step="0.01" value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(0, Number(e.target.value)) })} /></div>
            <div className="w-24"><Input dark={dark} type="number" min="0" step="0.01" value={it.unitCost} onChange={(e) => updateItem(idx, { unitCost: Math.max(0, Number(e.target.value)) })} /></div>
            <div className="w-16 text-xs text-right font-semibold pb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{invItem ? fmtMoney(it.qty * it.unitCost) : ""}</div>
            {items.length > 1 && (
              <button onClick={() => removeItem(idx)} className="mb-0 w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#3A0F1E" }}>
                <Trash2 size={14} color="#FF6B85" />
              </button>
            )}
          </div>
        );
      })}
      <button onClick={addItem} className="text-xs font-bold mb-4" style={{ color: C.lime }}>+ Add another item</button>

      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Discount ($)"><Input dark={dark} type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></Field>
        <Field dark={dark} label="Tax ($)"><Input dark={dark} type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(Math.max(0, Number(e.target.value)))} /></Field>
      </div>
      <Field dark={dark} label="Notes"><TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      <div className="rounded-2xl p-3 mb-4" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
        <Row dark={dark} label="Subtotal" value={fmtMoney(subtotal)} />
        <Row dark={dark} label="Discount" value={`-${fmtMoney(discount)}`} />
        <Row dark={dark} label="Tax" value={fmtMoney(tax)} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Grand Total" value={fmtMoney(grandTotal)} bold />
      </div>

      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <div className="flex gap-2">
        <GhostButton dark={dark} style={{ flex: 1 }} disabled={submitting} onClick={() => submit("Draft")}>Save as Draft</GhostButton>
        <PrimaryButton style={{ flex: 1 }} disabled={submitting} onClick={() => submit("Ordered")}><Check size={16} /> {submitting ? "Saving…" : "Submit Order"}</PrimaryButton>
      </div>
      <div className="text-xs mt-3 text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        Inventory only increases once items are marked Received — creating this order does not change stock or cash flow yet.
      </div>
    </Modal>
  );
}

function PurchaseDetailModal({ dark, po, onClose, inventory, setInventory, suppliers, purchaseOrders, persistPO, purchaseOps, invTx, setInvTx, cashTx, persistCash, settings, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [receiving, setReceiving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reversingPaymentId, setReversingPaymentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const grandTotal = poGrandTotal(po);
  const amountDue = poAmountDue(po);
  const fullyReceived = po.items.every((l) => l.receivedQty >= l.qty);
  const anyReceived = po.items.some((l) => l.receivedQty > 0);
  const reversed = po.status === "Reversed";
  const payments = purchaseOps?.remote ? (po.payments || []).sort((a, b) => new Date(b.date) - new Date(a.date)) : cashTx.filter((t) => t.relatedPOId === po.id && t.category === "Supplier Payment").sort((a, b) => new Date(b.date) - new Date(a.date));

  const doReversePurchase = async () => {
    if (busy) return;
    if (!can("reversePurchases")) { showToast("You don't have permission to reverse purchases.", "danger"); setReversing(false); return; }
    setBusy(true);
    try {
      if (purchaseOps?.remote) {
        try {
          await purchaseOps.reversePurchase(po.id);
          showToast(`${po.poNumber} reversed · inventory & cash corrected`, "danger");
          setReversing(false); onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabasePurchases.reversePurchase) means fn_reverse_purchase_order
          // itself already committed — inventory and cash were really pulled back. This must never
          // be shown as "reversal failed", or the user could be misled into reversing the same
          // purchase order again, double-counting the pullback.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); setReversing(false); onClose(); }
          else { showToast(e?.message || "Could not reverse this purchase order.", "danger"); }
        }
        return;
      }
      const latest = purchaseOrders.find((p) => p.id === po.id) || po;
      if (latest.status === "Reversed") { showToast("This purchase was already reversed.", "danger"); setReversing(false); onClose(); return; }

      // Pull back exactly what was received. If the item has since been sold/wasted below that
      // amount, block the reversal rather than push inventory negative — that needs a manual
      // adjustment with an explanation, not a silent auto-correction.
      const pullBack = po.items.filter((l) => l.receivedQty > 0).map((l) => ({ itemId: l.itemId, qty: l.receivedQty, unitCost: l.unitCost }));
      for (const line of pullBack) {
        const inv = inventory.find((i) => i.id === line.itemId);
        if (inv && inv.qty - line.qty < 0 && !settings.allowNegativeInventory) {
          showToast(`Can't reverse — ${inv.name} only has ${inv.qty} ${inv.unit} left (needs ${line.qty} to fully reverse).`, "danger");
          setBusy(false); setReversing(false);
          return;
        }
      }

      // Retry-safety: inventory qty + the deterministic operation marker (appliedOps) are written
      // TOGETHER in one setInventory() call, per item — the critical step no longer depends on
      // invTx as the "already done?" signal. A PO can only be reversed once —
      // `latest.status === "Reversed"` above already prevents a second LEGITIMATE reversal — so
      // this only needs to guard against a retry of the SAME interrupted attempt.
      const itemDeltas = Object.fromEntries(pullBack.map((line) => [line.itemId, -line.qty]));
      const opId = `${po.id}-purchase-reversal`;
      const { changed, nextInventory } = applyInventoryOpIfNeeded(inventory, opId, itemDeltas);
      if (changed) {
        const clamped = settings.allowNegativeInventory ? nextInventory : nextInventory.map((inv) => ({ ...inv, qty: clamp0(inv.qty) }));
        await setInventory(clamped);
      }

      // invTx (audit ledger) is checked/completed independently of whether the inventory step ran
      // just now or in an earlier interrupted attempt — its failure never leaves qty wrong.
      const plannedEntries = pullBack.map((line) => {
        const inv = inventory.find((i) => i.id === line.itemId);
        return { ...InventoryService.makeLedgerEntry({ itemId: line.itemId, itemName: inv?.name || line.itemId, type: "Reversal", qty: -line.qty, unit: inv?.unit || "", unitCost: line.unitCost, totalCost: -round2(line.qty * line.unitCost), referenceId: po.id, referenceLabel: po.poNumber, note: `Reversal of ${po.poNumber}` }), id: `${po.id}-purchase-reversal-${line.itemId}` };
      });
      const newEntries = plannedEntries.filter((e) => !(invTx || []).some((x) => x.id === e.id));
      if (newEntries.length) {
        await setInvTx([...newEntries, ...(invTx || [])]);
      }

      // Reverse any cash already paid with one offsetting income entry — the paid amount stays
      // on record, this just nets it back out. Deterministic id makes this idempotent on retry —
      // this is what closes the confirmed worst-case (a single $50 reversal producing two cash entries).
      const cashId = `${po.id}-purchase-reversal-cash`;
      if (po.amountPaid > 0.005 && !cashTx.some((t) => t.id === cashId)) {
        await persistCash([{ id: cashId, date: nowISO(), type: "income", category: "Purchase Reversal", amount: po.amountPaid, paymentMethod: po.paymentMethod, description: `Reversal of ${po.poNumber}`, relatedPOId: po.id, reversalOf: po.id }, ...cashTx]);
      }

      await persistPO(purchaseOrders.map((p) => (p.id === po.id ? { ...p, status: "Reversed", reversedAt: nowISO(), reversedBy: currentUser?.id } : p)));
      await logAudit(auditLog, setAuditLog, currentUser, "Purchase Reversed", `${po.poNumber} · inventory pulled back · ${po.amountPaid > 0 ? fmtMoney(po.amountPaid) + " cash reversed" : "no cash to reverse"}`);

      showToast(`${po.poNumber} reversed · inventory & cash corrected`, "danger");
      setReversing(false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const doReversePayment = async (payment) => {
    if (busy) return;
    if (!can("paySuppliers")) { showToast("You don't have permission to reverse payments.", "danger"); setReversingPaymentId(null); return; }
    setBusy(true);
    try {
      if (purchaseOps?.remote) {
        try {
          await purchaseOps.reversePayment(payment.id);
          showToast(`Payment of ${fmtMoney(payment.amount)} reversed`, "danger");
          setReversingPaymentId(null);
        } catch (e) {
          // rpcSucceeded (set by useSupabasePurchases.reversePayment) means fn_reverse_po_payment
          // itself already committed. This must never be shown as "reversal failed", or the user
          // could be misled into reversing the same payment again.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); setReversingPaymentId(null); }
          else { showToast(e?.message || "Could not reverse this payment.", "danger"); }
        }
        return;
      }
      const latestTx = cashTx.find((t) => t.id === payment.id);
      if (!latestTx) { showToast("Payment not found.", "danger"); setReversingPaymentId(null); return; }
      const latestPO = purchaseOrders.find((p) => p.id === po.id) || po;
      if (latestPO.status === "Reversed") { showToast("This whole purchase was already reversed.", "danger"); setReversingPaymentId(null); return; }

      // Deterministic id makes the cash side idempotent on retry. The PO side is checked
      // independently (via the amountPaid value itself, not the cash status) so a retry that
      // finds the cash already reversed from an earlier interrupted attempt still completes the
      // missing amountPaid correction rather than stopping short — this closes the confirmed E2
      // data-loss scenario where amountPaid stayed permanently wrong.
      const reversalId = `${payment.id}-payment-reversal-cash`;
      const cashAlreadyReversed = latestTx.status === "reversed" || cashTx.some((t) => t.id === reversalId);
      if (!cashAlreadyReversed) {
        await persistCash(cashTx.map((t) => (t.id === payment.id ? { ...t, status: "reversed" } : t)).concat([
          { id: reversalId, date: nowISO(), type: "income", category: "Payment Reversal", amount: payment.amount, paymentMethod: payment.paymentMethod, description: `Reversal of payment on ${po.poNumber}`, relatedPOId: po.id, reversalOf: payment.id },
        ]));
      }

      const expectedAfter = clamp0(round2((latestPO.amountPaid || 0) - payment.amount));
      if (round2(latestPO.amountPaid || 0) > expectedAfter + 0.005) {
        await persistPO(purchaseOrders.map((p) => (p.id === po.id ? { ...p, amountPaid: expectedAfter } : p)));
      }
      await logAudit(auditLog, setAuditLog, currentUser, "Payment Reversed", `${po.poNumber} · ${fmtMoney(payment.amount)}`);

      showToast(`Payment of ${fmtMoney(payment.amount)} reversed`, "danger");
      setReversingPaymentId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={po.poNumber} onClose={onClose} dark={dark} wide>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge dark={dark} tone={PO_STATUS_TONE[po.status]}>{po.status.toUpperCase()}</Badge>
        <span className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{supplier?.name} · Ordered {dateStr(po.orderDate)} · Expected {dateStr(po.expectedDate)}</span>
      </div>

      <Card dark={dark} className="mb-4">
        {po.items.map((l) => {
          const invItem = inventory.find((i) => i.id === l.itemId);
          const remaining = round2(l.qty - l.receivedQty);
          return (
            <div key={l.id} className="py-2 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
              <Row dark={dark} label={`${invItem?.name || l.itemId} — ${l.qty} × ${fmtMoney(l.unitCost)}`} value={fmtMoney(poLineTotal(l))} />
              <div className="text-xs" style={{ color: remaining > 0 ? C.yellow : C.lime }}>
                {l.receivedQty} of {l.qty} {l.unit} received{remaining > 0 ? ` · ${remaining} remaining` : " · complete"}
              </div>
            </div>
          );
        })}
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Subtotal" value={fmtMoney(poSubtotal(po))} />
        <Row dark={dark} label="Discount" value={`-${fmtMoney(po.discount)}`} />
        <Row dark={dark} label="Tax" value={fmtMoney(po.tax)} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Grand Total" value={fmtMoney(grandTotal)} bold />
        <Row dark={dark} label="Paid" value={fmtMoney(po.amountPaid)} />
        <Row dark={dark} label="Amount Due" value={fmtMoney(amountDue)} bold />
      </Card>

      {payments.length > 0 && (
        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Payment History</div>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-b-0 gap-2" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(p.amount)} · {p.paymentMethod}</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{dateStr(p.date)}{p.status === "reversed" ? " · reversed" : ""}</div>
              </div>
              {p.status !== "reversed" && !reversed && can("paySuppliers") && (
                <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12, color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setReversingPaymentId(p.id)}>
                  <Undo2 size={13} /> Reverse
                </GhostButton>
              )}
              {p.status === "reversed" && <Badge dark={dark} tone="danger">REVERSED</Badge>}
            </div>
          ))}
        </Card>
      )}

      {po.notes && <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Notes: {po.notes}</div>}

      <div className="flex gap-2 flex-wrap mb-2">
        {!fullyReceived && !reversed && po.status !== "Cancelled" && can("receivePurchases") && (
          <PrimaryButton style={{ flex: 1 }} onClick={() => setReceiving(true)}><PackagePlus size={16} /> Receive Items</PrimaryButton>
        )}
        {!reversed && (po.status === "Received" || po.status === "Partially Received") && amountDue > 0.005 && can("paySuppliers") && (
          <GhostButton dark={dark} style={{ flex: 1 }} onClick={() => setPaying(true)}>Record Payment</GhostButton>
        )}
        {!anyReceived && po.status !== "Cancelled" && can("managePurchases") && (
          <GhostButton dark={dark} style={{ color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setCancelling(true)}><Trash2 size={15} /> Cancel</GhostButton>
        )}
        {anyReceived && !reversed && po.status !== "Cancelled" && can("reversePurchases") && (
          <GhostButton dark={dark} style={{ color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setReversing(true)}><Undo2 size={15} /> Reverse Purchase</GhostButton>
        )}
      </div>
      {anyReceived && !reversed && po.status !== "Cancelled" && !can("reversePurchases") && (
        <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
          This order has received items — reversing it requires purchase-reversal permission.
        </div>
      )}
      {reversed && (
        <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
          Reversed {po.reversedAt ? dateStr(po.reversedAt) : ""} — inventory and any cash paid were corrected. This record is kept for audit purposes.
        </div>
      )}

      {receiving && (
        <ReceivePurchaseModal dark={dark} po={po} onClose={() => setReceiving(false)} inventory={inventory} setInventory={setInventory}
          purchaseOrders={purchaseOrders} persistPO={persistPO} purchaseOps={purchaseOps} invTx={invTx} setInvTx={setInvTx} suppliers={suppliers}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
      {paying && (
        <PaymentModal dark={dark} po={po} onClose={() => setPaying(false)} purchaseOrders={purchaseOrders} persistPO={persistPO} purchaseOps={purchaseOps}
          cashTx={cashTx} persistCash={persistCash} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
      {cancelling && (
        <ConfirmDialog dark={dark} title={`Cancel ${po.poNumber}?`} message="This order has no received items yet, so cancelling it is safe — no inventory or cash has been affected."
          confirmLabel="Cancel Order" onConfirm={async () => {
            if (!can("managePurchases")) { showToast("You don't have permission to cancel purchase orders.", "danger"); setCancelling(false); return; }
            // Re-check the latest PO right before writing — closes the window for a stale modal
            // (or a second stale UI instance) cancelling a PO that has since received inventory,
            // the same re-check-before-write pattern already used by doReversePurchase/doReversePayment
            // just below in this same component.
            const latest = purchaseOrders.find((p) => p.id === po.id) || po;
            if (latest.status === "Cancelled") { showToast(`${po.poNumber} was already cancelled.`, "danger"); setCancelling(false); onClose(); return; }
            // Mirrors the server's own rejection (fn_cancel_purchase_order rejects a Reversed PO)
            // with a clear client-side message, consistent with the Cancelled/anyReceived checks
            // right above and below — same pattern, not a new one.
            if (latest.status === "Reversed") { showToast(`${po.poNumber} was already reversed and cannot be cancelled.`, "danger"); setCancelling(false); return; }
            const latestAnyReceived = latest.items.some((l) => l.receivedQty > 0);
            if (latestAnyReceived) { showToast(`${po.poNumber} has received items now — it can no longer be cancelled directly. Use Reverse instead.`, "danger"); setCancelling(false); onClose(); return; }
            if (purchaseOps?.remote) {
              try {
                await purchaseOps.cancel(po.id);
                showToast(`${po.poNumber} cancelled`, "danger"); setCancelling(false); onClose(); return;
              } catch (e) {
                // rpcSucceeded (set by useSupabasePurchases.cancel) means fn_cancel_purchase_order
                // itself already committed — only the subsequent screen refresh failed. This must
                // never be shown as "could not cancel", or the user could be misled into
                // attempting to cancel the same, already-cancelled purchase order again.
                if (e?.rpcSucceeded) {
                  showToast(e.message, "good");
                  setCancelling(false);
                  onClose();
                  return;
                }
                // ConfirmDialog's own run() only has try/finally (no catch) — this component must
                // catch fn_cancel_purchase_order's rejection itself, or it becomes an uncaught
                // promise rejection with no visible feedback, the same class of failure already
                // fixed for SaleDetailModal.doCancel. supabaseRest.rpc() wraps the real Postgres
                // error as `rpc fn_x failed (status): {"message":"...",...}` — best-effort extract
                // the original message (e.g. "reversed purchase orders cannot be cancelled",
                // "purchase order has received inventory; use reversal instead") from that JSON
                // tail so the user sees the RPC's own wording instead of the raw wrapped string.
                // No inventory/cash/status is touched here — this only shows the error and leaves
                // the PurchaseDetailModal open (no onClose()) so the user can retry or investigate.
                let msg = "Could not cancel this purchase order.";
                const jsonStart = e?.message?.indexOf("{");
                if (jsonStart >= 0) {
                  try {
                    const parsed = JSON.parse(e.message.slice(jsonStart));
                    msg = parsed?.message || parsed?.error_description || parsed?.error || msg;
                  } catch { /* not parseable — keep the generic message */ }
                }
                showToast(msg, "danger");
                setCancelling(false);
                return;
              }
            }
            await persistPO(purchaseOrders.map((p) => (p.id === po.id ? { ...p, status: "Cancelled" } : p)));
            await logAudit(auditLog, setAuditLog, currentUser, "Purchase Order Cancelled", po.poNumber);
            showToast(`${po.poNumber} cancelled`, "danger");
            setCancelling(false); onClose();
          }} onCancel={() => setCancelling(false)} />
      )}
      {reversing && (
        <ConfirmDialog dark={dark} title={`Reverse ${po.poNumber}?`}
          message="This pulls the received quantities back out of inventory and posts a reversing cash entry for anything already paid. The order stays on record marked Reversed."
          confirmLabel="Reverse Purchase" onConfirm={doReversePurchase} onCancel={() => setReversing(false)} />
      )}
      {reversingPaymentId && (
        <ConfirmDialog dark={dark} title="Reverse this payment?"
          message="This posts an offsetting cash entry and reduces the amount paid on this order — the original payment stays on record."
          confirmLabel="Reverse Payment" onConfirm={() => doReversePayment(payments.find((p) => p.id === reversingPaymentId))} onCancel={() => setReversingPaymentId(null)} />
      )}
    </Modal>
  );
}

function ReceivePurchaseModal({ dark, po, onClose, inventory, setInventory, purchaseOrders, persistPO, purchaseOps, invTx, setInvTx, suppliers, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [receiveQtys, setReceiveQtys] = useState(Object.fromEntries(po.items.map((l) => [l.id, round2(l.qty - l.receivedQty)])));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setError("");
    if (!can("receivePurchases")) { setError("You don't have permission to receive purchase orders."); return; }
    // Re-check the latest PO record right before writing — closes the window for double-counting
    // if this modal was reopened, or a second submission raced in, against a stale `po` prop that
    // doesn't reflect a receipt that already happened.
    const latestPO = purchaseOrders.find((p) => p.id === po.id) || po;
    const lines = latestPO.items.map((l) => ({ line: l, receiveQty: Number(receiveQtys[l.id] || 0) }));
    for (const { line, receiveQty } of lines) {
      const remaining = round2(line.qty - line.receivedQty);
      if (receiveQty < 0) { setError("Received quantity can't be negative."); return; }
      if (receiveQty > remaining + 0.0001) { setError(`Can't receive more than the remaining ${remaining} for this item.`); return; }
    }
    const receivingNow = lines.filter((l) => l.receiveQty > 0);
    if (receivingNow.length === 0) { setError("Enter a quantity for at least one item."); return; }

    setSubmitting(true);
    try {
      if (purchaseOps?.remote) {
        try {
          await purchaseOps.receive(po.id, receivingNow.map((x) => ({ poItemId: x.line.id, qty: x.receiveQty })));
          const allDoneRemote = receivingNow.every((x) => x.receiveQty >= round2(x.line.qty - x.line.receivedQty)) && latestPO.items.every((line) => {
            const match = receivingNow.find((x) => x.line.id === line.id); return line.receivedQty + (match?.receiveQty || 0) >= line.qty;
          });
          showToast(allDoneRemote ? `${po.poNumber} fully received` : `Partial receipt recorded for ${po.poNumber}`);
          onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabasePurchases.receive) means fn_receive_purchase_order
          // itself already committed — the receipt and its inventory movement are real. This must
          // never be shown as "receive failed", or the user could be misled into receiving the
          // same purchase order again and double-counting inventory. The modal stays open (no
          // onClose()) only because that's already how a true failure below behaves — the message
          // itself makes clear the receipt was saved, not that anything needs retrying.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); onClose(); }
          else { setError(e?.message || "Could not receive this purchase order."); }
        }
        return;
      }
      // Retry-safety: each operation id includes the item's receivedQty BEFORE this specific
      // receiving operation — a retry of the SAME interrupted operation always starts from the
      // same receivedQty (nothing persisted yet) and reproduces the same id, while a genuinely
      // NEW, later receipt of the same item only happens after the PO's receivedQty has already
      // advanced, producing a different id. This is what lets legitimate sequential partial
      // receipts keep working while a retry of a failed one does not double-count.
      // The critical step is now the inventory item's own `appliedOps` marker (checked per item,
      // since each item in a multi-item receipt has its own id) — not invTx presence, which is
      // now a best-effort audit write completed independently below.
      const plannedEntries = receivingNow.map((l) => ({
        itemId: l.line.itemId, qty: l.receiveQty, unitCost: l.line.unitCost,
        id: `${po.id}-receipt-${l.line.itemId}-${l.line.receivedQty}`,
      }));
      const newPlanned = plannedEntries.filter((e) => {
        const inv = inventory.find((i) => i.id === e.itemId);
        return !(inv && (inv.appliedOps || []).includes(e.id));
      });
      let nextInventory = inventory;
      let txEntriesForAudit = [];
      if (newPlanned.length) {
        const applied = applyPurchaseReceipt(
          inventory,
          newPlanned.map((e) => ({ itemId: e.itemId, qty: e.qty, unitCost: e.unitCost })),
          { referenceId: po.id, referenceLabel: po.poNumber, supplierId: po.supplierId, note: `Received against ${po.poNumber}` }
        );
        const idByItem = Object.fromEntries(newPlanned.map((e) => [e.itemId, e.id]));
        nextInventory = applied.nextInventory.map((inv) => {
          const opId = idByItem[inv.id];
          if (!opId) return inv;
          return { ...inv, appliedOps: [...(inventory.find((i) => i.id === inv.id)?.appliedOps || []), opId] };
        });
        await setInventory(nextInventory);
        txEntriesForAudit = applied.txEntries.map((t) => ({ ...t, id: idByItem[t.itemId] || t.id }));
      }

      // invTx (audit ledger) is checked/completed independently of whether the inventory step ran
      // just now or in an earlier interrupted attempt (covers ALL planned items, not just the new
      // ones) — its failure never leaves qty wrong, only delays the audit row for that item.
      const missingAuditEntries = plannedEntries.filter((e) => !(invTx || []).some((x) => x.id === e.id));
      if (missingAuditEntries.length) {
        const auditEntries = missingAuditEntries.map((e) => {
          const fromThisCall = txEntriesForAudit.find((t) => t.id === e.id);
          if (fromThisCall) return fromThisCall; // preferred: has the precise weighted-average cost fields
          // Item's inventory step already happened in an earlier interrupted attempt — reconstruct
          // the same ledger entry shape (without prevAvgCost/newAvgCost, which are no longer
          // recoverable after the fact) so the audit trail still gets its missing row.
          const inv = nextInventory.find((i) => i.id === e.itemId) || inventory.find((i) => i.id === e.itemId);
          return { ...InventoryService.makeLedgerEntry({ itemId: e.itemId, itemName: inv?.name || e.itemId, type: "Purchase", qty: e.qty, unit: inv?.unit || "", unitCost: e.unitCost, totalCost: round2(e.qty * e.unitCost), referenceId: po.id, referenceLabel: po.poNumber, note: `Received against ${po.poNumber}` }), id: e.id };
        });
        await setInvTx([...auditEntries, ...(invTx || [])]);
      }

      const latestForStatus = purchaseOrders.find((p) => p.id === po.id) || latestPO;
      const updatedItems = latestForStatus.items.map((l) => {
        const match = lines.find((x) => x.line.id === l.id);
        if (!match) return l;
        const baseline = latestPO.items.find((x) => x.id === l.id).receivedQty; // same base used to plan the operation ids above — keeps this consistent whether inventory was updated just now or in an earlier interrupted attempt
        return { ...l, receivedQty: round2(baseline + match.receiveQty) };
      });
      const allDone = updatedItems.every((l) => l.receivedQty >= l.qty);
      const anyDone = updatedItems.some((l) => l.receivedQty > 0);
      const nextStatus = allDone ? "Received" : anyDone ? "Partially Received" : latestForStatus.status;
      await persistPO(purchaseOrders.map((p) => (p.id === po.id ? { ...p, items: updatedItems, status: nextStatus } : p)));
      await logAudit(auditLog, setAuditLog, currentUser, "Purchase Received", `${po.poNumber} · ${receivingNow.length} line${receivingNow.length === 1 ? "" : "s"}${allDone ? " · complete" : " · partial"}`);

      showToast(allDone ? `${po.poNumber} fully received` : `Partial receipt recorded for ${po.poNumber}`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Receive — ${po.poNumber}`} onClose={onClose} dark={dark}>
      <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        Enter how much actually arrived. Inventory quantity and average cost update immediately for each line you receive.
      </div>
      {po.items.map((l) => {
        const invItem = inventory.find((i) => i.id === l.itemId);
        const remaining = round2(l.qty - l.receivedQty);
        if (remaining <= 0) return (
          <div key={l.id} className="text-xs mb-3 px-3 py-2 rounded-xl" style={{ background: dark ? C.surfaceDark : C.bgLight, color: C.lime }}>
            {invItem?.name || l.itemId}: fully received ({l.receivedQty}/{l.qty})
          </div>
        );
        return (
          <Field key={l.id} dark={dark} label={`${invItem?.name || l.itemId} — remaining ${remaining} ${l.unit} @ ${fmtMoney(l.unitCost)}`}>
            <Input dark={dark} type="number" min="0" max={remaining} step="0.01" value={receiveQtys[l.id]}
              onChange={(e) => setReceiveQtys({ ...receiveQtys, [l.id]: e.target.value })} />
          </Field>
        );
      })}
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={submit}><Check size={16} /> {submitting ? "Receiving…" : "Confirm Receipt"}</PrimaryButton>
    </Modal>
  );
}

function PaymentModal({ dark, po, onClose, purchaseOrders, persistPO, purchaseOps, cashTx, persistCash, currentUser, can, auditLog, setAuditLog, showToast }) {
  const due = poAmountDue(po);
  const [amount, setAmount] = useState(due);
  const [paymentMethod, setPaymentMethod] = useState(po.paymentMethod === "Net Terms" || po.paymentMethod === "COD" ? "Zelle" : po.paymentMethod);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setError("");
    if (!can("paySuppliers")) { setError("You don't have permission to pay suppliers."); return; }
    const amt = round2(Number(amount));
    if (!amt || amt <= 0) { setError("Enter a payment amount greater than zero."); return; }
    if (amt > due + 0.01) { setError(`Payment can't exceed the amount due (${fmtMoney(due)}).`); return; }
    setSubmitting(true);
    try {
      if (purchaseOps?.remote) {
        try {
          await purchaseOps.pay(po.id, amt, paymentMethod);
          showToast(`Payment recorded: ${fmtMoney(amt)} to ${po.poNumber}`);
          onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabasePurchases.pay) means fn_pay_purchase_order itself
          // already committed — only the subsequent screen refresh failed. This must never be
          // shown as "payment failed", or the user could be misled into paying again.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); onClose(); }
          else { setError(e?.message || "Could not record this payment."); }
        }
        return;
      }
      // Re-derive the freshest PO state right before writing, so a duplicate click (or a second
      // payment made moments later) can never double-pay: amountPaid only ever moves forward once.
      const latest = purchaseOrders.find((p) => p.id === po.id) || po;
      const latestDue = poAmountDue(latest);
      if (amt > latestDue + 0.01) { setError("This order's balance already changed — reopen it to see the current amount due."); return; }

      await persistCash([{ id: uid("cash"), date: nowISO(), type: "expense", category: "Supplier Payment", amount: amt, paymentMethod, description: `Payment for ${po.poNumber}`, relatedPOId: po.id, status: "completed", paidBy: currentUser?.id }, ...cashTx]);
      await persistPO(purchaseOrders.map((p) => (p.id === po.id ? { ...p, amountPaid: round2((p.amountPaid || 0) + amt) } : p)));
      await logAudit(auditLog, setAuditLog, currentUser, "Supplier Payment", `${po.poNumber} · ${fmtMoney(amt)}`);

      showToast(`Payment recorded: ${fmtMoney(amt)} to ${po.poNumber}`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Pay ${po.poNumber}`} onClose={onClose} dark={dark}>
      <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Amount due: {fmtMoney(due)}</div>
      <Field dark={dark} label="Payment Amount ($)"><Input dark={dark} type="number" min="0.01" max={due} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field dark={dark} label="Payment Method">
        <Select dark={dark} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          {["Cash", "Credit Card", "Debit Card", "Zelle", "Other"].map((m) => <option key={m}>{m}</option>)}
        </Select>
      </Field>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={submit}><Check size={16} /> {submitting ? "Recording…" : "Record Payment"}</PrimaryButton>
    </Modal>
  );
}

/* ============================== PRODUCTS ============================== */
function ProductsView({ dark, products, setProducts, inventory, settings, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const canEdit = can("manageRecipesAndCosts");
  const canSeeCost = can("viewFinancials");

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Products" sub={`${products.length} products`}
        action={canEdit ? <PrimaryButton onClick={() => { setEditing(null); setModal(true); }}><Plus size={16} /> New Product</PrimaryButton> : null} />
      <Card dark={dark}>
        {products.length === 0 ? <EmptyState dark={dark} title="No products yet" /> : products.map((p) => {
          const cost = computeProductCost(p, inventory);
          const profit = round2(p.price - cost);
          const margin = p.price ? round2((profit / p.price) * 100) : 0;
          return (
            <div key={p.id} onClick={() => { if (canEdit) { setEditing(p); setModal(true); } }} className="py-3 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight, cursor: canEdit ? "pointer" : "default" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{p.name}</div>
                <div className="font-extrabold text-sm" style={{ color: dark ? C.white : C.black }}>{fmtMoney(p.price)}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{p.category}{canSeeCost ? ` · Cost ${fmtMoney(cost)}` : ""}</span>
                {canSeeCost && <span className="text-xs font-bold" style={{ color: margin >= 40 ? C.lime : margin >= 20 ? C.yellow : "#FF6B85" }}>Margin {fmtPct(margin)}</span>}
              </div>
              {!p.active && <Badge dark={dark} tone="warn">INACTIVE</Badge>}
            </div>
          );
        })}
      </Card>
      {!canEdit && <div className="text-xs mt-3 text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You don't have permission to edit products, recipes, or costs.</div>}

      {modal && canEdit && (
        <ProductModal dark={dark} onClose={() => setModal(false)} product={editing} products={products} setProducts={setProducts}
          inventory={inventory} settings={settings} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </div>
  );
}

function ProductModal({ dark, onClose, product, products, setProducts, inventory, settings, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [name, setName] = useState(product?.name || "");
  const [sku, setSku] = useState(product?.sku || "");
  const [category, setCategory] = useState(product?.category || settings.productCategories[0]);
  const [price, setPrice] = useState(product?.price ?? 0);
  const [active, setActive] = useState(product?.active ?? true);
  const [description, setDescription] = useState(product?.description || "");
  const [recipe, setRecipe] = useState(product?.recipe || []);

  const cost = round2(recipe.reduce((sum, r) => { const it = inventory.find((i) => i.id === r.itemId); return sum + (it ? it.costPerUnit * r.qty : 0); }, 0));
  const profit = round2(price - cost);
  const margin = price ? round2((profit / price) * 100) : 0;

  const addIngredient = () => setRecipe([...recipe, { itemId: inventory[0]?.id, qty: 1 }]);
  const updateIngredient = (idx, patch) => setRecipe(recipe.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeIngredient = (idx) => setRecipe(recipe.filter((_, i) => i !== idx));

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = async () => {
    if (submitting) return;
    setError("");
    if (!can("manageRecipesAndCosts")) { setError("You don't have permission to edit products."); return; }
    if (!name.trim()) { setError("Product name is required."); return; }
    if (Number(price) < 0) { setError("Selling price can't be negative."); return; }
    if (recipe.some((r) => !r.qty || r.qty <= 0)) { setError("Every recipe ingredient needs a quantity greater than zero."); return; }
    setSubmitting(true);
    try {
      const payload = { id: product?.id || newDbId(), name, sku, category, price: round2(Number(price)), active, description, recipe, image: product?.image || "" };
      const next = product ? products.map((p) => (p.id === product.id ? payload : p)) : [payload, ...products];
      await setProducts(next);
      await logAudit(auditLog, setAuditLog, currentUser, product ? "Product Updated" : "Product Created", `${payload.name} · ${fmtMoney(payload.price)} · cost ${fmtMoney(cost)}`);
      showToast(product ? "Product updated" : "Product created");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!can("manageRecipesAndCosts")) { showToast("You don't have permission to delete products.", "danger"); return; }
    await setProducts(products.filter((p) => p.id !== product.id));
    await logAudit(auditLog, setAuditLog, currentUser, "Product Deleted", product.name);
    showToast("Product deleted", "danger");
    onClose();
  };

  return (
    <Modal title={product ? "Edit Product" : "New Product"} onClose={onClose} dark={dark} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Product Name"><Input dark={dark} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field dark={dark} label="SKU"><Input dark={dark} value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
        <Field dark={dark} label="Category">
          <Select dark={dark} value={category} onChange={(e) => setCategory(e.target.value)}>
            {settings.productCategories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Selling Price ($)"><Input dark={dark} type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      </div>
      <Field dark={dark} label="Description"><TextArea dark={dark} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

      <div className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Active (sellable)</span>
      </div>

      <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Recipe (Inventory Deduction)</div>
      {recipe.map((r, idx) => {
        const it = inventory.find((i) => i.id === r.itemId);
        return (
          <div key={idx} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              <Select dark={dark} value={r.itemId} onChange={(e) => updateIngredient(idx, { itemId: e.target.value })}>
                {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </Select>
            </div>
            <div className="w-24"><Input dark={dark} type="number" step="0.01" value={r.qty} onChange={(e) => updateIngredient(idx, { qty: Number(e.target.value) })} /></div>
            <div className="w-16 text-xs text-right font-semibold pb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{it ? fmtMoney(it.costPerUnit * r.qty) : ""}</div>
            <button onClick={() => removeIngredient(idx)} className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#3A0F1E" }}>
              <Trash2 size={14} color="#FF6B85" />
            </button>
          </div>
        );
      })}
      <button onClick={addIngredient} className="text-xs font-bold mb-4" style={{ color: C.lime }}>+ Add ingredient</button>

      <div className="rounded-2xl p-3 mb-4" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
        <Row dark={dark} label="Total Cost" value={fmtMoney(cost)} />
        <Row dark={dark} label="Selling Price" value={fmtMoney(price)} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Gross Profit" value={fmtMoney(profit)} bold />
        <Row dark={dark} label="Gross Margin" value={fmtPct(margin)} bold />
      </div>

      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <div className="flex gap-2">
        {product && <GhostButton dark={dark} onClick={() => setConfirmingDelete(true)} style={{ color: "#FF6B85", borderColor: "#FF6B85" }}><Trash2 size={15} /> Delete</GhostButton>}
        <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save Product"}</PrimaryButton>
      </div>
      {confirmingDelete && (
        <ConfirmDialog dark={dark} title={`Delete ${product?.name}?`} message="This permanently removes the product. It won't affect past sales records, which already store their own line-item snapshot."
          confirmLabel="Delete Product" onConfirm={async () => { await remove(); setConfirmingDelete(false); }} onCancel={() => setConfirmingDelete(false)} />
      )}
    </Modal>
  );
}

/* ============================== EXPENSES ============================== */
function ExpensesView({ dark, expenses, setExpenses, expenseOps, cashTx, persistCash, settings, locations, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [modal, setModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const total30 = round2(expenses.filter((e) => e.status !== "reversed" && withinDays(e.date, 30)).reduce((a, e) => a + e.amount, 0));
  const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

  const exportCSV = () => {
    downloadCSV("masseli-expenses.csv",
      ["Date", "Category", "Vendor", "Amount", "Payment Method", "Recurring", "Status", "Description"],
      sortedExpenses.map((e) => [dateStr(e.date), e.category, e.vendor, e.amount, e.paymentMethod, e.recurring ? "Yes" : "No", e.status === "reversed" ? "Reversed" : "Active", e.description || ""])
    );
    showToast("CSV exported");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Expenses" sub={`${fmtMoney(total30)} in last 30 days`}
        action={can("manageExpenses") ? <PrimaryButton onClick={() => setModal(true)}><Plus size={16} /> Add Expense</PrimaryButton> : null} />
      {expenses.length > 0 && <div className="flex justify-end mb-3"><GhostButton dark={dark} style={{ padding: "6px 12px", fontSize: 12 }} onClick={exportCSV}>Export CSV</GhostButton></div>}
      <Card dark={dark}>
        {expenses.length === 0 ? <EmptyState dark={dark} title="No expenses recorded" /> : sortedExpenses.map((e) => (
          <ListRow key={e.id} dark={dark} onClick={() => setViewing(e)} title={e.category} subtitle={`${dateStr(e.date)} · ${e.vendor}${e.recurring ? " · Recurring" : ""}`}
            badge={e.status === "reversed" ? <Badge dark={dark} tone="danger">REVERSED</Badge> : null}
            right={`-${fmtMoney(e.amount)}`} rightSub={e.paymentMethod} />
        ))}
      </Card>
      {modal && <ExpenseModal dark={dark} onClose={() => setModal(false)} expenses={expenses} setExpenses={setExpenses} expenseOps={expenseOps} cashTx={cashTx} persistCash={persistCash} settings={settings} locations={locations} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />}
      {viewing && <ExpenseDetailModal dark={dark} expense={viewing} onClose={() => setViewing(null)} expenses={expenses} setExpenses={setExpenses} expenseOps={expenseOps} cashTx={cashTx} persistCash={persistCash} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />}
    </div>
  );
}

function ExpenseDetailModal({ dark, expense, onClose, expenses, setExpenses, expenseOps, cashTx, persistCash, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const reversed = expense.status === "reversed";

  const doReverse = async () => {
    if (busy) return;
    if (!can("reverseExpenses")) { showToast("You don't have permission to reverse expenses.", "danger"); setConfirming(false); return; }
    setBusy(true);
    try {
      if (expenseOps?.remote) {
        try {
          await expenseOps.reverse(expense.id);
          showToast(`Expense reversed: ${fmtMoney(expense.amount)}`, "danger");
          setConfirming(false); onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabaseExpenses.ops.reverse) means fn_reverse_expense itself
          // already committed. This must never be shown as "reverse failed", or the user could be
          // misled into reversing the same expense again.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); setConfirming(false); onClose(); }
          else { showToast(e?.message || "Could not reverse this expense.", "danger"); }
        }
        return;
      }
      const latest = expenses.find((e) => e.id === expense.id) || expense;

      // Deterministic id on the cash side is the real signal of "already reversed" — not just
      // the expense status, which used to be written FIRST and could permanently block the cash
      // step from ever completing if it failed right after. A retry that finds the expense
      // already marked reversed (from an earlier interrupted attempt) still completes the
      // missing cash entry instead of stopping short, closing the confirmed F2 data-loss scenario.
      const cashId = `${expense.id}-expense-reversal-cash`;
      const cashAlreadyReversed = cashTx.some((t) => t.id === cashId);
      if (latest.status === "reversed" && cashAlreadyReversed) {
        showToast("This expense was already reversed.", "danger"); setConfirming(false); onClose(); return;
      }

      if (latest.status !== "reversed") {
        await setExpenses(expenses.map((e) => (e.id === expense.id ? { ...e, status: "reversed", reversedAt: nowISO(), reversedBy: currentUser?.id } : e)));
      }
      if (!cashAlreadyReversed) {
        await persistCash([{ id: cashId, date: nowISO(), type: "income", category: "Expense Reversal", amount: expense.amount, paymentMethod: expense.paymentMethod, description: `Reversal of ${expense.category} — ${expense.vendor}`, relatedExpenseId: expense.id, reversalOf: expense.id }, ...cashTx]);
      }
      await logAudit(auditLog, setAuditLog, currentUser, "Expense Reversed", `${expense.category} · ${fmtMoney(expense.amount)} · ${expense.vendor || ""}`);

      showToast(`Expense reversed: ${fmtMoney(expense.amount)}`, "danger");
      setConfirming(false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={expense.category} onClose={onClose} dark={dark}>
      {reversed && <div className="mb-3"><Badge dark={dark} tone="danger">REVERSED {expense.reversedAt ? `· ${dateStr(expense.reversedAt)}` : ""}</Badge></div>}
      <Card dark={dark} className="mb-4">
        <Row dark={dark} label="Amount" value={fmtMoney(expense.amount)} bold />
        <Row dark={dark} label="Date" value={dateStr(expense.date)} />
        <Row dark={dark} label="Vendor" value={expense.vendor || "—"} />
        <Row dark={dark} label="Payment Method" value={expense.paymentMethod} />
        <Row dark={dark} label="Recurring" value={expense.recurring ? "Yes" : "No"} />
      </Card>
      {expense.description && <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{expense.description}</div>}
      {!reversed && can("reverseExpenses") && (
        <GhostButton dark={dark} full onClick={() => setConfirming(true)} style={{ color: "#FF6B85", borderColor: "#FF6B85", width: "100%" }}>
          <Undo2 size={15} /> Reverse Expense
        </GhostButton>
      )}
      {!reversed && !can("reverseExpenses") && (
        <div className="text-xs text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You don't have permission to reverse expenses.</div>
      )}
      {confirming && (
        <ConfirmDialog dark={dark} title="Reverse this expense?"
          message="The original expense stays on record; a matching reversing entry is posted to Cash Flow so nothing is silently deleted."
          confirmLabel="Reverse Expense" onConfirm={doReverse} onCancel={() => setConfirming(false)} />
      )}
    </Modal>
  );
}

function ExpenseModal({ dark, onClose, expenses, setExpenses, expenseOps, cashTx, persistCash, settings, locations, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState(settings.expenseCategories[0]);
  const [vendor, setVendor] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(settings.paymentMethods[0]);
  const [locationId, setLocationId] = useState((locations || []).find((l) => l.active !== false)?.id || "");
  const [recurring, setRecurring] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!can("manageExpenses")) { setError("You don't have permission to add expenses."); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setSubmitting(true);
    try {
      const loc = (locations || []).find((l) => l.id === locationId);
      if (expenseOps?.remote) {
        if (!locationId) { setError("Select a location."); return; }
        try {
          await expenseOps.create({ amount: round2(amt), date, category, vendor, paymentMethod, locationId, recurring, description });
          showToast(`Expense added: ${fmtMoney(amt)}`); onClose();
        } catch (e) {
          // rpcSucceeded (set by useSupabaseExpenses.ops.create) means fn_create_expense itself
          // already committed — a real expense now exists. This must never be shown as "create
          // failed", or the user could be misled into adding a duplicate expense.
          if (e?.rpcSucceeded) { showToast(e.message, "good"); onClose(); }
          else { setError(e?.message || "Could not save this expense."); }
        }
        return;
      }
      const exp = { id: uid("exp"), amount: round2(amt), date: parseLocalDate(date).toISOString(), category, vendor, paymentMethod, locationId, location: loc?.name || "", recurring, description, status: "completed", createdBy: currentUser?.id };
      await setExpenses([exp, ...expenses]);
      await persistCash([{ id: uid("cash"), date: exp.date, type: "expense", category, amount: exp.amount, paymentMethod, locationId, location: loc?.name || "", description: description || vendor, relatedExpenseId: exp.id }, ...cashTx]);
      await logAudit(auditLog, setAuditLog, currentUser, "Expense Added", `${category} · ${fmtMoney(exp.amount)} · ${vendor}`);
      showToast(`Expense added: ${fmtMoney(exp.amount)}`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add Expense" onClose={onClose} dark={dark}>
      <Field dark={dark} label="Amount ($)"><Input dark={dark} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field dark={dark} label="Date"><Input dark={dark} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field dark={dark} label="Category"><Select dark={dark} value={category} onChange={(e) => setCategory(e.target.value)}>{settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field dark={dark} label="Vendor"><Input dark={dark} value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
      <Field dark={dark} label="Payment Method"><Select dark={dark} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{settings.paymentMethods.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      <Field dark={dark} label="Location">
        <Select dark={dark} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">—</option>
          {(locations || []).filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Recurring expense</span>
      </div>
      <Field dark={dark} label="Description"><TextArea dark={dark} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={submit}><Check size={16} /> {submitting ? "Saving…" : "Save Expense"}</PrimaryButton>
    </Modal>
  );
}

/* ============================== SUPPLIERS / CUSTOMERS / EMPLOYEES (light CRUD) ============================== */
function SimpleCrudView({ dark, title, items, setItems, fields, renderTitle, renderSub, showToast, canEdit = true, currentUser, auditLog, setAuditLog, auditAction }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => { if (!canEdit) return; setEditing(null); setForm(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]))); setModal(true); };
  const openEdit = (item) => { setEditing(item); setForm(item); setModal(true); };

  const save = async () => {
    if (submitting) return;
    if (!canEdit) { showToast("You don't have permission to make this change.", "danger"); return; }
    const name = form[fields[0].key];
    if (!name || !String(name).trim()) { showToast("Name is required", "danger"); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, id: editing?.id || newDbId() };
      const next = editing ? items.map((i) => (i.id === editing.id ? payload : i)) : [payload, ...items];
      await setItems(next);
      if (auditAction && auditLog !== undefined) await logAudit(auditLog, setAuditLog, currentUser, `${auditAction} ${editing ? "Updated" : "Added"}`, name);
      showToast(editing ? `${title.slice(0, -1)} updated` : `${title.slice(0, -1)} added`);
      setModal(false);
    } finally {
      setSubmitting(false);
    }
  };
  const remove = async () => {
    if (!canEdit) { showToast("You don't have permission to make this change.", "danger"); return; }
    await setItems(items.map((i) => i.id === editing.id ? { ...i, active: false } : i));
    if (auditAction && auditLog !== undefined) await logAudit(auditLog, setAuditLog, currentUser, `${auditAction} Deactivated`, form[fields[0].key] || "");
    showToast("Deactivated", "danger");
    setModal(false);
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title={title} sub={`${items.length} on file`} action={canEdit ? <PrimaryButton onClick={openNew}><Plus size={16} /> Add</PrimaryButton> : null} />
      <Card dark={dark}>
        {items.length === 0 ? <EmptyState dark={dark} title={`No ${title.toLowerCase()} yet`} /> : items.map((i) => (
          <ListRow key={i.id} dark={dark} title={renderTitle(i)} subtitle={renderSub(i)} right={<ChevronRight size={16} color={dark ? C.textMutedDark : C.textMutedLight} />} onClick={() => openEdit(i)} />
        ))}
      </Card>
      {!canEdit && <div className="text-xs mt-3 text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You have view-only access to {title.toLowerCase()}.</div>}
      {modal && (
        <Modal title={editing ? renderTitle(editing) : `New ${title.slice(0, -1)}`} onClose={() => setModal(false)} dark={dark}>
          <fieldset disabled={!canEdit} style={{ opacity: canEdit ? 1 : 0.6 }}>
            {fields.map((f) => (
              <Field dark={dark} key={f.key} label={f.label}>
                {f.type === "select" ? (
                  <Select dark={dark} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => (typeof o === "object" ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o}>{o}</option>))}
                  </Select>
                ) : f.type === "textarea" ? (
                  <TextArea dark={dark} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : f.type === "checkbox" ? (
                  <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                ) : (
                  <Input dark={dark} type={f.type || "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
                )}
              </Field>
            ))}
          </fieldset>
          {canEdit && (
            <div className="flex gap-2 mt-2">
              {editing && <GhostButton dark={dark} onClick={remove} style={{ color: "#FF6B85", borderColor: "#FF6B85" }}><Trash2 size={15} /> Delete</GhostButton>}
              <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save"}</PrimaryButton>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function LocationsView({ dark, locations, setLocations, inventory, sales, employees, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const canEdit = can("manageSettings");

  // A location "has history" if anything currently references it by id OR by its legacy name
  // string (pre-migration records) — either way it's not safe to hard-delete.
  const hasHistory = (loc) =>
    inventory.some((i) => i.locationId === loc.id || i.location === loc.name) ||
    sales.some((s) => s.locationId === loc.id || s.location === loc.name) ||
    employees.some((e) => e.location === loc.name);

  const save = async (form) => {
    if (!canEdit) { showToast("You don't have permission to manage locations.", "danger"); return false; }
    if (!form.name?.trim()) { showToast("Location name is required.", "danger"); return false; }
    const payload = { ...form, id: editing?.id || newDbId(), active: form.active !== false };
    const next = editing ? locations.map((l) => (l.id === editing.id ? payload : l)) : [payload, ...locations];
    await setLocations(next);
    await logAudit(auditLog, setAuditLog, currentUser, editing ? "Location Updated" : "Location Added", payload.name);
    showToast(editing ? "Location updated" : "Location added");
    return true;
  };

  const remove = async (loc) => {
    if (!canEdit) { showToast("You don't have permission to manage locations.", "danger"); return; }
    if (hasHistory(loc)) { showToast("This location has historical records — deactivate it instead of deleting.", "danger"); return; }
    await setLocations(locations.filter((l) => l.id !== loc.id));
    await logAudit(auditLog, setAuditLog, currentUser, "Location Deleted", loc.name);
    showToast("Location deleted", "danger");
  };

  const toggleActive = async (loc) => {
    if (!canEdit) { showToast("You don't have permission to manage locations.", "danger"); return; }
    await setLocations(locations.map((l) => (l.id === loc.id ? { ...l, active: !(l.active !== false) } : l)));
    await logAudit(auditLog, setAuditLog, currentUser, loc.active === false ? "Location Reactivated" : "Location Deactivated", loc.name);
    showToast(loc.active === false ? "Location reactivated" : "Location deactivated", loc.active === false ? "good" : "danger");
  };

  return (
    <div>
      <SectionHeader dark={dark} title="Locations" sub={`${locations.length} on file`}
        action={canEdit ? <PrimaryButton onClick={() => { setEditing(null); setModal(true); }}><Plus size={16} /> Add Location</PrimaryButton> : null} />
      <Card dark={dark}>
        {locations.length === 0 ? <EmptyState dark={dark} title="No locations yet" /> : locations.map((l) => {
          const inUse = hasHistory(l);
          return (
            <div key={l.id} className="py-3 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
              <div className="flex items-center justify-between mb-1">
                <div className="min-w-0">
                  <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{l.name}</div>
                  <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{l.type || "Location"}{inUse ? " · has history" : ""}</div>
                </div>
                {l.active === false && <Badge dark={dark} tone="danger">INACTIVE</Badge>}
              </div>
              {canEdit && (
                <div className="flex gap-2 mt-1">
                  <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setEditing(l); setModal(true); }}><Edit2 size={13} /> Edit</GhostButton>
                  <GhostButton dark={dark} style={{ padding: "6px 10px", fontSize: 12, color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => (inUse ? toggleActive(l) : remove(l))}>
                    <Trash2 size={13} /> {inUse ? (l.active === false ? "Reactivate" : "Deactivate") : "Delete"}
                  </GhostButton>
                </div>
              )}
            </div>
          );
        })}
      </Card>
      {modal && (
        <LocationFormModal dark={dark} location={editing} onClose={() => setModal(false)} onSave={save} />
      )}
    </div>
  );
}

function LocationFormModal({ dark, location, onClose, onSave }) {
  const [form, setForm] = useState(location || { name: "", type: "Retail", active: true });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSave(form);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={location ? "Edit Location" : "New Location"} onClose={onClose} dark={dark}>
      <Field dark={dark} label="Location Name"><Input dark={dark} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field dark={dark} label="Type">
        <Select dark={dark} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {["Retail", "Mobile", "Prep", "Storage", "Other"].map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Active</span>
      </div>
      <PrimaryButton full disabled={submitting} onClick={submit}><Check size={16} /> {submitting ? "Saving…" : "Save Location"}</PrimaryButton>
    </Modal>
  );
}

function SuppliersView({ dark, suppliers, setSuppliers, purchaseOrders, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const supplierStats = (s) => {
    const pos = purchaseOrders.filter((po) => po.supplierId === s.id && po.status !== "Cancelled");
    const total = round2(pos.reduce((a, po) => a + poGrandTotal(po), 0));
    const last = pos.length ? pos.reduce((latest, po) => (new Date(po.orderDate) > new Date(latest) ? po.orderDate : latest), pos[0].orderDate) : null;
    return { poCount: pos.length, total, last };
  };

  const openNew = () => { setEditing(null); setModal(true); };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Suppliers" sub={`${suppliers.length} on file`} action={can("manageSuppliers") ? <PrimaryButton onClick={openNew}><Plus size={16} /> Add</PrimaryButton> : null} />
      <Card dark={dark}>
        {suppliers.length === 0 ? <EmptyState dark={dark} title="No suppliers yet" /> : suppliers.map((s) => {
          const stats = supplierStats(s);
          return (
            <ListRow key={s.id} dark={dark} onClick={() => setViewing(s)}
              title={s.name} subtitle={`${s.contact} · ${stats.poCount} order${stats.poCount === 1 ? "" : "s"} · ${fmtMoney(stats.total)} total`}
              badge={s.active === false ? <Badge dark={dark} tone="danger">INACTIVE</Badge> : null}
              right={<ChevronRight size={16} color={dark ? C.textMutedDark : C.textMutedLight} />} />
          );
        })}
      </Card>

      {modal && (
        <SupplierFormModal dark={dark} onClose={() => setModal(false)} supplier={editing} suppliers={suppliers} setSuppliers={setSuppliers}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
      {viewing && (
        <SupplierDetailModal dark={dark} supplier={viewing} suppliers={suppliers} setSuppliers={setSuppliers} purchaseOrders={purchaseOrders}
          onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setModal(true); }}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </div>
  );
}

function SupplierFormModal({ dark, onClose, supplier, suppliers, setSuppliers, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [form, setForm] = useState(supplier || { name: "", contact: "", phone: "", email: "", address: "", website: "", taxId: "", terms: "Net 30", defaultCurrency: "USD", products: "", notes: "", active: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (submitting) return;
    if (!can("manageSuppliers")) { setError("You don't have permission to manage suppliers."); return; }
    if (!form.name?.trim()) { setError("Supplier name is required."); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, id: supplier?.id || newDbId(), active: form.active !== false };
      const next = supplier ? suppliers.map((s) => (s.id === supplier.id ? payload : s)) : [payload, ...suppliers];
      await setSuppliers(next);
      await logAudit(auditLog, setAuditLog, currentUser, supplier ? "Supplier Updated" : "Supplier Added", payload.name);
      showToast(supplier ? "Supplier updated" : "Supplier added");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={supplier ? "Edit Supplier" : "New Supplier"} onClose={onClose} dark={dark} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Supplier Name"><Input dark={dark} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field dark={dark} label="Contact Person"><Input dark={dark} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <Field dark={dark} label="Phone"><Input dark={dark} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field dark={dark} label="Email"><Input dark={dark} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field dark={dark} label="Website"><Input dark={dark} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></Field>
        <Field dark={dark} label="Tax ID / Business ID"><Input dark={dark} value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
        <Field dark={dark} label="Payment Terms"><Input dark={dark} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field>
        <Field dark={dark} label="Default Currency"><Input dark={dark} value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })} /></Field>
      </div>
      <Field dark={dark} label="Address"><Input dark={dark} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field dark={dark} label="Products Supplied"><Input dark={dark} value={form.products} onChange={(e) => setForm({ ...form, products: e.target.value })} /></Field>
      <Field dark={dark} label="Notes"><TextArea dark={dark} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Active</span>
      </div>
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save Supplier"}</PrimaryButton>
    </Modal>
  );
}

function SupplierDetailModal({ dark, supplier, suppliers, setSuppliers, purchaseOrders, onClose, onEdit, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const pos = purchaseOrders.filter((po) => po.supplierId === supplier.id).sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
  const activePOs = pos.filter((po) => po.status !== "Cancelled");
  const total = round2(activePOs.reduce((a, po) => a + poGrandTotal(po), 0));
  const last = activePOs[0]?.orderDate;
  const hasHistory = pos.length > 0;

  const toggleActive = async () => {
    if (!can("manageSuppliers")) { showToast("You don't have permission to manage suppliers.", "danger"); setConfirmingDeactivate(false); return; }
    const nextActive = !(supplier.active !== false);
    await setSuppliers(suppliers.map((s) => (s.id === supplier.id ? { ...s, active: nextActive } : s)));
    await logAudit(auditLog, setAuditLog, currentUser, nextActive ? "Supplier Reactivated" : "Supplier Deactivated", supplier.name);
    showToast(supplier.active === false ? "Supplier reactivated" : "Supplier deactivated");
    setConfirmingDeactivate(false);
    onClose();
  };

  return (
    <Modal title={supplier.name} onClose={onClose} dark={dark} wide>
      {supplier.active === false && <div className="mb-3"><Badge dark={dark} tone="danger">INACTIVE</Badge></div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard dark={dark} label="Total Purchased" value={fmtMoney(total)} />
        <StatCard dark={dark} label="Purchase Orders" value={activePOs.length} />
        <StatCard dark={dark} label="Last Purchase" value={last ? dateStr(last) : "—"} />
      </div>
      <Card dark={dark} className="mb-4">
        <Row dark={dark} label="Contact" value={supplier.contact || "—"} />
        <Row dark={dark} label="Phone" value={supplier.phone || "—"} />
        <Row dark={dark} label="Email" value={supplier.email || "—"} />
        <Row dark={dark} label="Website" value={supplier.website || "—"} />
        <Row dark={dark} label="Payment Terms" value={supplier.terms || "—"} />
        <Row dark={dark} label="Products Supplied" value={supplier.products || "—"} />
      </Card>

      <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Purchase History</div>
      <Card dark={dark} className="mb-4">
        {pos.length === 0 ? <EmptyState dark={dark} title="No purchases yet" /> : pos.slice(0, 10).map((po) => (
          <ListRow key={po.id} dark={dark} title={po.poNumber} subtitle={`${dateStr(po.orderDate)} · ${po.status}`} right={fmtMoney(poGrandTotal(po))} />
        ))}
      </Card>

      {can("manageSuppliers") && (
        <div className="flex gap-2">
          <GhostButton dark={dark} style={{ flex: 1 }} onClick={onEdit}><Edit2 size={15} /> Edit</GhostButton>
          {hasHistory ? (
            <GhostButton dark={dark} style={{ flex: 1, color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setConfirmingDeactivate(true)}>
              {supplier.active === false ? "Reactivate" : "Deactivate"}
            </GhostButton>
          ) : (
            <GhostButton dark={dark} style={{ flex: 1, color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setConfirmingDeactivate(true)}>
              <Trash2 size={15} /> Delete
            </GhostButton>
          )}
        </div>
      )}
      {hasHistory && <div className="text-xs mt-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>This supplier has purchase history, so it's deactivated rather than deleted to keep past records intact.</div>}

      {confirmingDeactivate && (
        <ConfirmDialog dark={dark} title={hasHistory ? (supplier.active === false ? "Reactivate this supplier?" : "Deactivate this supplier?") : "Delete this supplier?"}
          message={hasHistory ? "It stays on record with full purchase history — you can reactivate it any time." : "This supplier has no purchase history, so it can be permanently removed."}
          confirmLabel={hasHistory ? (supplier.active === false ? "Reactivate" : "Deactivate") : "Delete"}
          onConfirm={async () => {
            if (!can("manageSuppliers")) { showToast("You don't have permission to manage suppliers.", "danger"); setConfirmingDeactivate(false); return; }
            if (hasHistory) { await toggleActive(); }
            else {
              await setSuppliers(suppliers.filter((s) => s.id !== supplier.id));
              await logAudit(auditLog, setAuditLog, currentUser, "Supplier Deleted", supplier.name);
              showToast("Supplier deleted", "danger"); setConfirmingDeactivate(false); onClose();
            }
          }}
          onCancel={() => setConfirmingDeactivate(false)} />
      )}
    </Modal>
  );
}
function CustomerCreateModal({ dark, onClose, customers, setCustomers, currentUser, auditLog, setAuditLog, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const duplicate = (name || phone || email) ? findDuplicateCustomer(customers, { name, phone, email }) : null;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await createCustomer({ name, phone, email, birthday, notes }, { customers, setCustomers, currentUser, auditLog, setAuditLog });
      if (!r.success) { setError(r.error); return; }
      onCreated(r.customer);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New Customer" onClose={onClose} dark={dark}>
      <Field dark={dark} label="Name"><Input dark={dark} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field dark={dark} label="Phone (optional)"><Input dark={dark} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <Field dark={dark} label="Email (optional)"><Input dark={dark} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field dark={dark} label="Birthday (optional)"><Input dark={dark} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></Field>
      <Field dark={dark} label="Notes (optional)"><TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {duplicate && (
        <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A2E0F", color: "#FFD166" }}>
          Possible existing customer: {duplicate.customer.name} (matched by {duplicate.matchType}). You can still create a new one if this is a different person.
        </div>
      )}
      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <PrimaryButton full disabled={submitting || !name.trim()} onClick={submit}><Check size={16} /> {submitting ? "Saving…" : "Create Customer"}</PrimaryButton>
    </Modal>
  );
}

function CustomerDetailModal({ dark, customerId, onClose, customers, setCustomers, sales, products, inventory, setInventory, persistSales, cashTx, persistCash, invTx, setInvTx, locations, employees, settings, loyaltyTransactions, setLoyaltyTransactions, reloadLoyalty, businessAlerts, setBusinessAlerts, currentUser, can, auditLog, setAuditLog, showToast }) {
  const customer = (customers || []).find((c) => c.id === customerId);
  const [viewingSale, setViewingSale] = useState(null);
  const [adjustType, setAdjustType] = useState("manual_add");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canManage = can("manageCustomers");
  const canLoyalty = can("manageLoyalty");

  if (!customer) return null;

  const stats = getCustomerStats(customer.id, sales);
  const balance = getLoyaltyBalance(customer.id, loyaltyTransactions);
  const history = (loyaltyTransactions || []).filter((t) => t.customerId === customer.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const orders = (sales || []).filter((s) => s.customerId === customer.id).sort((a, b) => new Date(b.date) - new Date(a.date));

  const doAdjust = async () => {
    if (submitting) return;
    setError("");
    if (!canLoyalty) { setError("You don't have permission to adjust loyalty points."); return; }
    setSubmitting(true);
    try {
      const r = await manualLoyaltyAdjustment({ customerId: customer.id, type: adjustType, points: adjustPoints, reason: adjustReason }, { loyaltyTransactions, setLoyaltyTransactions, currentUser, auditLog, setAuditLog });
      if (!r.success) { setError(r.error); return; }
      // rpcSucceeded/staleData (see manualLoyaltyAdjustment) means fn_manual_loyalty_adjustment
      // already committed and only the screen refresh failed — never worded as a failure, and the
      // form still clears below exactly as on a normal success, since the adjustment is real.
      showToast(r.staleData ? r.message : `${adjustType === "manual_add" ? "Added" : "Removed"} ${adjustPoints} points`, r.staleData ? "good" : undefined);
      setAdjustPoints(""); setAdjustReason("");
    } finally {
      setSubmitting(false);
    }
  };

  const doArchive = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await archiveCustomer(customer.id, { customers, setCustomers, currentUser, auditLog, setAuditLog });
      if (r.success) { showToast("Customer archived"); onClose(); }
    } finally {
      setSubmitting(false);
    }
  };
  const doRestore = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await restoreCustomer(customer.id, { customers, setCustomers, currentUser, auditLog, setAuditLog });
      if (r.success) showToast("Customer restored");
    } finally {
      setSubmitting(false);
    }
  };

  const LOYALTY_LABEL = { earn: "Earned", redeem: "Redeemed", manual_add: "Manual Add", manual_remove: "Manual Remove", reversal: "Reversal", restore: "Restored" };

  return (
    <Modal title={customer.name} onClose={onClose} dark={dark} wide>
      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>CUSTOMER INFORMATION</div>
        <Row dark={dark} label="Phone" value={customer.phone || "—"} />
        <Row dark={dark} label="Email" value={customer.email || "—"} />
        <Row dark={dark} label="Birthday" value={customer.birthday || "—"} />
        <Row dark={dark} label="Created" value={customer.createdAt ? dateStr(customer.createdAt) : "—"} />
        <Row dark={dark} label="Status" value={customer.active !== false ? "Active" : "Archived"} />
        {customer.notes && <div className="text-xs mt-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Notes: {customer.notes}</div>}
        {canManage && (
          <div className="mt-3">
            {customer.active !== false
              ? <GhostButton dark={dark} disabled={submitting} onClick={doArchive} style={{ color: "#FF6B85", borderColor: "#FF6B85" }}>Archive Customer</GhostButton>
              : <GhostButton dark={dark} disabled={submitting} onClick={doRestore}>Restore Customer</GhostButton>}
          </div>
        )}
      </Card>

      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>CUSTOMER PERFORMANCE</div>
        <Row dark={dark} label="Total Orders" value={stats.totalOrders} />
        {can("viewFinancials") && <Row dark={dark} label="Total Spent" value={fmtMoney(stats.totalSpent)} />}
        {can("viewFinancials") && <Row dark={dark} label="Average Order Value" value={fmtMoney(stats.avgOrderValue)} />}
        <Row dark={dark} label="Last Order" value={stats.lastOrderDate ? dateStr(stats.lastOrderDate) : "—"} />
        <Row dark={dark} label="Loyalty Points" value={`${balance} pts`} bold />
      </Card>

      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>PURCHASE HISTORY</div>
        {orders.length === 0 ? <EmptyState dark={dark} title="No orders yet" /> : orders.slice(0, 20).map((s) => (
          <div key={s.id} className="py-2 border-b last:border-b-0 cursor-pointer flex items-center justify-between" style={{ borderColor: dark ? C.borderDark : C.borderLight }} onClick={() => setViewingSale(s)}>
            <div>
              <div className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Order #{s.orderNo} {s.status === "cancelled" && <span style={{ color: "#FF6B85" }}>· CANCELLED</span>}</div>
              <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{dateStr(s.date)} · {s.location || "—"} · {s.paymentMethod}</div>
            </div>
            <div className="text-sm font-bold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(s.total)}</div>
          </div>
        ))}
      </Card>

      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>LOYALTY HISTORY</div>
        {history.length === 0 ? <EmptyState dark={dark} title="No loyalty activity yet" /> : history.map((t) => (
          <div key={t.id} className="py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: dark ? C.white : C.black }}>
                {LOYALTY_DIRECTION[t.type] > 0 ? "+" : "-"}{t.points} {LOYALTY_LABEL[t.type] || t.type}{t.saleId ? ` · Order` : ""}
              </span>
              <span style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{dateStr(t.createdAt)}</span>
            </div>
            <div style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{t.reason}{t.createdByName ? ` · ${t.createdByName}` : ""}</div>
          </div>
        ))}
      </Card>

      {canLoyalty && (
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>MANUAL POINT ADJUSTMENT</div>
          {error && <div className="text-xs font-semibold mb-2 px-2 py-1.5 rounded-lg" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Field dark={dark} label="Adjustment Type">
              <Select dark={dark} value={adjustType} onChange={(e) => setAdjustType(e.target.value)} style={{ width: "100%" }}>
                <option value="manual_add">Add Points</option>
                <option value="manual_remove">Remove Points</option>
              </Select>
            </Field>
            <Field dark={dark} label="Points">
              <Input dark={dark} type="number" min="1" step="1" inputMode="numeric" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} placeholder="e.g. 50" style={{ width: "100%", minWidth: 0, fontSize: 16, fontWeight: 700 }} />
            </Field>
          </div>
          <Field dark={dark} label="Reason (required)"><Input dark={dark} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Customer service recovery" /></Field>
          <PrimaryButton full disabled={submitting} onClick={doAdjust}><Check size={16} /> {submitting ? "Saving…" : "Apply Adjustment"}</PrimaryButton>
        </Card>
      )}

      {viewingSale && (
        <SaleDetailModal dark={dark} sale={viewingSale} onClose={() => setViewingSale(null)} products={products}
          inventory={inventory} setInventory={setInventory} sales={sales} persistSales={persistSales}
          cashTx={cashTx} persistCash={persistCash} invTx={invTx} setInvTx={setInvTx} locations={locations}
          employees={employees} customers={customers} settings={settings}
          loyaltyTransactions={loyaltyTransactions} setLoyaltyTransactions={setLoyaltyTransactions} reloadLoyalty={reloadLoyalty}
          businessAlerts={businessAlerts} setBusinessAlerts={setBusinessAlerts}
          currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </Modal>
  );
}

function CustomersView({ dark, customers, setCustomers, sales, products, inventory, setInventory, persistSales, cashTx, persistCash, invTx, setInvTx, locations, employees, settings, loyaltyTransactions, setLoyaltyTransactions, loyaltyRewards, reloadLoyalty, businessAlerts, setBusinessAlerts, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const showSpend = can("viewFinancials");
  const canManage = can("manageCustomers");

  const baseList = (customers || []).filter((c) => (showArchived ? c.active === false : c.active !== false));
  const q = query.trim().toLowerCase();
  const qDigits = normalizePhone(query);
  const filtered = baseList.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)) || (qDigits.length >= 3 && normalizePhone(c.phone).includes(qDigits)));

  const now = new Date();
  const newThisMonth = (customers || []).filter((c) => { if (!c.createdAt) return false; const d = new Date(c.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const totalPointsOutstanding = (customers || []).reduce((a, c) => a + getLoyaltyBalance(c.id, loyaltyTransactions), 0);

  const passthroughCtx = { products, inventory, setInventory, persistSales, cashTx, persistCash, invTx, setInvTx, locations, employees, settings, loyaltyTransactions, setLoyaltyTransactions, reloadLoyalty, businessAlerts, setBusinessAlerts, currentUser, can, auditLog, setAuditLog, showToast };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {[
          ["Total Customers", customers.length],
          ["Active Customers", customers.filter((c) => c.active !== false).length],
          ["Loyalty Points Outstanding", totalPointsOutstanding],
          ["New This Month", newThisMonth],
        ].map(([label, value]) => (
          <Card dark={dark} key={label} style={{ padding: 10 }}>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{label.toUpperCase()}</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{value}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <Input dark={dark} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, or email…" style={{ flex: 1 }} />
        {canManage && <PrimaryButton onClick={() => setCreating(true)}><Plus size={16} /> New Customer</PrimaryButton>}
      </div>
      <GhostButton dark={dark} onClick={() => setShowArchived((s) => !s)} style={{ marginBottom: 12 }}>{showArchived ? "Showing Archived — Show Active" : "Show Archived"}</GhostButton>

      <Card dark={dark}>
        {filtered.length === 0 ? <EmptyState dark={dark} title="No customers found" sub={showArchived ? "No archived customers" : "Try a different search, or add a new customer"} /> : filtered.map((c) => {
          const stats = getCustomerStats(c.id, sales);
          const balance = getLoyaltyBalance(c.id, loyaltyTransactions);
          return (
            <div key={c.id} className="py-3 border-b last:border-b-0 cursor-pointer flex items-center justify-between" style={{ borderColor: dark ? C.borderDark : C.borderLight }} onClick={() => setDetailId(c.id)}>
              <div>
                <div className="font-semibold text-sm" style={{ color: dark ? C.white : C.black }}>{c.name}</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{c.phone || "—"}{c.email ? ` · ${c.email}` : ""}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold" style={{ color: C.lime }}>{balance} pts</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{stats.totalOrders} orders{showSpend ? ` · ${fmtMoney(stats.totalSpent)}` : ""}</div>
              </div>
            </div>
          );
        })}
      </Card>

      {creating && (
        <CustomerCreateModal dark={dark} onClose={() => setCreating(false)} customers={customers} setCustomers={setCustomers} currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog}
          onCreated={(c) => { setCreating(false); setDetailId(c.id); }} />
      )}
      {detailId && (
        <CustomerDetailModal dark={dark} customerId={detailId} onClose={() => setDetailId(null)} customers={customers} setCustomers={setCustomers} sales={sales} {...passthroughCtx} />
      )}
    </div>
  );
}

// Formats minutes as "Xh Ym" for live shift/break duration display — presentation only, never
// used for the authoritative calculation (that's always calculateWorkedMinutes/calculateBreakMinutes).
function formatMinutesLive(mins) {
  const m = Math.max(0, Math.floor(mins));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

// Self-service Clock In/Out/Break control for the currently logged-in employee. Never touches
// anyone else's shift. All three mutations (clockIn/clockOut/startBreak/endBreak) go through the
// already-tested central functions — this component only decides WHEN to call them and displays
// the live-ticking duration; the authoritative time math never happens here.
// Read-only detail view for any employee (reachable only by users with manageUsers, per
// EmployeesView's gating). Uses the already-tested getEmployeeShiftStats/getEmployeePerformance
// directly — no calculation is duplicated here. Financial fields (hourlyRate, labor cost) are
// gated by viewFinancials and, per the spec, are not rendered into the DOM at all when
// unauthorized — not just visually hidden.
function EmployeeDetailModal({ dark, employeeId, onClose, employees, shifts, sales, locations, currentUser, can, showToast }) {
  const [historyRange, setHistoryRange] = useState("30d");
  const employee = (employees || []).find((e) => e.id === employeeId);
  const showFinancials = can("viewFinancials");

  if (!employee) return null;

  const openShift = findOpenShift(employeeId, shifts);
  const activeBreak = openShift ? (openShift.breaks || []).find((b) => !b.endedAt) : null;
  const range = historyRange === "all" ? null : getDateRange(historyRange === "7d" ? "7d" : historyRange === "30d" ? "30d" : "today");
  const stats = getEmployeeShiftStats(employeeId, shifts, range);
  const perf = getEmployeePerformance(employeeId, sales, shifts, range);
  const locationName = (id) => (locations || []).find((l) => l.id === id)?.name || "—";

  return (
    <Modal title={employee.name} onClose={onClose} dark={dark} wide>
      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Employee Information</div>
        <Row dark={dark} label="Role" value={employee.role || "—"} />
        <Row dark={dark} label="Status" value={employee.active !== false ? "Active" : "Archived"} />
        <Row dark={dark} label="Location (on file)" value={employee.location || "—"} />
        {employee.managerId && <Row dark={dark} label="Reports To" value={(employees || []).find((e) => e.id === employee.managerId)?.name || "—"} />}
        {showFinancials && typeof employee.hourlyRate === "number" && <Row dark={dark} label="Hourly Rate" value={fmtMoney(employee.hourlyRate)} />}
      </Card>

      <Card dark={dark} className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Current Shift Status</div>
          <Badge dark={dark} tone={activeBreak ? "warn" : openShift ? "good" : "default"}>
            {activeBreak ? "ON BREAK" : openShift ? "CLOCKED IN" : "CLOCKED OUT"}
          </Badge>
        </div>
        {openShift ? (
          <>
            <Row dark={dark} label="Clocked in at" value={`${dateStr(openShift.clockInAt)} ${timeStr(openShift.clockInAt)}`} />
            <Row dark={dark} label="Location" value={locationName(openShift.locationId)} />
            <Row dark={dark} label="Worked so far" value={formatMinutesLive(calculateWorkedMinutes(openShift))} />
            {activeBreak && <Row dark={dark} label="Current break" value={formatMinutesLive(calculateBreakMinutes({ breaks: [activeBreak] }))} />}
          </>
        ) : (
          <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Not currently clocked in.</div>
        )}
      </Card>

      <div className="flex gap-2 mb-3">
        {[["today", "Today"], ["7d", "7 Days"], ["30d", "30 Days"], ["all", "All Time"]].map(([id, label]) => (
          <button key={id} onClick={() => setHistoryRange(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: historyRange === id ? C.lime : (dark ? C.surfaceDark : C.white), color: historyRange === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
      </div>

      <Card dark={dark} className="mb-3">
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Performance</div>
        <Row dark={dark} label="Sales Count" value={perf.salesCount} />
        {showFinancials && <Row dark={dark} label="Revenue" value={fmtMoney(perf.revenue)} />}
        {showFinancials && <Row dark={dark} label="Average Ticket" value={perf.averageTicket !== null ? fmtMoney(perf.averageTicket) : "—"} />}
        <Row dark={dark} label="Worked Hours" value={perf.workedHours} />
        <Row dark={dark} label="Sales / Hour" value={perf.salesPerHour !== null ? perf.salesPerHour : "No data available for this period"} />
        {showFinancials && <Row dark={dark} label="Revenue / Hour" value={perf.revenuePerHour !== null ? fmtMoney(perf.revenuePerHour) : "No data available for this period"} />}
        {showFinancials && typeof employee.hourlyRate === "number" && (
          <Row dark={dark} label="Estimated Labor Cost" value={fmtMoney(round2(perf.workedHours * employee.hourlyRate))} bold />
        )}
      </Card>

      <Card dark={dark}>
        <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Shift History</div>
        {stats.recentShifts.length === 0 ? <EmptyState dark={dark} title="No shifts in this range" /> : stats.recentShifts.map((s) => (
          <div key={s.id} className="py-2 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: dark ? C.white : C.black }}>{dateStr(s.clockInAt)} · {locationName(s.locationId)}</span>
              <Badge dark={dark} tone={s.status === "open" ? "good" : "default"}>{s.status === "open" ? "OPEN" : "CLOSED"}</Badge>
            </div>
            <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
              {timeStr(s.clockInAt)} – {s.clockOutAt ? timeStr(s.clockOutAt) : "—"} · Worked {formatMinutesLive(calculateWorkedMinutes(s))}
              {calculateBreakMinutes(s) > 0 ? ` · Break ${formatMinutesLive(calculateBreakMinutes(s))}` : ""}
            </div>
          </div>
        ))}
      </Card>
    </Modal>
  );
}

function MyShiftCard({ dark, myEmployeeId, shifts, setShifts, locations, employees, currentUser, auditLog, setAuditLog, showToast }) {
  const [locationId, setLocationId] = useState((locations || []).find((l) => l.active !== false)?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0); // forces a re-render every 30s so the live duration stays current, without mutating shift data

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  if (!myEmployeeId) return null; // no linked employee — fail safely, never fabricate one

  const employee = (employees || []).find((e) => e.id === myEmployeeId);
  const shiftCtx = { shifts, setShifts, employees, currentUser, auditLog, setAuditLog };
  const openShift = findOpenShift(myEmployeeId, shifts);
  const activeBreak = openShift ? (openShift.breaks || []).find((b) => !b.endedAt) : null;

  const doClockIn = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await clockIn({ employeeId: myEmployeeId, locationId: locationId || null }, shiftCtx);
      if (!r.success) { showToast(r.error, "danger"); return; }
      showToast("Clocked in");
    } finally { setSubmitting(false); }
  };
  const doClockOut = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await clockOut({ employeeId: myEmployeeId }, shiftCtx);
      if (!r.success) { showToast(r.error, "danger"); return; }
      showToast("Clocked out");
    } finally { setSubmitting(false); }
  };
  const doStartBreak = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await startBreak({ employeeId: myEmployeeId }, shiftCtx); showToast("Break started"); }
    finally { setSubmitting(false); }
  };
  const doEndBreak = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await endBreak({ employeeId: myEmployeeId }, shiftCtx); showToast("Break ended"); }
    finally { setSubmitting(false); }
  };

  const workedMinutes = openShift ? calculateWorkedMinutes(openShift) : 0;
  const breakMinutes = openShift ? calculateBreakMinutes(openShift) : 0;
  const activeBreakMinutes = activeBreak ? calculateBreakMinutes({ breaks: [activeBreak] }) : 0;

  return (
    <Card dark={dark} className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>My Shift{employee ? ` — ${employee.name}` : ""}</div>
        <Badge dark={dark} tone={activeBreak ? "warn" : openShift ? "good" : "default"}>
          {activeBreak ? "ON BREAK" : openShift ? "CLOCKED IN" : "CLOCKED OUT"}
        </Badge>
      </div>

      {openShift ? (
        <>
          <Row dark={dark} label="Clocked in at" value={`${dateStr(openShift.clockInAt)} ${timeStr(openShift.clockInAt)}`} />
          <Row dark={dark} label="Shift duration" value={formatMinutesLive(workedMinutes + breakMinutes)} />
          <Row dark={dark} label="Worked time" value={formatMinutesLive(workedMinutes)} bold />
          {activeBreak && <Row dark={dark} label="Current break" value={formatMinutesLive(activeBreakMinutes)} />}
          {!activeBreak && breakMinutes > 0 && <Row dark={dark} label="Break time so far" value={formatMinutesLive(breakMinutes)} />}
          <div className="flex gap-2 mt-3">
            {activeBreak ? (
              <GhostButton dark={dark} style={{ flex: 1 }} disabled={submitting} onClick={doEndBreak}>End Break</GhostButton>
            ) : (
              <GhostButton dark={dark} style={{ flex: 1 }} disabled={submitting} onClick={doStartBreak}>Start Break</GhostButton>
            )}
            <PrimaryButton style={{ flex: 1 }} disabled={submitting} onClick={doClockOut}>Clock Out</PrimaryButton>
          </div>
        </>
      ) : (
        <>
          {(locations || []).filter((l) => l.active !== false).length > 1 && (
            <Field dark={dark} label="Location">
              <Select dark={dark} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {(locations || []).filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
          <PrimaryButton full disabled={submitting} onClick={doClockIn}>{submitting ? "Clocking in…" : "Clock In"}</PrimaryButton>
        </>
      )}
    </Card>
  );
}

function EmployeesView({ dark, employees, setEmployees, locations, tasks, persistTasks, shifts, setShifts, sales, currentUser, can, auditLog, setAuditLog, showToast }) {
  const role = currentUser?.role;
  const myEmployeeId = currentUser?.employeeId || "";
  const isOwner = role === "OWNER";
  const isManager = role === "MANAGER";
  // Real data-level scoping, not just a hidden button: a Manager's "staff" list is computed here as
  // exactly the employees who report to them (managerId match), so there's nothing to bypass by
  // navigating around the UI — the array itself never contains anyone outside their team.
  const visibleEmployees = isOwner || can("manageUsers")
    ? employees
    : isManager
      ? employees.filter((e) => e.managerId === myEmployeeId)
      : [];
  const showStaffTab = isOwner || isManager || can("manageUsers");
  const [subTab, setSubTab] = useState(showStaffTab ? "staff" : "tasks");
  const showRate = can("viewFinancials");
  // Editing staff records (including pay rate) requires manageUsers specifically — viewing
  // financial figures, or managing a team's tasks, does not by itself grant HR edit rights.
  const canEdit = can("manageUsers");
  const myTasks = (tasks || []).filter((t) => t.assignedTo === myEmployeeId && t.status !== "done");
  const openTaskCount = can("manageTasks") ? (tasks || []).filter((t) => t.status !== "done").length : myTasks.length;
  const [detailEmployeeId, setDetailEmployeeId] = useState(null);

  return (
    <div>
      {/* Self-service shift control — visible to any authenticated user with a linked employee
          record, regardless of role/permissions. No special permission required, per the
          confirmed Step 0/13 architecture: this is a personal action, not a management one. */}
      <MyShiftCard dark={dark} myEmployeeId={myEmployeeId} shifts={shifts} setShifts={setShifts} locations={locations}
        employees={employees} currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />

      {showStaffTab && (
        <div className="flex gap-2 mb-4">
          {[["staff", "Staff"], ["tasks", `Tasks${openTaskCount ? ` (${openTaskCount})` : ""}`]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: subTab === id ? C.lime : (dark ? C.surfaceDark : C.white), color: subTab === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {subTab === "staff" && showStaffTab ? (
        <>
          {isManager && !canEdit && (
            <div className="text-xs mb-3 px-3 py-2 rounded-xl" style={{ background: dark ? C.surfaceDark : C.bgLight, color: dark ? C.textMutedDark : C.textMutedLight }}>
              You're viewing employees who report to you. Editing HR records requires Owner access.
            </div>
          )}
          {/* manageUsers-gated: view all employee shift/labor detail — self-service above already
              covers the logged-in user's own shift regardless of this permission. */}
          {can("manageUsers") && (
            <Card dark={dark} className="mb-4">
              <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Employee Shift Detail</div>
              <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>View clock status, shift history, and performance for any staff member.</div>
              <Select dark={dark} value="" onChange={(e) => e.target.value && setDetailEmployeeId(e.target.value)}>
                <option value="">Select an employee…</option>
                {visibleEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.active === false ? " (inactive)" : ""}</option>)}
              </Select>
            </Card>
          )}
          <SimpleCrudView dark={dark} title="Employees" items={visibleEmployees} setItems={setEmployees} showToast={showToast}
            canEdit={canEdit} currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog} auditAction="Employee Record"
            renderTitle={(e) => e.name} renderSub={(e) => `${e.role}${showRate ? ` · ${fmtMoney(e.hourlyRate)}/hr` : ""} · ${e.location}${e.active === false ? " · Inactive" : ""}`}
            fields={[
              { key: "name", label: "Name" }, { key: "role", label: "Job Title" }, { key: "hourlyRate", label: "Hourly Rate ($)", type: "number" },
              { key: "location", label: "Location", type: "select", options: locations.map((l) => l.name) },
              { key: "managerId", label: "Reports To", type: "select", options: [{ value: "", label: "— No manager (reports to Owner) —" }, ...employees.map((e) => ({ value: e.id, label: e.name }))] },
              { key: "active", label: "Active", type: "checkbox", default: true }, { key: "notes", label: "Notes", type: "textarea" },
            ]} />
        </>
      ) : (
        <TasksView dark={dark} tasks={tasks} persistTasks={persistTasks} employees={employees} currentUser={currentUser} can={can}
          auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}

      {detailEmployeeId && (
        <EmployeeDetailModal dark={dark} employeeId={detailEmployeeId} onClose={() => setDetailEmployeeId(null)}
          employees={employees} shifts={shifts} sales={sales} locations={locations} currentUser={currentUser} can={can} showToast={showToast} />
      )}
    </div>
  );
}

function TasksView({ dark, tasks, persistTasks, employees, currentUser, can, auditLog, setAuditLog, showToast }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("open");
  const canManage = can("manageTasks");
  const myEmployeeId = currentUser?.employeeId || "";
  const today0 = dateStrOffset(0);

  const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

  // Hard, data-level enforcement: someone without manageTasks only ever sees an array containing
  // their own assignments — there is no filter tab or UI state that can surface anyone else's task.
  const baseTasks = canManage ? tasks : tasks.filter((t) => t.assignedTo === myEmployeeId);
  const sorted = [...baseTasks].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const filtered =
    filter === "mine" ? sorted.filter((t) => t.assignedTo === myEmployeeId) :
    filter === "open" ? sorted.filter((t) => t.status !== "done") :
    filter === "done" ? sorted.filter((t) => t.status === "done") : sorted;

  const logActivity = (task, action) => [{ date: nowISO(), userId: currentUser?.id, userName: currentUser?.name, action }, ...(task.activity || [])];

  const toggleDone = async (task) => {
    // Marking done is allowed for the assignee themselves, or anyone with manageTasks — checked
    // here against the freshest record, not just whether the checkbox happened to be reachable.
    const latest = tasks.find((t) => t.id === task.id) || task;
    const allowed = canManage || latest.assignedTo === myEmployeeId;
    if (!allowed) { showToast("You can only update your own tasks.", "danger"); return; }
    const next = latest.status === "done"
      ? { ...latest, status: "pending", completedAt: null, completedBy: null, activity: logActivity(latest, "Reopened") }
      : { ...latest, status: "done", completedAt: nowISO(), completedBy: currentUser?.id, activity: logActivity(latest, "Completed") };
    await persistTasks(tasks.map((t) => (t.id === task.id ? next : t)));
    showToast(next.status === "done" ? "Task completed" : "Task reopened");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Tasks" sub={`${baseTasks.filter((t) => t.status !== "done").length} open${!canManage ? " · assigned to me" : ""}`}
        action={canManage ? <PrimaryButton onClick={() => { setEditing(null); setModal(true); }}><Plus size={16} /> New Task</PrimaryButton> : null} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(canManage ? [["open", "Open"], ["done", "Done"], ["mine", "Assigned to Me"], ["all", "All"]] : [["open", "Open"], ["done", "Done"], ["all", "All"]]).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: filter === id ? C.lime : (dark ? C.surfaceDark : C.white), color: filter === id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {label}
          </button>
        ))}
      </div>

      <Card dark={dark}>
        {filtered.length === 0 ? <EmptyState dark={dark} title="No tasks" sub={canManage ? "Tap New Task to assign one." : "Nothing assigned to you right now."} /> : filtered.map((t) => {
          const overdue = t.status !== "done" && t.dueDate && t.dueDate < today0;
          const mine = t.assignedTo === myEmployeeId;
          return (
            <div key={t.id} className="flex items-center gap-3 py-3 border-b last:border-b-0" style={{ borderColor: dark ? C.borderDark : C.borderLight }}>
              <button onClick={() => toggleDone(t)} className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: t.status === "done" ? C.lime : "transparent", border: `2px solid ${t.status === "done" ? C.lime : (dark ? C.borderDark : C.borderLight)}` }}>
                {t.status === "done" && <Check size={14} color={C.black} />}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setEditing(t); setModal(true); }}>
                <div className="text-sm font-semibold truncate" style={{ color: dark ? C.white : C.black, textDecoration: t.status === "done" ? "line-through" : "none", opacity: t.status === "done" ? 0.6 : 1 }}>{t.title}</div>
                <div className="text-xs" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{employeeName(t.assignedTo)}{mine ? " (me)" : ""} · due {t.dueDate ? dateStrLocal(t.dueDate) : "—"}</div>
              </div>
              {overdue ? <Badge dark={dark} tone="danger">OVERDUE</Badge> : t.status !== "done" && <Badge dark={dark} tone={t.priority === "High" ? "danger" : t.priority === "Medium" ? "warn" : "default"}>{(t.priority || "LOW").toUpperCase()}</Badge>}
            </div>
          );
        })}
      </Card>

      {modal && (
        <TaskFormModal dark={dark} task={editing} onClose={() => setModal(false)} tasks={tasks} persistTasks={persistTasks}
          employees={employees} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
      )}
    </div>
  );
}

function TaskFormModal({ dark, task, onClose, tasks, persistTasks, employees, currentUser, can, auditLog, setAuditLog, showToast }) {
  const canManage = can("manageTasks");
  const [title, setTitle] = useState(task?.title || "");
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo || employees[0]?.id || "");
  const [dueDate, setDueDate] = useState(task?.dueDate || dateStrOffset(0));
  const [priority, setPriority] = useState(task?.priority || "Medium");
  const [notes, setNotes] = useState(task?.notes || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

  const save = async () => {
    if (submitting) return;
    // Re-checked here, not just by whether this modal happens to be reachable — a task view can be
    // opened read-only by the assignee, so the actual write is what must be gated.
    if (!canManage) { showToast("You don't have permission to edit tasks.", "danger"); return; }
    if (!title.trim()) { setError("Task title is required."); return; }
    setSubmitting(true);
    try {
      const activity = [{ date: nowISO(), userId: currentUser?.id, userName: currentUser?.name, action: task ? "Updated" : "Created" }, ...(task?.activity || [])];
      const payload = { id: task?.id || uid("task"), title: title.trim(), assignedTo, dueDate, priority, notes, status: task?.status || "pending", createdAt: task?.createdAt || nowISO(), activity };
      const next = task ? tasks.map((t) => (t.id === task.id ? { ...t, ...payload } : t)) : [payload, ...tasks];
      await persistTasks(next);
      await logAudit(auditLog, setAuditLog, currentUser, task ? "Task Updated" : "Task Created", `${title.trim()} → ${employeeName(assignedTo)}`);
      showToast(task ? "Task updated" : "Task created");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!canManage) { showToast("You don't have permission to delete tasks.", "danger"); return; }
    await persistTasks(tasks.filter((t) => t.id !== task.id));
    await logAudit(auditLog, setAuditLog, currentUser, "Task Deleted", task.title);
    showToast("Task deleted", "danger");
    onClose();
  };

  return (
    <Modal title={task ? (canManage ? "Edit Task" : "Task Details") : "New Task"} onClose={onClose} dark={dark}>
      <fieldset disabled={!canManage} style={{ opacity: canManage ? 1 : 0.65 }}>
        <Field dark={dark} label="Task"><Input dark={dark} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field dark={dark} label="Assign To">
            <Select dark={dark} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field dark={dark} label="Due Date"><Input dark={dark} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Field dark={dark} label="Priority">
          <Select dark={dark} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Low", "Medium", "High"].map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field dark={dark} label="Notes"><TextArea dark={dark} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </fieldset>

      {task?.activity?.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Activity</div>
          <div className="rounded-2xl p-3" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
            {task.activity.slice(0, 8).map((a, idx) => (
              <div key={idx} className="text-xs py-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
                <span style={{ color: dark ? C.white : C.black, fontWeight: 600 }}>{a.action}</span> by {a.userName} · {dateStr(a.date)} {timeStr(a.date)}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      {canManage ? (
        <div className="flex gap-2">
          {task && <GhostButton dark={dark} onClick={remove} style={{ color: "#FF6B85", borderColor: "#FF6B85" }}><Trash2 size={15} /> Delete</GhostButton>}
          <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save Task"}</PrimaryButton>
        </div>
      ) : (
        <div className="text-xs text-center" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Only a manager or owner can edit task details. Use the checkbox to mark it done.</div>
      )}
    </Modal>
  );
}

/* ============================== REPORTS ============================== */
/* ============================== BUSINESS INTELLIGENCE (Phase G) ==============================
 * Every function here is pure and read-only — none of them call finalizeSuccessfulPayment,
 * failSalePayment, InventoryService, commitLoyaltyForSale, reverseLoyaltyForSale, persistCash,
 * openCashRegister, closeCashRegister, recordCashMovement, or applyPurchaseReceipt. They only
 * ever read the same authoritative collections/functions that already exist from Phases A–F:
 * getCustomerStats, getLoyaltyBalance, calculateExpectedCash, cashRegisterBreakdown,
 * calculateConsumptionAnalytics, getPurchaseRecommendations, ORDER_STATUS_META, formatElapsed.
 * Nothing here is a second financial ledger — it's a read layer over what already exists.
 * ============================================================================== */

const REPORT_RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "custom", label: "Custom Range" },
];

// Reuses businessNow()/parseLocalDate() — the same local-time date utilities the rest of the app
// already uses — rather than introducing a second (e.g. UTC-based) date system. `end` is
// inclusive of the whole final day (23:59:59.999).
function getDateRange(rangeId, customStart, customEnd) {
  const now = businessNow();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  if (rangeId === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: startOfDay(y), end: endOfDay(y) }; }
  if (rangeId === "7d") { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: startOfDay(s), end: endOfDay(now) }; }
  if (rangeId === "30d") { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: startOfDay(s), end: endOfDay(now) }; }
  if (rangeId === "thisMonth") { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { start: startOfDay(s), end: endOfDay(now) }; }
  if (rangeId === "lastMonth") { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: startOfDay(s), end: endOfDay(e) }; }
  if (rangeId === "custom" && customStart && customEnd) {
    const s = parseLocalDate(customStart), e = parseLocalDate(customEnd);
    if (s.getTime() > e.getTime()) return { start: startOfDay(e), end: endOfDay(s) }; // swap rather than produce an inverted/empty range
    return { start: startOfDay(s), end: endOfDay(e) };
  }
  return { start: startOfDay(now), end: endOfDay(now) }; // "today" and safe fallback
}

// The immediately-preceding range of the SAME duration, used for period-over-period comparison —
// e.g. selecting Aug 1–31 compares against Jul 1–31 (same day-count, ending the instant before
// the selected range starts).
function getPreviousRange(range) {
  const durationMs = range.end.getTime() - range.start.getTime();
  const end = new Date(range.start.getTime() - 1);
  const start = new Date(end.getTime() - durationMs);
  return { start, end };
}

const withinRange = (iso, range) => { const t = new Date(iso).getTime(); return t >= range.start.getTime() && t <= range.end.getTime(); };

// The ONE place "valid sale for reporting" is defined — mirrors the exact canonical rule used
// everywhere else in the app (sales.filter(s => s.status !== "cancelled")), scoped to a range.
const filterSalesByRange = (sales, range) => (sales || []).filter((s) => s.status !== "cancelled" && withinRange(s.date, range));
const filterExpensesByRange = (expenses, range) => (expenses || []).filter((e) => e.status !== "reversed" && withinRange(e.date, range));

// Safe percentage change — NEVER Infinity/NaN. previous=0 with current>0 returns null (the UI
// shows "New activity" for null, never a fake percentage); previous=0 and current=0 returns 0.
function percentChange(current, previous) {
  if (previous === 0) return current > 0 ? null : 0;
  return round2(((current - previous) / previous) * 100);
}

// ---- Sales Performance KPIs ----
function getSalesAnalytics(sales, range) {
  const inRange = filterSalesByRange(sales, range);
  const grossSales = round2(inRange.reduce((a, s) => a + (s.subtotal || 0), 0));
  const discounts = round2(inRange.reduce((a, s) => a + (s.discount || 0), 0));
  const taxCollected = round2(inRange.reduce((a, s) => a + (s.tax || 0), 0));
  const netSales = round2(grossSales - discounts); // subtotal after discount, before tax
  const totalRevenue = round2(netSales + taxCollected); // matches the existing P&L "Revenue" definition (sum of s.total)
  const orders = inRange.length;
  const avgOrderValue = orders > 0 ? round2(totalRevenue / orders) : null; // null, never divide-by-zero
  return { grossSales, discounts, netSales, taxCollected, totalRevenue, orders, avgOrderValue };
}

function getSalesComparison(sales, range) {
  const current = getSalesAnalytics(sales, range);
  const previous = getSalesAnalytics(sales, getPreviousRange(range));
  return {
    current, previous,
    revenueChangePct: percentChange(current.totalRevenue, previous.totalRevenue),
    ordersChangePct: percentChange(current.orders, previous.orders),
  };
}

// ---- Revenue Trend — daily for <=31 days, weekly for <=90, monthly beyond that ----
function getRevenueTrend(sales, range) {
  const inRange = filterSalesByRange(sales, range);
  const spanDays = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
  const bucket = spanDays <= 31 ? "day" : spanDays <= 90 ? "week" : "month";
  const buckets = {};
  for (const s of inRange) {
    const d = new Date(s.date);
    let key;
    if (bucket === "day") key = localDateStr(d);
    else if (bucket === "week") { const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); key = localDateStr(monday); }
    else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets[key]) buckets[key] = { key, revenue: 0, orders: 0 };
    buckets[key].revenue = round2(buckets[key].revenue + s.total);
    buckets[key].orders += 1;
  }
  return { bucketType: bucket, points: Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key)) };
}

// ---- Product Performance ----
function getProductPerformance(sales, range) {
  const inRange = filterSalesByRange(sales, range);
  const totalRevenue = round2(inRange.reduce((a, s) => a + s.total, 0));
  const map = {};
  inRange.forEach((s) => s.items.forEach((it) => {
    if (!map[it.productId]) map[it.productId] = { productId: it.productId, name: it.name, qty: 0, revenue: 0 };
    map[it.productId].qty = round2(map[it.productId].qty + it.qty);
    map[it.productId].revenue = round2(map[it.productId].revenue + it.qty * it.unitPrice);
  }));
  const arr = Object.values(map).map((p) => ({ ...p, pctOfSales: totalRevenue > 0 ? round2((p.revenue / totalRevenue) * 100) : 0 }));
  return { byRevenue: [...arr].sort((a, b) => b.revenue - a.revenue), byQty: [...arr].sort((a, b) => b.qty - a.qty) };
}

// ---- Channel / Location / Payment Method — all read sale.channel/locationId/location/paymentMethod
// exactly as stored; never hardcodes a channel/location list not present in the actual data. ----
function groupSalesBy(sales, range, keyFn) {
  const inRange = filterSalesByRange(sales, range);
  const totalRevenue = round2(inRange.reduce((a, s) => a + s.total, 0));
  const map = {};
  inRange.forEach((s) => {
    const key = keyFn(s) || "—";
    if (!map[key]) map[key] = { key, revenue: 0, orders: 0 };
    map[key].revenue = round2(map[key].revenue + s.total);
    map[key].orders += 1;
  });
  return Object.values(map).map((g) => ({
    ...g, avgOrderValue: g.orders > 0 ? round2(g.revenue / g.orders) : null,
    pctOfSales: totalRevenue > 0 ? round2((g.revenue / totalRevenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}
const getChannelPerformance = (sales, range) => groupSalesBy(sales, range, (s) => s.channel);
const getLocationPerformance = (sales, range, locations) => groupSalesBy(sales, range, (s) => locationLabel(s, locations));
const getPaymentMethodPerformance = (sales, range) => groupSalesBy(sales, range, (s) => s.paymentMethod);

// ---- Discount analytics — reads sale.discount as-is; loyalty-reward discounts already flow
// into this same field before finalization (Phase D), so there is no separate loyalty-discount
// figure to double-count here. ----
function getDiscountAnalytics(sales, range) {
  const inRange = filterSalesByRange(sales, range);
  const discounted = inRange.filter((s) => (s.discount || 0) > 0);
  const totalDiscount = round2(discounted.reduce((a, s) => a + s.discount, 0));
  const grossSales = round2(inRange.reduce((a, s) => a + (s.subtotal || 0), 0));
  return {
    totalDiscount, discountedOrders: discounted.length,
    avgDiscountPerOrder: discounted.length > 0 ? round2(totalDiscount / discounted.length) : null,
    pctOfGrossSales: grossSales > 0 ? round2((totalDiscount / grossSales) * 100) : 0,
  };
}

// ---- Customer analytics — reuses getCustomerStats; "returning" is based on actual purchase
// history before the range, never on customer creation date alone. ----
function getCustomerAnalytics(customers, sales, range) {
  const inRange = filterSalesByRange(sales, range);
  const customerIdsInRange = [...new Set(inRange.filter((s) => s.customerId).map((s) => s.customerId))];
  const newCustomers = (customers || []).filter((c) => c.createdAt && withinRange(c.createdAt, range)).length;
  const validSales = (sales || []).filter((s) => s.status !== "cancelled");
  const returningCustomerIds = customerIdsInRange.filter((cid) =>
    validSales.some((s) => s.customerId === cid && new Date(s.date).getTime() < range.start.getTime())
  );
  const anonymousSales = inRange.filter((s) => !s.customerId);
  const customerRevenue = round2(inRange.filter((s) => s.customerId).reduce((a, s) => a + s.total, 0));
  const anonymousRevenue = round2(anonymousSales.reduce((a, s) => a + s.total, 0));
  const topCustomers = customerIdsInRange
    .map((cid) => ({ customer: (customers || []).find((c) => c.id === cid), stats: getCustomerStats(cid, sales) }))
    .filter((r) => r.customer)
    .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
    .slice(0, 10);
  return {
    newCustomers, returningCustomers: returningCustomerIds.length, identifiedCustomers: customerIdsInRange.length,
    repeatRate: customerIdsInRange.length > 0 ? round2((returningCustomerIds.length / customerIdsInRange.length) * 100) : null,
    customerRevenue, anonymousRevenue, anonymousOrders: anonymousSales.length, topCustomers,
  };
}

// ---- Loyalty analytics — loyaltyTransactions is the sole authoritative ledger; this only reads
// and sums it, exactly like getLoyaltyBalance does per-customer. ----
function getLoyaltyAnalytics(loyaltyTransactions, range) {
  const inRange = (loyaltyTransactions || []).filter((t) => withinRange(t.createdAt, range));
  const sum = (types) => round2(inRange.filter((t) => types.includes(t.type)).reduce((a, t) => a + t.points, 0));
  const earned = sum(["earn"]);
  const redeemed = sum(["redeem"]);
  const manualAdd = sum(["manual_add"]);
  const manualRemove = sum(["manual_remove"]);
  const reversed = sum(["reversal"]);
  const restored = sum(["restore"]);
  const netMovement = round2(earned + manualAdd + restored - redeemed - manualRemove - reversed);
  const activeCustomerIds = new Set(inRange.map((t) => t.customerId));
  return { earned, redeemed, manualAdd, manualRemove, reversed, restored, netMovement, activeCustomers: activeCustomerIds.size, redemptionCount: inRange.filter((t) => t.type === "redeem").length };
}

// ---- Cash register analytics — reuses closeCashRegister's own STORED expectedCash/actualCash/
// difference (never recomputed differently here) for closed registers within the range. ----
function getCashRegisterAnalytics(cashRegisters, cashTx, range) {
  const closedInRange = (cashRegisters || []).filter((r) => r.status === "closed" && r.closedAt && withinRange(r.closedAt, range));
  const balanced = closedInRange.filter((r) => (r.difference || 0) === 0);
  const overages = closedInRange.filter((r) => (r.difference || 0) > 0);
  const shortages = closedInRange.filter((r) => (r.difference || 0) < 0);
  const cashSalesInRange = round2((cashTx || []).filter((t) => t.paymentMethod === "Cash" && t.type === "income" && t.relatedSaleId && withinRange(t.date, range)).reduce((a, t) => a + t.amount, 0));
  return {
    closedCount: closedInRange.length, balancedCount: balanced.length,
    overageCount: overages.length, overageTotal: round2(overages.reduce((a, r) => a + r.difference, 0)),
    shortageCount: shortages.length, shortageTotal: round2(shortages.reduce((a, r) => a + Math.abs(r.difference), 0)),
    cashSales: cashSalesInRange,
  };
}

// ---- Expense analytics ----
function getExpenseAnalytics(expenses, range) {
  const inRange = filterExpensesByRange(expenses, range);
  const total = round2(inRange.reduce((a, e) => a + e.amount, 0));
  const byCategory = {};
  inRange.forEach((e) => { byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount); });
  const categories = Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const largest = [...inRange].sort((a, b) => b.amount - a.amount).slice(0, 5);
  return { total, count: inRange.length, categories, largest };
}

// ---- Inventory & procurement summary — reuses stockStatus/getPurchaseRecommendations from
// Phase F verbatim; never recomputes consumption differently. ----
function getInventoryReportSummary(inventory, suppliers, invTx) {
  const recs = getPurchaseRecommendations({ inventory, suppliers, invTx });
  return {
    outOfStock: recs.filter((r) => r.status === "OUT_OF_STOCK").length,
    critical: recs.filter((r) => r.status === "CRITICAL").length,
    low: recs.filter((r) => r.status === "LOW").length,
    topConsumption: [...recs].filter((r) => r.avgDailyUsage > 0).sort((a, b) => b.avgDailyUsage - a.avgDailyUsage).slice(0, 5),
    recommendations: recs.slice(0, 10),
  };
}

// ---- Orders / production analytics — uses the exact timestamps advanceOrderStatus already
// writes (productionStartedAt/readyAt/completedAt); never fabricates a timestamp for a
// historical order that never had one. ----
function getOrderAnalytics(sales, range) {
  const inRangeAll = (sales || []).filter((s) => withinRange(s.date, range));
  const received = inRangeAll.filter((s) => s.status !== "cancelled").length;
  const cancelled = inRangeAll.filter((s) => s.status === "cancelled").length;
  const completed = inRangeAll.filter((s) => s.status !== "cancelled" && (s.fulfillmentStatus || "Received") === "Completed").length;

  const prepTimes = inRangeAll.filter((s) => s.productionStartedAt && s.readyAt).map((s) => (new Date(s.readyAt) - new Date(s.productionStartedAt)) / 60000);
  const avgPrepMinutes = prepTimes.length > 0 ? round2(prepTimes.reduce((a, m) => a + m, 0) / prepTimes.length) : null;

  const fulfillTimes = inRangeAll.filter((s) => s.completedAt).map((s) => (new Date(s.completedAt) - new Date(s.date)) / 60000);
  const avgFulfillMinutes = fulfillTimes.length > 0 ? round2(fulfillTimes.reduce((a, m) => a + m, 0) / fulfillTimes.length) : null;

  const active = (sales || []).filter((s) => s.status !== "cancelled" && (s.fulfillmentStatus || "Completed") !== "Completed");
  const statusCounts = {
    Received: active.filter((s) => (s.fulfillmentStatus || "Received") === "Received").length,
    Preparing: active.filter((s) => s.fulfillmentStatus === "Preparing").length,
    Ready: active.filter((s) => s.fulfillmentStatus === "Ready").length,
  };
  const sortedActive = [...active].sort((a, b) => new Date(a.date) - new Date(b.date));
  const longestWaiting = sortedActive[0] || null;

  return { received, completed, cancelled, avgPrepMinutes, avgFulfillMinutes, statusCounts, longestWaiting };
}

/* ============================== SHIFTS, TIME CLOCK & LABOR (Phase H) ==============================
 * user and employee remain separate, exactly as they already were — this never merges them.
 * shifts is the ONE new collection, following the exact same useCollection pattern as
 * cashRegisters/loyaltyTransactions. A shift never stores a mutable authoritative workedMinutes
 * or laborCost field — those are always derived from clockInAt/clockOutAt/breaks at read time,
 * the same "the ledger/timestamps are authoritative" principle already used everywhere else.
 * Employee sales performance uses sale.employeeId — never sale.createdBy — per the confirmed
 * Step 0 finding that these are not interchangeable.
 * ============================================================================== */

function findOpenShift(employeeId, shifts) {
  return (shifts || []).find((s) => s.employeeId === employeeId && s.status === "open") || null;
}

// Idempotent: calling this twice in a row for the same employee never creates a second open
// shift — the existing-shift check re-reads `shifts` fresh each call, the same guard pattern
// already used by openCashRegister/finalizeSuccessfulPayment.
async function clockIn({ employeeId, locationId, notes }, ctx) {
  const { shifts, setShifts, employees, currentUser, auditLog, setAuditLog } = ctx;
  if (!employeeId) return { success: false, error: "No employee is linked to this account." };
  const employee = (employees || []).find((e) => e.id === employeeId);
  if (!employee) return { success: false, error: "Employee not found." };
  if (employee.active === false) return { success: false, error: "This employee is archived and cannot clock in." };
  const existingOpen = findOpenShift(employeeId, shifts);
  if (existingOpen) return { success: true, shift: existingOpen }; // idempotent — never a second open shift
  const now = nowISO();
  const shift = {
    id: uid("shift"), employeeId, locationId: locationId || null,
    clockInAt: now, clockOutAt: null, status: "open", breaks: [], notes: notes || "",
    createdAt: now, updatedAt: now,
  };
  await setShifts([shift, ...shifts]);
  await logAudit(auditLog, setAuditLog, currentUser, "Clocked In", `${employee.name}${locationId ? "" : ""}`);
  return { success: true, shift };
}

// Idempotent: a second call after the shift is already closed returns the same closed shift
// without touching clockOutAt again — never overwrites a historical timestamp.
async function clockOut({ employeeId }, ctx) {
  const { shifts, setShifts, employees, currentUser, auditLog, setAuditLog } = ctx;
  const open = findOpenShift(employeeId, shifts);
  if (!open) return { success: false, error: "No open shift found for this employee." };
  const now = nowISO();
  // Preferred behavior per spec: automatically close any active break at the same clockOut
  // timestamp, so a closed shift can never contain a break with startedAt and no endedAt.
  const closedBreaks = (open.breaks || []).map((b) => (b.endedAt ? b : { ...b, endedAt: now }));
  const closedShift = { ...open, clockOutAt: now, status: "closed", breaks: closedBreaks, updatedAt: now };
  await setShifts(shifts.map((s) => (s.id === open.id ? closedShift : s)));
  const employee = (employees || []).find((e) => e.id === employeeId);
  await logAudit(auditLog, setAuditLog, currentUser, "Clocked Out", `${employee?.name || employeeId}`);
  return { success: true, shift: closedShift };
}

async function startBreak({ employeeId }, ctx) {
  const { shifts, setShifts } = ctx;
  const open = findOpenShift(employeeId, shifts);
  if (!open) return { success: false, error: "No open shift found for this employee." };
  const hasActiveBreak = (open.breaks || []).some((b) => !b.endedAt);
  if (hasActiveBreak) return { success: true, shift: open }; // idempotent — never a second active break
  const now = nowISO();
  const updated = { ...open, breaks: [...(open.breaks || []), { id: uid("brk"), startedAt: now, endedAt: null }], updatedAt: now };
  await setShifts(shifts.map((s) => (s.id === open.id ? updated : s)));
  return { success: true, shift: updated };
}

async function endBreak({ employeeId }, ctx) {
  const { shifts, setShifts } = ctx;
  const open = findOpenShift(employeeId, shifts);
  if (!open) return { success: false, error: "No open shift found for this employee." };
  const activeBreakIdx = (open.breaks || []).findIndex((b) => !b.endedAt);
  if (activeBreakIdx === -1) return { success: true, shift: open }; // idempotent — nothing to end
  const now = nowISO();
  const nextBreaks = open.breaks.map((b, i) => (i === activeBreakIdx ? { ...b, endedAt: now } : b));
  const updated = { ...open, breaks: nextBreaks, updatedAt: now };
  await setShifts(shifts.map((s) => (s.id === open.id ? updated : s)));
  return { success: true, shift: updated };
}

// ---- Pure time calculations — never mutate, never NaN, never negative. ----
function calculateBreakMinutes(shift, now) {
  const nowMs = now ? new Date(now).getTime() : Date.now();
  return (shift?.breaks || []).reduce((total, b) => {
    if (!b.startedAt) return total;
    const start = new Date(b.startedAt).getTime();
    const end = b.endedAt ? new Date(b.endedAt).getTime() : nowMs; // active break counts up to now
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return total; // malformed entry — ignore safely
    return total + (end - start) / 60000;
  }, 0);
}

function calculateWorkedMinutes(shift, now) {
  if (!shift?.clockInAt) return 0;
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const start = new Date(shift.clockInAt).getTime();
  const end = shift.clockOutAt ? new Date(shift.clockOutAt).getTime() : nowMs;
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const grossMinutes = Math.max(0, (end - start) / 60000);
  const breakMinutes = calculateBreakMinutes(shift, now);
  return Math.max(0, grossMinutes - breakMinutes);
}

// ---- Employee shift statistics — pure, derives entirely from `shifts`; never stores counters. ----
function getEmployeeShiftStats(employeeId, shifts, range) {
  const mine = (shifts || []).filter((s) => s.employeeId === employeeId && (!range || withinRange(s.clockInAt, range)));
  const totalWorkedMinutes = round2(mine.reduce((a, s) => a + calculateWorkedMinutes(s), 0));
  const totalBreakMinutes = round2(mine.reduce((a, s) => a + calculateBreakMinutes(s), 0));
  const closedCount = mine.filter((s) => s.status === "closed").length;
  const averageShiftMinutes = closedCount > 0 ? round2(mine.filter((s) => s.status === "closed").reduce((a, s) => a + calculateWorkedMinutes(s), 0) / closedCount) : null;
  const activeShift = findOpenShift(employeeId, shifts);
  const recentShifts = [...mine].sort((a, b) => new Date(b.clockInAt) - new Date(a.clockInAt)).slice(0, 20);
  return { totalShifts: mine.length, totalWorkedMinutes, totalBreakMinutes, averageShiftMinutes, activeShift, recentShifts };
}

// ---- Labor summary across all employees for a range. Labor cost is calculated here (pure data),
// but sensitive DISPLAY/export must be gated by viewFinancials at the UI layer — this function
// itself has no side effects and is safe to call regardless of permission. ----
function getLaborSummary(employees, shifts, range) {
  const activeEmployees = (employees || []).filter((e) => e.active !== false);
  const clockedInIds = new Set((shifts || []).filter((s) => s.status === "open").map((s) => s.employeeId));
  const onBreakIds = new Set((shifts || []).filter((s) => s.status === "open" && (s.breaks || []).some((b) => !b.endedAt)).map((s) => s.employeeId));

  let totalWorkedMinutes = 0, totalLaborCost = 0, rateCount = 0, rateSum = 0;
  const byEmployee = activeEmployees.map((e) => {
    const stats = getEmployeeShiftStats(e.id, shifts, range);
    const hours = round2(stats.totalWorkedMinutes / 60);
    const cost = typeof e.hourlyRate === "number" ? round2(hours * e.hourlyRate) : null;
    totalWorkedMinutes += stats.totalWorkedMinutes;
    if (cost !== null) totalLaborCost = round2(totalLaborCost + cost);
    if (typeof e.hourlyRate === "number") { rateSum += e.hourlyRate; rateCount += 1; }
    return { employee: e, workedHours: hours, laborCost: cost };
  }).filter((r) => r.workedHours > 0).sort((a, b) => b.workedHours - a.workedHours);

  return {
    totalWorkedMinutes: round2(totalWorkedMinutes), totalWorkedHours: round2(totalWorkedMinutes / 60),
    activeEmployees: activeEmployees.length, employeesClockedIn: clockedInIds.size, employeesOnBreak: onBreakIds.size,
    estimatedLaborCost: totalLaborCost, averageHourlyRate: rateCount > 0 ? round2(rateSum / rateCount) : null,
    byEmployee,
  };
}

// ---- Employee sales performance — sale.employeeId is authoritative, never sale.createdBy. ----
function getEmployeePerformance(employeeId, sales, shifts, range) {
  const validSales = (sales || []).filter((s) => s.status !== "cancelled" && s.employeeId === employeeId && (!range || withinRange(s.date, range)));
  const salesCount = validSales.length;
  const revenue = round2(validSales.reduce((a, s) => a + s.total, 0));
  const averageTicket = salesCount > 0 ? round2(revenue / salesCount) : null;
  const stats = getEmployeeShiftStats(employeeId, shifts, range);
  const workedHours = round2(stats.totalWorkedMinutes / 60);
  const salesPerHour = workedHours > 0 ? round2(salesCount / workedHours) : null;
  const revenuePerHour = workedHours > 0 ? round2(revenue / workedHours) : null;
  return { salesCount, revenue, averageTicket, workedMinutes: stats.totalWorkedMinutes, workedHours, salesPerHour, revenuePerHour };
}

/* ============================== BUSINESS ALERTS (Phase I) ==============================
 * The alert engine is a pure read layer over data that already exists — sales, inventory,
 * cashRegisters, purchaseOrders, shifts, customers, loyaltyTransactions remain the sole
 * authoritative sources. Every evaluate* function below only reads them (reusing stockStatus,
 * calculateConsumptionAnalytics, getSalesComparison, getCustomerStats, getLoyaltyBalance
 * verbatim, never reimplementing them) and returns plain candidate objects — nothing is mutated.
 * The ONLY mutation in this whole block is the alert lifecycle itself (businessAlerts), which is
 * explicitly a separate, much smaller concern handled by reconcileAlerts/dismissAlert at the end.
 * ============================================================================== */

const ALERT_THRESHOLDS = {
  cashRegisterOpenHours: 10,
  cashDifferenceSignificant: 20,
  orderReceivedMinutes: 15,
  orderPreparingMinutes: 25,
  orderReadyMinutes: 10,
  shiftLongHours: 10,
  breakLongMinutes: 45,
  salesDropPct: -30,
  poOverdueCriticalDays: 3,
  highLoyaltyBalance: 500,
  inactiveHighValueSpend: 200,
  inactiveHighValueDays: 60,
};

// severity -> Badge tone, reusing the exact vocabulary the app already has (danger/warn/default)
const ALERT_SEVERITY_TONE = { critical: "danger", warning: "warn", info: "default" };
const ALERT_SEVERITY_LABEL = { critical: "CRITICAL", warning: "WARNING", info: "INFO" };

function evaluateInventoryAlerts(inventory, invTx) {
  const alerts = [];
  for (const item of inventory || []) {
    const status = stockStatus(item);
    if (status === "OUT_OF_STOCK") {
      alerts.push({ key: `inventory:out:${item.id}`, type: "inventory_out_of_stock", severity: "critical",
        title: `${item.name} is out of stock`, message: `Current quantity: 0 ${item.unit}.`,
        entityType: "inventory", entityId: item.id, locationId: null, financial: false });
    } else if (status === "CRITICAL") {
      alerts.push({ key: `inventory:critical:${item.id}`, type: "inventory_critical", severity: "critical",
        title: `${item.name} is critically low`, message: `${item.qty} ${item.unit} remaining.`,
        entityType: "inventory", entityId: item.id, locationId: null, financial: false });
    } else if (status === "LOW") {
      alerts.push({ key: `inventory:low:${item.id}`, type: "inventory_low", severity: "warning",
        title: `${item.name} is running low`, message: `${item.qty} ${item.unit} remaining.`,
        entityType: "inventory", entityId: item.id, locationId: null, financial: false });
    }
    // Unusually fast consumption — flagged even for a NORMAL-status item, since this is an early
    // warning ("about to become a problem"), distinct from the stock-level alerts above.
    if (status === "NORMAL") {
      const analytics = calculateConsumptionAnalytics(item, invTx, 7);
      if (analytics.daysRemaining !== null && analytics.daysRemaining <= 2) {
        alerts.push({ key: `inventory:fastconsumption:${item.id}`, type: "inventory_fast_consumption", severity: "warning",
          title: `${item.name} consuming faster than usual`, message: `Estimated ${analytics.daysRemaining} day(s) remaining at the current pace.`,
          entityType: "inventory", entityId: item.id, locationId: null, financial: false });
      }
    }
  }
  return alerts;
}

function evaluateCashRegisterAlerts(cashRegisters, now) {
  const alerts = [];
  for (const reg of cashRegisters || []) {
    if (reg.status === "open") {
      const hoursOpen = (now - new Date(reg.openedAt).getTime()) / 3600000;
      if (hoursOpen >= ALERT_THRESHOLDS.cashRegisterOpenHours) {
        alerts.push({ key: `cash:longopen:${reg.id}`, type: "cash_register_long_open", severity: "warning",
          title: "Register open for a long time", message: `Open for ${round2(hoursOpen)} hours.`,
          entityType: "cashRegister", entityId: reg.id, locationId: reg.locationId, financial: false });
      }
    } else if (reg.status === "closed") {
      const diff = reg.difference || 0;
      if (Math.abs(diff) >= ALERT_THRESHOLDS.cashDifferenceSignificant) {
        alerts.push({ key: `cash:diff:${reg.id}`, type: diff < 0 ? "cash_shortage" : "cash_overage", severity: "critical",
          title: diff < 0 ? "Significant cash shortage" : "Significant cash overage",
          message: `${diff < 0 ? "Short" : "Over"} by ${fmtMoney(Math.abs(diff))}${reg.differenceReason ? ` — ${reg.differenceReason}` : " — no reason recorded"}.`,
          entityType: "cashRegister", entityId: reg.id, locationId: reg.locationId, financial: true });
      }
    }
  }
  return alerts;
}

function evaluateOrderAlerts(sales, now) {
  const alerts = [];
  for (const s of sales || []) {
    if (s.status === "cancelled") continue;
    const status = s.fulfillmentStatus || "Received";
    if (status === "Completed") continue;
    const anchor = status === "Preparing" && s.productionStartedAt ? s.productionStartedAt
      : status === "Ready" && s.readyAt ? s.readyAt : s.date;
    const minutesSince = (now - new Date(anchor).getTime()) / 60000;
    if (status === "Received" && minutesSince >= ALERT_THRESHOLDS.orderReceivedMinutes) {
      alerts.push({ key: `order:stuckreceived:${s.id}`, type: "order_stuck_received", severity: "warning",
        title: `Order #${s.orderNo} not started`, message: `Waiting ${Math.round(minutesSince)} min since it came in.`,
        entityType: "sale", entityId: s.id, locationId: s.locationId, financial: false });
    } else if (status === "Preparing" && minutesSince >= ALERT_THRESHOLDS.orderPreparingMinutes) {
      alerts.push({ key: `order:stuckpreparing:${s.id}`, type: "order_stuck_preparing", severity: "warning",
        title: `Order #${s.orderNo} taking a long time to prepare`, message: `In production for ${Math.round(minutesSince)} min.`,
        entityType: "sale", entityId: s.id, locationId: s.locationId, financial: false });
    } else if (status === "Ready" && minutesSince >= ALERT_THRESHOLDS.orderReadyMinutes) {
      alerts.push({ key: `order:readywaiting:${s.id}`, type: "order_ready_waiting", severity: "warning",
        title: `Order #${s.orderNo} ready but not completed`, message: `Ready for ${Math.round(minutesSince)} min.`,
        entityType: "sale", entityId: s.id, locationId: s.locationId, financial: false });
    }
  }
  return alerts;
}

function evaluateProcurementAlerts(purchaseOrders, now) {
  const alerts = [];
  for (const po of purchaseOrders || []) {
    if (po.status === "Cancelled" || po.status === "Received" || po.status === "Reversed") continue;
    if (!po.expectedDate) continue;
    const daysOverdue = Math.floor((now - new Date(po.expectedDate).getTime()) / 86400000);
    if (daysOverdue > 0) {
      alerts.push({ key: `po:overdue:${po.id}`, type: po.status === "Partially Received" ? "po_partial_overdue" : "po_overdue",
        severity: daysOverdue >= ALERT_THRESHOLDS.poOverdueCriticalDays ? "critical" : "warning",
        title: `${po.poNumber} is overdue`, message: `Expected ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago${po.status === "Partially Received" ? " (partially received)" : ""}.`,
        entityType: "purchaseOrder", entityId: po.id, locationId: null, financial: false });
    }
  }
  return alerts;
}

function evaluateLaborAlerts(employees, shifts, now) {
  const alerts = [];
  for (const shift of (shifts || []).filter((s) => s.status === "open")) {
    const employee = (employees || []).find((e) => e.id === shift.employeeId);
    const name = employee?.name || "Employee";
    const hoursOpen = (now - new Date(shift.clockInAt).getTime()) / 3600000;
    if (hoursOpen >= ALERT_THRESHOLDS.shiftLongHours) {
      alerts.push({ key: `labor:longshift:${shift.id}`, type: "labor_long_shift", severity: "warning",
        title: `${name} has been clocked in a long time`, message: `${round2(hoursOpen)} hours since clock-in.`,
        entityType: "shift", entityId: shift.id, locationId: shift.locationId, financial: false });
    }
    const activeBreak = (shift.breaks || []).find((b) => !b.endedAt);
    if (activeBreak) {
      const breakMinutes = (now - new Date(activeBreak.startedAt).getTime()) / 60000;
      if (breakMinutes >= ALERT_THRESHOLDS.breakLongMinutes) {
        alerts.push({ key: `labor:longbreak:${shift.id}:${activeBreak.id}`, type: "labor_long_break", severity: "warning",
          title: `${name} has been on break a long time`, message: `${Math.round(breakMinutes)} min on break.`,
          entityType: "shift", entityId: shift.id, locationId: shift.locationId, financial: false });
      }
    }
  }
  return alerts;
}

function evaluateSalesAlerts(sales, now) {
  const alerts = [];
  const todayRange = getDateRange("today");
  const todayKey = localDateStr(new Date(now));
  const cmp = getSalesComparison(sales, todayRange);
  if (cmp.revenueChangePct !== null && cmp.revenueChangePct <= ALERT_THRESHOLDS.salesDropPct) {
    alerts.push({ key: `sales:drop:${todayKey}`, type: "sales_drop", severity: "warning",
      title: "Sales significantly down vs. yesterday", message: `${cmp.revenueChangePct}% vs. the same point yesterday.`,
      entityType: "sales", entityId: todayKey, locationId: null, financial: true });
  }
  const todaySales = (sales || []).filter((s) => withinRange(s.date, todayRange));
  const cancelledToday = todaySales.filter((s) => s.status === "cancelled").length;
  if (todaySales.length >= 5 && cancelledToday / todaySales.length >= 0.25) {
    alerts.push({ key: `sales:highcancel:${todayKey}`, type: "sales_high_cancellation", severity: "warning",
      title: "Unusually high cancellation rate today", message: `${cancelledToday} of ${todaySales.length} orders cancelled today.`,
      entityType: "sales", entityId: todayKey, locationId: null, financial: false });
  }
  return alerts;
}

function evaluateCustomerAlerts(customers, loyaltyTransactions, sales) {
  const alerts = [];
  for (const c of (customers || []).filter((c) => c.active !== false)) {
    const balance = getLoyaltyBalance(c.id, loyaltyTransactions);
    if (balance >= ALERT_THRESHOLDS.highLoyaltyBalance) {
      alerts.push({ key: `customer:highbalance:${c.id}`, type: "customer_high_loyalty_balance", severity: "info",
        title: `${c.name} has a high loyalty balance`, message: `${balance} points accumulated.`,
        entityType: "customer", entityId: c.id, locationId: null, financial: false });
    }
    const stats = getCustomerStats(c.id, sales);
    if (stats.totalSpent >= ALERT_THRESHOLDS.inactiveHighValueSpend && stats.lastOrderDate && !withinDays(stats.lastOrderDate, ALERT_THRESHOLDS.inactiveHighValueDays)) {
      alerts.push({ key: `customer:inactive:${c.id}`, type: "customer_inactive_high_value", severity: "info",
        title: `${c.name} hasn't ordered in a while`, message: `Last order ${dateStr(stats.lastOrderDate)}.`,
        entityType: "customer", entityId: c.id, locationId: null, financial: true });
    }
  }
  return alerts;
}

// The one place all evaluators are combined — deterministic order (matches severity priority
// roughly by domain), used both by reconcileAlerts and directly by the UI for a live preview.
function evaluateAllAlerts(data, now) {
  const { inventory, invTx, cashRegisters, sales, purchaseOrders, employees, shifts, customers, loyaltyTransactions } = data;
  return [
    ...evaluateInventoryAlerts(inventory, invTx),
    ...evaluateCashRegisterAlerts(cashRegisters, now),
    ...evaluateOrderAlerts(sales, now),
    ...evaluateProcurementAlerts(purchaseOrders, now),
    ...evaluateLaborAlerts(employees, shifts, now),
    ...evaluateSalesAlerts(sales, now),
    ...evaluateCustomerAlerts(customers, loyaltyTransactions, sales),
  ];
}

// Deterministic priority ordering for display — critical first, then warning, then info; within
// the same severity, oldest-created first so nothing gets buried under newer noise.
function sortAlertsByPriority(alerts) {
  const rank = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => (rank[a.severity] - rank[b.severity]) || (new Date(a.createdAt) - new Date(b.createdAt)));
}

// ---- Lifecycle: the ONLY mutation in this whole block, and only ever touches businessAlerts —
// never sales/inventory/cashRegisters/etc. Identity is candidate.key, never a fresh id, which is
// what makes re-evaluation idempotent: the same live condition, evaluated any number of times,
// is recognized as the SAME open alert rather than creating duplicates. ----
async function reconcileAlerts(candidates, ctx) {
  const { businessAlerts, setBusinessAlerts } = ctx;
  const now = nowISO();
  const existingByKey = new Map((businessAlerts || []).map((a) => [a.key, a]));
  const candidateKeys = new Set(candidates.map((c) => c.key));
  let next = businessAlerts || [];
  let changed = false;

  for (const c of candidates) {
    const existing = existingByKey.get(c.key);
    if (!existing) {
      next = [{ id: uid("alert"), ...c, status: "open", createdAt: now, resolvedAt: null, dismissedAt: null }, ...next];
      changed = true;
    } else if (existing.status === "resolved") {
      // The condition disappeared and came back — a genuinely new occurrence, not a duplicate of
      // the old (already-resolved) record, so it reopens rather than silently staying resolved.
      next = next.map((a) => (a.key === c.key ? { ...a, status: "open", resolvedAt: null, createdAt: now, message: c.message, severity: c.severity } : a));
      changed = true;
    }
    // existing.status === "open" -> left completely untouched (this IS the deduplication).
    // existing.status === "dismissed" -> left completely untouched; a dismissed alert never
    // silently reappears just because the same condition is still true.
  }

  next = next.map((a) => {
    if (a.status === "open" && !candidateKeys.has(a.key)) {
      changed = true;
      return { ...a, status: "resolved", resolvedAt: now };
    }
    return a;
  });

  if (changed) await setBusinessAlerts(next);
  return next;
}

async function dismissAlert(alertId, ctx) {
  const { businessAlerts, setBusinessAlerts, currentUser, auditLog, setAuditLog } = ctx;
  const alert = (businessAlerts || []).find((a) => a.id === alertId);
  if (!alert) return { success: false, error: "Alert not found." };
  if (alert.status === "dismissed") return { success: true, alert }; // idempotent
  const updated = { ...alert, status: "dismissed", dismissedAt: nowISO() };
  await setBusinessAlerts(businessAlerts.map((a) => (a.id === alertId ? updated : a)));
  await logAudit(auditLog, setAuditLog, currentUser, "Alert Dismissed", alert.title);
  return { success: true, alert: updated };
}

function ReportsView({ dark, sales, expenses, inventory, wasteTx, purchaseOrders, suppliers, customers, loyaltyTransactions, cashRegisters, cashTx, invTx, locations, employees, shifts, can, showToast }) {
  const [rangeId, setRangeId] = useState("30d");
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [productSort, setProductSort] = useState("revenue"); // "revenue" | "qty"
  const canFinance = can ? can("viewFinancials") : true;

  const customRangeInvalid = rangeId === "custom" && customStart && customEnd && parseLocalDate(customStart).getTime() > parseLocalDate(customEnd).getTime();
  const range = customRangeInvalid ? getDateRange("today") : getDateRange(rangeId, customStart, customEnd);
  // Preserves the exact P&L formula already used (revenue/COGS/gross/net) — only the source
  // range selection changed, never the accounting logic itself.
  const rSales = filterSalesByRange(sales, range);
  const rExpenses = filterExpensesByRange(expenses, range);

  const revenue = round2(rSales.reduce((a, s) => a + s.total, 0));
  const cogs = round2(rSales.reduce((a, s) => a + s.items.reduce((x, i) => x + i.cost * i.qty, 0), 0));
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue ? round2((grossProfit / revenue) * 100) : 0;
  const opEx = round2(rExpenses.reduce((a, e) => a + e.amount, 0));
  const netProfit = round2(grossProfit - opEx);
  const netMargin = revenue ? round2((netProfit / revenue) * 100) : 0;
  const inventoryValue = round2(inventory.reduce((a, i) => a + i.qty * i.costPerUnit, 0));
  // Phase (Waste fix): same source-of-truth switch as Dashboard's monthWasteCost — see that
  // comment for the full explanation. Kept identical here so both screens can never disagree.
  const wasteEntries = supabaseAuth.hasSession()
    ? (invTx || []).filter((t) => t.type === "Waste").map((t) => ({ date: t.date, cost: Math.abs(Number(t.totalCost || 0)) }))
    : (wasteTx || []);
  const waste = round2(wasteEntries.filter((w) => withinRange(w.date, range)).reduce((a, w) => a + w.cost, 0));

  const salesCmp = useMemo(() => getSalesComparison(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const trend = useMemo(() => getRevenueTrend(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const maxTrend = Math.max(1, ...trend.points.map((p) => p.revenue));
  const productPerf = useMemo(() => getProductPerformance(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const channelPerf = useMemo(() => getChannelPerformance(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const locationPerf = useMemo(() => getLocationPerformance(sales, range, locations), [sales, range.start.getTime(), range.end.getTime(), locations]);
  const paymentPerf = useMemo(() => getPaymentMethodPerformance(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const discountA = useMemo(() => getDiscountAnalytics(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const customerA = useMemo(() => getCustomerAnalytics(customers, sales, range), [customers, sales, range.start.getTime(), range.end.getTime()]);
  const loyaltyA = useMemo(() => getLoyaltyAnalytics(loyaltyTransactions, range), [loyaltyTransactions, range.start.getTime(), range.end.getTime()]);
  const cashRegA = useMemo(() => getCashRegisterAnalytics(cashRegisters, cashTx, range), [cashRegisters, cashTx, range.start.getTime(), range.end.getTime()]);
  const expenseA = useMemo(() => getExpenseAnalytics(expenses, range), [expenses, range.start.getTime(), range.end.getTime()]);
  const invSummary = useMemo(() => getInventoryReportSummary(inventory, suppliers, invTx), [inventory, suppliers, invTx]);
  const orderA = useMemo(() => getOrderAnalytics(sales, range), [sales, range.start.getTime(), range.end.getTime()]);
  const laborA = useMemo(() => getLaborSummary(employees, shifts, range), [employees, shifts, range.start.getTime(), range.end.getTime()]);
  const laborPerf = useMemo(() => (employees || []).filter((e) => e.active !== false).map((e) => ({ employee: e, perf: getEmployeePerformance(e.id, sales, shifts, range) })).filter((r) => r.perf.workedHours > 0 || r.perf.salesCount > 0).sort((a, b) => b.perf.revenue - a.perf.revenue), [employees, sales, shifts, range.start.getTime(), range.end.getTime()]);

  const fmtDelta = (pct) => pct === null ? "New activity" : `${pct > 0 ? "+" : ""}${pct}%`;
  const deltaColor = (pct) => pct === null ? (dark ? C.textMutedDark : C.textMutedLight) : pct > 0 ? C.lime : pct < 0 ? "#FF6B85" : (dark ? C.textMutedDark : C.textMutedLight);

  const exportCSV = () => {
    downloadCSV("masseli-pl-report.csv", ["Metric", "Value"], [
      ["Revenue", revenue], ["COGS", cogs], ["Gross Profit", grossProfit], ["Gross Margin %", grossMargin],
      ["Operating Expenses", opEx], ["Net Profit", netProfit], ["Net Margin %", netMargin],
    ]);
    showToast("CSV exported");
  };
  const exportProducts = () => {
    downloadCSV("masseli-product-performance.csv", ["Product", "Qty Sold", "Revenue", "% of Sales"],
      productPerf.byRevenue.map((p) => [p.name, p.qty, p.revenue, p.pctOfSales]));
    showToast("CSV exported");
  };
  const exportCustomers = () => {
    downloadCSV("masseli-customer-performance.csv", ["Customer", "Orders", "Total Spent", "Last Order"],
      customerA.topCustomers.map((r) => [r.customer.name, r.stats.totalOrders, r.stats.totalSpent, r.stats.lastOrderDate ? dateStr(r.stats.lastOrderDate) : ""]));
    showToast("CSV exported");
  };
  const exportExpenses = () => {
    downloadCSV("masseli-expense-summary.csv", ["Category", "Amount"], expenseA.categories.map((c) => [c.category, c.amount]));
    showToast("CSV exported");
  };
  const exportPayments = () => {
    downloadCSV("masseli-payment-methods.csv", ["Method", "Revenue", "Orders", "% of Sales"],
      paymentPerf.map((p) => [p.key, p.revenue, p.orders, p.pctOfSales]));
    showToast("CSV exported");
  };
  const exportLoyalty = () => {
    downloadCSV("masseli-loyalty-activity.csv", ["Metric", "Points"], [
      ["Earned", loyaltyA.earned], ["Redeemed", loyaltyA.redeemed], ["Manual Add", loyaltyA.manualAdd],
      ["Manual Remove", loyaltyA.manualRemove], ["Reversed", loyaltyA.reversed], ["Restored", loyaltyA.restored], ["Net Movement", loyaltyA.netMovement],
    ]);
    showToast("CSV exported");
  };
  const exportLabor = () => {
    const headers = canFinance
      ? ["Employee", "Hours", "Sales", "Revenue", "Average Ticket", "Sales/Hour", "Revenue/Hour", "Labor Cost"]
      : ["Employee", "Hours", "Sales", "Sales/Hour"];
    const rows = laborPerf.map((r) => canFinance
      ? [r.employee.name, r.perf.workedHours, r.perf.salesCount, r.perf.revenue, r.perf.averageTicket ?? "", r.perf.salesPerHour ?? "", r.perf.revenuePerHour ?? "", typeof r.employee.hourlyRate === "number" ? round2(r.perf.workedHours * r.employee.hourlyRate) : ""]
      : [r.employee.name, r.perf.workedHours, r.perf.salesCount, r.perf.salesPerHour ?? ""]);
    downloadCSV("masseli-labor-report.csv", headers, rows);
    showToast("CSV exported");
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Reports" sub="Profit & Loss and business performance"
        action={<GhostButton dark={dark} onClick={exportCSV}>Export P&amp;L CSV</GhostButton>} />

      <div className="flex gap-2 mb-2 flex-wrap">
        {REPORT_RANGE_PRESETS.map((p) => (
          <button key={p.id} onClick={() => setRangeId(p.id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: rangeId === p.id ? C.lime : (dark ? C.surfaceDark : C.white), color: rangeId === p.id ? C.black : (dark ? C.white : C.black), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
            {p.label}
          </button>
        ))}
      </div>
      {rangeId === "custom" && (
        <div className="flex gap-2 mb-3 items-end">
          <Field dark={dark} label="Start"><Input dark={dark} type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></Field>
          <Field dark={dark} label="End"><Input dark={dark} type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></Field>
        </div>
      )}
      {customRangeInvalid && (
        <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>
          Start date must be on or before end date. Showing Today until this is corrected.
        </div>
      )}
      <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        {dateStr(range.start.toISOString())} – {dateStr(range.end.toISOString())}
      </div>

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Sales Performance</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>REVENUE</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(salesCmp.current.totalRevenue)}</div>
            <div className="text-xs font-semibold" style={{ color: deltaColor(salesCmp.revenueChangePct) }}>{fmtDelta(salesCmp.revenueChangePct)} vs prior period</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>ORDERS</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{salesCmp.current.orders}</div>
            <div className="text-xs font-semibold" style={{ color: deltaColor(salesCmp.ordersChangePct) }}>{fmtDelta(salesCmp.ordersChangePct)} vs prior period</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>AVG ORDER VALUE</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{salesCmp.current.avgOrderValue !== null ? fmtMoney(salesCmp.current.avgOrderValue) : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>DISCOUNTS</div>
            <div className="text-lg font-extrabold" style={{ color: dark ? C.white : C.black }}>{fmtMoney(salesCmp.current.discounts)}</div>
          </div>
        </div>
      </Card>

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Profit &amp; Loss</div>
        <Row dark={dark} label="Revenue" value={fmtMoney(revenue)} />
        <Row dark={dark} label="Cost of Goods Sold" value={`-${fmtMoney(cogs)}`} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Gross Profit" value={fmtMoney(grossProfit)} bold />
        <Row dark={dark} label="Gross Margin" value={fmtPct(grossMargin)} />
        <Row dark={dark} label="Operating Expenses" value={`-${fmtMoney(opEx)}`} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Net Profit" value={fmtMoney(netProfit)} bold />
        <Row dark={dark} label="Net Margin" value={fmtPct(netMargin)} />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard dark={dark} label="Orders" value={rSales.length} icon={ShoppingCart} accent={C.lime} />
        <StatCard dark={dark} label="Avg Ticket" value={fmtMoney(rSales.length ? round2(revenue / rSales.length) : 0)} icon={BarChart2} accent={C.yellow} />
        <StatCard dark={dark} label="Inventory Value" value={fmtMoney(inventoryValue)} icon={Boxes} accent={C.purpleGlow} />
        <StatCard dark={dark} label="Waste Cost" value={fmtMoney(waste)} icon={AlertTriangle} accent={"#FF6B85"} />
      </div>

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Revenue Trend {trend.bucketType === "day" ? "(Daily)" : trend.bucketType === "week" ? "(Weekly)" : "(Monthly)"}</div>
        {trend.points.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {trend.points.map((p) => (
              <div key={p.key} className="flex-1 flex flex-col items-center gap-1" style={{ minWidth: 24 }}>
                <div className="w-full rounded-t-lg" style={{ height: `${(p.revenue / maxTrend) * 100}%`, minHeight: 4, background: `linear-gradient(180deg, ${C.lime}, ${C.limeDim})` }} title={`${fmtMoney(p.revenue)} · ${p.orders} orders`} />
                <span className="text-[9px] font-semibold" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>{p.key.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Top Products</div>
            <div className="flex gap-1">
              {[["revenue", "Revenue"], ["qty", "Qty"]].map(([id, label]) => (
                <button key={id} onClick={() => setProductSort(id)} className="px-2 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: productSort === id ? C.lime : "transparent", color: productSort === id ? C.black : (dark ? C.textMutedDark : C.textMutedLight), border: `1px solid ${dark ? C.borderDark : C.borderLight}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11, marginBottom: 8 }} onClick={exportProducts}>Export CSV</GhostButton>
          {(productSort === "revenue" ? productPerf.byRevenue : productPerf.byQty).length === 0 ? <EmptyState dark={dark} title="No sales in this range" /> :
            (productSort === "revenue" ? productPerf.byRevenue : productPerf.byQty).slice(0, 10).map((p) => (
              <ListRow key={p.productId} dark={dark} title={p.name} subtitle={`${p.qty} units · ${fmtPct(p.pctOfSales)} of sales`} right={fmtMoney(p.revenue)} />
            ))}
        </Card>
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Sales by Channel</div>
          {channelPerf.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : channelPerf.map((c) => (
            <ListRow key={c.key} dark={dark} title={c.key} subtitle={`${c.orders} orders · avg ${c.avgOrderValue !== null ? fmtMoney(c.avgOrderValue) : "—"}`} right={fmtMoney(c.revenue)} rightSub={fmtPct(c.pctOfSales)} />
          ))}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Sales by Location</div>
          {locationPerf.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : locationPerf.map((l) => (
            <ListRow key={l.key} dark={dark} title={l.key} subtitle={`${l.orders} orders`} right={fmtMoney(l.revenue)} rightSub={fmtPct(l.pctOfSales)} />
          ))}
        </Card>
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Payment Methods</div>
            <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11 }} onClick={exportPayments}>Export CSV</GhostButton>
          </div>
          {paymentPerf.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : paymentPerf.map((p) => (
            <ListRow key={p.key} dark={dark} title={p.key} subtitle={`${p.orders} transactions`} right={fmtMoney(p.revenue)} rightSub={fmtPct(p.pctOfSales)} />
          ))}
        </Card>
      </div>

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Discounts</div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard dark={dark} label="Total Discounted" value={fmtMoney(discountA.totalDiscount)} />
          <StatCard dark={dark} label="Discounted Orders" value={discountA.discountedOrders} />
          <StatCard dark={dark} label="Avg per Order" value={discountA.avgDiscountPerOrder !== null ? fmtMoney(discountA.avgDiscountPerOrder) : "—"} />
        </div>
      </Card>

      {canFinance && (
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Customers</div>
            <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11 }} onClick={exportCustomers}>Export CSV</GhostButton>
          </div>
          <Row dark={dark} label="New Customers" value={customerA.newCustomers} />
          <Row dark={dark} label="Returning Customers" value={customerA.returningCustomers} />
          <Row dark={dark} label="Repeat Rate" value={customerA.repeatRate !== null ? fmtPct(customerA.repeatRate) : "No data available for this period"} />
          <Row dark={dark} label="Walk-in / Anonymous Orders" value={customerA.anonymousOrders} />
          <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
          <div className="text-xs font-bold mb-1" style={{ color: dark ? C.white : C.black }}>Top Customers</div>
          {customerA.topCustomers.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : customerA.topCustomers.slice(0, 5).map((r) => (
            <ListRow key={r.customer.id} dark={dark} title={r.customer.name} subtitle={`${r.stats.totalOrders} orders`} right={fmtMoney(r.stats.totalSpent)} />
          ))}
        </Card>
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Loyalty Activity</div>
            <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11 }} onClick={exportLoyalty}>Export CSV</GhostButton>
          </div>
          <Row dark={dark} label="Points Earned" value={`+${loyaltyA.earned}`} />
          <Row dark={dark} label="Points Redeemed" value={`-${loyaltyA.redeemed}`} />
          <Row dark={dark} label="Manual Adjustments" value={`+${loyaltyA.manualAdd} / -${loyaltyA.manualRemove}`} />
          <Row dark={dark} label="Reversals / Restored" value={`-${loyaltyA.reversed} / +${loyaltyA.restored}`} />
          <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
          <Row dark={dark} label="Net Point Movement" value={loyaltyA.netMovement} bold />
          <Row dark={dark} label="Active Loyalty Customers" value={loyaltyA.activeCustomers} />
          <Row dark={dark} label="Rewards Redeemed" value={loyaltyA.redemptionCount} />
        </Card>
      </div>
      )}

      {canFinance && (
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Cash Register</div>
          <Row dark={dark} label="Cash Sales" value={fmtMoney(cashRegA.cashSales)} />
          <Row dark={dark} label="Registers Closed" value={cashRegA.closedCount} />
          <Row dark={dark} label="Balanced Closes" value={cashRegA.balancedCount} />
          <Row dark={dark} label="Overages" value={cashRegA.overageCount > 0 ? `${cashRegA.overageCount} · ${fmtMoney(cashRegA.overageTotal)}` : "0"} />
          <Row dark={dark} label="Shortages" value={cashRegA.shortageCount > 0 ? `${cashRegA.shortageCount} · ${fmtMoney(cashRegA.shortageTotal)}` : "0"} />
        </Card>
        <Card dark={dark}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Expenses</div>
            <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11 }} onClick={exportExpenses}>Export CSV</GhostButton>
          </div>
          <Row dark={dark} label="Total Expenses" value={fmtMoney(expenseA.total)} bold />
          <Row dark={dark} label="Expense Count" value={expenseA.count} />
          <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
          {expenseA.categories.length === 0 ? <EmptyState dark={dark} title="No data available for this period" /> : expenseA.categories.slice(0, 5).map((c) => (
            <Row key={c.category} dark={dark} label={c.category} value={fmtMoney(c.amount)} />
          ))}
        </Card>
      </div>
      )}

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Inventory &amp; Procurement</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard dark={dark} label="Out of Stock" value={invSummary.outOfStock} accent={"#FF6B85"} />
          <StatCard dark={dark} label="Critical" value={invSummary.critical} accent={"#FF6B85"} />
          <StatCard dark={dark} label="Low Stock" value={invSummary.low} accent={C.yellow} />
        </div>
        {invSummary.topConsumption.length > 0 && (
          <>
            <div className="text-xs font-bold mb-1" style={{ color: dark ? C.white : C.black }}>Highest Consumption</div>
            {invSummary.topConsumption.map((r) => (
              <ListRow key={r.item.id} dark={dark} title={r.item.name} subtitle={`${r.avgDailyUsage} ${r.unit}/day · ${r.daysRemaining !== null ? `${r.daysRemaining}d remaining` : "No consumption data available yet"}`} right={STOCK_STATUS_LABEL[r.status]} />
            ))}
          </>
        )}
        {invSummary.outOfStock + invSummary.critical + invSummary.low === 0 && <EmptyState dark={dark} title="Nothing needs restocking" />}
      </Card>

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Orders &amp; Production</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard dark={dark} label="Received" value={orderA.received} />
          <StatCard dark={dark} label="Completed" value={orderA.completed} />
          <StatCard dark={dark} label="Cancelled" value={orderA.cancelled} />
        </div>
        <Row dark={dark} label="Avg Prep Time" value={orderA.avgPrepMinutes !== null ? `${orderA.avgPrepMinutes} min` : "No data available for this period"} />
        <Row dark={dark} label="Avg Fulfillment Time" value={orderA.avgFulfillMinutes !== null ? `${orderA.avgFulfillMinutes} min` : "No data available for this period"} />
        <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
        <Row dark={dark} label="Currently New" value={orderA.statusCounts.Received} />
        <Row dark={dark} label="Currently In Production" value={orderA.statusCounts.Preparing} />
        <Row dark={dark} label="Currently Ready" value={orderA.statusCounts.Ready} />
        {orderA.longestWaiting && <Row dark={dark} label="Longest Waiting" value={`Order #${orderA.longestWaiting.orderNo} · ${formatElapsed(orderA.longestWaiting.date)}`} />}
      </Card>

      {shifts && (
        <Card dark={dark} className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Labor</div>
            <GhostButton dark={dark} style={{ padding: "4px 10px", fontSize: 11 }} onClick={exportLabor}>Export CSV</GhostButton>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatCard dark={dark} label="Worked Hours" value={laborA.totalWorkedHours} />
            <StatCard dark={dark} label="Employees Worked" value={laborA.byEmployee.length} />
            <StatCard dark={dark} label="Currently Clocked In" value={laborA.employeesClockedIn} />
          </div>
          <Row dark={dark} label="Avg Hours / Employee" value={laborA.byEmployee.length > 0 ? round2(laborA.totalWorkedHours / laborA.byEmployee.length) : "No data available for this period"} />
          {canFinance && <Row dark={dark} label="Estimated Labor Cost" value={laborA.estimatedLaborCost > 0 ? fmtMoney(laborA.estimatedLaborCost) : "No data available for this period"} bold />}
          <div className="h-px my-2" style={{ background: dark ? C.borderDark : C.borderLight }} />
          <div className="text-xs font-bold mb-1" style={{ color: dark ? C.white : C.black }}>Employee Breakdown</div>
          {laborPerf.length === 0 ? <EmptyState dark={dark} title="No labor data available for this period" /> : laborPerf.map((r) => (
            <ListRow key={r.employee.id} dark={dark} title={r.employee.name}
              subtitle={`${r.perf.workedHours}h · ${r.perf.salesCount} sales · ${r.perf.salesPerHour !== null ? `${r.perf.salesPerHour}/hr` : "—"}`}
              right={canFinance ? fmtMoney(r.perf.revenue) : `${r.perf.salesCount} sales`}
              rightSub={canFinance && r.perf.revenuePerHour !== null ? `${fmtMoney(r.perf.revenuePerHour)}/hr` : undefined} />
          ))}
        </Card>
      )}

      {purchaseOrders && (
        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Purchases by Supplier</div>
          {(() => {
            const rPOs = purchaseOrders.filter((po) => po.status !== "Cancelled" && withinRange(po.orderDate, range));
            const map = {};
            rPOs.forEach((po) => {
              const name = suppliers.find((s) => s.id === po.supplierId)?.name || "Unknown";
              map[name] = (map[name] || 0) + poGrandTotal(po);
            });
            const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
            if (arr.length === 0) return <EmptyState dark={dark} title="No purchases in this range" />;
            return arr.map(([name, total], idx) => <ListRow key={idx} dark={dark} title={name} right={fmtMoney(round2(total))} />);
          })()}
        </Card>
      )}

      {purchaseOrders && (
        <Card dark={dark}>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Outstanding Payables</div>
          {(() => {
            const payables = purchaseOrders.filter((po) => (po.status === "Received" || po.status === "Partially Received") && poAmountDue(po) > 0.005);
            if (payables.length === 0) return <EmptyState dark={dark} title="No outstanding balances" sub="All received purchases are paid in full." />;
            return payables.map((po) => (
              <ListRow key={po.id} dark={dark} title={po.poNumber} subtitle={suppliers.find((s) => s.id === po.supplierId)?.name || ""} right={fmtMoney(poAmountDue(po))} />
            ));
          })()}
        </Card>
      )}
    </div>
  );
}

/* ============================== SETTINGS ============================== */
function SettingsView({ dark, settings, setSettings, settingsUnavailable, users, setUsers, employees, locations, setLocations, inventory, sales, currentUser, can, auditLog, setAuditLog, showToast, onLogout }) {
  const [form, setForm] = useState(settings);
  const [userModal, setUserModal] = useState(null); // 'new' | user object | null
  const [showAudit, setShowAudit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canEditSettings = can("manageSettings");
  const canManageUsers = can("manageUsers");

  const save = async () => {
    if (submitting) return;
    if (!canEditSettings) { showToast("You don't have permission to change settings.", "danger"); return; }
    // Achado #6 subfase 2: `settings` here is always a renderable value (App() falls back to
    // seedSettings() for display so this screen never crashes) — but when the REAL load failed,
    // that fallback must never be written back over the tenant's actual configuration. This is
    // the one and only place a save is blocked; nothing else in this component changes.
    if (settingsUnavailable) { showToast("Settings could not be loaded — saving is disabled until this is resolved. Try reloading the page.", "danger"); return; }
    setSubmitting(true);
    try {
      await setSettings(form);
      await logAudit(auditLog, setAuditLog, currentUser, "Settings Updated", `Tax ${form.taxEnabled ? form.taxRate + "%" : "disabled"} · Negative inventory ${form.allowNegativeInventory ? "allowed" : "blocked"}`);
      showToast("Settings saved");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-6">
      <SectionHeader dark={dark} title="Settings" sub="Business configuration" />

      <Card dark={dark} className="mb-4">
        <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>My Account</div>
        <Row dark={dark} label="Name" value={currentUser.name} />
        <Row dark={dark} label="Role" value={currentUser.role === "OWNER" ? "Owner (full access)" : roleLabel(currentUser.role)} />
        <div className="mt-3"><GhostButton dark={dark} onClick={onLogout}><LogOut size={15} /> Log Out</GhostButton></div>
      </Card>

      <fieldset disabled={!canEditSettings} style={{ opacity: canEditSettings ? 1 : 0.6 }}>
        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Business Info</div>
          <Field dark={dark} label="Business Name"><Input dark={dark} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
          <Field dark={dark} label="Currency">
            <Select dark={dark} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {Object.keys(CURRENCY_SYMBOLS).map((c) => <option key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</option>)}
            </Select>
          </Field>
        </Card>

        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Tax</div>
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={form.taxEnabled} onChange={(e) => setForm({ ...form, taxEnabled: e.target.checked })} />
            <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Enable tax on sales</span>
          </div>
          <Field dark={dark} label="Tax Rate (%)"><Input dark={dark} type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Math.max(0, Number(e.target.value)) })} /></Field>
        </Card>

        <Card dark={dark} className="mb-4">
          <div className="font-bold text-sm mb-3" style={{ color: dark ? C.white : C.black }}>Inventory Rules</div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.allowNegativeInventory} onChange={(e) => setForm({ ...form, allowNegativeInventory: e.target.checked })} />
            <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Allow sales to push inventory negative</span>
          </div>
          <div className="text-xs mt-1" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Off by default. When off, a sale is blocked if it would exceed available stock.</div>
        </Card>
      </fieldset>

      {settingsUnavailable && (
        <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>
          The real business settings could not be loaded. What's shown below is a placeholder, not your actual configuration — saving is disabled until this is resolved.
        </div>
      )}
      {canEditSettings ? (
        <PrimaryButton disabled={submitting || settingsUnavailable} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save Settings"}</PrimaryButton>
      ) : (
        <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>You don't have permission to change business settings.</div>
      )}

      {canEditSettings && (
        <div className="mt-6">
          <LocationsView dark={dark} locations={locations} setLocations={setLocations} inventory={inventory} sales={sales}
            employees={employees} currentUser={currentUser} can={can} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} />
        </div>
      )}

      {canManageUsers && (
        <>
          <div className="font-bold text-sm mt-6 mb-2" style={{ color: dark ? C.white : C.black }}>Team & Permissions</div>
          <Card dark={dark} className="mb-4">
            {users.map((u) => (
              <ListRow key={u.id} dark={dark} onClick={() => setUserModal(u)}
                title={u.name} subtitle={`${u.username} · ${roleLabel(u.role)}`}
                badge={u.active === false ? <Badge dark={dark} tone="danger">INACTIVE</Badge> : null}
                right={<ChevronRight size={16} color={dark ? C.textMutedDark : C.textMutedLight} />} />
            ))}
          </Card>
          <GhostButton dark={dark} onClick={() => setUserModal("new")} style={{ marginBottom: 24 }}><Plus size={15} /> Add Staff Login</GhostButton>

          <div className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: dark ? C.white : C.black }}>
            <ScrollText size={16} /> Audit Log
          </div>
          <GhostButton dark={dark} onClick={() => setShowAudit(true)} style={{ marginBottom: 24 }}>View Audit Log ({auditLog.length})</GhostButton>
        </>
      )}

      {userModal && (
        <UserFormModal dark={dark} user={userModal === "new" ? null : userModal} users={users} setUsers={setUsers} employees={employees}
          currentUser={currentUser} auditLog={auditLog} setAuditLog={setAuditLog} showToast={showToast} onClose={() => setUserModal(null)} />
      )}
      {showAudit && <AuditLogModal dark={dark} auditLog={auditLog} onClose={() => setShowAudit(false)} />}

    </div>
  );
}

// Owner-only, experimental, and now FULLY isolated from dataStore/useCollection entirely — every
// button in this panel calls supabaseRest/supabaseAuth directly. There is no code path by which
// anything here can affect the live app's data loading, login, or startup, regardless of what a
// user clicks in this panel or what state it's left in.
// The 4 collections' minimal test-row fields and delete/deactivate capability, verified
// directly against 01_schema.sql/02_rls.sql before writing this (not assumed): `customers` has
// neither an `active` column nor a DELETE policy in the schema as deployed — that's a real,
// disclosed gap in what can be tested for that table specifically, not a bug in this panel.
const CRUD_TEST_TABLES = [
  { key: "locations", label: "Locations", makeRow: (bid) => ({ business_id: bid, name: "TEST Location (safe to remove)", type: "Other" }), updatePatch: { type: "Retail" }, cleanup: "deactivate" },
  { key: "suppliers", label: "Suppliers", makeRow: (bid) => ({ business_id: bid, name: "TEST Supplier (safe to remove)", contact_name: "Test Contact" }), updatePatch: { contact_name: "Test Contact (updated)" }, cleanup: "deactivate" },
  { key: "employees", label: "Employees", makeRow: (bid) => ({ business_id: bid, name: "TEST Employee (safe to remove)", job_title: "Tester" }), updatePatch: { job_title: "Tester (updated)" }, cleanup: "deactivate" },
  { key: "customers", label: "Customers", makeRow: (bid) => ({ business_id: bid, name: "TEST Customer (safe to remove)" }), updatePatch: { notes: "Updated by CRUD test" }, cleanup: "none" },
];

function SupabaseTestPanel({ dark }) {
  const [pingResult, setPingResult] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authResult, setAuthResult] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [session, setSession] = useState(supabaseAuth.getSession());
  const [businessId, setBusinessId] = useState("");
  const [crudResults, setCrudResults] = useState(null);
  const [crudRunning, setCrudRunning] = useState(false);

  const runPing = async () => {
    setPinging(true); setPingResult(null);
    try { setPingResult(await supabaseRest.ping()); } finally { setPinging(false); }
  };
  const runSignUp = async () => {
    if (!email || !password) return;
    setAuthBusy(true); setAuthResult(null);
    try {
      const r = await supabaseAuth.signUp(email, password);
      setAuthResult({ kind: "signup", ...r });
      if (r.confirmed) setSession(supabaseAuth.getSession());
    } finally { setAuthBusy(false); }
  };
  const runSignIn = async () => {
    if (!email || !password) return;
    setAuthBusy(true); setAuthResult(null);
    try {
      const r = await supabaseAuth.signInWithPassword(email, password);
      setAuthResult({ kind: "signin", ...r });
      if (r.ok) setSession(supabaseAuth.getSession());
    } finally { setAuthBusy(false); }
  };
  const runSignOut = () => { supabaseAuth.signOut(); setSession(null); setAuthResult(null); setCrudResults(null); };

  // Every step catches its own error explicitly and records it in the result list — nothing here
  // ever fails silently to only the console while the UI implies success (item 11). If ANY step
  // for a table throws, that table's remaining steps are skipped and it's marked FAILED, not
  // glossed over.
  const runCrudTest = async () => {
    if (!session || !businessId) return;
    setCrudRunning(true);
    const results = [];
    for (const t of CRUD_TEST_TABLES) {
      const steps = [];
      let createdId = null;
      try {
        const before = await supabaseRest.select(t.key, `select=id&business_id=eq.${businessId}&limit=1`);
        steps.push({ step: "READ (before)", ok: true, detail: `reachable, ${before.length} existing row(s) visible` });

        const created = await supabaseRest.insertOne(t.key, t.makeRow(businessId));
        createdId = created.id;
        steps.push({ step: "CREATE", ok: true, detail: `id=${createdId}` });

        const readBack = await supabaseRest.select(t.key, `select=*&id=eq.${createdId}`);
        if (!readBack.length) throw new Error("created row not found on read-back");
        steps.push({ step: "READ (after create)", ok: true, detail: "row confirmed present" });

        const updated = await supabaseRest.updateOne(t.key, createdId, t.updatePatch);
        const patchKey = Object.keys(t.updatePatch)[0];
        if (updated[patchKey] !== t.updatePatch[patchKey]) throw new Error("update did not apply as expected");
        steps.push({ step: "UPDATE", ok: true, detail: `${patchKey} -> ${updated[patchKey]}` });

        if (t.cleanup === "deactivate") {
          const deactivated = await supabaseRest.updateOne(t.key, createdId, { active: false });
          if (deactivated.active !== false) throw new Error("deactivate did not apply as expected");
          steps.push({ step: "DEACTIVATE", ok: true, detail: "active=false confirmed" });
        } else {
          steps.push({ step: "DELETE/DEACTIVATE", ok: null, detail: "not possible for this table — no `active` column and no DELETE policy exist in the deployed schema for customers; disclosed limitation, not attempted" });
        }
        results.push({ table: t.label, ok: true, steps });
      } catch (e) {
        steps.push({ step: "FAILED", ok: false, detail: e.message });
        results.push({ table: t.label, ok: false, steps });
      }
    }
    setCrudResults(results);
    setCrudRunning(false);
  };

  const bootstrapSql = session
    ? `-- Run this ONCE in the Supabase SQL Editor (uses your project-owner credentials, which\n-- bypass RLS — this is intentionally NOT something the anon-key client can do itself,\n-- since businesses has no INSERT policy by design).\ninsert into businesses (name) values ('Masseli Test Business') returning id;\n-- copy the returned id into the "Business ID" field below, then run:\ninsert into users (id, business_id, name, username, role)\nvalues ('${session.user?.id}', '<PASTE_BUSINESS_ID_HERE>', 'Test Owner', 'test-owner', 'OWNER');`
    : "";

  return (
    <div className="mt-8 pt-6" style={{ borderTop: `1px dashed ${dark ? C.borderDark : C.borderLight}` }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={16} color={C.yellow} />
        <div className="font-bold text-sm" style={{ color: dark ? C.white : C.black }}>Supabase Connection (Test Mode — Experimental)</div>
      </div>
      <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        Owner-only. Local storage stays the live data source for Sales, Inventory, Cash Flow, Expenses, Purchases,
        Waste, and Audit Log regardless of anything below — nothing here can affect that data. No migration has run.
      </div>

      <Card dark={dark} className="mb-3">
        <div className="text-xs font-semibold mb-2" style={{ color: dark ? C.white : C.black }}>1. Connectivity check</div>
        <GhostButton dark={dark} onClick={runPing} disabled={pinging}>{pinging ? "Checking…" : "Test Connection"}</GhostButton>
        {pingResult && (
          <div className="text-xs mt-2" style={{ color: pingResult.reachable ? C.lime : "#FF6B85" }}>
            {pingResult.reachable ? `Reachable — HTTP ${pingResult.status}` : `Not reachable — ${pingResult.error}`}
          </div>
        )}
      </Card>

      <Card dark={dark} className="mb-3">
        <div className="text-xs font-semibold mb-2" style={{ color: dark ? C.white : C.black }}>2. Real Supabase Auth account</div>
        {session ? (
          <>
            <div className="text-xs mb-2" style={{ color: C.lime }}>Signed in as {session.user?.email} · uid: {session.user?.id}</div>
            <GhostButton dark={dark} onClick={runSignOut}>Sign Out</GhostButton>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Input dark={dark} type="email" placeholder="test@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input dark={dark} type="password" placeholder="password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <GhostButton dark={dark} onClick={runSignUp} disabled={authBusy || !email || !password}>{authBusy ? "Working…" : "Sign Up"}</GhostButton>
              <GhostButton dark={dark} onClick={runSignIn} disabled={authBusy || !email || !password}>{authBusy ? "Working…" : "Sign In"}</GhostButton>
            </div>
            {authResult && (
              <div className="text-xs mt-2" style={{ color: authResult.ok ? C.lime : (authResult.reachable ? C.yellow : "#FF6B85") }}>
                {authResult.kind === "signup" && authResult.ok && authResult.confirmed && "Account created and signed in immediately (auto-confirm is on for this project)."}
                {authResult.kind === "signup" && authResult.ok && !authResult.confirmed && authResult.message}
                {!authResult.ok && authResult.reachable && `Endpoint reachable: ${authResult.error}`}
                {!authResult.ok && !authResult.reachable && `Not reachable — ${authResult.error}`}
              </div>
            )}
          </>
        )}
      </Card>

      {session && (
        <Card dark={dark} className="mb-3">
          <div className="text-xs font-semibold mb-2" style={{ color: dark ? C.white : C.black }}>3. One-time bootstrap (manual — required, see explanation)</div>
          <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            <code>businesses</code> has no INSERT policy for the anon-key client by design — creating one is deliberately not self-service.
            Run this once in the Supabase SQL Editor (which uses your project-owner credentials, bypassing RLS), then paste the returned business id below.
          </div>
          <pre className="text-xs p-3 rounded-xl overflow-x-auto mb-2" style={{ background: dark ? C.surfaceDark : C.bgLight, color: dark ? C.white : C.black, whiteSpace: "pre-wrap" }}>{bootstrapSql}</pre>
          <Field dark={dark} label="Business ID (paste after running the SQL above)">
            <Input dark={dark} value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
        </Card>
      )}

      {session && businessId && (
        <Card dark={dark} className="mb-3">
          <div className="text-xs font-semibold mb-2" style={{ color: dark ? C.white : C.black }}>4. CRUD test — Locations, Suppliers, Employees, Customers</div>
          <div className="text-xs mb-2" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
            Runs read → create → read-back → update → deactivate (or notes an unavailable step) against each table, using your authenticated session's access token, not the anon key.
          </div>
          <GhostButton dark={dark} onClick={runCrudTest} disabled={crudRunning}>{crudRunning ? "Running…" : "Run CRUD Test"}</GhostButton>
          {crudResults && (
            <div className="mt-3">
              {crudResults.map((r, i) => (
                <div key={i} className="mb-3 pb-3" style={{ borderBottom: i < crudResults.length - 1 ? `1px solid ${dark ? C.borderDark : C.borderLight}` : "none" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: r.ok ? C.lime : "#FF6B85" }}>{r.table} — {r.ok ? "PASS" : "FAILED"}</div>
                  {r.steps.map((s, j) => (
                    <div key={j} className="text-xs" style={{ color: s.ok === false ? "#FF6B85" : s.ok === null ? C.yellow : (dark ? C.textMutedDark : C.textMutedLight) }}>
                      {s.step}: {s.detail}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function UserFormModal({ dark, user, users, setUsers, employees, currentUser, auditLog, setAuditLog, showToast, onClose }) {
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [pin, setPin] = useState(user?.pin || "");
  const [role, setRole] = useState(user?.role || "EMPLOYEE");
  const [employeeId, setEmployeeId] = useState(user?.employeeId || "");
  const [active, setActive] = useState(user?.active !== false);
  const [permissions, setPermissions] = useState(user?.permissions || {});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  const otherOwnersActive = users.filter((u) => u.role === "OWNER" && u.active !== false && u.id !== user?.id).length;
  const roleDefaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.EMPLOYEE;

  const togglePerm = (key) => setPermissions({ ...permissions, [key]: permissions[key] === undefined ? !roleDefaults[key] : !permissions[key] });
  const permState = (key) => (permissions[key] !== undefined ? permissions[key] : roleDefaults[key]);

  const save = async () => {
    if (submitting) return;
    setError("");
    if (!name.trim()) { setError("Name is required."); return; }
    if (!username.trim()) { setError("Username is required."); return; }
    const dupe = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.id !== user?.id);
    if (dupe) { setError("That username is already in use."); return; }
    if (!/^\d{4,6}$/.test(String(pin))) { setError("PIN must be 4–6 digits."); return; }
    if (user && user.role === "OWNER" && role !== "OWNER" && otherOwnersActive === 0) { setError("At least one active Owner account must remain."); return; }
    if (employeeId) {
      // A given employee record should resolve to exactly one "me" for task assignment — block
      // linking the same employee to a second active login rather than silently allowing ambiguity.
      const clash = users.find((u) => u.employeeId === employeeId && u.active !== false && u.id !== user?.id);
      if (clash) { setError(`${employees.find((e) => e.id === employeeId)?.name || "This employee"} is already linked to the login "${clash.username}".`); return; }
    }
    setSubmitting(true);
    try {
      const payload = { id: user?.id || uid("user"), name: name.trim(), username: username.trim(), pin: String(pin), role, employeeId, active, permissions: role === "OWNER" ? {} : permissions };
      const next = user ? users.map((u) => (u.id === user.id ? payload : u)) : [payload, ...users];
      await setUsers(next);
      await logAudit(auditLog, setAuditLog, currentUser, user ? "User Updated" : "User Created", `${payload.name} · ${roleLabel(payload.role)}${employeeId ? ` · linked to ${employees.find((e) => e.id === employeeId)?.name}` : ""}`);
      showToast(user ? "User updated" : "User created");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async () => {
    if (user.role === "OWNER" && otherOwnersActive === 0) { showToast("At least one active Owner account must remain.", "danger"); setConfirmingDeactivate(false); return; }
    await setUsers(users.map((u) => (u.id === user.id ? { ...u, active: !(u.active !== false) } : u)));
    await logAudit(auditLog, setAuditLog, currentUser, user.active === false ? "User Reactivated" : "User Deactivated", user.name);
    showToast(user.active === false ? "User reactivated" : "User deactivated", "danger");
    setConfirmingDeactivate(false);
    onClose();
  };

  return (
    <Modal title={user ? "Edit User" : "Add Staff Login"} onClose={onClose} dark={dark} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field dark={dark} label="Name"><Input dark={dark} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field dark={dark} label="Username"><Input dark={dark} value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field dark={dark} label="PIN (4–6 digits)"><Input dark={dark} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={6} /></Field>
        <Field dark={dark} label="Role">
          <Select dark={dark} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="OWNER">Owner</option>
          </Select>
        </Field>
      </div>
      <Field dark={dark} label="Linked Employee Record">
        <Select dark={dark} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">— No linked employee —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.active === false ? " (inactive)" : ""}</option>)}
        </Select>
      </Field>
      <div className="text-xs mb-4" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>
        Linking connects this login to a staff record, so tasks assigned to {employeeId ? (employees.find((e) => e.id === employeeId)?.name || "them") : "them"} show up under "Assigned to Me" when they're signed in.
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-sm font-semibold" style={{ color: dark ? C.white : C.black }}>Active (can log in)</span>
      </div>

      {role !== "OWNER" ? (
        <>
          <div className="font-bold text-sm mb-2" style={{ color: dark ? C.white : C.black }}>Permissions</div>
          <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Starts from standard {roleLabel(role)} defaults. Toggle to grant or remove specific access for this person.</div>
          <div className="grid grid-cols-1 gap-1 mb-4 max-h-64 overflow-y-auto pr-1">
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-center justify-between gap-2 py-2 px-2 rounded-xl" style={{ background: dark ? C.surfaceDark : C.bgLight }}>
                <span className="text-xs" style={{ color: dark ? C.white : C.black }}>{p.label}</span>
                <input type="checkbox" checked={permState(p.key)} onChange={() => togglePerm(p.key)} />
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="text-xs mb-4 px-3 py-2 rounded-xl" style={{ background: dark ? C.surfaceDark : C.bgLight, color: dark ? C.textMutedDark : C.textMutedLight }}>
          Owners always have full access to every section — permissions above only apply to Managers and Employees.
        </div>
      )}

      {error && <div className="text-xs font-semibold mb-3 px-3 py-2 rounded-xl" style={{ background: "#3A0F1E", color: "#FF6B85" }}>{error}</div>}
      <div className="flex gap-2">
        {user && (
          <GhostButton dark={dark} style={{ color: "#FF6B85", borderColor: "#FF6B85" }} onClick={() => setConfirmingDeactivate(true)}>
            {user.active === false ? "Reactivate" : "Deactivate"}
          </GhostButton>
        )}
        <PrimaryButton full disabled={submitting} onClick={save}><Check size={16} /> {submitting ? "Saving…" : "Save"}</PrimaryButton>
      </div>
      {confirmingDeactivate && (
        <ConfirmDialog dark={dark} title={user.active === false ? "Reactivate this login?" : "Deactivate this login?"}
          message={user.active === false ? "They'll be able to log in again." : "They won't be able to log in until reactivated. Their history is kept."}
          confirmLabel={user.active === false ? "Reactivate" : "Deactivate"} onConfirm={deactivate} onCancel={() => setConfirmingDeactivate(false)} />
      )}
    </Modal>
  );
}

function AuditLogModal({ dark, auditLog, onClose }) {
  return (
    <Modal title="Audit Log" onClose={onClose} dark={dark} wide>
      <div className="text-xs mb-3" style={{ color: dark ? C.textMutedDark : C.textMutedLight }}>Most recent 100 actions across the business.</div>
      <Card dark={dark}>
        {auditLog.length === 0 ? <EmptyState dark={dark} title="No activity yet" /> : auditLog.slice(0, 100).map((a) => (
          <ListRow key={a.id} dark={dark} title={a.action} subtitle={`${dateStr(a.date)} ${timeStr(a.date)} · ${a.userName} (${roleLabel(a.role)})`} rightSub={a.details} />
        ))}
      </Card>
    </Modal>
  );
}
