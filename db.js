const fs = require('fs');
const FILE = 'orders.json';

function saveOrder(order) {
  const orders = getOrders();
  orders.push(order);
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
}
function getOrders() {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE));
}
function updateOrder(orderId, update) {
  let orders = getOrders();
  orders = orders.map(order => order.id === orderId ? { ...order, ...update } : order);
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
}
function getOrder(orderId) {
  return getOrders().find(order => order.id === orderId);
}
function getPendingOrders() {
  return getOrders().filter(order => order.status === 'pending');
}
module.exports = { saveOrder, getOrders, updateOrder, getOrder, getPendingOrders };
