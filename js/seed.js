import { db } from './config.js';
import { collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showNotification } from './ui.js';

export async function seedDatabase() {
  console.log("Starting database seeding...");
  
  // 1. Seed Inventory
  const inventoryData = [
    { itemName: "Oxygen Cylinders", floor: 3, quantity: 5, threshold: 10 },
    { itemName: "First Aid Kits", floor: 1, quantity: 25, threshold: 15 },
    { itemName: "Fire Extinguishers", floor: 2, quantity: 12, threshold: 10 },
    { itemName: "Trauma Kits", floor: 1, quantity: 4, threshold: 10 },
    { itemName: "Water Pallets", floor: 4, quantity: 50, threshold: 20 },
    { itemName: "Biohazard Bags", floor: 3, quantity: 8, threshold: 20 }
  ];

  for (const item of inventoryData) {
    await addDoc(collection(db, 'inventory'), item);
  }

  // 2. Seed Staff Directory
  const staffData = [
    { name: "Ravi Kumar", role: "DOCTOR", floor: 3, dutyStatus: "online", active: true, createdAt: serverTimestamp() },
    { name: "Sarah Jenkins", role: "NURSE", floor: 2, dutyStatus: "online", active: true, createdAt: serverTimestamp() },
    { name: "Officer Dave", role: "SECURITY", floor: 1, dutyStatus: "offline", active: true, createdAt: serverTimestamp() },
    { name: "Admin Alpha", role: "ADMIN", floor: 1, dutyStatus: "online", active: true, createdAt: serverTimestamp() }
  ];

  for (const staff of staffData) {
    await addDoc(collection(db, 'staff_directory'), staff);
  }

  // 3. Seed Initial Logs
  const logData = [
    { type: "auth", message: "System initialized by Admin", floor: 1, timestamp: serverTimestamp() },
    { type: "refill", message: "Initial inventory levels synced", floor: null, timestamp: serverTimestamp() }
  ];

  for (const log of logData) {
    await addDoc(collection(db, 'incident_log'), log);
  }

  console.log("Database seeded successfully!");
  showNotification("Demo data seeded successfully! System rebooting...", "success");
  setTimeout(() => window.location.reload(), 2000);
}

export async function clearDatabase() {
  const collections = ['inventory', 'staff_directory', 'incident_log', 'refill_requests', 'broadcasts', 'alerts'];
  
  for (const coll of collections) {
    const snap = await getDocs(collection(db, coll));
    const deletePromises = snap.docs.map(d => deleteDoc(doc(db, coll, d.id)));
    await Promise.all(deletePromises);
  }
  
  showNotification("Database wiped successfully. Resetting...", "info");
  setTimeout(() => window.location.reload(), 2000);
}
