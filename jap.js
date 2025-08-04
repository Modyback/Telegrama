const axios = require('axios');
const config = require('./config.json');

async function createJapOrder(link, quantity, serviceId) {
  const { data } = await axios.post('https://justanotherpanel.com/api/v2', {
    key: config.jap_api_key,
    action: 'add',
    service: serviceId,
    link,
    quantity
  });
  return data;
}

async function getJapOrderStatus(orderId) {
  const { data } = await axios.post('https://justanotherpanel.com/api/v2', {
    key: config.jap_api_key,
    action: 'status',
    order: orderId
  });
  return data;
}

module.exports = { createJapOrder, getJapOrderStatus };
