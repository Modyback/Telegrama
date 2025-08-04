const axios = require('axios');
const config = require('./config.json');

async function createInvoice({ amount, order_id, description }) {
  const url = 'https://api.oxapay.com/v1/payment/invoice';
  const data = {
    amount,
    currency: "USD",
    lifetime: 30,
    fee_paid_by_payer: 1,
    under_paid_coverage: 2.5,
    to_currency: "USDT",
    auto_withdrawal: false,
    mixed_payment: true,
    return_url: config.return_url,
    order_id,
    thanks_message: "Thank you for your order!",
    description,
    sandbox: false
  };
  const headers = {
    'merchant_api_key': config.oxapay_api_key,
    'Content-Type': 'application/json',
  };
  try {
    const res = await axios.post(url, data, { headers });
    if (res.data && res.data.data && res.data.data.payment_url) {
      return res.data.data.payment_url;
    } else {
      console.error("Oxapay response error:", res.data);
      throw new Error(res.data.message || "Payment URL not found");
    }
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("Oxapay API Error:", error.response.data);
      throw new Error(error.response.data.message || "Oxapay API error");
    } else {
      throw error;
    }
  }
}
module.exports = { createInvoice };
